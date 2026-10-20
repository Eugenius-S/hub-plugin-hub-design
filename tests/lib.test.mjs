import { test } from "node:test";
import assert from "node:assert/strict";
import { PROPS, ZOOMS, canvasPort, chatLines, cssValue, describeChange, describeDrawing, draftCount, fileUrl, htmlPaths, message, recentHtml } from "../lib.js";

test("порт и адрес файла", () => {
  assert.equal(canvasPort("8787"), 8798);
  assert.equal(canvasPort(""), 8798);
  assert.equal(fileUrl("http://localhost:8798", "/Users/me/my site/index.html"), "http://localhost:8798/f/Users/me/my%20site/index.html");
  assert.equal(fileUrl("http://localhost:8798", "C:\\site\\a.html"), "http://localhost:8798/f/C:/site/a.html");
});

test("пути к HTML в тексте", () => {
  assert.deepEqual(htmlPaths("Готово: /Users/me/design/landing/index.html, смотри. И `~/x/a.htm`"), ["/Users/me/design/landing/index.html", "~/x/a.htm"]);
  assert.deepEqual(htmlPaths("https://example.com/a.html"), []);
});

test("последние HTML сессии — свежие первыми, без повторов", () => {
  const items = [
    { kind: "tool", input: { file_path: "/d/a/index.html" } },
    { kind: "tool", input: { file_path: "/d/a/styles.css" } },
    { kind: "out", text: "Сделал /d/b/page.html" },
    { kind: "file", path: "/d/c/x.png" },
    { kind: "tool", input: { file_path: "/d/a/index.html" } },
  ];
  assert.deepEqual(recentHtml(items), ["/d/a/index.html", "/d/b/page.html"]);
});

test("чат — только реплики и файлы", () => {
  const lines = chatLines([{ kind: "in", k: 1, text: "привет" }, { kind: "tool", k: 2 }, { kind: "out", k: 3, text: " " },
    { kind: "file", k: 4, path: "/d/x.png", caption: "вот" }, { kind: "sys", k: 5, text: "x" }]);
  assert.deepEqual(lines.map((l) => [l.k, l.text]), [[1, "привет"], [4, "вот\n/d/x.png"]]);
});

test("правка руками словами", () => {
  assert.equal(describeChange({ x0: 100, y0: 50, w0: 200, h0: 40, dx: 12, dy: -8, w: null, h: null }),
    "сдвиг +12 px по X, -8 px по Y (было x 100, y 50 → стало x 112, y 42)");
  assert.equal(describeChange({ x0: 0, y0: 0, w0: 200, h0: 40, dx: 0, dy: 0, w: 240, h: 40 }), "размер 200×40 → 240×40 px");
  assert.equal(describeChange({ dx: 0, dy: 0, w: null, t0: "Купить", t: "Попробовать" }), "текст «Купить» → «Попробовать»");
  assert.equal(describeChange({ dx: 0, dy: 0, w: 200, h: 40, w0: 200.2, h0: 39.8 }), "");
});

test("пачка дизайнеру — нумерованный список, пустое не идёт", () => {
  const text = message({
    path: "/d/a/index.html", round: 2, view: { w: 1280, h: 800 },
    comments: [{ sel: ".hero > h1", label: "Заголовок", text: "крупнее", x: 300, y: 120, w: 600, h: 80, ex: 100, ey: 90 },
      { sel: "p", text: "  " }],
    changes: [{ sel: ".cta", label: "Начать", x0: 10, y0: 20, w0: 100, h0: 40, dx: 0, dy: 16, w: null, h: null }],
  });
  const lines = text.split("\n");
  assert.match(lines[0], /`\/d\/a\/index.html` \(Hub Design, раунд 2; окно 1280×800/);
  assert.equal(lines[1], "1. Коммент к `.hero > h1` «Заголовок», точка x 300, y 120 (элемент 600×80 в x 100, y 90): крупнее");
  assert.equal(lines[2], "2. Поправил руками `.cta` «Начать»: сдвиг +16 px по Y (было x 10, y 20 → стало x 10, y 36).");
  assert.match(lines[3], /перенеси их в код/);
  assert.equal(message({ path: "/a.html", round: 1, view: { w: 1, h: 1 }, comments: [{ text: "" }], changes: [] }), "");
  assert.equal(draftCount([{ text: "a" }, { text: "" }], [{ dx: 1, dy: 0, x0: 0, y0: 0 }, { dx: 0, dy: 0 }]), 2);
});

test("css-правки и рисунки уходят словами", () => {
  const c = { dx: 0, dy: 0, css: { "font-size": { from: "16px", to: "20px" }, color: { from: "#111", to: "#111" } } };
  assert.equal(describeChange(c), "стиль: font-size 16px → 20px");
  const d = { kind: "arrow", sel: ".hero", label: "Герой", from: { x: 1, y: 2 }, to: { x: 30, y: 40 }, box: { x: 1, y: 2, w: 29, h: 38 }, text: "сюда" };
  assert.equal(describeDrawing(d), "стрелка от x 1, y 2 к x 30, y 40 около `.hero` «Герой»");
  const text = message({ path: "/a.html", round: 1, view: { w: 1, h: 1 }, comments: [], changes: [], drawings: [d] });
  assert.match(text.split("\n")[1], /^1\. Рисунок от руки: стрелка .* — сюда\.$/);
  assert.equal(draftCount([], [], [d, d]), 2);
});

test("значения полей панели", () => {
  const f = { kind: "num" };
  assert.equal(cssValue(f, "12"), "12px");
  assert.equal(cssValue(f, "1.5em"), "1.5em");
  assert.equal(cssValue(f, "abc"), null);
  assert.equal(cssValue({ kind: "num", unitless: true }, "0.8"), "0.8");
  assert.equal(cssValue({ kind: "color" }, " #fff "), "#fff");
  assert.equal(cssValue(f, ""), null);
  assert.ok(PROPS.every((g) => g.rows.every((r) => r.every((x) => x.p && x.kind))));
  assert.deepEqual(ZOOMS.slice(0, 2), [0, 50]);
});
