// Shape check on list endpoints, a channel-id sanity check, and the names (not values) of KNOCK_* vars.
import { knockApi, log } from "./lib.mjs";

log({ knockVarNames: Object.keys(process.env).filter((k) => k.includes("KNOCK")) });
for (const path of ["/v1/messages", "/v1/users", "/v1/tenants", "/v1/objects/projects"]) {
  const r = await knockApi("GET", path);
  log({ path, keys: r.body && typeof r.body === "object" ? Object.keys(r.body) : r.body, page_info: r.body?.page_info });
}
const fake = await knockApi("GET", "/v1/users/wayfinder-probe-none/feeds/00000000-0000-0000-0000-000000000000", { key: "public" });
log({ fakeChannelStatus: fake.status, body: fake.body });
const fakeSettings = await knockApi("GET", "/v1/users/wayfinder-probe-none/feeds/00000000-0000-0000-0000-000000000000/settings", { key: "public" });
log({ fakeChannelSettingsStatus: fakeSettings.status, body: fakeSettings.body });
