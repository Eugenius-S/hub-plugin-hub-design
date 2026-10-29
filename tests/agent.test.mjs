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

test("agent: a drag goes on from the shift the element already has (from the file), it does not snap back to 0", () => {
  const a = src.indexOf("const parseShift");
  assert.ok(a > 0, "parseShift found");
  const parseShift = new Function(src.slice(a, src.indexOf("\n  };", a) + 5) + "\nreturn parseShift;")();
  assert.deepEqual(parseShift("10px -5.5px"), [10, -5.5]);
  assert.deepEqual(parseShift("12px"), [12, 0]);
  assert.deepEqual(parseShift("-3px 0px"), [-3, 0]);
  for (const v of ["none", "", null, undefined, "50% 0px", "1em 2em"]) assert.deepEqual(parseShift(v), [0, 0], String(v));
  const track = src.slice(src.indexOf("function track(el)"), src.indexOf("const report = (el)"));
  assert.match(track, /parseShift\(el\.style\.translate \|\| getComputedStyle\(el\)\.translate\)/);
  assert.match(track, /dx: sx, dy: sy/);
});

test("agent: a click on a part of an inline svg icon (path, use, g, a nested svg) picks the whole icon", () => {
  const line = src.split("\n").find((l) => l.includes("const target = (el) =>"));
  assert.ok(line, "target() found");
  const target = new Function(line + "\nreturn target;")();
  const svg = { tagName: "svg", ownerSVGElement: null };
  const inner = { tagName: "svg", ownerSVGElement: svg };
  const g = { tagName: "g", ownerSVGElement: inner };
  const use = { tagName: "use", ownerSVGElement: inner };
  assert.equal(target(use), svg);
  assert.equal(target(g), svg);
  assert.equal(target(inner), svg);
  assert.equal(target(svg), svg);
  const p = { tagName: "P" };
  assert.equal(target(p), p);
  assert.equal(target(null), null);
  // hover, press, double click, a comment pin and the point lookups all go through it
  const body = (from, to) => src.slice(src.indexOf(from), src.indexOf(to, src.indexOf(from)));
  assert.match(body('addEventListener("pointerdown"', 'addEventListener("pointerup"'), /const el = target\(e\.target\)/);
  assert.match(body('addEventListener("dblclick"', "const wheelOut"), /const el = target\(e\.target\)/);
  assert.match(body('addEventListener("click"', 'addEventListener("dblclick"'), /pickable\(target\(e\.target\)\)/);
  assert.match(body("const at = (x, y)", "};"), /return target\(el\)/);
  assert.match(src, /const el = target\(e\.target\);\n\s*showHover/);
});

test("agent: an inline element (code, span, a link in a paragraph) becomes inline-block on its first move, so the shift shows", () => {
  const a = src.indexOf("const BOXED");
  assert.ok(a > 0, "BOXED found");
  const unInline = new Function(src.slice(a, src.indexOf("\n", src.indexOf("const unInline"))) + "\nreturn unInline;")();
  assert.equal(unInline("inline", "code"), "inline-block");
  assert.equal(unInline("inline", "span"), "inline-block");
  assert.equal(unInline("inline", "a"), "inline-block");
  for (const tag of ["img", "svg", "video", "canvas", "input", "button"]) assert.equal(unInline("inline", tag), null, tag);
  for (const d of ["block", "inline-block", "flex", "inline-flex", "grid", "contents"]) assert.equal(unInline(d, "span"), null, d);
  // it is a recorded style (undo drops it, the file gets it), set only once the drag really moves
  const move = src.slice(src.indexOf("if (drag) {\n      const ddx"), src.indexOf("paintState(drag.el);"));
  assert.match(move, /if \(!drag\.moved && Math\.abs\(ddx\) \+ Math\.abs\(ddy\) > 2\) \{/);
  assert.match(move, /s\.css\.display = \{ from: "inline", to: d \}/);
});

test("agent: while dragged the element ignores the design's own transition, on release its style is rebuilt from the record", () => {
  const move = src.slice(src.indexOf("if (drag) {\n      const ddx"), src.indexOf("return stop(e);", src.indexOf("if (drag) {\n      const ddx")));
  assert.match(move, /paintState\(drag\.el\);\n\s*drag\.el\.style\.transition = "none";/);
  const up = src.slice(src.indexOf('addEventListener("pointerup"'), src.indexOf('for (const type of ["mousedown"'));
  assert.match(up, /if \(d\.moved\) \{ paintState\(d\.el\); commit\(d\.el, d\.before\); \}/);
});

test("agent: Alt+click or a second click in place reaches the next layer under the cursor (covered elements, not only parents)", () => {
  const line = src.split("\n").find((l) => l.includes("const nextLayer = (stack, cur) =>"));
  assert.ok(line, "nextLayer() found");
  const nextLayer = new Function(line + "\nreturn nextLayer;")();
  const mk = (name, kids = []) => { const n = { name, kids }; n.contains = (o) => o === n || kids.some((k) => k.contains(o)); return n; };
  const top = mk("top"), low = mk("low"), wrap = mk("wrap", [top, low]);
  const stack = [top, low, wrap];   // elementsFromPoint order: the front first
  assert.equal(nextLayer(stack, null), top, "nothing picked: the front");
  assert.equal(nextLayer(stack, top), low, "the covered sibling, not the parent");
  assert.equal(nextLayer(stack, low), top, "a parent is skipped (the up button reaches it): round again");
  assert.equal(nextLayer(stack, wrap), top, "from the parent: the front");
  assert.equal(nextLayer([top], top), top);
  // the press handler wires it: Alt on release without a move, a repeat click after the double-click pause
  const up = src.slice(src.indexOf('addEventListener("pointerup"'), src.indexOf('for (const type of ["mousedown"'));
  assert.match(up, /cycle\(/);
  assert.match(src, /elementsFromPoint/);
});
