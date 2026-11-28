// Side checks for send failures (#11), running with Knock off, and the test seam:
//  1. new Knock() with no apiKey and no KNOCK_API_KEY
//  2. SDK trigger of a workflow that is not in this environment: error class and status
//  3. SDK against a local server answering 503: how many attempts, how long
//  4. SDK against a refused port: error class, attempts, time
//  5. SDK pointed at a local fake via baseURL: what a trigger request looks like on the wire
//
// Run: node --env-file=<.env> p6-failures.mjs
import http from "node:http";
import Knock from "@knocklabs/node";
import { SK, log, nodeClient } from "./lib.mjs";

log("== 1. new Knock() without a key", { KNOCK_API_KEY_set: Boolean(process.env.KNOCK_API_KEY) });
try {
  new Knock();
  log("constructed without error");
} catch (e) {
  log({ threw: e.constructor.name, message: e.message.slice(0, 160) });
}

log("== 2. trigger a workflow missing from this environment, via the SDK");
try {
  await nodeClient().workflows.trigger("wayfinder-probe", { recipients: [{ id: "wayfinder-probe-unused" }], data: { text: "x" } });
} catch (e) {
  log({ threw: e.constructor.name, status: e.status, code: e.error?.code, message: e.message.slice(0, 120) });
}

const server = http.createServer((req, res) => {
  let body = "";
  req.on("data", (c) => (body += c));
  req.on("end", () => {
    hits.push({
      at: Date.now(),
      method: req.method,
      url: req.url,
      headerNames: Object.keys(req.headers).sort(),
      authScheme: String(req.headers.authorization ?? "").split(" ")[0],
      idempotencyKeyPrefix: String(req.headers["idempotency-key"] ?? "").slice(0, 21),
      idempotencyKey: req.headers["idempotency-key"],
      retryCount: req.headers["x-stainless-retry-count"],
      body,
    });
    if (mode === "503") res.writeHead(503, { "content-type": "application/json" }).end('{"message":"down"}');
    else res.writeHead(200, { "content-type": "application/json" }).end('{"workflow_run_id":"00000000-0000-0000-0000-000000000000"}');
  });
});
let hits = [];
let mode = "503";
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const base = `http://127.0.0.1:${server.address().port}`;

log("== 3. local server answering 503, SDK defaults");
hits = [];
let start = Date.now();
try {
  await new Knock({ apiKey: SK, baseURL: base }).workflows.trigger("wayfinder-probe", { recipients: [{ id: "u1" }] });
} catch (e) {
  log({ threw: e.constructor.name, status: e.status, attempts: hits.length, ms: Date.now() - start, gapsMs: hits.slice(1).map((h, i) => h.at - hits[i].at),
    retryCounts: hits.map((h) => h.retryCount), sameIdempotencyKeyOnEveryAttempt: new Set(hits.map((h) => h.idempotencyKey)).size === 1,
    idempotencyKeyPrefix: hits[0]?.idempotencyKeyPrefix });
}

log("== 4. refused port, SDK defaults");
start = Date.now();
try {
  await new Knock({ apiKey: SK, baseURL: "http://127.0.0.1:9" }).workflows.trigger("wayfinder-probe", { recipients: [{ id: "u1" }] });
} catch (e) {
  log({ threw: e.constructor.name, ms: Date.now() - start, message: e.message.slice(0, 120) });
}

log("== 5. local fake via baseURL: the trigger on the wire");
mode = "200";
hits = [];
const ok = await new Knock({ apiKey: SK, baseURL: base }).workflows.trigger("wayfinder-probe", {
  recipients: [{ id: "user_42", name: "Liam" }],
  actor: "user_7",
  data: { refundRequestId: 913 },
});
log({ sdkReturned: ok, request: hits[0] });
server.close();
