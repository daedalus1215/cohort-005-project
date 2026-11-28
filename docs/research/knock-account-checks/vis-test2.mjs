// Second try: a real second tab in the SAME window, created and activated over CDP.
import { chromium } from "playwright-core";

const executablePath = process.argv[2] ?? "/usr/local/bin/chromium";
const headless = process.argv[3] !== "headful";
const browser = await chromium.launch({ executablePath, headless, args: ["--headless=new"].filter(() => headless) });
const context = await browser.newContext();
const a = await context.newPage();
await a.goto("data:text/html,<title>A</title>A");
await a.evaluate(() => {
  window.__events = [];
  document.addEventListener("visibilitychange", () =>
    window.__events.push(`${Math.round(performance.now())}ms ${document.visibilityState}`),
  );
});
const state = () => a.evaluate(() => ({ vis: document.visibilityState, events: window.__events }));
const bcdp = await browser.newBrowserCDPSession();
const { targetInfos } = await bcdp.send("Target.getTargets");
const aInfo = targetInfos.find((t) => t.type === "page" && t.url.startsWith("data:text/html,<title>A"));
console.log("A target", aInfo?.targetId?.slice(0, 8), "ctx", aInfo?.browserContextId?.slice(0, 8));
const { windowId: aWin } = await bcdp.send("Browser.getWindowForTarget", { targetId: aInfo.targetId });
const { targetId: bId } = await bcdp.send("Target.createTarget", {
  url: "data:text/html,B",
  browserContextId: aInfo.browserContextId,
  newWindow: false,
  background: false,
});
const { windowId: bWin } = await bcdp.send("Browser.getWindowForTarget", { targetId: bId });
console.log("same window?", aWin === bWin);
await bcdp.send("Target.activateTarget", { targetId: bId });
await a.waitForTimeout(800);
console.log("after activating B", await state());
await bcdp.send("Target.activateTarget", { targetId: aInfo.targetId });
await a.waitForTimeout(800);
console.log("after activating A", await state());
await browser.close();
