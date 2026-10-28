import { test } from "node:test";
import assert from "node:assert/strict";
import { PRESETS, SORTS, STR, TABS, editedText, isStub, nameOf, shown, sortGroups, stubText, t } from "../dashboard.js";
import { setLangSource } from "../i18n.js";

const files = [
  { path: "/d/kolo/index.html", session: "designer", ts: 100, last: 300 },
  { path: "/d/promo/landing.html", session: "animator", ts: 200, last: 200 },
  { path: "/d/deck/index.html", session: "designer", ts: 50, last: 400 },
];

// the page language as the hub reports it; every test starts from the default (English)
const lang = (l) => setLangSource(() => l);
test.beforeEach(() => lang("en"));

test("index.html is named by its folder, other files by the file", () => {
  assert.equal(nameOf("/d/kolo/index.html"), "kolo");
  assert.equal(nameOf("/d/promo/landing.html"), "landing");
  assert.equal(nameOf("index.html"), "index");
});

test("tabs: Mine - open on the canvas, Others - the rest", () => {
  const mine = new Set(["/d/kolo/index.html"]);
  assert.equal(shown(files, { tab: "all", mine }).length, 3);
  assert.deepEqual(shown(files, { tab: "mine", mine }).map((f) => nameOf(f.path)), ["kolo"]);
  assert.deepEqual(shown(files, { tab: "others", mine }).map((f) => nameOf(f.path)), ["deck", "landing"]);
});

test("search by name, path and session; sort - newest first or by name", () => {
  assert.deepEqual(shown(files, { q: "ANIM" }).map((f) => nameOf(f.path)), ["landing"]);
  assert.deepEqual(shown(files, { q: "kolo" }).map((f) => nameOf(f.path)), ["kolo"]);
  assert.deepEqual(shown(files).map((f) => nameOf(f.path)), ["deck", "kolo", "landing"]);
  assert.deepEqual(shown(files, { sort: "name" }).map((f) => nameOf(f.path)), ["deck", "kolo", "landing"].sort());
  assert.deepEqual(shown(files, { sort: "recent" }).map((f) => f.last), [400, 300, 200]);
});

test("every sort order changes the order: the cards and the tiles follow the same four", () => {
  const names = (o) => shown(files, { sort: o }).map((f) => nameOf(f.path));
  assert.deepEqual(SORTS, ["recent", "oldest", "name", "name_desc"]);
  assert.deepEqual(names("oldest"), names("recent").reverse());
  assert.deepEqual(names("name_desc"), names("name").reverse());
  const groups = [{ key: "b", files: [{ last: 5 }] }, { key: "a", files: [{ last: 9 }] }, { key: "c", files: [{ last: 1 }, { last: 7 }] }];
  const keys = (o) => sortGroups(groups, o, (k) => k.toUpperCase()).map((g) => g.key).join("");
  assert.equal(keys("recent"), "acb");
  assert.equal(keys("oldest"), "bca");
  assert.equal(keys("name"), "abc");
  assert.equal(keys("name_desc"), "cba");
  assert.equal(groups.map((g) => g.key).join(""), "bac", "the source list stays");
});

test("shown does not change the source list", () => {
  const before = files.map((f) => f.path).join();
  shown(files, { sort: "name" });
  assert.equal(files.map((f) => f.path).join(), before);
});

test("presets: all go to the designer (no Animation); each has a stub 'new ...: '", () => {
  assert.deepEqual(PRESETS.map((p) => p.id), ["slides", "design", "system", "codebase"]);
  for (const p of PRESETS) assert.equal(p.to, "designer");
  for (const p of PRESETS) assert.match(p.lead, /: $/);
});

test("a stub replaces the previous stub, but never the owner's words", () => {
  const [slides, , , code] = PRESETS;
  assert.equal(stubText("", slides.lead), slides.lead);
  assert.equal(stubText(slides.lead, code.lead), code.lead);
  assert.equal(stubText("make a landing page", code.lead), "make a landing page");
  assert.ok(isStub(slides.lead));
  assert.ok(!isStub("make a landing page"));
});

test("'edited N ago'", () => {
  assert.match(editedText({ last: 1000 }, 1000 + 7200), /^edited .+/);
  assert.equal(editedText({}, 1000), "");
});

test("language: English by default, any unknown language falls back to English", () => {
  for (const l of ["en", "", undefined, "de", "xx", "en-US"]) {
    lang(l);
    assert.equal(t("tab_all"), "All", String(l));
    assert.equal(PRESETS[0].title, "Presentation", String(l));
    assert.equal(PRESETS[0].lead, "new presentation: ", String(l));
  }
});

test("language: Russian when the hub language is Russian (also ru-RU)", () => {
  for (const l of ["ru", "ru-RU", "RU"]) {
    lang(l);
    assert.equal(t("tab_all"), "Все", l);
    assert.equal(PRESETS[0].title, "Презентация", l);
    assert.match(editedText({ last: 1000 }, 1000 + 7200), /^изменён .+/, l);
  }
});

test("language is read at use time: PRESETS getters and t() follow a switch without reloading", () => {
  const p = PRESETS.find((x) => x.id === "slides");
  lang("en");
  const en = [p.title, p.lead, t("sort_name")];
  lang("ru");
  const ru = [p.title, p.lead, t("sort_name")];
  lang("en");
  assert.deepEqual([p.title, p.lead, t("sort_name")], en);
  assert.notDeepEqual(en, ru);
  assert.deepEqual(ru, ["Презентация", "новая презентация: ", "Название, от А до Я"]);
});

test("a stub is recognised in every language, whichever one is active now", () => {
  lang("ru");
  const ruLead = PRESETS[1].lead;
  lang("en");
  assert.ok(isStub(ruLead));
  assert.equal(stubText(ruLead, PRESETS[0].lead), PRESETS[0].lead);
  const enLead = PRESETS[1].lead;
  lang("ru");
  assert.ok(isStub(enLead));
});

test("en and ru tables have the same keys; placeholders match", () => {
  assert.deepEqual(Object.keys(STR.ru).sort(), Object.keys(STR.en).sort());
  for (const k of Object.keys(STR.en)) {
    const ph = (s) => (s.match(/\{\w+\}/g) || []).sort().join();
    assert.equal(ph(STR.ru[k]), ph(STR.en[k]), k);
    assert.ok(STR.en[k] && STR.ru[k], k);
  }
});

test("every tab, sort and preset has a label in both languages", () => {
  for (const l of ["en", "ru"]) {
    lang(l);
    for (const id of TABS) assert.notEqual(t("tab_" + id), "tab_" + id);
    for (const id of SORTS) assert.notEqual(t("sort_" + id), "sort_" + id);
    for (const p of PRESETS) assert.ok(p.title && p.lead);
  }
});
