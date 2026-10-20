import { test } from "node:test";
import assert from "node:assert/strict";
import { PRESETS, editedText, isStub, nameOf, shown, stubText } from "../dashboard.js";

const files = [
  { path: "/d/kolo/index.html", session: "designer", ts: 100, last: 300 },
  { path: "/d/promo/landing.html", session: "animator", ts: 200, last: 200 },
  { path: "/d/deck/index.html", session: "designer", ts: 50, last: 400 },
];

test("index.html называют по папке, остальное — по файлу", () => {
  assert.equal(nameOf("/d/kolo/index.html"), "kolo");
  assert.equal(nameOf("/d/promo/landing.html"), "landing");
  assert.equal(nameOf("index.html"), "index");
});

test("вкладки: Мои — открытые на холсте, Чужие — остальные", () => {
  const mine = new Set(["/d/kolo/index.html"]);
  assert.equal(shown(files, { tab: "all", mine }).length, 3);
  assert.deepEqual(shown(files, { tab: "mine", mine }).map((f) => nameOf(f.path)), ["kolo"]);
  assert.deepEqual(shown(files, { tab: "others", mine }).map((f) => nameOf(f.path)), ["deck", "landing"]);
});

test("поиск по имени, пути и сессии; сортировка — свежие первыми или по названию", () => {
  assert.deepEqual(shown(files, { q: "ANIM" }).map((f) => nameOf(f.path)), ["landing"]);
  assert.deepEqual(shown(files, { q: "kolo" }).map((f) => nameOf(f.path)), ["kolo"]);
  assert.deepEqual(shown(files).map((f) => nameOf(f.path)), ["deck", "kolo", "landing"]);
  assert.deepEqual(shown(files, { sort: "name" }).map((f) => nameOf(f.path)), ["deck", "kolo", "landing"].sort());
  assert.deepEqual(shown(files, { sort: "recent" }).map((f) => f.last), [400, 300, 200]);
});

test("shown не меняет исходный список", () => {
  const before = files.map((f) => f.path).join();
  shown(files, { sort: "name" });
  assert.equal(files.map((f) => f.path).join(), before);
});

test("пресеты: Анимация — аниматору, остальные — дизайнеру; у каждого заготовка «новый …: »", () => {
  assert.deepEqual(PRESETS.map((p) => p.id), ["slides", "design", "codebase", "system", "motion"]);
  assert.equal(PRESETS.find((p) => p.id === "motion").to, "animator");
  for (const p of PRESETS.filter((p) => p.id !== "motion")) assert.equal(p.to, "designer");
  for (const p of PRESETS) assert.match(p.lead, /: $/);
});

test("заготовка заменяет прежнюю заготовку, но не слова владельца", () => {
  const [slides, , , , motion] = PRESETS;
  assert.equal(stubText("", slides.lead), slides.lead);
  assert.equal(stubText(slides.lead, motion.lead), motion.lead);
  assert.equal(stubText("сделай лендинг", motion.lead), "сделай лендинг");
  assert.ok(isStub(slides.lead));
  assert.ok(!isStub("сделай лендинг"));
});

test("«изменён N назад»", () => {
  assert.match(editedText({ last: 1000 }, 1000 + 7200), /^изменён .+/);
  assert.equal(editedText({}, 1000), "");
});
