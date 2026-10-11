// Re-encodes an image to WebP at a target width using Chrome's canvas encoder.
// Usage: node scripts/to-webp.mjs <in.png> <out.webp> <width> [quality]
import { chromium } from "playwright";
import fs from "node:fs";

const [, , input, output, widthArg, qArg] = process.argv;
const width = Number(widthArg);
const quality = Number(qArg || 0.82);
const b64 = fs.readFileSync(input).toString("base64");
const mime = input.endsWith(".jpg") ? "image/jpeg" : "image/png";

const browser = await chromium.launch({ channel: "chrome" });
const page = await browser.newPage();
const dataUrl = await page.evaluate(
  async ({ src, width, quality }) => {
    const img = new Image();
    img.src = src;
    await img.decode();
    const h = Math.round((img.naturalHeight * width) / img.naturalWidth);
    const c = document.createElement("canvas");
    c.width = width;
    c.height = h;
    const ctx = c.getContext("2d");
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(img, 0, 0, width, h);
    return c.toDataURL("image/webp", quality);
  },
  { src: `data:${mime};base64,${b64}`, width, quality },
);
fs.writeFileSync(output, Buffer.from(dataUrl.split(",")[1], "base64"));
console.log(output, fs.statSync(output).size, "bytes");
await browser.close();
