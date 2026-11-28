// Delete every wayfinder-probe-* user in the environment the keys belong to, then verify.
//
// Run: node --env-file=<.env> cleanup.mjs
import { knockApi, log } from "./lib.mjs";

const known = [
  "wayfinder-probe-none", "wayfinder-probe-bare", "wayfinder-probe-keycheck", "wayfinder-probe-unused",
  "wayfinder-probe-envcheck", "wayfinder-probe-q1", "wayfinder-probe-q2", "wayfinder-probe-q3",
  "wayfinder-probe-ssr-a", "wayfinder-probe-ssr-b", "wayfinder-probe-ssr-c", "wayfinder-probe-ssr-d", "wayfinder-probe-ssr-e",
];

const listed = [];
let after;
do {
  const page = await knockApi("GET", "/v1/users", { query: { page_size: "50", ...(after ? { after } : {}) } });
  listed.push(...(page.body?.entries ?? []).map((u) => u.id));
  after = page.body?.page_info?.after;
} while (after);
log({ allUsersInEnvironment: listed });

const targets = [...new Set([...known, ...listed.filter((id) => id.startsWith("wayfinder-probe-"))])];
const report = [];
for (const id of targets) {
  const exists = (await knockApi("GET", `/v1/users/${id}`)).status === 200;
  if (exists) await knockApi("DELETE", `/v1/users/${id}`);
  const gone = (await knockApi("GET", `/v1/users/${id}`)).status === 404;
  report.push({ id, existed: exists, goneNow: gone });
}
log(report);
const remaining = await knockApi("GET", "/v1/users");
log({ usersLeft: remaining.body?.entries?.map((u) => u.id), total: remaining.body?.page_info?.total_count });
