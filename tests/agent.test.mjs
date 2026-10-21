import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// agent.js is a classic script injected into the design: it cannot be imported, so the tests read its source
const src = readFileSync(new URL("../agent.js", import.meta.url), "utf8");
const early = readFileSync(new URL("../early.js", import.meta.url), "utf8");
const cyr = /[Ѐ-ӿ]/;

// the block with the tables and the translator, run with a switchable language
function translator() {
  const a = src.indexOf("const STR = {");
  const b = src.indexOf("const normLang");
  assert.ok(a > 0 && b > a, "STR / t / normLang block found");
  const end = src.indexOf("\n", b);
  const body = src.slice(a, end) + "\nreturn { STR, t, normLang, setLang(l) { lang = normLang(l); } };";
  return new Function(body)();
}

test("agent: en and ru tables have the same keys, all texts filled", () => {
  const { STR } = translator();
  assert.deepEqual(Object.keys(STR.ru).sort(), Object.keys(STR.en).sort());
  for (const k of Object.keys(STR.en)) assert.ok(STR.en[k] && STR.ru[k], k);
});

test("agent: English texts contain no Cyrillic, Russian ones do", () => {
  const { STR } = translator();
  for (const [k, v] of Object.entries(STR.en)) assert.ok(!cyr.test(v), k);
  for (const [k, v] of Object.entries(STR.ru)) assert.ok(cyr.test(v), k);
});

test("agent: Russian lives only in the ru table", () => {
  const a = src.indexOf("    ru: {");
  const b = src.indexOf("    },", a);
  assert.ok(a > 0 && b > a, "ru table found");
  const rest = src.slice(0, a) + src.slice(b);
  const bad = rest.split(/\r?\n/).map((l, i) => [i + 1, l]).filter(([, l]) => cyr.test(l));
  assert.deepEqual(bad, []);
});

test("agent: language switching and fallback", () => {
  const x = translator();
  assert.equal(x.t("send"), "Send");                 // English until the page says otherwise
  x.setLang("ru");
  assert.equal(x.t("send"), x.STR.ru.send);
  assert.notEqual(x.t("send"), "Send");
  x.setLang("ru-RU");
  assert.equal(x.t("close"), x.STR.ru.close);
  for (const l of ["en", "de", "fr-CA", "", null, undefined]) {
    x.setLang(l);
    assert.equal(x.t("close"), x.STR.en.close, String(l));   // any language but ru shows English
  }
  assert.equal(x.t("no_such_key"), "no_such_key");   // never undefined on a screen
});

test("agent: every text used by the overlay has a key in both tables", () => {
  const { STR } = translator();
  const keys = new Set([...src.matchAll(/\bt\("(\w+)"\)/g)].map((m) => m[1]));
  const labels = src.slice(src.indexOf("const LABELS = ["), src.indexOf("function applyLabels"));
  for (const m of labels.matchAll(/"(\w+)"\]/g)) keys.add(m[1]);
  assert.ok(keys.size >= 9, [...keys].join());
  for (const k of keys) assert.ok(STR.en[k] && STR.ru[k], k);
});

test("agent: the page language arrives in hello and theme and re-labels the overlay", () => {
  const hello = src.slice(src.indexOf('m.t === "hello"'), src.indexOf('m.t === "theme"'));
  const theme = src.slice(src.indexOf('m.t === "theme"'));
  assert.match(hello, /setLang\(m\.lang\)/);
  assert.match(theme.slice(0, 300), /setLang\(m\.lang\)/);
  const fn = src.slice(src.indexOf("function setLang"), src.indexOf("function setLang") + 300);
  assert.match(fn, /applyLabels\(\)/);
  assert.match(fn, /drawPins\(\)/);   // pin tooltips are texts too
  // the static title attributes are not baked into the template: they come from applyLabels
  assert.doesNotMatch(src, /<button class="up" title=/);
});

test("early.js: English only, the error texts included", () => {
  assert.ok(!cyr.test(early));
  assert.match(early, /Unhandled promise rejection: /);
});
