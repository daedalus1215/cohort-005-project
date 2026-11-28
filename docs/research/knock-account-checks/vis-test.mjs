// Which hiding method really flips document.visibilityState in this Chromium?
import { chromium } from "playwright-core";

const executablePath = process.argv[2] ?? "/usr/local/bin/chromium";
const browser = await chromium.launch({ executablePath, headless: true });
const context = await browser.newContext();
const a = await context.newPage();
await a.goto("data:text/html,<title>A</title>A");
await a.evaluate(() => {
  window.__events = [];
  document.addEventListener("visibilitychange", () =>
    window.__events.push(`${Math.round(performance.now())}ms ${document.visibilityState}`),
  );
});
const state = () => a.evaluate(() => ({ vis: document.visibilityState, hidden: document.hidden, events: window.__events }));
console.log("version", browser.version());
console.log("initial", await state());

// Method 1: a second tab brought to the front.
const b = await context.newPage();
await b.goto("data:text/html,B");
await b.bringToFront();
await a.waitForTimeout(500);
console.log("after B.bringToFront", await state());
await a.bringToFront();
await a.waitForTimeout(500);
console.log("after A.bringToFront", await state());

// Method 2: CDP minimise the window holding A.
const cdp = await context.newCDPSession(a);
try {
  const { windowId } = await cdp.send("Browser.getWindowForTarget");
  await cdp.send("Browser.setWindowBounds", { windowId, bounds: { windowState: "minimized" } });
  await a.waitForTimeout(500);
  console.log("after minimise", await state());
  await cdp.send("Browser.setWindowBounds", { windowId, bounds: { windowState: "normal" } });
  await a.waitForTimeout(500);
  console.log("after restore", await state());
} catch (e) {
  console.log("CDP minimise failed:", e.message);
}
await browser.close();
