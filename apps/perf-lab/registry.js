// Module-level registry of mounted perf nodes, keyed by depth.
//
// Scenarios need to reach nodes at a specific depth without walking the DOM —
// a querySelectorAll across ~1k elements and their shadow roots would cost more
// than the thing being measured. Nodes register on connect and drop off on
// disconnect, so the registry doubles as a live source count.

/** @type {Map<number, Set<Element>>} */
const byDepth = new Map();

export function registerNode(depth, el) {
  let bucket = byDepth.get(depth);
  if (!bucket) {
    bucket = new Set();
    byDepth.set(depth, bucket);
  }
  bucket.add(el);
}

export function unregisterNode(depth, el) {
  byDepth.get(depth)?.delete(el);
}

export function nodesAtDepth(depth) {
  return Array.from(byDepth.get(depth) ?? []);
}

export function depths() {
  return Array.from(byDepth.keys()).filter((d) => (byDepth.get(d)?.size ?? 0) > 0).sort((a, b) => a - b);
}

export function totalNodes() {
  let n = 0;
  for (const bucket of byDepth.values()) n += bucket.size;
  return n;
}

export function clearRegistry() {
  byDepth.clear();
}
