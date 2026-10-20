// Hub Design: холст с HTML-дизайнами и разговор с дизайнером слева. На холсте (canvas.js) фреймы-артборды: выбор — рамка и
// перетаскивание элементов внутри фрейма, стили и цвет — в панели, «Комментарий» — клик ставит пин с текстом, карандаш и
// фигуры — отметить место, заметка — стикер на холсте. Всё копится пачкой и уходит дизайнеру одним сообщением (кнопкой
// или вместе с вашим текстом); файл правит он сам. Поменял файл — фрейм перезагружается, пины прошлого раунда гаснут.
// Дизайн показывает процесс плагина (server.py) со своего адреса, пины и рамки рисует agent.js внутри каждого фрейма.
import { NEW_DESIGN, PROPS, SWATCHES, ago, canvasPort, chatLines, cssValue, describeChange, describeDrawing, draftCount, fileUrl, frameTitle,
  hasEffect, htmlAuthored, htmlPaths, message, nextSpot, recentHtml, recipientOf, searchOrder, toolMode, windowHeight, wroteAt } from "./lib.js";
import { createCanvas } from "./canvas.js";
import { CANVAS_ICONS as CI } from "./icons.js";

const ID = "hub-design";
const STORE = "hub-design:";
const OLD_STORE = "design-canvas:";   // ключи до 0.2.0 (плагин назывался design-canvas): подхватываем один раз
const DEFAULT_SESSION = "designer";
const HOLD = "Hub Design";
const PROP_LIST = [...new Set(PROPS.flatMap((g) => g.rows.flat().map((f) => f.p)))];

let hub = null;
let ui = null;        // узлы вида, живут между снимками
const eps = new Map();   // фрейм → {id, path, iframe, ready}: у каждого фрейма свой agent.js
const P = {
  session: DEFAULT_SESSION, tab: "chat", tool: "select", shapes: { pencil: "free", shape: "rect" }, propsOpen: false, propsUser: true,
  frames: [], focus: "", pins: [], changes: [], drawings: [], notes: [], round: 1, seq: 0, cv: { x: 56, y: 84, k: 1, auto: true },
  alive: null, items: [], rev: -1, epoch: null, busy: false, note: "", sel: null, hist: {}, lastEdit: "", shown: false, handoff: null,
  authors: [], ok: new Set(), picked: {}, found: {}, pinned: null, back: "", openFrom: null, sent: 0,
};

globalThis.__hubDesign = () => P;   // для проверки в песочнице: пачка и состояние вида

const origin = () => `${location.protocol}//${location.hostname}:${canvasPort(location.port)}`;
const local = () => ["localhost", "127.0.0.1"].includes(location.hostname);
const getKey = (k) => localStorage.getItem(STORE + k) ?? localStorage.getItem(OLD_STORE + k);

export default function register(h) {
  hub = h;
  hub.addStyle("style.css");
  addEventListener("message", onFrame);
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
  if (!P.frames.some((f) => f.path === mine.path)) addFrame(mine.path, true); else { P.focus = mine.path; ui.cv.focusOn(mine.path); }
}

// боковую панель хаба прячет отдельный плагин hide-sidebar; нет его — события никто не слушает
function sidebar(hide) {
  try { window.dispatchEvent(new CustomEvent("hub-sidebar", { detail: { hide, by: "hub-design" } })); } catch { /* старый браузер */ }
}

// --- хранение пачки: одна доска в браузере — перезагрузка страницы её не теряет -----------------------------------
function save() {
  localStorage.setItem(STORE + "board", JSON.stringify({ frames: P.frames, pins: P.pins, changes: P.changes, drawings: P.drawings, notes: P.notes,
    round: P.round, cv: P.cv, shapes: P.shapes, picked: P.picked, found: P.found }));
  hold();
}
function load() {
  let b = null;
  try { b = JSON.parse(getKey("board") || "null"); } catch { b = null; }
  if (!b) b = legacy();
  P.frames = (b.frames || []).filter((f) => f && f.path).map((f) => (f.auto ? { ...f, h: windowHeight(f.w) } : f));   // до 0.4.1 рамка тянулась по высоте документа
  P.picked = b.picked || {};
  P.found = b.found || {};
  P.pins = b.pins || [];
  P.changes = b.changes || [];
  P.drawings = b.drawings || [];
  P.notes = b.notes || [];
  P.round = b.round || 1;
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
const drafts = () => draftCount(draftPins(), draftChanges(), draftDrawings(), draftNotes());
const views = () => Object.fromEntries(P.frames.map((f) => [f.path, { w: f.w, h: f.h }]));
const batchText = (extra = {}) => message({ path: (P.frames[0] || {}).path || "", round: P.round, views: views(), comments: draftPins().filter((p) => p.text.trim()),
  changes: draftChanges(), drawings: draftDrawings(), notes: draftNotes(), ...extra });

// получателя не помним между открытиями: им управляет открытый макет (wanted); перенос из чата — поверх
function fromAddress() {
  applyHandoff();
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
  if (P.alive && was === false) reloadAll();
}

// --- фреймы ------------------------------------------------------------------------------------------------------
const homeGuess = () => {
  const s = (hub.snapshot()?.sessions || []).find((x) => x.cwd && /^\/Users\/[^/]+|^\/home\/[^/]+/.test(x.cwd));
  return s ? s.cwd.match(/^\/(Users|home)\/[^/]+/)[0] : "~";
};
function addFrame(path, focus) {
  path = String(path).trim().replace(/^~(?=\/)/, homeGuess());
  if (!path) return;
  let f = P.frames.find((q) => q.path === path);
  if (!f) {
    const w = 1440;
    f = { path, ...nextSpot(P.frames, w), w, h: windowHeight(w), auto: true };
    P.frames.push(f);
  }
  P.focus = path;
  save();
  paint();
  if (focus && ui) { if (P.frames.length === 1) ui.cv.fit(); else ui.cv.focusOn(path); }
}
function removeFrame(path) {
  P.frames = P.frames.filter((f) => f.path !== path);
  P.pins = P.pins.filter((p) => p.file !== path);
  P.changes = P.changes.filter((c) => c.file !== path);
  P.drawings = P.drawings.filter((d) => d.file !== path);
  if (P.focus === path) P.focus = "";
  if (P.sel?.file === path) P.sel = null;
  renumber();
  save();
  paint();
}
function sizeFrame(path, w) {
  const f = P.frames.find((q) => q.path === path);
  if (!f) return;
  f.w = w;
  if (f.auto) f.h = windowHeight(w);
  save();
  paint();
  ui?.cv.reloadFrame(path);
}
function reloadAll() { if (ui) for (const f of P.frames) ui.cv.reloadFrame(f.path); }
function clearDrafts() {
  P.pins = P.pins.filter((p) => p.state !== "draft");
  P.changes = P.changes.filter((c) => c.state !== "draft");
  P.drawings = P.drawings.filter((d) => d.state !== "draft");
  P.notes = P.notes.filter((n) => n.state !== "draft");
  P.sel = null;
  renumber();
  save();
  reloadAll();
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
  return { primary: probe("--primary"), onPrimary: probe("--primary-foreground"), fg: probe("--foreground"), bg: probe("--background"),
    border: probe("--border"), muted: probe("--muted-foreground"), font: getComputedStyle(ui?.wrap || document.body).fontFamily };
}
function syncEp(ep, edit) {
  const path = ep.path;
  tellEp(ep, { t: "mode", mode: toolMode(P.tool), tool: P.tool, shape: P.shapes[P.tool] });
  tellEp(ep, { t: "pins", pins: P.pins.filter((p) => p.file === path).map(({ id, n, sel, x, y, fx, fy, text, state }) => ({ id, n, sel, x, y, fx, fy, text, state })),
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
    if (frame && frame.auto && frame.h !== windowHeight(frame.w)) { frame.h = windowHeight(frame.w); ui.cv.paint(); if (P.cv.auto) ui.cv.fit(); }
    tellEp(ep, { t: "theme", theme: theme() });
    ui.cv.scaleTo(ep);
    syncEp(ep);
    const keep = P.changes.filter((c) => c.file === file && c.state !== "done");
    if (keep.length) tellEp(ep, { t: "apply", changes: keep });
    return;
  }
  if (m.t === "wheel") return ui.cv.wheel(ep, m);
  if (m.t === "key") { if (ui.cv.key(m.k, m.down, m)) return; return; }
  if (m.t === "editor") return ui.cv.openEditor(ep, m);
  if (m.t === "pick") {
    P.seq += 1;
    const n = P.pins.filter((p) => p.state !== "done").reduce((a, p) => Math.max(a, p.n), 0) + 1;
    const pin = { id: "p" + P.seq, file, n, round: P.round, state: "draft", text: "",
      sel: m.sel, label: m.label, x: m.x, y: m.y, fx: m.fx, fy: m.fy, ex: m.ex, ey: m.ey, w: m.w, h: m.h };
    P.pins.push(pin);
    P.focus = file;
    syncAll({ file, id: pin.id });
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
  } else if (m.t === "revert") {
    P.changes = P.changes.filter((q) => !(q.file === file && q.sel === m.sel && q.state === "draft"));
  } else if (m.t === "selected") {
    if (m.sel) {
      P.sel = { file, sel: m.sel, label: m.label, tag: m.tag, css: m.css || {}, flex: !!m.flex };
      P.focus = file;
      if (P.propsUser) P.propsOpen = true;
      for (const o of eps.values()) if (o !== ep) tellEp(o, { t: "deselect" });
    } else if (P.sel && P.sel.file === file) P.sel = null;
  } else if (m.t === "history") {
    P.hist[file] = { undo: m.undo, redo: m.redo };
  } else if (m.t === "changed") {
    // дизайнер поменял файл: прошлый раунд отработан — его пины гаснут, его сдвиги уже в коде
    const mine = (x) => x.file === file;
    for (const p of P.pins) if (mine(p) && p.state === "sent") p.state = "done";
    for (const d of P.drawings) if (mine(d) && d.state === "sent") d.state = "done";
    for (const c of P.changes) if (mine(c) && c.state === "sent") c.state = "done";
    P.pins = P.pins.filter((p) => !mine(p) || p.state !== "done" || p.round >= P.round - 3);
    P.drawings = P.drawings.filter((d) => !mine(d) || d.state !== "done");
    P.changes = P.changes.filter((c) => !mine(c) || c.state !== "done");
    if (P.sel && P.sel.file === file) P.sel = null;
    P.hist[file] = { undo: 0, redo: 0 };
    renumber();
    ui.cv.reloadFrame(file);
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

const recipient = (file) => recipientOf(file, { picked: P.picked, authors: P.authors, found: P.found, frames: P.frames });
const app = {
  get P() { return P; },
  get hub() { return hub; },
  saveView: () => save(), save: () => { save(); paint(); }, tellEp, tellCanvas: tellAll,
  hello: (ep) => tellEp(ep, { t: "hello", props: PROP_LIST, external: true, theme: theme() }),
  register: (ep) => eps.set(ep.id, ep), unregister: (id) => eps.delete(id),
  fileUrl: (path, o = {}) => fileUrl(origin(), path) + "?" + new URLSearchParams({ ...(o.raw ? { raw: "1" } : {}), ...(o.dl ? { dl: "1" } : {}), v: "1" }),
  play: (path) => { if (path) window.open(fileUrl(origin(), path), "_blank", "noopener"); },
  focusFrame: (path) => { if (P.focus !== path) { P.focus = path; paint(); } },
  addFrame, removeFrame, sizeFrame, setTool, deselect, undo, addNote,
  removeNote: (id) => { P.notes = P.notes.filter((n) => n.id !== id); save(); paint(); },
  noteChanged: () => { hold(); paintCard(); paintComments(); },
  recent: () => recentHtml(P.items),
  handle, visible: () => P.shown,
  recipient, recipients: () => [...P.ok].sort(), pickRecipient, ensureAuthor,
  close() { location.hash = P.back && !P.back.startsWith("#/x/" + ID) ? P.back : "#/"; },
  toggleProps: () => { P.propsOpen = !P.propsOpen; P.propsUser = P.propsOpen; paint(); },
};

// --- отправка пачки ----------------------------------------------------------------------------------------------
function markSent() {
  for (const p of draftPins()) p.state = "sent";
  for (const c of draftChanges()) c.state = "sent";
  for (const d of draftDrawings()) d.state = "sent";
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
async function sendBatch() {
  const text = batchText();
  if (!text || P.busy) return;
  P.busy = true;
  paint();
  const r = await hub.post("/api/send", { session: P.session, text });
  P.busy = false;
  if (r.error) { P.note = "Не ушло: " + r.error; return paint(); }
  P.note = "";
  markSent();
}

// --- кому уходит разговор: специалист макета ---------------------------------------------------------------------
// получатель макета — кто писал файл: в живой ленте, затем в истории сессий (лента отдаёт только хвост), затем назвавший; нет никого —
// выбирает владелец (список в окне комментария), «дизайнера» молча не подставляем
const authorOf = (file) => recipient(file).session;
function wanted() {
  if (P.pinned && P.pinned.focus === P.focus) return P.session;   // выбрали вручную — держим, пока открыт тот же макет
  P.pinned = null;
  return (P.focus && authorOf(P.focus)) || P.session;
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
// макеты по лентам сессий хаба. В снимке лент нет (страница берёт ленту открытой сессии сама) — тянем /api/timeline каждой
// сессии, но редко: лента изменилась (timeline_rev) и прошло ≥ 20 с, по три запроса разом; хранится только то, что про HTML
const tl = new Map();   // сессия → {rev, at, items}
let scanning = false;
const slim = (items) => (items || []).filter((it) => (it.kind === "tool" && /\.html?$/i.test((it.input || {}).file_path || (it.input || {}).path || ""))
  || (it.kind === "file" && /\.html?$/i.test(it.path || "")) || (it.kind === "out" && htmlPaths(it.text).length))
  .map((it) => ({ kind: it.kind, name: it.name, ts: it.ts, path: it.path, input: it.input && { file_path: (it.input.file_path || it.input.path) },
    text: it.kind === "out" ? htmlPaths(it.text).join(" ") : undefined }));
function recompute() {
  const lines = Object.fromEntries([...tl].map(([k, v]) => [k, v.items]));
  P.authors = htmlAuthored(lines, (n) => !P.ok.has(n));
  openFromSession();
  openNewDesign();
}
async function scanDesigns(snap) {
  P.ok = new Set((snap.sessions || []).filter((x) => x.kind !== "hub" && x.role !== "executor").map((x) => x.name));
  if (scanning || !P.shown) return;
  const revs = snap.timeline_rev || {};
  const gap = P.openNew ? 3000 : 20000;
  const due = [...P.ok].filter((n) => { const c = tl.get(n); return !c || (c.rev !== (revs[n] ?? 0) && Date.now() - c.at > gap); });
  if (!due.length) { if (ui.last.authors !== P.authors.length + "#" + P.ok.size) { ui.last.authors = P.authors.length + "#" + P.ok.size; recompute(); } return; }
  scanning = true;
  const queue = [...due];
  const worker = async () => {
    for (let n = queue.shift(); n; n = queue.shift()) {
      try {
        const res = await fetch(`/api/timeline?${new URLSearchParams({ session: n, since: "0" })}`);
        if (res.ok) tl.set(n, { rev: revs[n] ?? 0, at: Date.now(), items: slim((await res.json()).items) });
      } catch { /* следующий снимок повторит */ }
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
  addFrame(f.path, true);
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
  top.append(logo, title);
  const tabs = el("div", "hd-tabs");
  const tabChat = button("hd-tab", "Чат", null, () => { P.tab = "chat"; paint(); });
  const tabComments = button("hd-tab", "Комментарии", null, () => { P.tab = "comments"; paint(); });
  const tabPlus = button("hd-plus", "+", "Добавить HTML на холст", () => ui.cv.openAdd());
  tabs.append(tabChat, tabComments, tabPlus);
  const chat = el("div", "hd-chat");
  const list = el("div", "hd-comments");
  const card = el("div", "hd-card");
  const banner = el("div", "hd-banner");
  const chips = el("div", "hd-chips");
  const input = hub.input({
    to: P.session, key: ID, placeholder: "Опишите, что нужно изменить…",
    prefix: (text) => { const b = batchText(); return b ? b + "\n\n" + text : P.frames.length ? text : NEW_DESIGN + text; },
    onSent: () => {
      if (!P.frames.length) P.openNew = { session: P.session, ts: Date.now() / 1000 };   // нет макетов — это задача на новый
      if (drafts() > 0) markSent();
    },
  });
  const strip = el("div", "strip-host");
  strip.hidden = true;
  const foot = el("div", "hd-foot");
  const who = el("select", "hd-who");
  who.title = "Кому уходят правки";
  who.addEventListener("change", () => {
    P.pinned = { focus: P.focus };
    setSession(who.value);
    paint();
  });
  const note = el("div", "hd-note");
  foot.append(icon("gear"), who);
  card.append(banner, chips, strip, input.node, foot, note);
  left.append(top, tabs, chat, list, card);

  // правая часть: холст с плавающими тулбарами, панель стилей и список файлов, пока холст пуст
  const right = el("div", "hd-right");
  const cv = createCanvas(app);
  const props = el("div", "hd-props");
  const files = el("div", "hd-files");
  right.append(cv.node, props, files);

  wrap.append(left, right);
  root.replaceChildren(wrap);
  return { root, wrap, title, tabChat, tabComments, chat, list, banner, chips, strip, input, who, note, cv, props, files, last: {} };
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
  ui.title.textContent = P.focus ? frameTitle(P.focus).replace(/\.html?$/i, "") || "Hub Design" : "Hub Design";
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
  ui.files.hidden = P.frames.length > 0 || P.alive === false;

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

  paintFiles();
  paintQueue(snap);
  paintProps();
  paintCard();
  paintComments();
  paintChat();
}

// пустой холст: все макеты (HTML из сессий хаба) карточками на выбор; написали сразу — это новый макет
function paintFiles() {
  const list = P.authors.slice(0, 30);
  const sig = list.map((d) => d.path + d.session + d.last).join("|") + "#" + Math.floor(Date.now() / 60000);
  if (ui.last.files === sig) return;
  ui.last.files = sig;
  const el = hub.el;
  const pathIn = el("input", "hd-path");
  pathIn.placeholder = "Открыть по пути: /…/index.html";
  pathIn.value = ui.last.pathValue || "";
  pathIn.addEventListener("input", () => { ui.last.pathValue = pathIn.value; });
  pathIn.addEventListener("keydown", (e) => { e.stopPropagation(); if (e.key === "Enter") addFrame(pathIn.value, true); });
  const cards = list.map((d) => {
    const who = el("span", "hd-dwho", d.session);
    const c = button("hd-dcard", [el("span", "hd-dico", ""), el("span", "hd-dname", baseName(d.path).replace(/\.html?$/i, "")),
      el("span", "hd-ddir", d.path.split("/").slice(-3, -1).join("/")), el("span", "hd-dmeta", ""), ], d.path, () => addFrame(d.path, true));
    c.querySelector(".hd-dico").innerHTML = CI.file;
    c.querySelector(".hd-dmeta").append(who, el("span", "hd-dago", ago(d.last)));
    return c;
  });
  const box = el("div", "hd-fbox");
  box.append(el("h3", null, "Макеты"),
    el("div", "hd-fhint", cards.length ? "Выберите макет, чтобы открыть его на холсте. Или напишите слева, что нужно, — дизайнер сделает новый." : "Макетов пока нет. Напишите слева, что нужно, — дизайнер сделает новый."),
    pathIn);
  if (cards.length) { const grid = el("div", "hd-dgrid"); grid.append(...cards); box.insertBefore(grid, pathIn); }
  ui.files.replaceChildren(box);
}

// очередь сообщений к получателю — как полоса над полем в чате хаба: «Отправить сейчас» (если занят) и «Убрать»
function paintQueue(snap) {
  const s = (snap.sessions || []).find((x) => x.name === P.session) || {};
  const msgs = snap.messages || {};
  const queued = P.items.filter((it) => it.kind === "in" && (msgs[it.id] || {}).state === "queued");
  const sig = P.session + "#" + queued.map((it) => it.id + (s.state === "busy" ? "b" + (msgs[it.id].injectable ? 1 : 0) : "") + (msgs[it.id].removable === false ? "x" : "")).join();
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
    if (i === 0) row.append(el("span", "k", `В очереди · ${queued.length}`));
    row.append(el("span", "t", clip(it.text, 90)));
    if (s.state === "busy" && m.injectable) row.append(act("Отправить сейчас", "", () => hub.post("/api/inject", { session: P.session, id: it.id })));
    if (m.removable !== false) row.append(act("Убрать", "quiet", () => hub.post("/api/queue/cancel", { session: P.session, id: it.id })));
    box.append(row);
  });
  ui.strip.replaceChildren(box);
}

// панель стилей справа: цвет заливки и текста, остальные свойства выбранного элемента
function paintProps() {
  const open = P.propsOpen && P.frames.length > 0;
  ui.props.hidden = !open;
  const sig = JSON.stringify([open, P.sel]);
  if (!open || ui.last.props === sig || ui.props.contains(document.activeElement) && ui.last.propsSel === (P.sel && P.sel.sel)) return;
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
      const sec = el("div", "hd-psec");
      sec.append(el("h4", null, g.title));
      for (const row of g.rows) {
        const r = el("div", "hd-prow");
        for (const f of row) r.append(field(f));
        sec.append(r);
      }
      kids.push(sec);
    }
  }
  ui.props.replaceChildren(...kids);
}
const setStyle = (prop, value) => { if (P.sel) tellFile(P.sel.file, { t: "style", prop, value }); };
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

// карточка ввода: плашка «Отправьте правки», чипы пачки, поле
function paintCard() {
  const n = drafts();
  const items = [
    ...draftPins().map((p) => ({ text: p.text, ic: "comment", del: () => { P.pins = P.pins.filter((q) => q !== p); renumber(); syncAll(); } })),
    ...P.changes.filter((c) => c.state === "draft" && hasEffect(c)).map((c) => ({ text: `${c.label || c.sel}: ${describeChange(c)}`, ic: "edit", del: () => { tellFile(c.file, { t: "revert", sel: c.sel }); P.changes = P.changes.filter((q) => q !== c); } })),
    ...P.drawings.filter((d) => d.state === "draft").map((d) => ({ text: describeDrawing(d), ic: "draw", del: () => { P.drawings = P.drawings.filter((q) => q !== d); syncAll(); } })),
    ...P.notes.filter((d) => d.state === "draft" && String(d.text || "").trim()).map((d) => ({ text: "Заметка: " + d.text, ic: "note", del: () => { P.notes = P.notes.filter((q) => q !== d); } })),
  ];
  const sig = JSON.stringify([n, items.map((i) => i.text), P.busy]);
  if (ui.last.card === sig) return;
  ui.last.card = sig;
  const el = hub.el;
  ui.banner.hidden = !n;
  const go = button("hd-go", P.busy ? "Отправляю…" : "Отправить дизайнеру", null, sendBatch);
  go.disabled = P.busy;
  const drop = button("hd-drop", "Сбросить", "Убрать всё, что накопилось", clearDrafts);
  ui.banner.replaceChildren(el("span", null, "Отправьте правки, когда будете готовы"), drop, go);
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
  const sig = JSON.stringify([pins, changes, drawings, notes]);
  if (ui.last.comments === sig) return;
  ui.last.comments = sig;
  const el = hub.el;
  const rows = [];
  for (const p of pins) {
    const li = el("div", "hd-citem " + p.state);
    li.append(el("b", "hd-n", String(p.n)), el("span", "hd-ct", p.text));
    li.title = p.sel;
    rows.push(li);
  }
  for (const c of changes) {
    const li = el("div", "hd-citem " + c.state);
    li.append(el("b", "hd-n edit", "✎"), el("span", "hd-ct", `${c.label || c.sel}: ${describeChange(c)}`));
    li.title = c.sel;
    rows.push(li);
  }
  for (const d of drawings) {
    const li = el("div", "hd-citem " + d.state);
    li.append(el("b", "hd-n edit", "∿"), el("span", "hd-ct", describeDrawing(d)));
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
  const lines = chatLines(P.items, 40);
  const sig = P.session + ":" + lines.map((l) => l.k + ":" + l.text.length).join(",");
  if (ui.last.chat === sig) return;
  ui.last.chat = sig;
  const stick = ui.chat.scrollHeight - ui.chat.scrollTop - ui.chat.clientHeight < 40;
  const el = hub.el;
  ui.chat.replaceChildren(...lines.map((l) => {
    const me = l.kind === "in";
    const row = el("div", "hd-msg " + (me ? "me" : "them"));
    if (me) row.append(el("div", "hd-who-name", "Вы"));
    const body = el("div", "hd-mbody");
    const text = l.text.length > 1500 ? l.text.slice(0, 1500) + "…" : l.text;
    // пути к HTML — ссылки: добавить фрейм на холст
    let rest = text;
    for (const p of htmlPaths(text)) {
      const at = rest.indexOf(p);
      if (at < 0) continue;
      body.append(document.createTextNode(rest.slice(0, at)));
      body.append(button("hd-link", baseName(p), "Показать на холсте: " + p, () => addFrame(p, true)));
      rest = rest.slice(at + p.length);
    }
    body.append(document.createTextNode(rest));
    row.append(body);
    return row;
  }));
  if (!lines.length) ui.chat.append(el("div", "hd-hint", `С ${P.session} ещё не говорили.`));
  if (stick) ui.chat.scrollTop = ui.chat.scrollHeight;
}
