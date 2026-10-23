// Hub Design: the question of the first start - a card over the page. Nothing is downloaded until the owner answers (the plugin process holds it back;
// linkctl.py): Download / Don't download / I'll change it in the settings. The same question waits in Telegram; the first answer from either place settles it.
// The card also says which agents Hub Design needs and gives the "Install" button for the ones the hub does not have yet.
import { currentLang, makeT } from "./i18n.js";

export const POLL_MS = 8000;      // a question answered in Telegram goes away from the page within this time
export const RETRY_MS = 4000;     // the plugin process may start after the page: ask again a few times
export const TRIES = 5;
export const REPAINT_MS = 2000;   // the agent rows follow the hub snapshot (an installed agent appears there)

export const STR = {
  en: {
    title: "Hub Design: download the style library?",
    body: "Preinstalled: {sources} style sources - the Refero site and the GitHub repositories of ready design, slide, email and iOS sets, about {styles} styles in all.",
    cost: "Download: about {gb} GB of disk and {hours} hours in the background. Nothing is downloaded until you answer.",
    sources: "Sources",
    yes: "Download",
    no: "Don't download",
    settings: "I'll change it in the settings",
    hint: "Settings → Hub Design: styles. The question can be shown again there.",
    agents: "Hub Design needs these agents:",
    install: "Install",
    asked: "Request sent to the hub, waiting",
    here: "in the hub",
    error: "No answer from Hub Design. Try again.",
  },
  ru: {
    title: "Hub Design: скачать библиотеку стилей?",
    body: "Предустановлено: {sources} источников стилей - сайт Refero и репозитории GitHub с готовыми наборами дизайна, слайдов, писем и iOS, всего около {styles} стилей.",
    cost: "Скачка: около {gb} ГБ на диске и {hours} часа в фоне. Пока вы не ответите, ничего не скачивается.",
    sources: "Источники",
    yes: "Качаем",
    no: "Не качаем",
    settings: "Поменяю в настройках",
    hint: "Настройки → Hub Design: стили. Там же вопрос можно показать снова.",
    agents: "Для Hub Design нужны агенты:",
    install: "Поставить",
    asked: "Запрос отправлен хабу, ждём",
    here: "уже в хабе",
    error: "Нет ответа от Hub Design. Попробуйте ещё раз.",
  },
};
export const t = makeT(STR);

// "https://github.com/owner/repo" -> "owner/repo"; a site -> its host
export function sourceName(url) {
  try {
    const u = new URL(url);
    return u.hostname === "github.com" ? u.pathname.replace(/^\/|\/$/g, "") : u.hostname;
  } catch { return String(url || ""); }
}

// the numbers in the sentence: Russian writes the decimal with a comma
export function facts(q, lang) {
  const gb = String(q.gb ?? "");
  return { sources: q.sources, styles: q.styles, hours: q.hours, gb: String(lang || "").startsWith("ru") ? gb.replace(".", ",") : gb };
}

// hub: the Plugin API; base() - the address of the plugin process; local() - only the hub opened on this computer reaches it (the other pages: Telegram only);
// agents() - lacking() of lib.js: [{name, title, state: "ask"|"wait"}], all the needed ones with their state; install(name) - the same "Install" as the banner
export function createFirstRun({ hub, base, local = () => true, agents = () => [], install = async () => {}, setTimer = setTimeout, clear = clearTimeout }) {
  const el = hub.el;
  const S = { q: null, timer: 0, tick: 0, busy: false, err: "", sig: "", tries: 0 };
  const node = el("div", "hdq");
  node.hidden = true;
  node.setAttribute("role", "dialog");
  node.setAttribute("aria-modal", "true");

  const call = async (method, body) => {
    const res = await fetch(`${base()}/__canvas/fetch`, {
      method, cache: "no-store", ...(body ? { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) } : {}),
    });
    let data = null;
    try { data = await res.json(); } catch { data = null; }
    return { ok: res.ok, data };
  };

  function paint() {
    const q = S.q;
    node.hidden = !q;
    if (!q) { node.replaceChildren(); S.sig = ""; return; }
    const rows = agents();
    const sig = JSON.stringify([currentLang(), q, rows.map((r) => r.name + r.state), S.busy, S.err]);
    if (sig === S.sig) return;
    S.sig = sig;
    node.setAttribute("aria-label", t("title"));
    const card = el("div", "hdq-card");
    const f = facts(q, currentLang());
    const list = el("details", "hdq-src");
    list.append(el("summary", "", t("sources")), ...(q.links || []).map((u) => el("div", "hdq-link", sourceName(u))));
    card.append(el("h2", "hdq-h", t("title")), el("p", "hdq-p", t("body", f)), el("p", "hdq-p hdq-cost", t("cost", f)));
    if (q.links && q.links.length) card.append(list);
    if (rows.length) {
      const box = el("div", "hdq-agents");
      box.append(el("div", "hdq-ah", t("agents")));
      for (const r of rows) {
        const row = el("div", "hdq-arow");
        row.dataset.agent = r.name;
        const b = el("button", "hdq-ab", r.state === "wait" ? t("asked") : t("install"));
        b.type = "button";
        b.disabled = r.state === "wait";
        b.addEventListener("click", async () => { await install(r.name); paint(); });
        row.append(el("span", "hdq-an", r.title), b);
        box.append(row);
      }
      card.append(box);
    }
    const btns = el("div", "hdq-btns");
    for (const [id, cls] of [["yes", "hdq-b hdq-yes"], ["no", "hdq-b"], ["settings", "hdq-b"]]) {
      const b = el("button", cls, t(id));
      b.type = "button";
      b.dataset.choice = id;
      b.disabled = S.busy;
      b.addEventListener("click", () => answer(id));
      btns.append(b);
    }
    card.append(btns, el("p", "hdq-hint", t("hint")));
    if (S.err) card.append(el("p", "hdq-err", S.err));
    node.replaceChildren(card);
  }

  async function answer(choice) {
    if (S.busy) return;
    S.busy = true;
    S.err = "";
    paint();
    try {
      const r = await call("POST", { action: "firstrun", choice });
      if (r.ok) S.q = null;
      else S.err = t("error");
    } catch { S.err = t("error"); }
    S.busy = false;
    stopTimers();
    paint();
    if (S.q) schedule();
  }

  function stopTimers() { clear(S.timer); clear(S.tick); S.timer = S.tick = 0; }
  function schedule() {
    clear(S.timer);
    clear(S.tick);
    S.timer = setTimer(refresh, POLL_MS);
    S.tick = setTimer(function again() { paint(); if (S.q) S.tick = setTimer(again, REPAINT_MS); }, REPAINT_MS);
  }

  // asks the plugin process whether the question waits; polls while it does (the settings tab calls it too after "show the question again")
  async function refresh() {
    stopTimers();
    if (!local()) { S.q = null; return paint(); }
    let down = false;
    try {
      const r = await call("GET");
      S.q = r.ok && r.data && r.data.firstrun ? r.data.firstrun : null;
      down = !r.ok;
    } catch { S.q = null; down = true; }
    paint();
    if (S.q) { S.tries = 0; schedule(); }
    else if (down && S.tries++ < TRIES) S.timer = setTimer(refresh, RETRY_MS);   // the plugin process is still starting
  }

  return { node, refresh, paint, answer, state: S };
}
