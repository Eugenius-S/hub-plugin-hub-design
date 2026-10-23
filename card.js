// Cards of designs, documents and videos in the chat feed. A design (.html), a document (.pdf, .svg) or a video (mp4/mov/webm/gif) that a session
// sent as a file (hub send-file) or named by a full path in its reply becomes a card in the feed: a tile with a preview, a name, "Hub Design · agent",
// the "Open in Hub Design" button, "share" and "Hide". A click on a card opens the file in Hub Design. Pictures are not cards. The feed is rebuilt from core snapshots, so the card nodes and everything asynchronous
// (title, shot - failures too) are kept in the page memory: a repaint takes the ready result, with no flicker and no requests.
import { CARD_MAX, cardKind, cardName, cardText, hideToggle, isAbsPath, isCopy, pathFromHref } from "./lib.js";

const HIDE_KEY = "hub-design:card-hidden";
const META_TTL = 60000, FAIL_TTL = 120000;
const meta = new Map();       // path -> {state, title, mtime, at} | {failed, at}
const waiting = new Map();    // path -> Promise of the process answer
const thumbs = new Map();     // shot address -> "ok" | time of the failure
const frames = new Map();     // video -> dataURL of the frame | "none"
const nodes = new Map();      // "reply key|path" -> the card node
const MAX_NODES = 300;

const SVG = (d) => `<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true"><path d="${d}"/></svg>`;
const PALETTE_D = "M 12 2 C 6.241 2 1.6193906 6.8668906 2.0253906 12.712891 C 2.3923906 18.001891 7.0056406 22 12.306641 22 L 13 22 C 14.105 22 15 21.105 15 20 L 15 17 C 15 15.895 15.895 15 17 15 L 20 15 C 21.105 15 22 14.105 22 13 L 22 12.306641 C 22 7.0056406 18.002844 2.3923906 12.714844 2.0253906 C 12.474844 2.0083906 12.236 2 12 2 z M 12 4 C 12.19 4 12.381219 4.0065313 12.574219 4.0195312 C 16.738219 4.3085313 20 7.9486406 20 12.306641 L 20 13 L 17 13 C 14.794 13 13 14.794 13 17 L 13 20 L 12.306641 20 C 7.9486406 20 4.3075312 16.737219 4.0195312 12.574219 C 3.8635312 10.324219 4.6194375 8.1839219 6.1484375 6.5449219 C 7.6794375 4.9039219 9.758 4 12 4 z M 12.5 5 A 1.5 1.5 0 0 0 11 6.5 A 1.5 1.5 0 0 0 12.5 8 A 1.5 1.5 0 0 0 14 6.5 A 1.5 1.5 0 0 0 12.5 5 z M 8.5 6 A 1.5 1.5 0 0 0 7 7.5 A 1.5 1.5 0 0 0 8.5 9 A 1.5 1.5 0 0 0 10 7.5 A 1.5 1.5 0 0 0 8.5 6 z M 16.5 7 A 1.5 1.5 0 0 0 15 8.5 A 1.5 1.5 0 0 0 16.5 10 A 1.5 1.5 0 0 0 18 8.5 A 1.5 1.5 0 0 0 16.5 7 z M 6.5 10 A 1.5 1.5 0 0 0 5 11.5 A 1.5 1.5 0 0 0 6.5 13 A 1.5 1.5 0 0 0 8 11.5 A 1.5 1.5 0 0 0 6.5 10 z M 10 14 A 2 2 0 0 0 8 16 A 2 2 0 0 0 10 18 A 2 2 0 0 0 12 16 A 2 2 0 0 0 10 14 z";
const ICONS = {
  design: '<svg viewBox="0 0 24 24" width="26" height="26" fill="currentColor" aria-hidden="true"><path d="M 12 2 C 6.241 2 1.6193906 6.8668906 2.0253906 12.712891 C 2.3923906 18.001891 7.0056406 22 12.306641 22 L 13 22 C 14.105 22 15 21.105 15 20 L 15 17 C 15 15.895 15.895 15 17 15 L 20 15 C 21.105 15 22 14.105 22 13 L 22 12.306641 C 22 7.0056406 18.002844 2.3923906 12.714844 2.0253906 C 12.474844 2.0083906 12.236 2 12 2 z M 12 4 C 12.19 4 12.381219 4.0065313 12.574219 4.0195312 C 16.738219 4.3085313 20 7.9486406 20 12.306641 L 20 13 L 17 13 C 14.794 13 13 14.794 13 17 L 13 20 L 12.306641 20 C 7.9486406 20 4.3075312 16.737219 4.0195312 12.574219 C 3.8635312 10.324219 4.6194375 8.1839219 6.1484375 6.5449219 C 7.6794375 4.9039219 9.758 4 12 4 z M 12.5 5 A 1.5 1.5 0 0 0 11 6.5 A 1.5 1.5 0 0 0 12.5 8 A 1.5 1.5 0 0 0 14 6.5 A 1.5 1.5 0 0 0 12.5 5 z M 8.5 6 A 1.5 1.5 0 0 0 7 7.5 A 1.5 1.5 0 0 0 8.5 9 A 1.5 1.5 0 0 0 10 7.5 A 1.5 1.5 0 0 0 8.5 6 z M 16.5 7 A 1.5 1.5 0 0 0 15 8.5 A 1.5 1.5 0 0 0 16.5 10 A 1.5 1.5 0 0 0 18 8.5 A 1.5 1.5 0 0 0 16.5 7 z M 6.5 10 A 1.5 1.5 0 0 0 5 11.5 A 1.5 1.5 0 0 0 6.5 13 A 1.5 1.5 0 0 0 8 11.5 A 1.5 1.5 0 0 0 6.5 10 z M 10 14 A 2 2 0 0 0 8 16 A 2 2 0 0 0 10 18 A 2 2 0 0 0 12 16 A 2 2 0 0 0 10 14 z"/></svg>',
  pdf: '<svg viewBox="0 0 24 24" width="26" height="26" fill="currentColor" aria-hidden="true"><path d="M 6 2 C 4.9057453 2 4 2.9057453 4 4 L 4 20 C 4 21.094255 4.9057453 22 6 22 L 18 22 C 19.094255 22 20 21.094255 20 20 L 20 8 L 14 2 L 6 2 z M 6 4 L 13 4 L 13 9 L 18 9 L 18 20 L 6 20 L 6 4 z M 11.832031 9 C 11.282031 9 10.870062 9.3734375 10.789062 10.023438 C 10.709062 10.672438 11.030797 11.807328 11.591797 12.861328 C 11.350797 13.591328 11.110062 14.239672 10.789062 14.888672 C 9.7460625 15.212672 8.7838125 15.698547 8.3828125 16.185547 C 7.7418125 16.914547 8.0626562 17.401531 8.2226562 17.644531 C 8.3836563 17.887531 8.6243125 18 8.9453125 18 C 9.1063125 18 9.2667344 17.967719 9.4277344 17.886719 C 10.069734 17.643719 10.709563 16.670156 11.351562 15.535156 C 11.912563 15.373156 12.474156 15.211859 13.035156 15.130859 C 13.596156 15.778859 14.159625 16.185656 14.640625 16.347656 C 15.201625 16.509656 15.682828 16.265266 15.923828 15.697266 C 16.083828 15.210266 16.002562 14.8065 15.601562 14.5625 C 15.119562 14.2385 14.317469 14.237359 13.355469 14.318359 C 13.034469 13.832359 12.715609 13.346375 12.474609 12.859375 C 12.875609 11.643375 13.035 10.590406 12.875 9.9414062 C 12.714 9.3734063 12.382031 9 11.832031 9 z"/></svg>',
  svg: '<svg viewBox="0 0 24 24" width="26" height="26" fill="currentColor" aria-hidden="true"><path d="M 5 3 C 3.9 3 3 3.9 3 5 L 3 19 C 3 20.1 3.9 21 5 21 L 19 21 C 20.1 21 21 20.1 21 19 L 21 5 C 21 3.9 20.1 3 19 3 L 5 3 z M 5 5 L 19 5 L 19 19 L 5 19 L 5 5 z M 8.5 7.5 A 1.5 1.5 0 0 0 7 9 A 1.5 1.5 0 0 0 8.5 10.5 A 1.5 1.5 0 0 0 10 9 A 1.5 1.5 0 0 0 8.5 7.5 z M 14 11 L 10.5 15.5 L 8.5 13.5 L 6.5 17 L 17.5 17 L 14 11 z"/></svg>',
  video: '<svg viewBox="0 0 24 24" width="26" height="26" fill="currentColor" aria-hidden="true"><path d="M 12 2 C 6.477 2 2 6.477 2 12 C 2 17.523 6.477 22 12 22 C 17.523 22 22 17.523 22 12 C 22 6.477 17.523 2 12 2 z M 12 4 C 16.411 4 20 7.589 20 12 C 20 16.411 16.411 20 12 20 C 7.589 20 4 16.411 4 12 C 4 7.589 7.589 4 12 4 z M 10 7.5 L 10 16.5 L 16 12 L 10 7.5 z"/></svg>',
  palette: SVG(PALETTE_D).replace('width="18" height="18"', 'width="16" height="16"'),
  share: SVG("M 12 2 L 8 6 L 11 6 L 11 18 L 13 18 L 13 6 L 16 6 L 12 2 z M 6 7 C 4.9069372 7 4 7.9069372 4 9 L 4 20 C 4 21.093063 4.9069372 22 6 22 L 18 22 C 19.093063 22 20 21.093063 20 20 L 20 9 C 20 7.9069372 19.093063 7 18 7 L 17 7 L 17 9 L 18 9 L 18 20 L 6 20 L 6 9 L 7 9 L 7 7 L 6 7 z"),
  check: SVG("M 20.292969 5.2929688 L 9 16.585938 L 4.7070312 12.292969 L 3.2929688 13.707031 L 9 19.414062 L 21.707031 6.7070312 L 20.292969 5.2929688 z"),
};

let cfg = null;   // {origin, local, open, lang, session, abs}

const readHidden = () => { try { const l = JSON.parse(localStorage.getItem(HIDE_KEY) || "[]"); return Array.isArray(l) ? l : []; } catch { return []; } };
const isHidden = (path) => readHidden().includes(path);
const setHidden = (path, on) => { try { localStorage.setItem(HIDE_KEY, JSON.stringify(hideToggle(readHidden(), path, on))); } catch { /* storage is closed - it folds until a reload */ } };

const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
const q = (path) => encodeURIComponent(cfg.abs(path));

// what the plugin process knows about a file: whether it is there, the design <title>, the edit time. An answer lives a minute, a failure two (the process may be restarted)
function info(path) {
  const m = meta.get(path);
  if (m && Date.now() - m.at < (m.failed ? FAIL_TTL : META_TTL)) return Promise.resolve(m);
  if (!waiting.has(path)) {
    waiting.set(path, fetch(`${cfg.origin()}/__canvas/card?path=${q(path)}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((j) => ({ ...j, at: Date.now() }), () => ({ failed: true, at: Date.now() }))
      .then((got) => { meta.set(path, got); waiting.delete(path); return got; }));
  }
  return waiting.get(path);
}

function showPicture(card, src) {
  const tile = card.querySelector(".hdcard-tile");
  const img = new Image();
  img.alt = "";
  img.decoding = "async";
  img.draggable = false;
  img.onload = () => { tile.replaceChildren(img); tile.classList.add("pic"); };
  img.src = src;
}

// the preview - when the card comes into view: a design, a PDF and an SVG are a shot (the plugin process Chrome, cached on disk); a presentation keeps its icon
function preview(card) {
  const path = card.dataset.hdPath, kind = card.dataset.kind, m = meta.get(path);
  if (!m || m.state !== "ok" || card.dataset.pv === String(m.mtime)) return;
  card.dataset.pv = String(m.mtime);
  if (kind === "design" || kind === "pdf" || kind === "svg") {
    const src = `${cfg.origin()}/__canvas/thumb?path=${q(path)}&m=${m.mtime}`;
    const bad = thumbs.get(src);
    if (bad && bad !== "ok" && Date.now() - bad < FAIL_TTL) return;
    fetch(src).then((r) => { if (!r.ok) throw new Error(String(r.status)); thumbs.set(src, "ok"); showPicture(card, src); }).catch(() => thumbs.set(src, Date.now()));
    return;
  }
}

const io = typeof IntersectionObserver === "function" ? new IntersectionObserver((list) => {
  for (const e of list) if (e.isIntersecting) { io.unobserve(e.target); preview(e.target); }
}, { rootMargin: "200px" }) : null;

function paint(card, m) {
  const path = card.dataset.hdPath, kind = card.dataset.kind, T = cardText(cfg.lang());
  const gone = !m.failed && m.state !== "ok";
  card.classList.toggle("gone", gone);
  card.querySelector(".hdcard-title").textContent = cardName(path, m.title);
  card.querySelector(".hdcard-sub").textContent = [T.by, card.dataset.who || null, gone ? T.gone : null].filter(Boolean).join(" · ");
  card.title = path;
  if (m.state === "ok") { if (io) io.observe(card); else preview(card); }
}

function hideLabel(card) {
  const T = cardText(cfg.lang()), off = card.classList.contains("off"), b = card.querySelector(".hdcard-hide");
  card.querySelector(".hdcard-file").textContent = T.open_file;
  card.querySelector(".hdcard-open").innerHTML = ICONS.palette;
  card.querySelector(".hdcard-open").append(T.hd);
  b.textContent = off ? T.show : T.hide;
  b.title = off ? T.show_title : T.hide_title;
  b.setAttribute("aria-expanded", off ? "false" : "true");
}

async function copy(text) {
  try { await navigator.clipboard.writeText(text); return true; } catch { /* no access to the clipboard - the fallback is below */ }
  const ta = el("textarea");
  ta.value = text;
  ta.style.cssText = "position:fixed;opacity:0";
  document.body.append(ta);
  ta.select();
  let ok = false;
  try { ok = document.execCommand("copy"); } catch { ok = false; }
  ta.remove();
  return ok;
}

// the file as a link in the reply opens it: in the hub's Files, in a new tab
const openPlain = (path) => window.open(cfg.files(path), "_blank", "noopener");

function build(path, kind, who) {
  const T = cardText(cfg.lang());
  const card = el("div", "hdcard" + (isHidden(path) ? " off" : ""));
  card.dataset.hdPath = path;
  card.dataset.kind = kind;
  card.dataset.who = who || "";
  card.tabIndex = 0;
  card.setAttribute("role", "link");
  card.setAttribute("aria-label", T.open_file_title);
  const tile = el("div", "hdcard-tile");
  tile.innerHTML = ICONS[kind];
  const text = el("div", "hdcard-text");
  text.append(el("div", "hdcard-title", cardName(path)), el("div", "hdcard-sub", [T.by, who || null].filter(Boolean).join(" · ")));
  const head = el("div", "hdcard-head");
  head.append(tile, text);
  // "Open" - the file as is, in the hub's Files (the same as a click on the card); "Hub Design" - on the canvas
  const file = el("button", "hdcard-btn hdcard-file", T.open_file);
  file.type = "button";
  file.title = T.open_file_title;
  file.addEventListener("click", (e) => { e.stopPropagation(); openPlain(path); });
  const open = el("button", "hdcard-btn hdcard-open", T.hd);
  open.type = "button";
  open.title = T.open;
  open.addEventListener("click", (e) => { e.stopPropagation(); cfg.open(path); });
  const acts = el("div", "hdcard-acts");
  const share = el("button", "hdcard-btn hdcard-share");
  share.type = "button";
  share.title = T.share;
  share.setAttribute("aria-label", T.share);
  share.innerHTML = ICONS.share;
  share.addEventListener("click", async (e) => {
    e.stopPropagation();
    if (!(await copy(cfg.link(path)))) return;
    share.innerHTML = ICONS.check;
    share.title = T.copied;
    share.classList.add("done");
    setTimeout(() => { share.innerHTML = ICONS.share; share.title = T.share; share.classList.remove("done"); }, 1600);
  });
  const hide = el("button", "hdcard-btn hdcard-hide");
  hide.type = "button";
  hide.addEventListener("click", (e) => {
    e.stopPropagation();
    card.classList.toggle("off");
    setHidden(path, card.classList.contains("off"));
    hideLabel(card);
  });
  if (kind === "pptx") open.hidden = true;   // a presentation does not open on the canvas: "Open" (the hub's Files) only
  acts.append(file, open, share, hide);
  card.append(head, acts);
  hideLabel(card);
  card.addEventListener("click", (e) => { if (!e.target.closest("button")) openPlain(path); });
  card.addEventListener("keydown", (e) => { if (e.target === card && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); openPlain(path); } });
  return card;
}

function remember(key, card) {
  if (!key) return;
  nodes.set(key, card);
  if (nodes.size > MAX_NODES) nodes.delete(nodes.keys().next().value);
}

// what is in a reply: a file from send-file (a file link) is replaced by a card in place, a path in the text - a card at the end of the reply
function found(row) {
  const out = [];
  if (row.classList.contains("sent-file")) {
    const v = row.querySelector("video.sent-video"), box = row.querySelector(".attach-list");
    const path = v ? pathFromHref(v.src) : pathFromHref(box?.querySelector("a")?.href) || pathFromHref(box?.querySelector("img")?.dataset.full);
    const kind = isCopy(path) ? null : cardKind(path);   // a core copy without a source is not a design
    if (kind && (v || box)) out.push({ path, kind, replace: v || box });
    return out;
  }
  if (!row.classList.contains("out") || row.classList.contains("tool")) return out;
  const seen = new Set();
  for (const a of row.querySelectorAll("a[data-path]")) {
    const path = a.dataset.path, kind = cardKind(path);
    if (!kind || !isAbsPath(path) || isCopy(path) || seen.has(path)) continue;
    seen.add(path);
    out.push({ path, kind, replace: null });
    if (out.length >= CARD_MAX) break;
  }
  return out;
}

function lay(row) {
  const who = cfg.session();
  for (const f of found(row)) {
    if ([...row.querySelectorAll(".hdcard")].some((c) => c.dataset.hdPath === f.path)) continue;
    const key = row.dataset.key ? `${row.dataset.key}|${f.path}` : "";
    let card = key && nodes.get(key);
    if (!card) { card = build(f.path, f.kind, who); remember(key, card); }
    if (f.replace) f.replace.replaceWith(card); else (row.querySelector(":scope > .b") || row).append(card);
    info(f.path).then((m) => { if (m.failed) return; paint(card, m); });
  }
}

const pending = new Set();
let queued = false;
function flush() {
  queued = false;
  const rows = [...pending];
  pending.clear();
  for (const r of rows) if (r.isConnected) lay(r);
}
function want(n) {
  if (!n || n.nodeType !== 1 || n.closest?.(".hdcard")) return;
  const rows = n.matches?.(".feed .row") ? [n] : [];
  const up = n.closest?.(".feed .row");
  if (up) rows.push(up);
  if (n.querySelectorAll) rows.push(...n.querySelectorAll(".feed .row"));
  for (const r of rows) pending.add(r);
  if (pending.size && !queued) { queued = true; requestAnimationFrame(flush); }   // before the frame is drawn: no flicker of a bare link
}

// opts: origin() -> the plugin process address, local() -> the hub is open on this computer, open(path) -> open a file in Hub Design,
// link(path) -> the address that opens the file in Hub Design (what "share" copies), lang() -> the page language, session() -> whose feed is open, abs(path) -> a path with "~" expanded
export function mountCards(opts) {
  if (cfg) return;
  cfg = opts;
  if (!cfg.local()) return;   // another computer (tailnet): the process has no file, the feed stays as it is
  new MutationObserver((list) => { for (const m of list) for (const n of m.addedNodes) want(n); }).observe(document.body, { childList: true, subtree: true });
  want(document.body);
}
