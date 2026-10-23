import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { LINKS_MAX, STORE_KEY, STR, createFetchUi, isRunning, parseLinks, percent, problem, summary, t } from "../fetchui.js";
import { setLangSource } from "../i18n.js";

const cyr = /[Ѐ-ӿ]/;
test.beforeEach(() => setLangSource(() => "en"));

test("fetchui: en and ru tables have the same keys and placeholders, English has no Cyrillic, Russian has", () => {
  assert.deepEqual(Object.keys(STR.ru).sort(), Object.keys(STR.en).sort());
  const ph = (s) => (s.match(/\{\w+\}/g) || []).sort().join();
  for (const k of Object.keys(STR.en)) {
    assert.equal(ph(STR.ru[k]), ph(STR.en[k]), k);
    assert.ok(!cyr.test(STR.en[k]), k);
    assert.ok(cyr.test(STR.ru[k]), k);
  }
});

test("fetchui: every key used by t() exists, and no Russian is left outside the table", () => {
  const src = readFileSync(new URL("../fetchui.js", import.meta.url), "utf8");
  const start = src.indexOf("export const STR = {");
  const table = src.slice(start, src.indexOf("\n};", start) + 3);
  for (const m of src.matchAll(/\bt\(\s*"(\w+)"/g)) assert.ok(m[1] in STR.en, m[1]);
  assert.ok(!cyr.test(src.replace(table, "")), "Cyrillic outside the table");
});

test("fetchui: every error code of the process has its word", () => {
  const py = readFileSync(new URL("../fetcher.py", import.meta.url), "utf8") + readFileSync(new URL("../sources/refero.py", import.meta.url), "utf8");
  const codes = new Set([...py.matchAll(/(?:Stop|SourceError)\(\s*"(\w+)"/g)].map((m) => m[1]));
  for (const c of ["no_links", "too_many", "bad_link", "no_source", "busy"]) codes.add(c);
  // stopped is the owner's own stop; bad_page is one failed style, it is only counted
  for (const c of codes) if (c !== "stopped" && c !== "bad_page") assert.ok(("e_" + c) in STR.en, c);
});

test("fetchui: the links are split by spaces, commas and lines, without repeats", () => {
  assert.deepEqual(parseLinks(" https://a.test/x\nhttps://b.test/y, https://a.test/x;\n\n"), ["https://a.test/x", "https://b.test/y"]);
  assert.deepEqual(parseLinks(""), []);
  assert.deepEqual(parseLinks(null), []);
});

test("fetchui: the bar, the words for a stop and for the end of a run", () => {
  assert.equal(percent(null), 0);
  assert.equal(percent({ total: 0, done: 0 }), 0);
  assert.equal(percent({ total: 8, done: 2 }), 25);
  assert.equal(percent({ total: 3, done: 9 }), 100);
  assert.ok(isRunning({ state: "running" }) && isRunning({ state: "stopping" }) && !isRunning({ state: "done" }) && !isRunning(null));
  assert.match(problem({ state: "blocked", code: "rate", http: 429 }), /429/);
  assert.match(problem({ state: "blocked", code: "captcha" }), /captcha/);
  assert.match(problem({ error: "bad_link", link: "oops" }), /oops/);
  assert.match(problem({ error: "no_source", link: "https://x.test", hosts: ["a.test", "b.test"] }), /x\.test.*a\.test, b\.test/);
  assert.match(problem({ error: "too_many" }), new RegExp(String(LINKS_MAX)));
  assert.equal(problem({ state: "done" }), "");
  assert.equal(problem({ state: "error", code: "never_heard" }), t("e_internal"));
  assert.match(summary({ state: "done", added: 3, skipped: 1, failed: 0 }), /Added 3.*skipped.*1/);
  assert.match(summary({ state: "stopped", added: 1, skipped: 0, failed: 0 }), /Stopped/);
  assert.equal(summary({ state: "running" }), "");
  setLangSource(() => "ru-RU");
  assert.match(problem({ error: "no_links" }), /Вставь/);
});

// --- the tab itself, on a fake page -------------------------------------------------------------------------------
function node(tag) {
  const n = {
    tag, children: [], listeners: {}, style: {}, attrs: {}, hidden: false, disabled: false, value: "", textContent: "", className: "", cls: new Set(),
    classList: { toggle(c, on) { on ? n.cls.add(c) : n.cls.delete(c); }, has: (c) => n.cls.has(c) },
    append(...x) { n.children.push(...x); }, replaceChildren(...x) { n.children = x; },
    contains(x) { return n.children.includes(x); }, setAttribute(k, v) { n.attrs[k] = v; },
    addEventListener(e, f) { n.listeners[e] = f; },
  };
  return n;
}
const page = () => ({ el: (tag, cls, text) => Object.assign(node(tag), { className: cls || "", textContent: text || "" }) });
const store = () => { const m = new Map(); return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, v) }; };
const find = (n, cls) => (n.className.split(" ").includes(cls) ? n : n.children.map((c) => find(c, cls)).find(Boolean));
const tick = () => new Promise((r) => setTimeout(r, 5));

function rig(replies) {
  const calls = [];
  globalThis.fetch = async (url, init = {}) => {
    calls.push({ method: init.method || "GET", url, body: init.body ? JSON.parse(init.body) : null });
    const r = replies.shift();
    return { ok: (r.status || 200) < 400, status: r.status || 200, json: async () => r.json };
  };
  return calls;
}

const st = (o) => ({ state: "idle", total: 0, done: 0, added: 0, skipped: 0, failed: 0, name: "", code: "", http: 0, urls: [], args: {}, hosts: ["styles.example.test"], count: 7, ...o });

test("fetchui: Download sends the links, shows the run, tells the Style window about new styles, ends with the summary", async () => {
  const calls = rig([{ json: st({}) }, { json: st({ state: "running", total: 4, done: 1, added: 1, name: "Marlin" }) },
                     { json: st({ state: "running", total: 4, done: 3, added: 2, skipped: 1 }) },
                     { json: st({ state: "done", total: 4, done: 4, added: 3, skipped: 1, count: 10 }) }]);
  const added = [];
  const s = store();
  const ui = createFetchUi({ hub: page(), base: () => "http://x", onAdded: () => added.push(1), store: s });
  const root = node("div");
  ui.render(root);
  await tick();
  assert.equal(calls[0].method, "GET");
  assert.equal(find(root, "hdf-hosts").textContent, "Supported sites: styles.example.test");
  assert.equal(find(root, "hdf-count").textContent, "In the library: 7");
  const ta = find(root, "hdf-links");
  ta.value = "https://styles.example.test/style/1 \nhttps://styles.example.test/style/1";
  ta.listeners.input();
  assert.equal(s.getItem(STORE_KEY), ta.value);
  find(root, "hdf-go").listeners.click();
  await tick();
  assert.deepEqual(calls[1].body, { action: "start", urls: ["https://styles.example.test/style/1"] });
  assert.equal(find(root, "hdf-prog").textContent, "1 of 4 · added 1, skipped 0, failed 0");
  assert.equal(find(root, "hdf-now").textContent, "Now: Marlin");
  assert.ok(find(root, "hdf-go").disabled && !find(root, "hdf-stop").hidden && ta.disabled);
  assert.equal(added.length, 1);
  clearTimeout(ui.state.timer);
  await ui.poll();   // what the timer does once a second
  assert.equal(added.length, 2);
  clearTimeout(ui.state.timer);
  await ui.poll();
  assert.equal(added.length, 3);   // the run ended with new styles: once more, for the count
  assert.equal(find(root, "hdf-msg").textContent, "Done. Added 3, skipped as already downloaded 1, failed 0.");
  assert.ok(!find(root, "hdf-go").disabled && find(root, "hdf-stop").hidden && !ta.disabled);
  assert.equal(find(root, "hdf-count").textContent, "In the library: 10");
});

test("fetchui: the count of animated covers is shown only when there are some", async () => {
  rig([{ json: st({ state: "running", total: 4, done: 2, added: 2, covers: 1 }) }, { json: st({ state: "running", total: 4, done: 3, added: 3 }) }]);
  const ui = createFetchUi({ hub: page(), base: () => "http://x", onAdded: () => {}, store: store() });
  const root = node("div");
  ui.render(root);
  await tick();
  clearTimeout(ui.state.timer);
  assert.equal(find(root, "hdf-prog").textContent, "2 of 4 · added 2, skipped 0, failed 0 · covers 1");
  clearTimeout(ui.state.timer);
  await ui.poll();
  clearTimeout(ui.state.timer);
  assert.equal(find(root, "hdf-prog").textContent, "3 of 4 · added 3, skipped 0, failed 0");
});

test("fetchui: a refused start is told in words, the buttons stay free", async () => {
  rig([{ json: st({}) }, { status: 400, json: { ...st({}), error: "no_source", link: "https://other.test/x" } }]);
  const ui = createFetchUi({ hub: page(), base: () => "http://x", store: store() });
  const root = node("div");
  ui.render(root);
  await tick();
  find(root, "hdf-links").value = "https://other.test/x";
  find(root, "hdf-go").listeners.click();
  await tick();
  assert.match(find(root, "hdf-msg").textContent, /other\.test\/x.*styles\.example\.test/);
  assert.ok(find(root, "hdf-msg").classList.has("bad") && !find(root, "hdf-go").disabled);
});

test("fetchui: a block by the site stops the run with the word", async () => {
  rig([{ json: st({ state: "blocked", code: "rate", http: 429, total: 5, done: 2, added: 2 }) }]);
  const ui = createFetchUi({ hub: page(), base: () => "http://x", store: store() });
  const root = node("div");
  ui.render(root);
  await tick();
  assert.match(find(root, "hdf-msg").textContent, /429/);
  assert.ok(find(root, "hdf-msg").classList.has("bad") && !find(root, "hdf-go").disabled);
});

test("fetchui: the process does not answer - one line, no endless polling; not local - no requests at all", async () => {
  const calls = [];
  globalThis.fetch = async (u) => { calls.push(u); throw new Error("down"); };
  const ui = createFetchUi({ hub: page(), base: () => "http://x", store: store() });
  const root = node("div");
  ui.render(root);
  await tick();
  assert.equal(find(root, "hdf-msg").textContent, STR.en.e_page);
  ui.render(root);   // the next snapshot of the hub: not asked again within 5 s
  await tick();
  assert.equal(calls.length, 1);
  const off = createFetchUi({ hub: page(), base: () => "http://x", local: () => false, store: store() });
  const r2 = node("div");
  off.render(r2);
  await tick();
  assert.equal(calls.length, 1);
  assert.equal(find(r2, "hdf-msg").textContent, STR.en.e_local);
  assert.ok(find(r2, "hdf-go").disabled);
});
