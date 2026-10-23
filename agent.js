// Hub Design: the script inside the preview (server.py injects it). Draws the box under the cursor, comment pins, the
// selection box and drawings; dragging, resizing, text and style edits happen right in the document. Everything the user
// did goes to the hub page (postMessage), which keeps the list and sends it to the designer. The script never touches the
// file on disk. UI texts: en by default, ru when the hub page says so (`lang` in the hello and theme messages).
(() => {
  if (window.__canvasAgent || window.top === window) return;
  window.__canvasAgent = true;
  const ORIGINS = (window.__canvas && window.__canvas.origins) || [];
  let hubOrigin = null;
  let mode = "view";      // view | comment | edit | draw | text
  let tool = "select";    // canvas tool: select | hand | text | comment | pencil | shape
  let shape = "free";     // what "draw" draws: free | arrow | rect | oval
  let external = false;   // inside the canvas: the wheel, keys and the comment editor go to the hub page
  let inv = 1;            // 1 / canvas scale: boxes and pins keep one size on screen
  let T = null;           // hub colors (the frame has no theme variables: the page sends the values)
  let pins = [];
  let drawings = [];
  let propList = [];      // properties whose values the "Edit" panel needs
  let selected = null;    // the element selected in the Edit and Comment modes
  let framed = null;      // the element whose comment is open
  let drag = null;
  let stroke = null;      // the drawing in progress
  const state = new WeakMap();   // element → {sel, label, tag, x0, y0, w0, h0, t0, dx, dy, w, h, t, css, attr}
  const touched = new Set();
  const undo = [], redo = [];

  const path = (() => {
    const rest = decodeURIComponent(location.pathname.replace(/^\/f\//, ""));
    return /^[A-Za-z]:/.test(rest) ? rest : "/" + rest;
  })();

  const send = (msg) => { if (hubOrigin) parent.postMessage({ canvas: 1, ...msg }, hubOrigin); };

  // --- UI texts: en by default, ru when the hub page says so. Looked up at use time, never cached ----------------
  const STR = {
    en: {
      parent: "Select the parent element",
      revert: "Revert to original",
      resize: "Resize",
      lost: "Element not found. The point stays where it was. ",
      comment: "Comment",
      comment_ph: "What should change here?",
      close: "Close",
      delete: "Remove",
      send: "Send",
    },
    ru: {
      parent: "Выбрать родительский элемент",
      revert: "Вернуть как было",
      resize: "Изменить размер",
      lost: "Элемент не найден. Точка осталась на прежнем месте. ",
      comment: "Комментарий",
      comment_ph: "Что поменять здесь?",
      close: "Закрыть",
      delete: "Убрать",
      send: "Отправить",
    },
  };
  let lang = "en";   // from the `lang` field of the hello and theme messages; any language but ru shows English
  const t = (key) => (STR[lang] || STR.en)[key] ?? STR.en[key] ?? key;
  const normLang = (l) => (String(l || "").split("-")[0].toLowerCase() === "ru" ? "ru" : "en");

  // --- overlay in a shadow root: the design's styles do not touch it, and it does not touch the design -------------------------------------------------
  const host = document.createElement("div");
  host.setAttribute("data-canvas-overlay", "");
  host.style.cssText = "all:initial;position:absolute;left:0;top:0;width:0;height:0;z-index:2147483647;pointer-events:none;";
  const root = host.attachShadow({ mode: "open" });
  root.innerHTML = `<style>
    :host{all:initial;--sp-tight:4px;--sp-inner:8px;--g:#e93d82;--a:#3b6fd4;--on:#fff;--bg:#fff;--fg:#1f1e1d;--bd:#d8d4cb;--mu:#8a8780;--s:1}
    *{box-sizing:border-box;font:13px/1.35 var(--font,-apple-system,BlinkMacSystemFont,"Segoe UI",Inter,sans-serif)}
    .hover{position:fixed;pointer-events:none;outline:calc(1px * var(--s)) solid var(--a);background:color-mix(in srgb,var(--a) 7%,transparent);display:none}
    .hover.under i{bottom:auto;top:100%;transform-origin:0 0}
    .hover i{position:absolute;left:0;bottom:100%;transform:scale(var(--s));transform-origin:0 100%;background:var(--a);color:var(--on);font-style:normal;font-size:11px;padding:1px 6px;border-radius:3px;white-space:nowrap;max-width:360px;overflow:hidden;text-overflow:ellipsis}
    .sel,.frame{position:fixed;outline:calc(2px * var(--s)) solid var(--a);display:none;pointer-events:none}
    .sel .grip{position:absolute;width:10px;height:10px;transform:scale(var(--s));background:var(--bg);border:2px solid var(--a);border-radius:2px;pointer-events:auto}
    .sel .grip.nw{left:calc(-5px * var(--s));top:calc(-5px * var(--s));cursor:nwse-resize}
    .sel .grip.ne{right:calc(-5px * var(--s));top:calc(-5px * var(--s));cursor:nesw-resize}
    .sel .grip.sw{left:calc(-5px * var(--s));bottom:calc(-5px * var(--s));cursor:nesw-resize}
    .sel .grip.se{right:calc(-5px * var(--s));bottom:calc(-5px * var(--s));cursor:nwse-resize}
    .sel .bar{position:absolute;left:0;bottom:100%;transform:scale(var(--s));transform-origin:0 100%;display:flex;gap:var(--sp-tight);pointer-events:auto;padding-bottom:calc(var(--sp-inner) + 5px)}
    .sel.under .bar{bottom:auto;top:100%;transform-origin:0 0;padding-bottom:0;padding-top:calc(var(--sp-inner) + 5px)}
    .sel .bar span,.sel .bar button{background:var(--a);color:var(--on);border:0;border-radius:3px;font-size:11px;padding:2px 6px;white-space:nowrap}
    .sel .bar button{cursor:pointer}
    .pin{position:absolute;width:26px;height:26px;margin:-13px 0 0 -13px;transform:scale(var(--s));border-radius:13px 13px 13px 2px;background:var(--a);color:var(--on);
      display:flex;align-items:center;justify-content:center;font-weight:600;font-size:12px;pointer-events:auto;cursor:pointer;
      box-shadow:0 1px 5px rgba(0,0,0,.3);border:2px solid var(--bg)}
    .pin.sent{background:var(--mu)}
    .pin.lost{background:var(--bg);color:var(--a);border:2px dashed var(--a)}
    .rgn{position:absolute;border:calc(2px * var(--s)) solid var(--a);border-radius:4px;background:color-mix(in srgb,var(--a) 10%,transparent);pointer-events:none}
    .rgn.sent{border-color:var(--mu);background:color-mix(in srgb,var(--mu) 8%,transparent)}
    .rgn.lost,.rgn.live{border-style:dashed}
    .rgn.done{display:none}
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
    svg.snap{position:absolute;left:0;top:0;overflow:visible;pointer-events:none}
    svg.snap line{stroke:var(--g);stroke-width:calc(1px * var(--s))}
    svg.snap rect{fill:var(--g)}
    svg.snap text{fill:#fff;font:600 11px/1 var(--font,-apple-system,BlinkMacSystemFont,"Segoe UI",Inter,sans-serif);dominant-baseline:central;text-anchor:middle}
  </style><svg class="draw"></svg><svg class="snap"></svg><div class="hover"><i></i></div><div class="frame"></div><div class="sel"><div class="bar"><span></span><button class="up">↑</button><button class="rev">↺</button></div><i class="grip nw" data-h="nw"></i><i class="grip ne" data-h="ne"></i><i class="grip sw" data-h="sw"></i><i class="grip se" data-h="se"></i></div><div class="rgns"></div><div class="pins"></div>`;
  const hoverBox = root.querySelector(".hover");
  const selBox = root.querySelector(".sel");
  const frameBox = root.querySelector(".frame");
  const pinsBox = root.querySelector(".pins");
  const rgnsBox = root.querySelector(".rgns");
  const svg = root.querySelector("svg.draw");
  const snapSvg = root.querySelector("svg.snap");
  // texts of the overlay: the static ones and the open comment editor; called after the template, the editor and a language change
  const LABELS = [[".up", "title", "parent"], [".rev", "title", "revert"], [".grip", "title", "resize"], [".ed h4", "textContent", "comment"],
    [".ed textarea", "placeholder", "comment_ph"], [".ed .x", "textContent", "close"], [".ed .del", "textContent", "delete"], [".ed .go", "textContent", "send"]];
  function applyLabels() {
    for (const [sel, prop, key] of LABELS) for (const n of root.querySelectorAll(sel)) n[prop] = t(key);
  }
  applyLabels();
  const mount = () => { if (!host.isConnected) document.documentElement.appendChild(host); };
  mount();
  new MutationObserver(mount).observe(document.documentElement, { childList: true });

  const ours = (el) => el === host || (el && el.getRootNode && el.getRootNode() === root);

  // --- selector and label of an element ---------------------------------------------------------------------------------
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
      // unique and recognizable: with a class or id somewhere in the path, not a bare "a:nth-of-type(4)"
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

  // --- box under the cursor ------------------------------------------------------------------------------------------
  function showHover(el) {
    if (!el || mode === "view" || mode === "draw" || drag || el === selected) { hoverBox.style.display = "none"; return; }
    const r = el.getBoundingClientRect();
    // the label sits above the box; under it where the top edge is too near the window edge or the label would land on the selection's chips
    const sr = selected && selected.isConnected ? selected.getBoundingClientRect() : null;
    const onBar = !!sr && Math.abs(r.top - sr.top) < 34 * inv && r.left < sr.right && r.right > sr.left;
    hoverBox.classList.toggle("under", r.top < 24 * inv || onBar);
    Object.assign(hoverBox.style, { display: "block", left: r.left + "px", top: r.top + "px", width: r.width + "px", height: r.height + "px" });
    hoverBox.firstChild.textContent = `${short(el)}  ${Math.round(r.width)}×${Math.round(r.height)}`;
    // measured, not guessed: the label that still lands on the chips of the selection goes to the other side of its box, and is hidden if both sides collide
    const chips = selected && selBox.style.display !== "none" ? selBox.querySelector(".bar") : null;
    const hits = () => { if (!chips) return false; const a = hoverBox.firstChild.getBoundingClientRect(), b = chips.getBoundingClientRect(); return a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top; };
    hoverBox.firstChild.style.visibility = "";
    if (hits()) { hoverBox.classList.toggle("under"); if (hits()) hoverBox.firstChild.style.visibility = "hidden"; }
  }

  // --- pins --------------------------------------------------------------------------------------------------------
  // the pin's element: its selector first, but only if it is still the same element (fingerprint matches); otherwise search by fingerprint in the whole
  // document. Not found: the pin stays at its coordinates marked "element not found" and never lands on a foreign element.
  const A = window.HubAnchor;
  const RECHECK = 300;           // not more often: while the design animates, the DOM changes every frame
  let domRev = 0;
  new MutationObserver(() => { domRev += 1; }).observe(document.documentElement, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ["id", "class"] });
  const bound = new Map();       // pin id → { el, lost, rev, at, key }
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
  const told = new Map();        // id → what the page already knows about the pin (to avoid repeating it)
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
  // the area of a region comment in page px: it follows its element (fractions of its box), without one — the saved numbers
  function areaRect(p) {
    const a = p.area;
    if (!a) return null;
    const { el } = resolve(p);
    const r = el ? pageRect(el) : null;
    if (r && (r.w || r.h) && a.fw != null) return { x: r.x + p.fx * r.w, y: r.y + p.fy * r.h, w: a.fw * r.w, h: a.fh * r.h };
    return { x: p.x, y: p.y, w: a.w, h: a.h };
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
      n.title = (p.lost ? t("lost") : "") + (p.text || "");
    }
    for (const n of have.values()) n.remove();
    const haveR = new Map([...rgnsBox.children].map((n) => [n.dataset.id, n]));
    for (const p of pins) {
      if (!p.area) continue;
      let n = haveR.get(p.id);
      haveR.delete(p.id);
      if (!n) { n = document.createElement("div"); n.dataset.id = p.id; rgnsBox.append(n); }
      n.className = "rgn " + (p.state || "draft") + (p.lost ? " lost" : "");
    }
    for (const n of haveR.values()) n.remove();
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
    for (const n of [svg, snapSvg]) {
      n.style.width = document.documentElement.scrollWidth + "px";
      n.style.height = document.documentElement.scrollHeight + "px";
    }
    for (const n of pinsBox.children) {
      const p = pins.find((q) => q.id === n.dataset.id);
      if (!p) continue;
      const { x, y } = pinXY(p);
      n.style.left = x + "px";
      n.style.top = y + "px";
    }
    for (const n of rgnsBox.children) {
      const p = pins.find((q) => q.id === n.dataset.id);
      const r = p && areaRect(p);
      if (r) Object.assign(n.style, { left: r.x + "px", top: r.y + "px", width: r.w + "px", height: r.h + "px" });
    }
    const ed = root.querySelector(".ed");
    if (ed) {
      const p = pins.find((q) => q.id === ed.dataset.id);
      if (p) {
        const el = resolve(p).el;
        const r = areaRect(p) || (el ? pageRect(el) : { x: p.x, y: p.y, w: 0, h: 0 });
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
    if (node === selBox) node.classList.toggle("under", r.top < 34 * inv);   // no room above: the chips go under the box
    Object.assign(node.style, { display: "block", left: r.left + "px", top: r.top + "px", width: r.width + "px", height: r.height + "px" });
  }
  (function loop() { place(); requestAnimationFrame(loop); })();

  function openEditor(id) {
    const p = pins.find((q) => q.id === id);
    if (!p) return;
    root.querySelector(".ed")?.remove();
    framed = find(p.sel);
    if (external) {   // the hub page draws the comment window: inside the frame at canvas scale it would be tiny
      const at = pinXY(p);
      send({ t: "editor", id, x: at.x - scrollX, y: at.y + (areaRect(p) || { h: 0 }).h - scrollY });
      return;
    }
    const ed = document.createElement("div");
    ed.className = "ed";
    ed.dataset.id = id;
    ed.innerHTML = `<h4></h4><textarea></textarea><div class="row"><span><button class="b x"></button><button class="b del"></button></span><button class="b go"></button></div>`;
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
    applyLabels();
    place();
    setTimeout(() => ta.focus({ preventScroll: true }), 0);
  }

  // --- smart guides ------------------------------------------------------------------------------------------------
  // while an element is dragged or resized it sticks to the lines of the other elements and of the design frame (snap.js), pink lines
  // show the alignment and the labels show the gaps to the neighbours. Alt / Cmd: no snapping
  const H = window.HubSnap;
  const SNAP_PX = 6;             // the pull distance on the screen, in px of the canvas (scaled by 1/zoom inside the design)
  const SNAP_MAX = 600;          // the other elements looked at in a big document
  const SKIP_TAGS = /^(script|style|link|meta|head|br|template|noscript|title|source|track|option)$/i;
  function snapScene(el) {
    if (!H) return { others: [], frame: null };
    const root = document.documentElement;
    const frame = { x: 0, y: 0, w: root.scrollWidth, h: root.scrollHeight };
    const seen = new Set();
    const others = [];
    const all = document.body ? document.body.getElementsByTagName("*") : [];
    for (let i = 0; i < all.length && others.length < SNAP_MAX; i++) {
      const n = all[i];
      if (n === el || el.contains(n) || ours(n) || SKIP_TAGS.test(n.tagName)) continue;
      const r = pageRect(n);
      if (r.w < 2 || r.h < 2) continue;
      const key = [r.x, r.y, r.w, r.h].map(Math.round).join(",");
      if (seen.has(key) || (r.w >= frame.w && r.h >= frame.h)) continue;
      if (getComputedStyle(n).visibility === "hidden") continue;
      seen.add(key);
      others.push(r);
    }
    return { others, frame };
  }
  const svgNode = (name, attrs) => {
    const n = document.createElementNS(NS, name);
    for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
    return n;
  };
  // the pill with a distance: it stays the same size on the screen at any canvas zoom
  function pill(x, y, text) {
    const g = svgNode("g", { transform: `translate(${x} ${y}) scale(${inv})` });
    const w = String(text).length * 7 + 10;
    g.append(svgNode("rect", { x: -w / 2, y: -8, width: w, height: 16, rx: 3 }), svgNode("text", { x: 0, y: 0 }));
    g.lastChild.textContent = text;
    return g;
  }
  function drawSnap(d, s, free) {
    if (!H || free) { clearSnap(); return; }
    const box = { x: d.r0.x + (s.dx - d.bx), y: d.r0.y + (s.dy - d.by), w: s.w != null ? s.w : d.r0.w, h: s.h != null ? s.h : d.r0.h };
    const nodes = [];
    for (const l of H.guides(box, d.others, d.frame)) {
      nodes.push(l.axis === "x" ? svgNode("line", { x1: l.at, x2: l.at, y1: l.from, y2: l.to }) : svgNode("line", { y1: l.at, y2: l.at, x1: l.from, x2: l.to }));
    }
    for (const g of H.gaps(box, d.others)) {
      const mid = (g.from + g.to) / 2;
      nodes.push(g.axis === "x" ? svgNode("line", { x1: g.from, x2: g.to, y1: g.at, y2: g.at }) : svgNode("line", { y1: g.from, y2: g.to, x1: g.at, x2: g.at }));
      nodes.push(g.axis === "x" ? pill(mid, g.at, g.d) : pill(g.at, mid, g.d));
    }
    snapSvg.replaceChildren(...nodes);
  }
  const clearSnap = () => snapSvg.replaceChildren();

  // --- hand edits -----------------------------------------------------------------------------------------------
  // the shift the element already has (from the file: our earlier write, or the design's own): a new drag goes on from it, it never snaps back to 0
  const parseShift = (v) => {
    const m = /^(-?[\d.]+)px(?:\s+(-?[\d.]+)px)?(?:\s+0px)?$/.exec(String(v || "").trim());
    return m ? [Number(m[1]), Number(m[2] || 0)] : [0, 0];
  };
  function track(el) {
    let s = state.get(el);
    if (!s) {
      const r = pageRect(el);
      const [sx, sy] = parseShift(el.style.translate || getComputedStyle(el).translate);
      s = { sel: selector(el), label: label(el), tag: el.tagName.toLowerCase(), x0: r.x, y0: r.y, w0: r.w, h0: r.h, t0: null, dx: sx, dy: sy, w: null, h: null, t: null, css: {},
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
  // rebuild the element's look from its record: original style, then shift, size, styles; text separately
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
  // one step of the history is a list of elements: recoloring a text color across the design is one step, one Ctrl+Z
  function commitMany(items) {
    undo.push({ items });
    if (undo.length > 100) undo.shift();
    redo.length = 0;
    sendHistory("commit");
    for (const i of items) report(i.el);
    sendSelected();
  }
  const commit = (el, before) => commitMany([{ el, before, after: snap(el) }]);
  function restore(el, to) {
    const s = track(el);
    Object.assign(s, JSON.parse(JSON.stringify(to)));
    paintState(el);
    report(el);
    if (el === selected) sendSelected();
  }
  const sendHistory = (why = "") => { send({ t: "history", undo: undo.length, redo: redo.length, why }); sendColors(); };
  function stepUndo() {
    const h = undo.pop();
    if (h) { for (const i of h.items) restore(i.el, i.before); redo.push(h); }
    sendHistory("undo");
  }
  function stepRedo() {
    const h = redo.pop();
    if (h) { for (const i of h.items) restore(i.el, i.after); undo.push(h); }
    sendHistory("redo");
  }
  function revert(el) {
    const s = state.get(el);
    if (!s) return;
    if (s.attr == null) el.removeAttribute("style"); else el.setAttribute("style", s.attr);
    if (s.t0 != null) el.textContent = s.t0;
    state.delete(el);
    touched.delete(el);
    for (const list of [undo, redo]) {   // a removed edit leaves no steps behind
      for (let i = list.length - 1; i >= 0; i--) { list[i].items = list[i].items.filter((x) => x.el !== el); if (!list[i].items.length) list.splice(i, 1); }
    }
    sendHistory("revert");
  }
  // --- the text colors of the design: one entry per distinct color, the most used first; the panel recolors one of them across the whole design ---
  const TEXT_MAX = 1500, COLORS_MAX = 12;
  const carriesText = (el) => [...el.childNodes].some((n) => n.nodeType === 3 && n.nodeValue.trim());
  function eachText(fn) {
    let n = 0;
    for (const el of document.body ? document.body.querySelectorAll("*") : []) {
      if (++n > TEXT_MAX) break;
      if (ours(el) || SKIP_TAGS.test(el.tagName) || !carriesText(el)) continue;
      const cs = getComputedStyle(el);
      if (cs.display === "none" || cs.visibility === "hidden") continue;
      fn(el, hex(cs.color));
    }
  }
  // the custom properties of the root that hold a color: {hex: "--name"} — the first name for a color
  function colorVars() {
    const out = {};
    const probe = document.createElement("i");
    document.documentElement.append(probe);
    const cs = getComputedStyle(document.documentElement);
    const names = new Set();
    for (const sheet of document.styleSheets) {
      let rules = [];
      try { rules = sheet.cssRules; } catch { continue; }
      for (const r of rules) {
        if (!r.style || !/^(:root|html)$/.test(r.selectorText || "")) continue;
        for (const p of r.style) if (p.startsWith("--")) names.add(p);
      }
    }
    for (const name of [...names].slice(0, 200)) {
      const v = cs.getPropertyValue(name).trim();
      if (!v) continue;
      probe.style.color = "";
      probe.style.color = v;
      if (!probe.style.color) continue;
      const c = hex(getComputedStyle(probe).color);
      if (c !== "transparent" && !(c in out)) out[c] = name;
    }
    probe.remove();
    return out;
  }
  let colorsSent = "";
  function sendColors() {
    if (!external) return;
    const groups = new Map();
    eachText((el, c) => {
      if (c === "transparent") return;
      let g = groups.get(c);
      if (!g) groups.set(c, g = { color: c, n: 0, sample: "" });
      g.n += 1;
      if (!g.sample) g.sample = el.textContent.trim().replace(/\s+/g, " ").slice(0, 24);
    });
    const list = [...groups.values()].sort((a, b) => b.n - a.n).slice(0, COLORS_MAX);
    if (list.length) { const vars = colorVars(); for (const g of list) if (vars[g.color]) g.via = vars[g.color]; }
    const sig = JSON.stringify(list);
    if (sig === colorsSent) return;
    colorsSent = sig;
    send({ t: "colors", list });
  }
  // every text of the color `from` gets the color `to`: each element is an ordinary edit of its own (it goes into the file as a style), all of them are one step of the history
  function recolor(from, to) {
    const hit = [];
    eachText((el, c) => { if (c === from) hit.push(el); });
    const items = hit.map((el) => {
      const s = track(el);
      const before = snap(el);
      s.css.color = { from: s.css.color ? s.css.color.from : from, to };
      paintState(el);
      return { el, before, after: null };
    });
    if (!items.length) return;
    for (const i of items) i.after = snap(i.el);
    commitMany(items);
  }
  const textLeaf = (el) => el.childNodes.length > 0 && [...el.childNodes].every((n) => n.nodeType === 3 || (n.nodeType === 1 && n.tagName === "BR"));

  // --- the selected element and its properties for the panel ------------------------------------------------------------------
  const hex = (v) => {
    const m = /^rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)$/.exec(v);
    if (!m) return v;
    if (m[4] === "0") return "transparent";
    return "#" + [m[1], m[2], m[3]].map((n) => Number(n).toString(16).padStart(2, "0")).join("");
  };
  // what the design's style declares (inline or a stylesheet rule): computed gives already expanded tracks, but the repeat(N, …) form is needed
  function declared(el, prop) {
    let v = el.style.getPropertyValue(prop);
    if (v) return v.trim();
    const walk = (rules) => {
      for (const r of rules) {
        if (r.cssRules && (r.media ? matchMedia(r.media.mediaText).matches : !r.selectorText)) walk(r.cssRules);
        if (!r.selectorText) continue;
        let hit = false;
        try { hit = el.matches(r.selectorText); } catch { /* a foreign selector */ }
        const x = hit ? r.style.getPropertyValue(prop) : "";
        if (x) v = x.trim();
      }
    };
    for (const sh of document.styleSheets) { try { walk(sh.cssRules); } catch { /* a foreign origin */ } }
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
    if (el) hoverBox.style.display = "none";   // the box under the cursor would sit on the chips of the selection until the next move
    if (el) selBox.querySelector(".bar span").textContent = short(el);
    for (const n of selBox.querySelectorAll(".grip")) n.style.display = mode === "edit" && el ? "" : "none";
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
  for (const grip of selBox.querySelectorAll(".grip")) grip.addEventListener("pointerdown", (e) => {
    if (!selected) return;
    e.stopPropagation(); e.preventDefault();
    const s = track(selected);
    const r = selected.getBoundingClientRect();
    drag = { kind: "size", h: grip.dataset.h, el: selected, sx: e.clientX, sy: e.clientY, bx: s.dx, by: s.dy, r0: pageRect(selected), moved: false, before: snap(selected), ...snapScene(selected) };
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
      getSelection().removeAllRanges();
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

  // --- freehand drawing -------------------------------------------------------------------------------------------
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

  // --- document events: in the comment, edit and draw modes clicks do not reach the design --------------------------
  const stop = (e) => { e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation(); };
  // a comment on an area: the press-and-drag in the comment mode draws a rectangle (a plain click stays a pin). A shorter drag is a click
  const MARQ_MIN = 8;
  let marq = null, swallow = 0;
  for (const type of ["pointercancel", "blur"]) addEventListener(type, () => { if (marq) { if (marq.node) marq.node.remove(); marq = null; } });
  const marqRect = (m, e) => {
    const x = e.clientX + scrollX, y = e.clientY + scrollY;
    return { x: Math.round(Math.min(m.x0, x)), y: Math.round(Math.min(m.y0, y)), w: Math.round(Math.abs(x - m.x0)), h: Math.round(Math.abs(y - m.y0)) };
  };
  // the elements that sit in the area: the innermost ones that mostly lie inside it or fill a noticeable part of it (at most 8, the biggest overlap first)
  const SKIP = /^(script|style|link|meta|br|head|title|noscript|template)$/i;
  function inside(anchor, a) {
    const out = [], share = new Map();
    for (const el of anchor.querySelectorAll("*")) {
      if (share.size > 400) break;
      if (ours(el) || SKIP.test(el.tagName) || (el.closest("svg") && el.tagName.toLowerCase() !== "svg")) continue;
      const r = pageRect(el);
      if (!(r.w > 1 && r.h > 1)) continue;
      const ix = Math.min(a.x + a.w, r.x + r.w) - Math.max(a.x, r.x), iy = Math.min(a.y + a.h, r.y + r.h) - Math.max(a.y, r.y);
      if (ix <= 0 || iy <= 0) continue;
      const part = (ix * iy) / (a.w * a.h);
      if (ix * iy < 0.6 * r.w * r.h && part < 0.15) continue;
      out.push(el); share.set(el, part);
    }
    return out.filter((el) => !out.some((o) => o !== el && el.contains(o))).sort((p, q) => share.get(q) - share.get(p));
  }
  function regionPick(a) {
    const mid = at(a.x + a.w / 2 - scrollX, a.y + a.h / 2 - scrollY);
    let anchor = mid && mid.nodeType === 1 && !ours(mid) ? mid : document.body;
    while (anchor !== document.body && anchor.parentElement) {
      const r = pageRect(anchor);
      if (r.x <= a.x + 1 && r.y <= a.y + 1 && r.x + r.w >= a.x + a.w - 1 && r.y + r.h >= a.y + a.h - 1) break;
      anchor = anchor.parentElement;
    }
    const r = pageRect(anchor);
    const list = inside(anchor, a);
    const body = anchor === document.body || anchor === document.documentElement;
    send({ t: "pick", sel: selector(anchor), fp: !body && A ? A.fingerprint(anchor, r) : null, label: label(anchor), tag: anchor.tagName.toLowerCase(),
      x: a.x, y: a.y, ex: r.x, ey: r.y, w: r.w, h: r.h, fx: r.w ? (a.x - r.x) / r.w : 0, fy: r.h ? (a.y - r.y) / r.h : 0,
      area: { w: a.w, h: a.h, fw: r.w ? a.w / r.w : null, fh: r.h ? a.h / r.h : null },
      els: list.slice(0, 8).map((el) => ({ sel: selector(el), label: label(el).slice(0, 60), tag: el.tagName.toLowerCase() })), more: Math.max(0, list.length - 8) });
  }
  addEventListener("pointermove", (e) => {
    if (marq) {
      if (!marq.moved && Math.abs(e.clientX - marq.cx) + Math.abs(e.clientY - marq.cy) < MARQ_MIN) return stop(e);
      marq.moved = true;
      showHover(null);
      if (!marq.node) { marq.node = document.createElement("div"); marq.node.className = "rgn live"; rgnsBox.append(marq.node); }
      const a = marqRect(marq, e);
      Object.assign(marq.node.style, { left: a.x + "px", top: a.y + "px", width: a.w + "px", height: a.h + "px" });
      return stop(e);
    }
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
      const free = e.altKey || e.metaKey;   // Alt / Cmd: no snapping
      const thr = SNAP_PX * inv;
      const r0 = drag.r0;
      if (!H) {
        if (drag.kind === "move") { s.dx = Math.round(drag.bx + ddx); s.dy = Math.round(drag.by + ddy); }
        else { s.w = Math.max(4, Math.round(r0.w + ddx)); s.h = Math.max(4, Math.round(r0.h + ddy)); }
      } else if (drag.kind === "move") {
        const b = H.snapMove({ x: r0.x + ddx, y: r0.y + ddy, w: r0.w, h: r0.h }, drag.others, drag.frame, thr, free);
        s.dx = Math.round(drag.bx + b.x - r0.x); s.dy = Math.round(drag.by + b.y - r0.y);
      } else {
        const b = H.snapResize(drag.h, r0, ddx, ddy, drag.others, drag.frame, thr, { keep: e.shiftKey, alt: free });
        s.w = Math.round(b.w); s.h = Math.round(b.h);
        s.dx = Math.round(drag.bx + b.x - r0.x); s.dy = Math.round(drag.by + b.y - r0.y);
      }
      paintState(drag.el);
      drawSnap(drag, s, free);
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
    if (mode === "comment") { marq = { cx: e.clientX, cy: e.clientY, x0: e.clientX + scrollX, y0: e.clientY + scrollY, moved: false, node: null }; return; }
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
      drag = { kind: "move", el, sx: e.clientX, sy: e.clientY, bx: s.dx, by: s.dy, r0: pageRect(el), moved: false, before: snap(el), ...snapScene(el) };
    }
  }, true);
  addEventListener("pointerup", (e) => {
    if (marq) {
      const m = marq;
      marq = null;
      if (m.node) m.node.remove();
      if (!m.moved) return;   // a click: the "click" event below makes the pin
      swallow = Date.now();
      stop(e);
      return regionPick(marqRect(m, e));
    }
    if (stroke) { finishStroke(); return stop(e); }
    if (!drag) return;
    const d = drag;
    drag = null;
    clearSnap();
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
    if (Date.now() - swallow < 400) return;   // the click that ends a drag has already made a region
    // a click on the empty background of the design pins to the body: a comment is placed on every first click
    const el = pickable(e.target) ? e.target : document.body;
    if (!el || ours(e.target)) return;
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
  // the wheel without Ctrl/⌘ scrolls the page inside the frame while it is taller than the window (the frame is screen height); otherwise it goes to the canvas (zoom, pan)
  const wheelOut = (e) => {
    if (!external) return;
    const root = document.scrollingElement || document.documentElement;
    if (!(e.ctrlKey || e.metaKey) && Math.abs(e.deltaY) >= Math.abs(e.deltaX) && root.scrollHeight > innerHeight + 1) return;
    e.preventDefault();
    send({ t: "wheel", x: e.clientX, y: e.clientY, dx: e.deltaX, dy: e.deltaY, ctrl: e.ctrlKey || e.metaKey });
  };
  addEventListener("wheel", wheelOut, { passive: false });
  // canvas keys while the focus is in the frame: space, tool letters, Esc, zoom, undo
  const typing = (t) => t && (/^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName) || t.isContentEditable);
  const KEYS = /^[vhtncprf0]$/i;
  const LATIN = { KeyZ: "z", Equal: "=", Minus: "-" };
  const keyOut = (down) => (e) => {
    if (!external || typing(e.target) || ours(e.target)) return;
    const mod = e.metaKey || e.ctrlKey;
    // with another layout (not Latin) a shortcut is still the key by its place
    const k = mod && LATIN[e.code] ? LATIN[e.code] : e.key;
    const mine = k === " " || k === "Escape" || (!mod && !e.altKey && (KEYS.test(k) || k === "!" || (e.shiftKey && k === "1"))) ||
      (mod && (/^[zZ=+\-]$/.test(k)));
    if (!mine) return;
    e.preventDefault();
    send({ t: "key", k, down, meta: e.metaKey, ctrl: e.ctrlKey, alt: e.altKey, shift: e.shiftKey });
  };
  addEventListener("keydown", (e) => {
    if (e.key === "Escape" && mode !== "view") { select(null); showHover(null); }
    keyOut(true)(e);
  }, true);
  addEventListener("keyup", keyOut(false), true);
  addEventListener("scroll", () => send({ t: "scroll", x: scrollX, y: scrollY }), { passive: true });

  // hub colors: boxes and pins in the theme accent, popups in its background and font
  function applyTheme(th) {
    if (!th) return;
    T = th;
    const set = (k, v) => v && host.style.setProperty(k, v);
    set("--a", th.primary); set("--on", th.onPrimary); set("--bg", th.bg); set("--fg", th.fg); set("--bd", th.border); set("--mu", th.muted); set("--font", th.font);
  }
  // the page names its language in hello and theme; a change re-labels the overlay and the pins
  function setLang(l) {
    if (l == null) return;
    const next = normLang(l);
    if (next === lang) return;
    lang = next;
    applyLabels();
    drawPins();
  }

  // --- tweaks: the design's declaration (#hub-tweaks) and applying values from the hub page ------------------------------------
  // the hub page parses and validates; here we only read the declaration and current values and write var/attr
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
    return { spec, cur, probe: probeColors(spec) };
  }
  // an enum like bg: ink/blue/cream whose names say "color": what each option looks like (the page background with the attribute set) and which CSS
  // variable carries it (the page paints its own color into that variable). Done with transitions off and the attribute put back.
  const COLORISH = /(^|[^a-z])(bg|background|colou?r|fill|tint|accent|theme|palette)|\u0444\u043e\u043d|\u0446\u0432\u0435\u0442/i;
  const clearColor = (c) => !c || c === "transparent" || /^rgba\(0, 0, 0, 0\)$/.test(c);
  function probeColors(spec) {
    const root = document.documentElement, out = {};
    const keys = Object.entries(spec).filter(([k, d]) => d && d.editor !== "color" && Array.isArray(d.options) && d.options.length > 1 && d.options.length <= 12 && typeof d.attr === "string"
      && /^[a-z][\w:-]*$/i.test(d.attr) && COLORISH.test(k + " " + (d.label || "")));
    if (!keys.length) return out;
    const off = document.createElement("style");
    off.textContent = "*,*::before,*::after{transition:none!important;animation:none!important}";
    root.append(off);
    const names = new Set();
    try { for (const sh of document.styleSheets) for (const r of sh.cssRules || []) for (const m of String(r.cssText).matchAll(/--[\w-]{1,60}(?=\s*:)/g)) names.add(m[0]); } catch {}
    const box = document.createElement("div");
    box.style.cssText = "position:absolute;width:0;height:0;visibility:hidden";
    (document.body || root).append(box);
    // the page paints its background on the body, the root or (often) on the biggest wrapper inside: that one is found once and read for every option
    let host = null;
    const findHost = () => {
      for (const n of [document.body, root]) if (n && !clearColor(getComputedStyle(n).backgroundColor)) return n;
      let best = null, area = 0;
      for (const n of [...(document.body ? document.body.querySelectorAll("*") : [])].slice(0, 600)) {
        const r = n.getBoundingClientRect(), a = r.width * r.height;
        if (a > area && !clearColor(getComputedStyle(n).backgroundColor)) { best = n; area = a; }
      }
      return best;
    };
    const surface = () => {
      if (!host) host = findHost();
      return host ? getComputedStyle(host).backgroundColor : "";
    };
    const resolved = (v) => { box.style.backgroundColor = ""; box.style.backgroundColor = `var(${v})`; return getComputedStyle(box).backgroundColor; };
    try {
      for (const [k, d] of keys) {
        const was = root.getAttribute(d.attr);
        const colors = {}, per = {};
        for (const o of d.options) {
          root.setAttribute(d.attr, String(o));
          colors[o] = surface();
          per[o] = new Map([...names].map((v) => [v, resolved(v)]));
        }
        const cands = [...names].filter((v) => d.options.every((o) => colors[o] && per[o].get(v) === colors[o]));
        const via = cands.find((v) => /bg|background/i.test(v)) || cands[0] || "";
        if (was == null) root.removeAttribute(d.attr); else root.setAttribute(d.attr, was);
        out[k] = { colors, via };
      }
    } finally { box.remove(); off.remove(); }
    return out;
  }
  function applyTweaks(ops) {
    const root = document.documentElement;
    for (const o of ops || []) {
      if (o.kind === "var" && /^--[\w-]+$/.test(o.name)) { if (o.value == null) root.style.removeProperty(o.name); else root.style.setProperty(o.name, o.value); }
      else if (o.kind === "attr" && /^[a-z][\w:-]*$/i.test(o.name) && !/^(on|style$)/i.test(o.name)) { if (o.value == null) root.removeAttribute(o.name); else root.setAttribute(o.name, o.value); }
    }
    if (selected) place();
  }

  // --- built-in tweaks (any design): margins, font size, letter and line spacing, as a shift from what the design has --------------------
  // One <style> with a rule per marked element; the originals are measured with it off, so the numbers never pile up. Nothing is written to the design.
  const BI = "data-hd-b";
  let biSheet = null;
  const PAD_TAGS = "main,section,header,footer,article,aside,nav";
  const px = (n) => Math.round(n * 100) / 100 + "px";
  function applyBuiltin(v) {
    v = v || {};
    const pad = Number(v.pad) || 0, fs = 1 + (Number(v.fs) || 0) / 100, ls = (Number(v.ls) || 0) / 100, lh = (Number(v.lh) || 0) / 100;
    for (const n of document.querySelectorAll(`[${BI}]`)) n.removeAttribute(BI);
    if (biSheet) biSheet.textContent = "";
    if (!pad && fs === 1 && !ls && !lh) { if (biSheet) { biSheet.remove(); biSheet = null; } if (selected) place(); return; }
    const body = document.body;
    if (!body) return;
    const decls = new Map();
    const put = (el, d) => decls.set(el, (decls.get(el) || "") + d);
    if (pad) {
      const els = [...new Set([body, ...body.children, ...body.querySelectorAll(PAD_TAGS)])].filter((e) => !ours(e) && !/^(SCRIPT|STYLE|SVG|NOSCRIPT)$/i.test(e.tagName)).slice(0, 80);
      let any = false;
      for (const el of els) {
        const cs = getComputedStyle(el);
        const side = (n) => { const x = parseFloat(cs["padding" + n]) || 0; return x > 0 ? (any = true, px(Math.max(0, x + pad))) : null; };
        const d = [["Top", side("Top")], ["Right", side("Right")], ["Bottom", side("Bottom")], ["Left", side("Left")]].filter(([, x]) => x).map(([n, x]) => `padding-${n.toLowerCase()}:${x}!important;`).join("");
        if (d) put(el, d);
      }
      if (!any && pad > 0) put(body, `padding:${px(pad)}!important;`);
    }
    if (fs !== 1 || ls || lh) {
      const texts = [];
      const walker = document.createTreeWalker(body, NodeFilter.SHOW_TEXT);
      for (let n = walker.nextNode(); n && texts.length < 500; n = walker.nextNode()) {
        const el = n.parentElement;
        if (!n.nodeValue.trim() || !el || ours(el) || /^(SCRIPT|STYLE|NOSCRIPT|TEXTAREA)$/i.test(el.tagName) || el.closest("svg") || texts.includes(el)) continue;
        texts.push(el);
      }
      const meas = texts.map((el) => { const cs = getComputedStyle(el); const lhv = parseFloat(cs.lineHeight); return { el, fs: parseFloat(cs.fontSize) || 16, ls: parseFloat(cs.letterSpacing) || 0, lh: Number.isFinite(lhv) ? lhv : null }; });
      for (const m of meas) {
        const size = m.fs * fs;
        let d = "";
        if (fs !== 1) d += `font-size:${px(size)}!important;`;
        if (fs !== 1 || ls) d += `letter-spacing:${px(m.ls * fs + ls * size)}!important;`;
        if (m.lh !== null || lh) d += fs !== 1 || lh ? `line-height:${px(((m.lh ?? m.fs * 1.2) / m.fs + lh) * size)}!important;` : "";
        if (d) put(m.el, d);
      }
    }
    let k = 0;
    const css = [];
    for (const [el, d] of decls) { el.setAttribute(BI, String(++k)); css.push(`[${BI}="${k}"]{${d}}`); }
    if (!biSheet) { biSheet = document.createElement("style"); document.documentElement.append(biSheet); }
    biSheet.textContent = css.join("\n");
    if (selected) place();
  }

  // --- design errors: early.js collects the list (from the very load), here we only send it to the page -------------------
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

  // --- link to the hub page -------------------------------------------------------------------------------------
  addEventListener("message", (e) => {
    const m = e.data;
    if (e.source !== parent || !ORIGINS.includes(e.origin) || !m || m.canvas !== 1) return;
    if (m.t === "hello") {
      hubOrigin = e.origin;
      if (m.props) propList = m.props;
      external = !!m.external;
      if (m.theme) applyTheme(m.theme);
      setLang(m.lang);
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
      setLang(m.lang);
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
    } else if (m.t === "recolor") {
      recolor(m.from, m.to);
    } else if (m.t === "undo") {
      stepUndo();
    } else if (m.t === "redo") {
      stepRedo();
    } else if (m.t === "scroll") {
      scrollTo(m.x || 0, m.y || 0);
    } else if (m.t === "tweaks") {
      applyTweaks(m.ops);
    } else if (m.t === "builtin") {
      applyBuiltin(m.vals);
    }
  });

  // the design file changed on disk (the designer made edits): tell the page to reload the preview
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
      } catch { /* the process is restarting: next round */ }
      setTimeout(tick, document.hidden ? 4000 : 1500);
    };
    tick();
  }
})();
