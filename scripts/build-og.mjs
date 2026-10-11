// Builds app/opengraph-image.png (1200×630) from a real render of the finished world,
// and app/apple-icon.png (180×180) from the block mark. Expects the site on :4173.
import { chromium } from "playwright";
import fs from "node:fs";
import { hero, meta } from "../lib/content.ts";

const browser = await chromium.launch({ channel: "chrome", args: ["--ignore-gpu-blocklist"] });

// 1. the finished world at golden hour, rendered wide and cropped so it sits on the right
const ctx = await browser.newContext({ viewport: { width: 2000, height: 630 }, deviceScaleFactor: 2 });
const page = await ctx.newPage();
await page.goto("http://localhost:4173/?still=6", { waitUntil: "networkidle" });
await page.waitForFunction(() => document.documentElement.dataset.worldReady === "1", null, { timeout: 20000 });
await page.waitForTimeout(200);
const world = await page.screenshot({ clip: { x: 130, y: 0, width: 1200, height: 630 } });
await ctx.close();

// 2. type on top
const html = `<!doctype html><html><head><meta charset="utf-8">
<link href="https://fonts.googleapis.com/css2?family=Instrument+Sans:wdth,wght@75..100,400..700&family=Fragment+Mono&display=block" rel="stylesheet">
<style>
*{margin:0;box-sizing:border-box}
body{width:1200px;height:630px;overflow:hidden;position:relative;background:#e9c7b4;font-family:"Instrument Sans",sans-serif;color:#10144a}
.bg{position:absolute;inset:0;width:1200px;height:630px}
.fade{position:absolute;inset:0;background:linear-gradient(90deg,rgba(242,226,214,.9) 0%,rgba(242,226,214,.7) 34%,rgba(242,226,214,0) 52%)}
.copy{position:absolute;left:64px;top:60px;bottom:58px;width:560px;display:flex;flex-direction:column}
.name{font-weight:600;font-size:26px;letter-spacing:-.005em}
.eyebrow{margin-top:auto;font-family:"Fragment Mono",monospace;font-size:17px;letter-spacing:.06em;text-transform:uppercase;color:#2b3170}
h1{margin-top:18px;font-weight:700;font-stretch:75%;font-size:100px;line-height:.88;letter-spacing:-.022em}
.site{margin-top:28px;font-family:"Fragment Mono",monospace;font-size:18px;color:#2b3170;display:flex;align-items:center;gap:12px}
.dot{width:12px;height:12px;border-radius:2px;background:#ff6a1f}
</style></head><body>
<img class="bg" src="data:image/png;base64,${world.toString("base64")}">
<div class="fade"></div>
<div class="copy">
  <div class="name">${meta.name}</div>
  <div class="eyebrow">${hero.eyebrow}</div>
  <h1>${hero.headline}</h1>
  <div class="site"><span class="dot"></span>${meta.site}</div>
</div>
</body></html>`;
const og = await browser.newPage({ viewport: { width: 1200, height: 630 } });
await og.setContent(html, { waitUntil: "networkidle" });
await og.evaluate(() => document.fonts.ready);
await og.screenshot({ path: "app/opengraph-image.png" });
console.log("app/opengraph-image.png");

// 3. apple touch icon from the block mark
const svg = fs.readFileSync("app/icon.svg", "utf8").replace('rx="14"', 'rx="0"');
const icon = await browser.newPage({ viewport: { width: 180, height: 180 } });
await icon.setContent(`<body style="margin:0">${svg.replace("<svg ", '<svg width="180" height="180" ')}</body>`);
await icon.screenshot({ path: "app/apple-icon.png" });
console.log("app/apple-icon.png");
await browser.close();
