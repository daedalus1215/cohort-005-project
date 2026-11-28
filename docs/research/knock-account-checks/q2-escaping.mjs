// Q2: is trigger data HTML-escaped in the rendered `body` the feed receives?
// Sends two messages through `wayfinder-probe` (body: `Probe: {{ data.text }}`), then reads
// the feed the way the browser does (public key) in compact and rich mode, plus the
// server-side rendered content.
//
// Run: node --env-file=<.env> q2-escaping.mjs
import { knockApi, feedAsBrowser, trigger, log, waitFor } from "./lib.mjs";

const USER = "wayfinder-probe-q2";
const payloads = {
  html: `<script>alert(1)</script> <img src=x onerror=alert(2)> <b>bold</b> & "dq" 'sq'`,
  markdown: `**bold** _em_ [js](javascript:alert(3)) [web](https://example.com) <u>u</u>`,
};

for (const [kind, text] of Object.entries(payloads)) {
  const r = await trigger([{ id: USER, name: "Wayfinder probe Q2" }], {
    text,
    kind,
    refundRequestId: 913,
    nested: { a: 1, list: [1, 2] },
  });
  log({ kind, triggerStatus: r.status, response: r.body });
  if (r.status !== 200) {
    log("BLOCKED: trigger failed, nothing to inspect");
    process.exit(2);
  }
}

const items = await waitFor(
  async () => {
    const f = await feedAsBrowser(USER);
    return (f.body?.entries?.length ?? 0) >= 2 ? f.body.entries : null;
  },
  { timeout: 60_000, label: "two feed items" },
);

const rich = await feedAsBrowser(USER, { mode: "rich" });
for (const item of items) {
  const richItem = rich.body.entries.find((e) => e.id === item.id);
  const content = await knockApi("GET", `/v1/messages/${item.id}/content`);
  log({
    id: item.id,
    sent: item.data?.text,
    blocks: item.blocks,
    compactData: item.data,
    richData: richItem?.data,
    serverContent: content.body?.data ?? content.body,
  });
}
