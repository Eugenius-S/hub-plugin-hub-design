// Hub Design: what the owner ticked on the start screen. Pure logic (no DOM) so it can be tested apart from the page.
// An item is a card (one design: its path) or a folder tile (all the designs inside it); the selection is a Set of design paths.

// "all" | "some" | "none": how much of the item is ticked (a tile with only a part of its designs ticked is "some")
export function tileState(sel, paths) {
  if (!paths.length) return "none";
  let n = 0;
  for (const p of paths) if (sel.has(p)) n++;
  return n === 0 ? "none" : n === paths.length ? "all" : "some";
}

// tick or untick the paths; returns true if the set changed
export function setMany(sel, paths, on) {
  let changed = false;
  for (const p of paths) {
    if (on && !sel.has(p)) { sel.add(p); changed = true; }
    else if (!on && sel.has(p)) { sel.delete(p); changed = true; }
  }
  return changed;
}

// the ids between two items of the screen order, both ends included; a lost anchor means just the clicked one
export function rangeIds(order, from, to) {
  const b = order.indexOf(to);
  if (b < 0) return [];
  const a = order.indexOf(from);
  if (a < 0) return [to];
  return order.slice(Math.min(a, b), Math.max(a, b) + 1);
}

// forget the designs that are not there any more (deleted, moved away, gone); returns true if the set changed
export function prune(sel, valid) {
  let changed = false;
  for (const p of [...sel]) if (!valid.has(p)) { sel.delete(p); changed = true; }
  return changed;
}

