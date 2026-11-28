// Look for any environment hint in response headers, and try near-miss workflow keys
// (a 404 sends nothing; a hit would send one message to a probe user).
import { knockApi, log } from "./lib.mjs";

const r = await knockApi("GET", "/v1/users");
const hdrs = {};
for (const [k, v] of r.headers) hdrs[k] = v;
log({ responseHeaders: hdrs });

for (const key of ["wayfinder_probe", "wayfinder-probe-1", "wayfinderprobe", "Wayfinder-Probe"]) {
  const t = await knockApi("POST", `/v1/workflows/${key}/trigger`, {
    body: { recipients: [{ id: "wayfinder-probe-keycheck" }], data: { text: "key check" } },
  });
  log({ key, code: t.body?.code ?? t.body });
}
