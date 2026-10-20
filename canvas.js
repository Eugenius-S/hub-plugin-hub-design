// Hub Design: режим «Холст» — бесконечный холст с фреймами-артбордами рядом, плавающий тулбар, зум к курсору, панорама,
// заметки и пины комментариев. Правки внутри фреймов делает agent.js, а пачку копит main.js — холст только показывает
// фреймы, ловит жесты и передаёт инструмент. Чистая математика вида — в lib.js (тесты tests/lib.test.mjs).
import { CANVAS_ICONS as I } from "./icons.js";
import { SIZES, fitView, frameTitle, zoomAt } from "./lib.js";

const FRAME_SIZES = SIZES.filter((s) => s.w);
const ZOOM_STEPS = [0.1, 0.25, 0.5, 1, 2];
const TOOL_KEYS = { v: "select", h: "hand", t: "text", n: "note", c: "comment", p: "pencil", r: "shape" };
const SHAPES = { pencil: [["free", "Карандаш", "free"], ["arrow", "Стрелка", "arrow"]], shape: [["rect", "Прямоугольник", "rect"], ["oval", "Овал", "oval"]] };

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

  const root = el("div", "hdc");
  const stage = el("div", "hdc-stage");
  const world = el("div", "hdc-world");
  const labels = el("div", "hdc-labels");
  const empty = el("div", "hdc-empty");
  stage.append(world, labels, empty);
  const bar = el("div", "hdc-card hdc-bar");
  const top = el("div", "hdc-card hdc-top");
  const pop = el("div", "hdc-pop");
  root.append(stage, bar, top, pop);
  pop.hidden = true;

  const view = P.cv;
  const fr = new Map();   // path → {box, iframe, label, title, ep}
  const notes = new Map();
  let space = false, gesture = null, editor = null, menu = null, saveT = 0;

  // --- вид: перевод экрана и сцены -------------------------------------------------------------------------------------
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
    if (!ctrl && Math.abs(dx) > Math.abs(dy) * 1.2) return setView({ x: view.x - dx }); // горизонтальный жест — панорама
    setView(zoomAt(view, Math.exp(-dy * (ctrl ? 0.012 : 0.0016)), sx, sy));
  }
  stage.addEventListener("wheel", (e) => {
    e.preventDefault();
    const p = toScene(e);
    wheel(p.x, p.y, e.deltaX, e.deltaY, e.ctrlKey || e.metaKey);
  }, { passive: false });

  // событие колеса из фрейма (agent.js): координаты в окне фрейма → в сцену
  function frameWheel(ep, m) {
    const r = ep.iframe.getBoundingClientRect();
    const s = stage.getBoundingClientRect();
    const k = r.width / (ep.iframe.offsetWidth || 1);
    wheel(r.left + m.x * k - s.left, r.top + m.y * k - s.top, m.dx, m.dy, m.ctrl);
  }

  // --- жесты на сцене ----------------------------------------------------------------------------------------------
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

  // клавиши: пробел — рука, буквы — инструменты; из фрейма их пересылает agent.js
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

  // --- фреймы --------------------------------------------------------------------------------------------------------
  function layoutFrame(f) {
    const n = fr.get(f.path);
    if (!n) return;
    Object.assign(n.box.style, { left: f.x + "px", top: f.y + "px", width: f.w + "px", height: f.h + "px" });
  }
  function placeLabels() {
    for (const f of P.frames) {
      const n = fr.get(f.path);
      if (!n) continue;
      Object.assign(n.label.style, { left: view.x + f.x * view.k + "px", top: view.y + f.y * view.k - 28 + "px", width: Math.max(176, f.w * view.k) + "px" });
    }
  }
  function makeFrame(f) {
    const box = el("div", "hdc-frame");
    box.dataset.path = f.path;
    const iframe = el("iframe", "hdc-iframe");
    iframe.setAttribute("title", frameTitle(f.path));
    const ep = { id: "f:" + f.path, path: f.path, iframe, external: true, ready: false };
    iframe.addEventListener("load", () => app.hello(ep));
    box.append(iframe);
    world.append(box);

    const label = el("div", "hdc-label");
    label.dataset.path = f.path;
    const title = el("span", "hdc-ltitle", frameTitle(f.path));
    title.title = f.path;
    const tweak = btn("hdc-lb", svg("sliders"), "Размер, перезагрузка, убрать", (e) => frameMenu(f.path, e.currentTarget));
    const dl = btn("hdc-lb", svg("download"), "Скачать HTML", () => {
      const a = el("a");
      a.href = app.fileUrl(f.path, { raw: 1, dl: 1 });
      a.download = frameTitle(f.path);
      document.body.append(a); a.click(); a.remove();
    });
    const play = btn("hdc-play", [svg("play12"), document.createTextNode("PLAY")], "Открыть во весь экран", () => app.play(f.path));
    label.append(title, tweak, dl, play);
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
    const n = { box, iframe, label, title, ep };
    fr.set(f.path, n);
    app.register(ep);
    iframe.src = app.fileUrl(f.path) + "&t=" + Date.now();
    return n;
  }
  function dropFrame(path) {
    const n = fr.get(path);
    if (!n) return;
    app.unregister(n.ep.id);
    n.box.remove();
    n.label.remove();
    fr.delete(path);
  }
  function reloadFrame(path) {
    const n = fr.get(path);
    if (n) { n.ep.ready = false; n.iframe.src = app.fileUrl(path) + "&t=" + Date.now(); }
  }

  function focusNote(id) {
    const d = notes.get(id) || (P.notes.find((q) => q.id === id) && makeNote(P.notes.find((q) => q.id === id)));
    if (d) setTimeout(() => d.ta.focus({ preventScroll: true }), 0);
  }

  // --- заметки ---------------------------------------------------------------------------------------------------------
  function layoutNote(n) {
    const d = notes.get(n.id);
    if (d) Object.assign(d.node.style, { left: n.x + "px", top: n.y + "px" });
  }
  function makeNote(n) {
    const node = el("div", "hdc-note");
    node.dataset.id = n.id;
    const head = el("div", "hdc-nhead");
    const x = btn("hdc-nx", "×", "Убрать заметку", () => app.removeNote(n.id));
    head.append(x);
    const ta = el("textarea");
    ta.placeholder = "Заметка дизайнеру…";
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

  // --- всплывающие окна: меню, добавить фрейм, редактор комментария ---------------------------------------------
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
    const head = el("div", "hdc-mh", "Ширина окна");
    openPop(anchor, [head, ...FRAME_SIZES.map((s) => item(s.label + " px" + (f.w === s.w ? "  ✓" : ""), () => app.sizeFrame(path, s.w))),
      sep(), item("Перезагрузить", () => reloadFrame(path)), item("Показать крупно", () => focusOn(path)),
      item("Убрать с холста", () => app.removeFrame(path))], "", "right");
  }
  function pagesMenu(anchor) {
    if (menu === anchor) return closeMenu();
    const rows = P.frames.map((f) => item(frameTitle(f.path), () => focusOn(f.path)));
    openPop(anchor, [el("div", "hdc-mh", "Page 1"), ...(rows.length ? rows : [el("div", "hdc-mh", "Фреймов пока нет")])]);
  }
  function zoomMenu(anchor) {
    if (menu === anchor) return closeMenu();
    const c = () => ({ x: size().W / 2, y: size().H / 2 });
    openPop(anchor, [item("Вписать всё", fit), ...ZOOM_STEPS.map((z) => item(Math.round(z * 100) + "%", () => setView(zoomAt(view, z / view.k, c().x, c().y)))),
      sep(), item("Приблизить", () => setView(zoomAt(view, 1.25, c().x, c().y))), item("Отдалить", () => setView(zoomAt(view, 0.8, c().x, c().y)))], "", "right");
  }
  function focusOn(path) {
    const f = P.frames.find((q) => q.path === path);
    if (!f) return;
    app.focusFrame(path);
    const { W, H } = size();
    const k = Math.min(1, (W - 120) / f.w, (H - 140) / Math.min(f.h, H / 0.3));
    setView({ k: Math.max(0.05, k), x: (W - f.w * k) / 2 - f.x * k, y: 72 - f.y * k });
  }
  function openAdd() {
    const anchor = bar.querySelector('[data-tool="frame"]') || bar;
    if (menu === anchor) return closeMenu();
    const input = el("input", "hdc-path");
    input.placeholder = "Путь к HTML: /…/index.html";
    const go = () => { const v = input.value.trim(); if (v) { closeMenu(); app.addFrame(v, true); } };
    input.addEventListener("keydown", (e) => { e.stopPropagation(); if (e.key === "Enter") go(); });
    const rows = app.recent().filter((p) => !P.frames.some((f) => f.path === p)).map((p) => item(frameTitle(p), () => app.addFrame(p, true)));
    openPop(anchor, [el("div", "hdc-mh", "Добавить фрейм"), input, ...(rows.length ? [el("div", "hdc-mh", "Последние HTML сессии"), ...rows] : [])], "wide");
    setTimeout(() => input.focus(), 0);
  }

  // редактор комментария: рисуется здесь, а не в фрейме — в масштабе холста окно в фрейме стало бы крошечным
  function openEditor(ep, m) {
    const pin = P.pins.find((p) => p.id === m.id);
    if (!pin) return;
    closeEditor(false);
    editor = { id: m.id, file: ep.path, x: m.x, y: m.y, ep };
    const box = el("div", "hdc-ed");
    box.append(el("h4", null, "Комментарий"), el("span", "hdc-edto", "→ " + app.recipient(ep.path)));
    const ta = el("textarea");
    ta.placeholder = "Что поменять здесь?";
    ta.value = pin.text || "";
    // «Закрыть» не теряет набранное (останется комментарием в пачке), пустой пин убирается; «Отправить» шлёт сразу автору макета
    const close = () => {
      const text = ta.value.trim();
      closeEditor();
      app.handle(ep.path, text ? { t: "comment", id: m.id, text } : { t: "remove", id: m.id });
    };
    const send = () => {
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
    left.append(btn("hdc-eb quiet", "Закрыть", null, close),
      btn("hdc-eb quiet", "Удалить", null, () => { closeEditor(); app.handle(ep.path, { t: "remove", id: m.id }); }));
    row.append(left, btn("hdc-eb go", "Отправить", null, send));
    box.append(ta, row);
    box.addEventListener("pointerdown", (e) => e.stopPropagation());
    editor.node = box;
    root.append(box);
    placeEditor();
    setTimeout(() => ta.focus({ preventScroll: true }), 0);
  }
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

  // --- тулбар ---------------------------------------------------------------------------------------------------------
  const pages = btn("hdc-pages", [el("span", null, "Page 1"), svg("chev12")], "Фреймы холста", (e) => pagesMenu(e.currentTarget));
  const toolBtn = (tool, ic, title, extra) => {
    const b = btn("hdc-tool", svg(ic), title, () => (tool === "frame" ? openAdd() : app.setTool(tool)));
    b.dataset.tool = tool;
    return b;
  };
  const tools = {
    select: toolBtn("select", "select", "Выбрать (V)"), hand: toolBtn("hand", "hand", "Рука (H)"), text: toolBtn("text", "text", "Текст (T)"),
    frame: toolBtn("frame", "frame", "Добавить фрейм (F)"), note: toolBtn("note", "note", "Заметка (N)"),
    comment: toolBtn("comment", "comment", "Комментарий (C)"),
  };
  const group = (tool, title, key) => {
    const main = btn("hdc-tool", svg(SHAPES[tool][0][2]), title, () => app.setTool(tool, P.shapes[tool]));
    main.dataset.tool = tool;
    const more = btn("hdc-more", svg("chev"), title, (e) => {
      if (menu === more) return closeMenu();
      openPop(more, SHAPES[tool].map(([id, name, ic]) => item(name + (P.shapes[tool] === id ? "  ✓" : ""), () => { P.shapes[tool] = id; app.setTool(tool, id); }, svg(ic))));
    });
    const wrap = el("span", "hdc-grp");
    wrap.append(main, more);
    return { wrap, main };
  };
  const pencil = group("pencil", "Карандаш (P)");
  const shapes = group("shape", "Фигуры (R)");
  tools.pencil = pencil.main;
  tools.shape = shapes.main;
  bar.append(pages, tools.select, tools.hand, tools.text, tools.frame, tools.note, tools.comment, pencil.wrap, shapes.wrap);

  const playTop = btn("hdc-tool", svg("play"), "Показать выбранный фрейм во весь экран", () => app.play(P.focus || (P.frames[0] && P.frames[0].path)));
  const panel = btn("hdc-tool", svg("panel"), "Панель стилей", () => app.toggleProps());
  const zoomText = el("span", null, "100%");
  const zoomB = btn("hdc-zoom", [zoomText, svg("chev12")], "Масштаб", (e) => zoomMenu(e.currentTarget));
  const closeB = btn("hdc-tool hdc-close", hub.icon ? hub.icon("close") : svg("close"), "Закрыть Hub Design", () => app.close());
  top.append(playTop, panel, zoomB, closeB);

  // --- рисуем состояние ----------------------------------------------------------------------------------------------
  function paint() {
    chrome();
    for (const [tool, b] of Object.entries(tools)) b.classList.toggle("on", P.tool === tool);
    panel.classList.toggle("on", P.propsOpen);
    const live = new Set(P.frames.map((f) => f.path));
    for (const path of [...fr.keys()]) if (!live.has(path)) dropFrame(path);
    for (const f of P.frames) {
      const n = fr.get(f.path) || makeFrame(f);
      layoutFrame(f);
      n.box.classList.toggle("focus", P.focus === f.path);
      n.label.classList.toggle("focus", P.focus === f.path);
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
    placeEditor();
  }
  new ResizeObserver(() => { if (view.auto && P.frames.length) fit(); else placeEditor(); }).observe(stage);
  apply();

  return {
    node: root, paint, fit, setView, key, wheel: frameWheel, reloadFrame, openEditor, closeEditor, focusOn, focusNote, openAdd, scaleTo: pushScale, closeMenu,
    frame: (path) => fr.get(path), size,
  };
}
