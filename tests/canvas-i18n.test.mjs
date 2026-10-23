import { test } from "node:test";
import assert from "node:assert/strict";
import { STR } from "../canvas.js";

test("canvas: en and ru tables have the same keys and placeholders", () => {
  assert.deepEqual(Object.keys(STR.ru).sort(), Object.keys(STR.en).sort());
  const ph = (s) => (s.match(/\{\w+\}/g) || []).sort().join();
  for (const k of Object.keys(STR.en)) {
    assert.ok(STR.en[k] && STR.ru[k], k);
    assert.equal(ph(STR.ru[k]), ph(STR.en[k]), k);
  }
});

test("canvas: English texts contain no Cyrillic, Russian ones do", () => {
  const cyr = /[Ѐ-ӿ]/;
  for (const [k, v] of Object.entries(STR.en)) assert.ok(!cyr.test(v), k);
  for (const [k, v] of Object.entries(STR.ru)) assert.ok(cyr.test(v), k);
});

test("canvas: every shape named in the menus has a label", () => {
  for (const id of ["free", "arrow", "rect", "oval"]) assert.ok(STR.en["shape_" + id] && STR.ru["shape_" + id], id);
});

test("canvas: a frame says it is loading instead of showing a bare white box (text in both languages, removed on load)", async () => {
  assert.ok(STR.en.frame_loading && STR.ru.frame_loading);
  const { readFileSync } = await import("node:fs");
  const src = readFileSync(new URL("../canvas.js", import.meta.url), "utf8");
  assert.match(src, /hdc-wait/);
  assert.match(src, /wait\.remove\(\)|wait\.hidden = true/);
});
