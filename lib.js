// Канвас дизайна: чистая логика без DOM — адреса, список файлов сессии, текст правок для дизайнера. Тесты: tests/lib.test.mjs

export const SIZES = [
  { id: "fit", label: "По окну", w: 0 },
  { id: "desktop", label: "1440", w: 1440 },
  { id: "laptop", label: "1280", w: 1280 },
  { id: "tablet", label: "768", w: 768 },
  { id: "mobile", label: "390", w: 390 },
];

// порт процесса плагина: порт страницы хаба + 11 (8787 → 8798), как в server.py
export const canvasPort = (pagePort) => Number(pagePort || 8787) + 11;

// адрес файла у процесса: /f/Users/me/site/index.html, Windows — /f/C:/site/index.html
export function fileUrl(origin, path) {
  const p = String(path).replace(/\\/g, "/").replace(/^\/+/, "");
  return `${origin}/f/${p.split("/").map((s, i) => (i === 0 && /^[A-Za-z]:$/.test(s) ? s : encodeURIComponent(s))).join("/")}`;
}

const HTML_PATH = /(?:~|\/|[A-Za-z]:[\\/])[^\s"'`<>()\[\]{}|,;*]*?\.html?(?![\w])/g;

export function htmlPaths(text) {
  return [...String(text || "").matchAll(HTML_PATH)].map((m) => m[0]).filter((p) => !p.includes("://"));
}

// HTML-файлы, с которыми работала сессия: что писала и правила, что прислала, что назвала — свежие первыми
export function recentHtml(items, limit = 12) {
  const out = [];
  const add = (p) => {
    if (!p || !/\.html?$/i.test(p) || p.startsWith("http")) return;
    const i = out.indexOf(p);
    if (i >= 0) out.splice(i, 1);
    out.push(p);
  };
  for (const it of items || []) {
    if (it.kind === "tool") {
      const inp = it.input || {};
      add(inp.file_path || inp.path || inp.notebook_path);
    } else if (it.kind === "file") add(it.path);
    else if (it.kind === "out" || it.kind === "in") htmlPaths(it.text).forEach(add);
  }
  return out.reverse().slice(0, limit);
}

// строки разговора для чата: реплики владельца и сессии, присланные файлы; шаги инструментов и служебное — нет
export function chatLines(items, limit = 60) {
  return (items || [])
    .filter((it) => (it.kind === "in" || it.kind === "out") && String(it.text || "").trim() || it.kind === "file")
    .slice(-limit)
    .map((it) => ({ k: it.k ?? it.seq, kind: it.kind, ts: it.ts,
      text: it.kind === "file" ? `${it.caption ? it.caption + "\n" : ""}${it.path}` : String(it.text) }));
}

const px = (n) => `${Math.round(n)}`;
const signed = (n) => (n > 0 ? `+${Math.round(n)}` : `${Math.round(n)}`);
const cut = (s, n = 80) => {
  const t = String(s || "").replace(/\s+/g, " ").trim();
  return t.length > n ? t.slice(0, n - 1) + "…" : t;
};

// одна правка «двигать» — словами и цифрами
export function describeChange(c) {
  const parts = [];
  if (c.dx || c.dy) {
    const where = [c.dx ? `${signed(c.dx)} px по X` : "", c.dy ? `${signed(c.dy)} px по Y` : ""].filter(Boolean).join(", ");
    parts.push(`сдвиг ${where} (было x ${px(c.x0)}, y ${px(c.y0)} → стало x ${px(c.x0 + c.dx)}, y ${px(c.y0 + c.dy)})`);
  }
  if (c.w != null && c.h != null && (Math.round(c.w) !== Math.round(c.w0) || Math.round(c.h) !== Math.round(c.h0))) {
    parts.push(`размер ${px(c.w0)}×${px(c.h0)} → ${px(c.w)}×${px(c.h)} px`);
  }
  if (c.t != null && c.t !== c.t0) parts.push(`текст «${cut(c.t0, 200)}» → «${cut(c.t, 200)}»`);
  return parts.join("; ");
}

export const hasEffect = (c) => !!describeChange(c);

// сообщение дизайнеру пачкой: комменты к точкам и правки руками; файл правит он сам
export function message({ path, round, view, comments, changes }) {
  const lines = [`Правки к дизайну \`${path}\` (канвас, раунд ${round}; окно ${view.w}×${view.h} px, координаты — от верхнего левого угла страницы).`];
  let n = 0;
  for (const c of comments) {
    if (!String(c.text || "").trim()) continue;
    n += 1;
    const el = c.sel ? `\`${c.sel}\`${c.label ? ` «${cut(c.label)}»` : ""}` : "точка";
    lines.push(`${n}. Коммент к ${el}, точка x ${px(c.x)}, y ${px(c.y)} (элемент ${px(c.w)}×${px(c.h)} в x ${px(c.ex)}, y ${px(c.ey)}): ${String(c.text).trim()}`);
  }
  for (const c of changes) {
    const what = describeChange(c);
    if (!what) continue;
    n += 1;
    lines.push(`${n}. Сдвинул руками \`${c.sel}\`${c.label ? ` «${cut(c.label)}»` : ""}: ${what}.`);
  }
  if (!n) return "";
  if (changes.some(hasEffect)) lines.push("Сдвиги я сделал прямо в предпросмотре — перенеси их в код так, чтобы вышло так же (не transform поверх, а в вёрстку).");
  return lines.join("\n");
}

export const draftCount = (comments, changes) =>
  comments.filter((c) => String(c.text || "").trim()).length + changes.filter(hasEffect).length;
