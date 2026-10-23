// Hub Design: smart guides for the hand edits, like in Figma. While an element is dragged or resized, its edges and centre stick
// to the edges and centres of the other elements and of the design frame, pink lines show what it is aligned with, and labels show
// the gaps to the neighbours. Pure geometry on boxes {x, y, w, h} in page pixels: no DOM here. The file is both a classic script
// (server.py injects it before agent.js) and a module for tests.
(function (g) {
  const EPS = 0.51;           // an edge is "aligned" when it is this close to the target
  const GAP_MAX = 2000;       // gaps farther than this are not worth a label
  const MIN = 4;              // the smallest size a resize can reach

  const right = (b) => b.x + b.w;
  const bottom = (b) => b.y + b.h;
  const mid = (a, size) => a + size / 2;

  // the lines of a box on one axis: [start, centre, end]
  const linesX = (b) => [b.x, mid(b.x, b.w), right(b)];
  const linesY = (b) => [b.y, mid(b.y, b.h), bottom(b)];
  const targetsX = (others, frame) => [...others, frame].filter(Boolean).flatMap(linesX);
  const targetsY = (others, frame) => [...others, frame].filter(Boolean).flatMap(linesY);

  // the shift (a number) that brings the nearest of `mine` onto the nearest of `targets` within thr; 0 if nothing is near
  function pull(mine, targets, thr) {
    let best = null;
    for (const m of mine) for (const t of targets) {
      const d = t - m;
      if (Math.abs(d) <= thr && (best === null || Math.abs(d) < Math.abs(best))) best = d;
    }
    return best === null ? 0 : best;
  }

  // a dragged box: both axes pulled to the nearest lines. alt: no snapping at all
  function snapMove(box, others, frame, thr, alt = false) {
    if (alt) return { ...box };
    return { ...box, x: box.x + pull(linesX(box), targetsX(others, frame), thr), y: box.y + pull(linesY(box), targetsY(others, frame), thr) };
  }

  // the corner handles: which edges a handle moves
  const HANDLES = { nw: [1, 1], ne: [0, 1], sw: [1, 0], se: [0, 0] };   // [moves the left edge, moves the top edge]
  const CORNERS = Object.keys(HANDLES);

  // the new box when the handle `h` of `start` is dragged by (dx, dy); the opposite corner stays. keep: the aspect ratio stays (Shift)
  function resize(h, start, dx, dy, { keep = false, min = MIN } = {}) {
    const [left, top] = HANDLES[h] || HANDLES.se;
    let w = start.w + (left ? -dx : dx);
    let hh = start.h + (top ? -dy : dy);
    if (keep && start.w > 0 && start.h > 0) {
      // the axis that changed more (relative to the start) leads: both sides scale by one factor, as with Shift in Figma
      const kw = w / start.w, kh = hh / start.h;
      const k = Math.max(Math.abs(kw - 1) >= Math.abs(kh - 1) ? kw : kh, min / start.w, min / start.h);
      w = start.w * k;
      hh = start.h * k;
    }
    w = Math.max(min, w);
    hh = Math.max(min, hh);
    return { x: left ? right(start) - w : start.x, y: top ? bottom(start) - hh : start.y, w, h: hh };
  }

  // the moving edges of a resized box are pulled to the lines of the others; with the ratio kept only the axis that leads is pulled,
  // the other follows the ratio. alt: no snapping
  function snapResize(h, start, dx, dy, others, frame, thr, { keep = false, alt = false, min = MIN } = {}) {
    const raw = resize(h, start, dx, dy, { keep, min });
    if (alt) return raw;
    const [left, top] = HANDLES[h] || HANDLES.se;
    const px = pull([left ? raw.x : right(raw)], targetsX(others, frame), thr);
    const py = pull([top ? raw.y : bottom(raw)], targetsY(others, frame), thr);
    if (!keep) {
      return resize(h, start, dx + px, dy + py, { keep, min });
    }
    // the leading axis is the one that changed more relative to the start
    const lead = Math.abs(raw.w / start.w - 1) >= Math.abs(raw.h / start.h - 1) ? "x" : "y";
    if (lead === "x" && px) return resize(h, start, dx + px, dy, { keep, min });
    if (lead === "y" && py) return resize(h, start, dx, dy + py, { keep, min });
    return raw;
  }

  // the lines to draw for a finished box: where an edge or the centre of `box` coincides with a line of another box (or the frame).
  // Each line spans both boxes, so it is clear what is aligned with what.
  function guides(box, others, frame) {
    const out = [];
    const peers = [...others, frame].filter(Boolean);
    const add = (axis, at, from, to) => {
      const old = out.find((l) => l.axis === axis && Math.abs(l.at - at) < EPS);
      if (old) { old.from = Math.min(old.from, from); old.to = Math.max(old.to, to); } else out.push({ axis, at, from, to });
    };
    for (const p of peers) {
      for (const m of linesX(box)) for (const t of linesX(p)) {
        if (Math.abs(m - t) < EPS) add("x", t, Math.min(box.y, p.y), Math.max(bottom(box), bottom(p)));
      }
      for (const m of linesY(box)) for (const t of linesY(p)) {
        if (Math.abs(m - t) < EPS) add("y", t, Math.min(box.x, p.x), Math.max(right(box), right(p)));
      }
    }
    return out;
  }

  // the distances to the nearest neighbour on each side that overlaps `box` across the axis; the label sits in the middle of the gap
  function gaps(box, others, max = GAP_MAX) {
    const out = [];
    const over = (a0, a1, b0, b1) => Math.min(a1, b1) - Math.max(a0, b0) > 0;
    const pick = (list, key) => list.reduce((a, b) => (a === null || key(b) < key(a) ? b : a), null);
    const side = (sel, dist, axis, edge) => {
      const near = pick(others.filter(sel), dist);
      if (!near) return;
      const d = dist(near);
      if (d <= 0 || d > max) return;
      out.push(edge(near, d, axis));
    };
    const cy = (p) => Math.max(box.y, p.y) + (Math.min(bottom(box), bottom(p)) - Math.max(box.y, p.y)) / 2;
    const cx = (p) => Math.max(box.x, p.x) + (Math.min(right(box), right(p)) - Math.max(box.x, p.x)) / 2;
    side((p) => right(p) <= box.x && over(box.y, bottom(box), p.y, bottom(p)), (p) => box.x - right(p), "x", (p, d) => ({ axis: "x", from: right(p), to: box.x, at: cy(p), d: Math.round(d) }));
    side((p) => p.x >= right(box) && over(box.y, bottom(box), p.y, bottom(p)), (p) => p.x - right(box), "x", (p, d) => ({ axis: "x", from: right(box), to: p.x, at: cy(p), d: Math.round(d) }));
    side((p) => bottom(p) <= box.y && over(box.x, right(box), p.x, right(p)), (p) => box.y - bottom(p), "y", (p, d) => ({ axis: "y", from: bottom(p), to: box.y, at: cx(p), d: Math.round(d) }));
    side((p) => p.y >= bottom(box) && over(box.x, right(box), p.x, right(p)), (p) => p.y - bottom(box), "y", (p, d) => ({ axis: "y", from: bottom(box), to: p.y, at: cx(p), d: Math.round(d) }));
    return out;
  }

  const api = { snapMove, snapResize, resize, guides, gaps, pull, CORNERS, HANDLES, MIN };
  g.HubSnap = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
