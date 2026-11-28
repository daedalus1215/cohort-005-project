// Which environment do these keys belong to, and what has been sent in it?
import { knockApi, log } from "./lib.mjs";

const msgs = await knockApi("GET", "/v1/messages", { query: { page_size: "20" } });
log(
  (msgs.body?.items ?? []).map((m) => ({
    id: m.id,
    inserted_at: m.inserted_at,
    channel: m.channel_id === process.env.KNOCK_FEED_CHANNEL_ID ? "<feed-channel>" : m.channel_id,
    source: m.source,
    recipient: m.recipient,
    status: m.status,
  })),
);
if (msgs.status !== 200) log(msgs.body);
const users = await knockApi("GET", "/v1/users", { query: { page_size: "20" } });
log((users.body?.entries ?? []).map((u) => ({ id: u.id, created_at: u.created_at })));
const who = await knockApi("GET", "/v1/whoami");
log(who.body);
