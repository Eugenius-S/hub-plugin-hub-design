// The start screen toolbar and the Style button: the owner's fixes of 23.10 (sort icon, kebab does not turn on hover, search always open,
// the Style hover spreads as a circle from the palette, the second press closes the window).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { CANVAS_ICONS as CI } from "../icons.js";
import { spread } from "../lib.js";

const rd = (f) => readFileSync(new URL("../" + f, import.meta.url), "utf8").replace(/\r\n/g, "\n");

test("sort button: its own up-and-down arrows icon, not the sliders of the frame menu", () => {
  assert.ok(CI.sort && CI.sort !== CI.sliders);
  assert.match(rd("dashboard.js"), /tool\("sort", \(\) => \{ S\.sort/);
  assert.match(rd("dashboard.js"), /bSort\.title = t\("sort"\)/, "the title stays");
});

test("kebab: tilted by the rotate property, so the hover swell (transform) does not turn it", () => {
  const css = rd("dashboard.css");
  assert.match(css, /\.hdd-more svg\{rotate:90deg\}/);
  assert.ok(!/\.hdd-more[^{]*\{[^}]*transform/.test(css));
  const hover = rd("motion.css").match(/:hover :is\(svg,\.hdc-i\)\{\s*transform:[^}]*\}/);
  assert.ok(hover, "the swell is a transform");
});

test("search is always open: no toggle button, no hidden state, the magnifier sits in the field", () => {
  const js = rd("dashboard.js");
  assert.ok(!/bSearch|S\.search|search\.hidden/.test(js));
  assert.match(js, /tools\.append\(searchBox, bView, bSort, bMore\)/);
  assert.match(js, /searchBox\.innerHTML = CI\.search/);
  assert.match(rd("dashboard.css"), /\.hdd-sbox>svg\{position:absolute/);
});

test("Style hover: a circle clip-path from the palette, 300-420 ms ease-out, nothing scaled, reduced motion without animation", () => {
  const css = rd("motion.css");
  assert.match(css, /\.hd-style::before\{[^}]*clip-path:circle\(0px at var\(--hd-cx/);
  assert.match(css, /\.hd-style-w:hover \.hd-style::before\{\s*clip-path:circle\(var\(--hd-r,\s*400px\) at var\(--hd-cx[^}]*transition:clip-path (3\d\d|4[01]\d)ms var\(--hd-ease-out\)/);
  const block = css.slice(css.indexOf("/* style button:"), css.indexOf("@keyframes hd-sweep"));
  assert.ok(!/scale\(/.test(block), "no scale: the circle is clipped, not scaled");
  assert.match(css, /prefers-reduced-motion:reduce\)\{\.hd-style::before[^}]*transition:none;animation:none/);
  assert.match(rd("icon-filled.svg"), /fill-rule="evenodd"/, "the filled palette has holes");
});

test("Style button: the circle starts at the centre of the palette and reaches the farthest corner", () => {
  const box = { left: 100, top: 50, width: 200, height: 36 };
  const dot = { left: 112, top: 58, width: 20, height: 20 };   // centre (122, 68) -> (22, 18) inside the button
  const c = spread(box, dot);
  assert.deepEqual([c.x, c.y], [22, 18]);
  assert.ok(c.r >= Math.hypot(200 - 22, 36 - 18), "covers the far corner");
  assert.ok(c.r < Math.hypot(200 - 22, 36 - 18) + 4);
  const wide = spread({ ...box, width: 300 }, dot);
  assert.ok(wide.r > c.r, "a longer label - a longer way");
});

test("Style button: the second press closes the open window, aria-expanded follows it", () => {
  const main = rd("main.js");
  assert.match(main, /st\.node\.hidden \? st\.open\(\) : st\.close\(\)/);
  assert.match(main, /styleOpen\.setAttribute\("aria-expanded", String\(!st\.node\.hidden\)\)/);
});
