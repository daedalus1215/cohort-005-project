# Does Knock behave as its source suggests when tried against our account?

Research for [#13](https://github.com/daedalus1215/cohort-005-project/issues/13), a child of the map [#1](https://github.com/daedalus1215/cohort-005-project/issues/1) "In-app Notifications in Cadence". Run on 2026-11-28 against the Knock account from [#5](https://github.com/daedalus1215/cohort-005-project/issues/5), using the keys in Cadence's `.env`. The baseline is the earlier research, which read Knock's docs and source but ran nothing: [How Knock delivers in-app Notifications](https://github.com/daedalus1215/cohort-005-project/blob/research/knock-in-app-delivery/docs/research/knock-in-app-delivery.md) ("delivery note") and [What Knock gives us to draw the feed in React](https://github.com/daedalus1215/cohort-005-project/blob/research/knock-react-feed-ui/docs/research/knock-react-feed-ui.md) ("UI note").

Each answer is marked:

- **observed**: I ran it against the account. The exact call and what came back are given.
- **read**: from docs or source, with a link.
- **not settled**: neither settles it. The note says what would.

The probe scripts and their raw output are in [`knock-account-checks/`](knock-account-checks/). Their output redacts keys and the feed channel id.

## Answer first

- **Blocker: the keys reach an environment without `wayfinder-probe`.** Every trigger returned `404 workflow_missing`. That environment also had 0 users and 0 messages before I started. The keys are valid and both belong to that one environment, so I could not create a single feed message. Questions 2 and 3, and the catch-up half of question 1, are **not settled** for that reason. The probes for them are written and ready to rerun (see [What would settle the rest](#what-would-settle-the-rest)). *(observed, [§0](#0-the-keys-reach-an-environment-without-the-workflow))*
1. **Hidden tab.** **Observed:** the socket closes 30.1 s after the tab is hidden. It reopens and rejoins the feed channel as soon as the tab is visible again. Becoming visible triggers **no** feed fetch, and the rejoin reply carries no data. **Not settled:** whether Notifications that arrived meanwhile show up without a reload, because no message could be sent. The source says they'd arrive only with the next `new-message` or a reload ([§1](#1-a-hidden-tab-and-notifications-that-arrive-meanwhile)).
2. **HTML escaping of trigger data in `body`.** **Not settled.** No message could be rendered, and Knock's docs say nothing about escaping. `NotificationCell` injects the rendered HTML with `dangerouslySetInnerHTML` ([§2](#2-is-trigger-data-html-escaped-in-the-rendered-body)).
3. **Server-side interacted → `read_at`.** **Not settled.** No message was available to mark. The docs point both ways: the OpenAPI example for `PUT /v1/messages/{id}/interacted` returns `read_at: null`, but the feed docs say a click marks an item read, and Knock's own cell only calls `interacted` ([§3](#3-does-marking-a-message-interacted-from-the-server-also-set-read_at)).
4. **"Powered by Knock".** **Observed:** only the prebuilt `NotificationFeed` renders the footer. It does so because `GET …/feeds/{channel}/settings` returns `branding_required: true` on this account. A headless list on the same feed client renders none, and nothing in the API enforces one. **Read:** Knock's Terms of Service contain no attribution clause. The pricing page lists "Remove Knock branding: No" for Free but doesn't say what it covers. **Not settled:** whether Knock *expects* branding in a headless UI, which only Knock can answer ([§4](#4-does-the-free-plans-powered-by-knock-footer-apply-to-a-headless-ui)).
5. **Server-rendering `KnockProvider`.** **Observed: yes.** `renderToString` in Node sent `PUT /v1/users/{id}` with the public key once per render (3 renders gave 3 PUTs) and created the user in Knock. `user={{ id }}` alone sends `PUT` with `{}` and creates an empty user. `enabled={false}`, `identificationStrategy="skip"` and the deprecated `userId="…"` send nothing ([§5](#5-does-server-rendering-knockprovider-send-put-v1usersid-from-node)).
- **Enhanced security mode is off** in the keys' environment. **Observed:** the public key with no user token read feeds and users, and created users from the browser and from Node.
- **Messages sent: 0.** Every trigger was rejected before a run started.

## Setup

| | Version |
| --- | --- |
| `@knocklabs/node` | 1.41.1 |
| `@knocklabs/client` | 0.23.1 |
| `@knocklabs/react` | 0.15.1 (with `@knocklabs/react-core` 0.17.1, `phoenix` 1.8.9) |
| `react`, `react-dom` | 19.2.8 |
| `playwright-core` | 1.65.1, driving Chromium 158.0.8127.36 (Arch Linux ARM, aarch64), headless |
| `esbuild` | 0.28.2, to bundle the test page |
| Node | v26.13.1 |

Everything was installed in a scratch directory, not in Cadence's `package.json`. The installed `@knocklabs/client` and `react-core` source files cited below are byte-identical to `knocklabs/javascript` at [`f24c79f`](https://github.com/knocklabs/javascript/tree/f24c79feebed3d817d7145c379ff3c8fd5ee8cae), the commit the UI note read. I compared them by fetching each file at that commit.

Each probe runs as `node --env-file=<Cadence's .env> <probe>.mjs`. The keys are loaded into that process only.

## 0. The keys reach an environment without the workflow

What I ran (`p0-baseline.mjs`, `p0b-env.mjs`, `p0c-env.mjs`, `p0d-env.mjs`, `p0e-same-env.mjs`; output in `output/out-p0*.txt`):

| Call | Result |
| --- | --- |
| `POST /v1/workflows/wayfinder-probe/trigger` (secret key) | `404 {"code":"workflow_missing","message":"The workflow you specified was not found in this environment. Make sure you commit the workflow before trying to invoke it…"}` |
| Same with `wayfinder_probe`, `wayfinderprobe`, `Wayfinder-Probe`, `wayfinder-probe-1` | `404 workflow_missing` each |
| `GET /v1/messages` (secret) | `200`, `page_info.total_count: 0` |
| `GET /v1/users` (secret), before any probe ran | `200`, `total_count: 0` |
| `GET /v1/tenants`, `GET /v1/objects/projects` (secret) | `200`, `total_count: 0` |
| `GET /v1/users/{probe}/feeds/{KNOCK_FEED_CHANNEL_ID}` (public) | `200`, so the channel id is valid |
| `GET /v1/users/{probe}/feeds/00000000-0000-0000-0000-000000000000` (public) | `400 channel_invalid` |
| `PUT /v1/users/wayfinder-probe-envcheck` (secret), then `GET` it (public) | `200` then `200`: both keys belong to the same environment |

So the keys work, the channel id works, and both keys point at the same environment. In that environment no workflow `wayfinder-probe` is committed, and nothing has ever been sent.

**Most likely cause:** the `.env` keys are the **Production** environment's, while `wayfinder-probe` was committed in **Development**.
- Accounts start with production only, and committed workflows have to be promoted to reach it. ([Environments](https://docs.knock.app/version-control/environments))
- With environments on, dashboard members are identified as users in development. ([Users FAQ](https://docs.knock.app/concepts/users), as cited by the delivery note §2) An empty user list fits production.
- The other reading is Development keys with `wayfinder-probe` saved but never committed, and the successful run made from the dashboard test runner, which uses the saved version ([Testing workflows](https://docs.knock.app/send-notifications/testing-workflows)). But a test run would have left a message and a recipient behind, and there are none.

I can't tell environments apart from the API: no response header or endpoint names the environment, and `GET /v1/whoami` is `404`.

**What settles it:** in the Knock dashboard, open **Developers > API keys** in the Development environment and check that its keys are the ones in `.env`. Then check that `wayfinder-probe` shows as committed there.

## 1. A hidden tab, and Notifications that arrive meanwhile

**How the tab was hidden.** First I tried a real background tab, in two ways: a second tab brought to the front with Playwright, and a second tab in the same window activated over CDP (`Target.createTarget` with `newWindow: false`, then `Target.activateTarget`). I also tried minimising the window over CDP (`Browser.setWindowBounds` with `windowState: "minimized"`). I tried each one in the system Chromium 158 and in Playwright's cached Chromium 151, both headless. In every case `document.visibilityState` stayed `"visible"` and no `visibilitychange` fired (`vis-test.mjs`, `vis-test2.mjs`). There's no X server or Xvfb here to run headful.

So the page overrides `document.hidden` and `document.visibilityState` with getters, then dispatches `visibilitychange`. Knock's `PageVisibilityManager` reads only `document.hidden` and listens for that event ([`pageVisibility.ts`](https://github.com/knocklabs/javascript/blob/f24c79feebed3d817d7145c379ff3c8fd5ee8cae/packages/client/src/pageVisibility.ts)).
- **What it shows:** the socket was watched through CDP `Network.webSocket*` events, so what Knock's client does to the real connection is observed. Only the hiding is simulated.
- **What it can't show:** Chrome's timer throttling in real background tabs, which could make the 30 s timer fire later; tab freezing or discarding under Memory Saver, which would stop the page's JS entirely; and OS sleep.

**The page** (`page/page.jsx`, driven by `q1-hidden-tab.mjs`) renders:
- `KnockProvider` with `user={{ id: "wayfinder-probe-q1", name }}`, wrapping `KnockFeedProvider`
- Knock's prebuilt `NotificationFeed`
- a headless list from `useKnockFeed().useFeedStore`

It's served from `http://127.0.0.1`. The public key reaches the page at runtime through `page.addInitScript`, so it's never in a file.

**Observed timeline** (`output/out-q1-run1.txt`; seconds from start):

| t | Event |
| --- | --- |
| 0.3 | `PUT /v1/users/wayfinder-probe-q1` (inline identify from the browser), `POST /v1/sockets/connect`, `GET …/feeds/{channel}/settings`, `GET …/feeds/{channel}` |
| 0.6 | websocket created to `api.knock.app/ws/v1/websocket` |
| 0.8 | handshake `101`; sent `phx_join` on `feeds:{channel}:wayfinder-probe-q1` with `{"client_…":{"archived":"exclude","mode":"compact"}}`; received `phx_reply {"status":"ok","response":{}}` |
| 4.0 | M1 trigger → `404 workflow_missing` (see §0). Tab hidden. |
| 34.1 | **websocket closed, 30.1 s after hiding** |
| 49.6 | tab visible again; **a new websocket was created at once**, with no new `POST /v1/sockets/connect`, so the cached signed URL was reused |
| 49.8–49.9 | handshake `101`; `phx_join` sent again with the same params; `phx_reply {"status":"ok","response":{}}` |
| 49.9–70.4 | **no HTTP request of any kind**, and in particular no feed fetch. The store was unchanged. |

**What this confirms from the earlier research:**
- The 30 s disconnect and the reconnect on visible are real, with `disconnectOnPageHidden` at its default ([`api.ts`](https://github.com/knocklabs/javascript/blob/f24c79feebed3d817d7145c379ff3c8fd5ee8cae/packages/client/src/api.ts), [`pageVisibility.ts`](https://github.com/knocklabs/javascript/blob/f24c79feebed3d817d7145c379ff3c8fd5ee8cae/packages/client/src/pageVisibility.ts)).
- The socket topic and the `POST /v1/sockets/connect` step match the delivery note §3.
- **Nothing refetches on rejoin, and the React layer adds no refetch.** `KnockFeedProvider` was mounted in this run, and its only route to new items is `onNewMessageReceived`, which fetches items newer than the current head ([`feed.ts`](https://github.com/knocklabs/javascript/blob/f24c79feebed3d817d7145c379ff3c8fd5ee8cae/packages/client/src/clients/feed/feed.ts)). The socket manager just rejoins ([`socket-manager.ts`](https://github.com/knocklabs/javascript/blob/f24c79feebed3d817d7145c379ff3c8fd5ee8cae/packages/client/src/clients/feed/socket-manager.ts)).

**Not settled:** whether a Notification sent while the socket was parked shows up after the tab returns. M2 could not be sent, so the server had nothing to push on rejoin, and this run can't show whether Knock's server sends a `new-message` when a channel rejoins after missing one.

Given the observed silence on rejoin, the source predicts this: the item stays missing until the next `new-message` arrives (that fetch brings in everything newer than the head, M2 included) or something calls `feedClient.fetch()`. The probe is written to check this. It sends M2 while the socket is closed, waits 30 s after the tab is visible, then sends M3 and checks whether M2 arrives along with it.

## 2. Is trigger data HTML-escaped in the rendered `body`?

**Not settled.** `q2-escaping.mjs` sends two messages and then reads the feed as the browser does (public key), in `compact` and `rich` mode, plus `GET /v1/messages/{id}/content`. The two payloads:
- `data.text` = `<script>alert(1)</script> <img src=x onerror=alert(2)> <b>bold</b> & "dq" 'sq'`
- a Markdown payload with a `javascript:` link

Both triggers returned `404 workflow_missing` (`output/out-q2.txt`).

**Read:**
- Knock's full docs text ([llms-full.txt](https://docs.knock.app/llms-full.txt), fetched 2026-11-28) has no mention of escaping, sanitising or XSS for in-app templates or Liquid output. The only XSS mention is a guides example that renders guide HTML with `v-html` and suggests DOMPurify.
- `NotificationCell` puts the `body` block's `rendered` HTML into the page with `dangerouslySetInnerHTML` (UI note, "NotificationCell"). Until this is observed, treat trigger data that reaches the `body` as unescaped.

## 3. Does marking a message interacted from the server also set `read_at`?

**Not settled.** `q3-interacted.mjs` triggers three messages and marks each one interacted a different way, then reads it back:
- (a) `@knocklabs/node` `messages.markAsInteracted` (`PUT /v1/messages/{id}/interacted`, secret key)
- (b) `POST /v1/messages/batch/interacted` with the secret key
- (c) `@knocklabs/client` `feed.markAsInteracted` with the public key, which is the call Knock's cell makes on click

Each is read back with `messages.get` and the feed metadata. The triggers returned `404 workflow_missing` (`output/out-q3.txt`).

**Read: the sources disagree.**
- **Suggests no:** the OpenAPI spec's example response for `PUT /v1/messages/{message_id}/interacted` shows `"interacted_at": "2025-01-01T00:03:00Z"`, `"read_at": null` and `"engagement_statuses": ["seen", "interacted"]`. The endpoint's description doesn't mention read ([openapi.json](https://docs.knock.app/openapi.json), [Mark message as interacted](https://docs.knock.app/api-reference/messages/mark_as_interacted)).
- **Suggests yes:**
  - The in-app feeds page says users "can mark an individual item as read by clicking on it" ([In-app feeds: how the feed uses status](https://docs.knock.app/integrations/in-app/feeds)). Yet the prebuilt `NotificationCell` calls only `markAsInteracted`, never `markAsRead`, and the client sends that as `POST /v1/messages/batch/interacted` (installed `NotificationCell.mjs`; [`clients/messages/index.ts`](https://github.com/knocklabs/javascript/blob/f24c79feebed3d817d7145c379ff3c8fd5ee8cae/packages/client/src/clients/messages/index.ts)). The client sets `read_at` only optimistically ([`feed.ts`](https://github.com/knocklabs/javascript/blob/f24c79feebed3d817d7145c379ff3c8fd5ee8cae/packages/client/src/clients/feed/feed.ts)). For the documented behaviour to survive a refetch, the server would have to set `read_at` on `interacted`. That is an inference.
  - For guides, Knock defines `read_at` as "When the message was last read or interacted with" ([Guide engagement](https://docs.knock.app/in-app-ui/guides/handling-engagement)).
- Knock's status hierarchy ranks `interacted` above `read` ([Step conditions: multiple messages](https://docs.knock.app/designing-workflows/step-conditions)). It doesn't say whether one sets the other.

## 4. Does the Free plan's "Powered by Knock" footer apply to a headless UI?

**Observed:**
- `GET /v1/users/{id}/feeds/{channel}/settings` with the public key returned `{"features":{"branding_required":true}}`. It did so for a user who had never been identified (`output/out-p0.txt`) and for the test page's user (`output/out-q1-run1.txt`).
- On the test page, the prebuilt `NotificationFeed` rendered `.rnf-notification-feed__knock-branding` with the text "Powered by Knock". It links to `https://knock.app?utm_source=powered-by-knock&utm_medium=referral&utm_campaign=knock-branding-feed`, as shown in `output/out-q1-page.png`.
- The headless list rendered from the same `KnockFeedProvider` store had no footer, and no other element on the page said "Powered by Knock".
- Nothing in the API refuses a feed read when the footer is missing: the feed `GET` returned `200` either way.

**Read:**
- The footer is a rendering choice inside one component. Only `NotificationFeed` calls `useFeedSettings`, and it renders the link when `branding_required` is true ([`useFeedSettings.ts`](https://github.com/knocklabs/javascript/blob/f24c79feebed3d817d7145c379ff3c8fd5ee8cae/packages/react-core/src/modules/feed/hooks/useFeedSettings.ts), [`NotificationFeed.tsx`](https://github.com/knocklabs/javascript/blob/f24c79feebed3d817d7145c379ff3c8fd5ee8cae/packages/react/src/modules/feed/components/NotificationFeed/NotificationFeed.tsx)). A headless UI never fetches the setting.
- Knock's [Terms of Service](https://knock.app/legal/terms-of-service) (last updated March 4, 2026) contain no attribution or "Powered by" requirement. The closest clauses say:
  - **Trademarks:** "Nothing in these Terms of Service or the Service should be construed as granting … any license or right to use any of Knock Trademarks displayed on the Service, without our prior written permission".
  - **Service Content:** "Except as expressly authorized by Knock, you agree not to modify, copy, frame, scrape, rent, lease, loan, sell, distribute, or create derivative works based on the Service or the Service Content".
- The React packages are MIT-licensed (`license` field of `@knocklabs/react` 0.15.1 and `@knocklabs/react-core` 0.17.1).
- [Pricing](https://knock.app/pricing) lists "Remove Knock branding" under In-app feeds as **No** on Free and **Yes** on Starter and Enterprise, with no description of what it covers. The docs mention "Powered by Knock" only for email layouts ([llms-full.txt](https://docs.knock.app/llms-full.txt), template editor FAQ).

**Not settled:** whether Knock considers a Free-plan headless feed that omits the footer to be within its plan terms. Nothing published says so either way. Asking Knock would settle it.

## 5. Does server-rendering `KnockProvider` send `PUT /v1/users/:id` from Node?

**Observed: yes.** `q5-ssr.mjs` wraps `globalThis.fetch` before `@knocklabs/react` loads, because the client binds `fetch` when its API client is built ([`api.ts`](https://github.com/knocklabs/javascript/blob/f24c79feebed3d817d7145c379ff3c8fd5ee8cae/packages/client/src/api.ts)). It then calls `renderToString(<KnockProvider apiKey={pk} …><KnockFeedProvider feedId={channel}><NotificationIconButton/><NotificationFeed/></KnockFeedProvider></KnockProvider>)`, waits 3 s, and asks Knock with the secret key whether the user exists. Each user was deleted first and confirmed `404` (`output/out-q5.txt`).

| `KnockProvider` props | Requests from the render (public key) | User in Knock afterwards |
| --- | --- | --- |
| `user={{ id, name: "SSR probe A" }}` (default `identificationStrategy: "inline"`) | `PUT /v1/users/wayfinder-probe-ssr-a` body `{"name":"SSR probe A"}` → `200` | **created**, `name: "SSR probe A"` |
| `user={{ id }}` | `PUT /v1/users/wayfinder-probe-ssr-b` body `{}` → `200` | **created**, no properties |
| `userId="…"` (deprecated) | none | not created |
| `user={{ id, name }}` `enabled={false}` | none | not created |
| `user={{ id, name }}` `identificationStrategy="skip"` | none | not created |
| variant A rendered 3 more times | 3 × `PUT` | — |

- In Node 26 `typeof window` is `"undefined"` but `typeof WebSocket` is `"function"`. The client's socket guard checks both ([`api.ts`](https://github.com/knocklabs/javascript/blob/f24c79feebed3d817d7145c379ff3c8fd5ee8cae/packages/client/src/api.ts)), so no socket opened and no `/v1/sockets/connect` was called.
- The server HTML (2,909 characters, the same for every variant) holds the bell but no footer. `useFeedSettings` runs in an effect, so the settings were never fetched during the render, and no feed `GET` was made either.
- The process exited straight after the last render, so no timer was left running (no `userToken` was passed, so no refresh timer).
- This confirms the UI note's source reading ([`useAuthenticatedKnockClient.ts`](https://github.com/knocklabs/javascript/blob/f24c79feebed3d817d7145c379ff3c8fd5ee8cae/packages/react-core/src/modules/core/hooks/useAuthenticatedKnockClient.ts), [`knock.ts`](https://github.com/knocklabs/javascript/blob/f24c79feebed3d817d7145c379ff3c8fd5ee8cae/packages/client/src/knock.ts)). It adds that an id-only `user` object still identifies, creating an empty user.

## Other things the probes showed

These are side checks that bear on other tickets (`p6-failures.mjs`, `output/out-p6.txt`, and §0).

- **Enhanced security mode is off** in the keys' environment (observed):
  - The public key with no `X-Knock-User-Token` read a feed (`200`) and a user (`200`).
  - It created users with `PUT /v1/users/{id}`, from the browser (§1) and from Node (§5).
  - If these are Production keys (§0), production runs with it off too.
- **Reading an unknown user's feed** with the public key returns `200`, `entries: []`, and does **not** create the user: a `GET` with the secret key returned `404` afterwards (observed). This matches the delivery note §2.
- **`new Knock()` without options throws** `KnockError: The KNOCK_API_KEY environment variable is missing or empty…` (observed). Cadence's `.env` names the secret `KNOCK_SECRET_API_KEY`, so an adapter must pass `apiKey` explicitly. It must also only build the client when the key is set (delivery note §8).
- **A trigger for a workflow that isn't committed fails at once and isn't retried.** The SDK threw `NotFoundError`, `status 404`, `error.code "workflow_missing"`, after one request (observed). The run itself is asynchronous, but the workflow key is checked before the trigger returns.
- **The Node SDK's retries are quick, and idempotent by default** (observed against a local HTTP server):
  - A `503` got 3 attempts (`X-Stainless-Retry-Count` 0, 1, 2), about 0.46 s then 0.8 s apart. The SDK threw `InternalServerError` after about 1.25 s.
  - A refused port threw `APIConnectionError` after about 1.3 s.
  - Every non-GET request carries an `Idempotency-Key: stainless-node-retry-<uuid>` that stays the same across retries ([`client.ts`](https://github.com/knocklabs/knock-node/blob/v1.41.1/src/client.ts), `defaultIdempotencyKey`), and Knock honours that header on trigger ([Idempotent requests](https://docs.knock.app/api-reference/overview/idempotent-requests)). So SDK retries of a trigger shouldn't double-send.
  - A connection that hangs (60 s timeout per attempt) was **not** tested.
- **The test seam works.** `new Knock({ apiKey, baseURL: "http://127.0.0.1:<port>" })` sent `POST /v1/workflows/wayfinder-probe/trigger` to a plain local HTTP server (observed):
  - with `Authorization: Bearer …`
  - with the body `{"recipients":[{"id":"user_42","name":"Liam"}],"actor":"user_7","data":{"refundRequestId":913}}`
  - and the SDK accepted `{"workflow_run_id":"…"}` in return

  A local fake of the few endpoints Cadence uses is enough for tests, with no SDK mocking.

## Contradictions with the earlier research, and surprises

Nothing that ran contradicts the delivery note or the UI note. Where they made a claim that could be run, it held:
- the 30 s park and reconnect on visible
- `POST /v1/sockets/connect`
- the `feeds:<channel>:<user>` topic
- no refetch on rejoin
- no socket during SSR
- the SSR `PUT`
- `enabled={false}` and `"skip"` stopping it
- an empty feed for an unknown user
- `new Knock()` throwing without a key

Additions and surprises:

1. **The `.env` keys don't reach the workflow** (§0). This is the main surprise. It's the risk [#8](https://github.com/daedalus1215/cohort-005-project/issues/8) and [#12](https://github.com/daedalus1215/cohort-005-project/issues/12) are about: a workflow that lives in one environment and is triggered from another fails with `404 workflow_missing` on every send.
2. **An id-only `user` still identifies.** `user={{ id }}` sends `PUT {}` and creates an empty user. Only the deprecated string `userId`, `enabled={false}` or `"skip"` avoid it (§5).
3. **The Node SDK adds an idempotency key by itself**, and the same key goes on every retry. The delivery note only said the trigger endpoint *accepts* one.
4. **Retries are fast** (about 1.3 s in total for `503` or a refused connection). The multi-minute stall the delivery note warns about comes only from a hanging connection hitting the 60 s per-attempt timeout.
5. **A reconnect reuses the cached signed socket URL**, so no second `POST /v1/sockets/connect` is made.
6. **The visibility handling can't be seen in headless Chromium without simulating it.** Any automated test of tab-return behaviour will need the same override.

**Bearing on [#6](https://github.com/daedalus1215/cohort-005-project/issues/6) (Notifications and read state: Knock or `data.db`):**
- With enhanced security mode off, any browser holding the public key can create or overwrite any Knock user (observed). Per the docs it can also change any user's message statuses (delivery note §4). Read state held in Knock is only as trustworthy as that mode.
- Question 3 is still the deciding unknown for mirroring read state from Cadence's server. If `interacted` doesn't set `read_at` server-side, the server must call `read` explicitly.
- Whichever store wins, a tab returning from the background doesn't catch up by itself (observed: no fetch on visible). The feed UI will want a `visibilitychange` → `feedClient.fetch()` hook, or its own equivalent if `data.db` is the store.

## What would settle the rest

1. Put the Development environment's keys in `.env`, or commit `wayfinder-probe` in the environment the current keys belong to (§0). Both are dashboard steps.
2. Rerun these probes. They send about 8 messages in all:
   - `q1-hidden-tab.mjs` (Q1 catch-up; 3 messages)
   - `q2-escaping.mjs` (Q2; 2 messages)
   - `q3-interacted.mjs` (Q3; 3 messages)
   - `cleanup.mjs` (no messages)
3. Q4's open part needs an answer from Knock about whether "Remove Knock branding" covers headless feeds.
4. A hanging-connection test (SDK `timeout`), if [#11](https://github.com/daedalus1215/cohort-005-project/issues/11) wants the worst-case stall measured.

## Knock users created

All of these are in the keys' environment, and all were deleted. `cleanup.mjs` confirmed each one returns `404`, and `GET /v1/users` returned `total_count: 0` at the end (`output/out-cleanup.txt`).

- `wayfinder-probe-envcheck`: created with the secret key in §0 and deleted in the same script
- `wayfinder-probe-q1`: created by the browser's inline identify in §1
- `wayfinder-probe-ssr-a`, `wayfinder-probe-ssr-b`: created by the SSR render in §5. They were created, deleted and created again when §5 was rerun.

These ids were used but never created, because the trigger failed or the call doesn't identify. Each was confirmed `404`:
- `-none`, `-bare`, `-keycheck`, `-unused`, `-q2`, `-q3`
- `-ssr-c`, `-ssr-d`, `-ssr-e`

## Sources

Observed: the probe scripts and their output in [`knock-account-checks/`](knock-account-checks/), run 2026-11-28.

Knock docs and site, fetched 2026-11-28:
- [llms-full.txt](https://docs.knock.app/llms-full.txt) (full docs text, searched for escaping, branding and interacted)
- [openapi.json](https://docs.knock.app/openapi.json) (`/v1/messages/{message_id}/interacted` and `/v1/messages/batch/interacted`)
- [Mark message as interacted](https://docs.knock.app/api-reference/messages/mark_as_interacted)
- [Message statuses](https://docs.knock.app/send-notifications/message-statuses)
- [In-app feeds](https://docs.knock.app/integrations/in-app/feeds)
- [Guide engagement](https://docs.knock.app/in-app-ui/guides/handling-engagement)
- [Step conditions](https://docs.knock.app/designing-workflows/step-conditions)
- [Environments](https://docs.knock.app/version-control/environments)
- [Users](https://docs.knock.app/concepts/users)
- [Testing workflows](https://docs.knock.app/send-notifications/testing-workflows)
- [Idempotent requests](https://docs.knock.app/api-reference/overview/idempotent-requests)
- [Pricing](https://knock.app/pricing)
- [Terms of Service](https://knock.app/legal/terms-of-service)

Knock source, `knocklabs/javascript` at [`f24c79f`](https://github.com/knocklabs/javascript/tree/f24c79feebed3d817d7145c379ff3c8fd5ee8cae) (identical to the installed packages):
- [`packages/client/src/pageVisibility.ts`](https://github.com/knocklabs/javascript/blob/f24c79feebed3d817d7145c379ff3c8fd5ee8cae/packages/client/src/pageVisibility.ts)
- [`packages/client/src/api.ts`](https://github.com/knocklabs/javascript/blob/f24c79feebed3d817d7145c379ff3c8fd5ee8cae/packages/client/src/api.ts)
- [`packages/client/src/knock.ts`](https://github.com/knocklabs/javascript/blob/f24c79feebed3d817d7145c379ff3c8fd5ee8cae/packages/client/src/knock.ts)
- [`packages/client/src/clients/feed/feed.ts`](https://github.com/knocklabs/javascript/blob/f24c79feebed3d817d7145c379ff3c8fd5ee8cae/packages/client/src/clients/feed/feed.ts)
- [`packages/client/src/clients/feed/socket-manager.ts`](https://github.com/knocklabs/javascript/blob/f24c79feebed3d817d7145c379ff3c8fd5ee8cae/packages/client/src/clients/feed/socket-manager.ts)
- [`packages/client/src/clients/messages/index.ts`](https://github.com/knocklabs/javascript/blob/f24c79feebed3d817d7145c379ff3c8fd5ee8cae/packages/client/src/clients/messages/index.ts)
- [`packages/react-core/src/modules/feed/hooks/useFeedSettings.ts`](https://github.com/knocklabs/javascript/blob/f24c79feebed3d817d7145c379ff3c8fd5ee8cae/packages/react-core/src/modules/feed/hooks/useFeedSettings.ts)
- [`packages/react-core/src/modules/core/hooks/useAuthenticatedKnockClient.ts`](https://github.com/knocklabs/javascript/blob/f24c79feebed3d817d7145c379ff3c8fd5ee8cae/packages/react-core/src/modules/core/hooks/useAuthenticatedKnockClient.ts)
- [`packages/react/src/modules/feed/components/NotificationFeed/NotificationFeed.tsx`](https://github.com/knocklabs/javascript/blob/f24c79feebed3d817d7145c379ff3c8fd5ee8cae/packages/react/src/modules/feed/components/NotificationFeed/NotificationFeed.tsx)

`knocklabs/knock-node` at `v1.41.1`:
- [`src/client.ts`](https://github.com/knocklabs/knock-node/blob/v1.41.1/src/client.ts) (`defaultIdempotencyKey`, the `KNOCK_API_KEY` check)
