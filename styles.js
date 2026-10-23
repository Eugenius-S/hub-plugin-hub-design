// Hub Design: the style picker - a panel over the canvas with the style reference library of this hub (see styles.py): search by name, category,
// tags and - if the library has labels (tags.json) - by labels in plain words ("dark fintech", "like <brand>", stylesearch.py) with filter chips
// of the labels, a grid of previews with the labels of each style, a card of a style (description, palette, fonts). "Attach" puts the style on the next message to the designer
// (lib.js styleLine). Only previews, a page at a time and lazily: the library has over a thousand styles, they are never loaded at once.
import { CANVAS_ICONS as CI } from "./icons.js";
import { currentLang, makeT } from "./i18n.js";

export const PAGE = 24;   // previews on a screen; the next ones come by the pager, not by scrolling: the page never holds more than this
export const STR = {
  en: {
    btn: "Style", btn_title: "Pick a style reference for the designer",
    title: "Style reference", count: "{n} styles", found: "Found: {n}",
    search_ph: "Search: \"dark fintech\", \"like Apple\", a name", all: "All",
    segs: "Design style", seg_none: "No label",
    ax_theme: "Theme", ax_style: "Style", ax_mood: "Mood", ax_industry: "Industry", ax_medium: "Medium", ax_density: "Density", labels: "Labels",
    prev: "Previous", next: "Next", page: "{a} / {b}",
    nothing: "Nothing found", loading: "Loading…", failed: "No answer from Hub Design",
    close: "Close", back: "All styles",
    attach: "Attach to the message", detach: "Detach", attached: "Attached: the designer gets the path to the style file with your next message",
    open_md: "Open DESIGN.md", site: "Site", palette: "Palette", fonts: "Fonts", tags: "Tags",
    theme_light: "light", theme_dark: "dark",
    chip: "Style: {name}", chip_title: "The designer gets the path of this style file with your next message",
    def_badge: "default", def_chip: "Style: {name} (default)", def_on: "This style goes with every message to the designer, until you attach another one",
    def_use: "Return to default",
  },
  ru: {
    btn: "Стиль", btn_title: "Выбрать стиль-референс для дизайнера",
    title: "Стили-референсы", count: "Стилей: {n}", found: "Найдено: {n}",
    search_ph: "Поиск: «тёмный финтех», «как эпл», название", all: "Все",
    segs: "Стиль дизайна", seg_none: "Без метки",
    ax_theme: "Тема", ax_style: "Стиль", ax_mood: "Настроение", ax_industry: "Сфера", ax_medium: "Носитель", ax_density: "Плотность", labels: "Метки",
    prev: "Назад", next: "Дальше", page: "{a} / {b}",
    nothing: "Ничего не нашлось", loading: "Загрузка…", failed: "Нет ответа от Hub Design",
    close: "Закрыть", back: "Все стили",
    attach: "Прикрепить к сообщению", detach: "Открепить", attached: "Прикреплён: дизайнер получит путь к файлу стиля с вашим следующим сообщением",
    open_md: "Открыть DESIGN.md", site: "Сайт", palette: "Палитра", fonts: "Шрифты", tags: "Теги",
    theme_light: "светлая", theme_dark: "тёмная",
    chip: "Стиль: {name}", chip_title: "Дизайнер получит путь к файлу этого стиля с вашим следующим сообщением",
    def_badge: "по умолчанию", def_chip: "Стиль: {name} (по умолчанию)", def_on: "Этот стиль идёт с каждым сообщением дизайнеру, пока вы не прикрепите другой",
    def_use: "Вернуть по умолчанию",
  },
};
export const t = makeT(STR);

// --- pure parts (tests/styles.test.mjs) -------------------------------------------------------------------------------
// the paging of a result: where we are, how many pages, the offsets of the neighbours (null - none)
export function pager(total, offset, size = PAGE) {
  const pages = Math.max(1, Math.ceil(total / size));
  const page = Math.min(pages, Math.floor(Math.max(0, offset) / size) + 1);
  return { page, pages, prev: page > 1 ? (page - 2) * size : null, next: page < pages ? page * size : null };
}
// the big picture of a style: a moving cover plays under the pointer, one at a time, silent: the <video> is made after a short stay on the card and removed when the
// pointer leaves (a library of over a thousand covers is never loaded at once, as in the gallery of motion); no cover or a failing one - the still picture stays
export const HOVER_MS = 150;
let playing = null;   // the stop of the cover that plays now
const reduced = () => typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
// the one place that makes the silent looping <video> over the still picture; -> the stop (drops the download with the element)
function mountCover(into, src, onFail) {
  const v = into.ownerDocument.createElement("video");
  let gone = false;
  v.className = "hds-vid";
  v.muted = true;
  v.loop = true;
  v.playsInline = true;
  v.preload = "auto";
  v.setAttribute("muted", "");
  const stop = () => {
    if (gone) return;
    gone = true;
    v.pause(); v.removeAttribute("src"); v.load(); v.remove();
  };
  v.addEventListener("loadeddata", () => v.classList.add("on"));   // fades in over the still picture once it has a frame
  v.addEventListener("error", () => { stop(); onFail(); });
  v.src = src();
  into.append(v);
  const p = v.play();
  if (p && p.catch) p.catch(() => { stop(); onFail(); });
  return stop;
}
// the covers of the list play all at once, but only the ones on the screen: the <video> is made when the card comes into view and removed when it
// leaves (a page holds at most PAGE cards); reduced motion or no IntersectionObserver - the still picture (the hover plays it where it is allowed)
export function coverInView(trigger, into, src, { Observer = globalThis.IntersectionObserver } = {}) {
  let stopVideo = null, io = null;
  const stop = () => { if (stopVideo) { stopVideo(); stopVideo = null; } };
  if (typeof Observer !== "function" || reduced()) return () => {};
  io = new Observer((entries) => {
    for (const e of entries) {
      if (e.isIntersecting && !stopVideo) stopVideo = mountCover(into, src, () => { stopVideo = null; if (io) io.disconnect(); });
      else if (!e.isIntersecting) stop();
    }
  });
  io.observe(trigger);
  return () => { stop(); io.disconnect(); };
}
export function coverOnHover(trigger, into, src, { delay = HOVER_MS, setTimer = setTimeout, clearTimer = clearTimeout } = {}) {
  let timer = 0, video = null;
  const stop = () => {
    clearTimer(timer);
    timer = 0;
    if (video) { video(); video = null; }
    if (playing === stop) playing = null;
  };
  const start = () => {
    timer = 0;
    if (reduced()) return;   // the still picture is enough
    if (playing) playing();
    playing = stop;
    video = mountCover(into, src, () => stop());
  };
  trigger.addEventListener("pointerenter", (e) => {
    if (e && e.pointerType === "touch") return;
    clearTimer(timer);
    if (!video) timer = setTimer(start, delay);
  });
  trigger.addEventListener("pointerleave", stop);
  trigger.addEventListener("pointercancel", stop);
  return stop;
}
export const DEFAULT_ID = "__default";   // the id of the default style (hub.json default_style, styles.py DEFAULT_ID)
// the default style from the answer of the plugin process: only id, name, the path of the file and whether it has a picture; none - null
export function defaultStyle(raw) {
  const s = raw && typeof raw === "object" ? raw : null;
  return s && s.id === DEFAULT_ID && typeof s.path === "string" && s.path ? { id: DEFAULT_ID, name: String(s.name || DEFAULT_ID).slice(0, 120), path: s.path, preview: !!s.preview } : null;
}
export const AXES = ["medium", "theme", "style", "mood", "industry", "density"];   // the order of the chip rows: what it is made for goes first
const axisName = (a) => ({ medium: t("ax_medium"), theme: t("ax_theme"), style: t("ax_style"), mood: t("ax_mood"), industry: t("ax_industry"), density: t("ax_density") })[a] || a;
// the request to the plugin process: the text, the category, the chosen label of each axis {theme: "dark"}, the language of the label names, the style (the segment)
export function listQuery({ q = "", cat = "", offset = 0, limit = PAGE, f = {}, lang = "", style = "" } = {}) {
  const p = new URLSearchParams({ q: String(q).trim(), cat, offset: String(offset), limit: String(limit) });
  if (style) p.set("style", style);
  for (const a of AXES) if (a !== "style" && f && typeof f[a] === "string" && f[a]) p.set(a, f[a]);
  if (lang) p.set("lang", lang);
  return p.toString();
}
// the switch over the filters (styles.py segments): [{k, t, n}] from the plugin process; the segment of the styles with no style label (NONE) is named here
export const NONE = "_none";
export const segmentsShown = (segs) => (Array.isArray(segs) ? segs.filter((x) => x && typeof x.k === "string" && x.n > 0 && (x.k === NONE || typeof x.t === "string")) : []).slice(0, 14);
export const segmentName = (x) => (x.k === NONE ? t("seg_none") : x.t || x.k);
// the chosen segment is kept between visits (the process answers with the one it used, so a kept one the library no longer has is simply replaced by "all")
const SEG_KEY = "hub-design:style-seg";
const recallSeg = () => { try { return localStorage.getItem(SEG_KEY) || ""; } catch { return ""; } };
const rememberSeg = (k) => { try { localStorage.setItem(SEG_KEY, k); } catch { /* no storage - the next visit starts from "all" */ } };
// the label rows of the panel: the axes with something to show; "medium" and "style" are the switch's business (a style is a segment now)
export const filterRows = (facets) => AXES.filter((a) => a !== "medium" && a !== "style" && ((facets && facets[a]) || []).length);
// the filter chosen by a click on a chip: the same chip again takes it off
export const toggled = (f, axis, key) => ({ ...f, [axis]: f[axis] === key ? "" : key });
export const filtered = (f) => AXES.some((a) => f && f[a]);
// what is stored and sent about the chosen style: only its id, name and the path of the file; anything else is dropped
export function chosen(raw) {
  const s = raw && typeof raw === "object" ? raw : null;
  return s && typeof s.id === "string" && typeof s.path === "string" && s.path ? { id: s.id, name: String(s.name || s.id).slice(0, 120), path: s.path } : null;
}
// a readable label color over a swatch: black or white by the perceived brightness (#rgb, #rrggbb, #rrggbbaa)
export function textOn(hex) {
  let h = String(hex || "").replace("#", "");
  if (h.length === 3) h = [...h].map((c) => c + c).join("");
  const n = parseInt(h.slice(0, 6), 16);
  if (h.length < 6 || Number.isNaN(n)) return "#000";
  const y = (((n >> 16) & 255) * 299 + ((n >> 8) & 255) * 587 + (n & 255) * 114) / 1000;
  return y > 150 ? "#000" : "#fff";
}
const initials = (name) => String(name || "?").split(/\s+/).map((w) => w[0]).join("").slice(0, 2).toUpperCase();

// The Style button: visible until the library is proven absent. The probe can take seconds (a big index), and a button that
// appears only after it looks like it is missing; the last answer is remembered so that "no library" does not flash a button
const MEM_KEY = "hub-design:style-lib";
const recall = () => { try { return localStorage.getItem(MEM_KEY); } catch { return null; } };
const remember = (ok) => { try { localStorage.setItem(MEM_KEY, ok ? "1" : "0"); } catch { /* no storage - the next visit asks again */ } };
export function btnShown(avail, mem) {
  if (avail === true || avail === false) return avail;
  return mem !== "0";
}

// --- the panel ---------------------------------------------------------------------------------------------------------
// base: () => the address of the plugin process; get/set: the style attached now (the page keeps it); hub.el builds the nodes
export function createStyles({ hub, base, get, set, onChange = () => {} }) {
  const el = hub.el;
  const S = { avail: null, def: null, q: "", cat: "", style: recallSeg(), segs: [], all: 0, f: {}, facets: {}, offset: 0, total: 0, items: [], cats: [], count: 0, detail: null, state: "idle", seq: 0, timer: 0, stops: [] };
  const node = el("div", "hds");
  node.hidden = true;
  node.setAttribute("role", "dialog");
  const head = el("div", "hds-head");
  const h1 = el("h2", "hds-h1");
  const sub = el("span", "hds-sub");
  const x = el("button", "hds-x");
  x.type = "button";
  x.innerHTML = CI.close || "×";
  x.addEventListener("click", () => close());
  head.append(h1, sub, x);
  const bar = el("div", "hds-bar");
  const search = el("input", "hds-search");
  search.type = "search";
  search.addEventListener("input", () => { clearTimeout(S.timer); S.timer = setTimeout(() => { S.q = search.value; S.offset = 0; load(); }, 250); });
  bar.append(search);
  const segs = el("div", "hds-segs");
  segs.setAttribute("role", "tablist");
  const cats = el("div", "hds-cats");
  const body = el("div", "hds-body");
  const foot = el("div", "hds-foot");
  node.append(head, bar, segs, cats, body, foot);
  node.addEventListener("keydown", (e) => { if (e.key === "Escape") { e.stopPropagation(); S.detail ? back() : close(); } });

  const url = (route, params) => `${base()}/__canvas/${route}?${params}`;
  const preview = (id) => url("style-preview", new URLSearchParams({ id }).toString());
  const cover = (id) => url("style-cover", new URLSearchParams({ id }).toString());
  async function ask(route, params) {
    const res = await fetch(url(route, params), { cache: "no-store" });
    if (!res.ok) throw new Error(String(res.status));
    return res.json();
  }

  // is there a library: the button is shown only if so; asked when Hub Design opens and when the process wakes up
  async function probe() {
    let ok = false;
    let answered = false;
    let def = null;
    try { const r = await ask("styles", listQuery({ limit: 0 })); ok = !!r.ok; answered = true; S.count = r.count || 0; def = defaultStyle(r.default); } catch { ok = false; }
    const was = S.def;
    if (answered) S.def = def;   // the process not answering proves nothing: the default stays
    if (answered) remember(ok);
    if (answered && (ok !== S.avail || JSON.stringify(def) !== JSON.stringify(was))) { S.avail = ok; onChange(); }
    await recheck(answered, ok);
    return ok;
  }

  // a style kept from an earlier visit: the library may have changed since. The library is gone or the style is not in it - drop the choice,
  // the file moved - take the new path; the process not answering at all proves nothing, the choice stays
  async function recheck(answered, ok) {
    const cur = get();
    if (!cur || !answered) return;
    if (!ok) return set(null);
    try {
      const d = await ask("style", new URLSearchParams({ id: cur.id }).toString());
      if (d && typeof d.path === "string" && d.path && d.path !== cur.path) set({ ...cur, path: d.path });
    } catch (e) {
      if (String(e && e.message) === "404") set(null);
    }
  }

  async function load() {
    const my = ++S.seq;
    S.state = "loading";
    paintBody();
    try {
      const r = await ask("styles", listQuery({ q: S.q, cat: S.cat, f: S.f, offset: S.offset, lang: currentLang(), style: S.style }));
      if (my !== S.seq) return;
      if (!r.ok) { S.avail = false; S.def = null; remember(false); onChange(); return close(); }
      S.def = defaultStyle(r.default);
      Object.assign(S, { items: r.items, total: r.total, cats: r.cats || [], facets: r.facets || {}, count: r.count, segs: segmentsShown(r.segments), all: r.all || 0, style: typeof r.style === "string" ? r.style : "", state: "ok" });
    } catch {
      if (my !== S.seq) return;
      S.state = "failed";
    }
    paint();
  }

  async function open() {
    S.detail = null;
    node.hidden = false;
    paint();
    search.focus();
    await load();
  }
  function close() { node.hidden = true; S.seq += 1; for (const s of S.stops.splice(0)) s(); }
  function back() { S.detail = null; paint(); }
  async function show(id) {
    const my = ++S.seq;
    S.detail = { id, loading: true };
    paint();
    try {
      const d = await ask("style", new URLSearchParams({ id, lang: currentLang() }).toString());
      if (my !== S.seq) return;
      S.detail = d;
    } catch {
      if (my !== S.seq) return;
      S.detail = { id, failed: true };
    }
    paint();
  }
  // the default style counts as the attached one while no other is chosen
  const attached = (id) => { const s = get(); return id === DEFAULT_ID ? !!S.def && !s : !!s && s.id === id; };
  const listed = () => (S.def && !S.style && !S.q.trim() && !S.cat && !filtered(S.f) && S.offset === 0 ? [{ ...S.def, category: "", labels: [], isDefault: true }, ...S.items] : S.items);
  function attach(d) {
    if (d.id === DEFAULT_ID) set(null);   // back to the default: nothing chosen
    else set(attached(d.id) ? null : chosen({ id: d.id, name: d.name, path: d.path }));
    close();
  }

  const btn = (cls, text, fn) => { const b = el("button", cls, text); b.type = "button"; b.addEventListener("click", fn); return b; };

  // the switch: the style of the design itself, "All" first, with the number of styles in each; fewer than two segments - nothing to switch, the row is not there.
  // Another segment starts clean: its labels and categories are not those of the one left (the text of the search stays)
  function paintSegs() {
    segs.hidden = !!S.detail || S.segs.length < 2;
    if (segs.hidden) return;
    segs.setAttribute("aria-label", t("segs"));
    segs.replaceChildren(...[{ k: "", n: S.all, t: t("all") }, ...S.segs].map((x) => {
      const on = x.k === S.style;
      const b = btn("hds-seg" + (on ? " on" : ""), x.k ? segmentName(x) : x.t, () => {
        if (on) return;
        S.style = x.k;
        S.cat = "";
        S.f = {};
        S.offset = 0;
        rememberSeg(x.k);
        load();
      });
      b.setAttribute("role", "tab");
      b.setAttribute("aria-selected", on ? "true" : "false");
      b.append(el("span", "hds-kn", String(x.n)));
      return b;
    }));
  }

  // the filter chips: a row per axis when the library has labels (the most frequent ones), otherwise the row of categories (when there are two or more)
  function paintCats() {
    const rows = filterRows(S.facets);
    const catRow = S.cats.length > 1;
    cats.hidden = !!S.detail || (!rows.length && !catRow);
    if (cats.hidden) {
      if (!S.detail) cats.replaceChildren();   // a segment without labels or categories: no stale rows of the previous one behind the hidden bar
      return;
    }
    const chip = (on, label, title, fn) => { const b = btn("hds-cat" + (on ? " on" : ""), label, fn); if (title) b.title = title; return b; };
    cats.classList.toggle("rows", rows.length > 0);
    if (!rows.length) {
      const one = (name, label, n) => chip(S.cat === name, label + (n != null ? ` ${n}` : ""), "", () => { S.cat = name; S.offset = 0; load(); });
      return cats.replaceChildren(one("", t("all"), S.count), ...S.cats.map((c) => one(c.name, c.name, c.n)));
    }
    cats.replaceChildren(...rows.map((a) => {
      const row = el("div", "hds-fr");
      const strip = el("div", "hds-fs");
      strip.append(...S.facets[a].map((x) => chip(S.f[a] === x.k, x.t, `${x.t} · ${x.n}`, () => { S.f = toggled(S.f, a, x.k); S.offset = 0; load(); })));
      row.append(el("span", "hds-fl", axisName(a)), strip);
      return row;
    }));
  }

  function card(it) {
    const b = el("button", "hds-card" + (attached(it.id) ? " on" : ""));
    b.type = "button";
    b.title = it.name;
    let pic;
    if (it.preview) {
      pic = el("img", "hds-img");
      pic.loading = "lazy";
      pic.decoding = "async";
      pic.alt = "";
      pic.src = preview(it.id);
    } else {
      pic = el("span", "hds-img hds-none", initials(it.name));
    }
    if (it.cover) {   // the video is not made here: when the card is in view (the pointer is not needed)
      const wrap = el("span", "hds-pic");
      wrap.append(pic);
      S.stops.push(coverInView(b, wrap, () => cover(it.id)));
      pic = wrap;
    }
    b.append(pic, el("span", "hds-name", it.name), it.isDefault ? el("span", "hds-def", t("def_badge")) : el("span", "hds-cat-name", it.category || ""));
    if (it.labels && it.labels.length) b.append(el("span", "hds-labs", it.labels.map((x) => x.t).join(" · ")));
    b.addEventListener("click", () => show(it.id));
    return b;
  }

  function paintDetail(d) {
    const wrap = el("div", "hds-detail");
    if (d.loading || d.failed) { wrap.append(el("div", "hds-empty", d.failed ? t("failed") : t("loading"))); return wrap; }
    const left = el("div", "hds-dl");
    if (d.preview) {
      const img = el("img", "hds-big");
      img.alt = "";
      img.src = preview(d.id);
      if (d.cover) {   // the same: plays under the pointer only
        const wrap = el("div", "hds-bigw");
        wrap.append(img);
        coverOnHover(wrap, wrap, () => cover(d.id));
        left.append(wrap);
      } else left.append(img);
    }
    const right = el("div", "hds-dr");
    const meta = [d.category, d.theme === "dark" ? t("theme_dark") : d.theme === "light" ? t("theme_light") : ""].filter(Boolean).join(" · ");
    right.append(el("h3", "hds-dname", d.name), el("div", "hds-dmeta", meta));
    if (d.tagline) right.append(el("p", "hds-tag", d.tagline));
    if (d.description) right.append(el("p", "hds-desc", d.description));
    const row = el("div", "hds-acts");
    const on = attached(d.id);
    const isDef = d.id === DEFAULT_ID;
    if (!isDef || !on) row.append(btn("hds-go" + (on && !isDef ? " on" : ""), isDef ? t("def_use") : on ? t("detach") : t("attach"), () => attach(d)));
    const md = el("a", "hds-link", t("open_md"));
    md.href = url("style-md", new URLSearchParams({ id: d.id }).toString());
    md.target = "_blank";
    md.rel = "noopener";
    row.append(md);
    if (d.site) { const a = el("a", "hds-link", t("site")); a.href = d.site; a.target = "_blank"; a.rel = "noopener noreferrer"; row.append(a); }
    right.append(row);
    if (on) right.append(el("div", "hds-note", isDef ? t("def_on") : t("attached")));
    if (d.palette && d.palette.length) {
      right.append(el("h4", "hds-h4", t("palette")));
      const sw = el("div", "hds-sw");
      for (const c of d.palette) {
        const s = el("span", "hds-swatch", c.hex);
        s.style.background = c.hex;
        s.style.color = textOn(c.hex);
        s.title = [c.name, c.role].filter(Boolean).join(": ");
        sw.append(s);
      }
      right.append(sw);
    }
    if (d.fonts && d.fonts.length) right.append(el("h4", "hds-h4", t("fonts")), el("div", "hds-fonts", d.fonts.join(", ")));
    if (d.labels && d.labels.length) { right.append(el("h4", "hds-h4", t("labels"))); const lb = el("div", "hds-tags"); for (const x of d.labels) lb.append(el("span", "hds-tagc", x.t)); right.append(lb); }
    if (d.tags && d.tags.length) { right.append(el("h4", "hds-h4", t("tags"))); const tg = el("div", "hds-tags"); for (const x of d.tags) tg.append(el("span", "hds-tagc", x)); right.append(tg); }
    wrap.append(left, right);
    return wrap;
  }

  function paint() {
    h1.textContent = S.detail ? "" : t("title");
    if (S.detail) h1.replaceChildren(btn("hds-backb", "← " + t("back"), back));
    sub.textContent = S.detail ? "" : S.q.trim() || S.cat || filtered(S.f) ? t("found", { n: S.total }) : S.count ? t("count", { n: S.count }) : "";
    x.title = t("close");
    search.placeholder = t("search_ph");
    bar.hidden = !!S.detail;
    paintSegs();
    paintCats();
    paintBody();
  }

  function paintBody() {
    for (const s of S.stops.splice(0)) s();   // the covers of the cards that go away stop with them
    if (S.detail) { body.replaceChildren(paintDetail(S.detail)); foot.hidden = true; return; }
    if (S.state === "failed") { body.replaceChildren(el("div", "hds-empty", t("failed"))); foot.hidden = true; return; }
    if (S.state === "loading" && !S.items.length && !S.def) { body.replaceChildren(el("div", "hds-empty", t("loading"))); foot.hidden = true; return; }
    const shown = listed();
    if (!shown.length) { body.replaceChildren(el("div", "hds-empty", t("nothing"))); foot.hidden = true; return; }
    const grid = el("div", "hds-grid");
    grid.append(...shown.map(card));
    body.replaceChildren(grid);
    body.scrollTop = 0;
    const p = pager(S.total, S.offset);
    foot.hidden = p.pages < 2;
    const go = (to) => () => { S.offset = to; load(); };
    const prev = btn("hds-pg", t("prev"), go(p.prev));
    const next = btn("hds-pg", t("next"), go(p.next));
    prev.disabled = p.prev == null;
    next.disabled = p.next == null;
    foot.replaceChildren(prev, el("span", "hds-pages", t("page", { a: p.page, b: p.pages })), next);
  }

  // the library grew (the download in the settings): the count and the button are asked again; an open list is read again
  async function refresh() {
    await probe();
    if (!node.hidden && !S.detail && S.avail) load();
  }

  return { node, open, close, probe, refresh, avail: () => S.avail === true, shown: () => btnShown(S.avail, recall()), def: () => S.def, state: S, repaint: () => { if (!node.hidden) paint(); } };
}
