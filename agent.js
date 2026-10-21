// Hub Design: скрипт внутри предпросмотра (его подкладывает server.py). Рисует рамку под курсором, пины комментов, рамку
// выделения и рисунки; тянуть, менять размер, текст и стили — прямо в документе. Всё, что сделал владелец, уходит странице
// хаба (postMessage), она ведёт список и шлёт его дизайнеру. Файл на диске скрипт не трогает.
(() => {
  if (window.__canvasAgent || window.top === window) return;
  window.__canvasAgent = true;
  const ORIGINS = (window.__canvas && window.__canvas.origins) || [];
  let hubOrigin = null;
  let mode = "view";      // view | comment | edit | draw | text
  let tool = "select";    // инструмент холста: select | hand | text | note | comment | pencil | shape
  let shape = "free";     // что рисует «draw»: free | arrow | rect | oval
  let external = false;   // внутри холста: колесо, клавиши и редактор комментария уходят на страницу хаба
  let inv = 1;            // 1 / масштаб холста: рамки и пины остаются одного размера на экране
  let T = null;           // цвета хаба (переменных темы во фрейме нет — ядро присылает значениями)
  let pins = [];
  let drawings = [];
  let propList = [];      // свойства, значения которых нужны панели «Правка»
  let selected = null;    // элемент, выбранный в режимах «Правка» и «Комментарий»
  let framed = null;      // элемент, которому открыт комментарий
  let drag = null;
  let stroke = null;      // рисунок в процессе
  const state = new WeakMap();   // элемент → {sel, label, tag, x0, y0, w0, h0, t0, dx, dy, w, h, t, css, attr}
  const touched = new Set();
  const undo = [], redo = [];

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
    :host{all:initial;--a:#3b6fd4;--on:#fff;--bg:#fff;--fg:#1f1e1d;--bd:#d8d4cb;--mu:#8a8780;--s:1}
    *{box-sizing:border-box;font:13px/1.35 var(--font,-apple-system,BlinkMacSystemFont,"Segoe UI",Inter,sans-serif)}
    .hover{position:fixed;pointer-events:none;outline:calc(1px * var(--s)) solid var(--a);background:color-mix(in srgb,var(--a) 7%,transparent);display:none}
    .hover i{position:absolute;left:0;bottom:100%;transform:scale(var(--s));transform-origin:0 100%;background:var(--a);color:var(--on);font-style:normal;font-size:11px;padding:1px 6px;border-radius:3px;white-space:nowrap;max-width:360px;overflow:hidden;text-overflow:ellipsis}
    .sel,.frame{position:fixed;outline:calc(2px * var(--s)) solid var(--a);display:none;pointer-events:none}
    .sel .grip{position:absolute;right:calc(-5px * var(--s));bottom:calc(-5px * var(--s));width:10px;height:10px;transform:scale(var(--s));background:var(--bg);border:2px solid var(--a);border-radius:2px;pointer-events:auto;cursor:nwse-resize}
    .sel .bar{position:absolute;left:0;bottom:100%;transform:scale(var(--s));transform-origin:0 100%;display:flex;gap:3px;pointer-events:auto;padding-bottom:2px}
    .sel .bar span,.sel .bar button{background:var(--a);color:var(--on);border:0;border-radius:3px;font-size:11px;padding:2px 6px;white-space:nowrap}
    .sel .bar button{cursor:pointer}
    .pin{position:absolute;width:26px;height:26px;margin:-13px 0 0 -13px;transform:scale(var(--s));border-radius:13px 13px 13px 2px;background:var(--a);color:var(--on);
      display:flex;align-items:center;justify-content:center;font-weight:600;font-size:12px;pointer-events:auto;cursor:pointer;
      box-shadow:0 1px 5px rgba(0,0,0,.3);border:2px solid var(--bg)}
    .pin.sent{background:var(--mu)}
    .pin.lost{background:var(--bg);color:var(--a);border:2px dashed var(--a)}
    .nopin .pin{pointer-events:none}
    .pin.done{display:none}
    .ed{position:absolute;width:300px;background:var(--bg);color:var(--fg);border-radius:12px;box-shadow:0 8px 28px rgba(0,0,0,.22),0 0 0 1px var(--bd);padding:12px;pointer-events:auto}
    .ed h4{margin:0 0 8px;font-size:13px;font-weight:600;display:flex;justify-content:space-between;align-items:center}
    .ed h4 button{border:0;background:none;color:var(--mu);cursor:pointer;font-size:16px;line-height:1;padding:0 2px}
    .ed textarea{width:100%;min-height:62px;resize:vertical;border:1px solid var(--bd);border-radius:8px;padding:8px;outline:none;color:var(--fg);background:var(--bg)}
    .ed textarea:focus{border-color:var(--a)}
    .ed .row{display:flex;justify-content:space-between;margin-top:10px;gap:8px}
    .ed button.b{border:1px solid var(--bd);border-radius:8px;padding:5px 12px;cursor:pointer;background:var(--bg);color:var(--fg)}
    .ed button.go{background:var(--a);border-color:var(--a);color:var(--on)}
    .ed button.x,.ed button.del{border:0;color:var(--mu);background:none;padding:5px 8px}
    svg.draw{position:absolute;left:0;top:0;overflow:visible;pointer-events:none}
    svg.draw *{fill:none;stroke:var(--a);stroke-width:calc(3px * var(--s));stroke-linecap:round;stroke-linejoin:round}
    svg.draw .sent{stroke:var(--mu)}
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
  // элемент пина: сперва его селектор, но только если там всё ещё он (приметы совпали); иначе ищем по приметам во всём
  // документе. Не нашли — пин остаётся на своих координатах с пометкой «элемент не найден», на чужой не садится.
  const A = window.HubAnchor;
  const RECHECK = 300;           // не чаще: пока макет живёт анимацией, DOM меняется каждый кадр
  let domRev = 0;
  new MutationObserver(() => { domRev += 1; }).observe(document.documentElement, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ["id", "class"] });
  const bound = new Map();       // id пина → { el, lost, rev, at, key }
  function resolve(p) {
    const key = p.sel + "|" + (p.fp ? p.fp.text + p.fp.x + p.fp.y : "");
    const c = bound.get(p.id);
    const now = Date.now();
    if (c && c.key === key && (c.rev === domRev || now - c.at < RECHECK) && (!c.el || c.el.isConnected)) return c;
    let el = find(p.sel), lost = false;
    if (A && p.fp && !(el && A.matches(p.fp, el, pageRect))) {
      const hit = A.locate(p.fp, document, pageRect);
      el = hit ? hit.el : null;
      lost = !hit;
    } else if (!el) lost = !!p.fp;
    const r = { el, lost, rev: domRev, at: now, key };
    bound.set(p.id, r);
    if (A && p.fp) reportPin(p, r);
    return r;
  }
  const told = new Map();        // id → что страница уже знает про пин (чтобы не повторять)
  function reportPin(p, r) {
    const sel = r.el ? selector(r.el) : p.sel;
    const was = told.get(p.id);
    const now = (r.lost ? "lost|" : "ok|") + sel;
    if (was === now) return;
    told.set(p.id, now);
    if (r.lost === !!p.lost && sel === p.sel) return;
    const msg = { t: "pinfix", id: p.id, lost: r.lost, sel };
    if (r.el) {
      const b = pageRect(r.el);
      Object.assign(msg, { fp: A.fingerprint(r.el, b), label: label(r.el), ex: b.x, ey: b.y, w: b.w, h: b.h,
        x: b.x + p.fx * b.w, y: b.y + p.fy * b.h });
    }
    send(msg);
  }
  function pinXY(p) {
    const { el } = resolve(p);
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
        n.addEventListener("wheel", wheelOut, { passive: false });
        pinsBox.append(n);
      }
      n.textContent = String(p.n);
      n.className = "pin " + (p.state || "draft") + (p.lost ? " lost" : "");
      n.title = (p.lost ? "Элемент не найден — точка на прежнем месте. " : "") + (p.text || "");
    }
    for (const n of have.values()) n.remove();
    const ed = root.querySelector(".ed");
    if (ed && !pins.some((p) => p.id === ed.dataset.id && p.state === "draft")) { ed.remove(); framed = null; }
    place();
  }
  const NS = "http://www.w3.org/2000/svg";
  const arrowPath = (a, b) => {
    const ang = Math.atan2(b.y - a.y, b.x - a.x), h = 14;
    const w = (d) => `${Math.round(b.x - h * Math.cos(ang + d))} ${Math.round(b.y - h * Math.sin(ang + d))}`;
    return `M${a.x} ${a.y}L${b.x} ${b.y}M${w(-0.45)}L${b.x} ${b.y}L${w(0.45)}`;
  };
  function drawDrawings() {
    svg.replaceChildren(...drawings.filter((d) => d.state !== "done").map((d) => {
      const bx = d.box || {};
      const n = d.kind === "box" ? document.createElementNS(NS, "rect") : d.kind === "oval" ? document.createElementNS(NS, "ellipse") : document.createElementNS(NS, "path");
      if (d.kind === "box") Object.entries({ x: bx.x, y: bx.y, width: bx.w, height: bx.h, rx: 6 }).forEach(([k, v]) => n.setAttribute(k, v));
      else if (d.kind === "oval") Object.entries({ cx: bx.x + bx.w / 2, cy: bx.y + bx.h / 2, rx: bx.w / 2, ry: bx.h / 2 }).forEach(([k, v]) => n.setAttribute(k, v));
      else n.setAttribute("d", d.path.map((pt, i) => `${i ? "L" : "M"}${pt[0]} ${pt[1]}`).join(""));
      if (d.state === "sent") n.setAttribute("class", "sent");
      return n;
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
        const el = resolve(p).el;
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
    if (external) {   // окно комментария рисует страница хаба: во фрейме в масштабе холста оно стало бы крошечным
      const at = pinXY(p);
      send({ t: "editor", id, x: at.x - scrollX, y: at.y - scrollY });
      return;
    }
    const ed = document.createElement("div");
    ed.className = "ed";
    ed.dataset.id = id;
    ed.innerHTML = `<h4>Комментарий</h4><textarea placeholder="Что поменять здесь?"></textarea><div class="row"><span><button class="b x">Закрыть</button><button class="b del">Удалить</button></span><button class="b go">Отправить</button></div>`;
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
      if (e.key === "Enter" && !e.isComposing && !e.shiftKey) { e.preventDefault(); done(true); }
      if (e.key === "Escape") { e.preventDefault(); done(false); }
    });
    ed.querySelector(".go").addEventListener("click", () => done(true));
    ed.querySelector(".x").addEventListener("click", () => done(false));
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
      s = { sel: selector(el), label: label(el), tag: el.tagName.toLowerCase(), x0: r.x, y0: r.y, w0: r.w, h0: r.h, t0: null, dx: 0, dy: 0, w: null, h: null, t: null, css: {},
        attr: el.getAttribute("style") };
      state.set(el, s);
      touched.add(el);
    }
    return s;
  }
  const report = (el) => {
    const s = state.get(el);
    if (!s) return;
    send({ t: "change", change: { sel: s.sel, label: s.label, tag: s.tag, x0: s.x0, y0: s.y0, w0: s.w0, h0: s.h0, dx: s.dx, dy: s.dy, w: s.w, h: s.h, t0: s.t0, t: s.t, css: s.css } });
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
  // что записано в стиле макета (инлайн или правило таблицы стилей): computed отдаёт уже раскрытые дорожки, а нужна форма repeat(N, …)
  function declared(el, prop) {
    let v = el.style.getPropertyValue(prop);
    if (v) return v.trim();
    const walk = (rules) => {
      for (const r of rules) {
        if (r.cssRules && (r.media ? matchMedia(r.media.mediaText).matches : !r.selectorText)) walk(r.cssRules);
        if (!r.selectorText) continue;
        let hit = false;
        try { hit = el.matches(r.selectorText); } catch { /* чужой селектор */ }
        const x = hit ? r.style.getPropertyValue(prop) : "";
        if (x) v = x.trim();
      }
    };
    for (const sh of document.styleSheets) { try { walk(sh.cssRules); } catch { /* чужой домен */ } }
    return v;
  }
  function sendSelected() {
    if (!selected) { send({ t: "selected", sel: null }); return; }
    const cs = getComputedStyle(selected);
    const css = {};
    for (const p of propList) {
      let v = cs.getPropertyValue(p);
      if (/color$/.test(p) || p === "color") v = hex(v);
      css[p] = v;
    }
    const grid = /grid/.test(cs.display);
    send({ t: "selected", sel: selector(selected), label: label(selected), tag: selected.tagName.toLowerCase(), css, flex: /flex/.test(cs.display), grid, kids: selected.children.length,
      decl: grid ? declared(selected, "grid-template-columns") : "" });
  }
  function select(el) {
    selected = el;
    if (el) selBox.querySelector(".bar span").textContent = short(el);
    selBox.querySelector(".grip").style.display = mode === "edit" && el ? "" : "none";
    selBox.querySelector(".bar").style.display = mode === "edit" && el ? "" : "none";
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

  function setStyle(prop, value) { setStyles({ [prop]: value }); }
  function setStyles(map) {
    if (!selected) return;
    const s = track(selected);
    const before = snap(selected);
    for (const [prop, value] of Object.entries(map)) {
      const was = prop === "grid-template-columns" ? declared(selected, prop) : "";
      const from = s.css[prop] ? s.css[prop].from : was || getComputedStyle(selected).getPropertyValue(prop);
      s.css[prop] = { from: /color$/.test(prop) || prop === "color" ? hex(from) : from, to: value };
    }
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
  function finishShape(a, b, kind) {
    const bx = Math.min(a[0], b[0]), by = Math.min(a[1], b[1]), bw = Math.abs(b[0] - a[0]), bh = Math.abs(b[1] - a[1]);
    if (kind !== "arrow" && (bw < 8 || bh < 8)) return;
    if (kind === "arrow" && Math.hypot(bw, bh) < 12) return;
    const cx = Math.min(Math.max(bx + bw / 2 - scrollX, 0), innerWidth - 1), cy = Math.min(Math.max(by + bh / 2 - scrollY, 0), innerHeight - 1);
    const el = at(cx, cy);
    send({ t: "draw", drawing: { kind, sel: pickable(el) ? selector(el) : "", label: pickable(el) ? label(el) : "",
      box: { x: Math.round(bx), y: Math.round(by), w: Math.round(bw), h: Math.round(bh) }, from: { x: Math.round(a[0]), y: Math.round(a[1]) },
      to: { x: Math.round(b[0]), y: Math.round(b[1]) }, path: [[Math.round(a[0]), Math.round(a[1])], [Math.round(b[0]), Math.round(b[1])]] } });
  }
  function finishStroke() {
    const pts = stroke.pts;
    stroke.node.remove();
    const kindWas = stroke.kind;
    stroke = null;
    if (kindWas === "rect" || kindWas === "oval" || kindWas === "arrow") return finishShape(pts[0], pts[pts.length - 1], kindWas === "rect" ? "box" : kindWas);
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

  function paintShape(node, kind, a, b) {
    if (kind === "arrow") return node.setAttribute("d", arrowPath({ x: a[0], y: a[1] }, { x: b[0], y: b[1] }));
    const bx = Math.min(a[0], b[0]), by = Math.min(a[1], b[1]), bw = Math.abs(b[0] - a[0]), bh = Math.abs(b[1] - a[1]);
    const set = kind === "rect" ? { x: bx, y: by, width: bw, height: bh, rx: 6 } : { cx: bx + bw / 2, cy: by + bh / 2, rx: bw / 2, ry: bh / 2 };
    Object.entries(set).forEach(([k, v]) => node.setAttribute(k, v));
  }

  // --- события документа: в режимах коммента, правки и рисунка клики дизайну не достаются --------------------------
  const stop = (e) => { e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation(); };
  addEventListener("pointermove", (e) => {
    if (stroke) {
      const cur = [e.clientX + scrollX, e.clientY + scrollY];
      if (stroke.kind === "free") {
        stroke.pts.push(cur);
        stroke.node.setAttribute("d", stroke.pts.map((pt, i) => `${i ? "L" : "M"}${pt[0]} ${pt[1]}`).join(""));
      } else {
        stroke.pts = [stroke.pts[0], cur];
        paintShape(stroke.node, stroke.kind, stroke.pts[0], cur);
      }
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
      const node = document.createElementNS(NS, shape === "rect" ? "rect" : shape === "oval" ? "ellipse" : "path");
      svg.append(node);
      stroke = { kind: shape, pts: [[e.clientX + scrollX, e.clientY + scrollY]], node };
      return;
    }
    const el = e.target;
    if (!pickable(el)) return;
    if (mode === "text") { if (textLeaf(el)) { select(el); textEdit(el); } return; }
    if (mode === "edit") {
      if (selected !== el) select(el);
      else if (e.detail > 1) return;
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
    send({ t: "pick", sel: selector(el), fp: A ? A.fingerprint(el, r) : null, label: label(el), tag: el.tagName.toLowerCase(), x, y, ex: r.x, ey: r.y, w: r.w, h: r.h,
      fx: r.w ? (x - r.x) / r.w : 0, fy: r.h ? (y - r.y) / r.h : 0 });
  }, true);
  addEventListener("dblclick", (e) => {
    if (mode === "view" || ours(e.target)) return;
    stop(e);
    if (mode === "edit" && pickable(e.target) && textLeaf(e.target)) { select(e.target); textEdit(e.target); }
  }, true);
  // колесо без Ctrl/⌘ листает страницу внутри рамки, пока она длиннее окна (рамка — экранной высоты); иначе уходит холсту (зум, панорама)
  const wheelOut = (e) => {
    if (!external) return;
    const root = document.scrollingElement || document.documentElement;
    if (!(e.ctrlKey || e.metaKey) && Math.abs(e.deltaY) >= Math.abs(e.deltaX) && root.scrollHeight > innerHeight + 1) return;
    e.preventDefault();
    send({ t: "wheel", x: e.clientX, y: e.clientY, dx: e.deltaX, dy: e.deltaY, ctrl: e.ctrlKey || e.metaKey });
  };
  addEventListener("wheel", wheelOut, { passive: false });
  // клавиши холста, пока фокус во фрейме: пробел, буквы инструментов, Esc, масштаб, отмена
  const typing = (t) => t && (/^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName) || t.isContentEditable);
  const KEYS = /^[vhtncprf0]$/i;
  const keyOut = (down) => (e) => {
    if (!external || typing(e.target) || ours(e.target)) return;
    const mod = e.metaKey || e.ctrlKey;
    const mine = e.key === " " || e.key === "Escape" || (!mod && !e.altKey && (KEYS.test(e.key) || e.key === "!" || (e.shiftKey && e.key === "1"))) ||
      (mod && (/^[zZ=+\-]$/.test(e.key)));
    if (!mine) return;
    e.preventDefault();
    send({ t: "key", k: e.key, down, meta: e.metaKey, ctrl: e.ctrlKey, alt: e.altKey, shift: e.shiftKey });
  };
  addEventListener("keydown", (e) => {
    if (e.key === "Escape" && mode !== "view") { select(null); showHover(null); }
    keyOut(true)(e);
  }, true);
  addEventListener("keyup", keyOut(false), true);
  addEventListener("scroll", () => send({ t: "scroll", x: scrollX, y: scrollY }), { passive: true });

  // цвета хаба: рамки и пины в цвете акцента темы, окошки — в её фоне и шрифте
  function applyTheme(t) {
    if (!t) return;
    T = t;
    const set = (k, v) => v && host.style.setProperty(k, v);
    set("--a", t.primary); set("--on", t.onPrimary); set("--bg", t.bg); set("--fg", t.fg); set("--bd", t.border); set("--mu", t.muted); set("--font", t.font);
  }

  // --- крутилки: объявление макета (#hub-tweaks) и применение значений страницы хаба ------------------------------------
  // разбирает и проверяет страница хаба; здесь — только прочитать объявление, текущие значения и записать var/attr
  function tweaksDecl() {
    const node = document.getElementById("hub-tweaks");
    if (!node) return null;
    let spec = null;
    try { spec = JSON.parse(node.textContent || ""); } catch { return null; }
    if (!spec || typeof spec !== "object" || Array.isArray(spec)) return null;
    const root = document.documentElement, cs = getComputedStyle(root), cur = {};
    for (const [k, d] of Object.entries(spec).slice(0, 60)) {
      if (!d || typeof d !== "object") continue;
      const v = typeof d.var === "string" && d.var.startsWith("--") ? cs.getPropertyValue(d.var).trim() : "";
      cur[k] = v || (typeof d.attr === "string" && root.hasAttribute(d.attr) ? root.getAttribute(d.attr) : "");
    }
    return { spec, cur };
  }
  function applyTweaks(ops) {
    const root = document.documentElement;
    for (const o of ops || []) {
      if (o.kind === "var" && /^--[\w-]+$/.test(o.name)) { if (o.value == null) root.style.removeProperty(o.name); else root.style.setProperty(o.name, o.value); }
      else if (o.kind === "attr" && /^[a-z][\w:-]*$/i.test(o.name) && !/^(on|style$)/i.test(o.name)) { if (o.value == null) root.removeAttribute(o.name); else root.setAttribute(o.name, o.value); }
    }
    if (selected) place();
  }

  // --- ошибки макета: список собирает early.js (с самой загрузки), сюда — только отправка странице -------------------
  let errTimer = 0, errSent = "";
  function sendErrors() {
    errTimer = 0;
    const items = (window.__hdErrors || []).slice(-10);
    const key = JSON.stringify(items);
    if (key === errSent) return;
    errSent = key;
    send({ t: "errors", errors: items });
  }
  window.__hdOnError = () => { if (!errTimer) errTimer = setTimeout(sendErrors, 300); };

  // --- связь со страницей хаба -------------------------------------------------------------------------------------
  addEventListener("message", (e) => {
    const m = e.data;
    if (e.source !== parent || !ORIGINS.includes(e.origin) || !m || m.canvas !== 1) return;
    if (m.t === "hello") {
      hubOrigin = e.origin;
      if (m.props) propList = m.props;
      external = !!m.external;
      if (m.theme) applyTheme(m.theme);
      send({ t: "ready", path, tweaks: tweaksDecl(), w: innerWidth, h: innerHeight, dh: Math.max(document.documentElement.scrollHeight, document.body ? document.body.scrollHeight : 0) });
      sendHistory();
      errSent = "";
      sendErrors();
      watch();
    } else if (m.t === "mode") {
      mode = m.mode;
      tool = m.tool || tool;
      if (m.shape) shape = m.shape;
      pinsBox.classList.toggle("nopin", mode === "edit" || mode === "draw" || mode === "text");
      document.documentElement.style.cursor = mode === "comment" || mode === "draw" ? "crosshair" : mode === "text" ? "text" : "";
      select(mode === "edit" ? selected : null);
      showHover(null);
    } else if (m.t === "scale") {
      inv = 1 / Math.max(0.05, m.k || 1);
      host.style.setProperty("--s", String(inv));
    } else if (m.t === "theme") {
      applyTheme(m.theme);
    } else if (m.t === "deselect") {
      select(null);
    } else if (m.t === "unframe") {
      framed = null;
    } else if (m.t === "pins") {
      pins = m.pins || [];
      for (const id of [...bound.keys()]) if (!pins.some((p) => p.id === id)) { bound.delete(id); told.delete(id); }
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
      if (m.set) setStyles(m.set); else setStyle(m.prop, m.value);
    } else if (m.t === "undo") {
      stepUndo();
    } else if (m.t === "redo") {
      stepRedo();
    } else if (m.t === "scroll") {
      scrollTo(m.x || 0, m.y || 0);
    } else if (m.t === "tweaks") {
      applyTweaks(m.ops);
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
