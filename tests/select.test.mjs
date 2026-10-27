// Ticking designs on the start screen: the check on cards and tiles, a Shift-click range, the panel, the safe delete (confirm, then the trash,
// then Undo), the refusals for the designs of other machines and for the ones an author is busy with.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createDashboard } from "../dashboard.js";
import { setLangSource } from "../i18n.js";
import { prune, rangeIds, setMany, tileState } from "../selection.js";

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

const walk = (n, f) => { f(n); for (const c of n.children) walk(c, f); };
const find = (root, cls) => { const out = []; walk(root, (n) => { if (n.classList.contains(cls)) out.push(n); }); return out; };
const click = (n, extra = {}) => n.listeners.click({ stopPropagation() {}, preventDefault() {}, shiftKey: false, ...extra });
const tick = () => new Promise((r) => setTimeout(r, 0));
const paths = ["/p/Ads/design/a/index.html", "/p/Ads/design/b/index.html", "/p/Ads/design/c/index.html", "/p/Ads/design/d/index.html"];

function build({ busy = () => false, peers = [] } = {}) {
  const log = { attached: [], srcSets: [] };
  const hub = { el: (tag, cls, text) => { const e = new El(tag, cls, log); if (text) e.textContent = text; return e; } };
  const calls = { move: [], remove: [], undo: [] };
  const org = {
    busy: (p) => busy(p),
    targets: async () => [{ path: "/p/Ads/design/archive", label: "archive", kind: "folder" }],
    move: async (ps, dest) => { calls.move.push([ps, dest]); return { id: "m1", moved: ps.map((p) => ({ from: p, to: dest + "/x" })), skipped: [] }; },
    remove: async (ps) => { calls.remove.push(ps); return { id: "d1", deleted: ps.map((p) => ({ from: p, to: "/trash/x" })), skipped: [] }; },
    undo: async (id) => { calls.undo.push(id); return { id, restored: 2, conflicts: [] }; },
  };
  const rows = paths.map((p, i) => ({ path: p, session: "designer", ts: 100 + i, last: 200 + i }));
  const app = {
    hub, files: () => rows, dirs: () => [], mine: () => new Set(), fileState: () => "ok", alive: () => true, fileUrl: () => "", open() {},
    peers: () => peers, peerShot: () => "", lacking: () => [], preset() {}, install() {}, openPath() {}, organize: org, later() {},
  };
  const dash = createDashboard(app);
  dash.state.q = "design";   // a search lists the cards themselves, not the folder tiles
  dash.paint();
  return { dash, calls };
}
const checks = (dash) => find(dash.node, "hdd-check");
const at = (dash, path) => checks(dash).find((c) => c.dataset.id === "c:" + path);
const panel = (dash) => find(dash.node, "hdd-sel")[0];
const button = (dash, cls) => find(panel(dash), cls)[0];
const toast = (dash) => find(dash.node, "hdd-toast")[0];

test("selection logic: a part of a folder is 'some', a range keeps the screen order, a gone design is let go", () => {
  const sel = new Set();
  assert.equal(tileState(sel, ["a", "b"]), "none");
  assert.ok(setMany(sel, ["a"], true));
  assert.equal(tileState(sel, ["a", "b"]), "some");
  assert.ok(!setMany(sel, ["a"], true), "nothing changed");
  setMany(sel, ["b"], true);
  assert.equal(tileState(sel, ["a", "b"]), "all");
  assert.equal(tileState(sel, []), "none");
  assert.deepEqual(rangeIds(["x", "y", "z", "w"], "w", "y"), ["y", "z", "w"]);
  assert.deepEqual(rangeIds(["x", "y"], "lost", "y"), ["y"]);
  assert.deepEqual(rangeIds(["x", "y"], "x", "nope"), []);
  assert.ok(prune(sel, new Set(["a"])));
  assert.deepEqual([...sel], ["a"]);
});

test("every card has a check; ticking one shows the panel with the count, ticking it again hides it", () => {
  setLangSource(() => "en");
  const { dash } = build();
  const cs = checks(dash);
  assert.equal(cs.length, 4);
  assert.ok(panel(dash).hidden);
  click(cs[0]);
  assert.equal(cs[0].getAttribute("aria-checked"), "true");
  assert.ok(!panel(dash).hidden);
  assert.match(find(panel(dash), "hdd-sel-n")[0].textContent, /\b1$/);
  assert.ok(dash.node.classList.contains("selecting"));
  click(cs[0]);
  assert.equal(cs[0].getAttribute("aria-checked"), "false");
  assert.ok(panel(dash).hidden);
  assert.ok(!dash.node.classList.contains("selecting"));
});

test("a Shift-click ticks the range from the last tick, in the order of the screen", () => {
  setLangSource(() => "en");
  const { dash } = build();
  const cs = checks(dash);
  click(cs[0]);
  click(cs[2], { shiftKey: true });
  assert.deepEqual(cs.map((c) => c.getAttribute("aria-checked")), ["true", "true", "true", "false"]);
  assert.equal(dash.state.sel.size, 3);
});

test("delete asks first and only then goes to the trash; the toast offers Undo and Undo calls the server with the id", async () => {
  setLangSource(() => "en");
  const { dash, calls } = build();
  const cs = checks(dash);
  click(at(dash, paths[0])); click(at(dash, paths[1]));
  click(button(dash, "del"));
  assert.equal(calls.remove.length, 0, "the first click only asks");
  assert.ok(button(dash, "danger") && !button(dash, "danger").hidden);
  click(button(dash, "danger"));
  await tick();
  assert.deepEqual(calls.remove.map((x) => x.slice().sort()), [[paths[0], paths[1]]]);
  assert.equal(dash.state.sel.size, 0);
  assert.ok(!toast(dash).hidden);
  const undo = find(toast(dash), "hdd-toast-b")[0];
  assert.ok(!undo.hidden);
  undo.onclick();
  await tick();
  assert.deepEqual(calls.undo, ["d1"]);
});

test("Move opens the list of folders; a click on one moves everything ticked there", async () => {
  setLangSource(() => "en");
  const { dash, calls } = build();
  click(at(dash, paths[2]));
  click(button(dash, "move"));
  await tick();
  const pop = find(dash.node, "hdd-pop")[0];
  assert.ok(!pop.hidden);
  const item = find(pop, "hdd-pop-item")[0];
  assert.equal(item.dataset.path, "/p/Ads/design/archive");
  click(item);
  await tick();
  assert.deepEqual(calls.move, [[[paths[2]], "/p/Ads/design/archive"]]);
});

test("a design its author is busy with cannot be ticked, a range goes around it", () => {
  setLangSource(() => "en");
  const { dash } = build({ busy: (p) => p === paths[1] });
  assert.equal(at(dash, paths[1]).getAttribute("aria-disabled"), "true");
  click(at(dash, paths[1]));
  assert.equal(dash.state.sel.size, 0);
  click(at(dash, paths[0]));
  click(at(dash, paths[2]), { shiftKey: true });
  assert.ok(!dash.state.sel.has(paths[1]));
  assert.equal(dash.state.sel.size, 2);
});

test("the designs of another machine have a check that is off: they live there", () => {
  setLangSource(() => "en");
  const peers = [{ machine: "nexus", os: "mac", hub: "Nexus-Mac", items: [{ id: "d1", name: "far", file: "/d/far/index.html", session: "designer", ts: 1, last: 2, stamp: 3, dir: "", shot: "s.jpg" }] }];
  const { dash } = build({ peers });
  const far = checks(dash).filter((c) => c.dataset.id && !c.dataset.id.startsWith("c:") && !c.dataset.id.startsWith("f:"));
  assert.ok(far.length >= 1, "the machine has a tile or a card with a check");
  for (const c of far) {
    assert.equal(c.getAttribute("aria-disabled"), "true");
    click(c);
  }
  assert.equal(dash.state.sel.size, 0);
});

test("a repaint with the same data keeps the ticks", () => {
  setLangSource(() => "en");
  const { dash } = build();
  click(checks(dash)[0]);
  for (let i = 0; i < 3; i++) dash.paint();
  assert.equal(dash.state.sel.size, 1);
  assert.equal(checks(dash)[0].getAttribute("aria-checked"), "true");
});

test("a search that hides a ticked design lets it go: a delete never reaches what is out of sight", () => {
  setLangSource(() => "en");
  const { dash } = build();
  click(checks(dash)[3]);
  dash.state.q = "no-such-name";
  dash.paint();
  assert.equal(dash.state.sel.size, 0);
});
