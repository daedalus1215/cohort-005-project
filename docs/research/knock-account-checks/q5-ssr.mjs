// Q5: does server-rendering KnockProvider send PUT /v1/users/:id from Node?
// Renders five KnockProvider variants with react-dom/server, records every fetch the
// Knock client makes from this Node process, then asks Knock (secret key) whether each
// probe user now exists.
//
// Run: node --env-file=<.env> q5-ssr.mjs
import { createElement as h } from "react";
import { renderToString } from "react-dom/server";
import { PK, CHANNEL, knockApi, log, redact, sleep } from "./lib.mjs";

// Wrap fetch BEFORE the Knock client is constructed: @knocklabs/client binds
// globalThis.fetch when its ApiClient is created.
const calls = [];
const realFetch = globalThis.fetch;
globalThis.fetch = async (input, init = {}) => {
  const url = new URL(String(input));
  const auth = String(new Headers(init.headers).get("authorization") ?? "");
  const entry = {
    method: init.method ?? "GET",
    path: url.pathname,
    body: init.body ?? null,
    key: auth.includes(PK) ? "public" : "secret",
  };
  const res = await realFetch(input, init);
  entry.status = res.status;
  calls.push(entry);
  return res;
};

const { KnockProvider, KnockFeedProvider, NotificationIconButton, NotificationFeed } = await import("@knocklabs/react");

const tree = (props) =>
  h(
    KnockProvider,
    { apiKey: PK, ...props },
    h(KnockFeedProvider, { feedId: CHANNEL }, h(NotificationIconButton, { onClick() {} }), h(NotificationFeed)),
  );

const variants = [
  ["A user={{id,name}} (default inline)", "wayfinder-probe-ssr-a", (id) => ({ user: { id, name: "SSR probe A" } })],
  ["B user={{id}} only", "wayfinder-probe-ssr-b", (id) => ({ user: { id } })],
  ["C userId=\"id\" (deprecated string prop)", "wayfinder-probe-ssr-c", (id) => ({ userId: id })],
  ["D user={{id,name}} enabled={false}", "wayfinder-probe-ssr-d", (id) => ({ user: { id, name: "SSR probe D" }, enabled: false })],
  ["E user={{id,name}} identificationStrategy=\"skip\"", "wayfinder-probe-ssr-e", (id) => ({ user: { id, name: "SSR probe E" }, identificationStrategy: "skip" })],
];

log({ typeofWindow: typeof window, typeofWebSocket: typeof WebSocket, typeofDocument: typeof document });

for (const [label, id, props] of variants) {
  await knockApi("DELETE", `/v1/users/${id}`); // start clean if a previous run left it
  const before = await knockApi("GET", `/v1/users/${id}`);
  calls.length = 0;
  const html = renderToString(tree(props(id)));
  await sleep(3_000); // the identify call is fire-and-forget; let it land
  const after = await knockApi("GET", `/v1/users/${id}`);
  log({
    variant: label,
    existedBefore: before.status === 200,
    fetchesFromRender: calls
      .filter((c) => c.key === "public") // the probe's own checks use the secret key
      .map((c) => `${c.method} ${redact(c.path)} body=${c.body} -> ${c.status}`),
    existsAfter: after.status === 200,
    nameInKnock: after.body?.name ?? null,
    htmlHasBell: html.includes("rnf-notification-icon-button"),
    htmlHasFooter: html.includes("Powered by Knock"),
    htmlLength: html.length,
  });
}

// Is it once per render? Render variant A three more times, as three requests would.
calls.length = 0;
for (let i = 0; i < 3; i++) renderToString(tree(variants[0][2](variants[0][1])));
await sleep(3_000);
log({
  repeatRenders: 3,
  putsFromNode: calls.filter((c) => c.key === "public" && c.method === "PUT").length,
});

const t = Date.now();
process.on("exit", () => log({ processExitedAfterLastRenderMs: Date.now() - t }));
