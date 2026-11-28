// Baseline: enhanced security mode, unidentified users, trigger errors, bare string recipients.
import { knockApi, feedAsBrowser, trigger, log, sleep, WORKFLOW } from "./lib.mjs";

const NONE = "wayfinder-probe-none";
const BARE = "wayfinder-probe-bare";

log("== 1. Public key, no user token, user never identified");
const feed = await feedAsBrowser(NONE);
log({ entries: feed.body?.entries?.length, meta: feed.body?.meta, error: feed.status !== 200 ? feed.body : undefined });
const none = await knockApi("GET", `/v1/users/${NONE}`);
log({ userExistsAfterFeedRead: none.status === 200, body: none.status !== 200 ? none.body : undefined });

log("== 2. Public key reading another endpoint that needs no user: feed settings");
const settings = await knockApi("GET", `/v1/users/${NONE}/feeds/${process.env.KNOCK_FEED_CHANNEL_ID}/settings`, { key: "public" });
log(settings.body);

log("== 3. Trigger a workflow key that does not exist");
const missing = await knockApi("POST", `/v1/workflows/${WORKFLOW}-does-not-exist/trigger`, {
  body: { recipients: [{ id: "wayfinder-probe-unused" }], data: { text: "x" } },
});
log(missing.body);

log("== 4. Trigger with a bare string recipient that was never identified");
const before = await knockApi("GET", `/v1/users/${BARE}`);
log({ bareUserExistsBefore: before.status === 200 });
const run = await trigger([BARE], { text: "bare string recipient" });
log({ triggerResponse: run.body });
await sleep(10_000);
const after = await knockApi("GET", `/v1/users/${BARE}`);
log({ bareUserExistsAfter: after.status === 200, user: after.status === 200 ? after.body : after.body });
const msgs = await knockApi("GET", `/v1/users/${BARE}/messages`);
log({ messagesForBareUser: msgs.body?.items?.map((m) => ({ id: m.id, status: m.status, source: m.source?.key })) ?? msgs.body });
