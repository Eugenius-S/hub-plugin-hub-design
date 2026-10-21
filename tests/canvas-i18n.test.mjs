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
