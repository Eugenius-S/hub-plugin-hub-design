import { test } from "node:test";
import assert from "node:assert/strict";
import { CANVAS_MAX, CANVAS_MIN, PROPS, SWATCHES, ZOOMS, canvasPort, fitView, windowHeight, wroteAt, recipientOf, searchOrder, frameTitle, nextSpot, toolMode, zoomAt, chatLines, cssValue, describeChange, describeDrawing, draftCount, fileUrl, htmlPaths, message, recentHtml, htmlAuthored, ago, createCancels, dueSessions, exitTarget, goneText, isGone, mergeTimeline, slimItems, timelineQuery, ASK_TTL, NEEDED, bannerText, hubName, installText, lacking } from "../lib.js";
import { PRESETS } from "../dashboard.js";

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

test("зум к курсору: точка под курсором стоит на месте", () => {
  const v = { x: 40, y: 30, k: 1 };
  const z = zoomAt(v, 2, 300, 200);
  assert.equal(z.k, 2);
  // сцена-точка под курсором до и после
  assert.equal((300 - v.x) / v.k, (300 - z.x) / z.k);
  assert.equal((200 - v.y) / v.k, (200 - z.y) / z.k);
  assert.equal(zoomAt(v, 1000, 0, 0).k, CANVAS_MAX);
  assert.equal(zoomAt(v, 0.0001, 0, 0).k, CANVAS_MIN);
});

test("вписать фреймы: все влезают и по центру, не крупнее 100%", () => {
  const frames = [{ x: 0, y: 0, w: 1440, h: 900 }, { x: 1520, y: 0, w: 390, h: 844 }];
  const v = fitView(frames, 1000, 700);
  assert.ok(v.k < 1);
  assert.ok(v.x >= 0 && v.x + 1910 * v.k <= 1000 + 0.5);
  assert.ok(v.y + 900 * v.k <= 700 + 0.5);
  assert.equal(fitView([{ x: 0, y: 0, w: 100, h: 100 }], 1000, 700).k, 1);
  assert.equal(fitView([], 1000, 700).k, 1);
});

test("новый фрейм — справа от последнего с зазором", () => {
  assert.deepEqual(nextSpot([], 1440), { x: 0, y: 0 });
  assert.deepEqual(nextSpot([{ x: 0, y: 0, w: 1440, h: 900 }], 390), { x: 1520, y: 0 });
});

test("окно фрейма — экранной высоты, а не высоты документа; подпись, режимы инструментов, цвета", () => {
  assert.equal(windowHeight(1440), 900);
  assert.equal(windowHeight(390), 844);
  assert.equal(windowHeight(), 900);
  assert.ok(windowHeight(1440) < 1200);   // 0.4.0: рамка тянулась до 8000 px, и 100vh макета с ней
  assert.equal(frameTitle("/a/b/index.html"), "index.html");
  assert.equal(frameTitle("C:\\a\\b.html"), "b.html");
  assert.equal(toolMode("select"), "edit");
  assert.equal(toolMode("comment"), "comment");
  assert.equal(toolMode("pencil"), "draw");
  assert.equal(toolMode("shape"), "draw");
  assert.equal(toolMode("text"), "text");
  assert.equal(toolMode("hand"), "view");
  assert.equal(toolMode("нет"), "view");
  assert.ok(SWATCHES.length >= 8 && SWATCHES.every((c) => /^#[0-9a-f]{6}$/.test(c)));
});

test("пачка с нескольких фреймов — разделами по файлам, заметки отдельно", () => {
  const text = message({
    path: "/a.html", round: 2, views: { "/a.html": { w: 1440, h: 900 }, "/b.html": { w: 390, h: 844 } },
    comments: [{ file: "/a.html", text: "Крупнее", sel: ".h1", label: "Привет", x: 10, y: 20, w: 100, h: 40, ex: 0, ey: 0 },
      { file: "/b.html", text: "Цвет", sel: ".btn", x: 5, y: 6, w: 80, h: 30, ex: 0, ey: 0 }],
    changes: [], notes: [{ text: "Общая мысль" }, { text: "  " }],
    drawings: [{ file: "/b.html", kind: "oval", box: { x: 1, y: 2, w: 30, h: 40 }, from: { x: 0, y: 0 }, to: { x: 0, y: 0 } },
      { file: "/b.html", kind: "box", box: { x: 5, y: 6, w: 70, h: 80 }, from: { x: 0, y: 0 }, to: { x: 0, y: 0 } }],
  });
  assert.match(text, /дизайну `\/a\.html`/);
  assert.match(text, /дизайну `\/b\.html`[^]*окно 390×844/);
  assert.match(text, /обведена овалом/);
  assert.match(text, /выделена рамкой/);
  assert.match(text, /Заметка на холсте Общая мысль/);
  assert.ok(!text.includes("  \n"));
  assert.equal(draftCount([{ text: "x" }], [], [{}, {}], [{ text: "n" }, { text: "" }]), 4);
});

test("автор макета — кто писал файл, иначе кто назвал последним; хаб и исполнители не в счёт", () => {
  const tl = {
    designer: [{ kind: "tool", name: "Write", ts: 100, input: { file_path: "/d/a/index.html" } }, { kind: "out", ts: 110, text: "Готово /d/b/page.html" }],
    "gen-1": [{ kind: "out", ts: 200, text: "Смотри /d/a/index.html и /d/b/page.html" }, { kind: "tool", name: "Read", ts: 210, input: { file_path: "/d/c/x.html" } }],
    hub: [{ kind: "tool", name: "Write", ts: 300, input: { file_path: "/d/a/index.html" } }],
  };
  const r = htmlAuthored(tl, (n) => n === "hub");
  const by = Object.fromEntries(r.map((x) => [x.path, x.session]));
  assert.equal(by["/d/a/index.html"], "designer");   // писал дизайнер, gen-1 только назвал
  assert.equal(by["/d/b/page.html"], "gen-1");        // никто не писал — последний назвавший
  assert.equal(by["/d/c/x.html"], "gen-1");
  assert.deepEqual(r.map((x) => x.path), ["/d/c/x.html", "/d/a/index.html", "/d/b/page.html"]);   // свежие первыми
  assert.deepEqual(htmlAuthored({ s: [{ kind: "tool", name: "Write", ts: 1, input: { file_path: "/a.css" } }] }), []);
});

test("«N мин назад»", () => {
  assert.equal(ago(1000, 1030), "только что");
  assert.equal(ago(1000, 1000 + 600), "10 мин назад");
  assert.equal(ago(1000, 1000 + 7200), "2 ч назад");
  assert.equal(ago(0, 5), "");
});

test("получатель: выбор владельца → писавший (лента или история) → только назвавший → никто, молча не дизайнер", () => {
  const authors = [{ path: "/d/a.html", session: "gen-1", wrote: false }, { path: "/d/b.html", session: "designer", wrote: true }];
  assert.deepEqual(recipientOf("/d/b.html", { authors }), { session: "designer", how: "wrote" });
  assert.deepEqual(recipientOf("/d/a.html", { authors }), { session: "gen-1", how: "named" });
  assert.deepEqual(recipientOf("/d/a.html", { authors, found: { "/d/a.html": "designer" } }), { session: "designer", how: "wrote" });
  assert.deepEqual(recipientOf("/d/a.html", { authors, found: { "/d/a.html": "designer" }, picked: { "/d/a.html": "writer" } }), { session: "writer", how: "picked" });
  assert.deepEqual(recipientOf("/d/none.html", { authors }), { session: "", how: "none" });
  assert.deepEqual(recipientOf("/d/none.html"), { session: "", how: "none" });
});

test("Write макета ушёл за хвост ленты: ищем его в истории, назвавший в хвосте не автор", () => {
  const history = [{ kind: "tool", name: "Write", ts: 5, input: { file_path: "/d/kolo/index.html" } }, { kind: "tool", name: "Read", ts: 6, input: { file_path: "/d/kolo/index.html" } }];
  assert.equal(wroteAt(history, "/d/kolo/index.html"), 5);
  assert.equal(wroteAt(history, "/d/other.html"), 0);
  assert.equal(wroteAt([{ kind: "out", ts: 9, text: "/d/kolo/index.html" }], "/d/kolo/index.html"), 0);
  const o = searchOrder("/d/kolo/index.html", [{ path: "/d/kolo/index.html", session: "gen-1" }], ["writer", "gen-1", "designer"]);
  assert.deepEqual(o, { near: ["gen-1", "designer"], far: ["writer"] });
});

test("путь с пробелами берётся целиком из кавычек, обрубки и хвосты относительных путей — нет (0.5.1: «{error: no file}» в рамке)", () => {
  const real = "/Users/me/Disk/!!Work/!!! 2M DESIGN/!Проекты/smm/weekly/weekly-2026-10-17.html";
  assert.deepEqual(htmlPaths(`Откроется: \`${real}\` и Threads/analytics/weekly/weekly-2026-10-17.html`), [real]);
  assert.deepEqual(htmlPaths(`лежит в ${real} рядом`), []);     // без кавычек пробел обрывает путь — гадать про хвост нельзя
  assert.deepEqual(htmlPaths("файл /a/b.html, и 'C:\\Мои файлы\\x.html' и /c/d.htm."), ["/a/b.html", "C:\\Мои файлы\\x.html", "/c/d.htm"]);
  assert.deepEqual(htmlPaths("see ./x/a.html and ../b.html and weekly/a.html"), []);   // относительные не абсолютные
});

test("макеты по событиям: лента перечитывается, как только вырос её номер правки, без выдержки по времени", () => {
  const cache = new Map([["gen-1", { rev: 5, epoch: 1, items: [] }]]);
  assert.deepEqual(dueSessions(["gen-1", "gen-2"], { "gen-1": 5, "gen-2": 3 }, 1, cache), ["gen-2"]);   // новая сессия — сразу
  assert.deepEqual(dueSessions(["gen-1"], { "gen-1": 6 }, 1, cache), ["gen-1"]);                        // номер вырос — сразу, не через 20 с
  assert.deepEqual(dueSessions(["gen-1"], { "gen-1": 5 }, 2, cache), ["gen-1"]);                        // ядро перезапущено — заново
  assert.equal(dueSessions.length, 4);                                                                  // времени среди аргументов нет
});

test("перечитываем только изменённые строки: since — прошлый номер правки, ответ ядра дописывается к хранимому", () => {
  assert.deepEqual(timelineQuery("gen-1", undefined, 7), { session: "gen-1", since: "0", epoch: "7" });
  assert.deepEqual(timelineQuery("gen-1", { rev: 5, epoch: 7, items: [] }, 7), { session: "gen-1", since: "5", epoch: "7" });
  assert.equal(timelineQuery("gen-1", { rev: 5, epoch: 6, items: [] }, 7).since, "0");                  // чужая эпоха — с нуля
  const w = { kind: "tool", name: "Write", ts: 1, input: { file_path: "/d/a.html" } };
  const first = mergeTimeline(undefined, { epoch: 7, rev: 5, full: true, items: [w, { kind: "out", ts: 2, text: "привет" }] }, 5);
  assert.deepEqual(first.items.map((i) => i.input.file_path), ["/d/a.html"]);                            // про HTML только
  const next = mergeTimeline(first, { epoch: 7, rev: 9, full: false, items: [{ kind: "tool", name: "Write", ts: 3, input: { file_path: "/d/b.html" } }, w] }, 9);
  assert.equal(next.rev, 9);
  assert.deepEqual(next.items.map((i) => i.input.file_path), ["/d/a.html", "/d/b.html"]);                // дубль строки не множится
  const whole = mergeTimeline(next, { epoch: 8, rev: 2, full: true, items: [] }, 2);
  assert.deepEqual(whole.items, []);                                                                     // ядро отдало ленту целиком — прежнее не держим
  assert.equal(slimItems([{ kind: "tool", name: "Read", input: { file_path: "/a.css" } }]).length, 0);
});

test("пропавший файл: понятная строка с путём", () => {
  assert.equal(isGone("missing"), true);
  assert.equal(isGone("denied"), true);
  assert.equal(isGone("ok"), false);
  assert.equal(isGone(undefined), false);                                                                // ещё не спрашивали — не пугаем
  assert.equal(goneText("missing", "/d/weekly.html"), "Файл не найден: /d/weekly.html");
  assert.match(goneText("denied", "/d/x.html"), /вне папок/);
});

test("«Убрать» из очереди: сначала «Отменить», настоящая отмена — через 6 секунд, отмена владельца её отзывает", async () => {
  const timers = [], posts = [];
  let queued = true, changes = 0;
  const c = createCancels({ post: async (url, body) => { posts.push([url, body]); return {}; }, isQueued: () => queued, onChange: () => changes++,
    setT: (fn, ms) => { timers.push({ fn, ms }); return timers.length - 1; }, clearT: (i) => { timers[i].fn = null; } });
  c.start("designer", { id: "m1", text: "правка" });
  assert.equal(timers[0].ms, 6000);
  assert.deepEqual(posts, []);                                    // сразу ничего не убрано
  assert.equal(c.sig(), "m1p");
  c.undo("m1");                                                   // передумал
  assert.equal(timers[0].fn, null);
  assert.equal(c.get("m1"), undefined);
  assert.deepEqual(posts, []);
  c.start("designer", { id: "m2", text: "ещё" });
  await timers[1].fn();                                           // 6 секунд прошли
  assert.deepEqual(posts, [["/api/queue/cancel", { session: "designer", id: "m2" }]]);
  assert.equal(c.get("m2").done, true);
  queued = false;
  c.start("designer", { id: "m3", text: "ушло само" });
  await timers[2].fn();
  assert.equal(posts.length, 1);                                  // уже не в очереди — отмену не шлём
  assert.equal(c.get("m3"), undefined);
  const bad = createCancels({ post: async () => ({ error: "нет" }), isQueued: () => true, onChange() {}, setT: () => 0, clearT() {} });
  bad.start("s", { id: "m4", text: "x" });
  await bad.send("m4");
  assert.equal(bad.get("m4").failed, true);                       // ошибка видна, можно повторить
  assert.ok(changes > 0);
});

test("Exit Hub Design: в чат специалиста, с кем шёл разговор; нет его — откуда пришли; иначе главная", () => {
  assert.equal(exitTarget("designer", ["designer", "animator"], "#/s/hub", "hub-design"), "#/s/designer");
  assert.equal(exitTarget("мой агент", ["мой агент"], "", "hub-design"), "#/s/%D0%BC%D0%BE%D0%B9%20%D0%B0%D0%B3%D0%B5%D0%BD%D1%82");
  assert.equal(exitTarget("designer", ["animator"], "#/s/hub", "hub-design"), "#/s/hub");               // designer в хабе нет
  assert.equal(exitTarget("designer", [], "#/x/hub-design?a=1", "hub-design"), "#/");                  // «назад» — сам плагин: не петляем
  assert.equal(exitTarget("", undefined, "", "hub-design"), "#/");
});

test("специалисты плагина: designer обязателен, animator желателен; каждый пресет ведёт к кому-то из списка", () => {
  assert.deepEqual(NEEDED.map((n) => [n.name, n.need]), [["designer", "required"], ["animator", "wanted"]]);
  for (const p of PRESETS) assert.ok(NEEDED.some((n) => n.name === p.to), p.id);
});

test("lacking: кого нет в снимке; хаб за специалиста не считается; просили — ждём, по истечении снова просим", () => {
  const sessions = [{ name: "hub", kind: "hub" }, { name: "animator" }];
  assert.deepEqual(lacking(sessions).map((n) => [n.name, n.state]), [["designer", "ask"]]);
  assert.deepEqual(lacking([...sessions, { name: "designer" }]), []);
  assert.deepEqual(lacking([{ name: "designer", kind: "hub" }]).map((n) => n.name), ["designer", "animator"]);
  assert.equal(lacking(sessions, { designer: 1000 }, 1000 + ASK_TTL - 1)[0].state, "wait");
  assert.equal(lacking(sessions, { designer: 1000 }, 1000 + ASK_TTL)[0].state, "ask");
  assert.deepEqual(lacking(sessions, { designer: 1000 }, 5, []), []);
});

test("сообщение хабу и его имя", () => {
  assert.equal(installText("designer"), "Поставь специалиста для Hub Design: specialists install designer");
  assert.equal(hubName([{ name: "x" }, { name: "main", kind: "hub" }]), "main");
  assert.equal(hubName([]), "hub");
  assert.equal(bannerText(NEEDED[0]), "Для Hub Design нужен дизайнер");
});
