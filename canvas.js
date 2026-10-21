// Hub Design: the "Canvas" mode - an infinite canvas with frames (artboards) side by side, a floating toolbar, zoom to the cursor, pan,
// notes and comment pins. Edits inside the frames are made by agent.js and the batch is collected by main.js - the canvas only shows
// the frames, catches gestures and passes the tool on. The pure view math is in lib.js (tests: tests/lib.test.mjs).
import { CANVAS_ICONS as I } from "./icons.js";
import { FRAME_TOP, GRIDS_MAX, GRID_KINDS, GRID_LIMITS, LABEL_GAP, LABEL_H, SIZES, fitView, frameTitle, goneText, gridRects, gridTitle, isGone, nameOf, newGrid, normGrid, normGrids, zoomAt } from "./lib.js";
import { makeT } from "./i18n.js";

// UI strings: en by default, ru when the hub language is Russian (see i18n.js); resolved at use time, never at load
export const STR = {
  en: {
    shape_free: "Pencil", shape_arrow: "Arrow", shape_rect: "Rectangle", shape_oval: "Oval",
    err_one: "Error in the design", err_many: "Errors in the design: {n}",
    err_draft: "Added to edits", err_sent: "Sent to the designer", err_ask: "Ask to fix",
    err_title: "Add the errors to the batch of edits",
    frame_menu: "Size, reload, remove", dl_html: "Download HTML", pdf: "Download PDF", pdf_busy: "Preparing PDF…", play: "Play",
    to_dash: "To the dashboard", to_dash_title: "Back to the list of designs", remove_canvas: "Remove from canvas",
    note_remove: "Remove note", note_ph: "A note to the designer…",
    design_size: "Design size", window_width: "Window width", grids_over: "Grids over the frame…", reload: "Reload", show_large: "Show large",
    g_color: "Color", g_count: "Count", g_gap: "Gap", g_margin: "Margin", g_remove: "Remove grid", g_add: "+ Add a grid",
    g_show: "Show on the canvas", g_head: "Grids · {name}", g_none: "No grids yet",
    page1: "Page 1", no_frames: "No frames yet", canvas_frames: "Canvas frames",
    fit_all: "Fit all", zoom_in: "Zoom in", zoom_out: "Zoom out",
    path_ph: "HTML path: /…/index.html", add_frame: "Add a frame", recent_html: "Recent HTML of the session",
    ed_who: "Who gets the comment", ed_pick: "Choose a recipient",
    how_wrote: "Wrote this design", how_picked: "Picked by you", how_sent: "Sent this design (the author was not found)", how_named: "Named this file (the author was not found)", how_none: "Who made the design is unknown",
    ed_head: "Comment", ed_ph: "What to change here?", ed_close: "Close", ed_delete: "Delete", ed_send: "Send",
    tool_select: "Select (V)", tool_hand: "Hand (H)", tool_text: "Text (T)", tool_frame: "Add a frame (F)", tool_note: "Note (N)", tool_comment: "Comment (C)",
    tool_pencil: "Pencil (P)", tool_shape: "Shapes (R)", tool_more: "More: pencil and shapes",
    play_top: "Show the selected frame full screen", panel: "Style panel", zoom: "Zoom", close_design: "Close the design — to the start screen",
  },
  ru: {
    shape_free: "Карандаш", shape_arrow: "Стрелка", shape_rect: "Прямоугольник", shape_oval: "Овал",
    err_one: "Ошибка в макете", err_many: "Ошибок в макете: {n}",
    err_draft: "Добавлено в правки", err_sent: "Отправлено дизайнеру", err_ask: "Попросить исправить",
    err_title: "Добавить ошибки в пачку правок",
    frame_menu: "Размер, перезагрузка, убрать", dl_html: "Скачать HTML", pdf: "Скачать PDF", pdf_busy: "Готовлю PDF…", play: "Смотреть",
    to_dash: "К дашборду", to_dash_title: "Вернуться к списку макетов", remove_canvas: "Убрать с холста",
    note_remove: "Убрать заметку", note_ph: "Заметка дизайнеру…",
    design_size: "Размер макета", window_width: "Ширина окна", grids_over: "Сетки поверх рамки…", reload: "Перезагрузить", show_large: "Показать крупно",
    g_color: "Цвет", g_count: "Число", g_gap: "Зазор", g_margin: "Поле", g_remove: "Убрать сетку", g_add: "+ Добавить сетку",
    g_show: "Показывать на холсте", g_head: "Сетки · {name}", g_none: "Сеток пока нет",
    page1: "Страница 1", no_frames: "Фреймов пока нет", canvas_frames: "Фреймы холста",
    fit_all: "Вписать всё", zoom_in: "Приблизить", zoom_out: "Отдалить",
    path_ph: "Путь к HTML: /…/index.html", add_frame: "Добавить фрейм", recent_html: "Последние HTML сессии",
    ed_who: "Кому уйдёт комментарий", ed_pick: "Выберите получателя",
    how_wrote: "Писал этот макет", how_picked: "Выбран вами", how_sent: "Прислал этот макет (писавшего не нашли)", how_named: "Называл этот файл (писавшего не нашли)", how_none: "Кто делал макет, неизвестно",
    ed_head: "Комментарий", ed_ph: "Что поменять здесь?", ed_close: "Закрыть", ed_delete: "Удалить", ed_send: "Отправить",
    tool_select: "Выбрать (V)", tool_hand: "Рука (H)", tool_text: "Текст (T)", tool_frame: "Добавить фрейм (F)", tool_note: "Заметка (N)", tool_comment: "Комментарий (C)",
    tool_pencil: "Карандаш (P)", tool_shape: "Фигуры (R)", tool_more: "Ещё: карандаш и фигуры",
    play_top: "Показать выбранный фрейм во весь экран", panel: "Панель стилей", zoom: "Масштаб", close_design: "Закрыть макет — на стартовый экран",
  },
};
const t = makeT(STR);

const FRAME_SIZES = SIZES.filter((s) => s.w);
const ZOOM_STEPS = [0.1, 0.25, 0.5, 1, 2];
const TOOL_KEYS = { v: "select", h: "hand", t: "text", n: "note", c: "comment", p: "pencil", r: "shape" };
const BAR_GAP = 12;
const SHAPES = { pencil: [["free", "free"], ["arrow", "arrow"]], shape: [["rect", "rect"], ["oval", "oval"]] };   // [id, icon]; the name is t("shape_<id>")

export function createCanvas(app) {
  const { hub, P } = app;
  const el = hub.el;
  const svg = (name, extra) => { const s = el("span", "hdc-i" + (extra ? " " + extra : "")); s.innerHTML = I[name]; return s; };
  const btn = (cls, kids, title, onClick) => {
    const b = el("button", cls);
    b.type = "button";
    b.append(...[].concat(kids));
    if (title) b.title = title;
    if (onClick) b.addEventListener("click", (e) => { e.stopPropagation(); onClick(e); });
    return b;
  };

  // texts of nodes that live between paints (titles, placeholders): set by bind() and set again on every paint, so they follow the hub language.
  // owner "f:<path>" / "n:<id>" - dropped together with the frame / the note
  const bound = [];
  const alive = (o) => !o || (o.startsWith("f:") ? fr.has(o.slice(2)) : o.startsWith("n:") ? notes.has(o.slice(2)) : true);
  const bind = (owner, node, key, prop = "title") => { bound.push([owner, node, key, prop]); node[prop] = t(key); return node; };
  const relabel = () => {
    for (let i = bound.length - 1; i >= 0; i--) {
      const [o, n, k, prop] = bound[i];
      if (alive(o)) n[prop] = t(k); else bound.splice(i, 1);
    }
  };

  const root = el("div", "hdc");
  const stage = el("div", "hdc-stage");
  const world = el("div", "hdc-world");
  const labels = el("div", "hdc-labels");
  const empty = el("div", "hdc-empty");
  stage.append(world, labels, empty);
  const bar = el("div", "hdc-card hdc-bar");
  const top = el("div", "hdc-card hdc-top");
  const pop = el("div", "hdc-pop");
  const xIsland = el("div", "hdc-card hdc-x");   // ✕ - a separate island: close the open design
  root.append(stage, bar, top, xIsland, pop);
  pop.hidden = true;

  const view = P.cv;
  const fr = new Map();   // path → {box, iframe, label, title, ep}
  const notes = new Map();
  let space = false, gesture = null, editor = null, menu = null, saveT = 0;

  // --- view: converting between screen and scene -----------------------------------------------------------------------
  const size = () => ({ W: stage.clientWidth, H: stage.clientHeight });
  function setView(v, user = true) {
    Object.assign(view, v);
    if (user) view.auto = false;
    apply();
    clearTimeout(saveT);
    saveT = setTimeout(() => app.saveView(), 300);
  }
  function apply() {
    world.style.transform = `translate(${view.x}px,${view.y}px) scale(${view.k})`;
    world.style.setProperty("--k", view.k);
    world.style.setProperty("--inv", 1 / view.k);
    placeLabels();
    placeEditor();
    pushScale();
    zoomText.textContent = Math.round(view.k * 100) + "%";
  }
  let scaleQ = 0;
  function pushScale(ep) {
    if (ep) return app.tellEp(ep, { t: "scale", k: view.k });
    if (scaleQ) return;
    scaleQ = requestAnimationFrame(() => { scaleQ = 0; app.tellCanvas({ t: "scale", k: view.k }); });
  }
  function fit() {
    const { W, H } = size();
    if (W < 10) return;
    setView(fitView(P.frames, W, H), false);
  }
  const toScene = (e) => { const r = stage.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };
  const toWorld = (p) => ({ x: (p.x - view.x) / view.k, y: (p.y - view.y) / view.k });

  function wheel(sx, sy, dx, dy, ctrl) {
    if (!ctrl && Math.abs(dx) > Math.abs(dy) * 1.2) return setView({ x: view.x - dx }); // a horizontal gesture is a pan
    setView(zoomAt(view, Math.exp(-dy * (ctrl ? 0.012 : 0.0016)), sx, sy));
  }
  stage.addEventListener("wheel", (e) => {
    e.preventDefault();
    const p = toScene(e);
    wheel(p.x, p.y, e.deltaX, e.deltaY, e.ctrlKey || e.metaKey);
  }, { passive: false });

  // a wheel event from a frame (agent.js): coordinates in the frame window -> in the scene
  function frameWheel(ep, m) {
    const r = ep.iframe.getBoundingClientRect();
    const s = stage.getBoundingClientRect();
    const k = r.width / (ep.iframe.offsetWidth || 1);
    wheel(r.left + m.x * k - s.left, r.top + m.y * k - s.top, m.dx, m.dy, m.ctrl);
  }

  // --- gestures on the scene ---------------------------------------------------------------------------------------
  const capture = () => P.tool === "hand" || P.tool === "note" || space || !!gesture;
  function chrome() {
    root.dataset.tool = P.tool;
    root.dataset.capture = capture() ? "1" : "";
    root.dataset.grab = P.tool === "hand" || space ? (gesture && gesture.kind === "pan" ? "grabbing" : "grab") : "";
  }
  stage.addEventListener("pointerdown", (e) => {
    if (e.target.closest(".hdc-note, .hdc-label")) return;
    closeMenu();
    const pan = P.tool === "hand" || space || e.button === 1;
    if (pan) {
      e.preventDefault();
      stage.setPointerCapture(e.pointerId);
      gesture = { kind: "pan", sx: e.clientX, sy: e.clientY, vx: view.x, vy: view.y };
      return chrome();
    }
    if (P.tool === "note" && e.button === 0) {
      const w = toWorld(toScene(e));
      app.addNote(w.x - 90, w.y - 12);
      app.setTool("select");
      return;
    }
    if (e.target === stage || e.target === world || e.target === empty) { app.focusFrame(""); app.deselect(); }
  });
  stage.addEventListener("pointermove", (e) => {
    if (!gesture) return;
    if (gesture.kind === "pan") setView({ x: gesture.vx + e.clientX - gesture.sx, y: gesture.vy + e.clientY - gesture.sy });
    else if (gesture.kind === "frame") {
      const f = P.frames.find((q) => q.path === gesture.path);
      if (!f) return;
      gesture.moved = gesture.moved || Math.abs(e.clientX - gesture.sx) + Math.abs(e.clientY - gesture.sy) > 3;
      f.x = Math.round(gesture.fx + (e.clientX - gesture.sx) / view.k);
      f.y = Math.round(gesture.fy + (e.clientY - gesture.sy) / view.k);
      layoutFrame(f);
      placeLabels();
    } else if (gesture.kind === "note") {
      const n = P.notes.find((q) => q.id === gesture.id);
      if (!n) return;
      n.x = Math.round(gesture.fx + (e.clientX - gesture.sx) / view.k);
      n.y = Math.round(gesture.fy + (e.clientY - gesture.sy) / view.k);
      layoutNote(n);
    }
  });
  const endGesture = () => {
    if (!gesture) return;
    const g = gesture;
    gesture = null;
    chrome();
    if (g.kind === "frame" || g.kind === "note") app.save();
  };
  stage.addEventListener("pointerup", endGesture);
  stage.addEventListener("pointercancel", endGesture);

  // keys: space is the hand, letters are tools; from a frame they are forwarded by agent.js
  function key(k, down, mods = {}) {
    if (k === " ") { if (space !== down) { space = down; chrome(); } return true; }
    if (!down || mods.meta || mods.ctrl || mods.alt) {
      if (down && (mods.meta || mods.ctrl) && k.toLowerCase() === "z") { app.undo(!!mods.shift); return true; }
      if (down && (mods.meta || mods.ctrl) && (k === "=" || k === "+")) { setView(zoomAt(view, 1.25, size().W / 2, size().H / 2)); return true; }
      if (down && (mods.meta || mods.ctrl) && k === "-") { setView(zoomAt(view, 0.8, size().W / 2, size().H / 2)); return true; }
      return false;
    }
    if (k === "Escape") { closeMenu(); closeEditor(); app.setTool("select"); app.deselect(); return true; }
    if (k === "1" && mods.shift || k === "!") { fit(); return true; }
    if (k === "0") { setView(zoomAt(view, 1 / view.k, size().W / 2, size().H / 2)); return true; }
    if (k === "f") { openAdd(); return true; }
    const tool = TOOL_KEYS[k.toLowerCase()];
    if (tool) { app.setTool(tool); return true; }
    return false;
  }
  const typing = (t) => t && (/^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName) || t.isContentEditable);
  const onKey = (down) => (e) => {
    if (!app.visible() || typing(e.target)) return;
    if (key(e.key, down, { meta: e.metaKey, ctrl: e.ctrlKey, alt: e.altKey, shift: e.shiftKey })) e.preventDefault();
  };
  addEventListener("keydown", onKey(true));
  addEventListener("keyup", onKey(false));
  addEventListener("blur", () => { if (space) { space = false; chrome(); } });

  // --- frames --------------------------------------------------------------------------------------------------------
  function layoutFrame(f) {
    const n = fr.get(f.path);
    if (!n) return;
    Object.assign(n.box.style, { left: f.x + "px", top: f.y + "px", width: f.w + "px", height: f.h + "px" });
    paintGrids(f, n);
  }
  // grids over the frame: on the canvas only, above the design, the mouse passes through; one <path> per grid
  function paintGrids(f, n) {
    const grids = f.gridsOff ? [] : normGrids(f.grids);
    const sig = JSON.stringify([grids, f.w, f.h]);
    if (n.gridSig === sig) return;
    n.gridSig = sig;
    if (!grids.length) { if (n.grids) { n.grids.remove(); n.grids = null; } return; }
    if (!n.grids) { n.grids = el("div", "hdc-grids"); n.box.append(n.grids); }
    const f1 = (v) => Math.round(v * 100) / 100;
    n.grids.innerHTML = `<svg width="${f.w}" height="${f.h}" viewBox="0 0 ${f.w} ${f.h}" xmlns="http://www.w3.org/2000/svg">` +
      grids.map((g) => `<path fill="${g.color}" fill-opacity=".14" d="${gridRects(g, f.w, f.h).map(([x, y, w, h]) => `M${f1(x)} ${f1(y)}h${f1(w)}v${f1(h)}h${f1(-w)}z`).join("")}"/>`).join("") + "</svg>";
  }
  // design errors: a mark in the frame label and an "Ask to fix" button (puts them into the batch)
  function paintErrs() {
    for (const f of P.frames) {
      const n = fr.get(f.path);
      if (!n) continue;
      const s = app.errState(f.path);
      n.err.hidden = !s;
      if (!s) continue;
      const word = s.n === 1 ? t("err_one") : t("err_many", { n: s.n });
      const act = s.state === "draft" ? t("err_draft") : s.state === "sent" ? t("err_sent") : t("err_ask");
      n.err.textContent = `⚠ ${word} · ${act}`;
      n.err.disabled = !!s.state;
      n.err.title = s.state ? "" : t("err_title");
    }
  }
  function placeLabels() {
    for (const f of P.frames) {
      const n = fr.get(f.path);
      if (!n) continue;
      Object.assign(n.label.style, { left: view.x + f.x * view.k + "px", top: view.y + f.y * view.k - LABEL_H - LABEL_GAP + "px", width: Math.max(176, f.w * view.k) + "px" });
      Object.assign(n.gone.style, { left: view.x + f.x * view.k + "px", top: view.y + f.y * view.k + "px", width: f.w * view.k + "px", height: f.h * view.k + "px" });
    }
  }
  function makeFrame(f) {
    const box = el("div", "hdc-frame");
    box.dataset.path = f.path;
    const iframe = el("iframe", "hdc-iframe");
    iframe.setAttribute("title", nameOf(f.path));
    const ep = { id: "f:" + f.path, path: f.path, iframe, external: true, ready: false };
    iframe.addEventListener("load", () => app.hello(ep));
    box.append(iframe);
    world.append(box);

    const label = el("div", "hdc-label");
    label.dataset.path = f.path;
    const title = el("span", "hdc-ltitle", nameOf(f.path));
    title.title = f.path;
    const own = "f:" + f.path;
    const tweak = bind(own, btn("hdc-lb", svg("sliders"), "", (e) => frameMenu(f.path, e.currentTarget)), "frame_menu");
    const dl = bind(own, btn("hdc-lb", svg("download"), "", () => {
      const a = el("a");
      a.href = app.fileUrl(f.path, { raw: 1, dl: 1 });
      a.download = frameTitle(f.path);
      document.body.append(a); a.click(); a.remove();
    }), "dl_html");
    const pdf = bind(own, btn("hdc-lb", svg("pdf"), "", async () => {
      if (pdf.disabled) return;
      pdf.disabled = true;
      pdf.title = t("pdf_busy");
      try { await app.pdf(f.path); } finally { pdf.disabled = false; pdf.title = t("pdf"); }
    }), "pdf");
    const play = bind(own, btn("hdc-lb", svg("play12"), "", () => app.play(f.path)), "play");
    const err = btn("hdc-err", "", "", () => app.askFix(f.path));
    err.hidden = true;
    label.append(title, err, tweak, dl, pdf, play);
    label.addEventListener("pointerdown", (e) => {
      if (e.target.closest("button") || e.button !== 0) return;
      e.preventDefault();
      label.setPointerCapture(e.pointerId);
      app.focusFrame(f.path);
      const cur = P.frames.find((q) => q.path === f.path);
      gesture = { kind: "frame", path: f.path, sx: e.clientX, sy: e.clientY, fx: cur.x, fy: cur.y };
      chrome();
    });
    label.addEventListener("pointermove", (e) => stage.dispatchEvent(new PointerEvent("pointermove", e)));
    label.addEventListener("pointerup", (e) => { stage.dispatchEvent(new PointerEvent("pointerup", e)); });
    label.addEventListener("dblclick", (e) => { if (!e.target.closest("button")) focusOn(f.path); });
    labels.append(label);
    // the file is gone - instead of the raw server reply the frame shows a clear line and two ways out (0.5.1); drawn over the frame, in screen coordinates
    const gone = el("div", "hdc-gone");
    gone.hidden = true;
    const goneMsg = el("div", "hdc-gone-msg");
    const goneActs = el("div", "hdc-gone-acts");
    const toDash = btn("btn small", "", "", () => app.goHome());
    const rmFrame = btn("btn small quiet", "", null, () => app.removeFrame(f.path));
    bind(own, toDash, "to_dash", "textContent");
    bind(own, toDash, "to_dash_title");
    bind(own, rmFrame, "remove_canvas", "textContent");
    goneActs.append(toDash, rmFrame);
    gone.append(goneMsg, goneActs);
    gone.addEventListener("pointerdown", (e) => e.stopPropagation());
    labels.append(gone);
    const n = { box, iframe, label, title, err, ep, gone, goneMsg, shown: false };
    fr.set(f.path, n);
    app.register(ep);
    if (!isGone(app.fileState(f.path))) { iframe.src = app.fileUrl(f.path) + "&t=" + Date.now(); n.shown = true; }
    return n;
  }
  function dropFrame(path) {
    const n = fr.get(path);
    if (!n) return;
    app.unregister(n.ep.id);
    n.box.remove();
    n.label.remove();
    n.gone.remove();
    fr.delete(path);
  }
  function reloadFrame(path) {
    const n = fr.get(path);
    if (!n) return;
    app.verify([path], true);
    if (isGone(app.fileState(path))) return;
    n.ep.ready = false;
    n.iframe.src = app.fileUrl(path) + "&t=" + Date.now();
    n.shown = true;
  }
  // the file vanished or came back: dim the frame and show the reason; when it is back, load it again
  function showGone(f, n) {
    const state = app.fileState(f.path);
    const gone = isGone(state);
    n.gone.hidden = !gone;
    if (gone) {
      n.goneMsg.textContent = goneText(state, f.path);
      if (n.shown) { n.iframe.src = "about:blank"; n.ep.ready = false; n.shown = false; }
    } else if (!n.shown) reloadFrame(f.path);
  }

  function focusNote(id) {
    const d = notes.get(id) || (P.notes.find((q) => q.id === id) && makeNote(P.notes.find((q) => q.id === id)));
    if (d) setTimeout(() => d.ta.focus({ preventScroll: true }), 0);
  }

  // --- notes -----------------------------------------------------------------------------------------------------------
  function layoutNote(n) {
    const d = notes.get(n.id);
    if (d) Object.assign(d.node.style, { left: n.x + "px", top: n.y + "px" });
  }
  function makeNote(n) {
    const node = el("div", "hdc-note");
    node.dataset.id = n.id;
    const head = el("div", "hdc-nhead");
    const x = bind("n:" + n.id, btn("hdc-nx", "×", "", () => app.removeNote(n.id)), "note_remove");
    head.append(x);
    const ta = el("textarea");
    bind("n:" + n.id, ta, "note_ph", "placeholder");
    ta.addEventListener("input", () => { n.text = ta.value; app.noteChanged(); });
    ta.addEventListener("keydown", (e) => e.stopPropagation());
    ta.addEventListener("change", () => app.save());
    head.addEventListener("pointerdown", (e) => {
      if (e.target.closest("button")) return;
      e.preventDefault();
      head.setPointerCapture(e.pointerId);
      gesture = { kind: "note", id: n.id, sx: e.clientX, sy: e.clientY, fx: n.x, fy: n.y };
      chrome();
    });
    head.addEventListener("pointermove", (e) => stage.dispatchEvent(new PointerEvent("pointermove", e)));
    head.addEventListener("pointerup", (e) => stage.dispatchEvent(new PointerEvent("pointerup", e)));
    node.append(head, ta);
    world.append(node);
    const d = { node, ta };
    notes.set(n.id, d);
    layoutNote(n);
    return d;
  }

  // --- popups: menus, add a frame, the comment editor ------------------------------------------------------------
  function closeMenu() { menu = null; pop.hidden = true; pop.replaceChildren(); pop.className = "hdc-pop"; }
  function openPop(anchor, kids, cls = "", align = "left") {
    pop.className = "hdc-pop " + cls;
    pop.replaceChildren(...kids);
    pop.hidden = false;
    const a = anchor.getBoundingClientRect(), r = root.getBoundingClientRect();
    pop.style.top = a.bottom - r.top + 6 + "px";
    if (align === "right") { pop.style.left = "auto"; pop.style.right = r.right - a.right + "px"; }
    else { pop.style.right = "auto"; pop.style.left = Math.max(8, a.left - r.left) + "px"; }
    menu = anchor;
  }
  const item = (text, onClick, extra) => {
    const b = btn("hdc-mi", [...(extra ? [extra] : []), el("span", null, text)], null, () => { closeMenu(); onClick(); });
    return b;
  };
  const sep = () => el("div", "hdc-msep");

  function frameMenu(path, anchor) {
    if (menu === anchor) return closeMenu();
    const f = P.frames.find((q) => q.path === path);
    const head = el("div", "hdc-mh", t(f.fixed ? "design_size" : "window_width"));
    const sizes = f.fixed ? [item(`${f.w}×${f.h} px  ✓`, () => {})] : FRAME_SIZES.map((s) => item(s.label + " px" + (f.w === s.w ? "  ✓" : ""), () => app.sizeFrame(path, s.w)));
    openPop(anchor, [head, ...sizes,
      sep(), item(t("grids_over"), () => gridsMenu(path, anchor)),
      item(t("reload"), () => reloadFrame(path)), item(t("show_large"), () => focusOn(path)),
      item(t("remove_canvas"), () => app.removeFrame(path))], "", "right");
  }
  // frame grids: up to GRIDS_MAX, edited here and living on the canvas (not in the design; the designer gets them as a line in the frame view)
  function gridsMenu(path, anchor) {
    const f = P.frames.find((q) => q.path === path);
    if (!f) return;
    const redo = () => { app.save(); gridsMenu(path, anchor); };
    const list = normGrids(f.grids);
    const set = (next) => { f.grids = next; redo(); };
    const rows = list.map((g, i) => {
      const row = el("div", "hdc-grow");
      const kind = el("select");
      for (const k of GRID_KINDS) { const o = el("option", null, gridTitle(k)); o.value = k; kind.append(o); }
      kind.value = g.kind;
      kind.addEventListener("change", () => set(list.map((q, j) => (j === i ? { ...q, kind: kind.value } : q))));
      const num = (key, label) => {
        const inp = el("input");
        inp.type = "number"; inp.min = String(GRID_LIMITS[key][0]); inp.max = String(GRID_LIMITS[key][1]); inp.value = String(g[key]);
        inp.title = label;
        inp.addEventListener("keydown", (e) => { e.stopPropagation(); if (e.key === "Enter") inp.blur(); });
        inp.addEventListener("change", () => set(list.map((q, j) => (j === i ? { ...q, [key]: normGrid({ [key]: inp.value })[key] } : q))));
        const w = el("label", "hdc-gnum");
        w.append(el("span", null, label), inp);
        return w;
      };
      const color = el("input", "hdc-gcolor");
      color.type = "color"; color.value = g.color; color.title = t("g_color");
      color.addEventListener("change", () => set(list.map((q, j) => (j === i ? { ...q, color: color.value } : q))));
      row.append(kind, num("count", t("g_count")), num("gutter", t("g_gap")), num("margin", t("g_margin")), color, btn("hdc-gx", "×", t("g_remove"), () => set(list.filter((_, j) => j !== i))));
      return row;
    });
    const add = btn("hdc-mi", [el("span", null, t("g_add"))], null, () => set([...list, newGrid(list)]));
    add.disabled = list.length >= GRIDS_MAX;
    const show = el("label", "hdc-gshow");
    const cb = el("input"); cb.type = "checkbox"; cb.checked = !f.gridsOff;
    cb.addEventListener("change", () => { f.gridsOff = !cb.checked; redo(); });
    show.append(cb, el("span", null, t("g_show")));
    closeMenu();
    openPop(anchor, [el("div", "hdc-mh", t("g_head", { name: nameOf(path) })), ...(rows.length ? rows : [el("div", "hdc-mh", t("g_none"))]), add, ...(list.length ? [show] : [])], "grids", "right");
    menu = anchor;
  }
  function pagesMenu(anchor) {
    if (menu === anchor) return closeMenu();
    const rows = P.frames.map((f) => item(nameOf(f.path), () => focusOn(f.path)));
    openPop(anchor, [el("div", "hdc-mh", t("page1")), ...(rows.length ? rows : [el("div", "hdc-mh", t("no_frames"))])]);
  }
  function zoomMenu(anchor) {
    if (menu === anchor) return closeMenu();
    const c = () => ({ x: size().W / 2, y: size().H / 2 });
    openPop(anchor, [item(t("fit_all"), fit), ...ZOOM_STEPS.map((z) => item(Math.round(z * 100) + "%", () => setView(zoomAt(view, z / view.k, c().x, c().y)))),
      sep(), item(t("zoom_in"), () => setView(zoomAt(view, 1.25, c().x, c().y))), item(t("zoom_out"), () => setView(zoomAt(view, 0.8, c().x, c().y)))], "", "right");
  }
  function focusOn(path) {
    const f = P.frames.find((q) => q.path === path);
    if (!f) return;
    app.focusFrame(path);
    const { W, H } = size();
    const k = Math.min(1, (W - 120) / f.w, (H - FRAME_TOP - 40) / Math.min(f.h, H / 0.3));
    setView({ k: Math.max(0.05, k), x: (W - f.w * k) / 2 - f.x * k, y: FRAME_TOP - f.y * k });
  }
  function openAdd() {
    const anchor = bar.querySelector('[data-tool="frame"]') || bar;
    if (menu === anchor) return closeMenu();
    const input = el("input", "hdc-path");
    input.placeholder = t("path_ph");
    const go = () => { const v = input.value.trim(); if (v) { closeMenu(); app.addFrame(v, true); } };
    input.addEventListener("keydown", (e) => { e.stopPropagation(); if (e.key === "Enter") go(); });
    const rows = app.recent().filter((p) => !P.frames.some((f) => f.path === p)).map((p) => item(nameOf(p), () => app.addFrame(p, true)));
    openPop(anchor, [el("div", "hdc-mh", t("add_frame")), input, ...(rows.length ? [el("div", "hdc-mh", t("recent_html")), ...rows] : [])], "wide");
    setTimeout(() => input.focus(), 0);
  }

  // the comment editor: drawn here, not in the frame - at the canvas scale a window inside the frame would be tiny
  function openEditor(ep, m) {
    const pin = P.pins.find((p) => p.id === m.id);
    if (!pin) return;
    closeEditor(false);
    editor = { id: m.id, file: ep.path, x: m.x, y: m.y, ep };
    const box = el("div", "hdc-ed");
    const to = el("label", "hdc-edto");
    const who = el("select", "hdc-who");
    who.title = t("ed_who");
    who.addEventListener("change", () => { app.pickRecipient(ep.path, who.value); fill(); });
    to.append("→ ", who);
    // the recipient is whoever wrote the design; not found - the owner picks (until then "Send" is disabled)
    const fill = () => {
      const r = app.recipient(ep.path);
      const names = app.recipients();
      if (r.session && !names.includes(r.session)) names.unshift(r.session);
      who.replaceChildren(...[...(r.session ? [] : [""]), ...names].map((n) => { const o = el("option", null, n || t("ed_pick")); o.value = n; return o; }));
      who.value = r.session;
      to.dataset.how = r.how;
      to.title = ["wrote", "picked", "sent", "named", "none"].includes(r.how) ? t("how_" + r.how) : "";
      if (go) go.disabled = !r.session;
    };
    box.append(el("h4", null, t("ed_head")), to);
    const ta = el("textarea");
    ta.placeholder = t("ed_ph");
    ta.value = pin.text || "";
    // "Close" keeps what was typed (it stays a comment in the batch), an empty pin is removed; "Send" goes straight to the design author
    const close = () => {
      const text = ta.value.trim();
      closeEditor();
      app.handle(ep.path, text ? { t: "comment", id: m.id, text } : { t: "remove", id: m.id });
    };
    const send = () => {
      if (!app.recipient(ep.path).session) return who.focus();
      const text = ta.value.trim();
      closeEditor();
      app.handle(ep.path, text ? { t: "comment", id: m.id, text, send: true } : { t: "remove", id: m.id });
    };
    ta.addEventListener("keydown", (e) => {
      e.stopPropagation();
      if (e.key === "Enter" && !e.shiftKey && !e.isComposing) { e.preventDefault(); send(); }
      else if (e.key === "Escape") { e.preventDefault(); close(); }
    });
    const row = el("div", "hdc-edrow");
    const left = el("span", "hdc-edleft");
    left.append(btn("hdc-eb quiet", t("ed_close"), null, close),
      btn("hdc-eb quiet", t("ed_delete"), null, () => { closeEditor(); app.handle(ep.path, { t: "remove", id: m.id }); }));
    const go = btn("hdc-eb go", t("ed_send"), null, send);
    row.append(left, go);
    box.append(ta, row);
    editor.fill = fill;
    fill();
    app.ensureAuthor(ep.path);
    box.addEventListener("pointerdown", (e) => e.stopPropagation());
    editor.node = box;
    root.append(box);
    placeEditor();
    setTimeout(() => ta.focus({ preventScroll: true }), 0);
  }
  function refreshEditor() { if (editor && editor.fill) editor.fill(); }
  function closeEditor(tell = true) {
    if (!editor) return;
    const e = editor;
    editor = null;
    e.node.remove();
    if (tell) app.tellEp(e.ep, { t: "unframe" });
  }
  function placeEditor() {
    if (!editor) return;
    const r = editor.ep.iframe.getBoundingClientRect();
    const s = root.getBoundingClientRect();
    const k = r.width / (editor.ep.iframe.offsetWidth || 1);
    const x = r.left + editor.x * k - s.left, y = r.top + editor.y * k - s.top;
    Object.assign(editor.node.style, { left: Math.min(Math.max(8, x + 14), s.width - 320) + "px", top: Math.min(Math.max(8, y + 14), s.height - 190) + "px" });
  }

  // --- toolbar ---------------------------------------------------------------------------------------------------------
  const pageLabel = el("span");
  const pages = btn("hdc-pages", [pageLabel, svg("chev12")], "", (e) => pagesMenu(e.currentTarget));
  bind("", pageLabel, "page1", "textContent");
  bind("", pages, "canvas_frames");
  const toolBtn = (tool, ic) => {
    const b = bind("", btn("hdc-tool", svg(ic), "", () => (tool === "frame" ? openAdd() : app.setTool(tool))), "tool_" + tool);
    b.dataset.tool = tool;
    return b;
  };
  const tools = {
    select: toolBtn("select", "select"), hand: toolBtn("hand", "hand"), text: toolBtn("text", "text"),
    frame: toolBtn("frame", "frame"), note: toolBtn("note", "note"),
    comment: toolBtn("comment", "comment"),
  };
  const group = (tool) => {
    const main = bind("", btn("hdc-tool", svg(SHAPES[tool][0][1]), "", () => app.setTool(tool, P.shapes[tool])), "tool_" + tool);
    main.dataset.tool = tool;
    const more = bind("", btn("hdc-more", svg("chev"), "", (e) => {
      if (menu === more) return closeMenu();
      openPop(more, SHAPES[tool].map(([id, ic]) => item(t("shape_" + id) + (P.shapes[tool] === id ? "  ✓" : ""), () => { P.shapes[tool] = id; app.setTool(tool, id); }, svg(ic))));
    }), "tool_" + tool);
    const wrap = el("span", "hdc-grp");
    wrap.append(main, more);
    return { wrap, main };
  };
  const pencil = group("pencil");
  const shapes = group("shape");
  tools.pencil = pencil.main;
  tools.shape = shapes.main;
  // no room left before the right group - pencil and shapes move into the "more" menu (always >= BAR_GAP px between the groups)
  const ovf = bind("", btn("hdc-tool hdc-ovf", svg("more"), "", () => {
    if (menu === ovf) return closeMenu();
    const kids = [];
    for (const tool of ["pencil", "shape"]) {
      if (kids.length) kids.push(sep());
      for (const [id, ic] of SHAPES[tool]) kids.push(item(t("shape_" + id) + (P.tool === tool && P.shapes[tool] === id ? "  ✓" : ""), () => { P.shapes[tool] = id; app.setTool(tool, id); }, svg(ic)));
    }
    openPop(ovf, kids);
  }), "tool_more");
  ovf.hidden = true;
  bar.append(pages, tools.select, tools.hand, tools.text, tools.frame, tools.note, tools.comment, pencil.wrap, shapes.wrap, ovf);
  function fitBar() {
    bar.classList.remove("compact");
    ovf.hidden = true;
    const sameRow = top.offsetTop < bar.offsetTop + bar.offsetHeight;
    if (sameRow && bar.offsetLeft + bar.offsetWidth + BAR_GAP > top.offsetLeft) { bar.classList.add("compact"); ovf.hidden = false; }
  }

  const playTop = bind("", btn("hdc-tool", svg("play"), "", () => app.play(P.focus || (P.frames[0] && P.frames[0].path))), "play_top");
  const panel = bind("", btn("hdc-tool", svg("panel"), "", () => app.toggleProps()), "panel");
  const zoomText = el("span", null, "100%");
  const zoomB = bind("", btn("hdc-zoom", [zoomText, svg("chev12")], "", (e) => zoomMenu(e.currentTarget)), "zoom");
  const closeB = bind("", btn("hdc-tool hdc-close", hub.icon ? hub.icon("close") : svg("close"), "", () => app.close()), "close_design");
  top.append(playTop, panel, zoomB);
  xIsland.append(closeB);

  // --- painting the state ----------------------------------------------------------------------------------------------
  function paint() {
    relabel();
    chrome();
    for (const [tool, b] of Object.entries(tools)) b.classList.toggle("on", P.tool === tool);
    panel.classList.toggle("on", P.propsOpen);
    ovf.classList.toggle("on", P.tool === "pencil" || P.tool === "shape");
    const live = new Set(P.frames.map((f) => f.path));
    for (const path of [...fr.keys()]) if (!live.has(path)) dropFrame(path);
    for (const f of P.frames) {
      const n = fr.get(f.path) || makeFrame(f);
      layoutFrame(f);
      n.box.classList.toggle("focus", P.focus === f.path);
      n.label.classList.toggle("focus", P.focus === f.path);
      showGone(f, n);
    }
    const ids = new Set(P.notes.map((n) => n.id));
    for (const [id, d] of notes) if (!ids.has(id)) { d.node.remove(); notes.delete(id); }
    for (const n of P.notes) {
      const d = notes.get(n.id) || makeNote(n);
      layoutNote(n);
      d.node.classList.toggle("sent", n.state === "sent");
      if (document.activeElement !== d.ta && d.ta.value !== (n.text || "")) d.ta.value = n.text || "";
    }
    empty.hidden = P.alive !== false;
    empty.textContent = P.alive === false ? P.note : "";
    placeLabels();
    paintErrs();
    placeEditor();
  }
  new ResizeObserver(() => { fitBar(); if (view.auto && P.frames.length) fit(); else placeEditor(); }).observe(stage);
  apply();

  return {
    node: root, paint, fit, setView, key, wheel: frameWheel, reloadFrame, paintErrs, openEditor, refreshEditor, closeEditor, focusOn, focusNote, openAdd, scaleTo: pushScale, closeMenu,
    frame: (path) => fr.get(path), size,
  };
}
