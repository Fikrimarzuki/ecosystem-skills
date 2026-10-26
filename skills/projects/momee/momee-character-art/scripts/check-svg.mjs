#!/usr/bin/env node
// node check-svg.mjs <file.svg> [--groups id1,id2,...]
// Structural check for Momee character SVGs (no dependencies). Prints a compact summary; exit code 1 on errors.
// Errors: missing viewBox, raster/text/script/foreignObject, external hrefs, missing or duplicate ids, broken url(#id) refs,
// missing required groups. Warnings: filters, visible-feature primitives (circle/ellipse) outside defs/clipPaths.
import { readFileSync } from "node:fs";

const [file, ...rest] = process.argv.slice(2);
if (!file) { console.error("usage: node check-svg.mjs <file.svg> [--groups a,b]"); process.exit(2); }
const groupsArg = rest.indexOf("--groups");
const required = groupsArg >= 0 ? rest[groupsArg + 1].split(",").filter(Boolean) : [];

const src = readFileSync(file, "utf8");
const body = src.replace(/<!--[\s\S]*?-->/g, "");
const errors = [], warnings = [];

const root = body.match(/<svg\b[^>]*>/);
const viewBox = root?.[0].match(/viewBox="([^"]+)"/)?.[1];
if (!viewBox) errors.push("root <svg> has no viewBox");

for (const tag of ["image", "text", "script", "foreignObject"]) if (new RegExp(`<${tag}\\b`).test(body)) errors.push(`contains <${tag}>`);
const external = [...body.matchAll(/(?:xlink:)?href="(?!#)([^"]+)"/g)].map(m => m[1]);
if (external.length) errors.push(`external href(s): ${external.slice(0, 3).join(", ")}`);
if (/<filter\b/.test(body)) warnings.push("uses <filter> (renders differently across Inkscape/Chromium/Phaser; prefer fading gradients)");

const SHAPES = ["path", "circle", "ellipse", "rect", "polygon", "polyline", "line", "g"];
const counts = {}, ids = new Map(), missing = [];
// Elements inside <defs> (gradients, clip shapes) do not need ids; drawable content does.
const outsideDefs = body.replace(/<defs\b[\s\S]*?<\/defs>/g, m => m.replace(/<(?!\/)/g, "<defs-inner-"));
for (const m of outsideDefs.matchAll(/<([a-zA-Z]+)\b([^>]*)>/g)) {
  const [, tag, attrs] = m;
  if (!SHAPES.includes(tag)) continue;
  counts[tag] = (counts[tag] ?? 0) + 1;
  const id = attrs.match(/\bid="([^"]+)"/)?.[1];
  if (!id) missing.push(tag);
}
for (const m of body.matchAll(/\bid="([^"]+)"/g)) ids.set(m[1], (ids.get(m[1]) ?? 0) + 1);
if (missing.length) errors.push(`${missing.length} drawable element(s) without id (${[...new Set(missing)].join(", ")})`);
const dupes = [...ids].filter(([, n]) => n > 1).map(([id]) => id);
if (dupes.length) errors.push(`duplicate id(s): ${dupes.slice(0, 5).join(", ")}`);
const broken = [...new Set([...body.matchAll(/url\(#([^)]+)\)/g)].map(m => m[1]))].filter(id => !ids.has(id));
if (broken.length) errors.push(`url(#…) points to missing id(s): ${broken.join(", ")}`);
const absent = required.filter(id => !new RegExp(`<g\\b[^>]*\\bid="${id}"`).test(body));
if (absent.length) errors.push(`required group(s) missing: ${absent.join(", ")}`);

// Visible primitives outside clipPath/defs: often read as "sticker" features (see references/svg-techniques.md).
const visiblePrims = [...outsideDefs.replace(/<clipPath\b[\s\S]*?<\/clipPath>/g, "").matchAll(/<(circle|ellipse)\b([^>]*)>/g)]
  .filter(([, , a]) => !/opacity="0(\.\d+)?"|fill="url\(#/.test(a) || /fill="#fff/i.test(a))
  .map(([, , a]) => a.match(/\bid="([^"]+)"/)?.[1] ?? "?");
if (visiblePrims.length) warnings.push(`${visiblePrims.length} solid circle/ellipse feature(s) – check they don't read as stickers: ${visiblePrims.slice(0, 6).join(", ")}`);

const gradients = (body.match(/<(linear|radial)Gradient\b/g) ?? []).length;
console.log(`${file}: viewBox ${viewBox ?? "-"} | ${Object.entries(counts).map(([t, n]) => `${t} ${n}`).join(", ")} | gradients ${gradients} | ids ${ids.size}`);
for (const w of warnings) console.log(`warn: ${w}`);
for (const e of errors) console.log(`ERROR: ${e}`);
console.log(errors.length ? `FAIL (${errors.length} error(s))` : "OK");
process.exit(errors.length ? 1 : 0);
