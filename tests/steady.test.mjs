// The start screen must stand still: it is painted on every snapshot of the hub (about once a second), and every write into the page,
// even of the same text, makes the browser redo the layout; a node put back into the page replays its entrance animation.
// The previews are shots of the designs (PNG of the plugin process, cached on disk), not live documents: a known one is shown at once,
// a new one waits in a queue - what is in view first, no more than SHOTS_AT_ONCE at a time, a failed one again later.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createDashboard, SHOTS_AT_ONCE, forgetShots } from "../dashboard.js";
import { setLangSource } from "../i18n.js";

class El {
  constructor(tag, cls = "", log = null) {
    this.tag = tag; this.log = log; this.children = []; this.parentNode = null; this.dataset = {}; this.style = {}; this.attrs = {};
    this.hidden = false; this._text = ""; this._title = ""; this.className = cls; this.listeners = {}; this.clientWidth = 0; this.clientHeight = 0;
    const set = new Set(cls.split(" ").filter(Boolean));
    this.classList = { toggle: (c, on) => { const v = on === undefined ? !set.has(c) : !!on; v ? set.add(c) : set.delete(c); return v; }, add: (c) => set.add(c), remove: (c) => set.delete(c), contains: (c) => set.has(c) };
    log.made.push(this);
  }
  get firstChild() { return this.children[0] || null; }
  get lastChild() { return this.children[this.children.length - 1] || null; }
  get textContent() { return this._text; }
  set textContent(v) { this._text = String(v); this.children = []; this.log.writes.push("text " + this.className); }
  get title() { return this._title; }
  set title(v) { this._title = String(v); this.log.writes.push("title " + this.className); }
  get innerHTML() { return this._html || ""; }
  set innerHTML(v) { this._html = v; this.children = []; this.log.writes.push("html " + this.className); }
  set src(v) { this._src = v; this.log.srcSets.push(v); }
  get src() { return this._src || ""; }
  setAttribute(k, v) { this.attrs[k] = String(v); this.log.writes.push("@" + k + " " + this.className); }
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
const watched = [];
globalThis.IntersectionObserver = class { constructor(f) { this.f = f; watched.push(this); } observe(n) { (this.nodes ||= []).push(n); } unobserve() {} };
const showAll = (on = true) => { for (const o of watched) o.f((o.nodes || []).map((target) => ({ target, isIntersecting: on }))); };

const designs = (n, dir = "/w/a") => Array.from({ length: n }, (_, i) => ({ path: `${dir}/d${i}/index.html`, session: "designer", ts: 100 + i, last: 200 + i }));

function build(files, dirs = []) {
  const log = { attached: [], srcSets: [], writes: [], made: [] };
  const hub = { el: (tag, cls, text) => { const e = new El(tag, cls, log); if (text) e.textContent = text; return e; } };
  let current = files;
  const app = {
    hub, files: () => current, dirs: () => dirs, mine: () => new Set(), fileState: () => "ok", alive: () => true, fileUrl: (p) => "/f" + p, open() {},
    thumb: (p) => "/thumb?path=" + p + "&m=1", peers: () => [], peerShot: () => "", lacking: () => [], preset() {}, install() {}, openPath() {},
  };
  const later = [];
  app.later = (f, ms) => later.push([f, ms]);
  return { dash: createDashboard(app), log, set: (f) => { current = f; }, later };
}
// the shots asked of the server: images made by the dashboard with a src that are waiting for their load
const asked = (log) => log.made.filter((e) => e.tag === "img" && e.onload && e._src && e._src.startsWith("/thumb") && !e.settled);
const settle = (img, ok = true) => { img.settled = true; (ok ? img.onload : img.onerror)(); };

test("a repaint with the same designs writes nothing into the page", () => {
  setLangSource(() => "en");
  for (const dirs of [[], [{ key: "/w/a", label: "A" }, { key: "/w/b", label: "B" }]]) {
    forgetShots();
    const files = [...designs(5), ...designs(3, "/w/b")];
    const { dash, log, set } = build(files, dirs);
    showAll();
    log.attached.length = 0; log.writes.length = 0; log.srcSets.length = 0;
    for (let i = 0; i < 5; i++) { set(files.map((f) => ({ ...f }))); dash.paint(); }
    assert.deepEqual(log.attached, [], "no node is put into the page again");
    assert.deepEqual(log.writes, [], "no text, title, attribute or icon is written again");
    assert.deepEqual(log.srcSets, [], "no picture is asked again");
  }
});

test("previews are shots asked a few at a time, all of them at once - in view or not (hd-sort)", () => {
  setLangSource(() => "en");
  forgetShots();
  const { log } = build(designs(9));
  assert.equal(asked(log).length, SHOTS_AT_ONCE, "nothing in view yet - and all the same the shots are asked, a few at a time");
  assert.ok(!log.made.some((e) => e.tag === "iframe" && e._src), "no live document is loaded for a preview");
  let now = asked(log);
  const seenSrc = new Set(now.map((i) => i._src));
  while (now.length) { settle(now[0]); now = asked(log); now.forEach((i) => seenSrc.add(i._src)); assert.ok(now.length <= SHOTS_AT_ONCE); }
  assert.equal(seenSrc.size, 9, "every design got its shot, scrolled to or not");
});

test("a failed shot is asked again later; a known shot is shown at once on the next start", () => {
  setLangSource(() => "en");
  forgetShots();
  const one = designs(1);
  const a = build(one);
  showAll();
  settle(asked(a.log)[0], false);
  assert.equal(asked(a.log).length, 0);
  assert.ok(a.later.length >= 1, "a retry is planned");
  a.later.shift()[0]();
  const again = asked(a.log);
  assert.equal(again.length, 1, "asked again");
  settle(again[0]);
  const b = build(one);   // the dashboard made again (the page is opened anew): the shot is known
  const shown = b.log.made.filter((e) => e.tag === "img" && e._src === "/thumb?path=/w/a/d0/index.html&m=1");
  assert.equal(shown.length, 1, "the known shot is in the card before it even comes into view");
  assert.equal(asked(b.log).filter((i) => i.onload).length, 0, "and no load is queued for it");
});
