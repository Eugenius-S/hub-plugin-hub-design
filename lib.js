// Hub Design: чистая логика без DOM — адреса, список файлов сессии, текст правок для дизайнера. Тесты: tests/lib.test.mjs

// ширина окна дизайна — переключатель «Окно» в панели настроек
export const SIZES = [
  { id: "fit", label: "По окну", w: 0 },
  { id: "desktop", label: "1440", w: 1440 },
  { id: "laptop", label: "1280", w: 1280 },
  { id: "tablet", label: "768", w: 768 },
  { id: "mobile", label: "390", w: 390 },
];

// масштаб: 0 — вписать по ширине
export const ZOOMS = [0, 50, 75, 100, 125, 150];

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

// свойства панели «Правка»: разделы и поля. kind: num (px), text, color, pick (список), box (4 стороны)
export const PROPS = [
  { title: "Текст", rows: [
    [{ p: "font-family", label: "Шрифт", kind: "text", wide: true }],
    [{ p: "font-size", label: "Размер", kind: "num" }, { p: "font-weight", label: "Насыщ.", kind: "pick", options: ["100", "200", "300", "400", "500", "600", "700", "800", "900"] }],
    [{ p: "color", label: "Цвет", kind: "color" }, { p: "text-align", label: "Выравн.", kind: "pick", options: ["left", "center", "right", "justify"] }],
    [{ p: "line-height", label: "Строка", kind: "num", unitless: true }, { p: "letter-spacing", label: "Трекинг", kind: "num" }]] },
  { title: "Размер", rows: [[{ p: "width", label: "Ширина", kind: "num" }, { p: "height", label: "Высота", kind: "num" }]] },
  { title: "Раскладка", flexOnly: true, rows: [
    [{ p: "gap", label: "Зазор", kind: "num" }, { p: "flex-direction", label: "Направл.", kind: "pick", options: ["row", "row-reverse", "column", "column-reverse"] }],
    [{ p: "justify-content", label: "Распред.", kind: "pick", options: ["flex-start", "center", "flex-end", "space-between", "space-around", "space-evenly"] },
      { p: "align-items", label: "Выравн.", kind: "pick", options: ["flex-start", "center", "flex-end", "stretch", "baseline"] }]] },
  { title: "Блок", rows: [
    [{ p: "opacity", label: "Прозр.", kind: "num", unitless: true }, { p: "background-color", label: "Фон", kind: "color" }],
    [{ p: "padding-top", label: "Внутр. В", kind: "num" }, { p: "padding-right", label: "П", kind: "num" }],
    [{ p: "padding-bottom", label: "Н", kind: "num" }, { p: "padding-left", label: "Л", kind: "num" }],
    [{ p: "margin-top", label: "Внеш. В", kind: "num" }, { p: "margin-bottom", label: "Н", kind: "num" }],
    [{ p: "border-top-width", label: "Рамка", kind: "num" }, { p: "border-top-style", label: "Вид", kind: "pick", options: ["none", "solid", "dashed", "dotted"] }],
    [{ p: "border-top-color", label: "Цвет рамки", kind: "color" }, { p: "border-radius", label: "Скругл.", kind: "num" }]] },
];

// значение поля → то, что пишем в style; пусто — не трогать
export function cssValue(field, raw) {
  const v = String(raw ?? "").trim();
  if (!v) return null;
  if (field.kind === "num") {
    if (/^-?\d*\.?\d+$/.test(v)) return field.unitless ? v : v + "px";
    return /^-?\d*\.?\d+(px|em|rem|%|vw|vh)$/.test(v) ? v : null;
  }
  return v;
}

const num = (v) => (/^-?\d*\.\d{3,}px$/.test(v) ? Math.round(parseFloat(v) * 100) / 100 + "px" : v);

// одна правка «править» — словами и цифрами
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
  const css = Object.entries(c.css || {}).filter(([, v]) => v && v.from !== v.to);
  if (css.length) parts.push("стиль: " + css.map(([p, v]) => `${p} ${num(v.from)} → ${num(v.to)}`).join(", "));
  return parts.join("; ");
}

export const hasEffect = (c) => !!describeChange(c);

// рисунок от руки: что отмечено и где
export function describeDrawing(d) {
  const b = d.box || {};
  const area = `x ${px(b.x)}, y ${px(b.y)}, ${px(b.w)}×${px(b.h)} px`;
  const near = d.sel ? ` около \`${d.sel}\`${d.label ? ` «${cut(d.label)}»` : ""}` : "";
  if (d.kind === "arrow") return `стрелка от x ${px(d.from.x)}, y ${px(d.from.y)} к x ${px(d.to.x)}, y ${px(d.to.y)}${near}`;
  if (d.kind === "loop") return `обведена область ${area}${near}`;
  return `отмечена область ${area}${near}`;
}

// сообщение дизайнеру пачкой: комменты к точкам, правки руками, рисунки; файл правит он сам
export function message({ path, round, view, comments, changes, drawings = [] }) {
  const lines = [`Правки к дизайну \`${path}\` (Hub Design, раунд ${round}; окно ${view.w}×${view.h} px, координаты — от верхнего левого угла страницы).`];
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
    lines.push(`${n}. Поправил руками \`${c.sel}\`${c.label ? ` «${cut(c.label)}»` : ""}: ${what}.`);
  }
  for (const d of drawings) {
    n += 1;
    lines.push(`${n}. Рисунок от руки: ${describeDrawing(d)}${String(d.text || "").trim() ? ` — ${String(d.text).trim()}` : ""}.`);
  }
  if (!n) return "";
  if (changes.some(hasEffect)) lines.push("Правки руками я сделал прямо в предпросмотре — перенеси их в код так, чтобы вышло так же (не transform поверх, а в вёрстку).");
  return lines.join("\n");
}

export const draftCount = (comments, changes, drawings = []) =>
  comments.filter((c) => String(c.text || "").trim()).length + changes.filter(hasEffect).length + drawings.length;
