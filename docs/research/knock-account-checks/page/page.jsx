// Test page: KnockProvider + KnockFeedProvider, with Knock's prebuilt NotificationFeed
// and a headless list side by side, reading the same feed client.
// Config (public key, channel id, user id) arrives at runtime on window.__KNOCK__,
// injected by the Playwright script, so no key is ever written into this file or the bundle.
import { useEffect } from "react";
import { createRoot } from "react-dom/client";
import {
  KnockProvider,
  KnockFeedProvider,
  NotificationFeed,
  useKnockFeed,
} from "@knocklabs/react";
import "@knocklabs/react/dist/index.css";

const cfg = window.__KNOCK__;
window.__log = [];
const note = (event, detail) =>
  window.__log.push({ t: Math.round(performance.now()), event, ...(detail ?? {}) });

// Visibility override: the fallback method, used because headless Chromium never
// reports a tab as hidden. Knock's PageVisibilityManager reads `document.hidden`.
let forcedHidden = false;
Object.defineProperty(document, "hidden", { configurable: true, get: () => forcedHidden });
Object.defineProperty(document, "visibilityState", {
  configurable: true,
  get: () => (forcedHidden ? "hidden" : "visible"),
});
window.__setHidden = (hidden) => {
  forcedHidden = hidden;
  note("visibilitychange", { hidden });
  document.dispatchEvent(new Event("visibilitychange"));
};

function Headless() {
  const { feedClient, useFeedStore } = useKnockFeed();
  const items = useFeedStore((s) => s.items);
  const metadata = useFeedStore((s) => s.metadata);
  const networkStatus = useFeedStore((s) => s.networkStatus);

  useEffect(() => {
    const onAny = (e) => note("feed:items.received", { count: e.items?.length });
    feedClient.on("items.received.*", onAny);
    window.__feedClient = feedClient;
    return () => feedClient.off("items.received.*", onAny);
  }, [feedClient]);

  useEffect(() => {
    note("store:items", { ids: items.map((i) => i.id), metadata });
  }, [items, metadata]);

  window.__state = () => ({
    ids: items.map((i) => i.id),
    texts: items.map((i) => i.data?.text),
    metadata,
    networkStatus,
    hidden: document.hidden,
  });

  return (
    <section id="headless">
      <h2>Headless list ({items.length})</h2>
      <ul>
        {items.map((i) => (
          <li key={i.id} data-id={i.id}>
            {i.data?.text}
          </li>
        ))}
      </ul>
    </section>
  );
}

function App() {
  return (
    <KnockProvider apiKey={cfg.pk} user={{ id: cfg.userId, name: "Wayfinder probe" }} logLevel="debug">
      <KnockFeedProvider feedId={cfg.channel}>
        <div style={{ display: "flex", gap: 24 }}>
          <section id="prebuilt" style={{ width: 380, height: 420 }}>
            <h2>Prebuilt NotificationFeed</h2>
            <NotificationFeed />
          </section>
          <Headless />
        </div>
      </KnockFeedProvider>
    </KnockProvider>
  );
}

createRoot(document.getElementById("root")).render(<App />);
note("rendered");
