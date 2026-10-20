// Hub Design: скрипт внутри предпросмотра (его подкладывает server.py). Рисует рамку под курсором, пины комментов, рамку
// выделения и рисунки; тянуть, менять размер, текст и стили — прямо в документе. Всё, что сделал владелец, уходит странице
// хаба (postMessage), она ведёт список и шлёт его дизайнеру. Файл на диске скрипт не трогает.
(() => {
  if (window.__canvasAgent || window.top === window) return;
  window.__canvasAgent = true;
  const ORIGINS = (window.__canvas && window.__canvas.origins) || [];
  let hubOrigin = null;
  let mode = "view";      // view | comment | edit | draw
  let pins = [];
  let drawings = [];
  let propList = [];      // свойства, значения которых нужны панели «Правка»
  let selected = null;    // элемент, выбранный в режимах «Правка» и «Комментарий»
  let framed = null;      // элемент, которому открыт комментарий
  let drag = null;
  let stroke = null;      // рисунок в процессе
  const state = new WeakMap();   // элемент → {sel, label, x0, y0, w0, h0, t0, dx, dy, w, h, t, css, attr}
  const touched = new Set();
  const undo = [], redo = [];

  const path = (() => {
    const rest = decodeURIComponent(location.pathname.replace(/^\/f\//, ""));
    return /^[A-Za-z]:/.test(rest) ? rest : "/" + rest;
  })();

  const send = (msg) => { if (hubOrigin) parent.postMessage({ canvas: 1, ...msg }, hubOrigin); };

  // --- оверлей в тени: стили дизайна его не трогают, его — дизайн -------------------------------------------------
  const BLUE = "#3b6fd4", CORAL = "#d97757";
  const host = document.createElement("div");
  host.setAttribute("data-canvas-overlay", "");
  host.style.cssText = "all:initial;position:absolute;left:0;top:0;width:0;height:0;z-index:2147483647;pointer-events:none;";
  const root = host.attachShadow({ mode: "open" });
  root.innerHTML = `<style>
    :host{all:initial}
    *{box-sizing:border-box;font:13px/1.35 -apple-system,BlinkMacSystemFont,"Segoe UI",Inter,sans-serif}
    .hover{position:fixed;pointer-events:none;border:1px solid ${BLUE};background:rgba(59,111,212,.06);display:none}
    .hover i{position:absolute;left:-1px;top:-19px;background:${BLUE};color:#fff;font-style:normal;font-size:11px;padding:1px 6px;border-radius:3px;white-space:nowrap;max-width:360px;overflow:hidden;text-overflow:ellipsis}
    .sel,.frame{position:fixed;border:2px solid ${BLUE};display:none;pointer-events:none}
    .sel .grip{position:absolute;right:-6px;bottom:-6px;width:10px;height:10px;background:#fff;border:2px solid ${BLUE};border-radius:2px;pointer-events:auto;cursor:nwse-resize}
    .sel .bar{position:absolute;left:-2px;top:-24px;display:flex;gap:3px;pointer-events:auto}
    .sel .bar span,.sel .bar button{background:${BLUE};color:#fff;border:0;border-radius:3px;font-size:11px;padding:2px 6px;white-space:nowrap}
    .sel .bar button{cursor:pointer}
    .pin{position:absolute;width:24px;height:24px;margin:-12px 0 0 -12px;border-radius:12px;background:${CORAL};color:#fff;
      display:flex;align-items:center;justify-content:center;font-weight:600;font-size:12px;pointer-events:auto;cursor:pointer;
      box-shadow:0 1px 5px rgba(0,0,0,.3);border:2px solid #fff}
    .pin.sent{background:#a8a29e}
    .nopin .pin{pointer-events:none}
    .pin.done{display:none}
    .ed{position:absolute;width:300px;background:#fff;color:#1f1e1d;border-radius:12px;box-shadow:0 8px 28px rgba(0,0,0,.22),0 0 0 1px rgba(0,0,0,.06);padding:12px;pointer-events:auto}
    .ed h4{margin:0 0 8px;font-size:13px;font-weight:600;display:flex;justify-content:space-between;align-items:center}
    .ed h4 button{border:0;background:none;color:#8a8780;cursor:pointer;font-size:16px;line-height:1;padding:0 2px}
    .ed textarea{width:100%;min-height:62px;resize:vertical;border:1px solid #d8d4cb;border-radius:8px;padding:8px;outline:none;color:#1f1e1d;background:#fff}
    .ed textarea:focus{border-color:#b9b4a8}
    .ed .row{display:flex;justify-content:space-between;margin-top:10px;gap:8px}
    .ed button.b{border:1px solid #d8d4cb;border-radius:8px;padding:5px 12px;cursor:pointer;background:#fff;color:#1f1e1d}
    .ed button.go{background:${CORAL};border-color:${CORAL};color:#fff}
    .ed button.del{border:0;color:#8a8780;background:none;padding:5px 4px}
    svg.draw{position:absolute;left:0;top:0;overflow:visible;pointer-events:none}
    svg.draw path{fill:none;stroke:${CORAL};stroke-width:3;stroke-linecap:round;stroke-linejoin:round}
    svg.draw path.sent{stroke:#a8a29e}
  </style><svg class="draw"></svg><div class="hover"><i></i></div><div class="frame"></div><div class="sel"><div class="bar"><span></span><button class="up" title="Выбрать родителя">↑</button><button class="rev" title="Вернуть как было">↺</button></div><div class="grip" title="Размер"></div></div><div class="pins"></div>`;
  const hoverBox = root.querySelector(".hover");
  const selBox = root.querySelector(".sel");
  const frameBox = root.querySelector(".frame");
  const pinsBox = root.querySelector(".pins");
  const svg = root.querySelector("svg.draw");
  const mount = () => { if (!host.isConnected) document.documentElement.appendChild(host); };
  mount();
  new MutationObserver(mount).observe(document.documentElement, { childList: true });

  const ours = (el) => el === host || (el && el.getRootNode && el.getRootNode() === root);

  // --- селектор и подпись элемента ---------------------------------------------------------------------------------
  const unique = (s, el) => { try { const l = document.querySelectorAll(s); return l.length === 1 && l[0] === el; } catch { return false; } };
  const transient = /^(is-|js-|has-|active$|hover$|focus|open$|show$|visible$|in-view|animate)/;
  function selector(el) {
    if (el.id && unique(`#${CSS.escape(el.id)}`, el)) return `#${CSS.escape(el.id)}`;
    const parts = [];
    let cur = el;
    while (cur && cur.nodeType === 1 && cur !== document.documentElement) {
      const tag = cur.tagName.toLowerCase();
      let part = tag;
      if (cur.id && cur !== el) part = `#${CSS.escape(cur.id)}`;
      else {
        const cls = [...cur.classList].filter((c) => !transient.test(c)).slice(0, 2);
        part += cls.map((c) => "." + CSS.escape(c)).join("");
        const par = cur.parentElement;
        if (par) {
          const sameTag = [...par.children].filter((c) => c.tagName === cur.tagName);
          const same = sameTag.filter((c) => cls.every((k) => c.classList.contains(k)));
          if (same.length > 1) part += `:nth-of-type(${sameTag.indexOf(cur) + 1})`;
        }
      }
      parts.unshift(part);
      const s = parts.join(" > ");
      // уникальный и узнаваемый: с классом или id где-то в пути, а не голое «a:nth-of-type(4)»
      if (unique(s, el) && (parts.some((p) => /[.#]/.test(p)) || parts.length >= 4)) return s;
      cur = cur.parentElement;
    }
    return parts.join(" > ");
  }
  const label = (el) => {
    const t = (el.getAttribute("aria-label") || el.getAttribute("alt") || el.innerText || el.textContent || "").replace(/\s+/g, " ").trim();
    return t.slice(0, 120);
  };
  const short = (el) => {
    const cls = [...el.classList].filter((c) => !transient.test(c)).slice(0, 2).map((c) => "." + c).join("");
    return el.tagName.toLowerCase() + (el.id ? "#" + el.id : cls);
  };
  const pageRect = (el) => {
    const r = el.getBoundingClientRect();
    return { x: r.left + scrollX, y: r.top + scrollY, w: r.width, h: r.height };
  };
  const find = (sel) => { try { return sel ? document.querySelector(sel) : null; } catch { return null; } };

  const pickable = (el) => el && el.nodeType === 1 && !ours(el) && el !== document.documentElement && el !== document.body;
  const at = (x, y) => {
    host.style.display = "none";
    const el = document.elementFromPoint(x, y);
    host.style.display = "";
    return el;
  };

  // --- рамка под курсором ------------------------------------------------------------------------------------------
  function showHover(el) {
    if (!el || mode === "view" || mode === "draw" || drag) { hoverBox.style.display = "none"; return; }
    const r = el.getBoundingClientRect();
    Object.assign(hoverBox.style, { display: "block", left: r.left + "px", top: r.top + "px", width: r.width + "px", height: r.height + "px" });
    hoverBox.firstChild.textContent = `${short(el)}  ${Math.round(r.width)}×${Math.round(r.height)}`;
  }

  // --- пины --------------------------------------------------------------------------------------------------------
  function pinXY(p) {
    const el = find(p.sel);
    if (el) {
      const r = pageRect(el);
      if (r.w || r.h) return { x: r.x + p.fx * r.w, y: r.y + p.fy * r.h };
    }
    return { x: p.x, y: p.y };
  }
  function drawPins() {
    const have = new Map([...pinsBox.children].map((n) => [n.dataset.id, n]));
    for (const p of pins) {
      let n = have.get(p.id);
      have.delete(p.id);
      if (!n) {
        n = document.createElement("div");
        n.className = "pin";
        n.dataset.id = p.id;
        n.addEventListener("pointerdown", (e) => { e.stopPropagation(); e.preventDefault(); });
        n.addEventListener("click", (e) => { e.stopPropagation(); e.preventDefault(); if (p.state === "draft") openEditor(n.dataset.id); });
        pinsBox.append(n);
      }
      n.textContent = String(p.n);
      n.className = "pin " + (p.state || "draft");
      n.title = p.text || "";
    }
    for (const n of have.values()) n.remove();
    const ed = root.querySelector(".ed");
    if (ed && !pins.some((p) => p.id === ed.dataset.id && p.state === "draft")) { ed.remove(); framed = null; }
    place();
  }
  function drawDrawings() {
    svg.replaceChildren(...drawings.filter((d) => d.state !== "done").map((d) => {
      const p = document.createElementNS("http://www.w3.org/2000/svg", "path");
      p.setAttribute("d", d.path.map((pt, i) => `${i ? "L" : "M"}${pt[0]} ${pt[1]}`).join(""));
      if (d.state === "sent") p.setAttribute("class", "sent");
      return p;
    }));
  }
  function place() {
    svg.style.width = document.documentElement.scrollWidth + "px";
    svg.style.height = document.documentElement.scrollHeight + "px";
    for (const n of pinsBox.children) {
      const p = pins.find((q) => q.id === n.dataset.id);
      if (!p) continue;
      const { x, y } = pinXY(p);
      n.style.left = x + "px";
      n.style.top = y + "px";
    }
    const ed = root.querySelector(".ed");
    if (ed) {
      const p = pins.find((q) => q.id === ed.dataset.id);
      if (p) {
        const el = find(p.sel);
        const r = el ? pageRect(el) : { x: p.x, y: p.y, w: 0, h: 0 };
        const left = Math.min(r.x, scrollX + innerWidth - 312);
        ed.style.left = Math.max(scrollX + 4, left) + "px";
        ed.style.top = r.y + r.h + 8 + "px";
      }
    }
    box(frameBox, framed);
    box(selBox, selected);
  }
  function box(node, el) {
    if (!el || !el.isConnected) { node.style.display = "none"; return; }
    const r = el.getBoundingClientRect();
    Object.assign(node.style, { display: "block", left: r.left + "px", top: r.top + "px", width: r.width + "px", height: r.height + "px" });
  }
  (function loop() { place(); requestAnimationFrame(loop); })();

  function openEditor(id) {
    const p = pins.find((q) => q.id === id);
    if (!p) return;
    root.querySelector(".ed")?.remove();
    framed = find(p.sel);
    const ed = document.createElement("div");
    ed.className = "ed";
    ed.dataset.id = id;
    ed.innerHTML = `<h4>Комментарий<button class="x" title="Закрыть">×</button></h4><textarea placeholder="Что поменять здесь?"></textarea><div class="row"><button class="b save">Комментарий</button><button class="b go">Отправить дизайнеру</button></div><div class="row" style="margin-top:4px"><button class="b del">Удалить</button></div>`;
    const ta = ed.querySelector("textarea");
    ta.value = p.text || "";
    const close = () => { ed.remove(); framed = null; };
    const done = (go) => {
      const text = ta.value.trim();
      close();
      send(text ? { t: "comment", id, text, send: !!go } : { t: "remove", id });
    };
    ed.addEventListener("pointerdown", (e) => e.stopPropagation());
    ed.addEventListener("click", (e) => e.stopPropagation());
    ta.addEventListener("keydown", (e) => {
      e.stopPropagation();
      if (e.key === "Enter" && !e.isComposing && (e.metaKey || e.ctrlKey)) { e.preventDefault(); done(true); }
      else if (e.key === "Enter" && !e.shiftKey && !e.isComposing) { e.preventDefault(); done(false); }
      if (e.key === "Escape") { e.preventDefault(); if (!p.text && !ta.value.trim()) send({ t: "remove", id }); close(); }
    });
    ed.querySelector(".save").addEventListener("click", () => done(false));
    ed.querySelector(".go").addEventListener("click", () => done(true));
    ed.querySelector(".x").addEventListener("click", () => { if (!p.text && !ta.value.trim()) send({ t: "remove", id }); close(); });
    ed.querySelector(".del").addEventListener("click", () => { close(); send({ t: "remove", id }); });
    root.append(ed);
    place();
    setTimeout(() => ta.focus({ preventScroll: true }), 0);
  }

  // --- правки руками -----------------------------------------------------------------------------------------------
  function track(el) {
    let s = state.get(el);
    if (!s) {
      const r = pageRect(el);
      s = { sel: selector(el), label: label(el), x0: r.x, y0: r.y, w0: r.w, h0: r.h, t0: null, dx: 0, dy: 0, w: null, h: null, t: null, css: {},
        attr: el.getAttribute("style") };
      state.set(el, s);
      touched.add(el);
    }
    return s;
  }
  const report = (el) => {
    const s = state.get(el);
    if (!s) return;
    send({ t: "change", change: { sel: s.sel, label: s.label, x0: s.x0, y0: s.y0, w0: s.w0, h0: s.h0, dx: s.dx, dy: s.dy, w: s.w, h: s.h, t0: s.t0, t: s.t, css: s.css } });
  };
  // собрать вид элемента заново из записи: исходный style, затем сдвиг, размер, стили; текст — отдельно
  function paintState(el) {
    const s = state.get(el);
    if (s.attr == null) el.removeAttribute("style"); else el.setAttribute("style", s.attr);
    if (s.dx || s.dy) el.style.translate = `${s.dx}px ${s.dy}px`;
    if (s.w != null) { el.style.boxSizing = "border-box"; el.style.width = s.w + "px"; el.style.height = s.h + "px"; }
    for (const [p, v] of Object.entries(s.css)) el.style.setProperty(p, v.to);
    if (s.t != null && s.t0 != null) el.textContent = s.t;
    else if (s.t0 != null) el.textContent = s.t0;
  }
  const snap = (el) => { const s = state.get(el); return s ? JSON.parse(JSON.stringify({ dx: s.dx, dy: s.dy, w: s.w, h: s.h, t: s.t, t0: s.t0, css: s.css })) : { dx: 0, dy: 0, w: null, h: null, t: null, t0: null, css: {} }; };
  function commit(el, before) {
    undo.push({ el, before, after: snap(el) });
    if (undo.length > 100) undo.shift();
    redo.length = 0;
    sendHistory();
    report(el);
    sendSelected();
  }
  function restore(el, to) {
    const s = track(el);
    Object.assign(s, JSON.parse(JSON.stringify(to)));
    paintState(el);
    report(el);
    if (el === selected) sendSelected();
  }
  const sendHistory = () => send({ t: "history", undo: undo.length, redo: redo.length });
  function stepUndo() {
    const h = undo.pop();
    if (h) { restore(h.el, h.before); redo.push(h); }
    sendHistory();
  }
  function stepRedo() {
    const h = redo.pop();
    if (h) { restore(h.el, h.after); undo.push(h); }
    sendHistory();
  }
  function revert(el) {
    const s = state.get(el);
    if (!s) return;
    if (s.attr == null) el.removeAttribute("style"); else el.setAttribute("style", s.attr);
    if (s.t0 != null) el.textContent = s.t0;
    state.delete(el);
    touched.delete(el);
  }
  const textLeaf = (el) => el.childNodes.length > 0 && [...el.childNodes].every((n) => n.nodeType === 3 || (n.nodeType === 1 && n.tagName === "BR"));

  // --- выбранный элемент и его свойства для панели ------------------------------------------------------------------
  const hex = (v) => {
    const m = /^rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)$/.exec(v);
    if (!m) return v;
    if (m[4] === "0") return "transparent";
    return "#" + [m[1], m[2], m[3]].map((n) => Number(n).toString(16).padStart(2, "0")).join("");
  };
  function sendSelected() {
    if (!selected) { send({ t: "selected", sel: null }); return; }
    const cs = getComputedStyle(selected);
    const css = {};
    for (const p of propList) {
      let v = cs.getPropertyValue(p);
      if (/color$/.test(p) || p === "color") v = hex(v);
      css[p] = v;
    }
    send({ t: "selected", sel: selector(selected), label: label(selected), tag: selected.tagName.toLowerCase(), css, flex: /flex/.test(cs.display) });
  }
  function select(el) {
    selected = el;
    if (el) selBox.querySelector(".bar span").textContent = short(el);
    selBox.querySelector(".grip").style.display = mode === "edit" ? "" : "none";
    selBox.querySelector(".bar").style.display = mode === "edit" ? "" : "none";
    place();
    sendSelected();
  }
  selBox.querySelector(".up").addEventListener("pointerdown", (e) => {
    e.stopPropagation(); e.preventDefault();
    if (selected && pickable(selected.parentElement)) select(selected.parentElement);
  });
  selBox.querySelector(".rev").addEventListener("pointerdown", (e) => {
    e.stopPropagation(); e.preventDefault();
    if (!selected) return;
    const s = state.get(selected);
    if (s) { send({ t: "revert", sel: s.sel }); revert(selected); sendSelected(); }
  });
  selBox.querySelector(".grip").addEventListener("pointerdown", (e) => {
    if (!selected) return;
    e.stopPropagation(); e.preventDefault();
    const s = track(selected);
    const r = selected.getBoundingClientRect();
    drag = { kind: "size", el: selected, sx: e.clientX, sy: e.clientY, bw: r.width, bh: r.height, moved: false, before: snap(selected) };
    s.w = s.w ?? r.width; s.h = s.h ?? r.height;
  });

  function setStyle(prop, value) {
    if (!selected) return;
    const s = track(selected);
    const before = snap(selected);
    const from = s.css[prop] ? s.css[prop].from : getComputedStyle(selected).getPropertyValue(prop);
    s.css[prop] = { from: /color$/.test(prop) || prop === "color" ? hex(from) : from, to: value };
    paintState(selected);
    commit(selected, before);
  }

  function textEdit(el) {
    const s = track(el);
    const before = snap(el);
    if (s.t0 == null) s.t0 = el.textContent;
    el.contentEditable = "plaintext-only";
    el.focus();
    const range = document.createRange();
    range.selectNodeContents(el);
    getSelection().removeAllRanges();
    getSelection().addRange(range);
    const finish = (keep) => {
      el.removeEventListener("blur", onBlur);
      el.removeEventListener("keydown", onKey, true);
      el.contentEditable = "false";
      el.removeAttribute("contenteditable");
      if (!keep) el.textContent = s.t ?? s.t0;
      s.t = el.textContent;
      commit(el, before);
    };
    const onBlur = () => finish(true);
    const onKey = (e) => {
      e.stopPropagation();
      if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); el.blur(); }
      if (e.key === "Escape") { e.preventDefault(); el.removeEventListener("blur", onBlur); finish(false); }
    };
    el.addEventListener("blur", onBlur);
    el.addEventListener("keydown", onKey, true);
  }

  // --- рисование от руки -------------------------------------------------------------------------------------------
  function finishStroke() {
    const pts = stroke.pts;
    stroke.node.remove();
    stroke = null;
    const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
    const bx = Math.min(...xs), by = Math.min(...ys), bw = Math.max(...xs) - bx, bh = Math.max(...ys) - by;
    let len = 0;
    for (let i = 1; i < pts.length; i++) len += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
    if (len < 12) return;
    const a = pts[0], b = pts[pts.length - 1];
    const gap = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const kind = gap < Math.max(24, len * 0.18) && bw > 14 && bh > 14 ? "loop" : gap > len * 0.8 ? "arrow" : "mark";
    const cx = (bx + bw / 2) - scrollX, cy = (by + bh / 2) - scrollY;
    const el = at(Math.min(Math.max(cx, 0), innerWidth - 1), Math.min(Math.max(cy, 0), innerHeight - 1));
    const keep = Math.max(1, Math.ceil(pts.length / 40));
    const path = pts.filter((_, i) => i % keep === 0 || i === pts.length - 1).map((p) => [Math.round(p[0]), Math.round(p[1])]);
    send({ t: "draw", drawing: { kind, sel: pickable(el) ? selector(el) : "", label: pickable(el) ? label(el) : "",
      box: { x: bx, y: by, w: bw, h: bh }, from: { x: a[0], y: a[1] }, to: { x: b[0], y: b[1] }, path } });
  }

  // --- события документа: в режимах коммента, правки и рисунка клики дизайну не достаются --------------------------
  const stop = (e) => { e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation(); };
  addEventListener("pointermove", (e) => {
    if (stroke) {
      stroke.pts.push([e.clientX + scrollX, e.clientY + scrollY]);
      stroke.node.setAttribute("d", stroke.pts.map((pt, i) => `${i ? "L" : "M"}${pt[0]} ${pt[1]}`).join(""));
      return stop(e);
    }
    if (drag) {
      const ddx = e.clientX - drag.sx, ddy = e.clientY - drag.sy;
      if (Math.abs(ddx) + Math.abs(ddy) > 2) drag.moved = true;
      const s = state.get(drag.el);
      if (drag.kind === "move") { s.dx = Math.round(drag.bx + ddx); s.dy = Math.round(drag.by + ddy); }
      else { s.w = Math.max(4, Math.round(drag.bw + ddx)); s.h = Math.max(4, Math.round(drag.bh + ddy)); }
      paintState(drag.el);
      return stop(e);
    }
    if (mode === "view" || mode === "draw") return;
    const el = e.target;
    showHover(pickable(el) ? el : null);
  }, true);
  addEventListener("pointerdown", (e) => {
    if (mode === "view" || e.button !== 0 || ours(e.target)) return;
    if (e.target.isContentEditable) return;
    stop(e);
    if (mode === "draw") {
      const node = document.createElementNS("http://www.w3.org/2000/svg", "path");
      svg.append(node);
      stroke = { pts: [[e.clientX + scrollX, e.clientY + scrollY]], node };
      return;
    }
    const el = e.target;
    if (!pickable(el)) return;
    if (mode === "edit") {
      if (selected !== el) select(el);
      const s = track(el);
      drag = { kind: "move", el, sx: e.clientX, sy: e.clientY, bx: s.dx, by: s.dy, moved: false, before: snap(el) };
    }
  }, true);
  addEventListener("pointerup", (e) => {
    if (stroke) { finishStroke(); return stop(e); }
    if (!drag) return;
    const d = drag;
    drag = null;
    if (d.moved) commit(d.el, d.before);
    stop(e);
  }, true);
  for (const type of ["mousedown", "mouseup", "touchstart", "auxclick", "contextmenu", "submit"]) {
    addEventListener(type, (e) => { if (mode !== "view" && !ours(e.target) && !e.target.isContentEditable) stop(e); }, true);
  }
  addEventListener("click", (e) => {
    if (mode === "view" || ours(e.target)) return;
    if (e.target.isContentEditable) return;
    stop(e);
    if (mode !== "comment") return;
    const el = e.target;
    if (!pickable(el)) return;
    const r = pageRect(el);
    const x = e.clientX + scrollX, y = e.clientY + scrollY;
    send({ t: "pick", sel: selector(el), label: label(el), tag: el.tagName.toLowerCase(), x, y, ex: r.x, ey: r.y, w: r.w, h: r.h,
      fx: r.w ? (x - r.x) / r.w : 0, fy: r.h ? (y - r.y) / r.h : 0 });
  }, true);
  addEventListener("dblclick", (e) => {
    if (mode === "view" || ours(e.target)) return;
    stop(e);
    if (mode === "edit" && pickable(e.target) && textLeaf(e.target)) { select(e.target); textEdit(e.target); }
  }, true);
  addEventListener("keydown", (e) => {
    if (e.key === "Escape" && mode !== "view") { select(null); showHover(null); }
  }, true);
  addEventListener("scroll", () => send({ t: "scroll", x: scrollX, y: scrollY }), { passive: true });

  // --- связь со страницей хаба -------------------------------------------------------------------------------------
  addEventListener("message", (e) => {
    const m = e.data;
    if (e.source !== parent || !ORIGINS.includes(e.origin) || !m || m.canvas !== 1) return;
    if (m.t === "hello") {
      hubOrigin = e.origin;
      if (m.props) propList = m.props;
      send({ t: "ready", path, w: innerWidth, h: innerHeight });
      sendHistory();
      watch();
    } else if (m.t === "mode") {
      mode = m.mode;
      pinsBox.classList.toggle("nopin", mode === "edit" || mode === "draw");
      document.documentElement.style.cursor = mode === "comment" ? "crosshair" : mode === "draw" ? "crosshair" : "";
      select(mode === "edit" ? selected : null);
      showHover(null);
    } else if (m.t === "pins") {
      pins = m.pins || [];
      drawings = m.drawings || [];
      drawPins();
      drawDrawings();
      if (m.edit) openEditor(m.edit);
    } else if (m.t === "apply") {
      for (const c of m.changes || []) {
        const el = find(c.sel);
        if (!el) continue;
        const s = track(el);
        Object.assign(s, { dx: c.dx || 0, dy: c.dy || 0, w: c.w ?? null, h: c.h ?? null, css: c.css || {} });
        if (c.x0 != null) Object.assign(s, { x0: c.x0, y0: c.y0, w0: c.w0, h0: c.h0 });
        if (c.t != null && c.t !== c.t0) { s.t0 = c.t0; s.t = c.t; }
        paintState(el);
      }
    } else if (m.t === "revert") {
      for (const el of [...touched]) if (state.get(el)?.sel === m.sel) revert(el);
      if (selected) sendSelected();
    } else if (m.t === "style") {
      setStyle(m.prop, m.value);
    } else if (m.t === "undo") {
      stepUndo();
    } else if (m.t === "redo") {
      stepRedo();
    } else if (m.t === "scroll") {
      scrollTo(m.x || 0, m.y || 0);
    }
  });

  // файл дизайна поменялся на диске (дизайнер внёс правки) — странице: перезагрузить предпросмотр
  let watching = false;
  function watch() {
    if (watching) return;
    watching = true;
    let last = null;
    const tick = async () => {
      try {
        const r = await fetch("/__canvas/stat?path=" + encodeURIComponent(path), { cache: "no-store" });
        if (r.ok) {
          const { mtime } = await r.json();
          if (last != null && mtime !== last) send({ t: "changed", mtime });
          last = mtime;
        }
      } catch { /* процесс перезапускается — следующий круг */ }
      setTimeout(tick, document.hidden ? 4000 : 1500);
    };
    tick();
  }
})();
