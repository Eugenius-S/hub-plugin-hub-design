import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
const { snapMove, snapResize, resize, guides, gaps } = createRequire(import.meta.url)("../snap.js");

const frame = { x: 0, y: 0, w: 1000, h: 800 };
const peer = { x: 400, y: 100, w: 200, h: 100 };   // edges x 400/500/600, y 100/150/200

test("snapMove: the left edge sticks to the left edge of a neighbour within the threshold", () => {
  const r = snapMove({ x: 403, y: 300, w: 50, h: 50 }, [peer], frame, 6);
  assert.equal(r.x, 400);
});

test("snapMove: the centre sticks to the centre of a neighbour, on both axes at once", () => {
  const r = snapMove({ x: 476, y: 322, w: 50, h: 50 }, [peer, { x: 0, y: 297, w: 10, h: 10 }], frame, 6);
  assert.equal(r.x, 475);        // centre 501 -> 500
  assert.equal(r.y, 322 - 0);    // no line within 6 on y: centres 347, 372 vs 150/302/...
});

test("snapMove: sticks to the frame edges and the frame centre", () => {
  assert.equal(snapMove({ x: 4, y: 300, w: 50, h: 50 }, [], frame, 6).x, 0);
  assert.equal(snapMove({ x: 948, y: 300, w: 50, h: 50 }, [], frame, 6).x, 950);
  assert.equal(snapMove({ x: 478, y: 300, w: 50, h: 50 }, [], frame, 6).x, 475);
});

test("snapMove: outside the threshold nothing moves; Alt turns snapping off", () => {
  assert.deepEqual(snapMove({ x: 410, y: 300, w: 50, h: 50 }, [peer], frame, 6), { x: 410, y: 300, w: 50, h: 50 });
  assert.equal(snapMove({ x: 402, y: 300, w: 50, h: 50 }, [peer], frame, 6, true).x, 402);
});

test("snapMove: the nearest of several lines wins", () => {
  const r = snapMove({ x: 396, y: 300, w: 50, h: 50 }, [peer, { x: 399, y: 500, w: 2, h: 20 }], frame, 6);
  assert.equal(r.x, 399);
});

test("guides: a line through the aligned edge spans both boxes", () => {
  const box = { x: 400, y: 300, w: 50, h: 50 };
  const l = guides(box, [peer], frame).filter((x) => x.axis === "x" && x.at === 400);
  assert.equal(l.length, 1);
  assert.equal(l[0].from, 100);
  assert.equal(l[0].to, 350);
});

test("guides: nothing aligned, no lines", () => {
  assert.deepEqual(guides({ x: 123, y: 301, w: 51, h: 52 }, [peer], frame), []);
});

test("guides: two peers on the same line are one line spanning all", () => {
  const l = guides({ x: 400, y: 300, w: 50, h: 50 }, [peer, { x: 400, y: 600, w: 10, h: 10 }], frame).filter((x) => x.axis === "x" && x.at === 400);
  assert.equal(l.length, 1);
  assert.equal(l[0].from, 100);
  assert.equal(l[0].to, 610);
});

test("gaps: distances to the nearest neighbours that overlap across the axis", () => {
  const g = gaps({ x: 700, y: 120, w: 50, h: 50 }, [peer, { x: 0, y: 0, w: 10, h: 10 }]);
  assert.deepEqual(g.map((x) => [x.axis, x.d]), [["x", 100]]);
  assert.equal(g[0].from, 600);
  assert.equal(g[0].to, 700);
});

test("gaps: above and below", () => {
  const g = gaps({ x: 420, y: 260, w: 50, h: 50 }, [peer, { x: 430, y: 400, w: 40, h: 40 }]);
  assert.deepEqual(g.map((x) => [x.axis, x.d]).sort(), [["y", 60], ["y", 90]]);
});

test("resize: every corner keeps the opposite corner in place", () => {
  const s = { x: 100, y: 100, w: 200, h: 100 };
  assert.deepEqual(resize("se", s, 20, 10), { x: 100, y: 100, w: 220, h: 110 });
  assert.deepEqual(resize("nw", s, -20, -10), { x: 80, y: 90, w: 220, h: 110 });
  assert.deepEqual(resize("ne", s, 20, -10), { x: 100, y: 90, w: 220, h: 110 });
  assert.deepEqual(resize("sw", s, -20, 10), { x: 80, y: 100, w: 220, h: 110 });
});

test("resize: never below the minimum", () => {
  const r = resize("nw", { x: 100, y: 100, w: 50, h: 50 }, 200, 200);
  assert.equal(r.w, 4);
  assert.equal(r.h, 4);
  assert.equal(r.x + r.w, 150);
  assert.equal(r.y + r.h, 150);
});

test("resize with Shift: the ratio stays, the bigger change leads", () => {
  const s = { x: 100, y: 100, w: 200, h: 100 };
  const a = resize("se", s, 40, 0, { keep: true });   // width +20% leads
  assert.equal(a.w, 240);
  assert.equal(a.h, 120);
  const b = resize("se", s, 0, 50, { keep: true });   // height +50% leads
  assert.equal(b.h, 150);
  assert.equal(b.w, 300);
  const c = resize("nw", s, -40, -5, { keep: true });
  assert.equal(c.w / c.h, 2);
  assert.equal(c.x + c.w, 300);
  assert.equal(c.y + c.h, 200);
});

test("resize with Shift: shrinking works too and respects the minimum", () => {
  const s = { x: 0, y: 0, w: 200, h: 100 };
  const a = resize("se", s, -100, -10, { keep: true });
  assert.equal(a.w, 100);
  assert.equal(a.h, 50);
  const tiny = resize("se", s, -500, -500, { keep: true });
  assert.ok(tiny.w >= 4 && tiny.h >= 4);
  assert.equal(tiny.w / tiny.h, 2);
});

test("snapResize: the moving edge sticks to a line, the opposite edge stays", () => {
  const s = { x: 100, y: 300, w: 200, h: 100 };
  const r = snapResize("se", s, 103, 0, [peer], frame, 6);   // right edge 403 -> 400
  assert.equal(r.x, 100);
  assert.equal(r.x + r.w, 400);
});

test("snapResize: a left-edge handle sticks the left edge", () => {
  const s = { x: 100, y: 300, w: 400, h: 100 };
  const r = snapResize("sw", s, 297, 0, [peer], frame, 6);   // left edge 397 -> 400
  assert.equal(r.x, 400);
  assert.equal(r.x + r.w, 500);
});

test("snapResize with the ratio: the leading axis sticks, the other follows the ratio", () => {
  const s = { x: 100, y: 300, w: 200, h: 100 };
  const r = snapResize("se", s, 103, 2, [peer], frame, 6, { keep: true });   // right 403 -> 400
  assert.equal(r.x + r.w, 400);
  assert.equal(r.w / r.h, 2);
});

test("snapResize: Alt turns snapping off", () => {
  const s = { x: 100, y: 300, w: 200, h: 100 };
  assert.equal(snapResize("se", s, 103, 0, [peer], frame, 6, { alt: true }).w, 303);
});
