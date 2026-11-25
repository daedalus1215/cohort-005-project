# How Knock delivers in-app Notifications to a React Router app

Research for [#2](https://github.com/daedalus1215/cohort-005-project/issues/2), a child of the map [#1](https://github.com/daedalus1215/cohort-005-project/issues/1) "In-app Notifications in Cadence". Read on 2026-11-25 from Knock's own docs (docs.knock.app), Knock's GitHub repos and npm. This covers delivery, auth, storage and server-side concerns. Knock's React UI components are researched separately.

## Answer first

- **Sending:** Cadence's server calls `client.workflows.trigger(key, { recipients, actor, data })` from `@knocklabs/node`, or `POST /v1/workflows/{key}/trigger`. A workflow built in the Knock dashboard holds an in-app feed step, and the step's template renders the Notification's content. `data` is any JSON object up to 10 MB, and all of it comes back on the feed item. The trigger is asynchronous and returns only a `workflow_run_id`, not message ids.
- **Recipients:** a Cadence person becomes a Knock user identified by a string `id` that can never change. A user must exist in Knock before a notification can reach them. Inline identification removes the separate call: pass `{ id: "…" }` objects (not bare strings) in `recipients`, and Knock upserts them before the run. Users are separate per environment.
- **Live delivery:** the browser holds a Phoenix Channels websocket to `wss://api.knock.app/ws/v1`, on topic `feeds:<channel_id>:<user_id>`. Knock pushes one event, `new-message`, carrying badge counts only, and the client then refetches new items over HTTPS. The socket only opens in a browser, never during SSR. By default it disconnects 30 s after the tab is hidden and reconnects when the tab is visible again.
- **Auth:** the browser uses the public key (`pk_…`). With *enhanced security mode* off, which is the default, that key can act as **any** user. With it on, every client request also needs an RS256 JWT (`sub` = user id) that Cadence's server signs locally with `signUserToken()` and `KNOCK_SIGNING_KEY`. Signing makes no network call and tokens expire after 1 hour by default. The mode is switched on per environment.
- **What Knock stores:** one Message per recipient per channel. Engagement state is `seen_at`, `read_at`, `interacted_at`, `archived_at` and `link_clicked_at`. Feed items are kept **indefinitely**; message *logs* are kept 30 days (90 on Enterprise). A sent message's content can't be edited. It can only be archived, after which a new one is triggered.
- **Server access to state:** yes. With the secret key, the server can list a user's feed or messages, mark single messages or batches seen, read, interacted or archived (and undo each), and bulk-archive by channel, filtered by recipients, workflow and trigger data.
- **Limits:** the free tier is now the "Free plan", formerly "Developer". It allows 10,000 messages a month with no card, unlimited environments and no hard cap; Knock contacts you if you go over. Usage counts in **every** environment, development included. The in-app channel can't be sandboxed. Rate limits run per endpoint, from 1 to 1,000 requests a second.
- **Environments:** an account starts with **production only**. Enabling environments adds development, and it can't be turned off. Each environment has its own keys, users, messages and in-app channel config. API triggers run the last *committed* workflow version.
- **No keys:** `new Knock()` from `@knocklabs/node` **throws** if `KNOCK_API_KEY` is missing or empty, and `signUserToken()` throws without a signing key. The browser client constructs fine with any key and fails at request time.
- **No network:** the Node SDK retries twice by default with a 60 s timeout per attempt, then throws `APIConnectionError`. The browser client logs, retries and backs off its socket for up to 10 minutes.
- **Test helpers:** Knock offers no mock, fake, emulator or offline mode. What it does offer (the dashboard test runner, `settings.sandbox_mode`, the CLI's `knock workflow run`) all calls Knock over the network, and sandbox mode doesn't apply to in-app messages anyway. The seams Knock does provide are a published OpenAPI spec and `fetch`/`baseURL` overrides on the Node SDK.
- **Versions today:** `@knocklabs/node` 1.41.1, `@knocklabs/client` 0.23.1, `@knocklabs/react` 0.15.1 and `@knocklabs/react-core` 0.17.1. All fit this repo: Node 22, ESM, React 19.2. None is installed yet.

## 1. Sending from the server

**Node SDK.** `@knocklabs/node` v1 is a generated, fully typed client. It is initialised with `new Knock({ apiKey })`, and `apiKey` defaults to `process.env.KNOCK_API_KEY`. In v1, `notify()` became `workflows.trigger()` and `users.identify()` became `users.update()`. ([Node 1.0 migration guide](https://docs.knock.app/developer-tools/migration-guides/node), [knock-node README](https://github.com/knocklabs/knock-node))

```ts
import Knock from "@knocklabs/node";
const knock = new Knock({ apiKey: process.env.KNOCK_API_KEY });
await knock.workflows.trigger("refund-request-decided", {
  recipients: [{ id: "user_42", name: "Liam", email: "liam@example.com" }], // inline identify
  actor: "user_7",
  data: { refundRequestId: 913, decision: "approved" },
});
```

**Workflows.** A workflow is built in the dashboard (or as files through the Knock CLI). Its trigger step runs the steps that follow, and an in-app feed *channel step* in it produces one feed message per recipient. Knock creates one in-app feed channel by default, and more can be added. ([Triggering workflows](https://docs.knock.app/send-notifications/triggering-workflows/overview), [Feeds overview](https://docs.knock.app/in-app-ui/feeds/overview))

The in-app template has three variants: Standard, Single-action and Multi-action. An optional **action URL** set from a Liquid variable becomes the click-through. ([In-app feeds](https://docs.knock.app/integrations/in-app/feeds))

An inactive workflow returns `workflow_inactive` and creates no runs. ([Triggering workflows FAQ](https://docs.knock.app/send-notifications/triggering-workflows/overview))

**Trigger payload.** The payload fields are `key`, `recipients` (up to 1,000), optional `actor`, `data`, `cancellation_key`, `tenant` and `settings`. ([Trigger via API](https://docs.knock.app/send-notifications/triggering-workflows/api))
- `data` must be a JSON object, with a 10 MB limit on the whole payload. ([Trigger via API](https://docs.knock.app/send-notifications/triggering-workflows/api))
- Each recipient can also carry `$trigger_data`, which is merged over `data` for that one recipient. ([Trigger via API](https://docs.knock.app/send-notifications/triggering-workflows/api))
- All of `data` is passed through onto the feed item, so Cadence ids such as `refundRequestId` arrive in the browser. ([In-app API](https://docs.knock.app/in-app-ui/api-overview#passing-through-data))
- By default the feed API returns the whole trigger `data`, the actor's and recipient's custom properties, and public variables. A per-environment *API response filter* in the dashboard can hide keys. ([In-app feeds: customizing API response content](https://docs.knock.app/integrations/in-app/feeds#customizing-api-response-content))

**Asynchronous; what comes back.** "All workflow runs are executed asynchronously." The response is `{ "workflow_run_id": "<uuid>" }`, and each recipient's run id is derived from it. ([Trigger workflow API reference](https://docs.knock.app/api-reference/workflows/trigger), [Trigger via API](https://docs.knock.app/send-notifications/triggering-workflows/api)) Message ids are not returned. To find the message later, filter the list endpoints by `workflow_run_id`, `source` (workflow key) or `trigger_data` (§4).

**Retries and duplicates.** The trigger endpoint, and only that endpoint, accepts an `Idempotency-Key` header with a 24-hour window. Knock caches only `2xx` responses. ([Idempotent requests](https://docs.knock.app/api-reference/overview/idempotent-requests))

**Versioning.** The API trigger "will always use the last committed version" of a workflow. The dashboard test runner uses the last *saved* version instead. ([Testing workflows](https://docs.knock.app/send-notifications/testing-workflows))

## 2. Recipients: how a Cadence person becomes a Knock user

- "To send notifications to a recipient… their data must be stored in Knock. This process is called identifying." All three ways of identifying (direct `PUT /v1/users/{id}`, inline, bulk) are **upserts** that deep-merge properties. ([Identifying recipients](https://docs.knock.app/managing-recipients/identifying-recipients))
- **Does identify have to come first?** For a bare string recipient, yes. The trigger docs describe a string as "a user that you have previously identified to Knock". ([Trigger via API](https://docs.knock.app/send-notifications/triggering-workflows/api))
- With **inline identification**, Knock "guarantees that recipients are identified before executing any other action", which "enables lazy recipient creation". It requires objects, even ones holding only an id. Passing bare string ids is called out as "a common mistake". ([Identifying recipients](https://docs.knock.app/managing-recipients/identifying-recipients#inline-identification))
- *Not confirmed:* the docs don't say what a trigger does with a string id that was never identified, whether it errors, skips or creates an empty user.
- The browser can also identify the user. `KnockProvider` or `knock.authenticate({ id, …props })` upserts the user from the client with the public key. ([Identifying recipients](https://docs.knock.app/managing-recipients/identifying-recipients#inline-identification), [`knock.ts` source](https://github.com/knocklabs/javascript/blob/main/packages/client/src/knock.ts))
- The feed endpoint returns "an empty feed" for a user who has not been identified yet. ([List feed items](https://docs.knock.app/api-reference/users/feeds/list_items))
- **The id:** Knock recommends your internal primary key. It may be at most 256 characters, with no `/` or `#`, and "You cannot change a user's id once it has been set". ([Users](https://docs.knock.app/concepts/users))
- Different types of user can be told apart with a prefix, for example `customer_123`. ([Users](https://docs.knock.app/concepts/users))
- Cadence's `users.id` is an autoincrement integer (`app/db/schema.ts`), so it has to be turned into a string.
- **Per environment:** "Each environment has a separate, isolated set of users." ([Users FAQ](https://docs.knock.app/concepts/users))
- Dashboard team members are automatically identified as users, in development if environments are enabled. ([Users FAQ](https://docs.knock.app/concepts/users))
- **Deleting a user:** the user can no longer be a recipient or actor, and in-app messages that reference them show a "missing user" marker. ([Users](https://docs.knock.app/concepts/users), [Delete user](https://docs.knock.app/api-reference/users/delete))
- "No, all users who are sent a notification are identified in your Knock environment and are persisted." ([Users FAQ](https://docs.knock.app/concepts/users))
- Rate tiers: identify (`PUT /v1/users/{id}`) is tier 3, 60 requests a second. Trigger is tier 5, 1,000 requests a second. ([Identify user](https://docs.knock.app/api-reference/users/update), [Trigger workflow](https://docs.knock.app/api-reference/workflows/trigger))

## 3. Live delivery to an open tab

**The mechanism.** "Clients connect to the in-app real-time service, which receives notifications over a websocket when new messages are sent to an in-app feed channel. This is a managed service provided by Knock." ([Feeds overview](https://docs.knock.app/in-app-ui/feeds/overview)) The only event is `new-message`: it "Will not contain the full message contents, but will include metadata about the updated badge counts. Might be throttled." ([In-app APIs and real-time service](https://docs.knock.app/in-app-ui/api-overview#real-time-delivery))

**What `@knocklabs/client` does.** All of the following was read from the source on `main`.
- The client opens a Phoenix `Socket` at `${host→ws}/ws/v1`, with the default host `https://api.knock.app`. It passes `api_key` and `user_token` as params. ([`api.ts`](https://github.com/knocklabs/javascript/blob/main/packages/client/src/api.ts), [`knock.ts`](https://github.com/knocklabs/javascript/blob/main/packages/client/src/knock.ts))
- Before connecting, it `POST`s `/v1/sockets/connect` for a signed, expiring connect URL. ([`gatewayTransport.ts`](https://github.com/knocklabs/javascript/blob/main/packages/client/src/gatewayTransport.ts))
- The socket is created only when `typeof window !== "undefined" && typeof WebSocket !== "undefined"`, so a React Router server render never opens one. ([`api.ts`](https://github.com/knocklabs/javascript/blob/main/packages/client/src/api.ts))
- Each feed joins channel `feeds:<channel_id>:<user_id>`. ([`feed.ts`](https://github.com/knocklabs/javascript/blob/main/packages/client/src/clients/feed/feed.ts), [`socket-manager.ts`](https://github.com/knocklabs/javascript/blob/main/packages/client/src/clients/feed/socket-manager.ts))
- On `new-message`, the client sets the badge counts from the payload, then fetches items newer than its current head over HTTPS. ([`feed.ts`](https://github.com/knocklabs/javascript/blob/main/packages/client/src/clients/feed/feed.ts))
- Calling `listenForUpdates()` opens the live connection, and `fetch()` loads the items. ([JS SDK quick start](https://docs.knock.app/in-app-ui/javascript/sdk/quick-start))
- **Hidden tabs:** `disconnectOnPageHidden` defaults to `true`. The socket disconnects 30 s after the page goes hidden and reconnects when it becomes visible, and Phoenix rejoins the channel. This has been the default since a Feb 2026 change. ([`pageVisibility.ts`](https://github.com/knocklabs/javascript/blob/main/packages/client/src/pageVisibility.ts), [`interfaces.ts`](https://github.com/knocklabs/javascript/blob/main/packages/client/src/interfaces.ts), [knocklabs/javascript#866](https://github.com/knocklabs/javascript/pull/866))
- I found no refetch when the channel rejoins. A message created while the socket was parked appears with the next `new-message` (which fetches everything newer than the head) or the next `fetch()`. *Docs and source don't confirm whether the React layer refetches on reconnect.* That is the sibling ticket's ground.
- The JS SDK docs still describe an opt-in `auto_manage_socket_connection` option with a 2 s delay. That option no longer appears in the client source, so the docs look stale. ([JS SDK quick start](https://docs.knock.app/in-app-ui/javascript/sdk/quick-start))
- Several feeds share one socket. A `BroadcastChannel` named `knock:feed:<channel>:<user>` can sync tabs, behind an `__experimentalCrossBrowserUpdates` flag. ([`feed.ts`](https://github.com/knocklabs/javascript/blob/main/packages/client/src/clients/feed/feed.ts))
- **Reconnects:** backoff with full jitter, capped at 10 minutes for the socket. HTTP requests retry network errors, 5xx and 429 up to 3 times. The client also reconnects promptly on the browser's `online` event. ([`api.ts`](https://github.com/knocklabs/javascript/blob/main/packages/client/src/api.ts))
- **Switching user:** calling `authenticate()` with a different user id or token tears down the feeds and socket and rebuilds them for the new user. This bears on the DevUI user switcher. ([`knock.ts`](https://github.com/knocklabs/javascript/blob/main/packages/client/src/knock.ts))
- **CSP:** "The WebSocket can connect to any subdomain of `knock.app`". The fix is `connect-src 'self' https://*.knock.app wss://*.knock.app`. ([Security: socket errors](https://docs.knock.app/in-app-ui/security-and-authentication#errors-establishing-a-real-time-socket-connection)) Cadence sets no Content-Security-Policy today; a grep of `app/` and the configs found none.
- **Proxying:** "You can avoid authentication altogether by proxying requests to Knock via your backend, although we don't recommend this". ([Security](https://docs.knock.app/in-app-ui/security-and-authentication#avoiding-authentication)) The docs don't say whether the real-time socket can be proxied. A fully proxied design would need Cadence's own push, such as SSE, to stay live.

## 4. Authentication: public key, user tokens, enhanced security mode

- **Two kinds of key per environment.** `pk_…` keys "aren't secret, and can safely be made public". `sk_…` keys "can perform any API request". Requests are scoped to the key's environment, and API keys can't be narrowed. ([API keys](https://docs.knock.app/api-reference/overview/api-keys), [API keys FAQ](https://docs.knock.app/developer-tools/api-keys))
- The browser client throws if given an `sk_` key. ([`knock.ts`](https://github.com/knocklabs/javascript/blob/main/packages/client/src/knock.ts))
- **What a public key can call:** get and update the user; preferences; channel data; `GET /v1/users/:id/feeds/:channel_id`; `PUT`/`DELETE /v1/messages/:id/:status`; `POST /v1/messages/batch/:status`; `POST /v1/channels/:channel_id/messages/bulk/:action`; and guides. ([Security: public API key endpoints](https://docs.knock.app/in-app-ui/security-and-authentication#public-api-key-endpoints))
- **Enhanced security mode off (the default):** "you can use your public key to authenticate all users… Knock will not reject requests that do not include a signed user token". Also: "Without enhanced security mode, a request with your public key can act as any user. Enable it before you release". Knock suggests keeping it off only in a development environment. ([Security](https://docs.knock.app/in-app-ui/security-and-authentication#authentication-without-enhanced-security))
- **Enhanced security mode on:** client requests without a signed user token are rejected. ([Security](https://docs.knock.app/in-app-ui/security-and-authentication#authentication-with-enhanced-security))
  - The signing key is generated under **Platform > API keys**, is shown once, and comes as base64 PEM or PEM. Store it as `KNOCK_SIGNING_KEY`.
  - The JWT is RS256 with a required `sub`; `iat` and `exp` are recommended.
  - Send it to the browser as `userToken` on `KnockProvider` or `knock.authenticate(user, token)`.
- **Where the mode is enabled:** per environment, on that environment's **Platform > API Keys** page. ([Implementation guide: going to production](https://docs.knock.app/tutorials/implementation-guide))
- The plans page doesn't list enhanced security mode as an Enterprise-only feature. ([Knock plans](https://docs.knock.app/manage-your-account/knock-plans))
- **Signing in Node:** `signUserToken(userId, { expiresInSeconds, signingKey, grants })` from `@knocklabs/node`. ([knock-node README](https://github.com/knocklabs/knock-node#jwt-token-signing), [`tokenSigner.ts`](https://github.com/knocklabs/knock-node/blob/main/src/lib/tokenSigner.ts))
  - The default expiry is 3600 s.
  - It signs locally with `jose` (`importPKCS8`, RS256), so there is no network call.
  - It throws `No signing key provided…` when neither the option nor `KNOCK_SIGNING_KEY` is set.
- The browser sends the token as an `X-Knock-User-Token` header and as the `user_token` socket param. ([`api.ts`](https://github.com/knocklabs/javascript/blob/main/packages/client/src/api.ts))
- **Expiry:** Knock advises matching the token's life to the session, or using short-lived tokens refreshed through `onUserTokenExpiring`. Calling `authenticate` again restarts the real-time connection. ([Security: handling token expiration](https://docs.knock.app/in-app-ui/security-and-authentication#handling-token-expiration))
- **Grants:** with `explicit_grants: true` a token is limited to the listed grants, such as `user/feed_read` and `user/feed_write` (mark read, seen, archived). Without it, the token reaches all of that user's resources. Tenant grants can scope feeds. ([Security: limiting access](https://docs.knock.app/in-app-ui/security-and-authentication#limiting-access-to-specific-resources))
- **Rate limits:** requests with a key are rate-limited per environment, and requests with a signed user token per environment *and* user. ([Rate limits](https://docs.knock.app/api-reference/overview/rate-limits))
- The feed list endpoint "is always scoped per-user and per-environment", even without a user token. ([List feed items](https://docs.knock.app/api-reference/users/feeds/list_items))

## 5. What Knock stores, and what Cadence's server can do with it

**The model.** A Message is "a notification delivered to a User or an Object on a particular channel". The Feeds API is "a specialized view of messages delivered to an in-app feed channel". ([Messages](https://docs.knock.app/concepts/messages))
- In-app messages skip straight to the `delivered` delivery status. ([Message statuses](https://docs.knock.app/send-notifications/message-statuses#6-sent))
- Engagement statuses can be held together. Each one has a timestamp:

| Status | Field | Managed implicitly by Knock's in-app feed? |
| --- | --- | --- |
| seen | `seen_at` | yes ("retrieved for display… at least once") |
| read | `read_at` | yes, when using Knock's React feed |
| interacted | `interacted_at` | yes (click on the cell) |
| archived | `archived_at` | yes |
| link_clicked | `link_clicked_at` / `clicked_at` | only with link tracking on |

([Message statuses: engagement](https://docs.knock.app/send-notifications/message-statuses#engagement-status))
- "Unread" means `read_at` is unset. The feed metadata returns `total_count`, `unread_count` and `unseen_count`. ([In-app APIs: FeedMetadata](https://docs.knock.app/in-app-ui/api-overview#feedmetadata))
- Archived items are left out of the feed by default. `archived: only` or `archived: include` brings them back. ([In-app feeds: archiving](https://docs.knock.app/integrations/in-app/feeds#archiving-messages))
- Knock records every status change as a message event, which can be sent out through outbound webhooks. ([Message statuses: message events](https://docs.knock.app/send-notifications/message-statuses#message-events))

**Content is immutable.** "Can I update a feed message after it's been sent? No. You can update a feed message's engagement statuses… but its content and other metadata can't be changed once Knock generates it. If a message becomes out of date, archive it and trigger the workflow again". ([In-app feeds FAQ](https://docs.knock.app/integrations/in-app/feeds), [Feeds overview FAQ](https://docs.knock.app/in-app-ui/feeds/overview)) The Messages API lists no delete endpoint for a single message; archiving is the documented way to take one out of the feed. ([Messages API](https://docs.knock.app/api-reference/messages))

**Retention.** ([Data retention](https://docs.knock.app/manage-your-account/data-retention), [Messages](https://docs.knock.app/concepts/messages), [Pricing](https://knock.app/pricing))
- "In-app feed notifications are available indefinitely."
- Their statuses can still be updated after their message log data has expired.
- Message *log data* (contents, events, delivery logs, activities) is kept 30 days, or 90 on Enterprise.
- "Custom retention policies are not currently supported."
- The pricing page instead describes feed retention as "No limit, but can be configured". The two sources disagree on whether feed retention can be configured.

**Server-side read and write**, all with the secret key. Each is in `@knocklabs/node` ([api.md](https://github.com/knocklabs/knock-node/blob/main/api.md)).
- **Read the feed** as the browser sees it: `client.users.feeds.listItems(userId, channelId, { status, archived, source, trigger_data, … })`. This comes under the indefinite in-app retention. ([List feed items](https://docs.knock.app/api-reference/users/feeds/list_items))
- **List a user's messages:** `client.users.listMessages(userId, { channel_id, engagement_status, source, workflow_run_id, trigger_data, … })`. Messages outside the retention window are left out. ([List user messages](https://docs.knock.app/api-reference/users/list_messages))
- **Change one message:** `client.messages.markAsSeen` / `markAsRead` / `markAsInteracted` / `archive`, plus the undo of each (`markAsUnseen`, `markAsUnread`, `unarchive`). These are tier 2, 5 requests a second. ([Messages API](https://docs.knock.app/api-reference/messages))
- **Batches:** `client.messages.batch.*` takes message ids. ([Messages API: batch](https://docs.knock.app/api-reference/messages))
- **Bulk by channel:** `client.channels.bulk.updateMessageStatus(channelId, action, { recipient_ids, workflows, trigger_data, older_than, … })` runs asynchronously and returns a `BulkOperation`. "For in-app channels, messages can be updated indefinitely via this operation." ([Bulk update message statuses](https://docs.knock.app/api-reference/channels/bulk/update_message_status))
- This is the tool for "the subject moved on": for example, archive every `refund-request-opened` message whose `refundRequestId` is 913, for every Platform Admin.
- `trigger_data` filtering only sees top-level scalars. Nested objects and arrays are dropped, and strings are truncated at 256 characters. ([Trigger data filtering](https://docs.knock.app/api-reference/overview/trigger-data-filtering))
- Batch and bulk endpoints also limit updates to 1 per second per entity. Rejected ids come back in an `x-ratelimited-{param}` header with a 2xx response. ([Batch rate limits](https://docs.knock.app/api-reference/overview/batch-rate-limits), [docs source for the tier table](https://github.com/knocklabs/docs/blob/main/components/ui/RateLimit.tsx))

## 6. Limits

**Plans.** "Knock offers a Free plan (formerly known as our Developer plan) and two paid plans, Starter and Enterprise." ([Knock plans](https://docs.knock.app/manage-your-account/knock-plans))
- **Free:** $0 with no card, up to 10,000 messages a month, unlimited environments, members and workflows, and 30-day log retention. ([Pricing](https://knock.app/pricing))
- **Going over:** "We don't hard cap your messages… we'll get in touch with you about making sure you have a billing method in place next month." ([Pricing FAQ](https://knock.app/pricing))
- **Starter:** $250 a month, including 50,000 messages, then $0.005 each. ([Pricing](https://knock.app/pricing))
- Enterprise-only features that might matter here: translations, per-tenant preferences and branding, and batch render limits above 10 items. Feeds, real-time delivery and enhanced security mode are not on the Enterprise-only list. ([Knock plans](https://docs.knock.app/manage-your-account/knock-plans))

**What counts.** "A message is counted each time a notification is successfully delivered to a single user on a single channel." If a channel step doesn't run, no message is counted. ([Knock plans: message counts](https://docs.knock.app/manage-your-account/knock-plans#message-counts))
- "Regardless of plan, usage may be accrued in any Knock environment." ([Knock plans](https://docs.knock.app/manage-your-account/knock-plans#how-knock-meters-usage))
- "The in-app channel doesn't support sandbox mode." Knock suggests channel conditions to limit which messages are created outside production. ([Knock plans FAQ](https://docs.knock.app/manage-your-account/knock-plans))
- In-app messages Cadence triggers in development therefore count toward the 10,000.

**Rate limits** are tiered per endpoint: tier 1 = 1, tier 2 = 5, tier 3 = 60, tier 4 = 200 and tier 5 = 1,000 requests a second. Exceeding a limit returns `429`. ([Rate limits](https://docs.knock.app/api-reference/overview/rate-limits), with the tier-to-value mapping from [the docs source](https://github.com/knocklabs/docs/blob/main/components/ui/RateLimit.tsx)) Relevant tiers:

| Endpoint | Tier | Limit | Source |
| --- | --- | --- | --- |
| trigger | 5 | 1,000/s | [Trigger workflow](https://docs.knock.app/api-reference/workflows/trigger) |
| identify | 3 | 60/s | [Identify user](https://docs.knock.app/api-reference/users/update) |
| feed list | 2 | 5/s per user | [List feed items](https://docs.knock.app/api-reference/users/feeds/list_items) |
| single message status | 2 | 5/s, per environment when the secret key is used | [Messages API](https://docs.knock.app/api-reference/messages) |

**Other caps:**
- 1,000 recipients per trigger, and there is no bulk trigger. ([Trigger via API FAQ](https://docs.knock.app/send-notifications/triggering-workflows/api))
- 256 kB of custom properties per recipient. ([Identifying recipients](https://docs.knock.app/managing-recipients/identifying-recipients#custom-properties))

## 7. Development vs production environments

- **Production only at first:** "Your Knock account starts with a single environment: production." Enabling environments adds development, which becomes the default for the CLI and Management API, and "You can't turn environments off after you enable them." ([Environments](https://docs.knock.app/version-control/environments))
- **Data per environment, never shared:** users, tenants, objects, messages, logs and events. ([Environments](https://docs.knock.app/version-control/environments#send-data-to-environments))
- **Version-controlled content:** workflows, layouts, partials and translations are committed and promoted upward. Content can only be edited in the environment where it was created. ([Environments](https://docs.knock.app/version-control/environments#create-content-in-environments))
- **Per-environment settings:** API keys, channel settings (including the in-app API response filter) and variable values. ([Environments](https://docs.knock.app/version-control/environments), [In-app feeds](https://docs.knock.app/integrations/in-app/feeds#customizing-api-response-content))
- Enhanced security mode is per environment too (§4).
- **Knock's own advice:** enable environments if "Engineers manage transactional notification workflows that ship alongside your application code" or "You want to test against separate data and API keys". ([Version control overview FAQ](https://docs.knock.app/version-control/overview))
- Environments can't be created through the API. ([Environments FAQ](https://docs.knock.app/version-control/environments))

## 8. No keys, no network, and test helpers

**Node SDK without a key.**
- `new Knock()` throws `KnockError: The KNOCK_API_KEY environment variable is missing or empty…`. `readEnv` trims, and an empty value counts as missing. ([`src/client.ts`](https://github.com/knocklabs/knock-node/blob/main/src/client.ts), [`src/internal/utils/env.ts`](https://github.com/knocklabs/knock-node/blob/main/src/internal/utils/env.ts))
- An adapter therefore has to build the client only when the key is set, as `defaultTransport()` in `app/lib/mailer.server.ts` already does for Postmark.
- The SDK also picks up `KNOCK_BASE_URL` and `KNOCK_BRANCH` from the environment.

**Node SDK without network.**
- Connection errors, 408, 409, 429 and 5xx are retried twice by default with exponential backoff. Each attempt times out after 1 minute, and timeouts are retried too. ([knock-node README: retries, timeouts](https://github.com/knocklabs/knock-node#retries))
- After the retries the SDK throws `APIConnectionError` or `APIConnectionTimeoutError`.
- So a trigger awaited inside a request can stall for minutes unless `timeout` and `maxRetries` are set lower.

**Browser client.**
- `new Knock(pk)` only checks for an `sk_` prefix. It doesn't validate an empty key. ([`knock.ts`](https://github.com/knocklabs/javascript/blob/main/packages/client/src/knock.ts))
- `listenForUpdates()` does nothing when the client isn't authenticated. ([`feed.ts`](https://github.com/knocklabs/javascript/blob/main/packages/client/src/clients/feed/feed.ts))
- Failed requests are logged with `console.error` and resolve as error responses rather than throwing, and the socket backs off up to 10 minutes. ([`api.ts`](https://github.com/knocklabs/javascript/blob/main/packages/client/src/api.ts))
- What Knock's React components show with no key belongs to the sibling ticket.

**Test helpers.**
- Grepping Knock's full docs text ([llms-full.txt](https://docs.knock.app/llms-full.txt)) found no mock, fake, stub, emulator, offline mode or unit-testing guidance.
- What Knock offers instead all runs against its servers:
  - the dashboard **workflow test runner**, which also runs single steps ([Testing workflows](https://docs.knock.app/send-notifications/testing-workflows))
  - `settings: { sandbox_mode, skip_delay }` on a trigger ([Trigger via API](https://docs.knock.app/send-notifications/triggering-workflows/api#testing-workflows-with-trigger-settings)), though sandbox mode does nothing for in-app messages
  - `knock workflow run` in the CLI ([Testing workflows](https://docs.knock.app/send-notifications/testing-workflows#testing-workflows-using-the-knock-cli))
  - the workflow debugger ([Debugging workflows](https://docs.knock.app/send-notifications/debugging-workflows))
- Seams Knock does provide:
  - a published OpenAPI spec ([openapi.json](https://docs.knock.app/openapi.json))
  - `fetch` and `baseURL` options on the Node SDK ([knock-node README: customizing the fetch client](https://github.com/knocklabs/knock-node#customizing-the-fetch-client))
- knock-node's own test suite runs against a mock server generated from that spec ([`scripts/mock`](https://github.com/knocklabs/knock-node/blob/main/scripts/mock)). That is internal tooling, not a documented helper for apps.

## 9. Package versions against this repo

Versions checked on npm on 2026-11-25:

| Package | Latest | Published | Requirements | Fit with Cadence |
| --- | --- | --- | --- | --- |
| [`@knocklabs/node`](https://www.npmjs.com/package/@knocklabs/node) | 1.41.1 | 2026-11-10 | Node 20 LTS+, TS ≥ 4.9; depends on `jose` ^6 (ESM-only) | OK: Node 22, `"type": "module"` |
| [`@knocklabs/client`](https://www.npmjs.com/package/@knocklabs/client) | 0.23.1 | 2026-11-06 | depends on `phoenix` 1.8.9 | OK |
| [`@knocklabs/react`](https://www.npmjs.com/package/@knocklabs/react) | 0.15.1 | 2026-11-06 | peers: react / react-dom ^17–^19; `next` and `@tanstack/react-router` optional | React 19.2 OK; react-router is not a peer |
| [`@knocklabs/react-core`](https://www.npmjs.com/package/@knocklabs/react-core) | 0.17.1 | 2026-11-06 | peer: react ^17–^19 | OK |

Runtime support is from the [knock-node README](https://github.com/knocklabs/knock-node#requirements). None of these is in `package.json` yet. The Postmark transport calls Postmark's REST API with plain `fetch` and no SDK. Knock's REST API (Bearer `sk_…`) could be called the same way if the adapter should avoid the dependency, but `signUserToken` comes from the SDK (or `jose` directly). ([Authentication](https://docs.knock.app/api-reference/overview/authentication))

## Open questions for the storage and adapter decision

1. **Source of truth for a Notification.** Knock keeps feed items and their seen, read and archived state indefinitely, and lets the server read and change them. Should Cadence keep its own Notification rows in SQLite (ADR 0006) at all, or treat Knock as the store and keep only what's needed to find messages again, such as trigger data keys? The answer also decides what the stand-in adapter shows with Knock off.
2. **Finding a message later.** A trigger returns only a `workflow_run_id`, never message ids. Is filtering by `trigger_data` (top-level scalars only) and workflow key enough to archive "every Notification about Refund Request 913"? Or should Cadence record `workflow_run_id`?
3. **What identity Cadence hands Knock, and reseeding.** Cadence ids are reused integers, while Knock ids are permanent and feeds never expire. If `npm run db:seed` recreates users with the same ids against a long-lived Knock development environment, old Notifications show up for whoever now holds that id. Options are prefixed ids (`user_42`), a per-seed namespace, or deleting Knock users on reseed. The docs give no guidance.
4. **Enhanced security and the DevUI switcher.** With enhanced security mode off, the DevUI only has to change the user id it passes to the client. With it on, Cadence's server must sign a token for the session user on every switch. Which mode does development run in, and does the root loader sign a token on every request?
5. **Environments.** Should Cadence enable Knock environments, which can't be undone, so that local development uses development keys and production uses production keys? Development usage counts toward the 10,000 Free-plan messages, and in-app can't be sandboxed.
6. **Workflows as code or dashboard-only.** API triggers run the last committed workflow version. Should workflow definitions live in the repo through the Knock CLI (`.knock/`), so the spec can name them? Otherwise they live only in the dashboard.
7. **Trigger failure inside a request.** With SDK defaults (60 s timeout, 2 retries), a Knock outage can stall the action that triggered a Notification. Should triggers be fire-and-forget with logging, use short `timeout` and `maxRetries` with an `Idempotency-Key`, or go through an outbox?
8. **What a string recipient does when never identified.** This is unconfirmed (§2). Should the adapter always inline-identify `{ id, name, email }` to avoid the question, given that it also keeps Knock's copy of the person current?
9. **Hidden-tab gap.** The socket parks 30 s after a tab is hidden, and the client source shows no refetch on rejoin. Does Knock's React layer refetch when the tab becomes visible, or does Cadence need to? (Shared with the UI research ticket.)
10. **Data sent to the browser.** By default the feed API returns all trigger `data`, plus the actor's and recipient's custom properties, to the person's browser. Does any planned Notification carry data that person shouldn't see? If so, use the per-environment response filter or send less.
