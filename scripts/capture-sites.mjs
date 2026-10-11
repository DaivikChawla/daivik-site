// Captures real screenshots of the live sites linked from the Work section.
// Usage: node scripts/capture-sites.mjs <outDir>
import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";

const outDir = process.argv[2] || "scripts/.cache/sites";
fs.mkdirSync(outDir, { recursive: true });

const sites = [
  { name: "mysterystudios", url: "https://mysterystudios.xyz" },
  { name: "pagewalla", url: "https://pagewalla.site" },
  { name: "shriraam", url: "https://shriraamengineering.in" },
];

const browser = await chromium.launch({ channel: "chrome" });
for (const vp of [
  { tag: "desktop", width: 1440, height: 900, scale: 1 },
  { tag: "mobile", width: 390, height: 844, scale: 2 },
]) {
  const ctx = await browser.newContext({
    viewport: { width: vp.width, height: vp.height },
    deviceScaleFactor: vp.scale,
    isMobile: vp.tag === "mobile",
    hasTouch: vp.tag === "mobile",
  });
  for (const s of sites) {
    const page = await ctx.newPage();
    try {
      await page.goto(s.url, { waitUntil: "networkidle", timeout: 45000 });
    } catch {
      console.log("networkidle timeout, continuing:", s.url);
    }
    await page.waitForTimeout(2500);
    const file = path.join(outDir, `${s.name}-${vp.tag}.png`);
    await page.screenshot({ path: file });
    console.log("saved", file, await page.title());
    await page.close();
  }
  await ctx.close();
}
await browser.close();
