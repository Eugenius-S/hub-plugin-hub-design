import { test } from "node:test";
import assert from "node:assert/strict";
import { PRESETS, SORTS, STR, TABS, editedText, isStub, nameOf, shown, stubText, t } from "../dashboard.js";
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

test("shown does not change the source list", () => {
  const before = files.map((f) => f.path).join();
  shown(files, { sort: "name" });
  assert.equal(files.map((f) => f.path).join(), before);
});

test("presets: Animation goes to the animator, the rest to the designer; each has a stub 'new ...: '", () => {
  assert.deepEqual(PRESETS.map((p) => p.id), ["slides", "design", "codebase", "system", "motion"]);
  assert.equal(PRESETS.find((p) => p.id === "motion").to, "animator");
  for (const p of PRESETS.filter((p) => p.id !== "motion")) assert.equal(p.to, "designer");
  for (const p of PRESETS) assert.match(p.lead, /: $/);
});

test("a stub replaces the previous stub, but never the owner's words", () => {
  const [slides, , , , motion] = PRESETS;
  assert.equal(stubText("", slides.lead), slides.lead);
  assert.equal(stubText(slides.lead, motion.lead), motion.lead);
  assert.equal(stubText("make a landing page", motion.lead), "make a landing page");
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
  const p = PRESETS.find((x) => x.id === "motion");
  lang("en");
  const en = [p.title, p.lead, t("sort_name")];
  lang("ru");
  const ru = [p.title, p.lead, t("sort_name")];
  lang("en");
  assert.deepEqual([p.title, p.lead, t("sort_name")], en);
  assert.notDeepEqual(en, ru);
  assert.deepEqual(ru, ["Анимация", "новая анимация: ", "По названию"]);
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
