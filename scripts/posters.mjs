// Renders the world's still frames (used when WebGL is unavailable or motion is reduced)
// from the engine itself, at every beat of the story, for wide and tall screens.
// Usage: node scripts/posters.mjs   (expects the site served on :4173)
import { chromium } from "playwright";
import fs from "node:fs";

// story beats 0–6, plus the blue-hour bookend (7) shown in the footer
const beats = ["hero", "hand", "auto", "mysterystudios", "pagewalla", "vesper", "finale", "night"];
const only = process.argv[2];
const sizes = [
  { tag: "wide", width: 1600, height: 1000, scale: 1, q: 0.8 },
  { tag: "tall", width: 430, height: 932, scale: 2, q: 0.78 },
];
fs.mkdirSync("public/world", { recursive: true });

const browser = await chromium.launch({ channel: "chrome", args: ["--ignore-gpu-blocklist"] });
const encoder = await browser.newPage();
for (const s of sizes) {
  const ctx = await browser.newContext({
    viewport: { width: s.width, height: s.height },
    deviceScaleFactor: s.scale,
    isMobile: s.tag === "tall",
    hasTouch: s.tag === "tall",
  });
  const page = await ctx.newPage();
  for (const [t, name] of beats.entries()) {
    if (only && only !== name) continue;
    await page.goto(`http://localhost:4173/?still=${t}`, { waitUntil: "networkidle" });
    await page.waitForFunction(() => document.documentElement.dataset.worldReady === "1", null, { timeout: 20000 });
    await page.waitForTimeout(200);
    const png = await page.screenshot({ type: "png" });
    const webp = await encoder.evaluate(
      async ({ b64, q }) => {
        const img = new Image();
        img.src = `data:image/png;base64,${b64}`;
        await img.decode();
        const c = document.createElement("canvas");
        c.width = img.naturalWidth;
        c.height = img.naturalHeight;
        c.getContext("2d").drawImage(img, 0, 0);
        return c.toDataURL("image/webp", q);
      },
      { b64: png.toString("base64"), q: s.q },
    );
    const out = `public/world/${name}-${s.tag}.webp`;
    fs.writeFileSync(out, Buffer.from(webp.split(",")[1], "base64"));
    console.log(out, fs.statSync(out).size);
  }
  await ctx.close();
}
await browser.close();
