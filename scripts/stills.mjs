// Renders deterministic world stills at given story positions.
// Usage: node scripts/stills.mjs <outPrefix> <width> <height> <T,T,...> [webp]
import { chromium } from "playwright";

const [, , prefix, w, h, list, fmt = "png"] = process.argv;
const width = Number(w);
const height = Number(h);
const mobile = width < 700;
const browser = await chromium.launch({ channel: "chrome", args: ["--ignore-gpu-blocklist"] });
const ctx = await browser.newContext({
  viewport: { width, height },
  deviceScaleFactor: mobile ? 2 : 1,
  isMobile: mobile,
  hasTouch: mobile,
});
const page = await ctx.newPage();
const logs = [];
page.on("console", (m) => {
  if (m.type() === "error" || m.type() === "warning") logs.push(`${m.type()}: ${m.text()}`);
});
page.on("pageerror", (e) => logs.push(`pageerror: ${e.message}`));
for (const t of list.split(",")) {
  await page.goto(`http://localhost:4173/?still=${t}`, { waitUntil: "networkidle" });
  await page.waitForFunction(() => document.documentElement.dataset.worldReady === "1", null, { timeout: 20000 });
  await page.waitForTimeout(150);
  const out = `${prefix}-${t}.${fmt}`;
  await page.screenshot({ path: out, type: fmt === "jpg" ? "jpeg" : "png" });
  console.log("saved", out);
}
if (logs.length) console.log(logs.join("\n"));
await browser.close();
