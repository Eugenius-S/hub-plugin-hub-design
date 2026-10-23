import { test } from "node:test";
import assert from "node:assert/strict";
import { peerGroups, peerHub, peerName, peerRows, peerView, peerWhere } from "../dashboard.js";
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

test("another machine is named by its hub; no hub name - by its kind; two hubs of one name - with the machine", () => {
  assert.equal(peerHub({ machine: "mac-one", os: "mac", hub: "Studio hub" }), "Studio hub");
  assert.equal(peerHub({ machine: "mac-one", os: "mac", hub: "  " }), "Mac");
  assert.equal(peerHub({ machine: "box", os: "plan9" }), "box");
  const two = [{ machine: "a", os: "mac", hub: "Hub" }, { machine: "b", os: "windows", hub: "Hub" }];
  assert.equal(peerHub(two[1], two), "Hub (b)");
});

const grouped = [
  { id: "1", dir: "Ads", last: 3 }, { id: "2", dir: "Ads", last: 8 }, { id: "3", dir: "", last: 9 },
  { id: "4", dir: "Site", last: 5 }, { id: "5", last: 1 },
];

test("the designs of a machine fall into folders by direction: the touched last first, the ones without direction at the end", () => {
  const g = peerGroups(grouped);
  assert.deepEqual(g.map((x) => x.key), ["Ads", "Site", ""]);
  assert.deepEqual(g[0].files.map((x) => x.id), ["1", "2"]);
  assert.deepEqual(g[2].files.map((x) => x.id), ["3", "5"]);
});

test("inside the folder of a machine: tiles by direction, a direction opens its designs, a search and a machine without directions show cards", () => {
  assert.equal(peerView(grouped).mode, "folders");
  assert.deepEqual(peerView(grouped, { dir: "Ads" }).rows.map((x) => x.id), ["1", "2"]);
  assert.deepEqual(peerView(grouped, { dir: "" }).rows.map((x) => x.id), ["3", "5"]);
  assert.equal(peerView(grouped, { q: "ads" }).mode, "files");
  assert.equal(peerView([{ id: "x" }, { id: "y", dir: "" }]).mode, "files");
});
