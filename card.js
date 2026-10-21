// Карточки дизайна и видео в ленте чата (0.9.0, владелец 21.10: «агенты в направлении все присылали дизайн, видео — как вход в
// Claude Design, прямо в чате такую штуку»). Макет (.html) или видео (mp4/mov/webm/gif), присланный файлом (hub send-file) или названный
// полным путём в тексте реплики, в ленте становится карточкой: плитка с превью, имя, «Hub Design · агент», «поделиться» и «Скрыть».
// Клик по карточке открывает файл в Hub Design. Лента пересобирается снимками ядра, поэтому узлы карточек и всё асинхронное
// (название, снимок, кадр видео — в том числе неудачи) держатся в памяти страницы: перерисовка берёт готовое, без мигания и запросов.
import { CARD_MAX, cardKind, cardName, cardText, fileUrl, hideToggle, isAbsPath, pathFromHref } from "./lib.js";

const HIDE_KEY = "hub-design:card-hidden";
const META_TTL = 60000, FAIL_TTL = 120000;
const meta = new Map();       // путь → {state, title, mtime, at} | {failed, at}
const waiting = new Map();    // путь → Promise ответа процесса
const thumbs = new Map();     // адрес снимка → "ok" | время неудачи
const frames = new Map();     // видео → dataURL кадра | "none"
const nodes = new Map();      // «ключ реплики|путь» → узел карточки
const MAX_NODES = 300;

const SVG = (body) => `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;
const ICONS = {
  design: '<svg viewBox="0 0 24 24" width="26" height="26" fill="currentColor" aria-hidden="true"><path fill-rule="evenodd" d="M12 3a9 9 0 1 0 0 18c1.4 0 2.2-.9 2.2-2 0-.6-.3-1.1-.3-1.7 0-1 .8-1.7 1.8-1.7H17a4 4 0 0 0 4-4C21 6.600 17 3 12 3Zm-5 9a1.400 1.400 0 1 1 0-2.800A1.400 1.400 0 0 1 7 12Zm3-4a1.400 1.400 0 1 1 0-2.800A1.400 1.400 0 0 1 10 8Zm5 0a1.400 1.400 0 1 1 0-2.800A1.400 1.400 0 0 1 15 8Z"/></svg>',
  video: '<svg viewBox="0 0 24 24" width="26" height="26" fill="currentColor" aria-hidden="true"><path d="M8 5.500v13a1 1 0 0 0 1.500.9l10.500-6.500a1 1 0 0 0 0-1.800L9.500 4.600A1 1 0 0 0 8 5.500Z"/></svg>',
  share: SVG('<path d="M12 15V3M8 7l4-4 4 4"/><path d="M5 12v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-7"/>'),
  check: SVG('<path d="M5 12.500l4.500 4.500L19 7.500"/>'),
};

let cfg = null;   // {origin, local, open, lang, session, abs}

const readHidden = () => { try { const l = JSON.parse(localStorage.getItem(HIDE_KEY) || "[]"); return Array.isArray(l) ? l : []; } catch { return []; } };
const isHidden = (path) => readHidden().includes(path);
const setHidden = (path, on) => { try { localStorage.setItem(HIDE_KEY, JSON.stringify(hideToggle(readHidden(), path, on))); } catch { /* хранилище закрыто — свернётся до перезагрузки */ } };

const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
const q = (path) => encodeURIComponent(cfg.abs(path));

// что процесс плагина знает о файле: на месте ли, <title> макета, время правки. Ответ живёт минуту, неудача — две (процесс могут перезапустить)
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

// кадр видео: <video> с CORS-ответом процесса плагина рисуется на canvas. Один за раз; не вышло (кодек, права) — значок
let grabbing = Promise.resolve();
function grab(path) {
  const run = () => new Promise((done) => {
    const v = document.createElement("video");
    v.crossOrigin = "anonymous";
    v.muted = true;
    v.preload = "auto";
    v.playsInline = true;
    const end = (url) => { clearTimeout(timer); v.removeAttribute("src"); try { v.load(); } catch { /* уже пусто */ } done(url); };
    const timer = setTimeout(() => end(null), 10000);
    v.addEventListener("error", () => end(null));
    v.addEventListener("loadedmetadata", () => { v.currentTime = Math.min(0.5, (v.duration || 1) / 2); });
    v.addEventListener("seeked", () => {
      try {
        const c = document.createElement("canvas"), w = 320, h = Math.max(1, Math.round(w * (v.videoHeight || 9) / (v.videoWidth || 16)));
        c.width = w; c.height = h;
        c.getContext("2d").drawImage(v, 0, 0, w, h);
        end(c.toDataURL("image/jpeg", 0.72));
      } catch { end(null); }
    }, { once: true });
    v.src = fileUrl(cfg.origin(), cfg.abs(path)) + "?v=1";
  });
  grabbing = grabbing.then(run, run);
  return grabbing;
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

// превью — когда карточка попала в поле зрения: макет — снимок (Chrome процесса плагина, кэш на диске), видео — кадр, gif — он сам
function preview(card) {
  const path = card.dataset.hdPath, kind = card.dataset.kind, m = meta.get(path);
  if (!m || m.state !== "ok" || card.dataset.pv === String(m.mtime)) return;
  card.dataset.pv = String(m.mtime);
  if (kind === "design") {
    const src = `${cfg.origin()}/__canvas/thumb?path=${q(path)}&m=${m.mtime}`;
    const bad = thumbs.get(src);
    if (bad && bad !== "ok" && Date.now() - bad < FAIL_TTL) return;
    fetch(src).then((r) => { if (!r.ok) throw new Error(String(r.status)); thumbs.set(src, "ok"); showPicture(card, src); }).catch(() => thumbs.set(src, Date.now()));
    return;
  }
  if (/\.gif$/i.test(path)) return showPicture(card, fileUrl(cfg.origin(), cfg.abs(path)) + "?v=1");
  const got = frames.get(path);
  if (got) return got !== "none" && showPicture(card, got);
  grab(path).then((url) => { frames.set(path, url || "none"); if (frames.size > 200) frames.delete(frames.keys().next().value); if (url) showPicture(card, url); });
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
  b.textContent = off ? T.show : T.hide;
  b.setAttribute("aria-expanded", off ? "false" : "true");
}

async function copy(text) {
  try { await navigator.clipboard.writeText(text); return true; } catch { /* нет доступа к буферу — запасной путь ниже */ }
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

function build(path, kind, who) {
  const T = cardText(cfg.lang());
  const card = el("div", "hdcard" + (isHidden(path) ? " off" : ""));
  card.dataset.hdPath = path;
  card.dataset.kind = kind;
  card.dataset.who = who || "";
  card.tabIndex = 0;
  card.setAttribute("role", "link");
  card.setAttribute("aria-label", T.open);
  const tile = el("div", "hdcard-tile");
  tile.innerHTML = ICONS[kind];
  const text = el("div", "hdcard-text");
  text.append(el("div", "hdcard-title", cardName(path)), el("div", "hdcard-sub", [T.by, who || null].filter(Boolean).join(" · ")));
  const acts = el("div", "hdcard-acts");
  const share = el("button", "hdcard-btn hdcard-share");
  share.type = "button";
  share.title = T.share;
  share.setAttribute("aria-label", T.share);
  share.innerHTML = ICONS.share;
  share.addEventListener("click", async (e) => {
    e.stopPropagation();
    if (!(await copy(cfg.abs(path)))) return;
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
  acts.append(share, hide);
  card.append(tile, text, acts);
  hideLabel(card);
  card.addEventListener("click", (e) => { if (!e.target.closest("button")) cfg.open(path); });
  card.addEventListener("keydown", (e) => { if (e.target === card && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); cfg.open(path); } });
  return card;
}

function remember(key, card) {
  if (!key) return;
  nodes.set(key, card);
  if (nodes.size > MAX_NODES) nodes.delete(nodes.keys().next().value);
}

// что в реплике: файл от send-file (плеер видео, файл-ссылка) заменяется карточкой на своём месте, путь в тексте — карточка в конце реплики
function found(row) {
  const out = [];
  if (row.classList.contains("sent-file")) {
    const v = row.querySelector("video.sent-video"), box = row.querySelector(".attach-list");
    const path = v ? pathFromHref(v.src) : pathFromHref(box?.querySelector("a")?.href) || pathFromHref(box?.querySelector("img")?.dataset.full);
    const kind = cardKind(path);
    if (kind && (v || box)) out.push({ path, kind, replace: v || box });
    return out;
  }
  if (!row.classList.contains("out") || row.classList.contains("tool")) return out;
  const seen = new Set();
  for (const a of row.querySelectorAll("a[data-path]")) {
    const path = a.dataset.path, kind = cardKind(path);
    if (!kind || !isAbsPath(path) || seen.has(path)) continue;
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
  if (pending.size && !queued) { queued = true; requestAnimationFrame(flush); }   // до отрисовки кадра: без мигания голой ссылки
}

// opts: origin() → адрес процесса плагина, local() → хаб открыт на этом компьютере, open(path) → открыть файл в Hub Design,
// lang() → язык страницы, session() → чья лента открыта, abs(path) → путь с раскрытым «~»
export function mountCards(opts) {
  if (cfg) return;
  cfg = opts;
  if (!cfg.local()) return;   // чужой компьютер (tailnet): файла у процесса нет, лента остаётся как есть
  new MutationObserver((list) => { for (const m of list) for (const n of m.addedNodes) want(n); }).observe(document.body, { childList: true, subtree: true });
  want(document.body);
}
