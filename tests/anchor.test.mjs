import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
const { fingerprint, locate, matches } = createRequire(import.meta.url)("../anchor.js");

// a narrow fake DOM: exactly the properties anchor.js reads
class N {
  constructor(tag, o = {}, kids = []) {
    this.nodeType = 1;
    this.tagName = tag.toUpperCase();
    this.id = o.id || "";
    this.classList = (o.cls || "").split(" ").filter(Boolean);
    this.attrs = o.attrs || {};
    this.own = o.text || "";
    this.rect = o.rect || { x: 0, y: 0, w: 100, h: 20 };
    this.children = kids;
    this.parentElement = null;
    kids.forEach((k) => { k.parentElement = this; });
  }
  getAttribute(k) { return this.attrs[k] ?? null; }
  get textContent() { return [this.own, ...this.children.map((k) => k.textContent)].filter(Boolean).join(" "); }
  all() { return [this, ...this.children.flatMap((k) => k.all())]; }
}
const doc = (root) => {
  const list = root.all();
  const d = {
    getElementById: (id) => list.find((n) => n.id === id) || null,
    getElementsByTagName: (t) => list.filter((n) => n.tagName.toLowerCase() === t),
  };
  list.forEach((n) => { n.getRootNode = () => d; });
  return d;
};
const rectOf = (n) => n.rect;
const card = (title, plan, x, o = {}) => new N("div", { cls: "card", rect: { x, y: 300, w: 280, h: 360 } }, [
  new N("h3", { text: title, rect: { x: x + 20, y: 320, w: 240, h: 30 } }),
  new N("p", { text: plan, rect: { x: x + 20, y: 360, w: 240, h: 20 } }),
  new N("a", { cls: o.cls ?? "btn", text: "Buy", rect: o.rect || { x: x + 20, y: 600, w: 240, h: 44 } }),
]);
const page = (cards) => new N("body", {}, [new N("section", { id: "pricing", rect: { x: 0, y: 200, w: 1000, h: 500 } }, cards)]);
const buyOf = (root, i) => root.all().filter((n) => n.tagName === "A")[i];

test("fingerprint: id, ancestor with an id, tag, text, neighbors, classes, size, place", () => {
  const root = page([card("Start", "Free", 40), card("Pro", "9 $", 340)]);
  const el = buyOf(root, 1);
  const fp = fingerprint(el, el.rect);
  assert.equal(fp.id, "");
  assert.equal(fp.anc, "pricing");
  assert.deepEqual(fp.path, ["div", "a"]);
  assert.equal(fp.tag, "a");
  assert.equal(fp.text, "Buy");
  assert.equal(fp.near, "Pro 9 $ Buy");
  assert.deepEqual(fp.cls, ["btn"]);
  assert.deepEqual([fp.w, fp.h, fp.x, fp.y], [240, 44, 360, 600]);
});

test("relayout without an id: the pin finds its button by fingerprint, not by order", () => {
  const before = page([card("Start", "Free", 40), card("Pro", "9 $", 340), card("Team", "29 $", 640)]);
  const el = buyOf(before, 1);
  const fp = fingerprint(el, el.rect);
  // after the designer's edit: the button class differs, the cards are in another order and shifted a bit, a new card was added
  const after = page([card("Team", "29 $", 40, { cls: "cta" }), card("Pro", "9 $", 360, { cls: "cta", rect: { x: 380, y: 612, w: 240, h: 44 } }), card("Start", "Free", 680, { cls: "cta" }), card("Enterprise", "on request", 1000, { cls: "cta" })]);
  const hit = locate(fp, doc(after), rectOf);
  assert.ok(hit, "element found");
  assert.equal(hit.el, buyOf(after, 1));
});

test("the id stayed: found at once, wherever the block moved", () => {
  const before = new N("body", {}, [new N("button", { id: "go", text: "Go", rect: { x: 10, y: 10, w: 50, h: 20 } })]);
  const fp = fingerprint(before.children[0], before.children[0].rect);
  const after = new N("body", {}, [new N("div", {}, [new N("button", { id: "go", text: "Let's go", rect: { x: 900, y: 900, w: 90, h: 30 } })])]);
  assert.equal(locate(fp, doc(after), rectOf).el, after.children[0].children[0]);
});

test("the element is gone: not found, never lands on a foreign one", () => {
  const before = page([card("Start", "Free", 40), card("Pro", "9 $", 340)]);
  const el = buyOf(before, 1);
  const fp = fingerprint(el, el.rect);
  const after = page([card("Start", "Free", 40)]);
  assert.equal(locate(fp, doc(after), rectOf), null);
  // and a totally different element of the same tag in the same place is not it either
  const other = new N("body", {}, [new N("a", { text: "Blog", attrs: { href: "/blog" }, rect: { x: 360, y: 600, w: 60, h: 18 } })]);
  assert.equal(locate(fp, doc(other), rectOf), null);
});

test("twins that cannot be told apart: not found (no guessing)", () => {
  const a = new N("li", { cls: "item", text: "Same", rect: { x: 0, y: 100, w: 200, h: 20 } });
  const b = new N("li", { cls: "item", text: "Same", rect: { x: 0, y: 100, w: 200, h: 20 } });
  const root = new N("body", {}, [new N("ul", {}, [a, b])]);
  const fp = fingerprint(a, a.rect);
  assert.equal(locate(fp, doc(root), rectOf), null);
});

test("the selector hit a foreign element: matches sees it", () => {
  const before = page([card("Start", "Free", 40), card("Pro", "9 $", 340)]);
  const el = buyOf(before, 1);
  const fp = fingerprint(el, el.rect);
  const after = page([card("Start", "Free", 40), card("Pro", "9 $", 340)]);
  assert.ok(matches(fp, buyOf(after, 1), rectOf), "the same element");
  assert.ok(!matches(fp, buyOf(after, 0), rectOf), "the neighbor button is not it");
});

test("a text edit on the canvas does not break the anchor", () => {
  const root = page([card("Start", "Free", 40), card("Pro", "9 $", 340)]);
  const el = buyOf(root, 1);
  const fp = fingerprint(el, el.rect);
  el.own = "Buy now";
  assert.equal(locate(fp, doc(root), rectOf).el, el);
});

test("non-Latin text still anchors (words are matched as Unicode letters)", () => {
  // deliberately not Latin: the fingerprint must not depend on the script of the design
  const mk = (x) => new N("body", {}, [new N("a", { cls: "btn", text: "Café 日本", rect: { x, y: 600, w: 240, h: 44 } })]);
  const before = mk(40);
  const fp = fingerprint(before.children[0], before.children[0].rect);
  assert.equal(fp.text, "Café 日本");
  const after = mk(60);
  assert.equal(locate(fp, doc(after), rectOf).el, after.children[0]);
});
