import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { STR, createFirstRun, facts, sourceName, t } from "../firstrun.js";
import { setLangSource } from "../i18n.js";

const cyr = /[Ѐ-ӿ]/;
test.beforeEach(() => setLangSource(() => "en"));

test("firstrun: en and ru tables have the same keys and placeholders, English has no Cyrillic, Russian has", () => {
  assert.deepEqual(Object.keys(STR.ru).sort(), Object.keys(STR.en).sort());
  const ph = (s) => (s.match(/\{\w+\}/g) || []).sort().join();
  for (const k of Object.keys(STR.en)) {
    assert.equal(ph(STR.ru[k]), ph(STR.en[k]), k);
    assert.ok(!cyr.test(STR.en[k]), k);
    assert.ok(cyr.test(STR.ru[k]), k);
  }
});

test("firstrun: every key used by t() exists, and no Russian is left outside the table", () => {
  const src = readFileSync(new URL("../firstrun.js", import.meta.url), "utf8");
  const start = src.indexOf("export const STR = {");
  const table = src.slice(start, src.indexOf("\n};", start) + 3);
  for (const m of src.matchAll(/\bt\(\s*"(\w+)"/g)) assert.ok(m[1] in STR.en, m[1]);
  assert.ok(!cyr.test(src.replace(table, "")), "Cyrillic outside the table");
});

test("firstrun: the buttons say the same as the Telegram ones (the python table is the other copy)", () => {
  const py = readFileSync(new URL("../firstrun.py", import.meta.url), "utf8");
  for (const lang of ["en", "ru"]) for (const k of ["yes", "no", "settings", "title"]) assert.ok(py.includes(`"${k}": "${STR[lang][k]}"`), lang + k);
});

test("firstrun: a link is shown short; the decimal of the size follows the language", () => {
  assert.equal(sourceName("https://github.com/acme/set/"), "acme/set");
  assert.equal(sourceName("https://styles.example.test/"), "styles.example.test");
  assert.equal(sourceName("nonsense"), "nonsense");
  assert.equal(facts({ sources: 10, styles: 2058, gb: 2.1, hours: "2-3" }, "en").gb, "2.1");
  assert.equal(facts({ sources: 10, styles: 2058, gb: 2.1, hours: "2-3" }, "ru").gb, "2,1");
});

// --- the card, on a fake page --------------------------------------------------------------------------------------
function node(tag) {
  const n = {
    tag, children: [], listeners: {}, attrs: {}, dataset: {}, hidden: false, disabled: false, textContent: "", className: "",
    append(...x) { n.children.push(...x); }, replaceChildren(...x) { n.children = x; },
    setAttribute(k, v) { n.attrs[k] = v; }, addEventListener(e, f) { n.listeners[e] = f; },
  };
  return n;
}
const page = () => ({ el: (tag, cls, text) => Object.assign(node(tag), { className: cls || "", textContent: text || "" }) });
const find = (n, cls) => (n.className.split(" ").includes(cls) ? n : n.children.map((c) => find(c, cls)).find(Boolean));
const findAll = (n, cls) => [...(n.className.split(" ").includes(cls) ? [n] : []), ...n.children.flatMap((c) => findAll(c, cls))];
const texts = (n) => [n.textContent, ...n.children.flatMap(texts)].join(" ");
const tick = () => new Promise((r) => setTimeout(r, 5));

const Q = { styles: 2058, gb: 2.1, hours: "2-3", sources: 10, links: ["https://styles.example.test/", "https://github.com/acme/set"], agents: ["designer", "writer"] };
function fake(init = {}) {
  const S = { q: Q, calls: [], down: false, ...init };
  globalThis.fetch = async (url, o = {}) => {
    const body = o.body ? JSON.parse(o.body) : null;
    S.calls.push({ method: o.method || "GET", body });
    if (S.down) throw new Error("down");
    if (!body) return { ok: true, json: async () => ({ state: "idle", firstrun: S.q }) };
    if (body.action === "firstrun") { S.q = null; return { ok: true, json: async () => ({ first: body.choice }) }; }
    return { ok: false, json: async () => ({ error: "action" }) };
  };
  return S;
}
const timers = () => { const T = { set: [], clear: [] }; T.setTimer = (f, ms) => { T.set.push(ms); return T.set.length; }; T.clearT = (id) => T.clear.push(id); return T; };
const mount = async (opts = {}) => {
  const T = timers();
  const fr = createFirstRun({ hub: page(), base: () => "http://x", setTimer: T.setTimer, clear: T.clearT, ...opts });
  await fr.refresh();
  await tick();
  return { fr, T };
};

test("firstrun: the question waits - the card shows the sources, the size and time, and three buttons; nothing is sent by itself", async () => {
  const S = fake();
  const { fr } = await mount();
  assert.ok(!fr.node.hidden);
  const all = texts(fr.node);
  assert.match(all, /download the style library\?/);
  assert.match(all, /10 style sources/);
  assert.match(all, /2058 styles/);
  assert.match(all, /2\.1 GB/);
  assert.match(all, /2-3 hours/);
  assert.deepEqual(findAll(fr.node, "hdq-b").map((b) => b.textContent), [STR.en.yes, STR.en.no, STR.en.settings]);
  assert.equal(find(fr.node, "hdq-yes").textContent, STR.en.yes);
  assert.deepEqual(findAll(fr.node, "hdq-link").map((x) => x.textContent), ["styles.example.test", "acme/set"]);
  assert.deepEqual(S.calls.filter((c) => c.body), []);   // only a GET: the answer is the owner's
});

test("firstrun: a button sends its answer, the card goes away and the polling stops", async () => {
  const S = fake();
  const { fr, T } = await mount();
  const polls = T.set.length;
  const yes = find(fr.node, "hdq-yes");
  await yes.listeners.click();
  assert.deepEqual(S.calls.filter((c) => c.body).map((c) => c.body), [{ action: "firstrun", choice: "yes" }]);
  assert.ok(fr.node.hidden);
  assert.equal(T.set.length, polls);   // no new timer after the answer
  for (const c of ["no", "settings"]) {
    fake();
    const m = await mount();
    const b = findAll(m.fr.node, "hdq-b").find((x) => x.dataset.choice === c);
    assert.ok(b, c);
    await b.listeners.click();
    assert.ok(m.fr.node.hidden);
  }
});

test("firstrun: no question in the status (answered before, a config decision, an old process) - no card; not local - no request at all", async () => {
  fake({ q: null });
  assert.ok((await mount()).fr.node.hidden);
  const S = fake();
  const m = await mount({ local: () => false });
  assert.ok(m.fr.node.hidden);
  assert.equal(S.calls.length, 0);
});

test("firstrun: answered in Telegram - the next poll takes the card away", async () => {
  const S = fake();
  const { fr } = await mount();
  assert.ok(!fr.node.hidden);
  S.q = null;
  await fr.refresh();
  assert.ok(fr.node.hidden);
});

test("firstrun: the process is not up yet - a few retries, then quiet (the settings tab can ask again)", async () => {
  fake({ down: true });
  const T = timers();
  const fr = createFirstRun({ hub: page(), base: () => "http://x", setTimer: T.setTimer, clear: T.clearT });
  for (let i = 0; i < 9; i++) await fr.refresh();
  assert.equal(T.set.filter((ms) => ms === 4000).length, 5);
  assert.ok(fr.node.hidden);
});

test("firstrun: the agents the hub lacks - a row each with Install; asked - disabled; none lacking - no block", async () => {
  fake();
  const installed = [];
  let rows = [{ name: "designer", title: "designer", state: "ask" }, { name: "writer", title: "writer", state: "wait" }];
  const { fr } = await mount({ agents: () => rows, install: async (n) => { installed.push(n); } });
  const r = findAll(fr.node, "hdq-arow");
  assert.deepEqual(r.map((x) => x.dataset.agent), ["designer", "writer"]);
  const b = r.map((x) => find(x, "hdq-ab"));
  assert.deepEqual(b.map((x) => [x.textContent, x.disabled]), [[STR.en.install, false], [STR.en.asked, true]]);
  await b[0].listeners.click();
  assert.deepEqual(installed, ["designer"]);
  rows = [];
  fr.paint();
  assert.equal(find(fr.node, "hdq-agents"), undefined);
});

test("firstrun: the card follows the language of the hub, read at use time", async () => {
  fake();
  const { fr } = await mount();
  assert.match(texts(fr.node), /Download/);
  setLangSource(() => "ru-RU");
  fr.paint();
  assert.match(texts(fr.node), /Hub Design: скачать библиотеку стилей\?/);
  assert.equal(find(fr.node, "hdq-yes").textContent, STR.ru.yes);
});

test("firstrun: a refused answer - the word on the card and the buttons work again", async () => {
  const S = fake();
  const { fr } = await mount();
  globalThis.fetch = async () => ({ ok: false, json: async () => ({ error: "choice" }) });
  await find(fr.node, "hdq-yes").listeners.click();
  assert.ok(!fr.node.hidden);
  assert.equal(find(fr.node, "hdq-err").textContent, STR.en.error);
  assert.ok(!find(fr.node, "hdq-yes").disabled);
  void S;
});
