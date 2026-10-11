// Builds public/daivik-chawla-resume.pdf (one A4 page, black on white, real text)
// from the same lib/content.ts the site renders. Usage: node scripts/build-resume.mjs
import { chromium } from "playwright";
import fs from "node:fs";
import {
  SHOW_GITHUB,
  about,
  hero,
  howIBuild,
  meta,
  mysteryStudios as ms,
  pagewalla as pw,
  proof,
  vesper as vs,
} from "../lib/content.ts";

const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const host = (u) => u.replace(/^https?:\/\/(www\.)?/, "").replace(/\/$/, "");

const contact = [
  `<a href="mailto:${meta.email}">${meta.email}</a>`,
  `<a href="${meta.url}">${meta.site}</a>`,
  `<a href="${meta.linkedin}">${host(meta.linkedin)}</a>`,
  `<a href="${meta.fiverr}">${host(meta.fiverr)}</a>`,
  ...(SHOW_GITHUB ? [`<a href="${meta.github}">${host(meta.github)}</a>`] : []),
].join(' <span class="dot">·</span> ');

const venture = (v, tag, paras, links, extra = "") => `
  <section class="venture">
    <div class="vh">
      <h3>${esc(v.name)} <span class="vsub">— ${esc(v.sub)}</span></h3>
      <p class="vtag">${tag}</p>
    </div>
    <p class="vline">${esc(v.line)}</p>
    ${paras.map((p) => `<p>${esc(p)}</p>`).join("")}
    ${extra}
    ${links.length ? `<p class="links">${links.map((l) => `<a href="${l}">${host(l)}</a>`).join(' <span class="dot">·</span> ')}</p>` : ""}
  </section>`;

const html = `<!doctype html><html><head><meta charset="utf-8">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Instrument+Sans:wdth,wght@75..100,400..700&family=Fragment+Mono&display=block" rel="stylesheet">
<style>
@page { size: A4; margin: 0; }
* { box-sizing: border-box; margin: 0; padding: 0; }
html, body { width: 210mm; height: 297mm; }
body { padding: 11mm 15mm 9mm; color: #000; background: #fff; font: 8.95pt/1.4 "Instrument Sans", Helvetica, Arial, sans-serif; }
a { color: #000; text-decoration: none; }
.mono, .vtag, h2, .contact, .meta { font-family: "Fragment Mono", Menlo, monospace; }
header { display: grid; grid-template-columns: minmax(0, 1fr) 76mm; grid-template-areas: "name meta" "contact meta"; align-items: end; column-gap: 8mm; padding-bottom: 3.5mm; border-bottom: 1.4pt solid #000; }
header h1 { grid-area: name; }
header .contact { grid-area: contact; }
header .meta { grid-area: meta; }
h1 { font-weight: 700; font-stretch: 75%; font-size: 34pt; line-height: .9; letter-spacing: -.02em; }
.meta { font-size: 7.4pt; line-height: 1.5; text-align: right; }
.contact { margin-top: 3mm; font-size: 7.4pt; }
.dot { padding: 0 .2mm; }
.lede { margin-top: 3.5mm; font-size: 10.4pt; line-height: 1.38; font-weight: 500; letter-spacing: -.005em; }
h2 { margin: 4.2mm 0 1.8mm; font-size: 7.4pt; font-weight: 400; letter-spacing: .08em; text-transform: uppercase; padding-bottom: 1.2mm; border-bottom: .6pt solid #000; }
.proof { display: grid; grid-template-columns: repeat(4, 1fr); gap: 3mm; }
.proof b { display: block; font-weight: 700; font-stretch: 75%; font-size: 17pt; line-height: 1; }
.proof span { font-size: 8pt; }
.venture { margin-top: 3mm; }
.venture:first-of-type { margin-top: 0; }
.vh { display: flex; justify-content: space-between; align-items: baseline; gap: 4mm; }
h3 { font-size: 11pt; font-weight: 700; letter-spacing: -.005em; }
.vsub { font-weight: 400; }
.vtag { font-size: 7.4pt; white-space: nowrap; }
.vline { font-weight: 600; margin: .6mm 0 .8mm; }
.venture p + p { margin-top: .8mm; }
.links { font-family: "Fragment Mono", Menlo, monospace; font-size: 7.4pt; }
.credit { font-size: 8pt; font-style: italic; }
.two { display: grid; grid-template-columns: 0.9fr 1.1fr; gap: 6mm; }
.tk { display: grid; grid-template-columns: 27mm 1fr; gap: .6mm 3mm; font-size: 8.6pt; }
.tk dt { font-weight: 600; }
p.small { font-size: 8.6pt; }
ul { list-style: none; }
li { font-size: 8.6pt; }
li::before { content: "– "; }
</style></head><body>
<header>
  <h1>${esc(meta.name)}</h1>
  <p class="contact">${contact}</p>
  <div class="meta">${esc(meta.status).replace(", Thapar", ",<br>Thapar")}</div>
</header>
<p class="lede">${esc(hero.sub)}</p>

<h2>Proof</h2>
<div class="proof">
  ${proof.map((p) => `<div><b>${esc(p.big)}${p.star ? " ★" : ""}</b><span>${esc(p.small)}</span></div>`).join("")}
</div>

<h2>Work</h2>
${venture(ms, `${ms.tag.role} · ${ms.tag.from} → ${ms.tag.to}`, [ms.body[0], `${ms.byHand} ${ms.automated}`, ms.body[1]], [ms.buttons[0].href, meta.fiverr])}
${venture(pw, esc(pw.tag), pw.body, [pw.buttons[0].href, pw.buttons[1].href])}
${venture(vs, esc(vs.tag), vs.body, [], `<p class="credit">${esc(vs.credit)}</p>`)}

<div class="two">
  <div>
    <h2>${esc(howIBuild.header)}</h2>
    <p class="small">${esc(howIBuild.paragraphs[0])}</p>
    <p class="small" style="margin-top:1.2mm">${esc(howIBuild.paragraphs[1].split(". ").slice(-1)[0])}</p>
  </div>
  <div>
    <h2>Toolkit</h2>
    <dl class="tk">${howIBuild.toolkit.map((g) => `<dt>${esc(g.group)}</dt><dd>${esc(g.items.join(", "))}</dd>`).join("")}</dl>
  </div>
</div>

<h2>${esc(about.header)}</h2>
<ul>${[about.paragraphs[1].split(". ").slice(0, 2).join(". ") + ".", ...about.outside].map((o) => `<li>${esc(o)}</li>`).join("")}</ul>
</body></html>`;

fs.mkdirSync("scripts/.cache", { recursive: true });
fs.writeFileSync("scripts/.cache/resume.html", html);

const browser = await chromium.launch({ channel: "chrome" });
const page = await browser.newPage();
await page.setContent(html, { waitUntil: "networkidle" });
await page.evaluate(() => document.fonts.ready);
const overflow = await page.evaluate(() => document.body.scrollHeight - document.body.clientHeight);
await page.pdf({ path: "public/daivik-chawla-resume.pdf", format: "A4", printBackground: true, preferCSSPageSize: true });
await page.setViewportSize({ width: 794, height: 1123 });
await page.screenshot({ path: "scripts/.cache/resume.png" });
await browser.close();

const pdf = fs.readFileSync("public/daivik-chawla-resume.pdf", "latin1");
const pages = (pdf.match(/\/Type\s*\/Page[^s]/g) || []).length;
console.log(`resume: ${pages} page(s), body overflow ${overflow}px`);
if (pages !== 1 || overflow > 0) process.exit(1);
