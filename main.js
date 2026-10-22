// Hub Design: a canvas with HTML designs and a conversation with the designer on the left. On the canvas (canvas.js) the frames are artboards:
// select — a frame and dragging elements inside it, styles and color — in the panel, "Comment" — a click puts a pin with text, the pencil and
// shapes — mark a place, a note — a sticker on the canvas. Manual edits go by themselves 8 s after the last one — to whoever is chosen at
// the bottom (the designer by default); comments — with their own button or together with your text. A changed file reloads the frame, the pins of the past round fade.
// The design is served by the plugin process (server.py) from its own address, pins and frames are drawn by agent.js inside each frame.
import { ASK_TTL, basedOnText, newDesignPrefix, PROPS, SWATCHES, canvasPort, chatLines, createCancels, cssValue, describeChange, describeDrawing, draftCount, normErrors, gridCols, gridForm, dueSessions, exitTarget, dashboardFiles, cardKind, fileUrl, nameOf,
  goneText, hasEffect, htmlAuthored, htmlPaths, mergeAuthors, KNOWN_MAX, hubName, installText, isGone, lacking, mergeTimeline, message, nextSpot, recentHtml, recipientOf, whoGets, searchOrder, selectedLine, timelineQuery, toolMode, windowHeight, autoSig, createAuto,
  describeTweak, directionDirs, dirKey, saveDirOf, saveLine, normTweaks, withProbe, ownColor, toHex, isBuiltin, BUILTINS, builtinShow, builtinValue, tweakApply, tweakBase, tweakEffect, tweakValue, wroteAt, writable, markWritten, markUnwritten } from "./lib.js";
import { createCanvas } from "./canvas.js";
import { styleLine } from "./lib.js";
import { chosen, createStyles, t as ts } from "./styles.js";
import { mountCards } from "./card.js";
import { createDashboard, createNeed, isStub, stubText } from "./dashboard.js";
import { CANVAS_ICONS as CI } from "./icons.js";
import { currentLang, makeT, setLangSource } from "./i18n.js";

// UI strings: en by default, ru when the hub language is Russian (see i18n.js); texts are resolved at use time, never at load
const STR = {
  en: {
    subtitle: "canvas, pins and edits for the designer",
    open_in: "Open in Hub Design: this session's conversation and the typed text",
    local_only: "Hub Design works only on this computer: open the hub via localhost.",
    no_proc: "The plugin process is not responding at {origin}. Restart the plugin: hub restart ext:{id}",
    write_fail: "The edits did not reach the file. They will go to the designer as text",
    not_sent: "Not sent: {err}",
    pdf_fail: "PDF failed: {why}",
    del_edit: "Remove the edit",
    pick_to: "Choose who to send the comment to",
    home_title: "Start screen: presets and previous files",
    tab_chat: "Chat",
    tab_comments: "Comments",
    tab_comments_n: "Comments {n}",
    add_design: "Add a design",
    add_html: "Add an HTML file to the canvas",
    placeholder: "Describe what to change…",
    who_title: "Who receives the edits",
    exit: "Exit Hub Design", exit_title: "Leave Hub Design for the chat: {name}",
    q_failed: "Not removed",
    q_removed: "Removed from the queue",
    q_retry: "Retry",
    q_undo: "Undo",
    q_n: "Queued · {n}",
    q_now: "Send now",
    q_remove: "Remove",
    props_hint: "Select an element on the canvas to change its color and styles.",
    colors: "Color",
    fill: "Fill",
    text: "Text",
    layout: "Layout",
    to_flex: "To flex",
    to_grid: "To grid",
    flex_title: "display: flex, children in a row",
    grid_title: "display: grid, two columns",
    tweaks: "Tweaks",
    bi_title: "Margins and type",
    bi_pad: "Margins", bi_fs: "Font size", bi_ls: "Tracking", bi_lh: "Leading",
    own_color: "Custom color",
    note_chip: "Note: {text}",
    design_errors: "Design errors: {n}",
    remove: "Remove",
    lost_prefix: "⚠ element not found · ",
    area_title: "Area x {x}, y {y}, {w}\u00d7{h} px",
    lost_title: "Element not found: the design was re-laid out. The point stays where it was",
    in_file: "in the file",
    not_written: "{sel}: not written to the file. {why}",
    no_comments: "No comments yet. Choose “Comment” on the canvas toolbar and click the place you mean.",
    show_on_canvas: "Show on the canvas: {path}",
    no_talk: "No conversation with {name} yet.",
  },
  ru: {
    subtitle: "холст, пины и правки дизайнеру",
    open_in: "Открыть в Hub Design: разговор этой сессии и набранный текст",
    local_only: "Hub Design работает только на этом компьютере: откройте хаб по localhost.",
    no_proc: "Процесс плагина не отвечает на {origin}. Перезапустите плагин: hub restart ext:{id}",
    write_fail: "Правки не записались в файл. Они уйдут дизайнеру текстом",
    not_sent: "Не ушло: {err}",
    pdf_fail: "PDF не вышел: {why}",
    del_edit: "Убрать правку",
    pick_to: "Выберите, кому отправить комментарий",
    home_title: "Стартовый экран: пресеты и прошлые файлы",
    tab_chat: "Чат",
    tab_comments: "Комментарии",
    tab_comments_n: "Комментарии {n}",
    add_design: "Добавить макет",
    add_html: "Добавить HTML на холст",
    placeholder: "Опишите, что нужно изменить…",
    who_title: "Кому уходят правки",
    exit: "Выйти из Hub Design", exit_title: "Выйти из Hub Design в чат: {name}",
    q_failed: "Не убрано",
    q_removed: "Убрано из очереди",
    q_retry: "Повторить",
    q_undo: "Отменить",
    q_n: "В очереди · {n}",
    q_now: "Отправить сейчас",
    q_remove: "Убрать",
    props_hint: "Выберите элемент на холсте, чтобы поменять цвет и стили.",
    colors: "Цвет",
    fill: "Заливка",
    text: "Текст",
    layout: "Раскладка",
    to_flex: "Во flex",
    to_grid: "В grid",
    flex_title: "display: flex, дети в ряд",
    grid_title: "display: grid, две колонки",
    tweaks: "Крутилки",
    bi_title: "Поля и шрифты",
    bi_pad: "Поля", bi_fs: "Шрифт", bi_ls: "Трекинг", bi_lh: "Интерлиньяж",
    own_color: "Свой цвет",
    note_chip: "Заметка: {text}",
    design_errors: "Ошибки макета: {n}",
    remove: "Убрать",
    lost_prefix: "⚠ элемент не найден · ",
    area_title: "Область x {x}, y {y}, {w}\u00d7{h} px",
    lost_title: "Элемент не найден: макет перевёрстан. Точка осталась на прежнем месте",
    in_file: "в файле",
    not_written: "{sel}: не записано в файл. {why}",
    no_comments: "Комментариев пока нет. Выберите «Комментарий» на панели холста и нажмите на нужное место.",
    show_on_canvas: "Показать на холсте: {path}",
    no_talk: "С {name} ещё не говорили.",
  },
};
const tr = makeT(STR);
const ID = "hub-design";
const STORE = "hub-design:";
const OLD_STORE = "design-canvas:";   // keys before 0.2.0 (the plugin was called design-canvas): picked up once
const DEFAULT_SESSION = "designer";
const HOLD = "Hub Design";
const PROP_LIST = [...new Set(PROPS.flatMap((g) => g.rows.flat().map((f) => f.p)))];

let hub = null;
let ui = null;        // the view's nodes, they live between snapshots
const specs = new Map();   // file → {list: parsed tweaks of the design, base: {key: original value}}
const eps = new Map();   // frame → {id, path, iframe, ready}: every frame has its own agent.js
const P = {
  session: DEFAULT_SESSION, tab: "chat", tool: "select", shapes: { pencil: "free", shape: "rect" }, propsOpen: false, propsUser: true,
  frames: [], focus: "", pins: [], changes: [], drawings: [], notes: [], tweaks: [], errs: [], writers: {}, round: 1, seq: 0, cv: { x: 56, y: 84, k: 1, auto: true },
  alive: null, items: [], rev: -1, epoch: null, busy: false, note: "", sel: null, hist: {}, lastEdit: "", shown: false, handoff: null,
  authors: [], known: [], histSeq: {}, histAt: 0, opened: {}, have: {}, times: {}, ok: new Set(), picked: {}, found: {}, pinned: null, home: true, preset: null, asked: {}, homeWho: null, back: "", openFrom: null, sent: 0, origin: "", originNew: false, style: null,
};

globalThis.__hubDesign = () => P;   // for checks in the sandbox: the batch and the view state

const origin = () => `${location.protocol}//${location.hostname}:${canvasPort(location.port)}`;
const local = () => ["localhost", "127.0.0.1"].includes(location.hostname);
const getKey = (k) => localStorage.getItem(STORE + k) ?? localStorage.getItem(OLD_STORE + k);

export default function register(h) {
  hub = h;
  setLangSource(() => hub.lang);   // read on every use, never at load
  hub.addStyle("style.css");
  hub.addStyle("dashboard.css");
  hub.addStyle("card.css");
  hub.addStyle("styles.css");
  addEventListener("message", onFrame);
  // cards of designs, documents and presentations in the chat feed of any session; a click on a card opens the file here
  mountCards({ origin, local, open: openFile, files: filesUrl, lang: () => hub.lang, abs, session: () => decodeURIComponent((location.hash.match(/^#\/s\/([^/?]+)/) || [])[1] || "") });
  // the address before Hub Design: "✕" returns there (none — to the home page)
  let prev = location.hash;
  addEventListener("hashchange", (e) => {
    const was = e.oldURL ? new URL(e.oldURL).hash : prev;
    prev = location.hash;
    if (was && !was.startsWith("#/x/" + ID)) P.back = was;
    // came from a session window: its direction is where the new designs go (from any other page - nowhere in particular)
    if (location.hash.startsWith("#/x/" + ID) && !was.startsWith("#/x/" + ID)) {
      P.origin = decodeURIComponent((was.match(/^#\/s\/([^/?]+)/) || [])[1] || "");
      P.originNew = true;
      adoptOrigin();
    }
  });
  hub.addView({
    id: ID, title: "Hub Design", subtitle: tr("subtitle"), icon: "icon.svg", full: true,
    render, show() { P.shown = true; sidebar(true); fromAddress(); ping(); }, hide() { P.shown = false; sidebar(false); },
  });
  // a palette button in the session input (the composer.tools slot — an addition of this hub): open Hub Design with this conversation
  if (typeof hub.addSlot === "function") {
    hub.addSlot("composer.tools", {
      id: "design",
      render(root, snap, ctx) {
        root.__ctx = ctx;
        if (!ctx.session) return root.replaceChildren();   // not a session chat (Hub Design's own input, forms)
        if (root.firstChild) { root.firstChild.title = tr("open_in"); root.firstChild.setAttribute("aria-label", tr("open_in")); return; }
        const b = hub.el("button", "btn round quiet hd-palette");
        b.type = "button";
        b.title = tr("open_in");
        b.setAttribute("aria-label", b.title);
        b.innerHTML = PALETTE;
        b.addEventListener("click", () => handoff(root));
        root.append(b);
      },
    });
  }
}

const PALETTE = '<svg viewBox="0 0 24 24" class="icon" fill="currentColor" aria-hidden="true"><path d="M 12 2 C 6.241 2 1.6193906 6.8668906 2.0253906 12.712891 C 2.3923906 18.001891 7.0056406 22 12.306641 22 L 13 22 C 14.105 22 15 21.105 15 20 L 15 17 C 15 15.895 15.895 15 17 15 L 20 15 C 21.105 15 22 14.105 22 13 L 22 12.306641 C 22 7.0056406 18.002844 2.3923906 12.714844 2.0253906 C 12.474844 2.0083906 12.236 2 12 2 z M 12 4 C 12.19 4 12.381219 4.0065313 12.574219 4.0195312 C 16.738219 4.3085313 20 7.9486406 20 12.306641 L 20 13 L 17 13 C 14.794 13 13 14.794 13 17 L 13 20 L 12.306641 20 C 7.9486406 20 4.3075312 16.737219 4.0195312 12.574219 C 3.8635312 10.324219 4.6194375 8.1839219 6.1484375 6.5449219 C 7.6794375 4.9039219 9.758 4 12 4 z M 12.5 5 A 1.5 1.5 0 0 0 11 6.5 A 1.5 1.5 0 0 0 12.5 8 A 1.5 1.5 0 0 0 14 6.5 A 1.5 1.5 0 0 0 12.5 5 z M 8.5 6 A 1.5 1.5 0 0 0 7 7.5 A 1.5 1.5 0 0 0 8.5 9 A 1.5 1.5 0 0 0 10 7.5 A 1.5 1.5 0 0 0 8.5 6 z M 16.5 7 A 1.5 1.5 0 0 0 15 8.5 A 1.5 1.5 0 0 0 16.5 10 A 1.5 1.5 0 0 0 18 8.5 A 1.5 1.5 0 0 0 16.5 7 z M 6.5 10 A 1.5 1.5 0 0 0 5 11.5 A 1.5 1.5 0 0 0 6.5 13 A 1.5 1.5 0 0 0 8 11.5 A 1.5 1.5 0 0 0 6.5 10 z M 10 14 A 2 2 0 0 0 8 16 A 2 2 0 0 0 10 18 A 2 2 0 0 0 12 16 A 2 2 0 0 0 10 14 z"/></svg>';

// a handoff from a session chat: what is typed in the input moves to Hub Design (the session's input is cleared — the text is not lost, it is in the designer's input).
// The recipient is not this session but the design's specialist: the designer or the author of the open file; the session only hints which design to open
function handoff(root) {
  const ctx = root.__ctx;
  if (!ctx?.session) return;
  const ta = root.closest("form")?.querySelector("textarea");
  const text = ta ? ta.value : "";
  P.handoff = { session: ctx.session.name, text };
  if (ta && text) { ta.value = ""; ta.dispatchEvent(new Event("input", { bubbles: true })); }
  hub.go(ID);
  // the view could be already open and hidden — show() picks up the handoff itself; if it is open now — pick it up here
  setTimeout(applyHandoff, 0);
}
function applyHandoff() {
  const h = P.handoff;
  if (!h || !ui) return;
  P.handoff = null;
  P.tab = "chat";
  P.origin = h.session;
  P.originNew = true;
  adoptOrigin();
  P.openFrom = h.session;   // open this session's last design on the canvas if it has one (while it is not in the list — wait for the feeds)
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

// the hub's sidebar is hidden by a separate plugin, hide-sidebar; without it nobody listens to the event
function sidebar(hide) {
  try { window.dispatchEvent(new CustomEvent("hub-sidebar", { detail: { hide, by: "hub-design" } })); } catch { /* an old browser */ }
}

// --- storage of the batch: one board in the browser — a page reload does not lose it -----------------------------
function save() {
  localStorage.setItem(STORE + "board", JSON.stringify({ frames: P.frames, pins: P.pins, changes: P.changes, drawings: P.drawings, notes: P.notes, tweaks: P.tweaks, errs: P.errs, writers: P.writers,
    round: P.round, cv: P.cv, shapes: P.shapes, picked: P.picked, found: P.found, opened: P.opened }));
  hold();
}
// designs found earlier (feeds and history): the feed tail forgets them, the dashboard must not
function loadKnown() {
  let k = null;
  try { k = JSON.parse(getKey("known") || "null"); } catch { k = null; }
  P.known = Array.isArray(k && k.list) ? k.list.filter((a) => a && a.path && a.session) : [];
  P.histSeq = (k && k.seq) || {};
  P.histAt = (k && k.at) || 0;
}
function saveKnown() {
  try { localStorage.setItem(STORE + "known", JSON.stringify({ list: P.known, seq: P.histSeq, at: P.histAt })); } catch { /* storage is full: they will be found again */ }
}
function load() {
  loadKnown();
  let b = null;
  try { b = JSON.parse(getKey("board") || "null"); } catch { b = null; }
  if (!b) b = legacy();
  P.frames = (b.frames || []).filter((f) => f && f.path).map((f) => (f.auto && !f.fixed ? { ...f, h: windowHeight(f.w) } : f));   // before 0.4.1 the frame stretched to the document height
  P.picked = b.picked || {};
  P.found = b.found || {};
  P.opened = b.opened || {};   // designs ever opened on the canvas: a frame leaves the canvas, the dashboard keeps the design
  P.pins = b.pins || [];
  P.changes = b.changes || [];
  P.drawings = b.drawings || [];
  P.notes = b.notes || [];
  P.tweaks = b.tweaks || [];
  P.errs = b.errs || [];
  P.writers = b.writers || {};
  P.round = b.round || 1;
  try { P.asked = JSON.parse(localStorage.getItem(STORE + "asked") || "{}") || {}; } catch { P.asked = {}; }
  try { P.style = chosen(JSON.parse(localStorage.getItem(STORE + "style") || "null")); } catch { P.style = null; }
  if (b.cv) P.cv = { x: 56, y: 84, k: 1, auto: true, ...b.cv };
  if (b.shapes) P.shapes = { ...P.shapes, ...b.shapes };
  P.seq = [...P.pins, ...P.drawings, ...P.notes].reduce((m, p) => Math.max(m, Number(String(p.id).slice(1)) || 0), 0);
}
// the board of version 0.2.0 — a single file with the batch under its path
function legacy() {
  let last = {}, d = {};
  try { last = JSON.parse(getKey("last") || "{}"); } catch { last = {}; }
  if (!last.path) return {};
  try { d = JSON.parse(getKey(last.path) || "{}"); } catch { d = {}; }
  const stamp = (x) => ({ ...x, file: last.path });
  return { frames: [{ path: last.path, x: 0, y: 0, w: 1440, h: 900, auto: true }], pins: (d.pins || []).map(stamp), changes: (d.changes || []).map(stamp),
    drawings: (d.drawings || []).map(stamp), round: d.round || 1 };
}
// the batch has not been sent — the page does not reload itself for a new hub version
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
// the selected element goes into the chat message and together with the batch; a lone selection without edits does not start auto-send
const selText = () => (P.sel && !home() ? selectedLine(P.sel) : "");
const batchText = (extra = {}) => withSel(message({ path: (P.frames[0] || {}).path || "", round: P.round, views: views(), comments: draftPins().filter((p) => p.text.trim()),
  changes: draftChanges(), drawings: draftDrawings(), notes: draftNotes(), tweaks: draftTweaks(), errors: draftErrs(), copies: Object.fromEntries(Object.entries(P.writers).filter(([, v]) => v && v.copy).map(([f, v]) => [f, v.copy])), style: "", ...extra }));
const withSel = (b) => (b && selText() ? b + "\n\n" + selText() : b);
// the style reference chosen in the picker goes with the next message to the designer (once): the line "Style reference: <path>", see message() in lib.js
const styleNow = () => (P.style ? styleLine(P.style.path) : "");
const withStyle = (b) => { const l = styleNow(); return l && !(b || "").includes(l) ? (b ? b + "\n\n" + l : l) : b; };
function attachStyle(x) {
  P.style = chosen(x);
  try { localStorage.setItem(STORE + "style", JSON.stringify(P.style)); } catch { /* the choice is just not kept */ }
  paint();
}

// the recipient is not remembered between openings: the open design drives it (wanted); a handoff from a chat overrides
function fromAddress() {
  applyHandoff();
  adoptOrigin();
  applyOpen();
}
// --- where a new design is saved: the folder of the direction the owner came from, or of the folder open on the dashboard ----------
const dirsNow = () => directionDirs((hub.snapshot() || {}).sessions, (hub.snapshot() || {}).directions);
// the dashboard opens in the folder of the direction we came from (none - on all folders)
function adoptOrigin() {
  if (!P.originNew || !ui) return;
  P.originNew = false;
  const dir = saveDirOf(P.origin, (hub.snapshot() || {}).sessions, (hub.snapshot() || {}).directions);
  ui.dash.setFolder(dir ? dirKey(dir) : null);
}
// the cwd whose design/ takes the new design: the open dashboard folder, else the direction we came from; "" - the designer's own place
function saveFolder() {
  const f = ui ? ui.dash.state.folder : null;
  if (f === "") return "";
  if (f) return (dirsNow().find((d) => d.key === f) || {}).cwd || "";
  const snap = hub.snapshot() || {};
  return saveDirOf(P.origin, snap.sessions, snap.directions);
}
const withSave = (text) => { const l = saveLine(saveFolder()); return l ? text + "\n\n" + l : text; };

// a file in the hub's Files (the same address a path link in a reply leads to)
const filesUrl = (path) => {
  const s = decodeURIComponent((location.hash.match(/^#\/s\/([^/?]+)/) || [])[1] || "");
  return `${location.protocol}//${location.hostname}:${(hub.snapshot() || {}).files_port || 8788}/open?path=${encodeURIComponent(abs(path))}` + (s ? `&session=${encodeURIComponent(s)}` : "");
};

// a file from a card in the feed: open the view and put the file on the canvas (the view is not drawn yet - wait for render)
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
  if (!local()) { P.alive = false; P.note = tr("local_only"); return paint(); }
  try {
    await fetch(origin() + "/__canvas/ping", { mode: "no-cors", cache: "no-store" });
    P.alive = true;
    P.note = "";
  } catch {
    P.alive = false;
    P.note = tr("no_proc", { origin: origin(), id: ID });
  }
  paint();
  if (P.alive) { verifyAll(); if (ui) ui.st.probe(); }
  if (P.alive && was === false) reloadAll();
}

// --- the design files are in place -------------------------------------------------------------------------------
// the plugin process answers for every path: ok | missing | denied. We ask on events: the design list changed, the dashboard or a file was opened,
// a frame was reloaded — not on a timer. A missing file — a mark on the card and a clear line in the frame, not the server's raw answer.
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
    } catch { /* the process does not answer — ping will show it */ }
    if (!r) return;
    for (const p of part) if (r[p] && P.have[p] !== r[p]) { P.have[p] = r[p]; changed = true; }
  }
  if (changed) paint();
  loadTimes(want.filter((p) => P.have[p] === "ok"));
}
// when the files were edited — for the "edited …" line of designs that are not in the session feeds (open only on the canvas)
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
// came back to the tab or the window — the files could have been changed behind the hub's back
window.addEventListener("focus", () => { if (P.shown) verifyAll(); });
document.addEventListener("visibilitychange", () => { if (P.shown && !document.hidden) verifyAll(); });
function goHome() {
  P.home = true; P.preset = null; P.homeWho = null; P.tab = "chat";
  dropStub();
  verifyAll();
  for (const f of P.frames) ensureAuthor(f.path);
  paint();
}
// open a design on the canvas: first make sure the file exists — instead of an empty frame the owner reads what is missing
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

// --- frames ------------------------------------------------------------------------------------------------------
const homeGuess = () => {
  const s = (hub.snapshot()?.sessions || []).find((x) => x.cwd && /^\/Users\/[^/]+|^\/home\/[^/]+/.test(x.cwd));
  return s ? s.cwd.match(/^\/(Users|home)\/[^/]+/)[0] : "~";
};
// only: the design is opened from the dashboard, a card or a session - one file, one page: other frames leave the canvas (drafts stay);
// "+" on the canvas adds one beside
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
// the design sets the frame size itself (<meta name="hub-frame" content="1080x1350"> or an explicit width/height on html/body): the frame is exactly that,
// no width switch, the PDF is one page of that size. No size - a window by width, as before
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
    flushWrite(path);   // the drafts are removed — the file returns to its look before our edits
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
// the designer changed the file: the previous round is done — its pins fade, its shifts are already in the code; our copy and records are no longer needed
function fileChanged(file) {
  const w = writers.get(file);
  if (w) { w.maxStamp = 0; w.fails = 0; }
  delete P.writers[file];
  markUnwritten(P.changes, P.tweaks, file);
  const mine = (x) => x.file === file;
  for (const p of P.pins) if (mine(p) && p.state === "sent") p.state = "done";
  for (const d of P.drawings) if (mine(d) && d.state === "sent") d.state = "done";
  for (const c of P.changes) if (mine(c) && c.state === "sent") c.state = "done";
  P.tweaks = P.tweaks.filter((t) => !mine(t) || t.state !== "sent");   // the defaults are now in the file itself
  P.errs = P.errs.filter((e) => !mine(e) || e.state !== "sent");
  P.pins = P.pins.filter((p) => !mine(p) || p.state !== "done" || p.round >= P.round - 3);
  P.drawings = P.drawings.filter((d) => !mine(d) || d.state !== "done");
  P.changes = P.changes.filter((c) => !mine(c) || c.state !== "done");
  if (P.sel && P.sel.file === file) P.sel = null;
  P.hist[file] = { undo: 0, redo: 0 };
  renumber();
  ui.cv.reloadFrame(file);
}

// --- writing manual edits into the file --------------------------------------------------------------------------
// Manual edits and tweaks go into the file itself (server.py /__canvas/write), pointwise and from the copy <name>.r<N>.html: every time the whole set anew
// from the copy, so rolling an edit back returns the file. The author of the design is in a turn — we do not write (his file is not touched), the items go to him in words.
const writers = new Map();   // file → {timer, inflight, again, deferred, maxStamp, fails}; copy and fmtime live in P.writers (they survive a reload)
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
      const late = w.deferred.filter((m) => m > w.maxStamp);   // someone else's edit of the file while ours was being written
      w.deferred = [];
      if (late.length) { fileChanged(file); save(); paint(); }
    });
  return w.inflight;
}
async function writeOnce(file, w) {
  const items = writable(P.changes, file);
  const ops = tweakOps(file);
  const known = P.writers[file] || {};
  if (!items.length && !ops.length && !known.copy) return;   // nothing to write, and no copy
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
    // the "in the file" mark — only for the edits whose value has not changed since
    const sent = new Map(items.map((i) => [i.sel, JSON.stringify(i)]));
    const same = (sel) => { const c = P.changes.find((q) => q.file === file && q.sel === sel && q.state !== "done"); const n = c && writable([c], file)[0]; return !!n && JSON.stringify(n) === sent.get(sel); };
    markWritten(P.changes, P.tweaks, file, { ...res, done: (res.done || []).filter(same), ops: JSON.stringify(tweakOps(file)) === JSON.stringify(ops) ? res.ops : "skipped" });
  } else if (res.status === 409 && res.error === "changed") {
    fileChanged(file);   // the file was edited without us — it is the author's edit, start clean
  } else if (res.status === 409 && res.error === "busy") {
    markUnwritten(P.changes, P.tweaks, file);   // the author is in a turn: do not touch the file, wait for the end of the turn
    if (P.frames.some((f) => f.path === file)) scheduleWrite(file, 5000);
  } else {
    markUnwritten(P.changes, P.tweaks, file);
    w.fails += 1;
    if (res.status === 404 || res.status === 413 || res.status === 403 || w.fails > 3) { P.note = tr("write_fail"); w.fails = 0; }
    else if (P.frames.some((f) => f.path === file)) scheduleWrite(file, 5000);   // the author is in a turn or the process is restarting — try later
  }
  save();
  paint();
}

// --- the link with agent.js in the frames ------------------------------------------------------------------------
const tellEp = (ep, msg) => { if (ep?.iframe.contentWindow) ep.iframe.contentWindow.postMessage({ canvas: 1, ...msg }, origin()); };
const epOf = (file) => eps.get("f:" + file);
const tellFile = (file, msg) => tellEp(epOf(file), msg);
const tellAll = (msg) => { for (const ep of eps.values()) tellEp(ep, msg); };

// the hub's colors for frames and pins inside a frame: the frame lives at another address and does not see the theme variables
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
  tellEp(ep, { t: "pins", pins: P.pins.filter((p) => p.file === path).map(({ id, n, sel, fp, lost, x, y, fx, fy, text, state, area }) => ({ id, n, sel, fp, lost, x, y, fx, fy, text, state, area })),
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
    tellEp(ep, { t: "theme", theme: theme(), lang: currentLang() });
    ui.cv.scaleTo(ep);
    syncEp(ep);
    const keep = P.changes.filter((c) => c.file === file && c.state !== "done");
    if (keep.length) tellEp(ep, { t: "apply", changes: keep });
    readTweaks(file, ep, m.tweaks);
    scheduleWrite(file);   // drafts from last time or after a frame reload — into the file
    liveErrs.delete(file);   // the design loaded again — it will send a fresh list itself
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
      sel: m.sel, fp: m.fp || null, label: m.label, x: m.x, y: m.y, fx: m.fx, fy: m.fy, ex: m.ex, ey: m.ey, w: m.w, h: m.h,
      ...(m.area ? { area: m.area, els: m.els || [], more: m.more || 0 } : {}) };
    P.pins.push(pin);
    P.focus = file;
    syncAll({ file, id: pin.id });
  } else if (m.t === "pinfix") {
    // the design was re-read: the pin found its element again (another selector) or lost it
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
    P.changes = P.changes.filter((q) => !(q.file === file && q.sel === m.sel && (q.state === "draft" || q.state === "sent" && q.inFile)));   // a sent edit already written to the file — too: the file will return to the copy
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
    if (w && m.mtime <= w.maxStamp) return;   // our own write of manual edits
    if (w && w.inflight) { w.deferred.push(m.mtime); return; }   // a write is in progress: its answer will decide whose edit this is
    fileChanged(file);
  } else return;
  save();
  paint();
}

function renumber() {
  let n = 0;
  for (const p of P.pins) if (p.state !== "done") p.n = ++n;
}

// --- canvas tools --------------------------------------------------------------------------------------------------
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
// which of the needed specialists are not in the hub (by the snapshot: appeared — it disappears itself); asked — "waiting"
const lackNow = () => lacking((ui?.snap || hub.snapshot() || {}).sessions || [], P.asked);
// "Install": a message to the hub from the owner — only the hub or the owner installs; wait until the session appears in the snapshot
async function install(name) {
  if (P.asked[name] && Date.now() - P.asked[name] < ASK_TTL) return;
  P.asked[name] = Date.now();
  localStorage.setItem(STORE + "asked", JSON.stringify(P.asked));
  paint();
  const r = await hub.post("/api/send", { session: hubName((hub.snapshot() || {}).sessions), text: installText(name), action: true });
  if (r.error) {
    delete P.asked[name];
    localStorage.setItem(STORE + "asked", JSON.stringify(P.asked));
    P.note = tr("not_sent", { err: r.error });
    paint();
  }
}

// "Download PDF": the plugin process prints with its own Chrome (hub.json testchrome.path); Chrome is not set up — the page prints itself
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
  try { why = (await res.json()).error || ""; } catch { /* not JSON */ }
  P.note = tr("pdf_fail", { why: why || res.status });
  paint();
  return false;
}
// the fallback: a print version in a frame of the needed size, it starts printing itself (the browser's print dialog — "Save as PDF")
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
  hello: (ep) => tellEp(ep, { t: "hello", props: PROP_LIST, external: true, theme: theme(), lang: currentLang() }),
  register: (ep) => eps.set(ep.id, ep), unregister: (id) => eps.delete(id),
  fileUrl: (path, o = {}) => fileUrl(origin(), path) + "?" + new URLSearchParams({ ...(o.raw ? { raw: "1" } : {}), ...(o.dl ? { dl: "1" } : {}), ...(["pdf", "svg"].includes(cardKind(path)) && !o.dl ? { player: "1" } : {}), v: "1" }),
  pdf: (path) => savePdf(path),
  play: (path) => { if (path) window.open(fileUrl(origin(), path) + (cardKind(path) === "svg" ? "?player=1&v=1" : ""), "_blank", "noopener"); },
  basedOn,
  focusFrame: (path) => { if (P.focus !== path) { P.focus = path; paint(); } },
  addFrame: openChecked, fileState, verify, goHome, removeFrame, sizeFrame, setTool, deselect, undo,
  removeNote: (id) => { P.notes = P.notes.filter((n) => n.id !== id); save(); paint(); },
  noteChanged: () => { hold(); paintCard(); paintComments(); },
  recent: () => recentHtml(P.items),
  handle, visible: () => P.shown, lacking: lackNow, install,
  recipient, recipients: () => [...P.ok].sort(), pickRecipient, ensureAuthor,
  // ✕ closes the open design (its comments and edits stay drafts) and leads to the start dashboard
  close() {
    const path = P.focus || (P.frames[0] && P.frames[0].path);
    if (path) removeFrame(path, true);
    goHome();
  },
  // "Exit Hub Design": leave the view for the chat of the specialist the conversation was with
  exit() { location.hash = exitTarget(P.session, [...P.ok], P.back, ID); },
  toggleProps: () => { P.propsOpen = !P.propsOpen; P.propsUser = P.propsOpen; paint(); },
};

// remove a manual edit, a tweak or a drawing (× in the "Comments" tab): the view in the frame returns, what was written to the file rolls back to the copy
const dropEdit = {
  change: (c) => { tellFile(c.file, { t: "revert", sel: c.sel }); P.changes = P.changes.filter((q) => q !== c); scheduleWrite(c.file); },
  tweak: (t) => {
    P.tweaks = P.tweaks.filter((q) => q !== t);
    if (isBuiltin(t)) return tellFile(t.file, { t: "builtin", vals: builtinVals(t.file) });
    tellFile(t.file, { t: "tweaks", ops: opsFor(t.file, t.key) });
    scheduleWrite(t.file);
  },
  drawing: (d) => { P.drawings = P.drawings.filter((q) => q !== d); syncAll(); },
};
const delBtn = (fn) => button("hd-cx", "×", tr("del_edit"), () => { fn(); save(); paint(); });

// --- sending the batch -------------------------------------------------------------------------------------------
function markSent() {
  for (const p of draftPins()) p.state = "sent";
  for (const c of draftChanges()) c.state = "sent";
  for (const d of draftDrawings()) d.state = "sent";
  for (const t of draftTweaks()) t.state = "sent";
  for (const e of draftErrs()) e.state = "sent";
  P.errs = P.errs.filter((e) => e.state !== "draft");
  P.tweaks = P.tweaks.filter((t) => t.state !== "draft");
  for (const n of P.notes) if (n.state === "draft" && String(n.text || "").trim()) n.state = "sent";
  P.pins = P.pins.filter((p) => p.state !== "draft" || p.text.trim());   // empty pins are not needed
  P.notes = P.notes.filter((n) => n.state !== "draft" || String(n.text || "").trim());
  P.round += 1;
  renumber();
  save();
  syncAll();
  paint();
}
// "Send" in the comment window: one comment (the point and the element) goes to whoever works on the design
async function sendOne(pin) {
  if (P.busy) return;
  const to = authorOf(pin.file);
  if (!to) { P.note = tr("pick_to"); return paint(); }
  const text = message({ path: pin.file, round: P.round, views: views(), comments: [pin], changes: [] });
  if (!text) return;
  P.busy = true;
  paint();
  const r = await hub.post("/api/send", { session: to, text });
  P.busy = false;
  if (r.error) { P.note = tr("not_sent", { err: r.error }); return paint(); }
  P.note = "";
  pin.state = "sent";
  P.round += 1;
  P.pinned = null;
  renumber();
  save();
  syncAll();
  paint();
}
// manual edits, tweaks and drawings go by themselves to whoever is chosen at the bottom ("Who receives the edits"), AUTO_MS after the last edit;
// comments (pins, notes) and design errors — with their own button or together with the text from the input. A busy recipient — the message joins its queue
const autoItems = () => ({ changes: draftChanges().filter(hasEffect), tweaks: draftTweaks(), drawings: draftDrawings() });
const auto = createAuto({ fire: () => autoSend() });
async function autoSend() {
  if (P.busy) return auto.retry(1000);
  const sig = auto.sig();
  await Promise.all(P.frames.map((f) => flushWrite(f.path)));   // first into the file: the items go with the mark "already in the file"
  if (auto.sig() !== sig || home()) return;   // while we were writing the owner moved on — the countdown starts again
  const a = autoItems();
  const text = batchText({ comments: [], notes: [], errors: [], auto: true, ...a });
  if (!text || !P.session) return;
  P.busy = true;
  const r = await hub.post("/api/send", { session: P.session, text });
  P.busy = false;
  if (r.error) { auto.fail(); P.note = tr("not_sent", { err: r.error }); return paint(); }
  P.note = "";
  for (const x of [...a.changes, ...a.tweaks, ...a.drawings]) { x.state = "sent"; if (x.inFile !== true) x.handed = true; }
  P.tweaks = P.tweaks.filter((t) => t.state !== "draft");
  P.round += 1;
  renumber();
  save();
  syncAll();
  paint();
}

// --- whom the conversation goes to: the design's specialist ------------------------------------------------------
// the design's recipient is whoever wrote the file: in the live feed, then in the session history (the feed gives only the tail), then whoever named it; nobody —
// the owner chooses (the list in the comment window), the "designer" is not silently substituted
const authorOf = (file) => recipient(file).session;
// "Design from this": a document (pdf, svg) on the canvas becomes the basis of a new design - the designer gets the words and the path
async function basedOn(path) {
  if (P.busy) return;
  const to = P.ok.has(DEFAULT_SESSION) ? DEFAULT_SESSION : P.session;   // a design is the designer's job
  if (!to) { P.note = tr("pick_to"); return paint(); }
  P.busy = true;
  paint();
  const r = await hub.post("/api/send", { session: to, text: withSave(withStyle(basedOnText(path))) });
  P.busy = false;
  P.note = r.error ? tr("not_sent", { err: r.error }) : "";
  if (!r.error && P.style) return attachStyle(null);
  paint();
}
// the start screen: a chat with the specialist of the chosen kind (preset) or chosen by hand, otherwise with the designer
const home = () => P.home || !P.frames.length;
function wanted() {
  if (home()) return P.homeWho || (P.preset && P.preset.to) || DEFAULT_SESSION;
  if (P.pinned && P.pinned.focus === P.focus) return P.session;   // chosen by hand — keep it while the same design is open
  P.pinned = null;
  return whoGets(P.focus && authorOf(P.focus), P.session, P.ok, DEFAULT_SESSION);   // the hub and its developer are not filled in on their own
}
// who wrote the file when the live feed has no record: page back through the session history (/api/history), first those who named the file and the designer
const looked = new Map();   // path → when we looked (once per 10 min)
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
// designs by the hub's session feeds: on page events. The snapshot has no feeds (the page of an open session takes its own) — when the feed revision
// of a session in the snapshot grows, we pull only the changed rows from the core (since); only what concerns HTML is kept. No timer
const tl = new Map();   // session → {rev, epoch, items}
let scanning = false;
function recompute() {
  const lines = Object.fromEntries([...tl].map(([k, v]) => [k, v.items]));
  const live = htmlAuthored(lines, (n) => !P.ok.has(n));
  const known = mergeAuthors(P.known, live).slice(0, KNOWN_MAX);
  if (JSON.stringify(known) !== JSON.stringify(P.known)) { P.known = known; saveKnown(); }
  P.authors = mergeAuthors(live, known.filter((a) => P.ok.has(a.session)));
  openFromSession();
  openNewDesign();
  verify([...P.frames.map((f) => f.path), ...P.authors.map((a) => a.path)], true);   // the feed changed — the file could be gone (rm, mv by the designer)
}
async function scanDesigns(snap) {
  P.ok = new Set((snap.sessions || []).filter((x) => x.kind !== "hub" && x.role !== "executor").map((x) => x.name));
  if (!P.shown) return;
  backfill();   // does not wait for the feed pass: a slow feed must not keep the history from being read
  if (scanning) return;
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
      } catch { /* below: we do not re-read until the feed changes again */ }
      tl.set(n, { items: [], ...cached, rev: revs[n] ?? 0, epoch: snap.epoch });   // a failure must not drive requests in a circle
    }
  };
  await Promise.all([worker(), worker(), worker()]);
  for (const n of [...tl.keys()]) if (!P.ok.has(n)) tl.delete(n);
  scanning = false;
  recompute();
  paint();
}
// designs deeper than the feed tail: page back through /api/history of every session, only what is new since the last pass (the seq we reached).
// In the background, a few requests at a time; at most once in 6 hours per page load
const HIST_EVERY = 6 * 3600 * 1000, HIST_PAGES = 60;
let backfilling = false;
async function backfill(force = false) {
  if (backfilling || !P.ok.size || (!force && Date.now() - P.histAt < HIST_EVERY)) return;
  backfilling = true;
  const found = [];
  const queue = [...P.ok];
  const seen = { ...P.histSeq };
  const worker = async () => {
    for (let n = queue.shift(); n; n = queue.shift()) {
      const since = P.histSeq[n] || 0;
      let before = 1e12, top = since, ok = true;
      for (let i = 0; i < HIST_PAGES; i++) {
        let r = null;
        try { r = await (await fetch(`/api/history?${new URLSearchParams({ session: n, before: String(before), n: "500" })}`)).json(); } catch { ok = false; break; }
        if (!r || !Array.isArray(r.items)) { ok = false; break; }
        const fresh = r.items.filter((it) => (it.seq || 0) > since);
        found.push(...htmlAuthored({ [n]: fresh }));
        top = Math.max(top, ...r.items.map((it) => it.seq || 0));
        if (!r.more || !r.items.length || fresh.length < r.items.length) break;
        before = r.items[0].seq;
      }
      if (ok) seen[n] = top;   // a failed session is read again from where it was
    }
  };
  await Promise.all([worker(), worker(), worker()]);
  backfilling = false;
  P.histSeq = seen;
  P.histAt = Date.now();
  P.known = mergeAuthors(P.known, found).slice(0, KNOWN_MAX);
  saveKnown();
  recompute();
  paint();
}
// the owner wrote when there were no designs: wait for the file the designer writes after sending, and open it
function openNewDesign() {
  const w = P.openNew;
  if (!w) return;
  if (Date.now() / 1000 - w.ts > 900) { P.openNew = null; return; }
  const f = P.authors.find((a) => a.session === w.session && a.wrote && a.ts >= w.ts - 1);
  if (!f) return;
  P.openNew = null;
  addFrame(f.path, true, true);
}

// --- the conversation feed ---------------------------------------------------------------------------------------
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
  } catch { /* the next snapshot will retry */ }
  P.loading = false;
  paint();
}

// --- the view ----------------------------------------------------------------------------------------------------
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

  // the left panel: title, tabs, conversation or comments, input card
  const left = el("div", "hd-left");
  const top = el("div", "hd-top");
  const logo = el("span", "hd-logo"); logo.innerHTML = ICONS.logo;
  const title = el("span", "hd-title", "Hub Design");
  const homeBtn = button("hd-home", [logo, title], tr("home_title"), goHome);
  top.append(homeBtn);
  const tabs = el("div", "hd-tabs");
  const tabChat = button("hd-tab", tr("tab_chat"), null, () => { P.tab = "chat"; paint(); });
  const tabComments = button("hd-tab", tr("tab_comments"), null, () => { P.tab = "comments"; paint(); });
  const tabPlus = button("hd-plus", [icon("file", tr("add_design"))], tr("add_html"), () => ui.cv.openAdd());
  tabs.append(tabChat, tabComments, tabPlus);
  const chat = el("div", "hd-chat");
  const list = el("div", "hd-comments");
  const card = el("div", "hd-card");
  const need = createNeed({ hub, install }, "chat");   // no recipient in the hub — not silently into the void: the same banner
  const chips = el("div", "hd-chips");
  const input = hub.input({
    to: P.session, key: ID, placeholder: tr("placeholder"),
    prefix: (text) => { if (home()) return withStyle(withSave(newDesignPrefix() + text)); const b = withStyle(batchText({ style: P.style ? P.style.path : "" }) || selText()); return b ? b + "\n\n" + text : text; },
    onSent: () => {
      if (P.style) attachStyle(null);
      if (home()) P.openNew = { session: P.session, ts: Date.now() / 1000 };   // on the start screen they wrote — this is a task for a new design
      else if (drafts() > 0) markSent();
    },
  });
  const strip = el("div", "strip-host");
  strip.hidden = true;
  const foot = el("div", "hd-foot");
  const st = createStyles({ hub, base: origin, get: () => P.style, set: (x) => attachStyle(x), onChange: () => paint() });
  const who = el("select", "hd-who");
  who.title = tr("who_title");
  who.addEventListener("change", () => {
    if (home()) P.homeWho = who.value; else P.pinned = { focus: P.focus };
    setSession(who.value);
    paint();
  });
  const note = el("div", "hd-note");
  const styleBtn = button("hd-style", [icon("palette"), el("span", "hd-style-t", ts("btn"))], ts("btn_title"), () => st.open());
  styleBtn.hidden = true;
  foot.append(icon("gear"), who, styleBtn);
  card.append(need.node, chips, strip, input.node, foot, note);
  left.append(top, tabs, chat, list, card);

  // the right part: the canvas with floating toolbars, the styles panel and the file list while the canvas is empty
  const right = el("div", "hd-right");
  const cv = createCanvas(app);
  const props = el("div", "hd-props");
  const tw = el("div", "hd-tw"), pbody = el("div", "hd-pbody");
  props.append(tw, pbody);
  const dash = createDashboard({
    hub, alive: () => P.alive === true, fileUrl: (path) => app.fileUrl(abs(path), { raw: true }), dirs: dirsNow, files: () => dashboardFiles(P.authors, [...P.frames.map((f) => f.path), ...Object.keys(P.opened)], (hub.snapshot()?.sessions || []).map((x) => x.cwd), { who: (path) => recipient(path).session, time: (path) => P.times[abs(path)] || 0 }),
    fileState, mine: () => new Set(P.frames.map((f) => f.path)), open: (path) => openChecked(path, true, true), openPath: (path) => openChecked(path, true, true),
    preset: (p) => startPreset(p), lacking: lackNow, install,
  });
  const exitB = button("hd-exit", tr("exit"), tr("exit_title", { name: P.session }), () => app.exit());
  right.append(cv.node, props, dash.node, st.node, exitB);

  wrap.append(left, right);
  root.replaceChildren(wrap);
  return { root, wrap, right, exitB, title, homeBtn, tabChat, tabComments, tabPlus, chat, list, need, chips, strip, input, who, note, st, styleBtn, cv, props, tw, pbody, dash, last: { lang: currentLang() } };
}

function render(root, snap) {
  if (!ui || ui.root !== root) { ui = build(root); load(); fromAddress(); ping(); }
  ui.snap = snap;
  pullChat(snap);
  paint();
}

const baseName = (p) => p.split(/[\\/]/).pop();

// the hub language changed: texts of the nodes that live between paints are set again, the cached paints are dropped (the frames learn the language with the theme)
function relang() {
  ui.last = { lang: currentLang(), authors: ui.last.authors, who: ui.last.who };
  ui.homeBtn.title = tr("home_title");
  ui.tabChat.textContent = tr("tab_chat");
  ui.tabPlus.replaceChildren(icon("file", tr("add_design")));
  ui.tabPlus.title = tr("add_html");
  ui.who.title = tr("who_title");
  ui.styleBtn.title = ts("btn_title");
  ui.styleBtn.querySelector(".hd-style-t").textContent = ts("btn");
  ui.st.repaint();
  ui.input.set({ placeholder: tr("placeholder") });
}

function paint() {
  if (!ui) return;
  const snap = ui.snap || hub.snapshot() || {};
  scanDesigns(snap);
  setSession(wanted());
  if (P.focus && P.shown) ensureAuthor(P.focus);
  if (ui.last.lang !== currentLang()) relang();
  const th = theme();
  const sig = JSON.stringify(th) + "#" + currentLang();
  if (ui.last.theme !== sig) { ui.last.theme = sig; tellAll({ t: "theme", theme: th, lang: currentLang() }); }
  ui.title.textContent = P.focus && !home() ? nameOf(P.focus) || "Hub Design" : "Hub Design";
  ui.tabChat.classList.toggle("on", P.tab === "chat");
  ui.tabComments.classList.toggle("on", P.tab === "comments");
  const live = P.pins.filter((p) => p.state !== "done" && String(p.text || "").trim()).length + P.changes.filter((c) => c.state !== "done" && hasEffect(c)).length +
    P.drawings.filter((d) => d.state !== "done").length + P.notes.filter((n) => String(n.text || "").trim()).length;
  ui.tabChat.textContent = tr("tab_chat");
  ui.tabComments.textContent = live ? tr("tab_comments_n", { n: live }) : tr("tab_comments");
  ui.chat.hidden = P.tab !== "chat";
  ui.list.hidden = P.tab !== "comments";
  ui.note.textContent = P.note;
  ui.note.hidden = !P.note;
  ui.cv.paint();
  ui.need.paint(lackNow().filter((n) => n.name === P.session && !(home() && n.need === "required")));   // on the start screen the dashboard shows the required one itself
  ui.dash.node.hidden = !home();
  if (home()) ui.dash.paint();

  // to whom: the hub's agents and sessions, the designer first
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

// a preset stub that the owner did not touch does not move to the design chat and does not stick to a new task
function dropStub() {
  const ta = ui && ui.input.node.querySelector("textarea");
  if (ta && isStub(ta.value)) { ta.value = ""; ta.dispatchEvent(new Event("input", { bubbles: true })); }
}

// a preset on the start screen: the chat goes to the specialist of the kind, the input gets the stub "new <kind>: …", the cursor in the input
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

// the queue of messages to the recipient — like the strip above the input in the hub chat: "Send now" (if busy) and "Remove"; "Remove" not at once:
// 6 seconds a row "Removed from the queue · Undo", the real cancel goes later (the same in the hub's own queue)
const cancels = createCancels({
  post: (url, body) => hub.post(url, body),
  isQueued: (id) => ((hub.snapshot() || {}).messages || {})[id]?.state === "queued",
  onChange: () => { if (ui) { ui.last.queue = ""; paintQueue(ui.snap || hub.snapshot() || {}); } },
});
function paintQueue(snap) {
  const s = (snap.sessions || []).find((x) => x.name === P.session) || {};
  const msgs = snap.messages || {};
  const queued = P.items.filter((it) => it.kind === "in" && (msgs[it.id] || {}).state === "queued");
  for (const [id, e] of cancels.rows) if ((e.done || e.failed) && !queued.some((it) => it.id === id)) cancels.rows.delete(id);   // it left the queue — the row is not needed
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
      row.append(el("span", "k", tr(gone.failed ? "q_failed" : "q_removed")), el("span", "t", clip(it.text, 70)));
      if (gone.failed) row.append(act(tr("q_retry"), "quiet", () => cancels.send(it.id)));
      else if (!gone.done) row.append(act(tr("q_undo"), "quiet", () => cancels.undo(it.id)));
      box.append(row);
      return;
    }
    if (i === 0) row.append(el("span", "k", tr("q_n", { n: queued.length })));
    row.append(el("span", "t", clip(it.text, 90)));
    if (s.state === "busy" && m.injectable) row.append(act(tr("q_now"), "", () => hub.post("/api/inject", { session: P.session, id: it.id })));
    if (m.removable !== false) row.append(act(tr("q_remove"), "quiet", () => cancels.start(P.session, it)));
    box.append(row);
  });
  ui.strip.replaceChildren(box);
}

// the styles panel on the right: fill and text color, the other properties of the selected element
function paintProps() {
  const open = P.propsOpen && P.frames.length > 0 && !home();
  ui.props.hidden = !open;
  ui.right.classList.toggle("props", open);
  ui.exitB.title = tr("exit_title", { name: P.session });
  paintTweaks(open);
  const sig = JSON.stringify([open, P.sel]);
  if (!open || ui.last.props === sig || ui.pbody.contains(document.activeElement) && ui.last.propsSel === (P.sel && P.sel.sel)) return;
  ui.last.props = sig;
  ui.last.propsSel = P.sel && P.sel.sel;
  const el = hub.el;
  const kids = [];
  if (!P.sel) kids.push(el("div", "hd-phint", tr("props_hint")));
  else {
    kids.push(el("div", "hd-pel", `${P.sel.tag}  ${P.sel.label ? "«" + P.sel.label.slice(0, 40) + "»" : ""}`));
    const colors = el("div", "hd-psec");
    colors.append(el("h4", null, tr("colors")), colorRow(tr("fill"), "background-color"), colorRow(tr("text"), "color"));
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
      sec.append(el("h4", null, tr("layout")));
      const r = el("div", "hd-prow");
      r.append(button("btn small quiet", tr("to_flex"), tr("flex_title"), () => wrapIn("flex")), button("btn small quiet", tr("to_grid"), tr("grid_title"), () => wrapIn("grid")));
      sec.append(r);
      kids.push(sec);
    }
  }
  ui.pbody.replaceChildren(...kids);
}
// --- tweaks of the design ----------------------------------------------------------------------------------------
// design errors: the live list (agent.js sends it from the load and as they appear) and what of it is already in the batch (P.errs)
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

// on load agent.js sends the design's #hub-tweaks declaration and the current values; parsing — lib.normTweaks. The values live in P.tweaks
// (draft → sent) and are applied again after a frame reload
function readTweaks(file, ep, decl) {
  const list = decl ? withProbe(normTweaks(decl.spec), decl.probe) : [];
  if (BUILTINS.some((b) => builtinNow(file, b.key))) tellEp(ep, { t: "builtin", vals: builtinVals(file) });
  if (!list.length) { specs.delete(file); P.tweaks = P.tweaks.filter((t) => t.file !== file || isBuiltin(t)); return paint(); }
  specs.set(file, { list, base: Object.fromEntries(list.map((t) => [t.key, tweakBase(t, (decl.cur || {})[t.key])])) });
  P.tweaks = P.tweaks.filter((t) => t.file !== file || isBuiltin(t) || list.some((x) => x.key === t.key));
  const ops = list.filter((t) => P.tweaks.some((x) => x.file === file && x.key === t.key && x.state !== "done")).flatMap((t) => opsFor(file, t.key));
  if (ops.length) tellEp(ep, { t: "tweaks", ops });
  if (!ep.tweaked) { ep.tweaked = true; if (P.propsUser) P.propsOpen = true; }
  paint();
}
const tweakNow = (file, t) => {
  const mine = P.tweaks.find((x) => x.file === file && x.key === t.key && x.state === "draft") || P.tweaks.find((x) => x.file === file && x.key === t.key && x.state === "sent");
  return mine ? mine.to : (specs.get(file).base || {})[t.key];
};
// what to write into the design so that a tweak shows its current value (after a draft rollback — the original)
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
// built-in tweaks: a shift from the design (0 = as is) kept as ordinary batch records with the key hd:<id>; they only go to the author in words
const builtinNow = (file, key) => {
  const mine = P.tweaks.find((x) => x.file === file && x.key === key && x.state === "draft") || P.tweaks.find((x) => x.file === file && x.key === key && x.state === "sent");
  return mine ? mine.to : 0;
};
const builtinVals = (file) => Object.fromEntries(BUILTINS.map((b) => [b.id, builtinNow(file, b.key)]));
function setBuiltin(file, b, raw) {
  const value = builtinValue(b, raw);
  if (value == null) return false;
  let e = P.tweaks.find((x) => x.file === file && x.key === b.key && x.state === "draft");
  if (!e) {
    const sent = P.tweaks.find((x) => x.file === file && x.key === b.key && x.state === "sent");
    e = { file, key: b.key, label: tr(b.str), editor: "builtin", unit: "", from: sent ? sent.to : 0, to: value, state: "draft" };
    P.tweaks.push(e);
  }
  e.to = value;
  if (!tweakEffect(e)) P.tweaks = P.tweaks.filter((x) => x !== e);
  tellFile(file, { t: "builtin", vals: builtinVals(file) });
  save();
  paint();
  return true;
}
// the open design's tweaks - in sections at the top of the panel; while input is going on in the panel (a slider), it is not rebuilt
function tweakFile() {
  const has = (f) => f && (specs.get(f)?.list || []).length;
  return has(P.focus) ? P.focus : (P.frames.find((f) => has(f.path)) || {}).path || (P.frames.some((f) => f.path === P.focus) ? P.focus : (P.frames[0] || {}).path) || "";
}
function paintTweaks(open) {
  const file = open ? tweakFile() : "";
  const list = file && specs.get(file) ? specs.get(file).list : [];
  const skeleton = JSON.stringify([file, list.map((t) => t.key)]);
  const sig = JSON.stringify([skeleton, list.map((t) => tweakNow(file, t)), file && BUILTINS.map((b) => builtinNow(file, b.key))]);
  if (ui.last.tw === sig) return;
  if (ui.tw.contains(document.activeElement) && ui.last.twShape === skeleton) { ui.last.tw = sig; return; }
  ui.last.tw = sig;
  ui.last.twShape = skeleton;
  ui.tw.hidden = !file;
  const el = hub.el;
  const kids = [];
  let sec = null, secName = null;
  for (const t of list) {
    const name = t.section || tr("tweaks");
    if (name !== secName) { sec = el("div", "hd-psec"); sec.append(el("h4", null, name)); kids.push(sec); secName = name; }
    sec.append(tweakRow(file, t, tweakNow(file, t)));
  }
  if (file) {
    sec = el("div", "hd-psec");
    sec.append(el("h4", null, tr("bi_title")));
    for (const b of BUILTINS) sec.append(builtinRow(file, b));
    kids.push(sec);
  }
  ui.tw.replaceChildren(...kids);
}
// a built-in tweak: the name, three presets (less / as is / more) and a slider for fine moves; the value is on the right
function builtinRow(file, b) {
  const el = hub.el;
  const cur = builtinNow(file, b.key);
  const row = el("div", "hd-tweak hd-bi");
  const label = el("span", "hd-flabel", tr(b.str));
  const out = el("span", "hd-tout wide", builtinShow(b.id, cur));
  const seg = el("div", "hd-seg");
  const r = el("input"); r.type = "range"; Object.assign(r, { min: b.min, max: b.max, step: b.step, value: cur });
  r.setAttribute("aria-label", tr(b.str));
  const chips = b.presets.map((v) => button("hd-segb" + (v === cur ? " on" : ""), builtinShow(b.id, v), null, () => { if (setBuiltin(file, b, v)) show(v); }));
  seg.append(...chips);
  const show = (v) => { out.textContent = builtinShow(b.id, v); r.value = v; chips.forEach((c, i) => c.classList.toggle("on", b.presets[i] === Number(v))); };
  r.addEventListener("input", () => { if (setBuiltin(file, b, r.value)) show(builtinNow(file, b.key)); });
  row.append(label, out, seg, r);
  return row;
}
function tweakRow(file, t, cur) {
  const el = hub.el;
  const row = el("div", "hd-tweak " + t.editor);
  const label = el("span", "hd-flabel", t.label);
  label.title = t.key;
  const set = (v) => setTweak(file, t, v);
  const swatches = (colorOf) => {
    const sw = el("div", "hd-swatches");
    const mark = () => { for (const x of sw.children) x.classList.toggle("on", x.dataset.v === String(cur)); };
    for (const c of t.options) {
      const b = button("hd-swatch" + (c === cur ? " on" : ""), "", c, () => { if (set(c)) { cur = c; mark(); own.classList.remove("on"); } });
      b.dataset.v = c;
      b.style.background = colorOf(c);
      sw.append(b);
    }
    // the last swatch is the owner's own color: the native picker; the chosen color lives as the tweak value
    const own = el("label", "hd-swatch own" + (t.options.includes(cur) ? "" : " on"));
    own.title = tr("own_color");
    const pick = el("input"); pick.type = "color";
    pick.value = toHex(t.options.includes(cur) ? colorOf(cur) : cur) || "#808080";
    if (!t.options.includes(cur)) own.style.background = cur;
    pick.addEventListener("input", () => { if (set(pick.value)) { cur = pick.value; own.style.background = pick.value; own.classList.add("on"); for (const x of sw.children) if (x !== own) x.classList.remove("on"); } });
    own.append(pick);
    if (ownColor(t)) sw.append(own);
    return sw;
  };
  if (t.editor === "color") {
    row.append(label, swatches((c) => c));
  } else if (t.editor === "enum" && t.swatch) {
    row.append(label, swatches((c) => t.swatch[c]));
  } else if (t.editor === "enum") {
    if (t.options.length <= 3) {
      const seg = el("div", "hd-seg");
      for (const o of t.options) seg.append(button("hd-segb" + (o === cur ? " on" : ""), o, o, () => { if (set(o)) for (const x of seg.children) x.classList.toggle("on", x.textContent === o); }));
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
    box.setAttribute("aria-label", label.textContent);
    box.addEventListener("change", () => set(box.checked));
    row.append(label, box);
  } else if (t.editor === "range" || t.editor === "int" || t.editor === "float") {
    const out = el("span", "hd-tout", `${cur}${t.unit || ""}`);
    const r = el("input"); r.type = "range"; Object.assign(r, { min: t.min, max: t.max, step: t.step, value: cur });
    r.setAttribute("aria-label", label.textContent);
    r.addEventListener("input", () => { if (set(r.value)) out.textContent = `${r.value}${t.unit || ""}`; });
    row.append(label, r, out);
  } else {
    const f = el("label", "hd-field wide");
    const input = el("input"); input.value = cur;
    input.setAttribute("aria-label", label.textContent);
    input.addEventListener("keydown", (e) => { e.stopPropagation(); if (e.key === "Enter") input.blur(); });
    input.addEventListener("change", () => set(input.value));
    f.append(input);
    row.append(label, f);
  }
  return row;
}
const setStyle = (prop, value) => { if (P.sel) tellFile(P.sel.file, { t: "style", prop, value }); };
// "Wrap in flex / grid": makes the selected block a container (display), its children are laid out; for grid — two columns at once
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
  pick.title = tr("own_color");
  pick.value = /^#[0-9a-f]{6}$/i.test(cur) ? cur : "#000000";
  pick.addEventListener("change", () => setStyle(prop, pick.value));
  row.append(sw, pick);
  return row;
}
function field(f) {
  const el = hub.el;
  const wrap = el("label", "hd-field" + (f.wide ? " wide" : ""));
  wrap.append(el("span", "hd-flabel", f.label));
  wrap.title = `${f.label}: ${f.p}`;   // short labels (P, B, Weight) - the full CSS property on hover
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

// the input card: comment chips (pins, notes, design errors) and the field; manual edits are not shown above the field — they are in the "Comments" tab
function paintCard() {
  const n = drafts();
  auto.watch(autoSig(autoItems(), P.session, home()));
  const items = [
    ...draftPins().map((p) => ({ text: p.text, ic: "comment", del: () => { P.pins = P.pins.filter((q) => q !== p); renumber(); syncAll(); } })),
    ...P.notes.filter((d) => d.state === "draft" && String(d.text || "").trim()).map((d) => ({ text: tr("note_chip", { text: d.text }), ic: "note", del: () => { P.notes = P.notes.filter((q) => q !== d); } })),
    ...draftErrs().map((e) => ({ text: tr("design_errors", { n: normErrors(e.items).length }), ic: "edit", del: () => { P.errs = P.errs.filter((q) => q !== e); } })),
    ...(P.style ? [{ text: ts("chip", { name: P.style.name }), ic: "palette", del: () => { P.style = null; try { localStorage.setItem(STORE + "style", "null"); } catch { /* ignore */ } } }] : []),
  ];
  ui.styleBtn.hidden = !ui.st.avail();
  const sig = JSON.stringify([n, items.map((i) => i.text), P.busy]);
  if (ui.last.card === sig) return;
  ui.last.card = sig;
  const el = hub.el;
  ui.chips.hidden = !items.length;
  ui.chips.replaceChildren(...items.map((i) => {
    const chip = el("span", "hd-chip");
    chip.title = i.text;
    chip.append(icon(i.ic), el("span", "hd-ctext", i.text));
    chip.append(button("hd-cx", "×", tr("remove"), () => { i.del(); save(); paint(); }));
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
    li.append(el("b", "hd-n" + (p.area ? " rgn" : ""), String(p.n)), el("span", "hd-ct", (p.lost ? tr("lost_prefix") : "") + p.text));
    if (p.area) li.append(el("span", "hd-dim", `${Math.round(p.area.w)}×${Math.round(p.area.h)}`));
    li.title = p.lost ? tr("lost_title") : p.area ? tr("area_title", { x: Math.round(p.x), y: Math.round(p.y), w: Math.round(p.area.w), h: Math.round(p.area.h) }) : p.sel;
    rows.push(li);
  }
  for (const c of changes) {
    const li = el("div", "hd-citem " + c.state);
    li.append(el("b", "hd-n edit", "✎"), el("span", "hd-ct", `${c.label || c.sel}: ${describeChange(c)}`));
    if (c.inFile) li.append(el("span", "hd-infile", tr("in_file")));
    li.append(delBtn(() => dropEdit.change(c)));
    li.title = c.noWrite ? tr("not_written", { sel: c.sel, why: c.noWrite }) : c.sel;
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
    if (t.inFile) li.append(el("span", "hd-infile", tr("in_file")));
    li.append(delBtn(() => dropEdit.tweak(t)));
    rows.push(li);
  }
  for (const e of errs) {
    const li = el("div", "hd-citem " + e.state);
    li.append(el("b", "hd-n edit", "⚠"), el("span", "hd-ct", tr("design_errors", { n: normErrors(e.items).length })));
    li.title = normErrors(e.items).map((x) => x.text).join("\n");
    rows.push(li);
  }
  for (const n of notes) {
    const li = el("div", "hd-citem " + n.state);
    li.append(el("b", "hd-n edit", "▤"), el("span", "hd-ct", n.text));
    rows.push(li);
  }
  ui.list.replaceChildren(...(rows.length ? rows : [el("div", "hd-hint", tr("no_comments"))]));
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
    if (l.image) {   // a sent picture — a reduced copy (?w=), opens in full on click
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
    // paths to HTML are links: add a frame to the canvas
    let rest = text;
    for (const p of htmlPaths(text)) {
      const at = rest.indexOf(p);
      if (at < 0) continue;
      body.append(document.createTextNode(rest.slice(0, at)));
      body.append(button("hd-link", baseName(p), tr("show_on_canvas", { path: p }), () => openChecked(p)));
      rest = rest.slice(at + p.length);
    }
    body.append(document.createTextNode(rest));
    row.append(body);
    return row;
  }));
  if (!lines.length) ui.chat.append(el("div", "hd-hint", tr("no_talk", { name: P.session })));
  if (stick) ui.chat.scrollTop = ui.chat.scrollHeight;
}
