import { test } from "node:test";
import assert from "node:assert/strict";
import { CANVAS_MAX, CANVAS_MIN, PROPS, SWATCHES, ZOOMS, canvasPort, fitView, FRAME_TOP, LABEL_H, LABEL_GAP, TOOLBAR_BOTTOM, nameOf, nativePath, dashboardFiles, whoOf, windowHeight, wroteAt, recipientOf, searchOrder, frameTitle, nextSpot, toolMode, zoomAt, chatLines, cssValue, describeChange, describeDrawing, draftCount, fileUrl, htmlPaths, message, recentHtml, htmlAuthored, ago, createCancels, dueSessions, exitTarget, goneText, isGone, mergeTimeline, slimItems, timelineQuery, ASK_TTL, NEEDED, bannerText, hubName, installText, lacking, scrollsRight, normTweaks, tweakValue, tweakApply, describeTweak, tweakBase, selectedLine, normErrors, describeErrors, ERR_MAX, ERR_CUT, parseGridCols, gridCols, gridForm, normGrid, normGrids, gridRects, describeGrids, newGrid, GRIDS_MAX, anchorNote, AUTO_MS, autoSig, createAuto } from "../lib.js";
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

test("получатель: выбор владельца → писавший (лента или история) → приславший → никто; назвавший автором не считается", () => {
  const authors = [{ path: "/d/a.html", session: "gen-1", wrote: false, sent: false }, { path: "/d/b.html", session: "designer", wrote: true },
    { path: "/d/s.html", session: "gen-2", wrote: false, sent: true }];
  assert.deepEqual(recipientOf("/d/b.html", { authors }), { session: "designer", how: "wrote" });
  assert.deepEqual(recipientOf("/d/a.html", { authors }), { session: "", how: "named" });   // путь только упомянули
  assert.deepEqual(recipientOf("/d/s.html", { authors }), { session: "gen-2", how: "sent" });
  assert.deepEqual(recipientOf("/d/s.html", { authors, found: { "/d/s.html": "designer" } }), { session: "designer", how: "wrote" });   // писавший из истории главнее приславшего
  assert.deepEqual(recipientOf("/d/a.html", { authors, found: { "/d/a.html": "designer" } }), { session: "designer", how: "wrote" });
  assert.deepEqual(recipientOf("/d/a.html", { authors, found: { "/d/a.html": "designer" }, picked: { "/d/a.html": "writer" } }), { session: "writer", how: "picked" });
  assert.deepEqual(recipientOf("/d/none.html", { authors }), { session: "", how: "none" });
  assert.deepEqual(recipientOf("/d/none.html"), { session: "", how: "none" });
});

test("автор макета: Write/Edit главнее send-file, send-file главнее упоминания; хаб-dev, назвавший путь, не автор", () => {
  const file = "/Users/me/design/canva-bf/bf-post-1a.html";
  const tl = {
    designer: [{ kind: "tool", name: "Write", ts: 10, input: { file_path: file } }],
    "hub-dev": [{ kind: "out", ts: 50, text: `Правки к ${file}: сдвинь тег` }],
    other: [{ kind: "file", ts: 30, path: file }],
  };
  const a = htmlAuthored(tl).find((x) => x.path === file);
  assert.equal(a.session, "designer");
  assert.equal(a.wrote, true);
  assert.deepEqual(recipientOf(file, { authors: htmlAuthored(tl) }), { session: "designer", how: "wrote" });
  const only = htmlAuthored({ "hub-dev": tl["hub-dev"], other: tl.other }).find((x) => x.path === file);
  assert.deepEqual([only.session, only.sent, only.wrote], ["other", true, false]);   // прислал — автор; позже упомянувший — нет
  const named = htmlAuthored({ "hub-dev": tl["hub-dev"] });
  assert.deepEqual(recipientOf(file, { authors: named }), { session: "", how: "named" });
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

test("чат: «Вы» только у владельца, у остальных — имя; «—» не показываем", () => {
  const items = [
    { kind: "in", k: 1, text: "правь", from: { kind: "owner" } },
    { kind: "in", k: 2, text: "от синка", from: { kind: "session", name: "hub-sync" }, sender: "hub-sync" },
    { kind: "in", k: 3, text: "от ядра", from: { kind: "core" } },
    { kind: "in", k: 4, text: "плагин", from: { kind: "plugin", name: "tg-posts" } },
    { kind: "in", k: 5, text: "без поля", sender: "smm-regular" },
    { kind: "in", k: 6, text: "слово владельца без метки" },
    { kind: "out", k: 7, text: "готово" }, { kind: "out", k: 8, text: "—" }, { kind: "out", k: 9, text: " — " },
  ];
  const lines = chatLines(items, 40, "designer");
  assert.deepEqual(lines.map((l) => [l.k, l.who, l.mine]), [[1, "Вы", true], [2, "hub-sync", false], [3, "ядро", false], [4, "плагин tg-posts", false],
    [5, "smm-regular", false], [6, "Вы", true], [7, "designer", false]]);
  assert.equal(whoOf({ kind: "in", sender: "ext:tg-posts" }), "tg-posts");
});

test("файл от специалиста (owner.file): подпись — его имя, не «Вы»; картинка — отдельным полем, не путём в тексте", () => {
  const [pic, doc] = chatLines([{ kind: "file", k: 1, path: "/d/x.png", caption: "вот", image: true }, { kind: "file", k: 2, path: "/d/a.pdf", name: "a.pdf" }], 40, "designer");
  assert.deepEqual([pic.who, pic.mine, pic.image, pic.text], ["designer", false, "/d/x.png", "вот"]);
  assert.deepEqual([doc.who, doc.mine, doc.image, doc.text], ["designer", false, undefined, "/d/a.pdf"]);
});

test("имя макета одно везде: index.html — по папке", () => {
  assert.equal(nameOf("/d/kolo/index.html"), "kolo");
  assert.equal(nameOf("C:\\d\\kolo\\index.html"), "kolo");
  assert.equal(nameOf("/d/promo/landing.html"), "landing");
  assert.equal(nameOf("index.html"), "index");
});

test("дашборд: пути чужой ОС и без корня не показываем, открытый на холсте — показываем", () => {
  const mac = ["/Users/me/p", "/Users/me/q"];
  assert.ok(nativePath("/Users/me/kolo/index.html", mac));
  assert.ok(nativePath("~/x/a.html", mac));
  assert.ok(!nativePath("C:\\Users\\jiraf\\kolo\\index.html", mac));
  assert.ok(!nativePath("!Проекты/smm/a.html", mac));
  assert.ok(nativePath("C:\\Users\\jiraf\\kolo\\index.html", ["C:\\Users\\jiraf"]));
  assert.ok(!nativePath("/Users/me/a.html", ["C:\\Users\\jiraf"]));
  const authors = [{ path: "C:\\Users\\jiraf\\kolo\\index.html", session: "designer", ts: 5, last: 5 }, { path: "/Users/me/a/a.html", session: "designer", ts: 6, last: 6 }];
  const rows = dashboardFiles(authors, [{ path: "/Users/me/kolo/index.html" }, { path: "/Users/me/a/a.html" }], mac);
  assert.deepEqual(rows.map((r) => r.path), ["/Users/me/a/a.html", "/Users/me/kolo/index.html"]);
  assert.equal(rows[0].session, "designer");
});

test("дашборд: у макета только с холста — автор и время правки файла, не пустая строка", () => {
  const rows = dashboardFiles([], [{ path: "/Users/me/kolo/index.html" }], ["/Users/me"], { who: () => "designer", time: () => 1000 });
  assert.equal(rows[0].session, "designer");
  assert.equal(rows[0].last, 1000);
  assert.equal(dashboardFiles([], [{ path: "/Users/me/k.html" }], ["/Users/me"])[0].session, "");
});

test("первый фрейм — ниже тулбара минимум на 24 px, подпись над ним тоже", () => {
  assert.ok(FRAME_TOP - LABEL_H - LABEL_GAP >= TOOLBAR_BOTTOM + 24);
  for (const [W, H] of [[900, 500], [1000, 700], [1600, 1000], [500, 300]]) {
    const v = fitView([{ x: 0, y: 0, w: 1440, h: 900 }], W, H);
    assert.ok(v.y >= FRAME_TOP, `${W}×${H}: y ${v.y}`);
  }
  assert.ok(fitView([], 1000, 700).y >= FRAME_TOP);
});

test("scrollsRight: затухание справа только пока есть что прокрутить", () => {
  assert.equal(scrollsRight({ scrollLeft: 0, clientWidth: 600, scrollWidth: 800 }), true);
  assert.equal(scrollsRight({ scrollLeft: 100, clientWidth: 600, scrollWidth: 800 }), true);
  assert.equal(scrollsRight({ scrollLeft: 200, clientWidth: 600, scrollWidth: 800 }), false);
  assert.equal(scrollsRight({ scrollLeft: 0, clientWidth: 800, scrollWidth: 800 }), false);
  assert.equal(scrollsRight({ scrollLeft: 199.5, clientWidth: 600, scrollWidth: 800 }), false);
});

test("серия одного отправителя: подпись (head) только у первого сообщения", () => {
  const lines = chatLines([{ kind: "file", k: 1, path: "/d/x.png", image: true }, { kind: "out", k: 2, text: "вот шапка" }, { kind: "out", k: 3, text: "ещё" },
    { kind: "in", k: 4, text: "ок" }, { kind: "in", k: 5, text: "и ещё" }, { kind: "out", k: 6, text: "готово" }], 40, "designer");
  assert.deepEqual(lines.map((l) => l.head), [true, false, false, true, false, true]);
  assert.equal(chatLines([{ kind: "out", k: 1, text: "a" }], 40, "designer")[0].head, true);
});

test("крутилки: разбор hub-tweaks — типы, границы, мусор отбрасывается", () => {
  const t = normTweaks({
    accent: { editor: "color", default: "#2a78d6", options: ["#2a78d6", "#b45309"], var: "--accent", section: "Цвет" },
    density: { editor: "enum", options: ["compact", "cozy"], attr: "data-density" },
    radius: { editor: "int", min: 0, max: 32, unit: "px", default: 99, var: "--r" },
    scale: { editor: "float", min: 0.5, max: 2, step: 0.25, var: "--s" },
    dark: { editor: "boolean", default: true, attr: "data-dark" },
    title: { var: "--t" },
    nothing: { editor: "int", min: 0 },
    evil: { editor: "text", attr: "onclick" },
    empty: { editor: "enum", options: [], var: "--e" },
    "bad key!": { editor: "text", var: "--k" },
  });
  assert.deepEqual(t.map((x) => x.key), ["accent", "density", "radius", "scale", "dark", "title"]);
  assert.equal(t[0].section, "Цвет");
  assert.equal(t.find((x) => x.key === "radius").default, 32);       // default зажат в max
  assert.equal(t.find((x) => x.key === "title").editor, "text");     // тип по умолчанию
  assert.deepEqual(normTweaks(null), []);
  assert.deepEqual(normTweaks([1]), []);
  assert.equal(normTweaks(Object.fromEntries(Array.from({ length: 40 }, (_, i) => ["k" + i, { var: "--v" + i }]))).length, 24);
});

test("крутилки: значение по типу, цвет и вариант — только из options", () => {
  const [color, enm, int, float, bool] = normTweaks({
    a: { editor: "color", options: ["#fff", "#000"], var: "--a" }, b: { editor: "enum", options: ["x", "y"], attr: "data-b" },
    c: { editor: "int", min: 0, max: 10, var: "--c" }, d: { editor: "float", min: 0, max: 2, step: 0.25, var: "--d" }, e: { editor: "boolean", attr: "data-e" } });
  assert.equal(tweakValue(color, "#fff"), "#fff");
  assert.equal(tweakValue(color, "#123456"), null);
  assert.equal(tweakValue(enm, "z"), null);
  assert.equal(tweakValue(int, "7.6"), 8);
  assert.equal(tweakValue(int, "99"), 10);
  assert.equal(tweakValue(int, "abc"), null);
  assert.equal(tweakValue(float, "0.6"), 0.5);
  assert.equal(tweakValue(float, "1,3"), 1.25);
  assert.equal(tweakValue(bool, "true"), true);
  assert.equal(tweakValue(bool, false), false);
});

test("крутилки: что пишем в макет — переменная и/или атрибут", () => {
  const [r, d, b] = normTweaks({ r: { editor: "int", unit: "px", var: "--r", attr: "data-r" }, d: { editor: "enum", options: ["a"], attr: "data-d" }, b: { editor: "boolean", var: "--b", attr: "data-b" } });
  assert.deepEqual(tweakApply(r, 12), [{ kind: "var", name: "--r", value: "12px" }, { kind: "attr", name: "data-r", value: "12" }]);
  assert.deepEqual(tweakApply(d, "a"), [{ kind: "attr", name: "data-d", value: "a" }]);
  assert.deepEqual(tweakApply(b, true), [{ kind: "var", name: "--b", value: "1" }, { kind: "attr", name: "data-b", value: "" }]);
  assert.deepEqual(tweakApply(b, false), [{ kind: "var", name: "--b", value: "0" }, { kind: "attr", name: "data-b", value: null }]);
});

test("крутилки в пачке: строка «Крутилка `key`: из → в», без изменения не идёт, считаются как правка", () => {
  const t = { file: "/d/a/index.html", key: "accent", editor: "color", from: "#2a78d6", to: "#b45309" };
  assert.equal(describeTweak(t), "Крутилка `accent`: #2a78d6 → #b45309");
  assert.equal(describeTweak({ key: "r", editor: "int", unit: "px", from: 8, to: 12 }), "Крутилка `r`: 8px → 12px");
  assert.equal(describeTweak({ key: "dark", editor: "boolean", from: false, to: true }), "Крутилка `dark`: выкл → вкл");
  const text = message({ path: "/d/a/index.html", round: 1, view: { w: 1440, h: 900 }, comments: [], changes: [], tweaks: [t, { ...t, key: "same", from: "x", to: "x" }] });
  const lines = text.split("\n");
  assert.equal(lines[1], "1. Крутилка `accent`: #2a78d6 → #b45309.");
  assert.match(lines[2], /значениями по умолчанию/);
  assert.equal(lines.length, 3);
  assert.equal(draftCount([], [], [], [], [t, { ...t, to: t.from }]), 1);
  assert.equal(message({ path: "/a.html", round: 1, view: { w: 1, h: 1 }, comments: [], changes: [], tweaks: [{ ...t, to: t.from }] }), "");
});

test("крутилки: исходное значение — default, иначе то, что макет показывает сейчас", () => {
  const [a, b, c, d] = normTweaks({ a: { editor: "int", min: 0, max: 50, default: 8, var: "--a" }, b: { editor: "int", min: 0, max: 50, unit: "px", var: "--b" },
    c: { editor: "enum", options: ["x", "y"], attr: "data-c" }, d: { editor: "boolean", attr: "data-d" } });
  assert.equal(tweakBase(a, "30px"), 8);
  assert.equal(tweakBase(b, "30px"), 30);
  assert.equal(tweakBase(b, ""), 0);
  assert.equal(tweakBase(c, "y"), "y");
  assert.equal(tweakBase(c, "z"), "x");
  assert.equal(tweakBase(d, "1"), true);
  assert.equal(tweakBase(d, ""), false);
});

test("выделенное: строка «Выделено: файл `селектор` тег «подпись»», нет выделения — пусто", () => {
  assert.equal(selectedLine({ file: "/d/a/index.html", sel: "#hero > h1", tag: "h1", label: "Цены без сюрпризов" }), "Выделено: /d/a/index.html `#hero > h1` h1 «Цены без сюрпризов»");
  assert.equal(selectedLine({ file: "/d/a/index.html", sel: ".card:nth-of-type(2)", tag: "div", label: "" }), "Выделено: /d/a/index.html `.card:nth-of-type(2)` div");
  assert.equal(selectedLine({ file: "/d/a/index.html", sel: "p", tag: "p", label: "я".repeat(200) }).length < 120, true);
  assert.equal(selectedLine(null), "");
  assert.equal(selectedLine({ file: "/a.html", sel: null }), "");
});

test("normErrors: уникальные, обрезаны, без пустых и «Script error.»", () => {
  const long = "x".repeat(900);
  const r = normErrors([{ text: "TypeError: a is null", where: "app.js:12" }, { text: "TypeError: a is null" }, { text: "" }, { text: "Script error." }, { text: long }, "строкой"]);
  assert.deepEqual(r.map((e) => e.text.length > 100 ? "long" : e.text), ["TypeError: a is null", "long", "строкой"]);
  assert.equal(r[1].text.length, ERR_CUT);
  assert.deepEqual(normErrors(null), []);
});

test("describeErrors: до пяти, остальное — «и ещё K»", () => {
  const items = Array.from({ length: 8 }, (_, i) => ({ text: `Ошибка ${i}`, where: i ? "" : "a.js:3" }));
  const t = describeErrors(items);
  assert.match(t, /^Ошибки в макете \(8\):/);
  assert.match(t, /• Ошибка 0 \(a\.js:3\)/);
  assert.equal(t.split("\n").length, 1 + ERR_MAX + 1);
  assert.match(t, /и ещё 3$/);
  assert.equal(describeErrors([]), "");
});

test("message и draftCount: ошибки макета — один пункт пачки", () => {
  const errors = [{ file: "/d/a.html", items: [{ text: "ReferenceError: x is not defined", where: "a.html:9" }, { text: "Необработанный отказ промиса: Error: boom" }] }];
  const t = message({ path: "/d/a.html", round: 1, view: { w: 100, h: 100 }, comments: [], changes: [], errors });
  assert.match(t, /^Правки к дизайну `\/d\/a\.html`/);
  assert.match(t, /\n1\. Ошибки в макете \(2\):\n  • ReferenceError: x is not defined \(a\.html:9\)\n  • Необработанный отказ промиса: Error: boom/);
  assert.equal(draftCount([], [], [], [], [], errors), 1);
  assert.equal(draftCount([], [], [], [], [], [{ file: "x", items: [] }]), 0);
});

test("сетка: repeat(N, minmax(0,1fr)) → число колонок и обратно в той же форме", () => {
  assert.equal(parseGridCols("repeat(3, minmax(0,1fr))"), 3);
  assert.equal(parseGridCols("repeat( 4 , minmax(0px, 1fr) )"), 4);
  assert.equal(parseGridCols("repeat(2, 1fr)"), 2);
  assert.equal(parseGridCols("repeat(auto-fill, minmax(200px, 1fr))"), 0);
  assert.equal(parseGridCols("1fr 2fr"), 0);
  assert.equal(gridForm(5), "repeat(5, minmax(0, 1fr))");
  assert.equal(parseGridCols(gridForm(5)), 5);
});

test("gridCols: из записи в стиле, иначе — по дорожкам вычисленного значения", () => {
  assert.equal(gridCols("repeat(3, minmax(0, 1fr))", "100px 100px 100px"), 3);
  assert.equal(gridCols("", "300px 300px 300px 300px"), 4);
  assert.equal(gridCols("", "[a] 100px [b] minmax(10px, 1fr)"), 2);
  assert.equal(gridCols("", "none"), 0);
  assert.equal(gridCols("", ""), 0);
});

test("колонки в панели: cssValue кладёт целое 1–24 в форму repeat, остальное отклоняет", () => {
  const f = PROPS.flatMap((g) => g.rows.flat()).find((x) => x.p === "grid-template-columns");
  assert.equal(f.kind, "cols");
  assert.equal(cssValue(f, "4"), "repeat(4, minmax(0, 1fr))");
  assert.equal(cssValue(f, "0"), null);
  assert.equal(cssValue(f, "25"), null);
  assert.equal(cssValue(f, "1.5"), null);
  assert.equal(cssValue(f, "abc"), null);
  assert.ok(PROPS.find((g) => g.gridOnly));
});

test("describeChange: колонки сетки — «3 → 4» с исходной записью", () => {
  const c = { sel: ".g", dx: 0, dy: 0, css: { "grid-template-columns": { from: "repeat(3, minmax(0,1fr))", to: "repeat(4, minmax(0, 1fr))" } } };
  assert.match(describeChange(c), /колонки сетки 3 → 4 \(grid-template-columns: repeat\(3, minmax\(0,1fr\)\) → repeat\(4, minmax\(0, 1fr\)\)\)/);
});

test("сетки рамки: значения зажаты в пределы, лишнее отбрасывается", () => {
  const g = normGrid({ kind: "диагональ", count: 99, gutter: -5, margin: "40", color: "красный" });
  assert.deepEqual(g, { id: "", kind: "columns", count: 24, gutter: 0, margin: 40, color: "#ff3b30" });
  assert.equal(normGrid({ color: "#ABCDEF" }).color, "#abcdef");
  assert.equal(normGrids(Array.from({ length: 9 }, () => ({}))).length, GRIDS_MAX);
  assert.deepEqual(normGrids(null), []);
  assert.equal(newGrid([]).color, "#ff3b30");
  assert.equal(newGrid([{}, {}]).color, "#30d158");
});

test("gridRects: колонки, строки и клетки укладываются в рамку", () => {
  const cols = gridRects({ kind: "columns", count: 4, gutter: 20, margin: 40 }, 1000, 600);
  assert.equal(cols.length, 4);
  assert.deepEqual(cols[0], [40, 0, 215, 600]);   // (1000 − 80 − 60) / 4
  assert.equal(cols[3][0] + cols[3][2], 960);
  const rows = gridRects({ kind: "rows", count: 3, gutter: 0, margin: 0 }, 900, 300);
  assert.deepEqual(rows, [[0, 0, 900, 100], [0, 100, 900, 100], [0, 200, 900, 100]]);
  const cells = gridRects({ kind: "grid", count: 5, gutter: 0, margin: 0 }, 500, 300);
  assert.equal(cells.length, 15);
  assert.deepEqual(cells[0], [0, 0, 100, 100]);
  assert.deepEqual(gridRects({ kind: "columns", count: 10, gutter: 100, margin: 0 }, 500, 300), []);   // не умещается — пусто, не отрицательные полосы
});

test("message: сетки рамки — часть вида рамки, одной строкой после заголовка", () => {
  const grids = [{ kind: "columns", count: 12, gutter: 24, margin: 80, color: "#0a84ff" }];
  const t = message({ path: "/d/a.html", round: 2, view: { w: 1280, h: 800, grids }, comments: [{ text: "шире", x: 1, y: 2, w: 3, h: 4, ex: 5, ey: 6 }], changes: [] });
  const lines = t.split("\n");
  assert.match(lines[0], /^Правки к дизайну/);
  assert.equal(lines[1], "Сетка поверх рамки (ориентир раскладки, на холсте; в макете её нет): колонки 12 (зазор 24, поле 80, цвет #0a84ff).");
  assert.ok(!message({ path: "/d/a.html", round: 2, view: { w: 1, h: 1 }, comments: [{ text: "x", x: 1, y: 2, w: 3, h: 4, ex: 5, ey: 6 }], changes: [] }).includes("Сетка поверх"));
  assert.equal(describeGrids([{ kind: "grid", count: 8 }]), "клетки 8 (зазор 16, поле 0, цвет #ff3b30)");
});

test("коммент без id в вёрстке: в сообщении приметы элемента; потерянный — «не найден»", () => {
  const base = { id: "p1", n: 1, text: "крупнее", sel: "section > div.card > a.btn", label: "Купить", x: 360, y: 610, w: 240, h: 44, ex: 340, ey: 600 };
  const fp = { id: "", anc: "pricing", path: ["div", "a"], tag: "a", text: "Купить", attr: "", near: "Pro 9 $ Купить", cls: ["btn"], w: 240, h: 44, x: 340, y: 600 };
  const m = message({ path: "/d/a.html", round: 1, view: { w: 1440, h: 900 }, comments: [{ ...base, fp }], changes: [] });
  assert.match(m, /нет id, приметы: тег a, текст «Купить», внутри #pricing, классы \.btn, рядом «Pro 9 \$ Купить»\): крупнее/);
  // с id приметы не нужны
  assert.doesNotMatch(message({ path: "/d/a.html", round: 1, view: { w: 1, h: 1 }, comments: [{ ...base, sel: "#buy", fp: { ...fp, id: "buy" } }], changes: [] }), /приметы/);
  // старые пины без примет — как раньше
  assert.doesNotMatch(message({ path: "/d/a.html", round: 1, view: { w: 1, h: 1 }, comments: [base], changes: [] }), /приметы|не найден/);
  const lost = message({ path: "/d/a.html", round: 1, view: { w: 1, h: 1 }, comments: [{ ...base, fp, lost: true }], changes: [] });
  assert.match(lost, /элемент не найден — макет перевёрстан, точка осталась на прежнем месте\): крупнее/);
  assert.equal(anchorNote({ fp: { ...fp, id: "x" } }), "");
});

test("запись в файл: набор — черновики и отправленные, без done и без пустых; копия — рядом с файлом", async () => {
  const { writable, markWritten, markUnwritten, copyPath } = await import("../lib.js");
  const f = "/a/b/page.html";
  const list = [
    { file: f, state: "draft", sel: "a.btn", label: "Купить", tag: "a", dx: 5, dy: 0, x0: 1, y0: 2 },
    { file: f, state: "sent", sel: "h1", t0: "Старый", t: "Новый", w: null },
    { file: f, state: "done", sel: "p", dx: 9 },
    { file: f, state: "draft", sel: "i", dx: 0, dy: 0 },
    { file: "/other.html", state: "draft", sel: "a", dx: 1 },
  ];
  assert.deepEqual(writable(list, f).map((c) => c.sel), ["a.btn", "h1"]);
  assert.deepEqual(writable(list, f)[0], { sel: "a.btn", label: "Купить", tag: "a", t0: null, t: null, dx: 5, dy: 0, w: null, h: null, css: {} });
  assert.equal(copyPath(f, "page.r3.html"), "/a/b/page.r3.html");
  assert.equal(copyPath("C:\\d\\page.html", "page.r1.html"), "C:\\d\\page.r1.html");
  assert.equal(copyPath(f, ""), "");
  const tw = [{ file: f, state: "draft", key: "k" }];
  markWritten(list, tw, f, { done: ["a.btn"], skipped: [{ sel: "h1", why: "тег другой" }], ops: "done" });
  assert.equal(list[0].inFile, true);
  assert.equal(list[1].inFile, false);
  assert.equal(list[1].noWrite, "тег другой");
  assert.equal(list[2].inFile, undefined);   // done не трогаем
  assert.equal(list[4].inFile, undefined);   // чужой файл
  assert.equal(tw[0].inFile, true);
  markUnwritten(list, tw, f);
  assert.deepEqual([list[0].inFile, list[1].noWrite, tw[0].inFile], [false, undefined, false]);
});

test("message: записанные в файл пункты помечены, остальное — как раньше; путь копии и просьба её не трогать", () => {
  const f = "/a/b/page.html";
  const mk = (inFile) => ({ file: f, sel: "a.btn", label: "Купить", dx: 5, dy: 0, x0: 10, y0: 20, w0: 100, h0: 30, inFile });
  const base = { path: f, round: 2, comments: [], changes: [mk(false)] };
  const plain = message(base);
  assert.ok(!plain.includes("уже в файле"));
  assert.ok(plain.includes("перенеси их в код"));
  const done = message({ ...base, changes: [mk(true)], copies: { [f]: "page.r2.html" } });
  assert.match(done, /1\. Поправил руками `a\.btn` «Купить»: сдвиг .* — уже в файле\./);
  assert.ok(done.includes("`/a/b/page.r2.html`"));
  assert.ok(done.includes("не перезаписывай"));
  assert.ok(!done.includes("перенеси их в код"));
  // часть записана, часть нет — обе подсказки
  const mixed = message({ ...base, changes: [mk(true), { ...mk(false), sel: "h1", dx: 7 }], copies: { [f]: "page.r2.html" } });
  assert.equal(mixed.match(/уже в файле/g).length, 2);   // пометка пункта и «Пункты «уже в файле»…»
  assert.ok(mixed.includes("перенеси их в код"));
  // крутилка
  const tw = { file: f, key: "accent", label: "Акцент", editor: "color", from: "#000", to: "#f00", inFile: true };
  const t = message({ ...base, changes: [], tweaks: [tw], copies: { [f]: "page.r2.html" } });
  assert.match(t, /Крутилка `accent`: .* — уже в файле\./);
  assert.ok(!t.includes("сделай новые значениями по умолчанию"));
});

// автоотправка правок руками: 8 с после последнего движения, получатель — выбранный внизу, без плашки над полем
const fakeTimers = () => {
  let now = 0, id = 0;
  const q = new Map();
  return {
    set: (fn, ms) => { q.set(++id, [now + ms, fn]); return id; },
    clear: (i) => q.delete(i),
    tick(ms) { now += ms; for (const [i, [at, fn]] of [...q]) if (at <= now) { q.delete(i); fn(); } },
    pending: () => q.size,
  };
};
const itemsOf = (n) => ({ changes: Array.from({ length: n }, (_, i) => ({ sel: "a" + i })), tweaks: [], drawings: [] });

test("autoSig: слать нечего, нет получателя или стартовый экран — пустой слепок; получатель входит в слепок", () => {
  assert.equal(autoSig(itemsOf(0), "designer", false), "");
  assert.equal(autoSig(itemsOf(1), "", false), "");
  assert.equal(autoSig(itemsOf(1), "designer", true), "");
  assert.notEqual(autoSig(itemsOf(1), "designer", false), "");
  assert.notEqual(autoSig(itemsOf(1), "designer", false), autoSig(itemsOf(1), "animator", false));
  assert.equal(autoSig({ changes: [], tweaks: [{ key: "k" }], drawings: [] }, "designer", false) !== "", true);
});

test("createAuto: отправка через AUTO_MS после последней правки, каждое движение отсчитывает заново", () => {
  assert.equal(AUTO_MS, 8000);
  const t = fakeTimers();
  let fired = 0;
  const auto = createAuto({ fire: () => { fired++; }, set: t.set, clear: t.clear });
  auto.watch(autoSig(itemsOf(1), "designer", false));
  t.tick(7000);
  assert.equal(fired, 0);
  auto.watch(autoSig(itemsOf(2), "designer", false));   // владелец двинул ещё
  t.tick(7000);
  assert.equal(fired, 0);
  t.tick(1000);
  assert.equal(fired, 1);
  auto.watch(autoSig(itemsOf(2), "designer", false));   // слепок тот же — второй отсчёт не заводим
  assert.equal(t.pending(), 0);
});

test("createAuto: правки ушли или откатили — отсчёт снят; не ушло — само второй раз не шлём, новая правка — шлём", () => {
  const t = fakeTimers();
  let fired = 0;
  const auto = createAuto({ fire: () => { fired++; }, set: t.set, clear: t.clear });
  auto.watch(autoSig(itemsOf(1), "designer", false));
  auto.watch("");   // отправлено (слепок обнулился)
  t.tick(20000);
  assert.equal(fired, 0);
  auto.watch(autoSig(itemsOf(1), "designer", false));
  auto.fail();
  auto.watch("");
  auto.watch(autoSig(itemsOf(1), "designer", false));   // тот же слепок после сбоя
  t.tick(20000);
  assert.equal(fired, 0);
  auto.watch(autoSig(itemsOf(3), "designer", false));
  t.tick(8000);
  assert.equal(fired, 1);
  auto.retry(1000);   // получатель занят отправкой — повтор через секунду
  t.tick(1000);
  assert.equal(fired, 2);
});

test("writable: правка, ушедшая дизайнеру словами (handed), в файл не пишется", async () => {
  const { writable } = await import("../lib.js");
  const f = "/a/page.html";
  const mk = (sel, extra = {}) => ({ file: f, sel, dx: 5, dy: 0, state: "sent", ...extra });
  assert.deepEqual(writable([mk("a"), mk("b", { handed: true })], f).map((c) => c.sel), ["a"]);
});

test("карточки: вид файла, имя, путь из адреса, «Hide», строки по языку", async () => {
  const { cardKind, cardName, pathFromHref, hideToggle, cardText, HIDDEN_MAX, isAbsPath } = await import("../lib.js");
  assert.equal(cardKind("/a/p.html"), "design");
  for (const f of ["a.mp4", "a.MOV", "a.webm", "a.gif", "a.m4v"]) assert.equal(cardKind("/x/" + f), "video", f);
  assert.equal(cardKind("/a/p.png"), null);
  assert.equal(isAbsPath("/a/b.html"), true);
  assert.equal(isAbsPath("C:\\a\\b.html"), true);
  assert.equal(isAbsPath("a/b.html"), false);
  assert.equal(cardName("/d/hero-v2_final.html"), "Hero v2 final");
  assert.equal(cardName("/d/x.html", "  Чёрная\n пятница "), "Чёрная пятница");
  assert.equal(cardName("/d/kolo/index.html"), "Kolo");
  assert.equal(pathFromHref("/open?path=%2FUsers%2Fme%2Fa.mp4"), "/Users/me/a.mp4");
  assert.equal(pathFromHref("/api/file?path=%2Fa%2Fb.mp4&w=200"), "/a/b.mp4");
  assert.equal(pathFromHref("/somewhere"), "");
  assert.deepEqual(hideToggle(["/a"], "/b", true), ["/a", "/b"]);
  assert.deepEqual(hideToggle(["/a", "/b"], "/a", false), ["/b"]);
  assert.deepEqual(hideToggle(["/a"], "/a", true), ["/a"]);
  assert.equal(hideToggle(Array.from({ length: HIDDEN_MAX }, (_, i) => "/p" + i), "/new", true).length, HIDDEN_MAX);
  assert.equal(cardText("ru").hide, "Скрыть");
  assert.equal(cardText("ru-RU").hide, "Скрыть");
  assert.equal(cardText("de").hide, "Hide");
  assert.equal(cardText(undefined).open, "Open in Hub Design");
});

test("дашборд: макет, что открывали на холсте, остаётся в списке и после того, как рамка с холста ушла", () => {
  const mac = ["/Users/me"];
  const rows = dashboardFiles([], ["/Users/me/kolo/index.html", "/Users/me/a/a.html"], mac, { time: () => 5 });
  assert.deepEqual(rows.map((r) => r.path), ["/Users/me/kolo/index.html", "/Users/me/a/a.html"]);
  const authored = [{ path: "/Users/me/a/a.html", session: "designer", ts: 9, last: 9, wrote: true }];
  assert.equal(dashboardFiles(authored, ["/Users/me/a/a.html"], mac).length, 1);   // автор по ленте не дублируется
});

test("agent.js: после правки текста выделение снимается (серый прямоугольник поверх слова)", async () => {
  const { readFileSync } = await import("node:fs");
  const src = readFileSync(new URL("../agent.js", import.meta.url), "utf8");
  const body = src.slice(src.indexOf("function textEdit(el)"), src.indexOf("// --- рисование от руки"));
  const finish = body.slice(body.indexOf("const finish = "), body.indexOf("const onBlur"));
  assert.match(finish, /getSelection\(\)\.removeAllRanges\(\)/);
  assert.ok(finish.indexOf("removeAllRanges") > finish.indexOf('removeAttribute("contenteditable")'));
});

test("whoGets: правки идут автору; автора нет — дизайнеру, а не сессии, с которой пришли (hub-dev, хаб)", async () => {
  const { whoGets } = await import("../lib.js");
  const ok = new Set(["designer", "hub-dev"]);
  assert.equal(whoGets("animator", "hub-dev", ok), "animator");
  assert.equal(whoGets("", "hub-dev", ok), "designer");
  assert.equal(whoGets("", "hub-dev", new Set(["hub-dev"])), "hub-dev");   // дизайнера в хабе нет — что есть
});
