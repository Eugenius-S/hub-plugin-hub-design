// Hub Design: холст с HTML-дизайнами и разговор с дизайнером слева. На холсте (canvas.js) фреймы-артборды: выбор — рамка и
// перетаскивание элементов внутри фрейма, стили и цвет — в панели, «Комментарий» — клик ставит пин с текстом, карандаш и
// фигуры — отметить место, заметка — стикер на холсте. Правки руками уходят сами через 8 с после последней — тому,
// кто выбран внизу (по умолчанию дизайнер); комментарии — своей кнопкой или вместе с вашим текстом. Поменял файл — фрейм перезагружается, пины прошлого раунда гаснут.
// Дизайн показывает процесс плагина (server.py) со своего адреса, пины и рамки рисует agent.js внутри каждого фрейма.
import { ASK_TTL, NEW_DESIGN, PROPS, SWATCHES, canvasPort, chatLines, createCancels, cssValue, describeChange, describeDrawing, draftCount, normErrors, gridCols, gridForm, dueSessions, exitTarget, dashboardFiles, cardKind, fileUrl, nameOf,
  goneText, hasEffect, htmlAuthored, htmlPaths, hubName, installText, isGone, lacking, mergeTimeline, message, nextSpot, recentHtml, recipientOf, whoGets, searchOrder, selectedLine, timelineQuery, toolMode, windowHeight, autoSig, createAuto,
  describeTweak, normTweaks, tweakApply, tweakBase, tweakEffect, tweakValue, wroteAt, writable, markWritten, markUnwritten } from "./lib.js";
import { createCanvas } from "./canvas.js";
import { mountCards } from "./card.js";
import { createDashboard, createNeed, isStub, stubText } from "./dashboard.js";
import { CANVAS_ICONS as CI } from "./icons.js";

const ID = "hub-design";
const STORE = "hub-design:";
const OLD_STORE = "design-canvas:";   // ключи до 0.2.0 (плагин назывался design-canvas): подхватываем один раз
const DEFAULT_SESSION = "designer";
const HOLD = "Hub Design";
const PROP_LIST = [...new Set(PROPS.flatMap((g) => g.rows.flat().map((f) => f.p)))];

let hub = null;
let ui = null;        // узлы вида, живут между снимками
const specs = new Map();   // файл → {list: разобранные крутилки макета, base: {ключ: исходное значение}}
const eps = new Map();   // фрейм → {id, path, iframe, ready}: у каждого фрейма свой agent.js
const P = {
  session: DEFAULT_SESSION, tab: "chat", tool: "select", shapes: { pencil: "free", shape: "rect" }, propsOpen: false, propsUser: true,
  frames: [], focus: "", pins: [], changes: [], drawings: [], notes: [], tweaks: [], errs: [], writers: {}, round: 1, seq: 0, cv: { x: 56, y: 84, k: 1, auto: true },
  alive: null, items: [], rev: -1, epoch: null, busy: false, note: "", sel: null, hist: {}, lastEdit: "", shown: false, handoff: null,
  authors: [], opened: {}, have: {}, times: {}, ok: new Set(), picked: {}, found: {}, pinned: null, home: true, preset: null, asked: {}, homeWho: null, back: "", openFrom: null, sent: 0,
};

globalThis.__hubDesign = () => P;   // для проверки в песочнице: пачка и состояние вида

const origin = () => `${location.protocol}//${location.hostname}:${canvasPort(location.port)}`;
const local = () => ["localhost", "127.0.0.1"].includes(location.hostname);
const getKey = (k) => localStorage.getItem(STORE + k) ?? localStorage.getItem(OLD_STORE + k);

export default function register(h) {
  hub = h;
  hub.addStyle("style.css");
  hub.addStyle("dashboard.css");
  hub.addStyle("card.css");
  addEventListener("message", onFrame);
  // карточки макетов и видео в ленте чата любой сессии; клик по карточке открывает файл здесь
  mountCards({ origin, local, open: openFile, lang: () => hub.lang, abs, session: () => decodeURIComponent((location.hash.match(/^#\/s\/([^/?]+)/) || [])[1] || "") });
  // адрес до Hub Design: «✕» возвращает туда (нет — на главную)
  let prev = location.hash;
  addEventListener("hashchange", (e) => {
    const was = e.oldURL ? new URL(e.oldURL).hash : prev;
    prev = location.hash;
    if (was && !was.startsWith("#/x/" + ID)) P.back = was;
  });
  hub.addView({
    id: ID, title: "Hub Design", subtitle: "холст, пины и правки дизайнеру", icon: "icon.svg", full: true,
    render, show() { P.shown = true; sidebar(true); fromAddress(); ping(); }, hide() { P.shown = false; sidebar(false); },
  });
  // кнопка-палитра в поле ввода сессии (место composer.tools — дополнение этого хаба): открыть Hub Design с этим разговором
  if (typeof hub.addSlot === "function") {
    hub.addSlot("composer.tools", {
      id: "design",
      render(root, snap, ctx) {
        root.__ctx = ctx;
        if (!ctx.session) return root.replaceChildren();   // не чат сессии (своё поле Hub Design, формы)
        if (root.firstChild) return;
        const b = hub.el("button", "btn round quiet hd-palette");
        b.type = "button";
        b.title = "Открыть в Hub Design: разговор этой сессии и набранный текст";
        b.setAttribute("aria-label", b.title);
        b.innerHTML = PALETTE;
        b.addEventListener("click", () => handoff(root));
        root.append(b);
      },
    });
  }
}

const PALETTE = '<svg viewBox="0 0 24 24" class="icon" aria-hidden="true"><path fill="currentColor" fill-rule="evenodd" d="M12 3a9 9 0 1 0 0 18c1.4 0 2.2-.9 2.2-2 0-.6-.3-1.1-.3-1.7 0-1 .8-1.7 1.8-1.7H17a4 4 0 0 0 4-4C21 6.6 17 3 12 3Zm-5 9a1.4 1.4 0 1 1 0-2.800A1.400 1.400 0 0 1 7 12Zm3-4a1.400 1.400 0 1 1 0-2.800A1.400 1.400 0 0 1 10 8Zm5 0a1.400 1.400 0 1 1 0-2.800A1.400 1.400 0 0 1 15 8Z"/></svg>';

// перенос из чата сессии: набранное в поле уезжает в Hub Design (поле у сессии очищается — текст не пропадёт, он в поле у дизайнера).
// Получатель — не эта сессия, а специалист макета: дизайнер или автор открытого файла; сессия лишь подсказывает, какой макет открыть
function handoff(root) {
  const ctx = root.__ctx;
  if (!ctx?.session) return;
  const ta = root.closest("form")?.querySelector("textarea");
  const text = ta ? ta.value : "";
  P.handoff = { session: ctx.session.name, text };
  if (ta && text) { ta.value = ""; ta.dispatchEvent(new Event("input", { bubbles: true })); }
  hub.go(ID);
  // вид мог быть уже открыт и скрыт — show() сам заберёт перенос; если открыт сейчас — забираем здесь
  setTimeout(applyHandoff, 0);
}
function applyHandoff() {
  const h = P.handoff;
  if (!h || !ui) return;
  P.handoff = null;
  P.tab = "chat";
  P.openFrom = h.session;   // откроем последний макет этой сессии на холсте, если он у неё есть (пока в списке его нет — ждём ленты)
  const ta = ui.input.node.querySelector("textarea");
  if (ta && h.text) {
    ta.value = ta.value ? ta.value + "\n" + h.text : h.text;
    ta.dispatchEvent(new Event("input", { bubbles: true }));
  }
  save();
  openFromSession();
  paint();
  ui.input.focus();
}
function openFromSession() {
  const from = P.openFrom;
  if (!from) return;
  const mine = P.authors.find((a) => a.session === from);
  if (!mine) return;
  P.openFrom = null;
  if (!P.frames.some((f) => f.path === mine.path)) addFrame(mine.path, true, true); else { P.focus = mine.path; ui.cv.focusOn(mine.path); }
}

// боковую панель хаба прячет отдельный плагин hide-sidebar; нет его — события никто не слушает
function sidebar(hide) {
  try { window.dispatchEvent(new CustomEvent("hub-sidebar", { detail: { hide, by: "hub-design" } })); } catch { /* старый браузер */ }
}

// --- хранение пачки: одна доска в браузере — перезагрузка страницы её не теряет -----------------------------------
function save() {
  localStorage.setItem(STORE + "board", JSON.stringify({ frames: P.frames, pins: P.pins, changes: P.changes, drawings: P.drawings, notes: P.notes, tweaks: P.tweaks, errs: P.errs, writers: P.writers,
    round: P.round, cv: P.cv, shapes: P.shapes, picked: P.picked, found: P.found, opened: P.opened }));
  hold();
}
function load() {
  let b = null;
  try { b = JSON.parse(getKey("board") || "null"); } catch { b = null; }
  if (!b) b = legacy();
  P.frames = (b.frames || []).filter((f) => f && f.path).map((f) => (f.auto && !f.fixed ? { ...f, h: windowHeight(f.w) } : f));   // до 0.4.1 рамка тянулась по высоте документа
  P.picked = b.picked || {};
  P.found = b.found || {};
  P.opened = b.opened || {};   // когда-либо открытые на холсте макеты: с холста рамка уходит, с дашборда — нет
  P.pins = b.pins || [];
  P.changes = b.changes || [];
  P.drawings = b.drawings || [];
  P.notes = b.notes || [];
  P.tweaks = b.tweaks || [];
  P.errs = b.errs || [];
  P.writers = b.writers || {};
  P.round = b.round || 1;
  try { P.asked = JSON.parse(localStorage.getItem(STORE + "asked") || "{}") || {}; } catch { P.asked = {}; }
  if (b.cv) P.cv = { x: 56, y: 84, k: 1, auto: true, ...b.cv };
  if (b.shapes) P.shapes = { ...P.shapes, ...b.shapes };
  P.seq = [...P.pins, ...P.drawings, ...P.notes].reduce((m, p) => Math.max(m, Number(String(p.id).slice(1)) || 0), 0);
}
// доска версии 0.2.0 — один файл с пачкой по его пути
function legacy() {
  let last = {}, d = {};
  try { last = JSON.parse(getKey("last") || "{}"); } catch { last = {}; }
  if (!last.path) return {};
  try { d = JSON.parse(getKey(last.path) || "{}"); } catch { d = {}; }
  const stamp = (x) => ({ ...x, file: last.path });
  return { frames: [{ path: last.path, x: 0, y: 0, w: 1440, h: 900, auto: true }], pins: (d.pins || []).map(stamp), changes: (d.changes || []).map(stamp),
    drawings: (d.drawings || []).map(stamp), round: d.round || 1 };
}
// пачка не ушла — страница не перезагружается сама на новую версию хаба
function hold() {
  const html = document.documentElement;
  if (drafts() > 0) html.setAttribute("data-hub-hold", HOLD);
  else if (html.getAttribute("data-hub-hold") === HOLD) html.removeAttribute("data-hub-hold");
}
const draftPins = () => P.pins.filter((p) => p.state === "draft" && String(p.text || "").trim());
const draftChanges = () => P.changes.filter((c) => c.state === "draft");
const draftDrawings = () => P.drawings.filter((d) => d.state === "draft");
const draftNotes = () => P.notes.filter((n) => n.state === "draft" && String(n.text || "").trim());
const draftTweaks = () => P.tweaks.filter((t) => t.state === "draft" && tweakEffect(t));
const draftErrs = () => P.errs.filter((e) => e.state === "draft" && normErrors(e.items).length);
const drafts = () => draftCount(draftPins(), draftChanges(), draftDrawings(), draftNotes(), draftTweaks(), draftErrs());
const views = () => Object.fromEntries(P.frames.map((f) => [f.path, { w: f.w, h: f.h, grids: f.gridsOff ? [] : f.grids }]));
// выделенный элемент идёт в сообщение чата и вместе с пачкой; одно выделение без правок автоотправку не заводит
const selText = () => (P.sel && !home() ? selectedLine(P.sel) : "");
const batchText = (extra = {}) => withSel(message({ path: (P.frames[0] || {}).path || "", round: P.round, views: views(), comments: draftPins().filter((p) => p.text.trim()),
  changes: draftChanges(), drawings: draftDrawings(), notes: draftNotes(), tweaks: draftTweaks(), errors: draftErrs(), copies: Object.fromEntries(Object.entries(P.writers).filter(([, v]) => v && v.copy).map(([f, v]) => [f, v.copy])), ...extra }));
const withSel = (b) => (b && selText() ? b + "\n\n" + selText() : b);

// получателя не помним между открытиями: им управляет открытый макет (wanted); перенос из чата — поверх
function fromAddress() {
  applyHandoff();
  applyOpen();
}

// файл из карточки в ленте: открыть вид и поставить файл на холст (вид ещё не нарисован — ждёт render)
function openFile(path) {
  P.openPath = path;
  if (location.hash.startsWith("#/x/" + ID)) applyOpen(); else hub.go(ID);
  setTimeout(applyOpen, 0);
}
function applyOpen() {
  const path = P.openPath;
  if (!path || !ui) return;
  P.openPath = null;
  P.tab = "chat";
  addFrame(path, true, true);
}

async function ping() {
  const was = P.alive;
  if (!local()) { P.alive = false; P.note = "Hub Design работает только на этом компьютере: откройте хаб по localhost."; return paint(); }
  try {
    await fetch(origin() + "/__canvas/ping", { mode: "no-cors", cache: "no-store" });
    P.alive = true;
    P.note = "";
  } catch {
    P.alive = false;
    P.note = `Процесс плагина не отвечает на ${origin()}. Перезапустите плагин: hub restart ext:${ID}`;
  }
  paint();
  if (P.alive) verifyAll();
  if (P.alive && was === false) reloadAll();
}

// --- файлы макетов на месте ---------------------------------------------------------------------------------------
// процесс плагина говорит по каждому пути: ok | missing | denied. Спрашиваем по событиям: список макетов изменился, открыли дашборд или файл,
// перезагрузили рамку — не по таймеру. Пропавший файл — пометка на карточке и понятная строка в рамке, не сырой ответ сервера.
const abs = (p) => String(p).trim().replace(/^~(?=\/)/, homeGuess());
const fileState = (path) => P.have[abs(path)];
async function verify(paths, force = false) {
  if (P.alive !== true || !local()) return;
  const want = [...new Set(paths.map(abs).filter(Boolean))].filter((p) => force || !(p in P.have));
  let changed = false;
  for (let i = 0; i < want.length; i += 40) {
    const part = want.slice(i, i + 40);
    let r = null;
    try {
      const res = await fetch(origin() + "/__canvas/have?" + new URLSearchParams(part.map((p) => ["path", p])), { cache: "no-store" });
      r = res.ok ? await res.json() : null;
    } catch { /* процесс не отвечает — это покажет ping */ }
    if (!r) return;
    for (const p of part) if (r[p] && P.have[p] !== r[p]) { P.have[p] = r[p]; changed = true; }
  }
  if (changed) paint();
  loadTimes(want.filter((p) => P.have[p] === "ok"));
}
// когда правили файлы — для строки «изменён …» у макетов, которых нет в лентах сессий (открыты только на холсте)
async function loadTimes(paths) {
  let changed = false;
  for (let i = 0; i < paths.length; i += 40) {
    const part = paths.slice(i, i + 40);
    let r = null;
    try {
      const res = await fetch(origin() + "/__canvas/times?" + new URLSearchParams(part.map((p) => ["path", p])), { cache: "no-store" });
      r = res.ok ? await res.json() : null;
    } catch { return; }
    if (!r) return;
    for (const p of part) if (r[p] && P.times[p] !== r[p]) { P.times[p] = r[p]; changed = true; }
  }
  if (changed) paint();
}
const verifyAll = () => verify([...P.frames.map((f) => f.path), ...P.authors.map((a) => a.path)], true);
// вернулись во вкладку или к окну — файлы могли поменять мимо хаба
window.addEventListener("focus", () => { if (P.shown) verifyAll(); });
document.addEventListener("visibilitychange", () => { if (P.shown && !document.hidden) verifyAll(); });
function goHome() {
  P.home = true; P.preset = null; P.homeWho = null; P.tab = "chat";
  dropStub();
  verifyAll();
  for (const f of P.frames) ensureAuthor(f.path);
  paint();
}
// открыть макет на холсте: сначала убедиться, что файл есть — вместо пустой рамки владелец читает, чего не хватает
async function openChecked(path, focus = true, only = false) {
  await verify([path], true);
  const st = fileState(path);
  if (isGone(st)) {
    P.note = goneText(st, abs(path));
    return paint();
  }
  P.note = "";
  addFrame(path, focus, only);
}

// --- фреймы ------------------------------------------------------------------------------------------------------
const homeGuess = () => {
  const s = (hub.snapshot()?.sessions || []).find((x) => x.cwd && /^\/Users\/[^/]+|^\/home\/[^/]+/.test(x.cwd));
  return s ? s.cwd.match(/^\/(Users|home)\/[^/]+/)[0] : "~";
};
// only: макет открыт из дашборда, карточки или сессии — один файл, одна страница: чужие рамки с холста уходят (черновики остаются);
// «+» на холсте добавляет рядом
function addFrame(path, focus, only = false) {
  path = String(path).trim().replace(/^~(?=\/)/, homeGuess());
  if (!path) return;
  if (only) for (const o of P.frames.filter((q) => q.path !== path)) removeFrame(o.path, true);
  let f = P.frames.find((q) => q.path === path);
  if (!f) {
    const w = 1440;
    f = { path, ...nextSpot(P.frames, w), w, h: windowHeight(w), auto: true };
    P.frames.push(f);
    designSize(f, true);
  }
  P.opened[path] = P.opened[path] || Date.now() / 1000;
  P.focus = path;
  P.home = false;
  dropStub();
  P.preset = null;
  P.homeWho = null;
  save();
  paint();
  if (focus && ui) { if (P.frames.length === 1) ui.cv.fit(); else ui.cv.focusOn(path); }
}
// размер рамки задаёт сам макет (<meta name="hub-frame" content="1080x1350"> или явные width/height у html/body): рамка ровно такая,
// без переключателя ширин, PDF — одной страницей такого размера. Нет размера — окно по ширине, как раньше
async function designSize(f, fresh = false) {
  let r = null;
  try {
    const res = await fetch(origin() + "/__canvas/size?" + new URLSearchParams([["path", f.path]]), { cache: "no-store" });
    r = res.ok ? await res.json() : null;
  } catch { return; }
  if (!r || !P.frames.includes(f)) return;
  const s = r[f.path];
  if (!s) {
    if (!f.fixed) return;
    delete f.fixed;
    if (f.auto) f.h = windowHeight(f.w);
  } else {
    const w = s[0], h = s[1] || windowHeight(w);
    if (f.fixed && f.w === w && f.h === h) return;
    f.fixed = true;
    f.w = w; f.h = h;
    if (fresh) Object.assign(f, nextSpot(P.frames.filter((q) => q !== f), w));
  }
  save();
  paint();
  if (ui) { ui.cv.paint(); if (P.frames.length === 1 || P.cv.auto) ui.cv.fit(); else if (fresh) ui.cv.focusOn(f.path); }
}
function removeFrame(path, keepDrafts = false) {
  P.frames = P.frames.filter((f) => f.path !== path);
  if (!keepDrafts) {
    P.pins = P.pins.filter((p) => p.file !== path);
    P.changes = P.changes.filter((c) => c.file !== path);
    P.drawings = P.drawings.filter((d) => d.file !== path);
    P.tweaks = P.tweaks.filter((t) => t.file !== path);
    P.errs = P.errs.filter((e) => e.file !== path);
    flushWrite(path);   // черновики убраны — файл возвращается к виду до наших правок
  }
  specs.delete(path);
  liveErrs.delete(path);
  if (P.focus === path) P.focus = "";
  if (P.sel?.file === path) P.sel = null;
  renumber();
  save();
  paint();
}
function sizeFrame(path, w) {
  const f = P.frames.find((q) => q.path === path);
  if (!f || f.fixed) return;
  f.w = w;
  if (f.auto) f.h = windowHeight(w);
  save();
  paint();
  ui?.cv.reloadFrame(path);
}
function reloadAll() { if (ui) for (const f of P.frames) ui.cv.reloadFrame(f.path); }
// дизайнер поменял файл: прошлый раунд отработан — его пины гаснут, его сдвиги уже в коде; наша копия и записи больше не нужны
function fileChanged(file) {
  const w = writers.get(file);
  if (w) { w.maxStamp = 0; w.fails = 0; }
  delete P.writers[file];
  markUnwritten(P.changes, P.tweaks, file);
  const mine = (x) => x.file === file;
  for (const p of P.pins) if (mine(p) && p.state === "sent") p.state = "done";
  for (const d of P.drawings) if (mine(d) && d.state === "sent") d.state = "done";
  for (const c of P.changes) if (mine(c) && c.state === "sent") c.state = "done";
  P.tweaks = P.tweaks.filter((t) => !mine(t) || t.state !== "sent");   // значения по умолчанию теперь в самом файле
  P.errs = P.errs.filter((e) => !mine(e) || e.state !== "sent");
  P.pins = P.pins.filter((p) => !mine(p) || p.state !== "done" || p.round >= P.round - 3);
  P.drawings = P.drawings.filter((d) => !mine(d) || d.state !== "done");
  P.changes = P.changes.filter((c) => !mine(c) || c.state !== "done");
  if (P.sel && P.sel.file === file) P.sel = null;
  P.hist[file] = { undo: 0, redo: 0 };
  renumber();
  ui.cv.reloadFrame(file);
}

// --- запись правок руками в файл ---------------------------------------------------------------------------------
// Правки руками и крутилки — в сам файл (server.py /__canvas/write), точечно и от копии <имя>.r<N>.html: каждый раз весь набор заново
// от копии, поэтому откат правки возвращает файл. Автор макета в ходе — не пишем (его файл не трогаем), пункты уходят ему словами.
const writers = new Map();   // файл → {timer, inflight, again, deferred, maxStamp, fails}; copy и fmtime живут в P.writers (переживают перезагрузку)
const writerOf = (file) => {
  if (!writers.has(file)) writers.set(file, { timer: 0, inflight: null, again: false, deferred: [], maxStamp: 0, fails: 0 });
  return writers.get(file);
};
const authorBusy = (file) => {
  const name = authorOf(file);
  const s = ((hub.snapshot() || {}).sessions || []).find((x) => x.name === name);
  return !!s && s.state === "busy";
};
const tweakOps = (file) => (specs.get(file)?.list || [])
  .filter((t) => P.tweaks.some((x) => x.file === file && x.key === t.key && x.state !== "done" && !x.handed)).flatMap((t) => opsFor(file, t.key));
function scheduleWrite(file, ms = 500) {
  const w = writerOf(file);
  clearTimeout(w.timer);
  w.timer = setTimeout(() => flushWrite(file), ms);
}
function flushWrite(file) {
  const w = writerOf(file);
  clearTimeout(w.timer);
  w.timer = 0;
  if (w.inflight) { w.again = true; return w.inflight; }
  w.inflight = (async () => { do { w.again = false; await writeOnce(file, w); } while (w.again); })()
    .catch(() => {})
    .finally(() => {
      w.inflight = null;
      const late = w.deferred.filter((m) => m > w.maxStamp);   // чужая правка файла, пока шла наша запись
      w.deferred = [];
      if (late.length) { fileChanged(file); save(); paint(); }
    });
  return w.inflight;
}
async function writeOnce(file, w) {
  const items = writable(P.changes, file);
  const ops = tweakOps(file);
  const known = P.writers[file] || {};
  if (!items.length && !ops.length && !known.copy) return;   // писать нечего, и копии нет
  const busy = authorBusy(file);
  let res = null;
  try {
    const r = await fetch(origin() + "/__canvas/write", { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path: file, round: Math.max(1, P.round - 1), changes: items, ops, busy, copy: known.copy || "", fmtime: known.fmtime || 0 }) });
    res = { status: r.status, ...(await r.json().catch(() => ({}))) };
  } catch { res = { status: 0 }; }
  if (res.status === 200) {
    w.fails = 0;
    w.maxStamp = Math.max(w.maxStamp, res.stamp || 0);
    if (res.copy) P.writers[file] = { copy: res.copy, fmtime: res.fmtime }; else delete P.writers[file];
    // пометка «в файле» — только тем правкам, у которых значение с тех пор не менялось
    const sent = new Map(items.map((i) => [i.sel, JSON.stringify(i)]));
    const same = (sel) => { const c = P.changes.find((q) => q.file === file && q.sel === sel && q.state !== "done"); const n = c && writable([c], file)[0]; return !!n && JSON.stringify(n) === sent.get(sel); };
    markWritten(P.changes, P.tweaks, file, { ...res, done: (res.done || []).filter(same), ops: JSON.stringify(tweakOps(file)) === JSON.stringify(ops) ? res.ops : "skipped" });
  } else if (res.status === 409 && res.error === "changed") {
    fileChanged(file);   // файл правили без нас — это правка автора, начинаем с чистого
  } else if (res.status === 409 && res.error === "busy") {
    markUnwritten(P.changes, P.tweaks, file);   // автор в ходе: файл не трогаем, ждём конца хода
    if (P.frames.some((f) => f.path === file)) scheduleWrite(file, 5000);
  } else {
    markUnwritten(P.changes, P.tweaks, file);
    w.fails += 1;
    if (res.status === 404 || res.status === 413 || res.status === 403 || w.fails > 3) { P.note = "Правки в файл не записались — уйдут дизайнеру словами"; w.fails = 0; }
    else if (P.frames.some((f) => f.path === file)) scheduleWrite(file, 5000);   // автор в ходе или процесс перезапускается — пробуем позже
  }
  save();
  paint();
}

// --- связь с agent.js во фреймах ---------------------------------------------------------------------------------
const tellEp = (ep, msg) => { if (ep?.iframe.contentWindow) ep.iframe.contentWindow.postMessage({ canvas: 1, ...msg }, origin()); };
const epOf = (file) => eps.get("f:" + file);
const tellFile = (file, msg) => tellEp(epOf(file), msg);
const tellAll = (msg) => { for (const ep of eps.values()) tellEp(ep, msg); };

// цвета хаба для рамок и пинов внутри фрейма: фрейм живёт на другом адресе и переменных темы не видит
function theme() {
  const probe = (v) => {
    const n = document.createElement("span");
    n.style.cssText = `position:absolute;visibility:hidden;color:var(${v})`;
    (ui?.wrap || document.body).append(n);
    const c = getComputedStyle(n).color;
    n.remove();
    return c;
  };
  return { primary: probe("--hd-acc"), onPrimary: probe("--hd-on"), fg: probe("--foreground"), bg: probe("--background"),
    border: probe("--border"), muted: probe("--muted-foreground"), font: getComputedStyle(ui?.wrap || document.body).fontFamily };
}
function syncEp(ep, edit) {
  const path = ep.path;
  tellEp(ep, { t: "mode", mode: toolMode(P.tool), tool: P.tool, shape: P.shapes[P.tool] });
  tellEp(ep, { t: "pins", pins: P.pins.filter((p) => p.file === path).map(({ id, n, sel, fp, lost, x, y, fx, fy, text, state }) => ({ id, n, sel, fp, lost, x, y, fx, fy, text, state })),
    drawings: P.drawings.filter((d) => d.file === path).map(({ id, path: pts, kind, state, from, to, box }) => ({ id, path: pts, kind, state, from, to, box })), edit });
}
const syncAll = (edit) => { for (const ep of eps.values()) syncEp(ep, edit && edit.file === ep.path ? edit.id : undefined); };

function onFrame(e) {
  if (!ui || e.origin !== origin()) return;
  const ep = [...eps.values()].find((q) => q.iframe.contentWindow === e.source);
  const m = e.data;
  if (!ep || !m || m.canvas !== 1) return;
  handle(ep.path, m, ep);
}

function handle(file, m, ep = epOf(file)) {
  if (!ep) return;
  const frame = P.frames.find((f) => f.path === file);
  if (m.t === "ready") {
    ep.ready = true;
    if (frame) designSize(frame);
    if (frame && frame.auto && !frame.fixed && frame.h !== windowHeight(frame.w)) { frame.h = windowHeight(frame.w); ui.cv.paint(); if (P.cv.auto) ui.cv.fit(); }
    tellEp(ep, { t: "theme", theme: theme() });
    ui.cv.scaleTo(ep);
    syncEp(ep);
    const keep = P.changes.filter((c) => c.file === file && c.state !== "done");
    if (keep.length) tellEp(ep, { t: "apply", changes: keep });
    readTweaks(file, ep, m.tweaks);
    scheduleWrite(file);   // черновики с прошлого раза или после перезагрузки рамки — в файл
    liveErrs.delete(file);   // макет загрузился заново — свежий список пришлёт он сам
    ui.cv.paintErrs();
    return;
  }
  if (m.t === "errors") {
    liveErrs.set(file, normErrors(m.errors));
    ui.cv.paintErrs();
    return;
  }
  if (m.t === "wheel") return ui.cv.wheel(ep, m);
  if (m.t === "key") { if (ui.cv.key(m.k, m.down, m)) return; return; }
  if (m.t === "editor") return ui.cv.openEditor(ep, m);
  if (m.t === "pick") {
    P.seq += 1;
    const n = P.pins.filter((p) => p.state !== "done").reduce((a, p) => Math.max(a, p.n), 0) + 1;
    const pin = { id: "p" + P.seq, file, n, round: P.round, state: "draft", text: "",
      sel: m.sel, fp: m.fp || null, label: m.label, x: m.x, y: m.y, fx: m.fx, fy: m.fy, ex: m.ex, ey: m.ey, w: m.w, h: m.h };
    P.pins.push(pin);
    P.focus = file;
    syncAll({ file, id: pin.id });
  } else if (m.t === "pinfix") {
    // макет перечитан: пин нашёл свой элемент заново (другой селектор) или потерял его
    const p = P.pins.find((q) => q.id === m.id);
    if (!p || (!!p.lost === !!m.lost && p.sel === m.sel)) return;
    p.lost = !!m.lost;
    p.sel = m.sel;
    if (!m.lost) Object.assign(p, { fp: m.fp, label: m.label || p.label, ex: m.ex, ey: m.ey, w: m.w, h: m.h, x: m.x, y: m.y });
    save();
    paint();
    syncAll();
    return;
  } else if (m.t === "comment") {
    const p = P.pins.find((q) => q.id === m.id);
    if (p) p.text = m.text;
    P.focus = file;
    syncAll();
    if (m.send && p && String(p.text || "").trim()) { save(); paint(); sendOne(p); return; }
  } else if (m.t === "remove") {
    P.pins = P.pins.filter((q) => q.id !== m.id);
    renumber();
    syncAll();
  } else if (m.t === "draw") {
    P.seq += 1;
    P.drawings.push({ id: "d" + P.seq, file, round: P.round, state: "draft", text: "", ...m.drawing });
    syncAll();
  } else if (m.t === "change") {
    const c = { ...m.change, file, state: "draft" };
    const i = P.changes.findIndex((q) => q.file === file && q.sel === c.sel && q.state === "draft");
    if (!hasEffect(c)) { if (i >= 0) P.changes.splice(i, 1); }
    else if (i >= 0) P.changes[i] = c;
    else P.changes.push(c);
    P.lastEdit = file;
    scheduleWrite(file);
  } else if (m.t === "revert") {
    P.changes = P.changes.filter((q) => !(q.file === file && q.sel === m.sel && (q.state === "draft" || q.state === "sent" && q.inFile)));   // ушедшая правка, уже записанная в файл, — тоже: файл вернётся к копии
    scheduleWrite(file);
  } else if (m.t === "selected") {
    if (m.sel) {
      P.sel = { file, sel: m.sel, label: m.label, tag: m.tag, css: m.css || {}, flex: !!m.flex, grid: !!m.grid, kids: m.kids || 0, decl: m.decl || "" };
      P.focus = file;
      if (P.propsUser) P.propsOpen = true;
      for (const o of eps.values()) if (o !== ep) tellEp(o, { t: "deselect" });
    } else if (P.sel && P.sel.file === file) P.sel = null;
  } else if (m.t === "history") {
    P.hist[file] = { undo: m.undo, redo: m.redo };
  } else if (m.t === "changed") {
    const w = writers.get(file);
    if (w && m.mtime <= w.maxStamp) return;   // наша запись правок руками
    if (w && w.inflight) { w.deferred.push(m.mtime); return; }   // запись идёт: чья это правка, решит её ответ
    fileChanged(file);
  } else return;
  save();
  paint();
}

function renumber() {
  let n = 0;
  for (const p of P.pins) if (p.state !== "done") p.n = ++n;
}

// --- инструменты холста --------------------------------------------------------------------------------------------
function setTool(tool, shape) {
  if (shape && P.shapes[tool] !== undefined) P.shapes[tool] = shape;
  P.tool = tool;
  if (tool !== "select" && P.sel) { P.sel = null; tellAll({ t: "deselect" }); }
  ui?.cv.closeEditor();
  syncAll();
  paint();
}
function deselect() {
  if (!P.sel) return;
  P.sel = null;
  tellAll({ t: "deselect" });
  paint();
}
function undo(redo) {
  const file = P.lastEdit || P.focus;
  if (file) tellFile(file, { t: redo ? "redo" : "undo" });
}
function addNote(x, y) {
  P.seq += 1;
  const n = { id: "n" + P.seq, x: Math.round(x), y: Math.round(y), text: "", state: "draft" };
  P.notes.push(n);
  save();
  paint();
  ui.cv.focusNote(n.id);
}

// кого из нужных специалистов в хабе нет (по снимку: появился — пропадает сам); просили — «ждём»
const lackNow = () => lacking((ui?.snap || hub.snapshot() || {}).sessions || [], P.asked);
// «Поставить»: сообщение хабу от владельца — ставит только хаб или владелец; ждём, пока сессия появится в снимке
async function install(name) {
  if (P.asked[name] && Date.now() - P.asked[name] < ASK_TTL) return;
  P.asked[name] = Date.now();
  localStorage.setItem(STORE + "asked", JSON.stringify(P.asked));
  paint();
  const r = await hub.post("/api/send", { session: hubName((hub.snapshot() || {}).sessions), text: installText(name), action: true });
  if (r.error) {
    delete P.asked[name];
    localStorage.setItem(STORE + "asked", JSON.stringify(P.asked));
    P.note = "Не ушло: " + r.error;
    paint();
  }
}

// «Скачать PDF»: печатает процесс плагина своим Chrome (hub.json testchrome.path); Chrome не настроен — печатает сама страница
async function savePdf(path) {
  const f = P.frames.find((q) => q.path === path) || {};
  const size = `w=${Math.round(f.w || 1440)}&h=${Math.round(f.h || 900)}${f.fixed ? "&fixed=1" : ""}`;
  const base = fileUrl(origin(), path);
  let res = null;
  try { res = await fetch(`${base}?pdf=1&${size}`); } catch { res = null; }
  if (res && res.ok) {
    const url = URL.createObjectURL(await res.blob());
    const a = document.createElement("a");
    a.href = url;
    a.download = nameOf(path).replace(/\.html?$/i, "") + ".pdf";
    document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 30000);
    return true;
  }
  if (!res || res.status === 501) return printFrame(`${base}?print=1&auto=1&${size}`, f);
  let why = "";
  try { why = (await res.json()).error || ""; } catch { /* не JSON */ }
  P.note = "PDF не вышел: " + (why || res.status);
  paint();
  return false;
}
// запасной путь: печатная версия во фрейме нужного размера, печать запускает она сама (окно печати браузера — «Сохранить как PDF»)
function printFrame(url, f) {
  const fr = document.createElement("iframe");
  fr.src = url;
  fr.style.cssText = `position:fixed;left:-99999px;top:0;border:0;width:${Math.round(f.w || 1440)}px;height:${Math.round(f.h || 900)}px`;
  document.body.append(fr);
  setTimeout(() => fr.remove(), 90000);
  return true;
}

const recipient = (file) => recipientOf(file, { picked: P.picked, authors: P.authors, found: P.found, frames: P.frames });
const app = {
  get P() { return P; },
  get hub() { return hub; },
  errState, askFix, saveView: () => save(), save: () => { save(); paint(); }, tellEp, tellCanvas: tellAll,
  hello: (ep) => tellEp(ep, { t: "hello", props: PROP_LIST, external: true, theme: theme() }),
  register: (ep) => eps.set(ep.id, ep), unregister: (id) => eps.delete(id),
  fileUrl: (path, o = {}) => fileUrl(origin(), path) + "?" + new URLSearchParams({ ...(o.raw ? { raw: "1" } : {}), ...(o.dl ? { dl: "1" } : {}), ...(cardKind(path) === "video" && !o.dl ? { player: "1" } : {}), v: "1" }),
  pdf: (path) => savePdf(path),
  play: (path) => { if (path) window.open(fileUrl(origin(), path), "_blank", "noopener"); },
  focusFrame: (path) => { if (P.focus !== path) { P.focus = path; paint(); } },
  addFrame: openChecked, fileState, verify, goHome, removeFrame, sizeFrame, setTool, deselect, undo, addNote,
  removeNote: (id) => { P.notes = P.notes.filter((n) => n.id !== id); save(); paint(); },
  noteChanged: () => { hold(); paintCard(); paintComments(); },
  recent: () => recentHtml(P.items),
  handle, visible: () => P.shown, lacking: lackNow, install,
  recipient, recipients: () => [...P.ok].sort(), pickRecipient, ensureAuthor,
  // ✕ закрывает открытый макет (его комментарии и правки остаются черновиками) и ведёт на стартовый дашборд
  close() {
    const path = P.focus || (P.frames[0] && P.frames[0].path);
    if (path) removeFrame(path, true);
    goHome();
  },
  // «Exit Hub Design»: выйти из вида в чат специалиста, с которым шёл разговор
  exit() { location.hash = exitTarget(P.session, [...P.ok], P.back, ID); },
  toggleProps: () => { P.propsOpen = !P.propsOpen; P.propsUser = P.propsOpen; paint(); },
};

// убрать правку руками, крутилку или рисунок (× во вкладке «Комментарии»): вид в рамке возвращается, записанное в файл откатывается к копии
const dropEdit = {
  change: (c) => { tellFile(c.file, { t: "revert", sel: c.sel }); P.changes = P.changes.filter((q) => q !== c); scheduleWrite(c.file); },
  tweak: (t) => { P.tweaks = P.tweaks.filter((q) => q !== t); tellFile(t.file, { t: "tweaks", ops: opsFor(t.file, t.key) }); scheduleWrite(t.file); },
  drawing: (d) => { P.drawings = P.drawings.filter((q) => q !== d); syncAll(); },
};
const delBtn = (fn) => button("hd-cx", "×", "Убрать правку", () => { fn(); save(); paint(); });

// --- отправка пачки ----------------------------------------------------------------------------------------------
function markSent() {
  for (const p of draftPins()) p.state = "sent";
  for (const c of draftChanges()) c.state = "sent";
  for (const d of draftDrawings()) d.state = "sent";
  for (const t of draftTweaks()) t.state = "sent";
  for (const e of draftErrs()) e.state = "sent";
  P.errs = P.errs.filter((e) => e.state !== "draft");
  P.tweaks = P.tweaks.filter((t) => t.state !== "draft");
  for (const n of P.notes) if (n.state === "draft" && String(n.text || "").trim()) n.state = "sent";
  P.pins = P.pins.filter((p) => p.state !== "draft" || p.text.trim());   // пустые пины не нужны
  P.notes = P.notes.filter((n) => n.state !== "draft" || String(n.text || "").trim());
  P.round += 1;
  renumber();
  save();
  syncAll();
  paint();
}
// «Отправить» в окне комментария: уходит один комментарий (точка и элемент) тому, кто работает над макетом
async function sendOne(pin) {
  if (P.busy) return;
  const to = authorOf(pin.file);
  if (!to) { P.note = "Выберите, кому отправить комментарий"; return paint(); }
  const text = message({ path: pin.file, round: P.round, views: views(), comments: [pin], changes: [] });
  if (!text) return;
  P.busy = true;
  paint();
  const r = await hub.post("/api/send", { session: to, text });
  P.busy = false;
  if (r.error) { P.note = "Не ушло: " + r.error; return paint(); }
  P.note = "";
  pin.state = "sent";
  P.round += 1;
  P.pinned = null;
  renumber();
  save();
  syncAll();
  paint();
}
// правки руками, крутилки и рисунки уходят сами тому, кто выбран внизу («Кому уходят правки»), через AUTO_MS после последней правки;
// комментарии (пины, заметки) и ошибки макета — по своей кнопке или вместе с текстом из поля. Занят получатель — сообщение встаёт в его очередь
const autoItems = () => ({ changes: draftChanges().filter(hasEffect), tweaks: draftTweaks(), drawings: draftDrawings() });
const auto = createAuto({ fire: () => autoSend() });
async function autoSend() {
  if (P.busy) return auto.retry(1000);
  const sig = auto.sig();
  await Promise.all(P.frames.map((f) => flushWrite(f.path)));   // сперва в файл: пункты уйдут с пометкой «уже в файле»
  if (auto.sig() !== sig || home()) return;   // пока писали, владелец двинул ещё — отсчёт пошёл заново
  const a = autoItems();
  const text = batchText({ comments: [], notes: [], errors: [], ...a });
  if (!text || !P.session) return;
  P.busy = true;
  const r = await hub.post("/api/send", { session: P.session, text });
  P.busy = false;
  if (r.error) { auto.fail(); P.note = "Не ушло: " + r.error; return paint(); }
  P.note = "";
  for (const x of [...a.changes, ...a.tweaks, ...a.drawings]) { x.state = "sent"; if (x.inFile !== true) x.handed = true; }
  P.tweaks = P.tweaks.filter((t) => t.state !== "draft");
  P.round += 1;
  renumber();
  save();
  syncAll();
  paint();
}

// --- кому уходит разговор: специалист макета ---------------------------------------------------------------------
// получатель макета — кто писал файл: в живой ленте, затем в истории сессий (лента отдаёт только хвост), затем назвавший; нет никого —
// выбирает владелец (список в окне комментария), «дизайнера» молча не подставляем
const authorOf = (file) => recipient(file).session;
// стартовый экран: чат со специалистом выбранного вида (пресет) или выбранным вручную, иначе с дизайнером
const home = () => P.home || !P.frames.length;
function wanted() {
  if (home()) return P.homeWho || (P.preset && P.preset.to) || DEFAULT_SESSION;
  if (P.pinned && P.pinned.focus === P.focus) return P.session;   // выбрали вручную — держим, пока открыт тот же макет
  P.pinned = null;
  return whoGets(P.focus && authorOf(P.focus), P.session, P.ok, DEFAULT_SESSION);   // hub-dev и хаб сами не подставляются
}
// кто писал файл, когда в живой ленте записи нет: листаем историю сессий назад (/api/history), сначала назвавшие файл и дизайнер
const looked = new Map();   // путь → когда искали (раз в 10 мин)
async function ensureAuthor(file) {
  if (!file || recipient(file).how === "wrote" || recipient(file).how === "picked") return;
  if (Date.now() - (looked.get(file) || 0) < 600000) return;
  looked.set(file, Date.now());
  const { near, far } = searchOrder(file, P.authors, [...P.ok], DEFAULT_SESSION);
  const budget = { n: 24 };
  for (const [names, pages] of [[near, 6], [far, 2]]) {
    for (const name of names) {
      let before = 1e12;
      for (let i = 0; i < pages && budget.n-- > 0; i++) {
        let r = null;
        try { r = await (await fetch(`/api/history?${new URLSearchParams({ session: name, before: String(before), n: "500" })}`)).json(); } catch { return; }
        if (!r || !Array.isArray(r.items)) break;
        if (wroteAt(r.items, file)) {
          P.found[file] = name;
          save();
          if (ui) { ui.cv.refreshEditor(); paint(); }
          return;
        }
        if (!r.more || !r.items.length) break;
        before = r.items[0].seq;
      }
    }
  }
}
function pickRecipient(file, name) {
  if (!name) return;
  P.picked[file] = name;
  save();
  paint();
}
function setSession(name) {
  if (!name || name === P.session) return;
  P.session = name;
  P.items = [];
  P.rev = -1;
  if (ui) { ui.input.set({ to: name }); ui.last.chat = ""; ui.last.queue = ""; pullChat(hub.snapshot() || {}); }
}
// макеты по лентам сессий хаба: по событиям страницы. В снимке лент нет (страницу открытой сессии она берёт сама) — когда номер правки
// ленты сессии в снимке вырос, тянем у ядра только изменённые строки (since); хранится только то, что про HTML. Таймера нет
const tl = new Map();   // сессия → {rev, epoch, items}
let scanning = false;
function recompute() {
  const lines = Object.fromEntries([...tl].map(([k, v]) => [k, v.items]));
  P.authors = htmlAuthored(lines, (n) => !P.ok.has(n));
  openFromSession();
  openNewDesign();
  verify([...P.frames.map((f) => f.path), ...P.authors.map((a) => a.path)], true);   // лента изменилась — файл мог пропасть (rm, mv дизайнером)
}
async function scanDesigns(snap) {
  P.ok = new Set((snap.sessions || []).filter((x) => x.kind !== "hub" && x.role !== "executor").map((x) => x.name));
  if (scanning || !P.shown) return;
  const revs = snap.timeline_rev || {};
  const due = dueSessions([...P.ok], revs, snap.epoch, tl);
  if (!due.length) { if (ui.last.authors !== P.authors.length + "#" + P.ok.size) { ui.last.authors = P.authors.length + "#" + P.ok.size; recompute(); } return; }
  scanning = true;
  const queue = [...due];
  const worker = async () => {
    for (let n = queue.shift(); n; n = queue.shift()) {
      const cached = tl.get(n);
      try {
        const res = await fetch(`/api/timeline?${new URLSearchParams(timelineQuery(n, cached, snap.epoch))}`);
        if (res.ok) { tl.set(n, mergeTimeline(cached, await res.json(), revs[n] ?? 0)); continue; }
      } catch { /* ниже: не перечитываем, пока лента не изменится снова */ }
      tl.set(n, { items: [], ...cached, rev: revs[n] ?? 0, epoch: snap.epoch });   // сбой не должен гнать запросы по кругу
    }
  };
  await Promise.all([worker(), worker(), worker()]);
  for (const n of [...tl.keys()]) if (!P.ok.has(n)) tl.delete(n);
  scanning = false;
  recompute();
  paint();
}
// владелец написал, когда макетов не было: ждём файл, который дизайнер напишет после отправки, и открываем его
function openNewDesign() {
  const w = P.openNew;
  if (!w) return;
  if (Date.now() / 1000 - w.ts > 900) { P.openNew = null; return; }
  const f = P.authors.find((a) => a.session === w.session && a.wrote && a.ts >= w.ts - 1);
  if (!f) return;
  P.openNew = null;
  addFrame(f.path, true, true);
}

// --- лента разговора ---------------------------------------------------------------------------------------------
async function pullChat(snap) {
  const want = (snap.timeline_rev || {})[P.session] ?? 0;
  if (P.loading || (P.rev === want && P.epoch === snap.epoch)) return;
  P.loading = true;
  try {
    const sess = P.session;
    const res = await fetch(`/api/timeline?${new URLSearchParams({ session: sess, since: "0" })}`);
    if (res.ok && sess === P.session) {
      const r = await res.json();
      P.items = r.items || [];
      P.rev = want;
      P.epoch = snap.epoch;
    }
  } catch { /* следующий снимок повторит */ }
  P.loading = false;
  paint();
}

// --- вид ---------------------------------------------------------------------------------------------------------
const LOGO = PALETTE.replace('class="icon"', 'class="hd-logo-svg" width="20" height="20"');
const ICONS = { logo: LOGO, comment: CI.comment, edit: CI.pencil, draw: CI.free, file: CI.file, note: CI.note };
function icon(name, text) {
  const b = hub.el("span", "hd-ic");
  if (name === "gear" && hub.icon) b.append(hub.icon("settings")); else b.innerHTML = ICONS[name] || CI[name] || "";
  if (text) b.append(document.createTextNode(text));
  return b;
}
function button(cls, inner, title, onClick) {
  const b = hub.el("button", cls);
  b.type = "button";
  if (typeof inner === "string") b.textContent = inner; else b.append(...[].concat(inner));
  if (title) b.title = title;
  if (onClick) b.addEventListener("click", onClick);
  return b;
}

function build(root) {
  const el = hub.el;
  const wrap = el("div", "hd");

  // левая панель: заголовок, вкладки, разговор или комментарии, карточка ввода
  const left = el("div", "hd-left");
  const top = el("div", "hd-top");
  const logo = el("span", "hd-logo"); logo.innerHTML = ICONS.logo;
  const title = el("span", "hd-title", "Hub Design");
  const homeBtn = button("hd-home", [logo, title], "Стартовый экран: пресеты и прошлые файлы", goHome);
  top.append(homeBtn);
  const tabs = el("div", "hd-tabs");
  const tabChat = button("hd-tab", "Чат", null, () => { P.tab = "chat"; paint(); });
  const tabComments = button("hd-tab", "Комментарии", null, () => { P.tab = "comments"; paint(); });
  const tabPlus = button("hd-plus", [icon("file", "Добавить макет")], "Добавить HTML на холст", () => ui.cv.openAdd());
  tabs.append(tabChat, tabComments, tabPlus);
  const chat = el("div", "hd-chat");
  const list = el("div", "hd-comments");
  const card = el("div", "hd-card");
  const need = createNeed({ hub, install }, "chat");   // получателя в хабе нет — не молча в пустоту: та же плашка
  const chips = el("div", "hd-chips");
  const input = hub.input({
    to: P.session, key: ID, placeholder: "Опишите, что нужно изменить…",
    prefix: (text) => { if (home()) return NEW_DESIGN + text; const b = batchText() || selText(); return b ? b + "\n\n" + text : text; },
    onSent: () => {
      if (home()) P.openNew = { session: P.session, ts: Date.now() / 1000 };   // на стартовом экране написали — это задача на новый макет
      else if (drafts() > 0) markSent();
    },
  });
  const strip = el("div", "strip-host");
  strip.hidden = true;
  const foot = el("div", "hd-foot");
  const who = el("select", "hd-who");
  who.title = "Кому уходят правки";
  who.addEventListener("change", () => {
    if (home()) P.homeWho = who.value; else P.pinned = { focus: P.focus };
    setSession(who.value);
    paint();
  });
  const note = el("div", "hd-note");
  foot.append(icon("gear"), who);
  card.append(need.node, chips, strip, input.node, foot, note);
  left.append(top, tabs, chat, list, card);

  // правая часть: холст с плавающими тулбарами, панель стилей и список файлов, пока холст пуст
  const right = el("div", "hd-right");
  const cv = createCanvas(app);
  const props = el("div", "hd-props");
  const tw = el("div", "hd-tw"), pbody = el("div", "hd-pbody");
  props.append(tw, pbody);
  const dash = createDashboard({
    hub, alive: () => P.alive === true, fileUrl: (path) => app.fileUrl(abs(path), { raw: true }), files: () => dashboardFiles(P.authors, [...P.frames.map((f) => f.path), ...Object.keys(P.opened)], (hub.snapshot()?.sessions || []).map((x) => x.cwd), { who: (path) => recipient(path).session, time: (path) => P.times[abs(path)] || 0 }),
    fileState, mine: () => new Set(P.frames.map((f) => f.path)), open: (path) => openChecked(path, true, true), openPath: (path) => openChecked(path, true, true),
    preset: (p) => startPreset(p), lacking: lackNow, install,
  });
  const exitB = button("hd-exit", "Exit Hub Design", "Выйти из Hub Design в чат: " + P.session, () => app.exit());
  right.append(cv.node, props, dash.node, exitB);

  wrap.append(left, right);
  root.replaceChildren(wrap);
  return { root, wrap, right, exitB, title, tabChat, tabComments, chat, list, need, chips, strip, input, who, note, cv, props, tw, pbody, dash, last: {} };
}

function render(root, snap) {
  if (!ui || ui.root !== root) { ui = build(root); load(); fromAddress(); ping(); }
  ui.snap = snap;
  pullChat(snap);
  paint();
}

const baseName = (p) => p.split(/[\\/]/).pop();

function paint() {
  if (!ui) return;
  const snap = ui.snap || hub.snapshot() || {};
  scanDesigns(snap);
  setSession(wanted());
  if (P.focus && P.shown) ensureAuthor(P.focus);
  const sig = JSON.stringify(theme());
  if (ui.last.theme !== sig) { ui.last.theme = sig; tellAll({ t: "theme", theme: JSON.parse(sig) }); }
  ui.title.textContent = P.focus && !home() ? nameOf(P.focus) || "Hub Design" : "Hub Design";
  ui.tabChat.classList.toggle("on", P.tab === "chat");
  ui.tabComments.classList.toggle("on", P.tab === "comments");
  const live = P.pins.filter((p) => p.state !== "done" && String(p.text || "").trim()).length + P.changes.filter((c) => c.state !== "done" && hasEffect(c)).length +
    P.drawings.filter((d) => d.state !== "done").length + P.notes.filter((n) => String(n.text || "").trim()).length;
  ui.tabComments.textContent = live ? `Комментарии ${live}` : "Комментарии";
  ui.chat.hidden = P.tab !== "chat";
  ui.list.hidden = P.tab !== "comments";
  ui.note.textContent = P.note;
  ui.note.hidden = !P.note;
  ui.cv.paint();
  ui.need.paint(lackNow().filter((n) => n.name === P.session && !(home() && n.need === "required")));   // на стартовом экране обязательного показывает он сам
  ui.dash.node.hidden = !home();
  if (home()) ui.dash.paint();

  // кому: агенты и сессии хаба, дизайнер первым
  const names = (snap.sessions || []).filter((s) => s.kind !== "hub" && s.role !== "executor").map((s) => s.name);
  if (!names.includes(P.session)) names.unshift(P.session);
  names.sort((a, b) => (a === DEFAULT_SESSION ? -1 : b === DEFAULT_SESSION ? 1 : 0));
  const whoSig = names.join("|") + "#" + P.session;
  if (ui.last.who !== whoSig) {
    ui.last.who = whoSig;
    ui.who.replaceChildren(...names.map((n) => { const o = hub.el("option", null, n); o.value = n; return o; }));
    ui.who.value = P.session;
  }

  paintQueue(snap);
  paintProps();
  paintCard();
  paintComments();
  paintChat();
}

// заготовка пресета, которую владелец не тронул, не переезжает в чат макета и не липнет к новой задаче
function dropStub() {
  const ta = ui && ui.input.node.querySelector("textarea");
  if (ta && isStub(ta.value)) { ta.value = ""; ta.dispatchEvent(new Event("input", { bubbles: true })); }
}

// пресет на стартовом экране: чат уходит специалисту вида, в поле — заготовка «новый <вид>: …», курсор в поле
function startPreset(p) {
  P.preset = p;
  P.homeWho = null;
  P.tab = "chat";
  setSession(wanted());
  const ta = ui.input.node.querySelector("textarea");
  if (ta) {
    ta.value = stubText(ta.value, p.lead);
    ta.dispatchEvent(new Event("input", { bubbles: true }));
  }
  paint();
  ui.input.focus();
  if (ta) ta.setSelectionRange(ta.value.length, ta.value.length);
}

// очередь сообщений к получателю — как полоса над полем в чате хаба: «Отправить сейчас» (если занят) и «Убрать»; «Убрать» не сразу:
// 6 секунд строка «Убрано из очереди · Отменить», настоящая отмена уходит потом (так же в очереди самого хаба)
const cancels = createCancels({
  post: (url, body) => hub.post(url, body),
  isQueued: (id) => ((hub.snapshot() || {}).messages || {})[id]?.state === "queued",
  onChange: () => { if (ui) { ui.last.queue = ""; paintQueue(ui.snap || hub.snapshot() || {}); } },
});
function paintQueue(snap) {
  const s = (snap.sessions || []).find((x) => x.name === P.session) || {};
  const msgs = snap.messages || {};
  const queued = P.items.filter((it) => it.kind === "in" && (msgs[it.id] || {}).state === "queued");
  for (const [id, e] of cancels.rows) if ((e.done || e.failed) && !queued.some((it) => it.id === id)) cancels.rows.delete(id);   // ушло из очереди — строка не нужна
  const sig = P.session + "#" + cancels.sig() + "#" + queued.map((it) => it.id + (s.state === "busy" ? "b" + (msgs[it.id].injectable ? 1 : 0) : "") + (msgs[it.id].removable === false ? "x" : "")).join();
  if (ui.last.queue === sig) return;
  ui.last.queue = sig;
  ui.strip.hidden = !queued.length;
  if (!queued.length) return ui.strip.replaceChildren();
  const el = hub.el;
  const clip = (t, n) => { const x = String(t || "").replace(/\s+/g, " ").trim(); return x.length > n ? x.slice(0, n) + "…" : x; };
  const act = (label, cls, fn) => {
    const b = button("btn small " + cls, label, null, async () => { b.disabled = true; try { await fn(); } finally { b.disabled = false; } });
    return b;
  };
  const box = el("div", "strip");
  queued.slice(0, 3).forEach((it, i) => {
    const m = msgs[it.id] || {};
    const row = el("div", "strip-row");
    row.dataset.k = "queue";
    const gone = cancels.get(it.id);
    if (gone) {
      row.append(el("span", "k", gone.failed ? "Не убрано" : "Убрано из очереди"), el("span", "t", clip(it.text, 70)));
      if (gone.failed) row.append(act("Повторить", "quiet", () => cancels.send(it.id)));
      else if (!gone.done) row.append(act("Отменить", "quiet", () => cancels.undo(it.id)));
      box.append(row);
      return;
    }
    if (i === 0) row.append(el("span", "k", `В очереди · ${queued.length}`));
    row.append(el("span", "t", clip(it.text, 90)));
    if (s.state === "busy" && m.injectable) row.append(act("Отправить сейчас", "", () => hub.post("/api/inject", { session: P.session, id: it.id })));
    if (m.removable !== false) row.append(act("Убрать", "quiet", () => cancels.start(P.session, it)));
    box.append(row);
  });
  ui.strip.replaceChildren(box);
}

// панель стилей справа: цвет заливки и текста, остальные свойства выбранного элемента
function paintProps() {
  const open = P.propsOpen && P.frames.length > 0 && !home();
  ui.props.hidden = !open;
  ui.right.classList.toggle("props", open);
  ui.exitB.title = "Выйти из Hub Design в чат: " + P.session;
  paintTweaks(open);
  const sig = JSON.stringify([open, P.sel]);
  if (!open || ui.last.props === sig || ui.pbody.contains(document.activeElement) && ui.last.propsSel === (P.sel && P.sel.sel)) return;
  ui.last.props = sig;
  ui.last.propsSel = P.sel && P.sel.sel;
  const el = hub.el;
  const kids = [];
  if (!P.sel) kids.push(el("div", "hd-phint", "Выберите элемент на холсте, чтобы поменять цвет и стили."));
  else {
    kids.push(el("div", "hd-pel", `${P.sel.tag}  ${P.sel.label ? "«" + P.sel.label.slice(0, 40) + "»" : ""}`));
    const colors = el("div", "hd-psec");
    colors.append(el("h4", null, "Цвет"), colorRow("Заливка", "background-color"), colorRow("Текст", "color"));
    kids.push(colors);
    for (const g of PROPS) {
      if (g.flexOnly && !P.sel.flex) continue;
      if (g.gridOnly && !P.sel.grid) continue;
      const sec = el("div", "hd-psec");
      sec.append(el("h4", null, g.title));
      for (const row of g.rows) {
        const r = el("div", "hd-prow");
        for (const f of row) r.append(field(f));
        sec.append(r);
      }
      kids.push(sec);
    }
    if (!P.sel.flex && !P.sel.grid && P.sel.kids) {
      const sec = el("div", "hd-psec");
      sec.append(el("h4", null, "Раскладка"));
      const r = el("div", "hd-prow");
      r.append(button("btn small quiet", "Во flex", "display: flex — дети в ряд", () => wrapIn("flex")), button("btn small quiet", "В grid", "display: grid — две колонки", () => wrapIn("grid")));
      sec.append(r);
      kids.push(sec);
    }
  }
  ui.pbody.replaceChildren(...kids);
}
// --- крутилки макета ---------------------------------------------------------------------------------------------
// ошибки макета: живой список (agent.js шлёт его с загрузки и по мере появления) и то, что из него уже в пачке (P.errs)
const liveErrs = new Map();
const errsKey = (items) => normErrors(items).map((x) => x.text).join("\n");
function errState(file) {
  const items = liveErrs.get(file) || [];
  if (!items.length) return null;
  const mine = P.errs.find((e) => e.file === file && e.state !== "done" && errsKey(e.items) === errsKey(items));
  return { n: items.length, state: mine ? mine.state : "" };
}
function askFix(file) {
  const items = liveErrs.get(file) || [];
  if (!items.length) return;
  P.errs = P.errs.filter((e) => e.file !== file || e.state !== "draft");
  P.errs.push({ file, items, state: "draft" });
  save();
  paint();
}

// agent.js при загрузке макета присылает объявление #hub-tweaks и текущие значения; разбор — lib.normTweaks. Значения лежат в P.tweaks
// (черновик → отправлено) и после перезагрузки рамки применяются заново
function readTweaks(file, ep, decl) {
  const list = decl ? normTweaks(decl.spec) : [];
  if (!list.length) { specs.delete(file); P.tweaks = P.tweaks.filter((t) => t.file !== file); return paint(); }
  specs.set(file, { list, base: Object.fromEntries(list.map((t) => [t.key, tweakBase(t, (decl.cur || {})[t.key])])) });
  P.tweaks = P.tweaks.filter((t) => t.file !== file || list.some((x) => x.key === t.key));
  const ops = list.filter((t) => P.tweaks.some((x) => x.file === file && x.key === t.key && x.state !== "done")).flatMap((t) => opsFor(file, t.key));
  if (ops.length) tellEp(ep, { t: "tweaks", ops });
  if (!ep.tweaked) { ep.tweaked = true; if (P.propsUser) P.propsOpen = true; }
  paint();
}
const tweakNow = (file, t) => {
  const mine = P.tweaks.find((x) => x.file === file && x.key === t.key && x.state === "draft") || P.tweaks.find((x) => x.file === file && x.key === t.key && x.state === "sent");
  return mine ? mine.to : (specs.get(file).base || {})[t.key];
};
// что записать в макет, чтобы крутилка показывала своё текущее значение (после отката черновика — исходное)
function opsFor(file, key) {
  const t = (specs.get(file)?.list || []).find((x) => x.key === key);
  return t ? tweakApply(t, tweakNow(file, t)) : [];
}
function setTweak(file, t, raw) {
  const value = tweakValue(t, raw);
  if (value == null) return false;
  const sp = specs.get(file);
  let e = P.tweaks.find((x) => x.file === file && x.key === t.key && x.state === "draft");
  if (!e) {
    const sent = P.tweaks.find((x) => x.file === file && x.key === t.key && x.state === "sent");
    e = { file, key: t.key, label: t.label, editor: t.editor, unit: t.unit || "", from: sent ? sent.to : sp.base[t.key], to: value, state: "draft" };
    P.tweaks.push(e);
  }
  e.to = value;
  e.inFile = false;
  if (!tweakEffect(e)) P.tweaks = P.tweaks.filter((x) => x !== e);
  tellFile(file, { t: "tweaks", ops: tweakApply(t, value) });
  scheduleWrite(file);
  save();
  paint();
  return true;
}
// крутилки открытого макета — секциями вверху панели; пока в панели идёт ввод (ползунок), её не пересобираем
function tweakFile() {
  const has = (f) => f && (specs.get(f)?.list || []).length;
  return has(P.focus) ? P.focus : (P.frames.find((f) => has(f.path)) || {}).path || "";
}
function paintTweaks(open) {
  const file = open ? tweakFile() : "";
  const list = file ? specs.get(file).list : [];
  const skeleton = JSON.stringify([file, list.map((t) => t.key)]);
  const sig = JSON.stringify([skeleton, list.map((t) => tweakNow(file, t))]);
  if (ui.last.tw === sig) return;
  if (ui.tw.contains(document.activeElement) && ui.last.twShape === skeleton) { ui.last.tw = sig; return; }
  ui.last.tw = sig;
  ui.last.twShape = skeleton;
  ui.tw.hidden = !list.length;
  const el = hub.el;
  const kids = [];
  let sec = null, secName = null;
  for (const t of list) {
    const name = t.section || "Крутилки";
    if (name !== secName) { sec = el("div", "hd-psec"); sec.append(el("h4", null, name)); kids.push(sec); secName = name; }
    sec.append(tweakRow(file, t, tweakNow(file, t)));
  }
  ui.tw.replaceChildren(...kids);
}
function tweakRow(file, t, cur) {
  const el = hub.el;
  const row = el("div", "hd-tweak " + t.editor);
  const label = el("span", "hd-flabel", t.label);
  label.title = t.key;
  const set = (v) => setTweak(file, t, v);
  if (t.editor === "color") {
    const sw = el("div", "hd-swatches");
    for (const c of t.options) {
      const b = button("hd-swatch" + (c === cur ? " on" : ""), "", c, () => { if (set(c)) for (const x of sw.children) x.classList.toggle("on", x.title === c); });
      b.style.background = c;
      sw.append(b);
    }
    row.append(label, sw);
  } else if (t.editor === "enum") {
    if (t.options.length <= 3) {
      const seg = el("div", "hd-seg");
      for (const o of t.options) seg.append(button("hd-segb" + (o === cur ? " on" : ""), o, null, () => { if (set(o)) for (const x of seg.children) x.classList.toggle("on", x.textContent === o); }));
      row.append(label, seg);
    } else {
      const sel = el("select");
      for (const o of t.options) { const op = el("option", null, o); op.value = o; sel.append(op); }
      sel.value = cur;
      sel.addEventListener("change", () => set(sel.value));
      const f = el("div", "hd-field");
      f.append(sel);
      row.append(label, f);
    }
  } else if (t.editor === "boolean") {
    const box = el("input"); box.type = "checkbox"; box.checked = !!cur;
    box.addEventListener("change", () => set(box.checked));
    row.append(label, box);
  } else if (t.editor === "range" || t.editor === "int" || t.editor === "float") {
    const out = el("span", "hd-tout", `${cur}${t.unit || ""}`);
    const r = el("input"); r.type = "range"; Object.assign(r, { min: t.min, max: t.max, step: t.step, value: cur });
    r.addEventListener("input", () => { if (set(r.value)) out.textContent = `${r.value}${t.unit || ""}`; });
    row.append(label, r, out);
  } else {
    const f = el("label", "hd-field wide");
    const input = el("input"); input.value = cur;
    input.addEventListener("keydown", (e) => { e.stopPropagation(); if (e.key === "Enter") input.blur(); });
    input.addEventListener("change", () => set(input.value));
    f.append(input);
    row.append(label, f);
  }
  return row;
}
const setStyle = (prop, value) => { if (P.sel) tellFile(P.sel.file, { t: "style", prop, value }); };
// «Обернуть во flex / grid»: делает выбранный блок контейнером (display), его дети раскладываются; для grid сразу две колонки
const wrapIn = (kind) => { if (P.sel) tellFile(P.sel.file, { t: "style", set: kind === "grid" ? { display: "grid", "grid-template-columns": gridForm(2) } : { display: "flex" } }); };
function colorRow(label, prop) {
  const el = hub.el;
  const cur = String((P.sel.css || {})[prop] ?? "").toLowerCase();
  const row = el("div", "hd-crow");
  row.append(el("span", "hd-flabel", label));
  const sw = el("div", "hd-swatches");
  for (const c of SWATCHES) {
    const b = button("hd-swatch" + (cur === c ? " on" : ""), "", c, () => setStyle(prop, c));
    b.style.background = c;
    sw.append(b);
  }
  const pick = el("input", "hd-sw"); pick.type = "color";
  pick.title = "Свой цвет";
  pick.value = /^#[0-9a-f]{6}$/i.test(cur) ? cur : "#000000";
  pick.addEventListener("change", () => setStyle(prop, pick.value));
  row.append(sw, pick);
  return row;
}
function field(f) {
  const el = hub.el;
  const wrap = el("label", "hd-field" + (f.wide ? " wide" : ""));
  wrap.append(el("span", "hd-flabel", f.label));
  const cur = (P.sel.css || {})[f.p] ?? "";
  const apply = (v) => { const val = cssValue(f, v); if (val != null) setStyle(f.p, val); };
  let input;
  if (f.kind === "pick") {
    input = el("select");
    const vals = f.options.includes(cur) ? f.options : [cur, ...f.options];
    for (const v of vals) { const o = el("option", null, v || "—"); o.value = v; input.append(o); }
    input.value = cur;
    input.addEventListener("change", () => apply(input.value));
  } else if (f.kind === "color") {
    const sw = el("input", "hd-sw"); sw.type = "color";
    sw.value = /^#[0-9a-f]{6}$/i.test(cur) ? cur : "#000000";
    input = el("input"); input.value = cur;
    sw.addEventListener("input", () => { input.value = sw.value; apply(sw.value); });
    wrap.append(sw);
    input.addEventListener("change", () => apply(input.value));
  } else if (f.kind === "cols") {
    input = el("input");
    input.type = "number"; input.min = "1"; input.max = "24"; input.step = "1";
    input.value = String(gridCols(P.sel.decl, cur) || "");
    input.addEventListener("change", () => apply(input.value));
  } else {
    input = el("input");
    input.value = f.kind === "num" ? String(cur).replace(/px$/, "") : cur;
    input.addEventListener("change", () => apply(input.value));
  }
  input.addEventListener("keydown", (e) => { e.stopPropagation(); if (e.key === "Enter") input.blur(); });
  wrap.append(input);
  if (f.kind === "num" && !f.unitless) wrap.append(el("span", "hd-unit", "px"));
  return wrap;
}

// карточка ввода: чипы комментариев (пины, заметки, ошибки макета) и поле; правки руками над полем не показываем — они во вкладке «Комментарии»
function paintCard() {
  const n = drafts();
  auto.watch(autoSig(autoItems(), P.session, home()));
  const items = [
    ...draftPins().map((p) => ({ text: p.text, ic: "comment", del: () => { P.pins = P.pins.filter((q) => q !== p); renumber(); syncAll(); } })),
    ...P.notes.filter((d) => d.state === "draft" && String(d.text || "").trim()).map((d) => ({ text: "Заметка: " + d.text, ic: "note", del: () => { P.notes = P.notes.filter((q) => q !== d); } })),
    ...draftErrs().map((e) => ({ text: `Ошибки макета: ${normErrors(e.items).length}`, ic: "edit", del: () => { P.errs = P.errs.filter((q) => q !== e); } })),
  ];
  const sig = JSON.stringify([n, items.map((i) => i.text), P.busy]);
  if (ui.last.card === sig) return;
  ui.last.card = sig;
  const el = hub.el;
  ui.chips.hidden = !items.length;
  ui.chips.replaceChildren(...items.map((i) => {
    const chip = el("span", "hd-chip");
    chip.title = i.text;
    chip.append(icon(i.ic), el("span", "hd-ctext", i.text));
    chip.append(button("hd-cx", "×", "Убрать", () => { i.del(); save(); paint(); }));
    return chip;
  }));
}

function paintComments() {
  const pins = P.pins.filter((p) => p.state !== "done" && String(p.text || "").trim());
  const changes = P.changes.filter((c) => c.state !== "done" && hasEffect(c));
  const drawings = P.drawings.filter((d) => d.state !== "done");
  const notes = P.notes.filter((n) => String(n.text || "").trim());
  const tweaks = P.tweaks.filter((t) => t.state !== "done" && tweakEffect(t));
  const errs = P.errs.filter((e) => e.state !== "done" && normErrors(e.items).length);
  const sig = JSON.stringify([pins, changes, drawings, notes, tweaks, errs]);
  if (ui.last.comments === sig) return;
  ui.last.comments = sig;
  const el = hub.el;
  const rows = [];
  for (const p of pins) {
    const li = el("div", "hd-citem " + p.state);
    li.append(el("b", "hd-n", String(p.n)), el("span", "hd-ct", (p.lost ? "⚠ элемент не найден · " : "") + p.text));
    li.title = p.lost ? "Элемент не найден — макет перевёрстан, точка на прежнем месте" : p.sel;
    rows.push(li);
  }
  for (const c of changes) {
    const li = el("div", "hd-citem " + c.state);
    li.append(el("b", "hd-n edit", "✎"), el("span", "hd-ct", `${c.label || c.sel}: ${describeChange(c)}`));
    if (c.inFile) li.append(el("span", "hd-infile", "в файле"));
    li.append(delBtn(() => dropEdit.change(c)));
    li.title = c.noWrite ? `${c.sel} — в файл не записана: ${c.noWrite}` : c.sel;
    rows.push(li);
  }
  for (const d of drawings) {
    const li = el("div", "hd-citem " + d.state);
    li.append(el("b", "hd-n edit", "∿"), el("span", "hd-ct", describeDrawing(d)), delBtn(() => dropEdit.drawing(d)));
    rows.push(li);
  }
  for (const t of tweaks) {
    const li = el("div", "hd-citem " + t.state);
    li.append(el("b", "hd-n edit", "⚙"), el("span", "hd-ct", describeTweak(t)));
    if (t.inFile) li.append(el("span", "hd-infile", "в файле"));
    li.append(delBtn(() => dropEdit.tweak(t)));
    rows.push(li);
  }
  for (const e of errs) {
    const li = el("div", "hd-citem " + e.state);
    li.append(el("b", "hd-n edit", "⚠"), el("span", "hd-ct", `Ошибки макета: ${normErrors(e.items).length}`));
    li.title = normErrors(e.items).map((x) => x.text).join("\n");
    rows.push(li);
  }
  for (const n of notes) {
    const li = el("div", "hd-citem " + n.state);
    li.append(el("b", "hd-n edit", "▤"), el("span", "hd-ct", n.text));
    rows.push(li);
  }
  ui.list.replaceChildren(...(rows.length ? rows : [el("div", "hd-hint", "Комментариев пока нет. Выберите «Комментарий» на панели холста и нажмите на нужное место.")]));
}

function paintChat() {
  const lines = chatLines(P.items, 40, P.session);
  const sig = P.session + ":" + lines.map((l) => l.k + ":" + l.text.length + ":" + l.who + (l.image ? ":i" : "")).join(",");
  if (ui.last.chat === sig) return;
  ui.last.chat = sig;
  const stick = ui.chat.scrollHeight - ui.chat.scrollTop - ui.chat.clientHeight < 40;
  const el = hub.el;
  ui.chat.replaceChildren(...lines.map((l) => {
    const row = el("div", "hd-msg " + (l.mine ? "me" : "them") + (l.head ? "" : " cont"));
    if (l.who && l.head) row.append(el("div", "hd-who-name", l.who));
    const body = el("div", "hd-mbody");
    if (l.image) {   // присланная картинка — уменьшенная копия (?w=), целиком открывается по клику
      const a = el("a", "hd-pic");
      a.href = "/api/file?path=" + encodeURIComponent(l.image);
      a.target = "_blank";
      a.rel = "noopener";
      const img = el("img");
      img.src = a.href + "&w=480";
      img.loading = "lazy";
      img.alt = l.text || baseName(l.image);
      a.append(img);
      body.append(a);
    }
    const text = l.text.length > 1500 ? l.text.slice(0, 1500) + "…" : l.text;
    // пути к HTML — ссылки: добавить фрейм на холст
    let rest = text;
    for (const p of htmlPaths(text)) {
      const at = rest.indexOf(p);
      if (at < 0) continue;
      body.append(document.createTextNode(rest.slice(0, at)));
      body.append(button("hd-link", baseName(p), "Показать на холсте: " + p, () => openChecked(p)));
      rest = rest.slice(at + p.length);
    }
    body.append(document.createTextNode(rest));
    row.append(body);
    return row;
  }));
  if (!lines.length) ui.chat.append(el("div", "hd-hint", `С ${P.session} ещё не говорили.`));
  if (stick) ui.chat.scrollTop = ui.chat.scrollHeight;
}
