import { test } from "node:test";
import assert from "node:assert/strict";
import { createSteps, foldChange, writable, hasEffect, message } from "../lib.js";
import { setLangSource } from "../i18n.js";

setLangSource(() => "en");

const F = "/d/a.html";
const move = (dx, dy = 0) => ({ file: F, sel: "h1", label: "Title", tag: "h1", x0: 10, y0: 20, w0: 100, h0: 40, dx, dy, w: null, h: null, t0: null, t: null, css: {} });

test("steps: undo and redo go back in the order done, a new step drops the redo", () => {
  const s = createSteps();
  s.push({ k: "e", file: F, at: 1 });
  s.push({ k: "t", file: F, key: "gap", before: 8, after: 16, at: 5000 });
  s.push({ k: "e", file: F, at: 9000 });
  assert.deepEqual(s.undo().k, "e");
  assert.deepEqual(s.undo().key, "gap");
  assert.equal(s.redo().key, "gap");
  s.push({ k: "e", file: F, at: 20000 });
  assert.equal(s.redo(), null);
  assert.deepEqual(s.size(), [3, 0]);
});

test("steps: a slider drag is one step, from the first value to the last", () => {
  const s = createSteps({ merge: 800 });
  s.push({ k: "t", file: F, key: "gap", before: 8, after: 9, at: 1000 });
  s.push({ k: "t", file: F, key: "gap", before: 9, after: 12, at: 1300 });
  s.push({ k: "t", file: F, key: "gap", before: 12, after: 20, at: 1900 });
  s.push({ k: "t", file: F, key: "pad", before: 0, after: 4, at: 2000 });
  assert.deepEqual(s.size(), [2, 0]);
  s.undo();
  const g = s.undo();
  assert.equal(g.before, 8);
  assert.equal(g.after, 20);
});

test("steps: a design's steps are dropped when its file changes", () => {
  const s = createSteps();
  s.push({ k: "e", file: F, at: 1 });
  s.push({ k: "e", file: "/d/b.html", at: 2 });
  s.drop(F);
  assert.deepEqual(s.size(), [1, 0]);
  assert.equal(s.undo().file, "/d/b.html");
});

test("steps: the history is capped", () => {
  const s = createSteps({ max: 3 });
  for (let i = 0; i < 5; i++) s.push({ k: "e", file: F, at: i });
  assert.deepEqual(s.size(), [3, 0]);
});

test("fold: a move is a draft, the next move of the element replaces it", () => {
  let list = foldChange([], move(10));
  list = foldChange(list, move(30));
  assert.equal(list.length, 1);
  assert.equal(list[0].dx, 30);
  assert.equal(list[0].state, "draft");
});

test("fold: undone to the original before sending removes the draft", () => {
  let list = foldChange([], move(10));
  list = foldChange(list, move(0));
  assert.deepEqual(list, []);
});

test("fold: undone after the edit is in the file rolls the file back and tells the author", () => {
  const sent = { ...move(10), state: "sent", inFile: true };
  const list = foldChange([sent], move(0));
  assert.equal(list.length, 1);
  assert.equal(list[0].undone, true);
  assert.equal(list[0].state, "draft");
  assert.ok(hasEffect(list[0]));
  assert.deepEqual(writable(list, F), []);   // nothing of it is written any more: the file is rebuilt from the copy without it
  const text = message({ path: F, round: 2, comments: [], changes: list, auto: true });
  assert.match(text, /undone, back to the original/);
  assert.doesNotMatch(text, /Put them into the code/);
});

test("fold: undone after the edit went to the author in words tells him too", () => {
  const sent = { ...move(10), state: "sent", inFile: false, handed: true };
  const list = foldChange([sent], move(0));
  assert.equal(list.filter((c) => c.undone).length, 1);
});

test("fold: a partial undo after sending is a new draft over the sent record", () => {
  const sent = { ...move(30), state: "sent", inFile: true };
  const list = foldChange([sent], move(10));
  assert.equal(list.length, 2);
  assert.equal(writable(list, F)[0].dx, 10);
});

test("fold: undo, redo, undo before the notice has gone does not lose it", () => {
  const sent = { ...move(10), state: "sent", inFile: true };
  let list = foldChange([sent], move(0));
  list = foldChange(list, move(10));   // redo: the draft carries the memory that the author knows the old edit
  assert.equal(list.length, 1);
  assert.equal(list[0].undone, undefined);
  list = foldChange(list, move(0));
  assert.equal(list.length, 1);
  assert.equal(list[0].undone, true);
});

test("fold: another element or file is not touched", () => {
  const other = { ...move(5), sel: "p", state: "sent", inFile: true };
  const list = foldChange([other], move(10));
  assert.equal(list.length, 2);
  assert.equal(foldChange(list, move(0)).filter((c) => c.sel === "p").length, 1);
});
