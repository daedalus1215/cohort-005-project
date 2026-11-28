// Q3: does marking a message interacted from the server also set read_at?
// Three messages, three paths:
//   a) @knocklabs/node messages.markAsInteracted (PUT /v1/messages/:id/interacted, secret key)
//   b) POST /v1/messages/batch/interacted with the secret key
//   c) @knocklabs/client feed.markAsInteracted, the call Knock's NotificationCell makes on click
//      (public key, as the browser would)
// After each, re-read the message with the secret key and the feed with the public key.
//
// Run: node --env-file=<.env> q3-interacted.mjs
import KnockClient from "@knocklabs/client";
import { PK, CHANNEL, knockApi, feedAsBrowser, trigger, log, nodeClient, sleep, waitFor } from "./lib.mjs";

const USER = "wayfinder-probe-q3";
const labels = ["Q3 a node-sdk single", "Q3 b rest batch", "Q3 c browser client"];

for (const text of labels) {
  const r = await trigger([{ id: USER, name: "Wayfinder probe Q3" }], { text });
  log({ text, triggerStatus: r.status, response: r.body });
  if (r.status !== 200) {
    log("BLOCKED: trigger failed, nothing to mark");
    process.exit(2);
  }
}

const items = await waitFor(
  async () => {
    const f = await feedAsBrowser(USER);
    return (f.body?.entries?.length ?? 0) >= labels.length ? f.body.entries : null;
  },
  { timeout: 60_000, label: "three feed items" },
);
const idFor = (text) => items.find((i) => i.data?.text === text).id;
const pick = (m) => ({ seen_at: m?.seen_at, read_at: m?.read_at, interacted_at: m?.interacted_at, engagement_statuses: m?.engagement_statuses });
const meta = async () => (await feedAsBrowser(USER)).body?.meta;

log({ before: items.map((i) => ({ text: i.data?.text, ...pick(i) })), meta: await meta() });

// a) Node SDK, single message
const knock = nodeClient();
const a = idFor(labels[0]);
const aResp = await knock.messages.markAsInteracted(a, { metadata: { via: "node-sdk" } });
await sleep(1_500);
log({ path: "a node-sdk markAsInteracted", response: pick(aResp), reread: pick(await knock.messages.get(a)), meta: await meta() });

// b) REST batch with the secret key
const b = idFor(labels[1]);
const bResp = await knockApi("POST", "/v1/messages/batch/interacted", { body: { message_ids: [b] } });
await sleep(1_500);
log({ path: "b rest batch/interacted (secret)", response: (bResp.body ?? []).map(pick), reread: pick(await knock.messages.get(b)), meta: await meta() });

// c) Browser client, exactly what NotificationCell does on click
const c = idFor(labels[2]);
const kc = new KnockClient(PK);
kc.authenticate(USER);
const feed = kc.feeds.initialize(CHANNEL);
await feed.fetch();
const item = feed.getState().items.find((i) => i.id === c);
await feed.markAsInteracted(item, { type: "cell_click" });
log({ path: "c @knocklabs/client optimistic store", store: pick(feed.getState().items.find((i) => i.id === c)) });
await sleep(1_500);
log({ path: "c @knocklabs/client markAsInteracted", reread: pick(await knock.messages.get(c)), meta: await meta() });
feed.dispose?.();
kc.teardown?.();
