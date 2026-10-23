import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { AXES, DEFAULT_ID, HOVER_MS, PAGE, STR, chosen, coverInView, coverOnHover, defaultStyle, filtered, listQuery, pager, t, textOn, toggled } from "../styles.js";
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
  assert.deepEqual(AXES, ["medium", "theme", "style", "mood", "industry", "density"]);
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
  for (const k of ["search_ph", "ax_medium", "ax_theme", "ax_style", "ax_mood", "ax_industry", "ax_density", "labels"]) {
    assert.ok(STR.en[k] && STR.ru[k], k);
  }
});

test("the default style from the answer of the plugin process: only the id, a name, the path of the file and the picture flag; anything else is none", () => {
  assert.equal(DEFAULT_ID, "__default");
  assert.deepEqual(defaultStyle({ id: DEFAULT_ID, name: "Inkwell", path: "/d/DESIGN.md", preview: true, extra: 1 }), { id: DEFAULT_ID, name: "Inkwell", path: "/d/DESIGN.md", preview: true });
  assert.deepEqual(defaultStyle({ id: DEFAULT_ID, path: "/d/DESIGN.md" }), { id: DEFAULT_ID, name: DEFAULT_ID, path: "/d/DESIGN.md", preview: false });
  assert.equal(defaultStyle({ id: DEFAULT_ID, name: "x", path: "" }), null);
  assert.equal(defaultStyle({ id: "a1", name: "x", path: "/p" }), null);
  for (const bad of [null, undefined, "x", 7]) assert.equal(defaultStyle(bad), null);
  assert.equal(defaultStyle({ id: DEFAULT_ID, name: "n".repeat(500), path: "/p" }).name.length, 120);
});

test("the words of the default style exist in both languages", () => {
  for (const k of ["def_badge", "def_chip", "def_on", "def_use"]) assert.ok(STR.en[k] && STR.ru[k], k);
  assert.match(STR.en.def_chip, /\{name\}/);
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

// --- the moving cover: made on hover, removed on leave, one at a time ---
function fakeCard() {
  const doc = { made: [], createElement() { const v = fakeVideo(); doc.made.push(v); return v; } };
  const on = {};
  const card = { ownerDocument: doc, children: [], addEventListener(n, f) { on[n] = f; }, append(v) { card.children.push(v); v.parent = card; } };
  return { card, doc, on };
}
function fakeVideo() {
  const on = {};
  const v = { className: "", muted: false, loop: false, src: "", played: 0, paused: 0, removed: false, attrs: {}, classes: new Set(), plays: Promise.resolve(),
    addEventListener(n, f) { on[n] = f; }, fire(n) { on[n] && on[n](); },
    setAttribute(k, x) { v.attrs[k] = x; }, removeAttribute(k) { delete v.attrs[k]; if (k === "src") v.src = ""; },
    classList: { add(c) { v.classes.add(c); } }, play() { v.played++; return v.plays; }, pause() { v.paused++; }, load() {}, remove() { v.removed = true; if (v.parent) v.parent.children = v.parent.children.filter((c) => c !== v); } };
  return v;
}
function clock() {
  const c = { t: null, set(f, ms) { c.t = { f, ms }; return 1; }, clear() { c.t = null; }, fire() { const x = c.t; c.t = null; x && x.f(); } };
  return c;
}

test("cover: nothing is made until the pointer stays, then one silent looping <video> that fades in when it has a frame", () => {
  const { card, doc, on } = fakeCard(), c = clock();
  coverOnHover(card, card, () => "/c?id=a", { setTimer: c.set.bind(c), clearTimer: c.clear.bind(c) });
  assert.equal(doc.made.length, 0);   // a card on the page costs nothing
  on.pointerenter({ pointerType: "mouse" });
  assert.equal(c.t.ms, HOVER_MS);
  assert.equal(doc.made.length, 0);   // still not: a pointer passing over the grid loads nothing
  c.fire();
  const [v] = doc.made;
  assert.deepEqual([v.src, v.muted, v.loop, v.attrs.muted, v.played, card.children.length], ["/c?id=a", true, true, "", 1, 1]);
  assert.ok(!v.classes.has("on"));   // the still picture shows until the first frame
  v.fire("loadeddata");
  assert.ok(v.classes.has("on"));
  on.pointerleave();
  assert.deepEqual([v.removed, v.paused, v.src, card.children.length], [true, 1, "", 0]);   // the download is dropped with the element
});

test("cover: a pointer that leaves before the stay ends makes nothing; touch makes nothing", () => {
  const { card, doc, on } = fakeCard(), c = clock();
  coverOnHover(card, card, () => "/c", { setTimer: c.set.bind(c), clearTimer: c.clear.bind(c) });
  on.pointerenter({ pointerType: "mouse" });
  on.pointerleave();
  assert.equal(c.t, null);
  on.pointerenter({ pointerType: "touch" });
  assert.equal(c.t, null);
  assert.equal(doc.made.length, 0);
});

test("cover: only one plays at a time, and a cover that fails to play goes away leaving the still picture", () => {
  const a = fakeCard(), b = fakeCard(), c = clock();
  const opts = { setTimer: c.set.bind(c), clearTimer: c.clear.bind(c) };
  coverOnHover(a.card, a.card, () => "/a", opts);
  coverOnHover(b.card, b.card, () => "/b", opts);
  a.on.pointerenter({}); c.fire();
  b.on.pointerenter({}); c.fire();   // the first one never got its leave (a re-render, a lost event): the next one stops it
  assert.equal(a.doc.made[0].removed, true);
  assert.equal(b.card.children.length, 1);
  b.doc.made[0].fire("error");
  assert.equal(b.card.children.length, 0);
  const d = fakeCard();
  coverOnHover(d.card, d.card, () => "/d", opts);
  d.doc.createElement = () => { const v = fakeVideo(); v.plays = Promise.reject(new Error("NotAllowed")); d.doc.made.push(v); return v; };
  d.on.pointerenter({}); c.fire();
  return Promise.resolve().then(() => Promise.resolve()).then(() => assert.equal(d.card.children.length, 0));
});

test("cover: the card and the big picture make the video only through the hover (no <video> in the source of a card)", () => {
  const src = readFileSync(new URL("../styles.js", import.meta.url), "utf8");
  assert.equal([...src.matchAll(/createElement\("video"\)/g)].length, 1);   // the one place: mountCover (the hover and the view both use it)
  assert.ok(!/el\("video"/.test(src));
});

// --- the covers of the list: all at once, only the ones in view ---
function fakeObserver() {
  const o = { made: [] };
  o.Observer = class { constructor(cb) { this.cb = cb; this.watched = []; this.off = false; o.made.push(this); } observe(n) { this.watched.push(n); } disconnect() { this.off = true; } };
  return o;
}

test("in view: many covers play at once, each only while its card is on the screen; leaving stops and drops the download", () => {
  const o = fakeObserver(), a = fakeCard(), b = fakeCard();
  coverInView(a.card, a.card, () => "/a", { Observer: o.Observer });
  coverInView(b.card, b.card, () => "/b", { Observer: o.Observer });
  assert.equal(a.doc.made.length + b.doc.made.length, 0);   // nothing is made for a card nobody sees
  o.made[0].cb([{ isIntersecting: true }]);
  o.made[1].cb([{ isIntersecting: true }]);
  assert.deepEqual([a.doc.made[0].played, b.doc.made[0].played, a.doc.made[0].removed], [1, 1, false]);   // both play together
  o.made[0].cb([{ isIntersecting: true }]);
  assert.equal(a.doc.made.length, 1);   // still in view: not made again
  o.made[0].cb([{ isIntersecting: false }]);
  assert.deepEqual([a.doc.made[0].removed, a.doc.made[0].paused, a.doc.made[0].src, b.doc.made[0].removed], [true, 1, "", false]);
  o.made[0].cb([{ isIntersecting: true }]);   // back in view: plays again
  assert.equal(a.doc.made.length, 2);
});

test("in view: the stop frees the video and the observer; a failing cover leaves the still picture; reduced motion and no observer make nothing", () => {
  const o = fakeObserver(), a = fakeCard();
  const stop = coverInView(a.card, a.card, () => "/a", { Observer: o.Observer });
  o.made[0].cb([{ isIntersecting: true }]);
  stop();
  assert.deepEqual([a.doc.made[0].removed, o.made[0].off], [true, true]);
  const f = fakeCard(), o2 = fakeObserver();
  coverInView(f.card, f.card, () => "/f", { Observer: o2.Observer });
  o2.made[0].cb([{ isIntersecting: true }]);
  f.doc.made[0].fire("error");
  assert.deepEqual([f.card.children.length, o2.made[0].off], [0, true]);
  const n = fakeCard();
  coverInView(n.card, n.card, () => "/n", { Observer: undefined });
  assert.equal(n.doc.made.length, 0);
  globalThis.matchMedia = () => ({ matches: true });
  try {
    const r = fakeCard(), o3 = fakeObserver();
    coverInView(r.card, r.card, () => "/r", { Observer: o3.Observer });
    assert.equal(o3.made.length, 0);   // reduced motion: not even an observer
  } finally { delete globalThis.matchMedia; }
});
