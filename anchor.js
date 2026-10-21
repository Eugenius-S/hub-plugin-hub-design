// Hub Design: приметы элемента под пином. Пин держится не за один селектор, а за набор примет (id, ближайший предок с id,
// тег, текст, родной текст соседей, классы, размер, место). После перезагрузки макета элемент ищут по приметам: лучшее
// совпадение выше порога — пин садится на него; нет такого или два одинаково похожих — «элемент не найден», пин остаётся
// на своих координатах и не садится на чужой. Файл — и классический скрипт (его подкладывает server.py перед agent.js),
// и модуль для тестов: DOM берёт только через узкий набор свойств.
(function (g) {
  const TEXT_MAX = 80;
  const NEAR_MAX = 60;
  const SCAN_MAX = 4000;       // сколько кандидатов смотрим в большом документе
  const FOUND = 0.65;          // порог поиска по приметам: ниже — «не найден»
  const TRUST = 0.85;          // селектор что-то нашёл: оставляем его, только если элемент почти не изменился
  const MARGIN = 0.04;         // лучший должен оторваться от второго, иначе это двойник и выбирать нельзя
  const W = { tag: 0.08, text: 0.2, attr: 0.07, near: 0.15, cls: 0.08, anc: 0.08, path: 0.04, size: 0.1, pos: 0.2 };
  const transient = /^(is-|js-|has-|active$|hover$|focus|open$|show$|visible$|in-view|animate)/;

  const norm = (s, n) => String(s || "").replace(/\s+/g, " ").trim().slice(0, n);
  const words = (s) => String(s || "").toLowerCase().match(/[\p{L}\p{N}]+/gu) || [];
  // 0..1; null — сравнивать нечего (с обеих сторон пусто)
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

  // rect — { x, y, w, h } элемента в координатах страницы
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

  const part = (v, weight) => (v == null ? weight * 0.5 : v * weight);   // «сравнивать нечего» — полбалла, не ноль и не всё
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

  // тот ли это элемент (для селектора, который что-то нашёл)
  const matches = (fp, el, rectOf) => !!fp && score(fp, fingerprint(el, rectOf(el))) >= TRUST;

  // найти элемент по приметам: { el, score } или null
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
