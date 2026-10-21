// Hub Design: fingerprints of the element under a pin. A pin holds not on one selector but on a set of marks (id, nearest
// ancestor with an id, tag, text, own text of the neighbors, classes, size, place). After the design is reloaded the element
// is searched by these marks: the best match above the threshold gets the pin; none, or two equally similar ones: "element
// not found", the pin stays at its own coordinates and never lands on a foreign element. The file is both a classic script
// (server.py injects it before agent.js) and a module for tests: it reads the DOM through a narrow set of properties only.
(function (g) {
  const TEXT_MAX = 80;
  const NEAR_MAX = 60;
  const SCAN_MAX = 4000;       // how many candidates we look at in a big document
  const FOUND = 0.65;          // search threshold by marks: below it, "not found"
  const TRUST = 0.85;          // the selector found something: keep it only if the element has hardly changed
  const MARGIN = 0.04;         // the best must beat the second one, otherwise it is a twin and we must not choose
  const W = { tag: 0.08, text: 0.2, attr: 0.07, near: 0.15, cls: 0.08, anc: 0.08, path: 0.04, size: 0.1, pos: 0.2 };
  const transient = /^(is-|js-|has-|active$|hover$|focus|open$|show$|visible$|in-view|animate)/;

  const norm = (s, n) => String(s || "").replace(/\s+/g, " ").trim().slice(0, n);
  const words = (s) => String(s || "").toLowerCase().match(/[\p{L}\p{N}]+/gu) || [];
  // 0..1; null: nothing to compare (empty on both sides)
  function sim(a, b) {
    const x = words(a), y = words(b);
    if (!x.length && !y.length) return null;
    if (!x.length || !y.length) return 0;
    const sx = new Set(x), sy = new Set(y);
    let both = 0;
    for (const w of sx) if (sy.has(w)) both += 1;
    return both / (sx.size + sy.size - both);
  }
  const tagOf = (el) => String(el.tagName || "").toLowerCase();
  const attrOf = (el) => {
    const get = (k) => (el.getAttribute ? el.getAttribute(k) : null) || "";
    const src = get("src").split("?")[0].split("/").pop();
    return norm([get("role"), get("aria-label"), get("alt"), get("name"), get("placeholder"), get("href"), src, get("type")].filter(Boolean).join(" "), TEXT_MAX);
  };
  const classesOf = (el) => [...(el.classList || [])].filter((c) => !transient.test(c)).slice(0, 3);

  // rect: { x, y, w, h } of the element in page coordinates
  function fingerprint(el, rect) {
    const par = el.parentElement;
    let anc = "", path = [];
    for (let cur = par, up = [tagOf(el)]; cur && cur.nodeType === 1; cur = cur.parentElement) {
      if (cur.id) { anc = cur.id; path = up; break; }
      up = [tagOf(cur), ...up];
    }
    return {
      id: el.id || "", anc, path, tag: tagOf(el),
      text: norm(el.textContent, TEXT_MAX), attr: attrOf(el), near: par ? norm(par.textContent, NEAR_MAX) : "",
      cls: classesOf(el),
      w: Math.round(rect.w), h: Math.round(rect.h), x: Math.round(rect.x), y: Math.round(rect.y),
    };
  }

  const part = (v, weight) => (v == null ? weight * 0.5 : v * weight);   // "nothing to compare" is half a point, not zero and not all
  const ratio = (a, b) => (a === b ? 1 : Math.min(a, b) / Math.max(a, b, 1));
  function score(fp, c) {
    if (fp.tag !== c.tag) return 0;
    let s = W.tag;
    s += part(sim(fp.text, c.text), W.text);
    s += part(sim(fp.attr, c.attr), W.attr);
    s += part(sim(fp.near, c.near), W.near);
    s += part(fp.cls.length || c.cls.length ? fp.cls.filter((k) => c.cls.includes(k)).length / new Set([...fp.cls, ...c.cls]).size : null, W.cls);
    s += part(fp.anc || c.anc ? (fp.anc === c.anc ? 1 : 0) : null, W.anc);
    let same = 0;
    while (same < fp.path.length && same < c.path.length && fp.path[fp.path.length - 1 - same] === c.path[c.path.length - 1 - same]) same += 1;
    s += part(Math.max(fp.path.length, c.path.length) ? same / Math.max(fp.path.length, c.path.length) : null, W.path);
    s += (ratio(fp.w, c.w) + ratio(fp.h, c.h)) / 2 * W.size;
    s += Math.max(0, 1 - Math.hypot(fp.x - c.x, fp.y - c.y) / 250) * W.pos;
    return s;
  }

  // is this the same element (for a selector that found something)
  const matches = (fp, el, rectOf) => !!fp && score(fp, fingerprint(el, rectOf(el))) >= TRUST;

  // find the element by its marks: { el, score } or null
  function locate(fp, doc, rectOf) {
    if (!fp) return null;
    if (fp.id) {
      const el = doc.getElementById(fp.id);
      if (el && tagOf(el) === fp.tag) return { el, score: 1 };
    }
    const all = doc.getElementsByTagName(fp.tag);
    let best = null, second = 0;
    for (let i = 0; i < all.length && i < SCAN_MAX; i += 1) {
      const el = all[i];
      if (el.getRootNode && el.getRootNode() !== doc) continue;
      const s = score(fp, fingerprint(el, rectOf(el)));
      if (!best || s > best.score) { if (best) second = best.score; best = { el, score: s }; }
      else if (s > second) second = s;
    }
    if (!best || best.score < FOUND || best.score - second < MARGIN) return null;
    return best;
  }

  const api = { fingerprint, score, matches, locate, FOUND, TRUST, MARGIN };
  g.HubAnchor = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
