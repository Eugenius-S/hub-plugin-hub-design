import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (f) => readFileSync(new URL(`../${f}`, import.meta.url), "utf8");
const main = read("main.js");
const canvas = read("canvas.js");
const icons = read("icons.js");
const css = read("style.css");

test("both panels have a cross and the toolbar button that brings them back", () => {
  for (const k of ["close_chat", "close_props", "props_title"]) assert.equal(main.match(new RegExp(`${k}:`, "g")).length, 2, `${k}: en and ru`);
  assert.match(canvas, /show_chat:/);
  assert.match(canvas, /hdc-left/);
  assert.match(main, /toggleLeft: \(\) =>/);
  assert.match(canvas, /app\.toggleLeft\(\)/);
  assert.doesNotMatch(icons, /panelL/, "the same panel icon, mirrored");
});

test("the choice is kept in the browser and the closed right panel is not reopened by a selection", () => {
  assert.match(main, /STORE \+ "panels"/);
  assert.match(main, /function savePanels/);
  assert.match(main, /d\.right === false\) P\.propsUser = false/);
});

test("the start screen keeps the chat panel, the hide-sidebar corner stays free", () => {
  assert.match(main, /"no-left", !P\.leftOpen && !home\(\)/);
  assert.match(css, /\.hd\.no-left \.hd-left\s*\{\s*display:\s*none/);
  assert.match(css, /html\.hs-hidden \.hd\.no-left \.hdc-bar\s*\{\s*left:\s*48px/);
});
