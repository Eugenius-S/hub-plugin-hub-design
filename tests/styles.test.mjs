import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { AXES, PAGE, STR, chosen, filtered, listQuery, pager, t, textOn, toggled } from "../styles.js";
import { setLangSource } from "../i18n.js";

const cyr = /[Ѐ-ӿ]/;
test.beforeEach(() => setLangSource(() => "en"));

test("styles: en and ru tables have the same keys and placeholders, English has no Cyrillic, Russian has", () => {
  assert.deepEqual(Object.keys(STR.ru).sort(), Object.keys(STR.en).sort());
  const ph = (s) => (s.match(/\{\w+\}/g) || []).sort().join();
  for (const k of Object.keys(STR.en)) {
    assert.equal(ph(STR.ru[k]), ph(STR.en[k]), k);
    assert.ok(!cyr.test(STR.en[k]), k);
  }
  const words = Object.values(STR.ru).filter((v) => cyr.test(v)).length;
  assert.ok(words > Object.keys(STR.ru).length * 0.9);   // a few keys are only placeholders
});

test("styles: every key used by t() exists, and no Russian is left outside the table", () => {
  const src = readFileSync(new URL("../styles.js", import.meta.url), "utf8");
  const table = src.slice(src.indexOf("export const STR = {"), src.indexOf("\n};", src.indexOf("export const STR = {")) + 3);
  for (const m of src.matchAll(/\bt\(\s*"(\w+)"/g)) assert.ok(m[1] in STR.en, m[1]);
  assert.ok(!cyr.test(src.replace(table, "")), "Cyrillic outside the table");
  const main = readFileSync(new URL("../main.js", import.meta.url), "utf8");
  for (const m of main.matchAll(/\bts\(\s*"(\w+)"/g)) assert.ok(m[1] in STR.en, m[1]);
});

test("styles: the words follow the hub language at the moment of the call", () => {
  assert.equal(t("chip", { name: "Marlin" }), "Style: Marlin");
  setLangSource(() => "ru");
  assert.equal(t("chip", { name: "Marlin" }), "Стиль: Marlin");
});

test("pager: pages, neighbours, an empty result is one page, an offset past the end is the last page", () => {
  assert.deepEqual(pager(100, 0), { page: 1, pages: 5, prev: null, next: PAGE });
  assert.deepEqual(pager(100, PAGE), { page: 2, pages: 5, prev: 0, next: 2 * PAGE });
  assert.deepEqual(pager(100, 4 * PAGE), { page: 5, pages: 5, prev: 3 * PAGE, next: null });
  assert.deepEqual(pager(0, 0), { page: 1, pages: 1, prev: null, next: null });
  assert.deepEqual(pager(24, 0), { page: 1, pages: 1, prev: null, next: null });
  assert.equal(pager(25, 0).pages, 2);
  assert.equal(pager(30, 9999).page, 2);
  assert.equal(pager(30, -5).page, 1);
});

test("the request: trimmed words, the category, the page; one screen at a time by default", () => {
  assert.equal(listQuery({ q: "  blue  neon ", cat: "Dark & more", offset: 48 }), `q=blue++neon&cat=Dark+%26+more&offset=48&limit=${PAGE}`);
  assert.equal(listQuery(), `q=&cat=&offset=0&limit=${PAGE}`);
  assert.equal(listQuery({ limit: 0 }), "q=&cat=&offset=0&limit=0");
  assert.ok(PAGE <= 30, "the grid never holds a thousand pictures");
});

test("the request carries the chosen labels (known axes, non-empty strings only) and the language", () => {
  assert.deepEqual(AXES, ["theme", "style", "mood", "industry"]);
  assert.equal(listQuery({ q: "dark", f: { theme: "dark", industry: "fintech" }, lang: "ru" }), `q=dark&cat=&offset=0&limit=${PAGE}&theme=dark&industry=fintech&lang=ru`);
  assert.equal(listQuery({ f: { theme: "", style: 5, taste: "x", mood: ["a"] } }), `q=&cat=&offset=0&limit=${PAGE}`);
  assert.equal(listQuery({ f: null }), `q=&cat=&offset=0&limit=${PAGE}`);
});

test("chips: a click sets the label of the axis, the same chip again takes it off, the others stay", () => {
  const f = toggled({ theme: "dark" }, "style", "neon");
  assert.deepEqual(f, { theme: "dark", style: "neon" });
  assert.deepEqual(toggled(f, "style", "neon"), { theme: "dark", style: "" });
  assert.deepEqual(toggled(f, "theme", "light"), { theme: "light", style: "neon" });
  assert.equal(filtered({}), false);
  assert.equal(filtered({ theme: "" }), false);
  assert.equal(filtered(null), false);
  assert.equal(filtered(f), true);
});

test("styles: the new words exist in both languages", () => {
  for (const k of ["search_ph", "ax_theme", "ax_style", "ax_mood", "ax_industry", "labels"]) {
    assert.ok(STR.en[k] && STR.ru[k], k);
  }
});

test("chosen: only an id, a name and a path survive; garbage is nothing", () => {
  assert.deepEqual(chosen({ id: "a1", name: "Marlin", path: "/lib/m.md", extra: 1 }), { id: "a1", name: "Marlin", path: "/lib/m.md" });
  assert.deepEqual(chosen({ id: "a1", path: "/lib/m.md" }), { id: "a1", name: "a1", path: "/lib/m.md" });
  assert.equal(chosen({ id: "a1", name: "x", path: "" }), null);
  assert.equal(chosen({ id: 5, path: "/x" }), null);
  for (const bad of [null, undefined, "x", 7, []]) assert.equal(chosen(bad), null);
  assert.equal(chosen({ id: "a", name: "n".repeat(500), path: "/p" }).name.length, 120);
});

test("textOn: black over light colors, white over dark ones, three and six digits, junk is black", () => {
  assert.equal(textOn("#ffffff"), "#000");
  assert.equal(textOn("#f2f4f7"), "#000");
  assert.equal(textOn("#0b3c5d"), "#fff");
  assert.equal(textOn("#000"), "#fff");
  assert.equal(textOn("#fff"), "#000");
  assert.equal(textOn("#0b3c5dff"), "#fff");
  assert.equal(textOn("nope"), "#000");
  assert.equal(textOn(""), "#000");
});

test("main: the style chip, once-only sending and no style on auto-send are in place", () => {
  const main = readFileSync(new URL("../main.js", import.meta.url), "utf8").replace(/\r\n/g, "\n");
  const auto = main.slice(main.indexOf("async function autoSend()"), main.indexOf("\n}\n", main.indexOf("async function autoSend()")));
  assert.ok(!/style/.test(auto.replace('comments: [], notes: [], errors: []', "")), "auto-send of hand edits never carries a style");
  assert.match(main, /const batchText = \(extra = \{\}\) => withSel\(message\(\{[\s\S]*style: "", \.\.\.extra \}\)\);/);
  assert.match(main, /onSent: \(\) => \{\n\s+if \(P\.style\) attachStyle\(null\);/);   // the style goes with one message
  assert.match(main, /return withStyle\(b \? b \+ "\\n\\n" \+ text : text\); \}/);   // in a design the style line comes after the selection and the typed text: the last line
  assert.match(main, /return withStyle\(withSave\(newDesignPrefix\(\) \+ text\)\)/);
  const st = readFileSync(new URL("../styles.js", import.meta.url), "utf8").replace(/\r\n/g, "\n");
  assert.match(st, /if \(!ok\) return set\(null\);/);                 // the library is gone: a style kept from before is dropped
  assert.match(st, /=== "404"\) set\(null\)/);                         // and so is one the library no longer has
  assert.match(main, /ts\("chip", \{ name: P\.style\.name \}\)/);
  assert.match(main, /hub\.addStyle\("styles\.css"\)/);
});
