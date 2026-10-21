import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// main.js needs a browser page, so its string table is read from the source text
const src = readFileSync(new URL("../main.js", import.meta.url), "utf8");
const table = src.slice(src.indexOf("const STR = {") + "const STR = ".length, src.indexOf("\n};", src.indexOf("const STR = {")) + 2);
const STR = new Function(`return ${table}`)();
const cyr = /[\u0400-\u04FF]/;

test("main: en and ru tables have the same keys and placeholders", () => {
  assert.deepEqual(Object.keys(STR.ru).sort(), Object.keys(STR.en).sort());
  const ph = (s) => (s.match(/\{\w+\}/g) || []).sort().join();
  for (const k of Object.keys(STR.en)) assert.equal(ph(STR.ru[k]), ph(STR.en[k]), k);
});

test("main: English texts contain no Cyrillic, Russian ones do", () => {
  for (const [k, v] of Object.entries(STR.en)) assert.ok(!cyr.test(v), k);
  for (const [k, v] of Object.entries(STR.ru)) assert.ok(cyr.test(v), k);
});

test("main: every key used by tr() exists, and no Russian is left outside the table", () => {
  const used = new Set([...src.matchAll(/\btr\(\s*"(\w+)"/g)].map((m) => m[1]));
  for (const k of ["q_failed", "q_removed"]) used.add(k);   // chosen with a conditional: tr(cond ? "a" : "b")
  for (const k of used) assert.ok(k in STR.en, k);
  const rest = src.replace(table, "");
  assert.ok(!cyr.test(rest), "Cyrillic outside the ru table");
});
