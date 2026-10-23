(() => {
  // the visible UI boxes of `root` that collide, and the texts that are cut off — no DOM relation between a colliding pair
  const doc = ROOT.ownerDocument || document;
  const win = doc.defaultView;
  const VW = win.innerWidth, VH = win.innerHeight;
  const out = [];
  const name = (e) => {
    const t = (e.getAttribute && (e.getAttribute("title") || e.getAttribute("aria-label"))) || "";
    const own = [...e.childNodes].filter((n) => n.nodeType === 3).map((n) => n.nodeValue.trim()).join(" ").slice(0, 24);
    const cls = typeof e.className === "string" ? e.className.trim().split(/\s+/).slice(0, 2).join(".") : "";
    return `${e.tagName.toLowerCase()}${cls ? "." + cls : ""}${own ? ' "' + own + '"' : t ? " [" + t.slice(0, 20) + "]" : ""}`;
  };
  const clips = (cs) => cs.overflowX !== "visible" || cs.overflowY !== "visible";
  const rectOf = (e) => { const r = e.getBoundingClientRect(); return { l: r.left, t: r.top, r: r.right, b: r.bottom }; };
  const meet = (a, b) => ({ l: Math.max(a.l, b.l), t: Math.max(a.t, b.t), r: Math.min(a.r, b.r), b: Math.min(a.b, b.b) });
  const hasText = (e) => [...e.childNodes].some((n) => n.nodeType === 3 && n.nodeValue.trim());
  const ownRect = (e) => {   // the box of the own text: where the glyphs really are
    const r = doc.createRange(); r.selectNodeContents(e);
    const q = [...r.getClientRects()].filter((x) => x.width > 0 && x.height > 0);
    if (!q.length) return null;
    return { l: Math.min(...q.map((x) => x.left)), t: Math.min(...q.map((x) => x.top)), r: Math.max(...q.map((x) => x.right)), b: Math.max(...q.map((x) => x.bottom)) };
  };
  const items = [];
  for (const e of ROOT.querySelectorAll("*")) {
    if (/^(script|style|link|meta|path|g|defs|use|circle|line|rect|polyline|polygon|ellipse|br|option|optgroup)$/i.test(e.tagName)) continue;
    const cs = win.getComputedStyle(e);
    if (cs.display === "none" || cs.visibility === "hidden" || +cs.opacity < 0.05) continue;
    const text = hasText(e);
    const tool = /^(button|a|input|select|textarea|img|svg)$/i.test(e.tagName) || e.getAttribute("role") === "button" || (ROOT_BOX && ROOT_BOX.test(typeof e.className === "string" ? e.className : ""));
    if (!text && !tool) continue;
    if (cs.pointerEvents === "none" && !text) continue;
    let box = rectOf(e);
    if (box.r - box.l < 1 || box.b - box.t < 1) continue;
    // cut by the clipping ancestors (and by the window): what remains is what the owner sees
    let hidden = false, cutBy = null;
    const full = { ...box };
    for (let p = e.parentElement; p && p !== doc.documentElement; p = p.parentElement) {
      const pc = win.getComputedStyle(p);
      if (pc.display === "none") { hidden = true; break; }
      if (!clips(pc) || p === doc.body) continue;
      const m = meet(box, rectOf(p));
      if (m.r - m.l <= 0 || m.b - m.t <= 0) { hidden = true; break; }
      if (full.r - m.r > 1.5 && pc.overflowX !== "auto" && pc.overflowX !== "scroll") cutBy = cutBy || { side: "right", by: Math.round(full.r - m.r), el: p };
      if (full.b - m.b > 1.5 && pc.overflowY !== "auto" && pc.overflowY !== "scroll") cutBy = cutBy || { side: "bottom", by: Math.round(full.b - m.b), el: p };
      if (m.l - full.l > 1.5 && pc.overflowX !== "auto" && pc.overflowX !== "scroll") cutBy = cutBy || { side: "left", by: Math.round(m.l - full.l), el: p };
      box = m;
    }
    if (hidden) continue;
    if (box.r <= 0 || box.b <= 0 || box.l >= VW || box.t >= VH) continue;
    const g = text ? ownRect(e) : null;
    // covered by something else (the canvas lies under the dashboard, a menu over a toolbar): the owner does not see it
    if (cs.pointerEvents !== "none") {
      const pts = [[0.5, 0.5], [0.2, 0.5], [0.8, 0.5], [0.5, 0.2], [0.5, 0.8]];
      const seen = pts.some(([fx, fy]) => {
        const x = box.l + (box.r - box.l) * fx, y = box.t + (box.b - box.t) * fy;
        if (x < 0 || y < 0 || x >= VW || y >= VH) return true;
        const top = ROOT.elementFromPoint ? ROOT.elementFromPoint(x, y) : doc.elementFromPoint(x, y);
        return !top || top === e || e.contains(top) || top.contains(e);
      });
      if (!seen) continue;
    }
    items.push({ e, box, text, glyphs: g, cutBy, ell: cs.textOverflow === "ellipsis", field: /^(input|select|textarea)$/i.test(e.tagName) });
  }
  for (const it of items) {
    if (it.text && it.cutBy) {
      // text cut off by a clipping ancestor: only when the glyphs themselves are cut (not an empty box)
      const g = it.glyphs, c = it.cutBy;
      const cutGlyphs = g && (c.side === "right" ? g.r > rectOf(c.el).right + 0.5 : c.side === "bottom" ? g.b > rectOf(c.el).bottom + 0.5 : g.l < rectOf(c.el).left - 0.5);
      if (cutGlyphs) out.push(`CUT ${name(it.e)} — ${c.side} by ${c.by}px of ${name(c.el)}`);
    }
    if (it.field && it.e.tagName !== "SELECT" && !/^(checkbox|radio|range|color|file|button)$/i.test(it.e.type || "") && it.e.scrollWidth > it.e.clientWidth + 1) out.push(`CUT ${name(it.e)} value "${String(it.e.value).slice(0, 14)}" — wider than the field (${it.e.scrollWidth} > ${it.e.clientWidth})`);
    if (it.text && !it.ell) {
      const cs = win.getComputedStyle(it.e);
      if (clips(cs) && it.e.scrollWidth > it.e.clientWidth + 1 && cs.overflowX !== "auto" && cs.overflowX !== "scroll") out.push(`CUT ${name(it.e)} — own text wider than the box (${it.e.scrollWidth} > ${it.e.clientWidth})`);
    }
    if (it.text && it.ell && it.e.scrollWidth > it.e.clientWidth + 1 && (it.e.textContent || "").trim().length <= 22) out.push(`ELL ${name(it.e)} — a short text ends with …`);
    if (it.box.r > VW + 1 || it.box.b > VH + 1) out.push(`OUT ${name(it.e)} — outside the window (${Math.round(it.box.r)}x${Math.round(it.box.b)} > ${VW}x${VH})`);
  }
  for (let i = 0; i < items.length; i++) for (let j = i + 1; j < items.length; j++) {
    const a = items[i], b = items[j];
    if (a.e.contains(b.e) || b.e.contains(a.e)) continue;
    // a text box against a text box: the glyphs decide, not the (wider) element boxes
    const ra = a.text && a.glyphs && !/^(button|select|input|textarea)$/i.test(a.e.tagName) ? meet(a.glyphs, a.box) : a.box;
    const rb = b.text && b.glyphs && !/^(button|select|input|textarea)$/i.test(b.e.tagName) ? meet(b.glyphs, b.box) : b.box;
    const m = meet(ra, rb);
    const w = m.r - m.l, h = m.b - m.t;
    if (w > 2 && h > 2 && w * h > 12) out.push(`OVER ${name(a.e)}  x  ${name(b.e)} — ${Math.round(w)}x${Math.round(h)}px`);
  }
  return [...new Set(out)];
})()
