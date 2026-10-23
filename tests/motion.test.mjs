import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const rd = (f) => readFileSync(new URL("../" + f, import.meta.url), "utf8").replace(/\r\n/g, "\n");

test("motion.css loads last, after the files whose rules it extends", () => {
  const main = rd("main.js");
  assert.match(main, /hub\.addStyle\("navicon\.css"\);\n\s*hub\.addStyle\("motion\.css"\)/);
});

test("motion.css moves only transform and opacity, never transitions all, never enters from scale(0)", () => {
  const css = rd("motion.css");
  assert.ok(!/transition:\s*all/.test(css));
  assert.ok(!/scale\(0\)/.test(css));
  assert.ok(!/ease-in[^-]/.test(css), "no ease-in on UI");
  for (const m of css.matchAll(/@keyframes[^{]+\{([^}]*\{[^}]*\})+\}/g))
    assert.ok(!/\b(width|height|top|left|margin|padding)\s*:/.test(m[0]), m[0]);
  for (const m of css.matchAll(/@starting-style\{([^{}]*\{[^}]*\})\}/g))
    assert.ok(!/\b(width|height|top|left|margin|padding)\s*:/.test(m[1]), m[1]);
});

test("reduced motion zeroes the movement amount, the fades stay", () => {
  const css = rd("motion.css");
  assert.match(css, /@media \(prefers-reduced-motion:reduce\)\{\.hd,\.hdd\{--hd-m:0\}\}/);
  for (const m of css.matchAll(/(translate[XY]?|scale)\(([^()]|\([^()]*\))*\)/g))
    assert.match(m[0], /var\(--hd-m\)/, "every movement scales with --hd-m: " + m[0]);
});
