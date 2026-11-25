# What Knock gives us to draw the feed in React

Research for [#3](https://github.com/daedalus1215/cohort-005-project/issues/3), a child of the map [#1](https://github.com/daedalus1215/cohort-005-project/issues/1) "In-app Notifications in Cadence". Researched 2026-11-25. This note covers the React/UI side only. Server-side delivery, auth and storage are researched separately.

Versions on npm today: `@knocklabs/react` **0.15.1** (published 2026-11-06), which depends on `@knocklabs/react-core` **0.17.1** and `@knocklabs/client` **0.23.1** ([npm-react], [registry-react]). Source claims below are read at the commit npm records for 0.15.1 (`gitHead f24c79f`). Knock's `main` branch is one patch ahead (0.15.2, dependency bumps only). I compared the files cited here against `main` and found no behavioural changes.

## Answer first

- **Prebuilt components.** `@knocklabs/react` ships three feed components ([docs-react-overview]):
  - `NotificationIconButton`: a bell with a badge. The badge counts **unseen** by default and can count `"unread"` or `"all"` instead. It shows `9+` above nine ([src-iconbutton], [src-badge], [src-utils]).
  - `NotificationFeedPopover`: a Popper.js popover, `bottom-end` by default. It closes on Escape and on a click outside. By default it marks everything as seen when it opens ([src-popover], [src-visible]).
  - `NotificationFeed`: the bare list, used for a full-page feed. It has a header with an All/Unread/Read filter and "Mark all as read", infinite scroll, an empty state, and an archive (X) button on each row ([src-feed], [src-header], [src-archive]).

  Each part can be swapped through props: `renderItem`, `renderHeader`, `EmptyComponent`, `renderLoading`, `onNotificationClick`, `onNotificationButtonClick`, `onOpen`, `placement`, `formatTimestamp`. **There is no toast component.** Knock's toast page builds toasts on another toaster, using the feed's `items.received.realtime` event ([docs-toasts]). Cadence can do the same with its existing `sonner` Toaster.
- **Headless option.** Yes, and it is first-class. `@knocklabs/react-core` (re-exported by `@knocklabs/react`) provides:
  - `KnockProvider` and `KnockFeedProvider`
  - `useKnockFeed()`, which returns `{ feedClient, useFeedStore, colorMode }`
  - `useNotifications(knock, feedId, options)`
  - `useNotificationStore(feedClient, selector?)`, which returns `items`, `metadata` (`total_count`, `unread_count`, `unseen_count`), `networkStatus` and `pageInfo`

  The `Feed` client carries all the fetch, mark and event methods ([src-index], [src-feedprovider], [src-usenotifications], [src-usestore], [src-types], [docs-headless]). In a headless UI we have to call `feedClient.fetch()` and the mark-as-seen calls ourselves ([docs-headless], [docs-interactivity]).
- **Styling.** Plain CSS shipped as one file, `@knocklabs/react/dist/index.css`, which you must import ([docs-react-feed], [src-vite]). It defines about 90 `--rnf-*` CSS variables on `:root`. Every feed class has an `rnf-` prefix. Dark mode is a `colorMode="light" | "dark"` prop on `KnockFeedProvider`, not a CSS media query or a `.dark` class ([docs-styling], [src-theme], [src-feedprovider]). The components take **no `className` props**, so Tailwind utilities can't reach them. We can point the `--rnf-*` variables at Cadence's shadcn tokens (`var(--popover)`, `var(--border)`, ...). Some dark-mode colours are hard-coded rather than set through variables, so dark mode needs a few rule overrides ([src-feed-css], [src-cell-css]). Knock's CSS is not in a cascade layer, so it beats everything Tailwind v4 emits ([mdn-layer], [tw-preflight]).
- **React 19.** Supported. Peer ranges are `react` / `react-dom` `^17 || ^18 || ^19`. `next` and `@tanstack/react-router` are optional peers ([registry-react]). Resolving `@knocklabs/react@0.15.1` against Cadence's `package.json` gave no peer conflicts and a single React (19.2.8). It did add nested copies of `lucide-react` (0.544.0, and 1.80.0 under Telegraph); see [Versions and dependencies](#versions-and-dependencies).
- **Server rendering in React Router 8.** The components don't crash on the server, because browser globals are guarded ([src-api], [src-feedts]). But server rendering gains nothing: data is only fetched in effects, so the server HTML shows a bell with no badge and an empty feed. Server rendering also has a side effect. `KnockProvider` builds and authenticates the client **during render**, and with `user={{ id }}` and the default `identificationStrategy: "inline"` that fires `PUT /v1/users/:id` to Knock from the Node process on every server render ([src-useauth], [src-knock]). So in practice the feed should mount client-only: an after-hydration flag, or `enabled={false}` until mounted. Knock's only server-framework guidance is `"use client"` for Next.js ([docs-nextjs]). Nothing is documented for React Router.
- **State from the UI.** `Feed` exposes `markAsSeen` / `markAllAsSeen`, `markAsRead` / `markAllAsRead`, `markAsUnread`, `markAsUnseen`, `markAsInteracted`, `markAsArchived` / `markAllAsArchived` / `markAsUnarchived`. Each one updates the store optimistically, then calls the API ([src-feedts], [docs-feed-client]).
  - **Unseen** means the user hasn't seen the item in the feed yet. The default badge counts it, and opening the popover clears it.
  - **Unread** is cleared by clicking a row (`markAsInteracted`, which also sets `read_at` optimistically) or by "Mark all as read".
  - **Archived** items drop out of the list, because the default fetch uses `archived: "exclude"`.

  Sources: [docs-statuses], [src-popover], [src-cell], [src-feedts].

## Versions and dependencies

| Package | npm latest | Peer deps | Notes |
| --- | --- | --- | --- |
| `@knocklabs/react` | 0.15.1 | `react`, `react-dom` `^17 \|\| ^18 \|\| ^19`; `next` `^13–^16` (optional); `@tanstack/react-router` `^1` (optional) | Depends on `@popperjs/core`, `@radix-ui/react-dialog`, `@radix-ui/react-hover-card`, `lucide-react ^0.544.0` and about 12 `@telegraph/*` packages ([registry-react]). No `sideEffects` field in its `package.json` (checked in the published tarball). |
| `@knocklabs/react-core` | 0.17.1 | `react` `^17 \|\| ^18 \|\| ^19` | Depends on `@tanstack/react-store`, `swr`, `date-fns`. `sideEffects: false` ([registry-react-core]). |
| `@knocklabs/client` | 0.23.1 | none | Depends on `phoenix` (the websocket), `@tanstack/store`, `eventemitter2` ([registry-client]). |

Checked against Cadence (`react` ^19.2.7, `react-router` 8.3.0, `tailwindcss` ^4.1.13, `radix-ui` ^1.4.3, `lucide-react` ^0.563.0):

- No React Router peer exists, so React Router 8 is neither required nor checked.
- I resolved `npm install @knocklabs/react@0.15.1 --package-lock-only` on a copy of Cadence's `package.json` and lockfile. It finished without errors. React resolved to one copy (19.2.8). `lucide-react` resolved to three versions: Cadence's 0.563.0 at the root, 0.544.0 nested under `@knocklabs/react`, and 1.80.0 nested under six `@telegraph/*` packages.
- The **feed** components import only `react`, `@popperjs/core` and the Knock packages. Telegraph, lucide and Radix are pulled in by the Slack, Teams and guide modules (from the import list under `packages/react/src/modules/feed` and `core`). How much of that a production Vite build tree-shakes is not confirmed, because `@knocklabs/react` doesn't declare `sideEffects`.
- React 19 support arrived in `@knocklabs/react` 0.6.0 ("Support React 19 in React SDKs", [src-react-changelog]). In dev, Cadence runs under React Router's default `entry.client`, which wraps the app in `<StrictMode>`. `useNotifications` carries a FIXME: in strict mode it creates one extra feed client that is never disposed ([src-usenotifications]). This affects dev only.

## Prebuilt components

All of these need `KnockProvider` (props: `apiKey`, `user` or the deprecated `userId`, `userToken`, `onUserTokenExpiring`, `timeBeforeExpirationInMs`, `identificationStrategy`, `enabled`, `host`, `logLevel`, `i18n`, `branch`) wrapped around `KnockFeedProvider` (props: `feedId`, `colorMode`, `defaultFeedOptions`) ([src-knockprovider], [src-feedprovider], [docs-knock-provider], [docs-feed-provider]). Enhanced security mode needs `userToken` on **`KnockProvider`**, a JWT signed by our server with RS256 ([docs-security]). The React feed page says to pass it to `KnockFeedProvider` ([docs-react-feed]), but the source has no such prop on `KnockFeedProvider` ([src-feedprovider]).

### `NotificationIconButton` and `UnseenBadge` (the bell)

- It renders `<button class="rnf-notification-icon-button" aria-label="Open notification feed">` containing Knock's own bell SVG and an `UnseenBadge` ([src-iconbutton]).
- Props: only `onClick`, `badgeCountType` and a forwarded `ref`. You can't pass an icon, children, a label or a className.
- `UnseenBadge` is exported separately. It reads `metadata.unseen_count`, `unread_count` or `total_count` from the store, renders nothing at zero, and has `role="status"` with an aria-label such as "3 unseen notifications" ([src-badge], [src-utils]).
- **The bell does not fetch.** `useNotifications` only initialises the client and joins the socket ([src-usenotifications], [src-feedts]). The first fetch comes from `NotificationFeed`'s mount effect ([src-feed]). The popover pattern works because the popover is always mounted, hidden with `visibility: hidden` ([src-popover]). A bell on its own, such as a sidebar bell linking to a `/notifications` page, would stay at 0 until something calls `feedClient.fetch()` or a realtime message updates the counts.

### `NotificationFeedPopover`

- Props: `isVisible`, `onClose`, `buttonRef` (required), `onOpen`, `closeOnClickOutside` (default `true`), `placement` (any Popper placement, default `"bottom-end"`), plus every `NotificationFeed` prop ([src-popover], [docs-popover]).
- It is placed with `@popperjs/core` (`strategy: "fixed"`, 8px offset) at z-index 999, and it **renders inline (no portal)**. It has `role="dialog"`. Escape and an outside click call `onClose` ([src-visible]). I found no focus trap and no focus-return code.
- Default size: width 280–400px, height 400px. These are set through variables ([src-popover]).
- Default `onOpen`: `if (unseen_count > 0) feedClient.markAllAsSeen()` ([src-popover]). Override `onOpen` to mark as read instead, or to do nothing ([docs-react-feed]).

### `NotificationFeed` (full-page feed)

- Knock's "Inbox" page renders it as a whole page ([docs-inbox]). The overview calls it "a full-page list of notifications" ([docs-react-overview]).
- It contains:
  - A header: "Notifications", a native `<select>` filter (All / Unread / Read) and a "Mark all as read" button that is disabled when `unread_count` is 0 ([src-header], [src-markasread]).
  - A scrolling list that fetches the next page within 70px of the bottom.
  - A spinner, and an empty state ("No notifications yet" / "We'll let you know when we've got something new for you.").
  - Strings come from `en.ts`, and `KnockProvider`'s `i18n` prop overrides them ([src-feed], [src-en]).
- Props: `renderItem`, `renderHeader`, `EmptyComponent`, `renderLoading`, `onNotificationClick`, `onNotificationButtonClick`, `onMarkAllAsReadClick`, `initialFilterStatus`, `formatTimestamp` ([src-feed]).
- **Branding footer:** when the feed settings endpoint returns `features.branding_required`, the feed renders a "Powered by Knock" link at the bottom ([src-feed], [src-feedsettings]). Knock's pricing page lists "Remove Knock branding" as **No** on Free and **Yes** on Starter ($250/mo) and Enterprise ([pricing]).

### `NotificationCell` (one row)

- It shows an unread dot when `read_at` is null, an `Avatar` (initials or an image) for the first actor, the `body` block's **pre-rendered HTML** inserted with `dangerouslySetInnerHTML`, optional action buttons from an `actions` button_set block, the timestamp ("5 minutes ago"), and an archive X button with a tooltip ([src-cell], [src-archive]).
- Props: `item`, `onItemClick`, `onButtonClick`, `avatar`, `children` (extra content), `archiveButton`, `formatTimestamp` ([src-cell]).
- On click it **always** calls `feedClient.markAsInteracted(item, { type: "cell_click", action })` first. It then calls `onItemClick` if we passed one. Otherwise it waits 200ms and runs `window.location.assign(action_url)`, which is a full page load ([src-cell]). For React Router navigation, pass `onNotificationClick` and call `navigate()`.

### Toasts

"There are no out-of-the-box toast components in the `@knocklabs/react` library." The documented recipe subscribes with `feedClient.on("items.received.realtime", …)`, calls `toast.custom(...)` from `react-hot-toast` with `{ id: notification.id }`, and optionally calls `feedClient.markAsSeen(items)` ([docs-toasts]). `items.received.realtime` fires only for fetches triggered by the socket, not for page loads ([src-feedts]). Cadence already mounts `sonner`'s `<Toaster position="bottom-right" richColors closeButton />` in `app/routes/layout.app.tsx`. The same event can call sonner's `toast()`. Knock doesn't document sonner; this is an inference from the recipe.

## Headless

The same package exports everything needed to draw our own UI on Knock's data ([src-index]):

- `useKnockFeed()` inside `KnockFeedProvider` returns `{ knock, feedClient, useFeedStore, colorMode }`. `useFeedStore(selector?)` is a selector hook over the feed's TanStack store ([src-feedprovider], [src-usestore]).
- `useNotifications(knock, feedChannelId, options)` gives you a `Feed` without the provider. It disposes the client on unmount and re-creates it when the feed id or options change ([src-usenotifications], [docs-use-notifications]).
- `useNotificationStore(feedClient, selector?)` returns the `FeedStoreState`: `{ items, metadata: { total_count, unread_count, unseen_count }, pageInfo, networkStatus, loading }` ([src-usestore], [src-types]).
- `FeedItem` fields: `id`, `blocks` (markdown, text or button_set, each with `rendered` HTML), `actors`, `data`, `inserted_at`, `read_at`, `seen_at`, `interacted_at`, `archived_at`, `link_clicked_at`, `source`, `tenant` ([src-interfaces]).
- Fetch defaults to `mode: "compact"`. In compact mode, `data` drops nested arrays and objects and `actors` holds at most one actor. Pass `mode: "rich"` for the full payload ([src-interfaces], [docs-headless]).
- Feed options (`defaultFeedOptions` / `useNotifications` options): `page_size`, `status` (`unread | read | unseen | seen | all`), `archived` (`include | exclude | only`, default `exclude`), `source`, `tenant`, `has_tenant`, `workflow_categories`, `trigger_data`, `inserted_at_date_range`, `mode`, and `__experimentalCrossBrowserUpdates` ([src-interfaces]).
- `auto_manage_socket_connection` appears on the React feed page ([docs-react-feed]), but it was **removed** in client 0.21.2 ([src-client-changelog]). That docs page is stale on this point.
- Events: `feedClient.on/off` for `items.received.page`, `items.received.realtime`, `items.read`, `items.seen`, `items.archived`, `items.all_read`, etc. Wildcards `items.*` and `items.received.*` also work ([src-types], [docs-feed-client]).
- Knock's headless example leaves seen-marking, read-marking and archiving to us. It suggests `markAllAsSeen()` when the feed opens and `markAsSeen(item)` when an item scrolls into view ([docs-headless]).

## Styling

What Knock provides ([docs-styling], [docs-react-feed], [src-theme]):

- **CSS variables**: about 90 `--rnf-*` variables, all set on `:root`. They cover fonts, spacing, radii, shadows and greys, plus component variables such as `--rnf-notification-feed-popover-bg-color`, `--rnf-notification-cell-active-bg-color`, `--rnf-unseen-badge-bg-color`, `--rnf-notification-cell-unread-dot-bg-color` and `--rnf-avatar-size`.
- **Class names**: BEM-style, all prefixed `rnf-` (for example `rnf-notification-cell__unread-dot`). Knock says you may "completely replace Knock's CSS".
- **Colour mode**: `colorMode="dark"` on `KnockFeedProvider` adds `--dark` modifier classes (for example `rnf-notification-feed--dark`).
- **Bundled CSS**: `dist/index.css` is about 66 KB. It also contains the Slack, Teams, guide and Telegraph styles. Its selectors are class-scoped (`.rnf-*`, `.tgph-*`, `.rsk-*`, `.rtk-*`, `[data-knock-color-mode]`), with no element resets. It contains no `@layer` (from the published tarball).

Fit with Cadence (`app/app.css`: Tailwind v4, shadcn "new-york" tokens in oklch, `.dark` class on `<html>`; `app/components/ui/` has button, card, chart, input, label, select, skeleton, tabs and textarea, with no popover or dropdown yet):

- **No `className` hooks.** You can't style Knock's components with Tailwind utilities. The ways to restyle them are overriding `--rnf-*` variables, writing CSS against `.rnf-*` classes, or replacing parts through the `render*` props and `NotificationCell` `children`.
- **Variables map onto shadcn tokens.** For example, in `app.css`:

  ```css
  :root {
    --rnf-notification-feed-popover-bg-color: var(--popover);
    --rnf-notification-cell-active-bg-color: var(--accent);
    --rnf-notification-cell-border-bottom-color: var(--border);
  }
  ```

  Because Cadence's tokens already flip under `.dark`, these mappings follow dark mode without Knock's `colorMode`. But some light-mode colours aren't variables, such as the branding link hover `#f1f6fc` and the tooltip `#565a61`. Knock's `--dark` rules also hard-code values, such as `.rnf-notification-feed--dark { background-color: #2e2f34 }`. So the feed either stays on `colorMode="light"` with mapped variables, or gets `colorMode` driven from Cadence's theme plus overrides for those rules ([src-feed-css], [src-cell-css]). Cadence's theme is the `cadence-theme` key in localStorage, which `app/root.tsx` applies to `<html class="dark">`. Knock never reads that class.
- **Cascade layers.** Tailwind v4 places its output in native layers (`@layer theme, base, components, utilities`) ([tw-preflight]). "Styles that are not defined in a layer always override styles declared in named and anonymous layers" ([mdn-layer]). Knock's unlayered CSS therefore wins over Tailwind's. Knock's selectors are all `rnf-` classes, so that only matters where the two meet, such as Tailwind's preflight border and margin reset. `@import "…" layer(components)` puts third-party CSS in a layer ([mdn-layer], [tw-custom]). I haven't tested whether Tailwind v4's `@import` in `app.css` resolves `@knocklabs/react/dist/index.css` through the package `exports` map (the map does list `./dist/index.css`, [registry-react]).
- **Fonts.** Knock's font stack starts with `Inter`, which Cadence already loads ([src-theme]).
- **Radix overlap.** Cadence has `radix-ui` 1.4.3 installed, but `app/components/ui/` has no Popover yet. A mixed approach would render Knock's `NotificationFeed` inside a shadcn/Radix Popover instead of `NotificationFeedPopover`. That gives us Radix focus handling and a portal, but we would need to reproduce the popover's `markAllAsSeen` on open ourselves (inference from [src-popover]).

## Fit with React 19 and server rendering

- **React 19:** within the peer range, and no conflict when resolved against Cadence's lockfile (see [Versions and dependencies](#versions-and-dependencies)).
- **`"use client"`:** the published `dist/esm/index.mjs` starts with `"use client"` and an empty CSS stub, so the CSS must be imported separately ([src-index], [src-vite]). Cadence's `react-router.config.ts` has `ssr: true` and no RSC, so the directive has no effect here.
- **No crash on the server:** the client checks `typeof window` / `WebSocket` before creating a socket, `typeof document` before adding visibility listeners, and `typeof self` before creating a `BroadcastChannel`. A `Feed` built on the server has no socket manager, so `listenForUpdates` does nothing ([src-api], [src-feedts], [src-pagevis]).
- **No data on the server:** `NotificationFeed` fetches in `useEffect` and `useFeedSettings` loads in `useEffect`. Neither runs during server render, so the server HTML is the empty shell, with the bell showing no badge ([src-feed], [src-feedsettings]).
- **Side effects during server render:** `useAuthenticatedKnockClient` calls `new Knock()` and `knock.authenticate()` inside `useMemo`, which means during render ([src-useauth]). `authenticate()` then:
  - with `user` as an object and `identificationStrategy` left at `"inline"`, fires `PUT /v1/users/{id}` without awaiting it ([src-knock]). Rendered on the server, that is a Knock API call from Node on every request.
  - with `userToken` and `onUserTokenExpiring`, schedules a `setTimeout` refresh timer ([src-knock]). On the server, no unmount cleanup runs to clear it.

  Ways around this: render the Knock subtree only after hydration (React Router documents no `ClientOnly`; its `.client` modules are "`undefined` on the server", so they are only usable in effects and handlers, [rr-client-modules]); or keep the providers mounted with `enabled={false}` until mounted. In both cases `enabled={false}` means "no identify call, no API requests, and no websocket" ([src-knockprovider], [docs-knock-provider]). `identificationStrategy="skip"` also stops the PUT ([src-knock]).
- **DevUI user switching:** the `KnockFeedProvider` subtree is keyed on `knock.userId`, so a user switch remounts and refetches it. Switching `enabled` false→true behaves "like a login", and true→false clears the stores "like a logout" ([src-feedprovider], [src-useauth], [src-core-changelog]).

## State from the UI

What each status means ([docs-statuses]):

- **Seen**: "the message has been retrieved for display in the recipient's in-app feed at least once".
- **Read**: "opened and read by the recipient at least once".
- **Interacted**: "explicitly clicked on the notification cell".
- **Archived**: "archived by the recipient".
- Knock sets these automatically only for the in-app feed channel, through its React SDK.

Counts come from the store's `metadata`: `unseen_count`, `unread_count` and `total_count` ([src-types]). Realtime messages update them directly from the socket payload before the new items arrive ([src-feedts]).

What the prebuilt components do on their own:

| User action | Call | Effect |
| --- | --- | --- |
| Opens the popover | `markAllAsSeen()` (only if `unseen_count > 0`) | Sets `unseen_count` to 0 and `seen_at` on loaded items, then calls the bulk API ([src-popover], [src-feedts]). |
| Clicks a row | `markAsInteracted(item, {type: "cell_click"})` | Optimistically sets `read_at` and `interacted_at` and lowers `unread_count` ([src-cell], [src-feedts]). Whether the **server** also marks it read is not stated in the API reference ([docs-interacted-api]). |
| Clicks an action button | `markAsInteracted(item, {type: "button_click", …})` | Same as a row click ([src-cell]). |
| Clicks "Mark all as read" | `markAllAsRead()` | Sets `unread_count` to 0 and calls the bulk API ([src-markasread], [src-feedts]). |
| Clicks the row's X | `markAsArchived(item)` | Removes the item from the list when `archived` is `"exclude"` (the default) and lowers the counts ([src-archive], [src-feedts]). |

Every mark method checks `knock.isAuthenticated()` first and silently does nothing when there's no user ([src-feedts]).

Live updates in an open tab (client side; delivery itself is the sibling ticket's job):

- `KnockFeedProvider` calls `listenForUpdates()` for you. A new message updates the counts, then fetches the items newer than the current head and emits `items.received.realtime` ([src-usenotifications], [src-feedts]).
- **Hidden tabs disconnect.** By default the socket drops 30 s after the page becomes hidden and reconnects when it's visible again. The client option that controls this (`disconnectOnPageHidden`) isn't passed through by `KnockProvider` ([src-pagevis], [src-api], [src-useauth]).
- I found no refetch on rejoin in `socket-manager.ts`. So I could not confirm that items which arrived while a tab was hidden appear once it's visible again ([src-socket]).
- Other tabs of the same user can sync read and seen changes through a `BroadcastChannel`, but only with `__experimentalCrossBrowserUpdates: true` ([src-feedts]).

## Prebuilt vs headless for Cadence

| | Prebuilt (`NotificationIconButton` + `NotificationFeedPopover` / `NotificationFeed`) | Headless (`useKnockFeed` / `useNotificationStore` + shadcn/Radix) |
| --- | --- | --- |
| Effort | A few dozen lines. Header, filter, infinite scroll, empty state, archive, badge and mark-seen-on-open all come built in. | We build the list, empty state, pagination trigger, badge, filter and archive control, and wire up every `mark*` call. |
| Look | Knock's look, adjusted through `--rnf-*` variables and CSS overrides. Bell icon, native `<select>`, Popper popover and the X button are fixed unless replaced through `render*` props. Dark mode needs extra overrides. | Native Cadence: lucide `Bell`, `Button`, `Card`, Tailwind tokens, `.dark` for free. |
| Tailwind fit | No `className` props. Its unlayered CSS beats Tailwind's layers. Adds a 66 KB stylesheet, though it could be dropped once fully restyled. | Tailwind only, no Knock CSS. |
| Accessibility | Popover: `role="dialog"`, Escape and outside click close it. No portal, and no focus trap or focus return found. Rows are `div`s with `tabIndex=0` and Enter handling. | Radix Popover gives a focus trap and return, a portal and ARIA, if we add the shadcn `popover` component. |
| Navigation | We must pass `onNotificationClick`, or clicks reload the page with `window.location.assign`. | We choose: `navigate()` or `<Link>`. |
| Content | Renders Knock's pre-rendered `body` HTML. Templates live in Knock. | Free to ignore `blocks` and render from `item.data` in our own components. Needs `mode: "rich"` if `data` holds nested values. |
| Branding | "Powered by Knock" footer on the Free plan. | No footer is rendered (see Open questions on whether the terms still require it). |
| Upgrade risk | Coupled to Knock's markup and class names. Pre-1.0 package. | Coupled only to the hooks and store shape. Also pre-1.0. |

Middle paths exist. One is the prebuilt `NotificationFeed` with a custom `renderItem` and `renderHeader` inside a shadcn Popover. Another is our own bell reading `useFeedStore(s => s.metadata.unseen_count)` next to Knock's list.

## Open questions

For the feed prototype to answer:

1. **Client-only mount pattern.** Which pattern wraps the Knock subtree in `app/routes/layout.app.tsx`: an after-hydration flag, `enabled={hydrated && Boolean(userId)}`, or `identificationStrategy="skip"`? Does that avoid a hydration mismatch and the server-side `PUT /v1/users/:id`? I confirmed both from source only. I didn't run them.
2. **Where the bell goes, and who fetches.** Does the bell sit in the sidebar header or elsewhere, and does it open a popover or link to a full page? A bell without a mounted `NotificationFeed` needs its own `feedClient.fetch()` on mount.
3. **Dark mode.** Does mapping `--rnf-*` variables to shadcn tokens, with `colorMode` left on `light`, give a good enough dark mode, or do we also need `.dark .rnf-…` overrides?
4. **Importing the CSS.** Does `@import "@knocklabs/react/dist/index.css" layer(components);` work in `app/app.css` under `@tailwindcss/vite`, or does it have to be a JS import in a route module?
5. **Bundle cost.** What does adding `@knocklabs/react` cost a production build? The package has no `sideEffects` field, and Telegraph and lucide@1.80 are pulled in by the non-feed modules. Would `@knocklabs/react-core` alone (headless, `sideEffects: false`) be smaller?
6. **Catch-up after a hidden tab.** After a tab has been hidden more than 30 s and reconnects, do Notifications that arrived meanwhile appear without a reload? If not, a `visibilitychange` → `feedClient.fetch()` hook may be needed. This bears on the "shows up in a tab that's already open" decision.
7. **Server-side read on interacted.** Does `markAsInteracted` (a row click) set `read_at` on the server, or only optimistically in the client? The API reference doesn't say.
8. **HTML escaping.** Are trigger-data variables HTML-escaped when Knock renders a template's `body`? `NotificationCell` injects that HTML with `dangerouslySetInnerHTML`.
9. **Branding on Free.** Does Knock's Free plan require "Powered by Knock" in a headless UI too, or only where the prebuilt feed renders it? The pricing page lists only "Remove Knock branding: No" for Free.
10. **Toasts.** Do we toast at all, given the existing sonner `Toaster`? If so, does a toast mark the item seen (Knock's recipe does)?

## Sources

npm registry

- `npm-react`: <https://www.npmjs.com/package/@knocklabs/react>
- `registry-react`: <https://registry.npmjs.org/@knocklabs/react> (`npm view @knocklabs/react` fields `version`, `peerDependencies`, `peerDependenciesMeta`, `dependencies`, `exports`, `gitHead`, `time`)
- `registry-react-core`: <https://registry.npmjs.org/@knocklabs/react-core>
- `registry-client`: <https://registry.npmjs.org/@knocklabs/client>

Knock docs

- `docs-react-overview`: <https://docs.knock.app/in-app-ui/react/overview>
- `docs-react-feed`: <https://docs.knock.app/in-app-ui/react/feed>
- `docs-inbox`: <https://docs.knock.app/in-app-ui/react/inbox>
- `docs-toasts`: <https://docs.knock.app/in-app-ui/react/toasts>
- `docs-headless`: <https://docs.knock.app/in-app-ui/react/headless/feed>
- `docs-styling`: <https://docs.knock.app/in-app-ui/feeds/styling>
- `docs-interactivity`: <https://docs.knock.app/in-app-ui/feeds/handling-interactivity>
- `docs-statuses`: <https://docs.knock.app/send-notifications/message-statuses>
- `docs-knock-provider`: <https://docs.knock.app/in-app-ui/react/sdk/components/knock-provider>
- `docs-feed-provider`: <https://docs.knock.app/in-app-ui/react/sdk/components/knock-feed-provider>
- `docs-popover`: <https://docs.knock.app/in-app-ui/react/sdk/components/notification-feed-popover>
- `docs-use-notifications`: <https://docs.knock.app/in-app-ui/react/sdk/hooks/use-notifications>
- `docs-feed-client`: <https://docs.knock.app/in-app-ui/javascript/sdk/feed-client>
- `docs-security`: <https://docs.knock.app/in-app-ui/security-and-authentication>
- `docs-nextjs`: <https://docs.knock.app/getting-started/quick-start/nextjs>
- `docs-interacted-api`: <https://docs.knock.app/api-reference/messages/mark_as_interacted>
- `pricing`: <https://knock.app/pricing>

Knock source (`knocklabs/javascript` at `f24c79f`, the commit npm records for `@knocklabs/react` 0.15.1)

- `src-index`: <https://github.com/knocklabs/javascript/blob/f24c79feebed3d817d7145c379ff3c8fd5ee8cae/packages/react/src/index.ts>
- `src-vite`: <https://github.com/knocklabs/javascript/blob/f24c79feebed3d817d7145c379ff3c8fd5ee8cae/packages/react/vite.config.mts>
- `src-theme`: <https://github.com/knocklabs/javascript/blob/f24c79feebed3d817d7145c379ff3c8fd5ee8cae/packages/react/src/theme.css>
- `src-iconbutton`: <https://github.com/knocklabs/javascript/blob/f24c79feebed3d817d7145c379ff3c8fd5ee8cae/packages/react/src/modules/feed/components/NotificationIconButton/NotificationIconButton.tsx>
- `src-badge`: <https://github.com/knocklabs/javascript/blob/f24c79feebed3d817d7145c379ff3c8fd5ee8cae/packages/react/src/modules/feed/components/UnseenBadge/UnseenBadge.tsx>
- `src-popover`: <https://github.com/knocklabs/javascript/blob/f24c79feebed3d817d7145c379ff3c8fd5ee8cae/packages/react/src/modules/feed/components/NotificationFeedPopover/NotificationFeedPopover.tsx>
- `src-visible`: <https://github.com/knocklabs/javascript/blob/f24c79feebed3d817d7145c379ff3c8fd5ee8cae/packages/react/src/modules/core/hooks/useComponentVisible.ts>
- `src-feed`: <https://github.com/knocklabs/javascript/blob/f24c79feebed3d817d7145c379ff3c8fd5ee8cae/packages/react/src/modules/feed/components/NotificationFeed/NotificationFeed.tsx>
- `src-header`: <https://github.com/knocklabs/javascript/blob/f24c79feebed3d817d7145c379ff3c8fd5ee8cae/packages/react/src/modules/feed/components/NotificationFeed/NotificationFeedHeader.tsx>
- `src-markasread`: <https://github.com/knocklabs/javascript/blob/f24c79feebed3d817d7145c379ff3c8fd5ee8cae/packages/react/src/modules/feed/components/NotificationFeed/MarkAsRead.tsx>
- `src-cell`: <https://github.com/knocklabs/javascript/blob/f24c79feebed3d817d7145c379ff3c8fd5ee8cae/packages/react/src/modules/feed/components/NotificationCell/NotificationCell.tsx>
- `src-archive`: <https://github.com/knocklabs/javascript/blob/f24c79feebed3d817d7145c379ff3c8fd5ee8cae/packages/react/src/modules/feed/components/NotificationCell/ArchiveButton.tsx>
- `src-cell-css`: <https://github.com/knocklabs/javascript/blob/f24c79feebed3d817d7145c379ff3c8fd5ee8cae/packages/react/src/modules/feed/components/NotificationCell/styles.css>
- `src-feed-css`: <https://github.com/knocklabs/javascript/blob/f24c79feebed3d817d7145c379ff3c8fd5ee8cae/packages/react/src/modules/feed/components/NotificationFeed/styles.css>
- `src-react-changelog`: <https://github.com/knocklabs/javascript/blob/f24c79feebed3d817d7145c379ff3c8fd5ee8cae/packages/react/CHANGELOG.md>
- `src-knockprovider`: <https://github.com/knocklabs/javascript/blob/f24c79feebed3d817d7145c379ff3c8fd5ee8cae/packages/react-core/src/modules/core/context/KnockProvider.tsx>
- `src-feedprovider`: <https://github.com/knocklabs/javascript/blob/f24c79feebed3d817d7145c379ff3c8fd5ee8cae/packages/react-core/src/modules/feed/context/KnockFeedProvider.tsx>
- `src-useauth`: <https://github.com/knocklabs/javascript/blob/f24c79feebed3d817d7145c379ff3c8fd5ee8cae/packages/react-core/src/modules/core/hooks/useAuthenticatedKnockClient.ts>
- `src-usenotifications`: <https://github.com/knocklabs/javascript/blob/f24c79feebed3d817d7145c379ff3c8fd5ee8cae/packages/react-core/src/modules/feed/hooks/useNotifications.ts>
- `src-usestore`: <https://github.com/knocklabs/javascript/blob/f24c79feebed3d817d7145c379ff3c8fd5ee8cae/packages/react-core/src/modules/feed/hooks/useNotificationStore.ts>
- `src-feedsettings`: <https://github.com/knocklabs/javascript/blob/f24c79feebed3d817d7145c379ff3c8fd5ee8cae/packages/react-core/src/modules/feed/hooks/useFeedSettings.ts>
- `src-utils`: <https://github.com/knocklabs/javascript/blob/f24c79feebed3d817d7145c379ff3c8fd5ee8cae/packages/react-core/src/modules/core/utils.ts>
- `src-en`: <https://github.com/knocklabs/javascript/blob/f24c79feebed3d817d7145c379ff3c8fd5ee8cae/packages/react-core/src/modules/i18n/languages/en.ts>
- `src-core-changelog`: <https://github.com/knocklabs/javascript/blob/f24c79feebed3d817d7145c379ff3c8fd5ee8cae/packages/react-core/CHANGELOG.md>
- `src-knock`: <https://github.com/knocklabs/javascript/blob/f24c79feebed3d817d7145c379ff3c8fd5ee8cae/packages/client/src/knock.ts>
- `src-api`: <https://github.com/knocklabs/javascript/blob/f24c79feebed3d817d7145c379ff3c8fd5ee8cae/packages/client/src/api.ts>
- `src-pagevis`: <https://github.com/knocklabs/javascript/blob/f24c79feebed3d817d7145c379ff3c8fd5ee8cae/packages/client/src/pageVisibility.ts>
- `src-feedts`: <https://github.com/knocklabs/javascript/blob/f24c79feebed3d817d7145c379ff3c8fd5ee8cae/packages/client/src/clients/feed/feed.ts>
- `src-interfaces`: <https://github.com/knocklabs/javascript/blob/f24c79feebed3d817d7145c379ff3c8fd5ee8cae/packages/client/src/clients/feed/interfaces.ts>
- `src-types`: <https://github.com/knocklabs/javascript/blob/f24c79feebed3d817d7145c379ff3c8fd5ee8cae/packages/client/src/clients/feed/types.ts>
- `src-socket`: <https://github.com/knocklabs/javascript/blob/f24c79feebed3d817d7145c379ff3c8fd5ee8cae/packages/client/src/clients/feed/socket-manager.ts>
- `src-client-changelog`: <https://github.com/knocklabs/javascript/blob/f24c79feebed3d817d7145c379ff3c8fd5ee8cae/packages/client/CHANGELOG.md>

Other primary sources

- `tw-preflight`: <https://tailwindcss.com/docs/preflight>
- `tw-custom`: <https://tailwindcss.com/docs/adding-custom-styles>
- `mdn-layer`: <https://developer.mozilla.org/en-US/docs/Web/CSS/@layer>
- `rr-client-modules`: <https://reactrouter.com/api/framework-conventions/client-modules>

[npm-react]: https://www.npmjs.com/package/@knocklabs/react
[registry-react]: https://registry.npmjs.org/@knocklabs/react
[registry-react-core]: https://registry.npmjs.org/@knocklabs/react-core
[registry-client]: https://registry.npmjs.org/@knocklabs/client
[docs-react-overview]: https://docs.knock.app/in-app-ui/react/overview
[docs-react-feed]: https://docs.knock.app/in-app-ui/react/feed
[docs-inbox]: https://docs.knock.app/in-app-ui/react/inbox
[docs-toasts]: https://docs.knock.app/in-app-ui/react/toasts
[docs-headless]: https://docs.knock.app/in-app-ui/react/headless/feed
[docs-styling]: https://docs.knock.app/in-app-ui/feeds/styling
[docs-interactivity]: https://docs.knock.app/in-app-ui/feeds/handling-interactivity
[docs-statuses]: https://docs.knock.app/send-notifications/message-statuses
[docs-knock-provider]: https://docs.knock.app/in-app-ui/react/sdk/components/knock-provider
[docs-feed-provider]: https://docs.knock.app/in-app-ui/react/sdk/components/knock-feed-provider
[docs-popover]: https://docs.knock.app/in-app-ui/react/sdk/components/notification-feed-popover
[docs-use-notifications]: https://docs.knock.app/in-app-ui/react/sdk/hooks/use-notifications
[docs-feed-client]: https://docs.knock.app/in-app-ui/javascript/sdk/feed-client
[docs-security]: https://docs.knock.app/in-app-ui/security-and-authentication
[docs-nextjs]: https://docs.knock.app/getting-started/quick-start/nextjs
[docs-interacted-api]: https://docs.knock.app/api-reference/messages/mark_as_interacted
[pricing]: https://knock.app/pricing
[src-index]: https://github.com/knocklabs/javascript/blob/f24c79feebed3d817d7145c379ff3c8fd5ee8cae/packages/react/src/index.ts
[src-vite]: https://github.com/knocklabs/javascript/blob/f24c79feebed3d817d7145c379ff3c8fd5ee8cae/packages/react/vite.config.mts
[src-theme]: https://github.com/knocklabs/javascript/blob/f24c79feebed3d817d7145c379ff3c8fd5ee8cae/packages/react/src/theme.css
[src-iconbutton]: https://github.com/knocklabs/javascript/blob/f24c79feebed3d817d7145c379ff3c8fd5ee8cae/packages/react/src/modules/feed/components/NotificationIconButton/NotificationIconButton.tsx
[src-badge]: https://github.com/knocklabs/javascript/blob/f24c79feebed3d817d7145c379ff3c8fd5ee8cae/packages/react/src/modules/feed/components/UnseenBadge/UnseenBadge.tsx
[src-popover]: https://github.com/knocklabs/javascript/blob/f24c79feebed3d817d7145c379ff3c8fd5ee8cae/packages/react/src/modules/feed/components/NotificationFeedPopover/NotificationFeedPopover.tsx
[src-visible]: https://github.com/knocklabs/javascript/blob/f24c79feebed3d817d7145c379ff3c8fd5ee8cae/packages/react/src/modules/core/hooks/useComponentVisible.ts
[src-feed]: https://github.com/knocklabs/javascript/blob/f24c79feebed3d817d7145c379ff3c8fd5ee8cae/packages/react/src/modules/feed/components/NotificationFeed/NotificationFeed.tsx
[src-header]: https://github.com/knocklabs/javascript/blob/f24c79feebed3d817d7145c379ff3c8fd5ee8cae/packages/react/src/modules/feed/components/NotificationFeed/NotificationFeedHeader.tsx
[src-markasread]: https://github.com/knocklabs/javascript/blob/f24c79feebed3d817d7145c379ff3c8fd5ee8cae/packages/react/src/modules/feed/components/NotificationFeed/MarkAsRead.tsx
[src-cell]: https://github.com/knocklabs/javascript/blob/f24c79feebed3d817d7145c379ff3c8fd5ee8cae/packages/react/src/modules/feed/components/NotificationCell/NotificationCell.tsx
[src-archive]: https://github.com/knocklabs/javascript/blob/f24c79feebed3d817d7145c379ff3c8fd5ee8cae/packages/react/src/modules/feed/components/NotificationCell/ArchiveButton.tsx
[src-cell-css]: https://github.com/knocklabs/javascript/blob/f24c79feebed3d817d7145c379ff3c8fd5ee8cae/packages/react/src/modules/feed/components/NotificationCell/styles.css
[src-feed-css]: https://github.com/knocklabs/javascript/blob/f24c79feebed3d817d7145c379ff3c8fd5ee8cae/packages/react/src/modules/feed/components/NotificationFeed/styles.css
[src-react-changelog]: https://github.com/knocklabs/javascript/blob/f24c79feebed3d817d7145c379ff3c8fd5ee8cae/packages/react/CHANGELOG.md
[src-knockprovider]: https://github.com/knocklabs/javascript/blob/f24c79feebed3d817d7145c379ff3c8fd5ee8cae/packages/react-core/src/modules/core/context/KnockProvider.tsx
[src-feedprovider]: https://github.com/knocklabs/javascript/blob/f24c79feebed3d817d7145c379ff3c8fd5ee8cae/packages/react-core/src/modules/feed/context/KnockFeedProvider.tsx
[src-useauth]: https://github.com/knocklabs/javascript/blob/f24c79feebed3d817d7145c379ff3c8fd5ee8cae/packages/react-core/src/modules/core/hooks/useAuthenticatedKnockClient.ts
[src-usenotifications]: https://github.com/knocklabs/javascript/blob/f24c79feebed3d817d7145c379ff3c8fd5ee8cae/packages/react-core/src/modules/feed/hooks/useNotifications.ts
[src-usestore]: https://github.com/knocklabs/javascript/blob/f24c79feebed3d817d7145c379ff3c8fd5ee8cae/packages/react-core/src/modules/feed/hooks/useNotificationStore.ts
[src-feedsettings]: https://github.com/knocklabs/javascript/blob/f24c79feebed3d817d7145c379ff3c8fd5ee8cae/packages/react-core/src/modules/feed/hooks/useFeedSettings.ts
[src-utils]: https://github.com/knocklabs/javascript/blob/f24c79feebed3d817d7145c379ff3c8fd5ee8cae/packages/react-core/src/modules/core/utils.ts
[src-en]: https://github.com/knocklabs/javascript/blob/f24c79feebed3d817d7145c379ff3c8fd5ee8cae/packages/react-core/src/modules/i18n/languages/en.ts
[src-core-changelog]: https://github.com/knocklabs/javascript/blob/f24c79feebed3d817d7145c379ff3c8fd5ee8cae/packages/react-core/CHANGELOG.md
[src-knock]: https://github.com/knocklabs/javascript/blob/f24c79feebed3d817d7145c379ff3c8fd5ee8cae/packages/client/src/knock.ts
[src-api]: https://github.com/knocklabs/javascript/blob/f24c79feebed3d817d7145c379ff3c8fd5ee8cae/packages/client/src/api.ts
[src-pagevis]: https://github.com/knocklabs/javascript/blob/f24c79feebed3d817d7145c379ff3c8fd5ee8cae/packages/client/src/pageVisibility.ts
[src-feedts]: https://github.com/knocklabs/javascript/blob/f24c79feebed3d817d7145c379ff3c8fd5ee8cae/packages/client/src/clients/feed/feed.ts
[src-interfaces]: https://github.com/knocklabs/javascript/blob/f24c79feebed3d817d7145c379ff3c8fd5ee8cae/packages/client/src/clients/feed/interfaces.ts
[src-types]: https://github.com/knocklabs/javascript/blob/f24c79feebed3d817d7145c379ff3c8fd5ee8cae/packages/client/src/clients/feed/types.ts
[src-socket]: https://github.com/knocklabs/javascript/blob/f24c79feebed3d817d7145c379ff3c8fd5ee8cae/packages/client/src/clients/feed/socket-manager.ts
[src-client-changelog]: https://github.com/knocklabs/javascript/blob/f24c79feebed3d817d7145c379ff3c8fd5ee8cae/packages/client/CHANGELOG.md
[tw-preflight]: https://tailwindcss.com/docs/preflight
[tw-custom]: https://tailwindcss.com/docs/adding-custom-styles
[mdn-layer]: https://developer.mozilla.org/en-US/docs/Web/CSS/@layer
[rr-client-modules]: https://reactrouter.com/api/framework-conventions/client-modules
