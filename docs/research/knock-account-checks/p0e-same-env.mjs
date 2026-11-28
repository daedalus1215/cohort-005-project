// Are the secret and public keys from the same environment?
// Identify a user with the secret key, read it back with the public key, then delete it.
import { knockApi, log } from "./lib.mjs";

const ID = "wayfinder-probe-envcheck";
const put = await knockApi("PUT", `/v1/users/${ID}`, { body: { name: "Env check" } });
log({ created_at: put.body?.created_at, name: put.body?.name });
const viaPublic = await knockApi("GET", `/v1/users/${ID}`, { key: "public" });
log({ publicKeySeesUser: viaPublic.status === 200, name: viaPublic.body?.name, body: viaPublic.status !== 200 ? viaPublic.body : undefined });
const del = await knockApi("DELETE", `/v1/users/${ID}`);
const gone = await knockApi("GET", `/v1/users/${ID}`);
log({ deleted: del.status, existsAfterDelete: gone.status === 200 });
