// Hub Design: HTML дизайна вживую справа, разговор с дизайнером слева. «Комментарий» —
// клик по месту ставит пин с текстом, «Правка» — тянуть элемент, менять размер за угол, текст двойным кликом и стили в
// панели справа, «Рисунок» — отметить место от руки. Всё копится пачкой и уходит дизайнеру одним сообщением (кнопкой или
// вместе с вашим текстом); файл правит он сам. Поменял файл — предпросмотр перезагружается, пины прошлого раунда гаснут.
// Дизайн показывает процесс плагина (server.py) со своего адреса, пины рисует agent.js в нём.
import { PROPS, SIZES, ZOOMS, canvasPort, chatLines, cssValue, describeChange, describeDrawing, draftCount, fileUrl, hasEffect, htmlPaths, message, recentHtml } from "./lib.js";

const ID = "hub-design";
const STORE = "hub-design:";
const OLD_STORE = "design-canvas:";   // ключи до 0.2.0 (плагин назывался design-canvas): подхватываем один раз
const DEFAULT_SESSION = "designer";
const HOLD = "Hub Design";
const PROP_LIST = [...new Set(PROPS.flatMap((g) => g.rows.flat().map((f) => f.p)))];

let hub = null;
let ui = null;        // узлы вида, живут между снимками
const P = {
  path: "", session: DEFAULT_SESSION, mode: "view", size: "fit", zoom: 0, tab: "chat", rtab: "file", tweaks: false, menu: "",
  pins: [], changes: [], drawings: [], round: 1, ready: false, view: { w: 0, h: 0 }, seq: 0,
  alive: null, items: [], rev: -1, epoch: null, busy: false, note: "",
  sel: null, undo: 0, redo: 0,
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
    id: ID, title: "Hub Design", subtitle: "пины и правки дизайнеру", icon: "icon.svg", full: true,
    render, show() { fromAddress(); ping(); }, hide() {},
  });
}

// --- хранение пачки: по файлу, в браузере — перезагрузка страницы её не теряет ---------------------------------
function save() {
  if (!P.path) return;
  localStorage.setItem(STORE + P.path, JSON.stringify({ pins: P.pins, changes: P.changes, drawings: P.drawings, round: P.round }));
  localStorage.setItem(STORE + "last", JSON.stringify({ path: P.path, session: P.session }));
  hold();
}
function load(path) {
  let d = {};
  try { d = JSON.parse(getKey(path) || "{}"); } catch { d = {}; }
  P.pins = d.pins || [];
  P.changes = d.changes || [];
  P.drawings = d.drawings || [];
  P.round = d.round || 1;
  P.seq = [...P.pins, ...P.drawings].reduce((m, p) => Math.max(m, Number(String(p.id).slice(1)) || 0), 0);
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
const drafts = () => draftCount(draftPins(), draftChanges(), draftDrawings());
const batchText = (extra = {}) => message({ path: P.path, round: P.round, view: P.view, comments: draftPins().filter((p) => p.text.trim()),
  changes: draftChanges(), drawings: draftDrawings(), ...extra });

// открыть прошлый файл и сессию (последние в этом браузере)
function fromAddress() {
  let last = {};
  try { last = JSON.parse(getKey("last") || "{}"); } catch { last = {}; }
  if (last.session && last.session !== P.session) { P.session = last.session; P.items = []; P.rev = -1; ui?.input.set({ to: P.session }); }
  if (!P.path && last.path) open(last.path);
}

async function ping() {
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
  if (P.alive && P.path && ui && !ui.frame.src) reload();
}

// --- файл ------------------------------------------------------------------------------------------------------
function open(path) {
  path = String(path).trim().replace(/^~(?=\/)/, homeGuess());
  if (!path) return;
  P.path = path;
  P.rtab = "file";
  P.sel = null;
  load(path);
  save();
  reload();
  paint();
}
function homeGuess() {
  const s = (hub.snapshot()?.sessions || []).find((x) => x.cwd && /^\/Users\/[^/]+|^\/home\/[^/]+/.test(x.cwd));
  return s ? s.cwd.match(/^\/(Users|home)\/[^/]+/)[0] : "~";
}
function reload() {
  if (!ui || !P.path || P.alive === false) return;
  P.ready = false;
  ui.frame.src = fileUrl(origin(), P.path) + "?t=" + Date.now();
}
function closeFile() {
  P.path = ""; P.rtab = "files"; P.sel = null; P.mode = "view";
  if (ui) ui.frame.removeAttribute("src");
  hold();
  paint();
}

// --- связь с agent.js в предпросмотре ----------------------------------------------------------------------------
const tell = (msg) => { if (ui?.frame.contentWindow) ui.frame.contentWindow.postMessage({ canvas: 1, ...msg }, origin()); };
function syncFrame(edit) {
  tell({ t: "mode", mode: P.mode });
  tell({ t: "pins", pins: P.pins.map(({ id, n, sel, x, y, fx, fy, text, state }) => ({ id, n, sel, x, y, fx, fy, text, state })),
    drawings: P.drawings.map(({ id, path, state }) => ({ id, path, state })), edit });
}
function setMode(mode) {
  P.mode = P.mode === mode ? "view" : mode;
  if (P.mode !== "edit") P.sel = null;
  syncFrame();
  paint();
}

function onFrame(e) {
  if (!ui || e.source !== ui.frame.contentWindow || e.origin !== origin()) return;
  const m = e.data;
  if (!m || m.canvas !== 1) return;
  if (m.t === "ready") {
    P.ready = true;
    P.view = { w: m.w, h: m.h };
    syncFrame();
    const keep = P.changes.filter((c) => c.state !== "done");
    if (keep.length) tell({ t: "apply", changes: keep });
  } else if (m.t === "pick") {
    P.seq += 1;
    const n = P.pins.filter((p) => p.state !== "done").reduce((a, p) => Math.max(a, p.n), 0) + 1;
    const pin = { id: "p" + P.seq, n, round: P.round, state: "draft", text: "",
      sel: m.sel, label: m.label, x: m.x, y: m.y, fx: m.fx, fy: m.fy, ex: m.ex, ey: m.ey, w: m.w, h: m.h };
    P.pins.push(pin);
    syncFrame(pin.id);
  } else if (m.t === "comment") {
    const p = P.pins.find((q) => q.id === m.id);
    if (p) p.text = m.text;
    syncFrame();
    if (m.send) { save(); paint(); sendBatch(); return; }
  } else if (m.t === "remove") {
    P.pins = P.pins.filter((q) => q.id !== m.id);
    renumber();
    syncFrame();
  } else if (m.t === "draw") {
    P.seq += 1;
    P.drawings.push({ id: "d" + P.seq, round: P.round, state: "draft", text: "", ...m.drawing });
    syncFrame();
  } else if (m.t === "change") {
    const c = { ...m.change, state: "draft" };
    const i = P.changes.findIndex((q) => q.sel === c.sel && q.state === "draft");
    if (!hasEffect(c)) { if (i >= 0) P.changes.splice(i, 1); }
    else if (i >= 0) P.changes[i] = c;
    else P.changes.push(c);
  } else if (m.t === "revert") {
    P.changes = P.changes.filter((q) => !(q.sel === m.sel && q.state === "draft"));
  } else if (m.t === "selected") {
    P.sel = m.sel ? { sel: m.sel, label: m.label, tag: m.tag, css: m.css || {}, flex: !!m.flex } : null;
  } else if (m.t === "history") {
    P.undo = m.undo; P.redo = m.redo;
  } else if (m.t === "changed") {
    // дизайнер поменял файл: прошлый раунд отработан — его пины гаснут, его сдвиги уже в коде
    for (const p of P.pins) if (p.state === "sent") p.state = "done";
    for (const d of P.drawings) if (d.state === "sent") d.state = "done";
    for (const c of P.changes) if (c.state === "sent") c.state = "done";
    P.pins = P.pins.filter((p) => p.state !== "done" || p.round >= P.round - 3);
    P.drawings = P.drawings.filter((d) => d.state !== "done");
    P.changes = P.changes.filter((c) => c.state !== "done");
    P.sel = null; P.undo = 0; P.redo = 0;
    renumber();
    reload();
  } else return;
  save();
  paint();
}

function renumber() {
  let n = 0;
  for (const p of P.pins) if (p.state !== "done") p.n = ++n;
}

// --- отправка пачки ----------------------------------------------------------------------------------------------
function markSent() {
  for (const p of draftPins()) p.state = "sent";
  for (const c of draftChanges()) c.state = "sent";
  for (const d of draftDrawings()) d.state = "sent";
  P.pins = P.pins.filter((p) => p.state !== "draft" || p.text.trim());   // пустые пины не нужны
  P.round += 1;
  renumber();
  save();
  syncFrame();
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

function clearDrafts() {
  P.pins = P.pins.filter((p) => p.state !== "draft");
  P.changes = P.changes.filter((c) => c.state !== "draft");
  P.drawings = P.drawings.filter((d) => d.state !== "draft");
  P.sel = null;
  renumber();
  save();
  reload();
  paint();
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
  paint();
}

// --- вид ---------------------------------------------------------------------------------------------------------
const ICONS = {
  logo: '<svg viewBox="0 0 20 20" width="18" height="18"><path d="M10 2.5a7.5 7.5 0 1 0 0 15c1 0 1.6-.6 1.6-1.4 0-.5-.3-.9-.3-1.4 0-.8.6-1.3 1.4-1.3h1.6a3 3 0 0 0 3-3C17 5.5 14 2.5 10 2.5Z" fill="none" stroke="currentColor" stroke-width="1.4"/><circle cx="6.5" cy="9" r="1" fill="currentColor"/><circle cx="9.5" cy="6" r="1" fill="currentColor"/><circle cx="13" cy="7" r="1" fill="currentColor"/></svg>',
  refresh: '<svg viewBox="0 0 16 16" width="14" height="14"><path d="M13 8a5 5 0 1 1-1.6-3.7M13 2.5v3h-3" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  undo: '<svg viewBox="0 0 16 16" width="14" height="14"><path d="M6 3 3 6l3 3M3 6h6.5a3.5 3.5 0 0 1 0 7H7" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  redo: '<svg viewBox="0 0 16 16" width="14" height="14"><path d="m10 3 3 3-3 3M13 6H6.5a3.5 3.5 0 0 0 0 7H9" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  comment: '<svg viewBox="0 0 16 16" width="13" height="13"><path d="M8 2.5c-3 0-5.5 2-5.5 4.7 0 1.2.5 2.2 1.300 3L3 13l2.800-1c.7.2 1.400.3 2.200.3 3 0 5.500-2 5.500-4.600S11 2.500 8 2.500Z" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"/></svg>',
  edit: '<svg viewBox="0 0 16 16" width="13" height="13"><path d="M3 13h2l7-7a1.400 1.400 0 0 0-2-2L3 11v2ZM9 5l2 2" fill="none" stroke="currentColor" stroke-width="1.200" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  draw: '<svg viewBox="0 0 16 16" width="13" height="13"><path d="M3 13c3-.5 3-4 5.500-4.500 2-.4 2 1.800 4 1M10.500 3.500l2 2L7 11l-2.500.5L5 9l5.500-5.500Z" fill="none" stroke="currentColor" stroke-width="1.200" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  zoom: '<svg viewBox="0 0 16 16" width="13" height="13"><circle cx="7" cy="7" r="4" fill="none" stroke="currentColor" stroke-width="1.200"/><path d="m10 10 3 3" stroke="currentColor" stroke-width="1.200" stroke-linecap="round"/></svg>',
  chev: '<svg viewBox="0 0 10 10" width="8" height="8"><path d="m2 3.500 3 3 3-3" fill="none" stroke="currentColor" stroke-width="1.200" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  gear: '<svg viewBox="0 0 16 16" width="13" height="13"><circle cx="8" cy="8" r="2" fill="none" stroke="currentColor" stroke-width="1.200"/><path d="M8 1.800v1.600M8 12.600v1.600M1.800 8h1.600M12.600 8h1.600M3.600 3.600l1.100 1.100M11.300 11.300l1.100 1.100M12.400 3.600l-1.100 1.100M4.700 11.300l-1.100 1.100" stroke="currentColor" stroke-width="1.200" stroke-linecap="round"/></svg>',
  file: '<svg viewBox="0 0 16 16" width="12" height="12"><path d="M4 2.500h5l3 3v8H4v-11Z" fill="none" stroke="currentColor" stroke-width="1.200" stroke-linejoin="round"/></svg>',
};
function icon(name, text) {
  const b = hub.el("span", "hd-ic");
  b.innerHTML = ICONS[name];
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
  const tabPlus = button("hd-plus", "+", "Открыть другой файл", () => { P.rtab = "files"; paint(); });
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

  // правая часть: полоса вкладок, тулбар, сцена, панель правки
  const right = el("div", "hd-right");
  const rtop = el("div", "hd-rtop");
  const rtabs = el("div", "hd-rtabs");
  const filesTab = button("hd-rtab", [icon("file"), document.createTextNode("Файлы дизайна")], null, () => { P.rtab = "files"; paint(); });
  const fileTab = el("div", "hd-rtab file");
  const fileName = button("hd-rname", "", null, () => { P.rtab = "file"; paint(); });
  const fileX = button("hd-rx", "×", "Закрыть файл", closeFile);
  fileTab.append(fileName, fileX);
  rtabs.append(filesTab, fileTab);
  const racts = el("div", "hd-racts");
  const presentWrap = el("div", "hd-menuwrap");
  const present = button("hd-btn", [document.createTextNode("Показать "), icon("chev")], null, () => toggleMenu("present"));
  const presentMenu = el("div", "hd-menu");
  presentMenu.append(button("hd-mi", "В новой вкладке браузера", null, () => { P.menu = ""; if (P.path) window.open(fileUrl(origin(), P.path), "_blank", "noopener"); paint(); }));
  presentWrap.append(present, presentMenu);
  const share = button("hd-btn dark", "Поделиться", "Скопировать путь к файлу", async () => {
    try { await navigator.clipboard.writeText(P.path); P.note = "Путь скопирован"; } catch { P.note = P.path; }
    paint();
    setTimeout(() => { if (P.note === "Путь скопирован") { P.note = ""; paint(); } }, 2000);
  });
  racts.append(presentWrap, share);
  rtop.append(rtabs, racts);

  const tool = el("div", "hd-tool");
  const again = button("hd-ib", icon("refresh"), "Перезагрузить предпросмотр", () => { ping(); reload(); });
  const undoB = button("hd-ib", icon("undo"), "Отменить", () => tell({ t: "undo" }));
  const redoB = button("hd-ib", icon("redo"), "Повторить", () => tell({ t: "redo" }));
  const sep = el("span", "hd-sep");
  const grow = el("span", "hd-grow");
  const tw = el("label", "hd-tweaks");
  const twBox = el("input"); twBox.type = "checkbox";
  const twTrack = el("span", "hd-switch");
  twBox.addEventListener("change", () => { P.tweaks = twBox.checked; paint(); });
  tw.append(el("span", "hd-lbl", "Окно"), twBox, twTrack);
  tw.title = "Ширина окна дизайна";
  const sep2 = el("span", "hd-sep");
  const modes = el("div", "hd-modes");
  for (const [id, name, ic, hint] of [["comment", "Комментарий", "comment", "Клик по месту — пин с текстом"],
    ["edit", "Правка", "edit", "Тянуть элемент, угол — размер, двойной клик — текст, стили — справа"],
    ["draw", "Рисунок", "draw", "Обвести или показать стрелкой"]]) {
    const b = button("hd-mode", [icon(ic), el("span", "hd-lbl", name)], hint, () => setMode(id));
    b.dataset.mode = id;
    modes.append(b);
  }
  const zoomWrap = el("div", "hd-menuwrap");
  const zoomB = button("hd-btn", "", "Масштаб", () => toggleMenu("zoom"));
  const zoomMenu = el("div", "hd-menu right");
  for (const z of ZOOMS) zoomMenu.append(button("hd-mi", z ? z + "%" : "По ширине", null, () => { P.zoom = z; P.menu = ""; layout(); paint(); }));
  zoomWrap.append(zoomB, zoomMenu);
  tool.append(again, undoB, redoB, sep, grow, tw, sep2, modes, zoomWrap);

  const body = el("div", "hd-body");
  const stage = el("div", "hd-stage");
  const sizer = el("div", "hd-sizer");
  const box = el("div", "hd-box");
  const frame = el("iframe", "hd-frame");
  frame.setAttribute("title", "Предпросмотр дизайна");
  frame.addEventListener("load", () => tell({ t: "hello", props: PROP_LIST }));
  box.append(frame);
  sizer.append(box);
  const empty = el("div", "hd-empty");
  const files = el("div", "hd-files");
  const tweaksPanel = el("div", "hd-tweakpanel");
  stage.append(sizer, empty, files, tweaksPanel);
  const props = el("div", "hd-props");
  body.append(stage, props);
  right.append(rtop, tool, body);

  wrap.append(left, right);
  root.replaceChildren(wrap);
  new ResizeObserver(layout).observe(stage);
  return { root, wrap, title, tabChat, tabComments, chat, list, banner, chips, input, who, note, filesTab, fileTab, fileName, rtabs,
    present, presentMenu, zoomMenu, zoomB, undoB, redoB, twBox, modes, stage, sizer, box, frame, empty, files, tweaksPanel, props, last: {} };
}
function toggleMenu(name) { P.menu = P.menu === name ? "" : name; paint(); }

function layout() {
  if (!ui) return;
  const W = ui.stage.clientWidth, H = ui.stage.clientHeight;
  const want = (SIZES.find((s) => s.id === P.size) || SIZES[0]).w || W;
  const k = P.zoom ? P.zoom / 100 : Math.min(1, W / want);
  const bh = P.zoom ? Math.max(H / k, 600) : H / k;
  Object.assign(ui.sizer.style, { width: Math.max(W, want * k) + "px", height: Math.max(H, bh * k) + "px" });
  Object.assign(ui.box.style, { width: want + "px", height: bh + "px", transform: `scale(${k})`, left: Math.max(0, (W - want * k) / 2) + "px" });
  ui.box.dataset.scale = k.toFixed(2);
}

function render(root, snap) {
  if (!ui || ui.root !== root) { ui = build(root); fromAddress(); ping(); layout(); }
  ui.snap = snap;
  pullChat(snap);
  paint();
}

const baseName = (p) => p.split(/[\\/]/).pop();

function paint() {
  if (!ui) return;
  const snap = ui.snap || hub.snapshot() || {};
  ui.wrap.dataset.mode = P.mode;
  ui.wrap.dataset.edit = P.mode === "edit" ? "1" : "";
  ui.title.textContent = P.path ? baseName(P.path).replace(/\.html?$/i, "") || "Hub Design" : "Hub Design";
  ui.tabChat.classList.toggle("on", P.tab === "chat");
  ui.tabComments.classList.toggle("on", P.tab === "comments");
  const live = P.pins.filter((p) => p.state !== "done").length + P.changes.filter((c) => c.state !== "done" && hasEffect(c)).length + P.drawings.filter((d) => d.state !== "done").length;
  ui.tabComments.textContent = live ? `Комментарии ${live}` : "Комментарии";
  ui.chat.hidden = P.tab !== "chat";
  ui.list.hidden = P.tab !== "comments";
  for (const b of ui.modes.children) b.classList.toggle("on", b.dataset.mode === P.mode);
  ui.zoomB.replaceChildren(icon("zoom", (P.zoom || "100") + "%"));
  if (!P.zoom) ui.zoomB.firstChild.lastChild.textContent = Math.round(Number(ui.box.dataset.scale || 1) * 100) + "%";
  ui.undoB.disabled = !P.undo;
  ui.redoB.disabled = !P.redo;
  ui.twBox.checked = P.tweaks;
  ui.presentMenu.hidden = P.menu !== "present";
  ui.zoomMenu.hidden = P.menu !== "zoom";
  ui.note.textContent = P.note;
  ui.note.hidden = !P.note;

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

  // вкладки справа
  const onFile = P.rtab === "file" && !!P.path;
  ui.filesTab.classList.toggle("on", !onFile);
  ui.fileTab.hidden = !P.path;
  ui.fileTab.classList.toggle("on", onFile);
  ui.fileName.textContent = P.path ? baseName(P.path) : "";
  ui.files.hidden = onFile;
  ui.sizer.hidden = !onFile || (P.alive === false);
  const why = P.alive === false ? P.note : "";
  ui.empty.textContent = why;
  ui.empty.hidden = !why || !onFile;
  ui.tweaksPanel.hidden = !(P.tweaks && onFile);
  ui.props.hidden = !(P.mode === "edit" && onFile);

  paintFiles();
  paintTweaks();
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
  pathIn.addEventListener("keydown", (e) => { if (e.key === "Enter") open(pathIn.value); });
  const rows = recent.map((p) => {
    const r = button("hd-frow", [icon("file"), el("span", "hd-fname", baseName(p)), el("span", "hd-fdir", p.split("/").slice(-3, -1).join("/"))], p, () => open(p));
    return r;
  });
  ui.files.replaceChildren(el("h3", null, "Файлы дизайна"), pathIn,
    ...(rows.length ? [el("div", "hd-fhint", `Последние HTML сессии ${P.session}`), ...rows] : [el("div", "hd-fhint", `У ${P.session} пока нет HTML. Укажите путь выше или откройте ссылку из разговора.`)]));
  if (!P.path && recent.length && P.rtab !== "file") { /* показываем список, сами не открываем */ }
}

function paintTweaks() {
  const sig = JSON.stringify([P.tweaks, P.size]);
  if (ui.last.tweaks === sig) return;
  ui.last.tweaks = sig;
  const el = hub.el;
  const head = el("div", "hd-twhead");
  head.append(el("span", null, "TWEAKS"), button("hd-twx", "×", "Закрыть", () => { P.tweaks = false; paint(); }));
  const opts = el("div", "hd-twopts");
  for (const s of SIZES) {
    const b = button("hd-twopt" + (P.size === s.id ? " on" : ""), s.label, null, () => { P.size = s.id; layout(); paint(); });
    opts.append(b);
  }
  ui.tweaksPanel.replaceChildren(head, el("div", "hd-twlabel", "ШИРИНА ОКНА"), opts);
}

// панель «Правка»: свойства выбранного элемента
function paintProps() {
  const sig = JSON.stringify([P.mode, P.sel]);
  if (ui.last.props === sig || ui.props.contains(document.activeElement) && ui.last.propsSel === (P.sel && P.sel.sel)) return;
  ui.last.props = sig;
  ui.last.propsSel = P.sel && P.sel.sel;
  const el = hub.el;
  const kids = [];
  if (!P.sel) kids.push(el("div", "hd-phint", "Выберите элемент в дизайне, чтобы поменять его стили."));
  else {
    kids.push(el("div", "hd-pel", `${P.sel.tag}  ${P.sel.label ? "«" + P.sel.label.slice(0, 40) + "»" : ""}`));
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
function field(f) {
  const el = hub.el;
  const wrap = el("label", "hd-field" + (f.wide ? " wide" : ""));
  wrap.append(el("span", "hd-flabel", f.label));
  const cur = (P.sel.css || {})[f.p] ?? "";
  const apply = (v) => { const val = cssValue(f, v); if (val != null) tell({ t: "style", prop: f.p, value: val }); };
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
    ...P.pins.filter((p) => p.state === "draft").map((p) => ({ k: p, text: p.text || "…без текста", ic: "comment", del: () => { P.pins = P.pins.filter((q) => q !== p); renumber(); syncFrame(); } })),
    ...P.changes.filter((c) => c.state === "draft" && hasEffect(c)).map((c) => ({ k: c, text: `${c.label || c.sel}: ${describeChange(c)}`, ic: "edit", del: () => { tell({ t: "revert", sel: c.sel }); P.changes = P.changes.filter((q) => q !== c); } })),
    ...P.drawings.filter((d) => d.state === "draft").map((d) => ({ k: d, text: describeDrawing(d), ic: "draw", del: () => { P.drawings = P.drawings.filter((q) => q !== d); syncFrame(); } })),
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
  const sig = JSON.stringify([pins, changes, drawings]);
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
  ui.list.replaceChildren(...(rows.length ? rows : [el("div", "hd-hint", "Комментариев пока нет. Включите «Комментарий» над дизайном и нажмите на нужное место.")]));
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
    // пути к HTML — ссылки: открыть в Hub Design
    let rest = text;
    for (const p of htmlPaths(text)) {
      const at = rest.indexOf(p);
      if (at < 0) continue;
      body.append(document.createTextNode(rest.slice(0, at)));
      body.append(button("hd-link", baseName(p), "Открыть в Hub Design: " + p, () => open(p)));
      rest = rest.slice(at + p.length);
    }
    body.append(document.createTextNode(rest));
    row.append(body);
    return row;
  }));
  if (!lines.length) ui.chat.append(el("div", "hd-hint", `С ${P.session} ещё не говорили.`));
  if (stick) ui.chat.scrollTop = ui.chat.scrollHeight;
}
