import { test } from "node:test";
import assert from "node:assert/strict";
import { peerName, peerRows, peerWhere } from "../dashboard.js";
import { setLangSource } from "../i18n.js";

const lang = (l) => setLangSource(() => l);
test.beforeEach(() => lang("en"));

const items = [
  { id: "a", name: "Promo", file: "index.html", session: "designer", last: 5 },
  { id: "b", name: "", file: "deck.html", session: "animator", last: 9 },
];

test("another machine is named by its kind, in the hub language; two of a kind get the machine name", () => {
  assert.equal(peerWhere({ machine: "pc-two", os: "windows" }), "Windows");
  lang("ru");
  assert.equal(peerWhere({ machine: "mac-one", os: "mac" }), "Mac");
  const two = [{ machine: "mac-one", os: "mac" }, { machine: "mac-two", os: "mac" }];
  assert.equal(peerWhere(two[1], two), "Mac (mac-two)");
  assert.equal(peerWhere({ machine: "box", os: "plan9" }), "box");
});

test("designs of another machine: newest first, searched by name, file and author, never under Mine", () => {
  assert.deepEqual(peerRows(items).map((x) => x.id), ["b", "a"]);
  assert.deepEqual(peerRows(items, { q: "PROMO" }).map((x) => x.id), ["a"]);
  assert.deepEqual(peerRows(items, { q: "animator" }).map((x) => x.id), ["b"]);
  assert.deepEqual(peerRows(items, { tab: "others" }).map((x) => x.id), ["b", "a"]);
  assert.deepEqual(peerRows(items, { tab: "mine" }), []);
});

test("a design without a title is named by its file", () => {
  assert.equal(peerName(items[0]), "Promo");
  assert.equal(peerName(items[1]), "deck");
});
