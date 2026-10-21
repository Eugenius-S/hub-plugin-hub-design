import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
const { fingerprint, locate, matches } = createRequire(import.meta.url)("../anchor.js");

// узкий поддельный DOM: ровно те свойства, которые читает anchor.js
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
  new N("a", { cls: o.cls ?? "btn", text: "Купить", rect: o.rect || { x: x + 20, y: 600, w: 240, h: 44 } }),
]);
const page = (cards) => new N("body", {}, [new N("section", { id: "pricing", rect: { x: 0, y: 200, w: 1000, h: 500 } }, cards)]);
const buyOf = (root, i) => root.all().filter((n) => n.tagName === "A")[i];

test("приметы: id, предок с id, тег, текст, соседи, классы, размер, место", () => {
  const root = page([card("Start", "Free", 40), card("Pro", "9 $", 340)]);
  const el = buyOf(root, 1);
  const fp = fingerprint(el, el.rect);
  assert.equal(fp.id, "");
  assert.equal(fp.anc, "pricing");
  assert.deepEqual(fp.path, ["div", "a"]);
  assert.equal(fp.tag, "a");
  assert.equal(fp.text, "Купить");
  assert.equal(fp.near, "Pro 9 $ Купить");
  assert.deepEqual(fp.cls, ["btn"]);
  assert.deepEqual([fp.w, fp.h, fp.x, fp.y], [240, 44, 360, 600]);
});

test("перевёрстка без id: пин находит свою кнопку по приметам, а не по порядку", () => {
  const before = page([card("Start", "Free", 40), card("Pro", "9 $", 340), card("Team", "29 $", 640)]);
  const el = buyOf(before, 1);
  const fp = fingerprint(el, el.rect);
  // после правки дизайнера: класс кнопки другой, карточки в другом порядке и чуть сдвинуты, добавилась новая карточка
  const after = page([card("Team", "29 $", 40, { cls: "cta" }), card("Pro", "9 $", 360, { cls: "cta", rect: { x: 380, y: 612, w: 240, h: 44 } }), card("Start", "Free", 680, { cls: "cta" }), card("Enterprise", "по запросу", 1000, { cls: "cta" })]);
  const hit = locate(fp, doc(after), rectOf);
  assert.ok(hit, "элемент найден");
  assert.equal(hit.el, buyOf(after, 1));
});

test("id остался — находим сразу, куда бы блок ни переехал", () => {
  const before = new N("body", {}, [new N("button", { id: "go", text: "Go", rect: { x: 10, y: 10, w: 50, h: 20 } })]);
  const fp = fingerprint(before.children[0], before.children[0].rect);
  const after = new N("body", {}, [new N("div", {}, [new N("button", { id: "go", text: "Поехали", rect: { x: 900, y: 900, w: 90, h: 30 } })])]);
  assert.equal(locate(fp, doc(after), rectOf).el, after.children[0].children[0]);
});

test("элемент удалён — не найден, на чужой не садится", () => {
  const before = page([card("Start", "Free", 40), card("Pro", "9 $", 340)]);
  const el = buyOf(before, 1);
  const fp = fingerprint(el, el.rect);
  const after = page([card("Start", "Free", 40)]);
  assert.equal(locate(fp, doc(after), rectOf), null);
  // и совсем другой элемент того же тега в том же месте — тоже не он
  const other = new N("body", {}, [new N("a", { text: "Блог", attrs: { href: "/blog" }, rect: { x: 360, y: 600, w: 60, h: 18 } })]);
  assert.equal(locate(fp, doc(other), rectOf), null);
});

test("двойники, которых не различить, — не найден (выбирать наугад нельзя)", () => {
  const a = new N("li", { cls: "item", text: "Same", rect: { x: 0, y: 100, w: 200, h: 20 } });
  const b = new N("li", { cls: "item", text: "Same", rect: { x: 0, y: 100, w: 200, h: 20 } });
  const root = new N("body", {}, [new N("ul", {}, [a, b])]);
  const fp = fingerprint(a, a.rect);
  assert.equal(locate(fp, doc(root), rectOf), null);
});

test("селектор попал в чужой элемент — matches это видит", () => {
  const before = page([card("Start", "Free", 40), card("Pro", "9 $", 340)]);
  const el = buyOf(before, 1);
  const fp = fingerprint(el, el.rect);
  const after = page([card("Start", "Free", 40), card("Pro", "9 $", 340)]);
  assert.ok(matches(fp, buyOf(after, 1), rectOf), "тот же элемент");
  assert.ok(!matches(fp, buyOf(after, 0), rectOf), "соседняя кнопка — не он");
});

test("правка текста на холсте не ломает привязку", () => {
  const root = page([card("Start", "Free", 40), card("Pro", "9 $", 340)]);
  const el = buyOf(root, 1);
  const fp = fingerprint(el, el.rect);
  el.own = "Купить сейчас";
  assert.equal(locate(fp, doc(root), rectOf).el, el);
});
