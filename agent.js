// Канвас дизайна: скрипт внутри предпросмотра (его подкладывает server.py). Рисует рамку под курсором, пины комментов и
// рамку выделения; тянуть, менять размер и текст — прямо в документе. Всё, что сделал владелец, уходит странице хаба
// (postMessage), она ведёт список и шлёт его дизайнеру. Файл на диске скрипт не трогает.
(() => {
  if (window.__canvasAgent || window.top === window) return;
  window.__canvasAgent = true;
  const ORIGINS = (window.__canvas && window.__canvas.origins) || [];
  let hubOrigin = null;
  let mode = "view";
  let pins = [];
  let editing = null;      // id пина, у которого открыто поле
  let selected = null;     // элемент, выбранный в режиме «двигать»
  let drag = null;
  const state = new WeakMap();   // элемент → {sel, label, x0, y0, w0, h0, t0, dx, dy, w, h, t, style}
  const touched = new Set();

  const path = (() => {
    const rest = decodeURIComponent(location.pathname.replace(/^\/f\//, ""));
    return /^[A-Za-z]:/.test(rest) ? rest : "/" + rest;
  })();

  const send = (msg) => { if (hubOrigin) parent.postMessage({ canvas: 1, ...msg }, hubOrigin); };

  // --- оверлей в тени: стили дизайна его не трогают, его — дизайн -------------------------------------------------
  const host = document.createElement("div");
  host.setAttribute("data-canvas-overlay", "");
  host.style.cssText = "all:initial;position:absolute;left:0;top:0;width:0;height:0;z-index:2147483647;pointer-events:none;";
  const root = host.attachShadow({ mode: "open" });
  root.innerHTML = `<style>
    :host{all:initial}
    *{box-sizing:border-box;font:13px/1.35 -apple-system,BlinkMacSystemFont,"Segoe UI",Inter,sans-serif}
    .hover{position:fixed;pointer-events:none;border:1.5px solid #7c5cff;background:rgba(124,92,255,.06);border-radius:2px;display:none}
    .hover i{position:absolute;left:-1.5px;top:-20px;background:#7c5cff;color:#fff;font-style:normal;font-size:11px;padding:1px 6px;border-radius:3px;white-space:nowrap;max-width:360px;overflow:hidden;text-overflow:ellipsis}
    .sel{position:fixed;border:1.5px solid #ff5c8a;display:none;pointer-events:none}
    .sel .grip{position:absolute;right:-6px;bottom:-6px;width:12px;height:12px;background:#fff;border:2px solid #ff5c8a;border-radius:3px;pointer-events:auto;cursor:nwse-resize}
    .sel .bar{position:absolute;left:-1.5px;top:-24px;display:flex;gap:4px;pointer-events:auto}
    .sel .bar span,.sel .bar button{background:#ff5c8a;color:#fff;border:0;border-radius:3px;font-size:11px;padding:2px 6px;white-space:nowrap}
    .sel .bar button{cursor:pointer;background:#222}
    .pin{position:absolute;width:26px;height:26px;margin:-26px 0 0 0;border-radius:13px 13px 13px 2px;background:#7c5cff;color:#fff;
      display:flex;align-items:center;justify-content:center;font-weight:600;font-size:12px;pointer-events:auto;cursor:pointer;
      box-shadow:0 2px 6px rgba(0,0,0,.3);border:2px solid #fff}
    .pin.sent{background:#9a9aa6}
    .pin.done{display:none}
    .ed{position:absolute;width:260px;background:#fff;color:#111;border-radius:8px;box-shadow:0 6px 24px rgba(0,0,0,.25);padding:8px;pointer-events:auto}
    .ed textarea{width:100%;min-height:64px;resize:vertical;border:1px solid #ddd;border-radius:6px;padding:6px;outline:none;color:#111;background:#fff}
    .ed textarea:focus{border-color:#7c5cff}
    .ed .row{display:flex;justify-content:space-between;margin-top:6px;gap:6px}
    .ed button{border:0;border-radius:6px;padding:4px 10px;cursor:pointer;background:#eee;color:#111}
    .ed button.ok{background:#7c5cff;color:#fff}
  </style><div class="hover"><i></i></div><div class="sel"><div class="bar"><span></span><button class="up" title="Выбрать родителя">↑</button><button class="undo" title="Вернуть как было">↺</button></div><div class="grip" title="Размер"></div></div><div class="pins"></div>`;
  const hoverBox = root.querySelector(".hover");
  const selBox = root.querySelector(".sel");
  const pinsBox = root.querySelector(".pins");
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

  const pickable = (el) => el && el.nodeType === 1 && !ours(el) && el !== document.documentElement && el !== document.body;
  const at = (x, y) => {
    host.style.display = "none";
    const el = document.elementFromPoint(x, y);
    host.style.display = "";
    return el;
  };

  // --- рамка под курсором ------------------------------------------------------------------------------------------
  function showHover(el) {
    if (!el || mode === "view" || drag) { hoverBox.style.display = "none"; return; }
    const r = el.getBoundingClientRect();
    Object.assign(hoverBox.style, { display: "block", left: r.left + "px", top: r.top + "px", width: r.width + "px", height: r.height + "px" });
    hoverBox.firstChild.textContent = `${short(el)}  ${Math.round(r.width)}×${Math.round(r.height)}`;
  }

  // --- пины --------------------------------------------------------------------------------------------------------
  function pinXY(p) {
    let el = null;
    try { el = p.sel ? document.querySelector(p.sel) : null; } catch { el = null; }
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
    if (ed && !pins.some((p) => p.id === ed.dataset.id && p.state === "draft")) ed.remove();
    place();
  }
  function place() {
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
        const { x, y } = pinXY(p);
        const left = Math.min(x + 18, scrollX + innerWidth - 270);
        ed.style.left = Math.max(scrollX + 4, left) + "px";
        ed.style.top = y + 4 + "px";
      }
    }
    if (selected) {
      const r = selected.getBoundingClientRect();
      Object.assign(selBox.style, { display: "block", left: r.left + "px", top: r.top + "px", width: r.width + "px", height: r.height + "px" });
    } else selBox.style.display = "none";
  }
  (function loop() { place(); requestAnimationFrame(loop); })();

  function openEditor(id) {
    const p = pins.find((q) => q.id === id);
    if (!p) return;
    root.querySelector(".ed")?.remove();
    editing = id;
    const ed = document.createElement("div");
    ed.className = "ed";
    ed.dataset.id = id;
    ed.innerHTML = `<textarea placeholder="Что поменять здесь?"></textarea><div class="row"><button class="del">Удалить</button><button class="ok">Готово</button></div>`;
    const ta = ed.querySelector("textarea");
    ta.value = p.text || "";
    const done = () => {
      const text = ta.value.trim();
      ed.remove();
      editing = null;
      send(text ? { t: "comment", id, text } : { t: "remove", id });
    };
    ed.addEventListener("pointerdown", (e) => e.stopPropagation());
    ed.addEventListener("click", (e) => e.stopPropagation());
    ta.addEventListener("keydown", (e) => {
      e.stopPropagation();
      if (e.key === "Enter" && !e.shiftKey && !e.isComposing) { e.preventDefault(); done(); }
      if (e.key === "Escape") { e.preventDefault(); if (!p.text && !ta.value.trim()) send({ t: "remove", id }); ed.remove(); editing = null; }
    });
    ed.querySelector(".ok").addEventListener("click", done);
    ed.querySelector(".del").addEventListener("click", () => { ed.remove(); editing = null; send({ t: "remove", id }); });
    root.append(ed);
    place();
    setTimeout(() => ta.focus({ preventScroll: true }), 0);
  }

  // --- правки руками -----------------------------------------------------------------------------------------------
  function track(el) {
    let s = state.get(el);
    if (!s) {
      const r = pageRect(el);
      s = { sel: selector(el), label: label(el), x0: r.x, y0: r.y, w0: r.w, h0: r.h, t0: null, dx: 0, dy: 0, w: null, h: null, t: null,
        style: { translate: el.style.translate, width: el.style.width, height: el.style.height, boxSizing: el.style.boxSizing } };
      state.set(el, s);
      touched.add(el);
    }
    return s;
  }
  const report = (el) => {
    const s = state.get(el);
    send({ t: "change", change: { sel: s.sel, label: s.label, x0: s.x0, y0: s.y0, w0: s.w0, h0: s.h0, dx: s.dx, dy: s.dy, w: s.w, h: s.h, t0: s.t0, t: s.t } });
  };
  function applyTo(el, c) {
    const s = track(el);
    Object.assign(s, { dx: c.dx || 0, dy: c.dy || 0, w: c.w ?? null, h: c.h ?? null });
    if (c.x0 != null) Object.assign(s, { x0: c.x0, y0: c.y0, w0: c.w0, h0: c.h0 });
    el.style.translate = s.dx || s.dy ? `${s.dx}px ${s.dy}px` : s.style.translate;
    if (s.w != null) { el.style.boxSizing = "border-box"; el.style.width = s.w + "px"; el.style.height = s.h + "px"; }
    if (c.t != null && c.t !== c.t0) { s.t0 = c.t0; s.t = c.t; el.textContent = c.t; }
  }
  function revert(el) {
    const s = state.get(el);
    if (!s) return;
    Object.assign(el.style, s.style);
    if (s.t != null && s.t0 != null) el.textContent = s.t0;
    state.delete(el);
    touched.delete(el);
  }
  const textLeaf = (el) => el.childNodes.length > 0 && [...el.childNodes].every((n) => n.nodeType === 3 || (n.nodeType === 1 && n.tagName === "BR"));

  function select(el) {
    selected = el;
    if (el) {
      selBox.querySelector(".bar span").textContent = short(el);
    }
    place();
  }
  selBox.querySelector(".up").addEventListener("pointerdown", (e) => {
    e.stopPropagation(); e.preventDefault();
    if (selected && pickable(selected.parentElement)) select(selected.parentElement);
  });
  selBox.querySelector(".undo").addEventListener("pointerdown", (e) => {
    e.stopPropagation(); e.preventDefault();
    if (!selected) return;
    const s = state.get(selected);
    if (s) { send({ t: "revert", sel: s.sel }); revert(selected); }
  });
  selBox.querySelector(".grip").addEventListener("pointerdown", (e) => {
    if (!selected) return;
    e.stopPropagation(); e.preventDefault();
    const s = track(selected);
    const r = selected.getBoundingClientRect();
    drag = { kind: "size", el: selected, sx: e.clientX, sy: e.clientY, bw: r.width, bh: r.height, moved: false };
    s.w = s.w ?? r.width; s.h = s.h ?? r.height;
  });

  function textEdit(el) {
    const s = track(el);
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
      report(el);
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

  // --- события документа: в режимах коммента и правки клики дизайну не достаются -----------------------------------
  const stop = (e) => { e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation(); };
  addEventListener("pointermove", (e) => {
    if (drag) {
      const ddx = e.clientX - drag.sx, ddy = e.clientY - drag.sy;
      if (Math.abs(ddx) + Math.abs(ddy) > 2) drag.moved = true;
      const s = state.get(drag.el);
      if (drag.kind === "move") {
        s.dx = Math.round(drag.bx + ddx); s.dy = Math.round(drag.by + ddy);
        drag.el.style.translate = `${s.dx}px ${s.dy}px`;
      } else {
        s.w = Math.max(4, Math.round(drag.bw + ddx)); s.h = Math.max(4, Math.round(drag.bh + ddy));
        drag.el.style.boxSizing = "border-box";
        drag.el.style.width = s.w + "px"; drag.el.style.height = s.h + "px";
      }
      return stop(e);
    }
    if (mode === "view") return;
    const el = e.target;
    showHover(pickable(el) ? el : null);
  }, true);
  addEventListener("pointerdown", (e) => {
    if (mode === "view" || e.button !== 0 || ours(e.target)) return;
    if (e.target.isContentEditable) return;
    stop(e);
    const el = e.target;
    if (!pickable(el)) return;
    if (mode === "move") {
      if (selected !== el) select(el);
      const s = track(el);
      drag = { kind: "move", el, sx: e.clientX, sy: e.clientY, bx: s.dx, by: s.dy, moved: false };
    }
  }, true);
  addEventListener("pointerup", (e) => {
    if (!drag) return;
    const d = drag;
    drag = null;
    if (d.moved) report(d.el);
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
    if (mode === "move" && pickable(e.target) && textLeaf(e.target)) { select(e.target); textEdit(e.target); }
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
      send({ t: "ready", path, w: innerWidth, h: innerHeight });
      watch();
    } else if (m.t === "mode") {
      mode = m.mode;
      document.documentElement.style.cursor = mode === "comment" ? "crosshair" : "";
      if (mode !== "move") select(null);
      showHover(null);
    } else if (m.t === "pins") {
      pins = m.pins || [];
      drawPins();
      if (m.edit) openEditor(m.edit);
    } else if (m.t === "apply") {
      for (const c of m.changes || []) {
        let el = null;
        try { el = document.querySelector(c.sel); } catch { el = null; }
        if (el) applyTo(el, c);
      }
    } else if (m.t === "revert") {
      for (const el of [...touched]) if (state.get(el)?.sel === m.sel) revert(el);
      if (selected && !state.get(selected)) select(selected);
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
