import { test } from "node:test";
import assert from "node:assert/strict";
import { NEEDED, PROPS, STR, ago, bannerText, chatLines, describeChange, describeDrawing, describeErrors, describeTweak, goneText, gridTitle, installText,
  message, newDesignPrefix, selectedLine, styleLine } from "../lib.js";
import { currentLang, setLangSource } from "../i18n.js";

let lang = "en";
setLangSource(() => lang);
const as = (l, fn) => { lang = l; try { return fn(); } finally { lang = "en"; } };
const cyr = /[Ѐ-ӿ]/;

const msg = () => message({ path: "/d/a/index.html", round: 2, view: { w: 1280, h: 800 }, comments: [{ sel: ".hero > h1", label: "Title", text: "bigger", x: 300, y: 120, w: 600, h: 80, ex: 100, ey: 90 }],
  changes: [{ sel: ".cta", label: "Start", x0: 10, y0: 20, w0: 100, h0: 40, dx: 0, dy: 16, w: null, h: null }] });

test("lib: en and ru tables have the same keys and placeholders", () => {
  assert.deepEqual(Object.keys(STR.ru).sort(), Object.keys(STR.en).sort());
  const ph = (s) => (s.match(/\{\w+\}/g) || []).sort().join();
  for (const k of Object.keys(STR.en)) assert.equal(ph(STR.ru[k]), ph(STR.en[k]), k);
});

test("lib: English texts contain no Cyrillic, Russian ones do", () => {
  for (const [k, v] of Object.entries(STR.en)) assert.ok(!cyr.test(v), k);
  assert.ok(Object.values(STR.ru).filter((v) => cyr.test(v)).length > Object.keys(STR.ru).length * 0.9);
});

test("the default language is English; ru-RU is Russian; any other language falls back to English", () => {
  assert.equal(currentLang(), "en");
  assert.equal(as("ru-RU", currentLang), "ru");
  assert.equal(as("de", currentLang), "en");
  assert.equal(as(undefined, currentLang), "en");
  assert.match(as("de", () => ago(1000, 1030)), /just now/);
});

test("the batch message to the designer: English by default, Russian by hub language, same structure", () => {
  const en = msg().split("\n");
  assert.equal(en[0], "Edits to the design `/d/a/index.html` (Hub Design, round 2; window 1280×800 px, coordinates from the top-left corner of the page).");
  assert.equal(en[1], "1. Comment on `.hero > h1` “Title”, point x 300, y 120 (element 600×80 at x 100, y 90): bigger");
  assert.equal(en[2], "2. Hand edit `.cta` “Start”: shift +16 px along Y (was x 10, y 20 → now x 10, y 36).");
  assert.match(en[3], /Put them into the code with the same look and the same numbers/);
  const ru = as("ru", () => msg()).split("\n");
  assert.match(ru[0], /^Правки к дизайну `\/d\/a\/index\.html` \(Hub Design, раунд 2; окно 1280×800 px/);
  assert.equal(ru.length, en.length);
  assert.equal(msg().split("\n").length, en.length);
});

test("words for edits follow the hub language at the moment of the call", () => {
  const c = { x0: 100, y0: 50, w0: 200, h0: 40, dx: 12, dy: -8, w: null, h: null };
  assert.equal(describeChange(c), "shift +12 px along X, -8 px along Y (was x 100, y 50 → now x 112, y 42)");
  assert.equal(as("ru", () => describeChange(c)), "сдвиг +12 px по X, -8 px по Y (было x 100, y 50 → стало x 112, y 42)");
  assert.equal(describeChange({ dx: 0, dy: 0, w: null, t0: "Buy", t: "Try" }), "text “Buy” → “Try”");
  const d = { kind: "arrow", sel: ".hero", label: "Hero", from: { x: 1, y: 2 }, to: { x: 30, y: 40 }, box: { x: 1, y: 2, w: 29, h: 38 }, text: "here" };
  assert.equal(describeDrawing(d), "arrow from x 1, y 2 to x 30, y 40 near `.hero` “Hero”");
  assert.equal(as("ru", () => describeDrawing(d)), "стрелка от x 1, y 2 к x 30, y 40 около `.hero` «Hero»");
  assert.equal(describeTweak({ key: "dark", editor: "boolean", from: false, to: true }), "Tweak `dark`: off → on");
  assert.equal(as("ru", () => describeTweak({ key: "dark", editor: "boolean", from: false, to: true })), "Крутилка `dark`: выкл → вкл");
  assert.equal(selectedLine({ file: "/d/a.html", sel: "#h", tag: "h1", label: "Prices" }), "Selected: /d/a.html `#h` h1 “Prices”");
  assert.equal(as("ru", () => selectedLine({ file: "/d/a.html", sel: "#h", tag: "h1", label: "Prices" })), "Выделено: /d/a.html `#h` h1 «Prices»");
});

test("relative time, errors, chat names, specialists and grids are English by default", () => {
  assert.deepEqual([ago(1000, 1030), ago(1000, 1600), ago(1000, 8200)], ["just now", "10 min ago", "2 h ago"]);
  assert.deepEqual(as("ru", () => [ago(1000, 1030), ago(1000, 1600), ago(1000, 8200)]), ["только что", "10 мин назад", "2 ч назад"]);
  assert.equal(describeErrors([{ text: "E1", where: "a.js:3" }, { text: "E2" }]), "Errors in the design (2):\n  • E1 (a.js:3)\n  • E2");
  assert.match(as("ru", () => describeErrors([{ text: "E1" }])), /^Ошибки в макете \(1\):/);
  const items = [{ kind: "in", k: 1, text: "x", from: { kind: "owner" } }, { kind: "in", k: 3, text: "y", from: { kind: "core" } }, { kind: "in", k: 4, text: "z", from: { kind: "plugin", name: "tg" } }];
  assert.deepEqual(chatLines(items, 40, "designer").map((l) => l.who), ["You", "core", "plugin tg"]);
  assert.deepEqual(as("ru", () => chatLines(items, 40, "designer").map((l) => l.who)), ["Вы", "ядро", "плагин tg"]);
  assert.equal(goneText("missing", "/d/x.html"), "File not found: /d/x.html");
  assert.equal(as("ru", () => goneText("missing", "/d/x.html")), "Файл не найден: /d/x.html");
  assert.match(goneText("denied", "/d/x.html"), /outside the hub's project and session folders/);
  assert.equal(installText("designer"), "Install the specialist for Hub Design: specialists install designer");
  assert.equal(as("ru", () => installText("designer")), "Поставь специалиста для Hub Design: specialists install designer");
  assert.equal(bannerText(NEEDED[0]), "Hub Design needs the designer");
  assert.equal(as("ru", () => bannerText(NEEDED[0])), "Для Hub Design нужен дизайнер");
  assert.deepEqual(["columns", "rows", "grid"].map(gridTitle), ["Columns", "Rows", "Cells"]);
  assert.deepEqual(as("ru", () => ["columns", "rows", "grid"].map(gridTitle)), ["Колонки", "Строки", "Клетки"]);
  assert.equal(newDesignPrefix(), "New design (Hub Design): ");
  assert.equal(as("ru", newDesignPrefix), "Новый макет (Hub Design): ");
});

test("getters follow the language: panel groups and specialists are read at use time", () => {
  assert.deepEqual(PROPS.map((g) => g.title), ["Text", "Size", "Layout", "Grid", "Block"]);
  assert.deepEqual(as("ru", () => PROPS.map((g) => g.title)), ["Текст", "Размер", "Раскладка", "Сетка", "Блок"]);
  assert.deepEqual(NEEDED.map((n) => n.title), ["designer", "writer", "animator"]);
  assert.deepEqual(as("ru", () => NEEDED.map((n) => n.title)), ["дизайнер", "райтер", "аниматор"]);
});

test("the style reference line is the same in every language: the designer's skill looks for it", () => {
  assert.equal(styleLine("/lib/marlin__a1.md"), "Style reference: /lib/marlin__a1.md");
  assert.equal(as("ru", () => styleLine("/lib/marlin__a1.md")), "Style reference: /lib/marlin__a1.md");
  assert.equal(styleLine(""), "");
  assert.equal(styleLine(null), "");
});

test("a style goes at the end of the batch, before the auto-send mark; no batch - no message; none chosen - the message is as before", () => {
  const base = { path: "/d/a/index.html", round: 2, view: { w: 1280, h: 800 }, comments: [{ sel: "p", label: "P", text: "bigger", x: 1, y: 2, w: 3, h: 4, ex: 0, ey: 0 }], changes: [] };
  const plain = message(base);
  const withStyle = message({ ...base, style: "/lib/marlin__a1.md" });
  assert.equal(withStyle, plain + "\n\nStyle reference: /lib/marlin__a1.md");
  assert.equal(as("ru", () => message({ ...base, style: "/lib/marlin__a1.md" })).split("\n").pop(), "Style reference: /lib/marlin__a1.md");
  assert.equal(message({ ...base, style: "" }), plain);
  assert.equal(message({ path: "/a.html", round: 1, view: { w: 1, h: 1 }, comments: [], changes: [], style: "/lib/x.md" }), "");
  const auto = message({ ...base, style: "/lib/marlin__a1.md", auto: true }).split("\n\n");
  assert.equal(auto[auto.length - 2], "Style reference: /lib/marlin__a1.md");
});
