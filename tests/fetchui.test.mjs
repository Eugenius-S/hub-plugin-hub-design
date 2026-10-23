import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { LINKS_MAX, STORE_KEY, STR, createFetchUi, isRunning, parseLinks, percent, problem, styles, summary, t } from "../fetchui.js";
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
  const py = readFileSync(new URL("../fetcher.py", import.meta.url), "utf8") + readFileSync(new URL("../sources/refero.py", import.meta.url), "utf8") + readFileSync(new URL("../sources/github.py", import.meta.url), "utf8");
  const codes = new Set([...py.matchAll(/(?:Stop|SourceError)\(\s*"(\w+)"/g)].map((m) => m[1]));
  for (const c of ["no_links", "too_many", "bad_link", "no_source", "busy", "no_link"]) codes.add(c);
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
  assert.match(problem({ error: "no_links" }), /Добавьте/);
});

// --- the tab itself, on a fake page -------------------------------------------------------------------------------
function node(tag) {
  const n = {
    tag, children: [], listeners: {}, style: {}, attrs: {}, hidden: false, disabled: false, checked: false, value: "", textContent: "", className: "", title: "", placeholder: "", cls: new Set(),
    classList: { toggle(c, on) { on ? n.cls.add(c) : n.cls.delete(c); }, has: (c) => n.cls.has(c) },
    append(...x) { n.children.push(...x); }, replaceChildren(...x) { n.children = x; },
    contains(x) { return n.children.includes(x); }, setAttribute(k, v) { n.attrs[k] = v; },
    addEventListener(e, f) { n.listeners[e] = f; },
  };
  return n;
}
const page = () => ({ el: (tag, cls, text) => Object.assign(node(tag), { className: cls || "", textContent: text || "" }) });
const store = (init) => { const m = new Map(init ? [[STORE_KEY, init]] : []); return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, v) }; };
const find = (n, cls) => (n.className.split(" ").includes(cls) ? n : n.children.map((c) => find(c, cls)).find(Boolean));
const findAll = (n, cls) => [...(n.className.split(" ").includes(cls) ? [n] : []), ...n.children.flatMap((c) => findAll(c, cls))];
const tick = () => new Promise((r) => setTimeout(r, 5));

const st = (o) => ({ state: "idle", total: 0, done: 0, added: 0, skipped: 0, failed: 0, name: "", code: "", http: 0, urls: [], args: {}, hosts: ["styles.example.test"], count: 7, ...o });
const A = "https://styles.example.test/style/1";
const B = "https://github.com/acme/set";

// the plugin process, as far as the page can tell: it remembers the links and answers the actions
function fake(init = {}) {
  const S = { links: [], auto: true, np: { n: 0, urls: [] }, run: st({}), preview: { n: 0, kept: 0 }, calls: [], ...init };
  const reply = (json, status = 200) => ({ ok: status < 400, status, json: async () => json });
  globalThis.fetch = async (url, o = {}) => {
    const body = o.body ? JSON.parse(o.body) : null;
    S.calls.push({ method: o.method || "GET", body });
    if (!body) return reply({ ...S.run, links: S.links, auto: S.auto, nopreview: S.np });
    const a = body.action;
    if (a === "add") {
      if (!/^https?:/.test(body.url)) return reply({ error: "bad_link", link: body.url }, 400);
      if (!S.links.some((l) => l.url === body.url)) S.links.push({ url: body.url, default: false, n: 0 });
      return reply({ link: body.url, ...S.run });
    }
    if (a === "delete_preview") return reply(S.preview);
    if (a === "delete") { S.links = S.links.filter((l) => l.url !== body.url); return reply({ ...S.preview, ...S.run }); }
    if (a === "auto") { S.auto = body.on; return reply({ auto: body.on }); }
    if (a === "decline") { S.np = { n: 0, urls: [] }; return reply({ declined: true }); }
    if (a === "nopreview") return reply({ path: "/state/hub-design-nopreview.json", n: S.np.n, dir: "/lib/previews" });
    if (a === "start") { S.run = st({ state: "running", total: 4, done: 1, added: 1, name: "Marlin" }); return reply({ ...S.run }); }
    if (a === "stop") return reply({ ...S.run });
    return reply({ error: "action" }, 400);
  };
  return S;
}
const mount = async (opts = {}) => {
  const ui = createFetchUi({ hub: page(), base: () => "http://x", store: store(), ...opts });
  const root = node("div");
  ui.render(root);
  await tick();
  return { ui, root };
};
const sent = (S, action) => S.calls.filter((c) => c.body && c.body.action === action).map((c) => c.body);

test("fetchui: the number comes with its word, in both languages", () => {
  assert.deepEqual([1, 2, 5].map(styles), ["1 style", "2 styles", "5 styles"]);
  setLangSource(() => "ru");
  assert.deepEqual([1, 2, 5, 11, 21, 22].map(styles), ["1 стиль", "2 стиля", "5 стилей", "11 стилей", "21 стиль", "22 стиля"]);
});

test("fetchui: the links the plugin remembers are fields with their number; below them is one empty field, and a filled one brings a new empty one", async () => {
  fake({ links: [{ url: A, default: true, n: 3 }, { url: B, default: true, n: 1 }] });
  const { ui, root } = await mount();
  assert.deepEqual(findAll(root, "hdf-url").map((x) => x.textContent), [A, B]);
  assert.deepEqual(findAll(root, "hdf-n").map((x) => x.textContent), ["3 styles", "1 style"]);
  assert.equal(findAll(root, "hdf-field").length, 1);
  assert.equal(find(root, "hdf-field").value, "");
  const f = find(root, "hdf-field");
  f.value = "https://";
  f.listeners.input();
  assert.equal(findAll(root, "hdf-field").length, 2);   // a new empty one
  assert.equal(findAll(root, "hdf-field")[1].value, "");
  clearTimeout(ui.state.timer);
});

test("fetchui: the field is saved by the plugin when it is left; many links in one field are many links", async () => {
  const S = fake();
  const { ui, root } = await mount();
  const f = find(root, "hdf-field");
  f.value = `${A}\n${B}, ${A}`;
  f.listeners.input();
  await f.listeners.change();
  await tick();
  assert.deepEqual(sent(S, "add").map((b) => b.url), [A, B]);
  assert.deepEqual(findAll(root, "hdf-url").map((x) => x.textContent), [A, B]);
  assert.equal(findAll(root, "hdf-field").length, 1);   // the filled one became a saved link; one empty is left
  assert.equal(find(root, "hdf-field").value, "");
  clearTimeout(ui.state.timer);
});

test("fetchui: a refused link stays in its field with the word", async () => {
  fake();
  const { root } = await mount();
  const f = find(root, "hdf-field");
  f.value = "not a link";
  await f.listeners.change();
  await tick();
  assert.match(find(root, "hdf-msg").textContent, /not a link/);
  assert.ok(find(root, "hdf-msg").classList.has("bad"));
  assert.equal(find(root, "hdf-field").value, "not a link");
});

test("fetchui: Download saves the filled field, sends all the saved links, shows the run, tells the Style window about new styles, ends with the summary", async () => {
  const S = fake({ links: [{ url: A, default: true, n: 3 }] });
  const added = [];
  const { ui, root } = await mount({ onAdded: () => added.push(1) });
  assert.equal(find(root, "hdf-hosts").textContent, "Supported sites: styles.example.test");
  assert.equal(find(root, "hdf-count").textContent, "In the library: 7");
  const f = find(root, "hdf-field");
  f.value = B;
  f.listeners.input();
  await find(root, "hdf-go").listeners.click();
  await tick();
  assert.deepEqual(sent(S, "add").map((b) => b.url), [B]);
  assert.deepEqual(sent(S, "start")[0].urls, [A, B]);
  assert.equal(find(root, "hdf-prog").textContent, "1 of 4 · added 1, skipped 0, failed 0");
  assert.equal(find(root, "hdf-fill").style.transform, "scaleX(0.25)");   // the bar grows by transform, not by width
  assert.equal(find(root, "hdf-fill").style.width, undefined);
  assert.equal(find(root, "hdf-now").textContent, "Now: Marlin");
  assert.ok(find(root, "hdf-go").disabled && !find(root, "hdf-stop").hidden && findAll(root, "hdf-field").every((x) => x.disabled));
  assert.ok(findAll(root, "hdf-del").every((x) => x.disabled));   // nothing is deleted during a run
  assert.equal(added.length, 1);
  S.run = st({ state: "running", total: 4, done: 3, added: 2, skipped: 1 });
  clearTimeout(ui.state.timer);
  await ui.poll();
  assert.equal(added.length, 2);
  S.run = st({ state: "done", total: 4, done: 4, added: 3, skipped: 1, count: 10 });
  clearTimeout(ui.state.timer);
  await ui.poll();
  assert.equal(added.length, 3);   // the run ended with new styles: once more, for the count
  assert.equal(find(root, "hdf-msg").textContent, "Done. Added 3, skipped as already downloaded 1, failed 0.");
  assert.ok(!find(root, "hdf-go").disabled && find(root, "hdf-stop").hidden);
  assert.equal(find(root, "hdf-count").textContent, "In the library: 10");
});

test("fetchui: the count of animated covers is shown only when there are some", async () => {
  const S = fake({ run: st({ state: "running", total: 4, done: 2, added: 2, covers: 1 }) });
  const { ui, root } = await mount();
  clearTimeout(ui.state.timer);
  assert.equal(find(root, "hdf-prog").textContent, "2 of 4 · added 2, skipped 0, failed 0 · covers 1");
  S.run = st({ state: "running", total: 4, done: 3, added: 3 });
  await ui.poll();
  clearTimeout(ui.state.timer);
  assert.equal(find(root, "hdf-prog").textContent, "3 of 4 · added 3, skipped 0, failed 0");
});

test("fetchui: the background cover pass shows its own progress and summary", async () => {
  const S = fake({ run: st({ state: "running", mode: "covers", total: 1336, done: 40, covers: 12 }) });
  const { ui, root } = await mount();
  clearTimeout(ui.state.timer);
  assert.equal(find(root, "hdf-prog").textContent, "Animated covers: 40 of 1336 · found 12");
  S.run = st({ state: "done", mode: "covers", total: 1336, done: 1336, covers: 700 });
  await ui.poll();
  clearTimeout(ui.state.timer);
  assert.equal(find(root, "hdf-msg").textContent, "Animated covers are done: found 700 of 1336 styles.");
});

test("fetchui: a block by the site stops the run with the word", async () => {
  fake({ run: st({ state: "blocked", code: "rate", http: 429, total: 5, done: 2, added: 2 }) });
  const { root } = await mount();
  assert.match(find(root, "hdf-msg").textContent, /429/);
  assert.ok(find(root, "hdf-msg").classList.has("bad") && !find(root, "hdf-go").disabled);
});

test("fetchui: a repository that cannot be read is told by its name", () => {
  assert.match(problem({ state: "error", code: "github_unknown", args: { repo: "acme/set" } }), /acme\/set/);
  assert.match(problem({ state: "error", code: "clone_failed", args: { repo: "acme/set" } }), /acme\/set/);
  assert.match(problem({ state: "error", code: "no_git" }), /Git/);
});

test("fetchui: deleting a link shows the number first; Cancel deletes nothing; Delete takes the styles and tells the Style window", async () => {
  const S = fake({ links: [{ url: A, default: true, n: 5 }], preview: { n: 5, kept: 2 } });
  const added = [];
  const { ui, root } = await mount({ onAdded: () => added.push(1) });
  await find(root, "hdf-del").listeners.click();
  assert.deepEqual(sent(S, "delete_preview"), [{ action: "delete_preview", url: A }]);
  assert.deepEqual(sent(S, "delete"), []);   // not yet: the owner has to see the number
  const q = find(root, "hdf-q").textContent;
  assert.match(q, /5 styles/);
  assert.match(q, /2 styles stay/);
  await find(root, "hdf-no").listeners.click();
  assert.equal(find(root, "hdf-q"), undefined);
  assert.deepEqual(sent(S, "delete"), []);
  await find(root, "hdf-del").listeners.click();
  await find(root, "hdf-yes").listeners.click();
  await tick();
  assert.deepEqual(sent(S, "delete"), [{ action: "delete", url: A }]);
  assert.equal(findAll(root, "hdf-url").length, 0);
  assert.equal(find(root, "hdf-msg").textContent, "Deleted: 5 styles.");
  assert.equal(added.length, 1);
  clearTimeout(ui.state.timer);
});

test("fetchui: a link with nothing on the disk goes at once, without a question", async () => {
  const S = fake({ links: [{ url: A, default: false, n: 0 }], preview: { n: 0, kept: 0 } });
  const { root } = await mount();
  await find(root, "hdf-del").listeners.click();
  await tick();
  assert.equal(find(root, "hdf-q"), undefined);
  assert.equal(sent(S, "delete").length, 1);
  assert.equal(findAll(root, "hdf-url").length, 0);
});

test("fetchui: the question about the previews: shown only when there are styles without one and no run; the task goes to the designer, then the question closes", async () => {
  const S = fake({ links: [{ url: A, default: true, n: 4 }], np: { n: 4, urls: [A] } });
  const asked = [];
  const { root } = await mount({ ask: async (text) => { asked.push(text); return { data: {} }; } });
  const box = find(root, "hdf-np");
  assert.ok(!box.hidden);
  assert.equal(find(root, "hdf-np-q").textContent, "4 styles without a preview. Ask a designer to make previews?");
  assert.equal(find(root, "hdf-np-give").textContent, "Give the task");
  await find(root, "hdf-np-give").listeners.click();
  await tick();
  assert.deepEqual(sent(S, "nopreview"), [{ action: "nopreview", decline: false }]);
  assert.equal(asked.length, 1);
  assert.match(asked[0], /4 styles/);
  assert.match(asked[0], /hub-design-nopreview\.json/);
  assert.match(asked[0], /preview_to/);
  assert.equal(sent(S, "decline").length, 1);
  assert.ok(find(root, "hdf-np").hidden);   // not asked again
  assert.equal(find(root, "hdf-msg").textContent, "The task is with the designer: 4 styles.");
});

test("fetchui: the task that was not sent keeps the question", async () => {
  const S = fake({ np: { n: 2, urls: [A] } });
  const { root } = await mount({ ask: async () => ({ error: "no session" }) });
  await find(root, "hdf-np-give").listeners.click();
  await tick();
  assert.match(find(root, "hdf-msg").textContent, /designer: no session/);
  assert.equal(sent(S, "decline").length, 0);
  assert.ok(!find(root, "hdf-np").hidden);
});

test("fetchui: 'Not needed' closes the question for good; with every preview in place or during a run there is no question", async () => {
  const S = fake({ np: { n: 2, urls: [A] } });
  const { root } = await mount();
  await find(root, "hdf-np-no").listeners.click();
  await tick();
  assert.equal(sent(S, "decline").length, 1);
  assert.ok(find(root, "hdf-np").hidden);
  assert.equal(sent(S, "nopreview").length, 0);
  fake({ np: { n: 0, urls: [] } });
  const calm = await mount();
  assert.ok(find(calm.root, "hdf-np").hidden);
  fake({ np: { n: 3, urls: [A] }, run: st({ state: "running", total: 4, done: 1 }) });
  const busy = await mount();
  clearTimeout(busy.ui.state.timer);
  assert.ok(find(busy.root, "hdf-np").hidden);
});

test("fetchui: the option to download the default links is a checkbox that the plugin remembers", async () => {
  const S = fake({ auto: true });
  const { root } = await mount();
  const cb = find(root, "hdf-auto-box");
  assert.ok(cb.checked);
  assert.equal(find(root, "hdf-auto-text").textContent, STR.en.auto);
  cb.checked = false;
  await cb.listeners.change();
  await tick();
  assert.deepEqual(sent(S, "auto"), [{ action: "auto", on: false }]);
  assert.ok(!find(root, "hdf-auto-box").checked);
});

test("fetchui: the links an older version kept in the browser go into the plugin once", async () => {
  const S = fake();
  const s = store(`${A}\n${B}`);
  const { ui, root } = await mount({ store: s });
  await tick();
  assert.deepEqual(sent(S, "add").map((b) => b.url), [A, B]);
  assert.equal(s.getItem(STORE_KEY), "");
  assert.equal(findAll(root, "hdf-url").length, 2);
  clearTimeout(ui.state.timer);
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
