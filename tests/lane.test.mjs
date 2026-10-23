import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { KEY, NAME, NO_KEY, STR, createLaneAsk, t, wanted, withLane } from "../lane.js";
import { setLangSource } from "../i18n.js";

const cyr = /[Ѐ-ӿ]/;
test.beforeEach(() => setLangSource(() => "en"));

test("lane: en and ru tables have the same keys and placeholders, English has no Cyrillic, Russian has", () => {
  assert.deepEqual(Object.keys(STR.ru).sort(), Object.keys(STR.en).sort());
  const ph = (s) => (s.match(/\{\w+\}/g) || []).sort().join();
  for (const k of Object.keys(STR.en)) {
    assert.equal(ph(STR.ru[k]), ph(STR.en[k]), k);
    assert.ok(!cyr.test(STR.en[k]), k);
    assert.ok(cyr.test(STR.ru[k]), k);
  }
  const src = readFileSync(new URL("../lane.js", import.meta.url), "utf8");
  const start = src.indexOf("export const STR = {");
  assert.ok(!cyr.test(src.replace(src.slice(start, src.indexOf("\n};", start) + 3), "")), "Cyrillic outside the table");
});

test("lane: the owner's words in Russian", () => {
  setLangSource(() => "ru");
  assert.equal(t("ask"), "Для нормальной работы дизайнера нужна отдельная линия правок: правки с холста сразу уходят отдельному исполнителю, не ждут очередь. Включить?");
  assert.deepEqual([t("yes"), t("no")], ["Да", "Нет"]);
});

test("lane: an edit carries the design path; no path - the body as it was", () => {
  assert.deepEqual(withLane({ session: "designer", text: "x" }, "/d/a.html"), { session: "designer", text: "x", lane: "/d/a.html" });
  assert.deepEqual(withLane({ session: "designer", text: "x" }, ""), { session: "designer", text: "x" });
  assert.deepEqual(withLane({ session: "designer", text: "x" }, undefined), { session: "designer", text: "x" });
});

// --- the banner, on a fake page --------------------------------------------------------------------------------------
function node(tag) {
  const n = {
    tag, children: [], listeners: {}, dataset: {}, hidden: false, disabled: false, textContent: "", className: "",
    append(...x) { n.children.push(...x); }, replaceChildren(...x) { n.children = x; },
    addEventListener(e, f) { n.listeners[e] = f; },
  };
  return n;
}
const all = (n) => [n, ...n.children.flatMap(all)];
const texts = (n) => all(n).map((x) => x.textContent).join(" ");
const btn = (n, id) => all(n).find((x) => x.dataset.lane === id);
const store = () => { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), m }; };
const snapOf = (value) => ({ settings: [{ key: KEY, value, place: "hidden" }] });

function fake({ value = "", refuse = false } = {}) {
  const S = { snap: snapOf(value), posts: [] };
  const hub = {
    el: (tag, cls, text) => Object.assign(node(tag), { className: cls || "", textContent: text || "" }),
    snapshot: () => S.snap,
    post: async (path, body) => {
      S.posts.push([path, body]);
      if (path === "/api/settings/set") {
        if (refuse) return { error: "not in the whitelist" };
        S.snap = snapOf(body.value);
        return { data: { ok: true } };
      }
      return { data: { ok: true } };
    },
  };
  return { S, hub };
}

test("lane: asked only when the hub knows lanes, it is off and the owner did not say No", () => {
  const st = store();
  assert.equal(wanted({ settings: [] }, st), false);          // an older core: nothing to switch on
  assert.equal(wanted(snapOf("hd-edits"), st), false);        // already on
  assert.equal(wanted(snapOf(""), st), true);
  st.setItem(NO_KEY, "1");
  assert.equal(wanted(snapOf(""), st), false);
});

test("lane: Yes writes design_lane.designer through the settings whitelist and the banner goes", async () => {
  const { S, hub } = fake();
  const st = store();
  const a = createLaneAsk({ hub, store: st });
  a.paint();
  assert.equal(a.node.hidden, false);
  assert.match(texts(a.node), /own lane/);
  await btn(a.node, "yes").listeners.click();
  assert.deepEqual(S.posts, [["/api/settings/set", { key: KEY, value: NAME }]]);
  assert.equal(a.node.hidden, true);
  a.paint(S.snap);
  assert.equal(a.node.hidden, true);
  assert.equal(st.getItem(NO_KEY), null);
});

test("lane: Yes on a hub that refuses the setting asks the hub to turn it on, once", async () => {
  const { S, hub } = fake({ refuse: true });
  const a = createLaneAsk({ hub, store: store(), hubName: () => "hub" });
  a.paint();
  await btn(a.node, "yes").listeners.click();
  assert.equal(S.posts.length, 2);
  const [path, body] = S.posts[1];
  assert.equal(path, "/api/send");
  assert.equal(body.session, "hub");
  assert.equal(body.action, true);
  assert.match(body.text, /design_lane/);
  assert.match(body.text, /hd-edits/);
  assert.match(texts(a.node), /Asked the hub/);
  assert.equal(btn(a.node, "yes"), undefined);                 // no second request
});

test("lane: No is remembered and never asked again, nothing is written", async () => {
  const { S, hub } = fake();
  const st = store();
  const a = createLaneAsk({ hub, store: st });
  a.paint();
  await btn(a.node, "no").listeners.click();
  assert.equal(st.getItem(NO_KEY), "1");
  assert.equal(a.node.hidden, true);
  assert.deepEqual(S.posts, []);
  const again = createLaneAsk({ hub, store: st });             // the page opened again
  again.paint();
  assert.equal(again.node.hidden, true);
});
