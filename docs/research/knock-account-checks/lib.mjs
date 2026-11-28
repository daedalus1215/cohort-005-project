// Shared helpers for the Knock account probes (research for issue #13).
//
// Setup, in a scratch directory outside the repo (never in Cadence's package.json):
//   npm init -y && npm pkg set type=module
//   npm install @knocklabs/node@1.41.1 @knocklabs/client@0.23.1 @knocklabs/react@0.15.1 \
//     react@19.2.8 react-dom@19.2.8 playwright-core@1.65.1 esbuild@0.28.2
//   npx esbuild page/page.jsx --bundle --outfile=page/bundle.js --format=iife \
//     --jsx=automatic --define:process.env.NODE_ENV='"production"'   # for q1-hidden-tab.mjs
// Run every probe with: node --env-file=<path to Cadence's .env> <probe>.mjs
// It needs KNOCK_SECRET_API_KEY, KNOCK_PUBLIC_API_KEY and KNOCK_FEED_CHANNEL_ID.
// Keys are read from the environment and never printed: everything logged goes
// through redact(), which also hides the feed channel id.
import Knock from "@knocklabs/node";

export const SK = process.env.KNOCK_SECRET_API_KEY ?? "";
export const PK = process.env.KNOCK_PUBLIC_API_KEY ?? "";
export const CHANNEL = process.env.KNOCK_FEED_CHANNEL_ID ?? "";
export const HOST = "https://api.knock.app";
export const WORKFLOW = "wayfinder-probe";

if (!SK.startsWith("sk_") || !PK.startsWith("pk_") || !CHANNEL) {
  throw new Error("Missing KNOCK_SECRET_API_KEY / KNOCK_PUBLIC_API_KEY / KNOCK_FEED_CHANNEL_ID");
}

export function redact(input) {
  let s = String(input);
  for (const [secret, label] of [
    [SK, "<sk>"],
    [PK, "<pk>"],
    [CHANNEL, "<feed-channel>"],
  ]) {
    if (secret) s = s.split(secret).join(label);
  }
  return s
    .replace(/((?:api_key|user_token|token|vsn_token)=)[^&\s"']+/g, "$1<redacted>")
    .replace(/\b(sk|pk)_[A-Za-z0-9_-]{8,}/g, "<$1_redacted>")
    .replace(/(Bearer )[^\s"']+/g, "$1<redacted>");
}

export function log(...parts) {
  const text = parts
    .map((p) => (typeof p === "string" ? p : JSON.stringify(p, null, 2)))
    .join(" ");
  console.log(redact(text));
}

/** Raw REST call. key: "secret" | "public". Logs method, redacted path and status. */
export async function knockApi(method, path, { key = "secret", body, query, headers = {} } = {}) {
  const url = new URL(path, HOST);
  for (const [k, v] of Object.entries(query ?? {})) url.searchParams.set(k, v);
  const res = await fetch(url, {
    method,
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      Authorization: `Bearer ${key === "secret" ? SK : PK}`,
      ...headers,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let json;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = text;
  }
  log(`${method} ${url.pathname}${url.search} [${key} key] -> ${res.status}`);
  return { status: res.status, body: json, headers: res.headers };
}

/** @knocklabs/node client on the secret key, with a fetch that logs each request. */
export function nodeClient(extra = {}) {
  return new Knock({
    apiKey: SK,
    fetch: async (input, init) => {
      const res = await fetch(input, init);
      log(`[node sdk] ${init?.method ?? "GET"} ${new URL(String(input)).pathname} -> ${res.status}`);
      return res;
    },
    ...extra,
  });
}

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export async function waitFor(fn, { timeout = 30_000, interval = 1_500, label = "condition" } = {}) {
  const start = Date.now();
  for (;;) {
    const value = await fn();
    if (value) return value;
    if (Date.now() - start > timeout) throw new Error(`Timed out waiting for ${label}`);
    await sleep(interval);
  }
}

/** Feed items for a user, as the browser would fetch them (public key, no user token). */
export async function feedAsBrowser(userId, query = {}) {
  return knockApi("GET", `/v1/users/${encodeURIComponent(userId)}/feeds/${CHANNEL}`, {
    key: "public",
    query,
  });
}

export function trigger(recipients, data) {
  return knockApi("POST", `/v1/workflows/${WORKFLOW}/trigger`, {
    body: { recipients, data },
  });
}
