// The tiles of the other machines on the start screen must not flicker: the dashboard is painted on every snapshot of the hub,
// and a tile (or a card) that is pulled out of the page and put back replays its entrance animation (hd-rise) and reloads its picture.
// A repaint with the same data must not touch the DOM of the area of other machines at all.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createDashboard, place } from "../dashboard.js";
import { setLangSource } from "../i18n.js";

class El {
  constructor(tag, cls = "", log = null) {
    this.tag = tag; this.log = log; this.children = []; this.parentNode = null; this.dataset = {}; this.style = {}; this.attrs = {};
    this.hidden = false; this._text = ""; this.className = cls; this.listeners = {}; this.clientWidth = 0; this.clientHeight = 0;
    const set = new Set(cls.split(" ").filter(Boolean));
    this.classList = { toggle: (c, on) => { const v = on === undefined ? !set.has(c) : !!on; v ? set.add(c) : set.delete(c); return v; }, add: (c) => set.add(c), remove: (c) => set.delete(c), contains: (c) => set.has(c) };
  }
  get firstChild() { return this.children[0] || null; }
  get lastChild() { return this.children[this.children.length - 1] || null; }
  get textContent() { return this._text; }
  set textContent(v) { this._text = String(v); this.children = []; }
  set innerHTML(v) { this._html = v; this.children = []; }
  set src(v) { this._src = v; this.log.srcSets.push(v); }
  get src() { return this._src || ""; }
  setAttribute(k, v) { this.attrs[k] = v; }
  getAttribute(k) { return k in this.attrs ? this.attrs[k] : null; }
  removeAttribute(k) { delete this.attrs[k]; if (k === "src") this._src = ""; }
  addEventListener(t, f) { this.listeners[t] = f; }
  querySelector() { return null; }
  focus() {}
  _in(n, before) {
    if (n.parentNode) n.parentNode.children.splice(n.parentNode.children.indexOf(n), 1);
    n.parentNode = this;
    const i = before ? this.children.indexOf(before) : -1;
    if (i < 0) this.children.push(n); else this.children.splice(i, 0, n);
    this.log.attached.push(n.className);
  }
  append(...ns) { for (const n of ns) if (typeof n !== "string") this._in(n, null); }
  insertBefore(n, before) { this._in(n, before); }
  replaceChildren(...ns) { for (const c of this.children) c.parentNode = null; this.children = []; this.append(...ns); }
  remove() { if (this.parentNode) this.parentNode.children.splice(this.parentNode.children.indexOf(this), 1); this.parentNode = null; }
}

globalThis.ResizeObserver = class { observe() {} unobserve() {} };
globalThis.IntersectionObserver = class { observe() {} unobserve() {} };

function build(peers) {
  const log = { attached: [], srcSets: [] };
  const hub = { el: (tag, cls, text) => { const e = new El(tag, cls, log); if (text) e.textContent = text; return e; } };
  let current = peers;
  const app = {
    hub, files: () => [], dirs: () => [], mine: () => new Set(), fileState: () => "ok", alive: () => true, fileUrl: () => "", open() {},
    peers: () => current, peerShot: (m, s) => `/shot?m=${m}&s=${s}`, lacking: () => [], preset() {}, install() {}, openPath() {},
  };
  return { dash: createDashboard(app), log, set: (p) => { current = p; } };
}
const peers = () => [{
  machine: "nexus", os: "mac", hub: "Nexus-Mac",
  items: [1, 2, 3, 4, 5].map((i) => ({ id: "d" + i, name: "design " + i, file: "/d/" + i + "/index.html", session: "designer", ts: 100 + i, last: 200 + i, stamp: 300 + i, dir: "", shot: `s${i}.jpg` })),
}];
const tiles = (dash) => dash.node.children[0].children.find((c) => c.className === "hdd-peers");

test("place moves only the nodes that are out of order", () => {
  const log = { attached: [] };
  const [p, a, b, c] = ["p", "a", "b", "c"].map((n) => new El("div", n, log));
  place(p, [a, b, c]);
  assert.deepEqual(log.attached, ["a", "b", "c"]);
  log.attached.length = 0;
  place(p, [a, b, c]);
  assert.deepEqual(log.attached, [], "the same order: nothing moves");
  place(p, [a, c]);
  assert.deepEqual(log.attached, []);
  assert.deepEqual(p.children.map((n) => n.className), ["a", "c"]);
});

test("the folder tile of another machine stays in the page while the data does not change", () => {
  setLangSource(() => "en");
  const { dash, log, set } = build(peers());
  assert.ok(tiles(dash).children.length >= 1, "the tile is there");
  log.attached.length = 0; log.srcSets.length = 0;
  for (let i = 0; i < 5; i++) { set(peers()); dash.paint(); }   // a new snapshot with the same data, as the hub sends them
  assert.deepEqual(log.attached, [], "no node is put into the page again");
  assert.deepEqual(log.srcSets, [], "no picture is asked again");
});

test("the tile stays when a machine opens and closes: no flicker of what stays in view", () => {
  setLangSource(() => "en");
  const { dash, log, set } = build(peers());
  const grid = tiles(dash).children[0];
  const tile = grid.children[0];
  dash.paint(); dash.paint();
  assert.equal(tiles(dash).children[0], grid, "the grid of tiles is the same element");
  assert.equal(grid.children[0], tile, "the tile is the same element");
  set(peers());
  dash.paint();
  assert.equal(grid.children[0], tile);
});

test("a changed picture of one design changes only that picture", () => {
  setLangSource(() => "en");
  const { dash, log, set } = build(peers());
  log.attached.length = 0; log.srcSets.length = 0;
  const next = peers(); next[0].items[0].stamp = 999;   // the oldest of five: not among the 4 previews
  set(next); dash.paint();
  assert.deepEqual(log.attached, []);
  const top = peers(); top[0].items[2].stamp = 999;   // one of the previews
  set(top); dash.paint();
  assert.deepEqual(log.attached, []);
  assert.equal(log.srcSets.length, 1);
});

test("a design frame reloads into a hidden second iframe and is swapped in when loaded: no white flash", async () => {
  const { readFileSync } = await import("node:fs");
  const src = readFileSync(new URL("../canvas.js", import.meta.url), "utf8");
  const fn = src.slice(src.indexOf("function reloadFrame(path)"), src.indexOf("function showGone"));
  assert.match(fn, /visibility: "hidden"/);
  assert.match(fn, /addEventListener\("load", swap\)/);
  assert.match(fn, /n\.iframe\.replaceWith\(next\)/);
  assert.doesNotMatch(fn, /n\.iframe\.src\s*=/);   // the visible frame is never navigated: the old design stays until the new one is ready
});
