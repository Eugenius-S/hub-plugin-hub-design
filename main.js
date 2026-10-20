// Канвас дизайна: HTML дизайна вживую слева, разговор с дизайнером справа. «Коммент» — клик по месту ставит пин с текстом,
// «Двигать» — тянуть элемент, менять размер за угол, двойной клик по тексту — править. Всё копится пачкой и уходит
// дизайнеру одним сообщением по «Отправить»; файл правит он сам. Поменял файл — предпросмотр перезагружается, пины
// прошлого раунда гаснут. Дизайн показывает процесс плагина (server.py) со своего адреса, пины рисует agent.js в нём.
import { SIZES, canvasPort, chatLines, draftCount, fileUrl, hasEffect, htmlPaths, message, recentHtml } from "./lib.js";

const ID = "design-canvas";
const STORE = "design-canvas:";
const DEFAULT_SESSION = "designer";

let hub = null;
let ui = null;        // узлы вида, живут между снимками
const P = {
  path: "", session: DEFAULT_SESSION, mode: "view", size: "fit",
  pins: [], changes: [], round: 1, ready: false, view: { w: 0, h: 0 }, seq: 0,
  alive: null, items: [], rev: -1, epoch: null, busy: false, note: "",
};

globalThis.__designCanvas = () => P;   // для проверки в песочнице: пачка и состояние вида

const origin = () => `${location.protocol}//${location.hostname}:${canvasPort(location.port)}`;
const local = () => ["localhost", "127.0.0.1"].includes(location.hostname);

export default function register(h) {
  hub = h;
  hub.addStyle("style.css");
  addEventListener("message", onFrame);
  hub.addView({
    id: ID, title: "Канвас дизайна", subtitle: "пины и правки дизайнеру", icon: "icon.svg", full: true,
    render, show() { fromAddress(); ping(); }, hide() {},
  });
}

// --- хранение пачки: по файлу, в браузере — перезагрузка страницы её не теряет ---------------------------------
function save() {
  if (!P.path) return;
  localStorage.setItem(STORE + P.path, JSON.stringify({ pins: P.pins, changes: P.changes, round: P.round }));
  localStorage.setItem(STORE + "last", JSON.stringify({ path: P.path, session: P.session }));
  hold();
}
function load(path) {
  let d = {};
  try { d = JSON.parse(localStorage.getItem(STORE + path) || "{}"); } catch { d = {}; }
  P.pins = d.pins || [];
  P.changes = d.changes || [];
  P.round = d.round || 1;
  P.seq = P.pins.reduce((m, p) => Math.max(m, Number(String(p.id).slice(1)) || 0), 0);
}
// пачка не ушла — страница не перезагружается сама на новую версию хаба
function hold() {
  const html = document.documentElement;
  if (drafts() > 0) html.setAttribute("data-hub-hold", "канвас дизайна");
  else if (html.getAttribute("data-hub-hold") === "канвас дизайна") html.removeAttribute("data-hub-hold");
}
const draftPins = () => P.pins.filter((p) => p.state === "draft");
const draftChanges = () => P.changes.filter((c) => c.state === "draft");
const drafts = () => draftCount(draftPins(), draftChanges());

// открыть прошлый файл и сессию (последние в этом браузере)
function fromAddress() {
  let last = {};
  try { last = JSON.parse(localStorage.getItem(STORE + "last") || "{}"); } catch { last = {}; }
  if (last.session && last.session !== P.session) { P.session = last.session; P.items = []; P.rev = -1; ui?.input.set({ to: P.session }); }
  if (!P.path && last.path) open(last.path);
}

async function ping() {
  if (!local()) { P.alive = false; P.note = "Канвас работает только на этом компьютере: откройте хаб по localhost."; return paint(); }
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
  load(path);
  save();
  if (ui) ui.pathIn.value = path;
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

// --- связь с agent.js в предпросмотре ----------------------------------------------------------------------------
const tell = (msg) => { if (ui?.frame.contentWindow) ui.frame.contentWindow.postMessage({ canvas: 1, ...msg }, origin()); };
function syncFrame(edit) {
  tell({ t: "mode", mode: P.mode });
  tell({ t: "pins", pins: P.pins.map(({ id, n, sel, x, y, fx, fy, text, state }) => ({ id, n, sel, x, y, fx, fy, text, state })), edit });
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
  } else if (m.t === "remove") {
    P.pins = P.pins.filter((q) => q.id !== m.id);
    renumber();
    syncFrame();
  } else if (m.t === "change") {
    const c = { ...m.change, state: "draft" };
    const i = P.changes.findIndex((q) => q.sel === c.sel && q.state === "draft");
    if (!hasEffect(c)) { if (i >= 0) P.changes.splice(i, 1); }
    else if (i >= 0) P.changes[i] = c;
    else P.changes.push(c);
  } else if (m.t === "revert") {
    P.changes = P.changes.filter((q) => !(q.sel === m.sel && q.state === "draft"));
  } else if (m.t === "changed") {
    // дизайнер поменял файл: прошлый раунд отработан — его пины гаснут, его сдвиги уже в коде
    for (const p of P.pins) if (p.state === "sent") p.state = "done";
    for (const c of P.changes) if (c.state === "sent") c.state = "done";
    P.pins = P.pins.filter((p) => p.state !== "done" || p.round >= P.round - 3);
    P.changes = P.changes.filter((c) => c.state !== "done");
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
async function sendBatch() {
  const comments = draftPins().filter((p) => p.text.trim());
  const changes = draftChanges();
  const text = message({ path: P.path, round: P.round, view: P.view, comments, changes });
  if (!text || P.busy) return;
  P.busy = true;
  paint();
  const r = await hub.post("/api/send", { session: P.session, text });
  P.busy = false;
  if (r.error) { P.note = "Не ушло: " + r.error; return paint(); }
  P.note = "";
  for (const p of comments) p.state = "sent";
  for (const c of changes) c.state = "sent";
  P.pins = P.pins.filter((p) => p.state !== "draft" || p.text.trim());   // пустые пины не нужны
  P.round += 1;
  renumber();
  save();
  syncFrame();
  paint();
}

function clearDrafts() {
  P.pins = P.pins.filter((p) => p.state !== "draft");
  P.changes = P.changes.filter((c) => c.state !== "draft");
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
function build(root) {
  const el = hub.el;
  const wrap = el("div", "dc");
  const bar = el("div", "dc-bar");
  const pathIn = el("input", "dc-path");
  pathIn.placeholder = "Путь к HTML: /…/index.html";
  pathIn.addEventListener("keydown", (e) => { if (e.key === "Enter") open(pathIn.value); });
  const files = el("select", "dc-files");
  files.title = "Последние HTML сессии";
  files.addEventListener("change", () => { if (files.value) open(files.value); files.value = ""; });
  const modes = el("div", "dc-modes");
  for (const [id, label, hint] of [["view", "Смотреть", "Дизайн работает как обычно"],
    ["comment", "Коммент", "Клик по месту — пин с текстом"],
    ["move", "Двигать", "Тянуть элемент, угол — размер, двойной клик — текст"]]) {
    const b = el("button", "dc-mode", label);
    b.type = "button";
    b.dataset.mode = id;
    b.title = hint;
    b.addEventListener("click", () => { P.mode = id; syncFrame(); paint(); });
    modes.append(b);
  }
  const sizes = el("select", "dc-size");
  for (const s of SIZES) { const o = el("option", null, s.label); o.value = s.id; sizes.append(o); }
  sizes.addEventListener("change", () => { P.size = sizes.value; layout(); });
  const again = el("button", "dc-btn", "↻");
  again.type = "button";
  again.title = "Перезагрузить предпросмотр";
  again.addEventListener("click", () => { ping(); reload(); });
  bar.append(pathIn, files, modes, sizes, again);

  const stage = el("div", "dc-stage");
  const box = el("div", "dc-box");
  const frame = el("iframe", "dc-frame");
  frame.setAttribute("title", "Предпросмотр дизайна");
  frame.addEventListener("load", () => tell({ t: "hello" }));
  const empty = el("div", "dc-empty");
  box.append(frame);
  stage.append(box, empty);

  const side = el("div", "dc-side");
  const head = el("div", "dc-head");
  const who = el("select", "dc-who");
  who.title = "Кому уходят правки";
  who.addEventListener("change", () => {
    P.session = who.value; P.items = []; P.rev = -1; input.set({ to: P.session }); save(); pullChat(hub.snapshot()); paint();
  });
  head.append(el("span", "dc-label", "Дизайнер:"), who);
  const batch = el("div", "dc-batch");
  const chat = el("div", "dc-chat");
  const input = hub.input({ to: P.session, key: ID, placeholder: "Написать дизайнеру…" });
  side.append(head, batch, chat, input.node);

  wrap.append(el("div", "dc-main"), side);
  wrap.firstChild.append(bar, stage);
  root.replaceChildren(wrap);
  new ResizeObserver(layout).observe(stage);
  return { root, wrap, pathIn, files, modes, sizes, stage, box, frame, empty, who, batch, chat, input, last: {} };
}

function layout() {
  if (!ui) return;
  const W = ui.stage.clientWidth, H = ui.stage.clientHeight;
  const want = (SIZES.find((s) => s.id === P.size) || SIZES[0]).w || W;
  const k = Math.min(1, W / want);
  Object.assign(ui.box.style, { width: want + "px", height: H / k + "px", transform: `scale(${k})` });
  ui.box.dataset.scale = k.toFixed(2);
}

function render(root, snap) {
  if (!ui || ui.root !== root) { ui = build(root); fromAddress(); ping(); layout(); }
  ui.snap = snap;
  pullChat(snap);
  paint();
}

function paint() {
  if (!ui) return;
  const snap = ui.snap || hub.snapshot() || {};
  ui.wrap.dataset.mode = P.mode;
  for (const b of ui.modes.children) b.classList.toggle("on", b.dataset.mode === P.mode);
  ui.sizes.value = P.size;
  if (document.activeElement !== ui.pathIn) ui.pathIn.value = P.path;

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

  // файлы сессии
  const recent = recentHtml(P.items);
  const fileSig = recent.join("|");
  if (ui.last.files !== fileSig) {
    ui.last.files = fileSig;
    const head = hub.el("option", null, recent.length ? `Файлы ${P.session} (${recent.length})` : `У ${P.session} нет HTML`);
    head.value = "";
    ui.files.replaceChildren(head, ...recent.map((p) => { const o = hub.el("option", null, p.split("/").slice(-2).join("/")); o.value = p; o.title = p; return o; }));
    if (!P.path && recent.length) open(recent[0]);
  }

  // пусто или процесса нет
  const why = P.note && P.alive === false ? P.note : !P.path ? "Выберите HTML: из файлов дизайнера, путём сверху или ссылкой в разговоре." : "";
  ui.empty.textContent = why;
  ui.empty.hidden = !why;
  ui.box.hidden = !!why;

  paintBatch();
  paintChat();
}

function paintBatch() {
  const n = drafts();
  const pins = P.pins.filter((p) => p.state !== "done");
  const changes = P.changes.filter((c) => c.state !== "done" && hasEffect(c));
  const sig = JSON.stringify([n, pins, changes, P.busy, P.note, P.round]);
  if (ui.last.batch === sig) return;
  ui.last.batch = sig;
  const el = hub.el;
  const list = el("ol", "dc-list");
  for (const p of pins) {
    const li = el("li", "dc-item " + p.state);
    li.append(el("b", "dc-n", String(p.n)), el("span", "dc-t", p.text || "…без текста"));
    li.title = p.sel;
    if (p.state === "draft") {
      const x = el("button", "dc-x", "×");
      x.type = "button";
      x.title = "Убрать";
      x.addEventListener("click", () => { P.pins = P.pins.filter((q) => q !== p); renumber(); save(); syncFrame(); paint(); });
      li.append(x);
    }
    list.append(li);
  }
  for (const c of changes) {
    const li = el("li", "dc-item move " + c.state);
    const what = [c.dx || c.dy ? `сдвиг ${c.dx >= 0 ? "+" : ""}${Math.round(c.dx)}, ${c.dy >= 0 ? "+" : ""}${Math.round(c.dy)}` : "",
      c.w != null && (Math.round(c.w) !== Math.round(c.w0) || Math.round(c.h) !== Math.round(c.h0)) ? `${Math.round(c.w)}×${Math.round(c.h)}` : "",
      c.t != null && c.t !== c.t0 ? "текст" : ""].filter(Boolean).join(", ");
    li.append(el("b", "dc-n", "↔"), el("span", "dc-t", `${c.label || c.sel}: ${what}`));
    li.title = c.sel;
    if (c.state === "draft") {
      const x = el("button", "dc-x", "×");
      x.type = "button";
      x.title = "Вернуть как было";
      x.addEventListener("click", () => { tell({ t: "revert", sel: c.sel }); P.changes = P.changes.filter((q) => q !== c); save(); paint(); });
      li.append(x);
    }
    list.append(li);
  }
  const send = el("button", "dc-send", P.busy ? "Отправляю…" : `Отправить${n ? ` (${n})` : ""}`);
  send.type = "button";
  send.disabled = !n || P.busy;
  send.addEventListener("click", sendBatch);
  const drop = el("button", "dc-btn", "Сбросить");
  drop.type = "button";
  drop.hidden = !n;
  drop.addEventListener("click", clearDrafts);
  const row = el("div", "dc-row");
  row.append(send, drop);
  const parts = [];
  if (pins.length || changes.length) parts.push(list);
  else parts.push(el("div", "dc-hint", P.mode === "view" ? "«Коммент» — пины на дизайне, «Двигать» — правки руками." : "Пачка пуста."));
  parts.push(row);
  if (P.note && P.alive !== false) parts.push(el("div", "dc-note", P.note));
  ui.batch.replaceChildren(...parts);
}

function paintChat() {
  const lines = chatLines(P.items, 40);
  const sig = P.session + ":" + lines.map((l) => l.k + ":" + l.text.length).join(",");
  if (ui.last.chat === sig) return;
  ui.last.chat = sig;
  const stick = ui.chat.scrollHeight - ui.chat.scrollTop - ui.chat.clientHeight < 40;
  const el = hub.el;
  ui.chat.replaceChildren(...lines.map((l) => {
    const row = el("div", "dc-msg " + (l.kind === "in" ? "me" : "them"));
    const text = l.text.length > 1500 ? l.text.slice(0, 1500) + "…" : l.text;
    // пути к HTML — кнопки: открыть в канвасе
    let rest = text;
    for (const p of htmlPaths(text)) {
      const at = rest.indexOf(p);
      if (at < 0) continue;
      row.append(document.createTextNode(rest.slice(0, at)));
      const a = el("button", "dc-link", p.split("/").pop());
      a.type = "button";
      a.title = "Открыть в канвасе: " + p;
      a.addEventListener("click", () => open(p));
      row.append(a);
      rest = rest.slice(at + p.length);
    }
    row.append(document.createTextNode(rest));
    return row;
  }));
  if (!lines.length) ui.chat.append(el("div", "dc-hint", `С ${P.session} ещё не говорили.`));
  if (stick) ui.chat.scrollTop = ui.chat.scrollHeight;
}
