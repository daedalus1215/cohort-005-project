// Q1 (and Q4): hide a tab running KnockProvider + KnockFeedProvider for more than 30 s,
// watch the websocket over CDP, trigger Notifications while it is parked, show it again,
// and see whether they reach the store without a reload.
//
// Run: node --env-file=<.env> q1-hidden-tab.mjs
import http from "node:http";
import { readFile } from "node:fs/promises";
import { chromium } from "playwright-core";
import { PK, CHANNEL, redact, trigger, sleep } from "./lib.mjs";

const USER = "wayfinder-probe-q1";
const PAGE_DIR = new URL("./page/", import.meta.url);
const t0 = Date.now();
const events = [];
const out = (kind, detail = "") => {
  const line = `${String(((Date.now() - t0) / 1000).toFixed(1)).padStart(6)}s  ${kind.padEnd(14)} ${redact(detail)}`;
  console.log(line);
  events.push({ at: Date.now(), kind, detail: redact(detail) });
};

// --- static server for the bundled page -------------------------------------------------
const types = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css" };
const server = http.createServer(async (req, res) => {
  const name = req.url === "/" ? "index.html" : req.url.slice(1);
  try {
    const body = await readFile(new URL(name, PAGE_DIR));
    res.writeHead(200, { "content-type": types[name.slice(name.lastIndexOf("."))] ?? "text/plain" });
    res.end(body);
  } catch {
    res.writeHead(404).end();
  }
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const origin = `http://127.0.0.1:${server.address().port}`;

// --- browser ------------------------------------------------------------------------------
const browser = await chromium.launch({ executablePath: "/usr/local/bin/chromium", headless: true });
const context = await browser.newContext();
const page = await context.newPage();
out("browser", `Chromium ${browser.version()}, headless`);
await page.addInitScript((cfg) => (window.__KNOCK__ = cfg), { pk: PK, channel: CHANNEL, userId: USER });

page.on("console", (m) => {
  const text = m.text();
  if (/knock/i.test(text)) out("console", text.slice(0, 200));
});
page.on("request", (r) => {
  if (r.url().includes("api.knock.app")) out("http →", `${r.method()} ${new URL(r.url()).pathname}`);
});
page.on("response", (r) => {
  if (r.url().includes("api.knock.app")) out("http ←", `${r.status()} ${r.request().method()} ${new URL(r.url()).pathname}`);
});

const cdp = await context.newCDPSession(page);
await cdp.send("Network.enable");
const sockets = new Map();
let heartbeats = 0;
cdp.on("Network.webSocketCreated", ({ requestId, url }) => {
  sockets.set(requestId, url);
  out("ws created", `${requestId} ${new URL(url).host}${new URL(url).pathname}`);
});
cdp.on("Network.webSocketHandshakeResponseReceived", ({ requestId, response }) =>
  out("ws handshake", `${requestId} ${response.status}`),
);
cdp.on("Network.webSocketClosed", ({ requestId }) => out("ws closed", requestId));
cdp.on("Network.webSocketFrameError", ({ requestId, errorMessage }) => out("ws error", `${requestId} ${errorMessage}`));
const frame = (dir) => ({ requestId, response }) => {
  let summary = response.payloadData;
  try {
    const [, , topic, event, payload] = JSON.parse(response.payloadData);
    if (topic === "phoenix" && (event === "heartbeat" || event === "phx_reply")) {
      heartbeats++;
      return;
    }
    summary = `${topic} ${event} ${JSON.stringify(payload).slice(0, 220)}`;
  } catch {}
  out(`ws ${dir}`, `${requestId} ${summary}`);
};
cdp.on("Network.webSocketFrameSent", frame("sent →"));
cdp.on("Network.webSocketFrameReceived", frame("recv ←"));

const state = () => page.evaluate(() => window.__state?.());
const waitUntil = async (label, fn, timeoutMs) => {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (await fn()) return true;
    await sleep(500);
  }
  out("timeout", `${label} (${timeoutMs / 1000}s)`);
  return false;
};
const lastEvent = (kind) => events.filter((e) => e.kind === kind).at(-1);
const send = async (label) => {
  const r = await trigger([{ id: USER, name: "Wayfinder probe" }], { text: label });
  out("trigger", `${label} -> ${r.status} ${JSON.stringify(r.body)}`);
  return r.status === 200;
};

// --- timeline -----------------------------------------------------------------------------
await page.goto(origin);
await waitUntil("socket joined", () => events.some((e) => e.kind === "ws recv ←" && e.detail.includes("phx_reply")), 20_000);
await sleep(2_000);
out("state", JSON.stringify(await state()));

// Q4 while the page is up.
const branding = await page.evaluate(() => ({
  prebuiltFooter: document.querySelector("#prebuilt .rnf-notification-feed__knock-branding")?.textContent ?? null,
  prebuiltFooterHref: document.querySelector("#prebuilt .rnf-notification-feed__knock-branding a")?.getAttribute("href") ?? null,
  headlessHasFooter: Boolean(document.querySelector("#headless .rnf-notification-feed__knock-branding")),
  anyPoweredByOutsidePrebuilt: [...document.querySelectorAll("body *:not(#prebuilt *)")].some(
    (el) => el.children.length === 0 && /powered by knock/i.test(el.textContent ?? ""),
  ),
}));
out("Q4", JSON.stringify(branding));
await page.screenshot({ path: new URL("./out-q1-page.png", import.meta.url).pathname, fullPage: true });

// 1. Baseline: a message while visible arrives live.
let canSend = await send("M1 visible");
if (canSend) {
  await waitUntil("M1 in store", async () => (await state())?.texts?.includes("M1 visible"), 30_000);
  out("state", JSON.stringify(await state()));
}

// 2. Hide for more than 30 s and wait for the socket to close.
await page.evaluate(() => window.__setHidden(true));
out("hidden", "document.hidden = true, visibilitychange dispatched");
const hiddenAt = Date.now();
await waitUntil("ws closed after hide", () => lastEvent("ws closed")?.at > hiddenAt, 60_000);
const closedAt = lastEvent("ws closed")?.at;
if (closedAt) out("measure", `socket closed ${((closedAt - hiddenAt) / 1000).toFixed(1)}s after hide`);

// 3. Send while parked.
if (canSend) await send("M2 while hidden");
await sleep(15_000);
out("state", `while hidden: ${JSON.stringify(await state())}`);

// 4. Show again; watch for reconnect and any catch-up.
const shownAt = Date.now();
await page.evaluate(() => window.__setHidden(false));
out("visible", "document.hidden = false, visibilitychange dispatched");
await waitUntil("ws re-created", () => lastEvent("ws created")?.at > shownAt, 20_000);
await waitUntil(
  "M2 in store without reload",
  async () => (await state())?.texts?.includes("M2 while hidden"),
  canSend ? 30_000 : 20_000,
);
out("state", `after visible: ${JSON.stringify(await state())}`);
const feedFetchesAfterShow = events.filter((e) => e.at > shownAt && e.kind === "http →" && e.detail.includes("/feeds/")).length;
out("measure", `feed GETs after becoming visible: ${feedFetchesAfterShow}`);

// 5. If M2 did not show, does the next live message bring it along?
if (canSend && !(await state())?.texts?.includes("M2 while hidden")) {
  await send("M3 visible after return");
  await waitUntil("M3 in store", async () => (await state())?.texts?.includes("M3 visible after return"), 30_000);
  out("state", `after M3: ${JSON.stringify(await state())}`);
}

out("summary", `heartbeat frames suppressed: ${heartbeats}`);
const pageLog = await page.evaluate(() => window.__log);
out("page log", JSON.stringify(pageLog.filter((e) => e.event !== "store:items").slice(-20)));
await browser.close();
server.close();
