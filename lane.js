// Hub Design: the designer's edit lane. Edits from the canvas carry `lane: <design path>` in /api/send; with hub.json
// design_lane on, the core gives them at once to that design's own executor (a busy one gets them mid-turn) and does not
// wait for the designer's turn. Off, or a hub without lanes - the field is ignored and the edit goes to the designer as before.
// The banner asks once: "Yes" writes design_lane.designer through the settings whitelist (the hub chat if that fails),
// "No" is remembered in this browser and never asked again.
import { makeT } from "./i18n.js";

export const KEY = "design_lane.designer";
export const NAME = "hd-edits";          // the lane sessions: hd-edits, hd-edits-2, ...
export const NO_KEY = "hub-design:lane-no";

export const STR = {
  en: {
    ask: "For the designer to work properly, edits need their own lane: edits from the canvas go at once to a separate executor and do not wait in the queue. Turn it on?",
    yes: "Yes",
    no: "No",
    asked: "Asked the hub to turn it on, waiting",
    hub_text: "Hub Design: turn on the designer's edit lane - in hub.json \"design_lane\": {\"designer\": \"{name}\"} (Settings key {key}). Edits from the canvas then go at once to a separate executor.",
  },
  ru: {
    ask: "Для нормальной работы дизайнера нужна отдельная линия правок: правки с холста сразу уходят отдельному исполнителю, не ждут очередь. Включить?",
    yes: "Да",
    no: "Нет",
    asked: "Попросили хаб включить, ждём",
    hub_text: "Hub Design: включи линию правок дизайнера - в hub.json \"design_lane\": {\"designer\": \"{name}\"} (ключ настроек {key}). Правки с холста тогда сразу уходят отдельному исполнителю.",
  },
};
export const t = makeT(STR);

// the settings row of the hub snapshot: null - this hub has no edit lanes (an older core), do not ask
export const row = (snap) => ((snap && snap.settings) || []).find((r) => r.key === KEY) || null;
export const isOn = (snap) => !!String((row(snap) || {}).value || "").trim();

// the banner shows when the hub knows lanes, the lane is off and the owner has not said "No" here
export function wanted(snap, store) {
  const r = row(snap);
  if (!r || isOn(snap)) return false;
  try { return store.getItem(NO_KEY) !== "1"; } catch { return true; }
}

// the lane of an edit: the design it is about (pins - their file, canvas edits - the design in focus)
export const laneOf = (path) => (typeof path === "string" && path.trim() ? path : undefined);
export const withLane = (body, path) => (laneOf(path) ? { ...body, lane: path } : body);

// hub: the Plugin API; hubName() - the hub session for the fallback; store - localStorage
export function createLaneAsk({ hub, hubName = () => "hub", store = globalThis.localStorage }) {
  const el = hub.el;
  const S = { busy: false, asked: false, on: false, sig: "" };
  const node = el("div", "hdd-need hd-lane");
  node.hidden = true;

  function paint(snap = hub.snapshot()) {
    const show = !S.on && wanted(snap, store);   // on: written, the next snapshot will say so
    const sig = JSON.stringify([show, S.busy, S.asked, t("ask")]);
    if (sig === S.sig) return;
    S.sig = sig;
    node.hidden = !show;
    if (!show) return node.replaceChildren();
    const r = el("div", "hdd-need-row");
    r.append(el("span", "hdd-need-t", S.asked ? t("asked") : t("ask")));
    if (!S.asked) {
      for (const id of ["yes", "no"]) {
        const b = el("button", "hdd-need-b", t(id));
        b.type = "button";
        b.dataset.lane = id;
        b.disabled = S.busy;
        b.addEventListener("click", () => answer(id));
        r.append(b);
      }
    }
    node.replaceChildren(r);
  }

  async function answer(id) {
    if (S.busy) return;
    if (id === "no") {
      try { store.setItem(NO_KEY, "1"); } catch { /* storage is full: asked again next time */ }
      return paint();
    }
    S.busy = true;
    paint();
    const r = await hub.post("/api/settings/set", { key: KEY, value: NAME });
    if (!(r && r.error)) S.on = true;
    else {   // the whitelist said no (an old core, a locked setting) - the standard way left is to ask the hub
      const h = await hub.post("/api/send", { session: hubName(), text: t("hub_text", { name: NAME, key: KEY }), action: true });
      S.asked = !(h && h.error);
    }
    S.busy = false;
    paint();
  }

  return { node, paint, answer, state: S };
}
