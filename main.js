// Hub Design: холст с HTML-дизайнами и разговор с дизайнером слева. На холсте (canvas.js) фреймы-артборды: выбор — рамка и
// перетаскивание элементов внутри фрейма, стили и цвет — в панели, «Комментарий» — клик ставит пин с текстом, карандаш и
// фигуры — отметить место, заметка — стикер на холсте. Всё копится пачкой и уходит дизайнеру одним сообщением (кнопкой
// или вместе с вашим текстом); файл правит он сам. Поменял файл — фрейм перезагружается, пины прошлого раунда гаснут.
// Дизайн показывает процесс плагина (server.py) со своего адреса, пины и рамки рисует agent.js внутри каждого фрейма.
import { PROPS, SWATCHES, canvasPort, chatLines, cssValue, describeChange, describeDrawing, draftCount, fileUrl, frameHeight, frameTitle,
  hasEffect, htmlPaths, message, nextSpot, recentHtml, toolMode } from "./lib.js";
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
};

globalThis.__hubDesign = () => P;   // для проверки в песочнице: пачка и состояние вида

const origin = () => `${location.protocol}//${location.hostname}:${canvasPort(location.port)}`;
const local = () => ["localhost", "127.0.0.1"].includes(location.hostname);
const getKey = (k) => localStorage.getItem(STORE + k) ?? localStorage.getItem(OLD_STORE + k);

export default function register(h) {
  hub = h;
  hub.addStyle("style.css");
  addEventListener("message", onFrame);
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

// перенос из чата сессии: сессия и набранное в поле уезжают в Hub Design (поле у сессии очищается — текст не пропадёт, он в поле у дизайнера)
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
  if (h.session !== P.session) { P.session = h.session; P.items = []; P.rev = -1; ui.input.set({ to: P.session }); }
  P.tab = "chat";
  P.autoOpen = true;   // откроем последний HTML этой сессии на холсте, как только придёт её лента (если его там ещё нет)
  const ta = ui.input.node.querySelector("textarea");
  if (ta && h.text) {
    ta.value = ta.value ? ta.value + "\n" + h.text : h.text;
    ta.dispatchEvent(new Event("input", { bubbles: true }));
  }
  save();
  pullChat(hub.snapshot() || {});
  paint();
  ui.input.focus();
}

// боковую панель хаба прячет отдельный плагин hide-sidebar; нет его — события никто не слушает
function sidebar(hide) {
  try { window.dispatchEvent(new CustomEvent("hub-sidebar", { detail: { hide, by: "hub-design" } })); } catch { /* старый браузер */ }
}

// --- хранение пачки: одна доска в браузере — перезагрузка страницы её не теряет -----------------------------------
function save() {
  localStorage.setItem(STORE + "board", JSON.stringify({ frames: P.frames, pins: P.pins, changes: P.changes, drawings: P.drawings, notes: P.notes,
    round: P.round, cv: P.cv, shapes: P.shapes }));
  localStorage.setItem(STORE + "last", JSON.stringify({ session: P.session }));
  hold();
}
function load() {
  let b = null;
  try { b = JSON.parse(getKey("board") || "null"); } catch { b = null; }
  if (!b) b = legacy();
  P.frames = (b.frames || []).filter((f) => f && f.path);
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
const draftPins = () => P.pins.filter((p) => p.state === "draft");
const draftChanges = () => P.changes.filter((c) => c.state === "draft");
const draftDrawings = () => P.drawings.filter((d) => d.state === "draft");
const draftNotes = () => P.notes.filter((n) => n.state === "draft" && String(n.text || "").trim());
const drafts = () => draftCount(draftPins(), draftChanges(), draftDrawings(), draftNotes());
const views = () => Object.fromEntries(P.frames.map((f) => [f.path, { w: f.w, h: f.h }]));
const batchText = (extra = {}) => message({ path: (P.frames[0] || {}).path || "", round: P.round, views: views(), comments: draftPins().filter((p) => p.text.trim()),
  changes: draftChanges(), drawings: draftDrawings(), notes: draftNotes(), ...extra });

// последняя сессия в этом браузере; перенос из чата — поверх
function fromAddress() {
  let last = {};
  try { last = JSON.parse(getKey("last") || "{}"); } catch { last = {}; }
  if (!P.handoff && last.session && last.session !== P.session) { P.session = last.session; P.items = []; P.rev = -1; ui?.input.set({ to: P.session }); }
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
    f = { path, ...nextSpot(P.frames, w), w, h: 900, auto: true };
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
    if (frame && frame.auto && m.dh) { frame.h = frameHeight(m.dh); ui.cv.paint(); if (P.cv.auto) ui.cv.fit(); }
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
    syncAll();
    if (m.send) { save(); paint(); sendBatch(); return; }
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

// --- лента разговора ---------------------------------------------------------------------------------------------
async function pullChat(snap) {
  const want = (snap.timeline_rev || {})[P.session] ?? 0;
  if (P.loading || (P.rev === want && P.epoch === snap.epoch)) return;
  P.loading = true;
  try {
    const res = await fetch(`/api/timeline?${new URLSearchParams({ session: P.session, since: "0" })}`);
    if (res.ok) {
      const r = await res.json();
      P.items = r.items || [];
      P.rev = want;
      P.epoch = snap.epoch;
    }
  } catch { /* следующий снимок повторит */ }
  P.loading = false;
  if (P.autoOpen && P.items.length) {
    P.autoOpen = false;
    const last = recentHtml(P.items, 1)[0];
    if (last && !P.frames.some((f) => f.path === last)) { addFrame(last, true); return; }
  }
  paint();
}

// --- вид ---------------------------------------------------------------------------------------------------------
const ICONS = {
  logo: '<svg viewBox="0 0 20 20" width="18" height="18"><path d="M10 2.5a7.5 7.5 0 1 0 0 15c1 0 1.6-.6 1.6-1.4 0-.5-.3-.9-.3-1.4 0-.8.6-1.3 1.4-1.3h1.6a3 3 0 0 0 3-3C17 5.5 14 2.5 10 2.5Z" fill="none" stroke="currentColor" stroke-width="1.4"/><circle cx="6.5" cy="9" r="1" fill="currentColor"/><circle cx="9.5" cy="6" r="1" fill="currentColor"/><circle cx="13" cy="7" r="1" fill="currentColor"/></svg>',
  comment: '<svg viewBox="0 0 16 16" width="13" height="13"><path d="M8 2.500c-3 0-5.500 2-5.500 4.700 0 1.200.5 2.200 1.300 3L3 13l2.800-1c.7.2 1.400.3 2.200.3 3 0 5.500-2 5.500-4.600S11 2.500 8 2.500Z" fill="none" stroke="currentColor" stroke-width="1.200" stroke-linejoin="round"/></svg>',
  edit: '<svg viewBox="0 0 16 16" width="13" height="13"><path d="M3 13h2l7-7a1.400 1.400 0 0 0-2-2L3 11v2ZM9 5l2 2" fill="none" stroke="currentColor" stroke-width="1.200" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  draw: '<svg viewBox="0 0 16 16" width="13" height="13"><path d="M3 13c3-.5 3-4 5.500-4.500 2-.4 2 1.800 4 1M10.500 3.500l2 2L7 11l-2.500.5L5 9l5.500-5.500Z" fill="none" stroke="currentColor" stroke-width="1.200" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  gear: '<svg viewBox="0 0 16 16" width="13" height="13"><circle cx="8" cy="8" r="2" fill="none" stroke="currentColor" stroke-width="1.200"/><path d="M8 1.800v1.600M8 12.600v1.600M1.800 8h1.600M12.600 8h1.600M3.600 3.600l1.100 1.100M11.300 11.300l1.100 1.100M12.400 3.600l-1.100 1.100M4.700 11.300l-1.100 1.100" stroke="currentColor" stroke-width="1.200" stroke-linecap="round"/></svg>',
  file: '<svg viewBox="0 0 16 16" width="12" height="12"><path d="M4 2.500h5l3 3v8H4v-11Z" fill="none" stroke="currentColor" stroke-width="1.200" stroke-linejoin="round"/></svg>',
};
function icon(name, text) {
  const b = hub.el("span", "hd-ic");
  b.innerHTML = ICONS[name] || CI[name];
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
    prefix: (text) => { const b = batchText(); return b ? b + "\n\n" + text : text; },
    onSent: () => { if (drafts() > 0) markSent(); },
  });
  const foot = el("div", "hd-foot");
  const who = el("select", "hd-who");
  who.title = "Кому уходят правки";
  who.addEventListener("change", () => {
    P.session = who.value; P.items = []; P.rev = -1; input.set({ to: P.session }); save(); pullChat(hub.snapshot()); paint();
  });
  const note = el("div", "hd-note");
  foot.append(icon("gear"), who);
  card.append(banner, chips, input.node, foot, note);
  left.append(top, tabs, chat, list, card);

  // правая часть: холст с плавающими тулбарами, панель стилей и список файлов, пока холст пуст
  const right = el("div", "hd-right");
  const cv = createCanvas(app);
  const props = el("div", "hd-props");
  const files = el("div", "hd-files");
  right.append(cv.node, props, files);

  wrap.append(left, right);
  root.replaceChildren(wrap);
  return { root, wrap, title, tabChat, tabComments, chat, list, banner, chips, input, who, note, cv, props, files, last: {} };
}

function render(root, snap) {
  if (!ui || ui.root !== root) { ui = build(root); load(); fromAddress(); ping(); P.autoOpen = !P.frames.length; }
  ui.snap = snap;
  pullChat(snap);
  paint();
}

const baseName = (p) => p.split(/[\\/]/).pop();

function paint() {
  if (!ui) return;
  const snap = ui.snap || hub.snapshot() || {};
  const sig = JSON.stringify(theme());
  if (ui.last.theme !== sig) { ui.last.theme = sig; tellAll({ t: "theme", theme: JSON.parse(sig) }); }
  ui.title.textContent = P.focus ? frameTitle(P.focus).replace(/\.html?$/i, "") || "Hub Design" : "Hub Design";
  ui.tabChat.classList.toggle("on", P.tab === "chat");
  ui.tabComments.classList.toggle("on", P.tab === "comments");
  const live = P.pins.filter((p) => p.state !== "done").length + P.changes.filter((c) => c.state !== "done" && hasEffect(c)).length +
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
  paintProps();
  paintCard();
  paintComments();
  paintChat();
}

function paintFiles() {
  const recent = recentHtml(P.items);
  const sig = recent.join("|") + "#" + P.session;
  if (ui.last.files === sig) return;
  ui.last.files = sig;
  const el = hub.el;
  const pathIn = el("input", "hd-path");
  pathIn.placeholder = "Путь к HTML: /…/index.html";
  pathIn.value = ui.last.pathValue || "";
  pathIn.addEventListener("input", () => { ui.last.pathValue = pathIn.value; });
  pathIn.addEventListener("keydown", (e) => { e.stopPropagation(); if (e.key === "Enter") addFrame(pathIn.value, true); });
  const rows = recent.map((p) => button("hd-frow", [icon("file"), el("span", "hd-fname", baseName(p)), el("span", "hd-fdir", p.split("/").slice(-3, -1).join("/"))], p, () => addFrame(p, true)));
  const box = el("div", "hd-fbox");
  box.append(el("h3", null, "Холст пуст"), pathIn,
    ...(rows.length ? [el("div", "hd-fhint", `Последние HTML сессии ${P.session}`), ...rows] : [el("div", "hd-fhint", `У ${P.session} пока нет HTML. Укажите путь выше или откройте ссылку из разговора.`)]));
  ui.files.replaceChildren(box);
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
    ...P.pins.filter((p) => p.state === "draft").map((p) => ({ text: p.text || "…без текста", ic: "comment", del: () => { P.pins = P.pins.filter((q) => q !== p); renumber(); syncAll(); } })),
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
  const pins = P.pins.filter((p) => p.state !== "done");
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
    li.append(el("b", "hd-n", String(p.n)), el("span", "hd-ct", p.text || "…без текста"));
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
