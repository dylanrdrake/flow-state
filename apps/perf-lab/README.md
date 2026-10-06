# Perf Lab

A performance demo for the part of flow-state that the flat `apps/stress` app cannot reach:
**nested sources**. Every node in the tree owns its own `FlowSource`, so a depth-4,
branch-3 tree mounts 121 of them, and a key owned by the root is resolved by following the
source tree up through every ancestor source between the consumer and the owner.

Open `index.html` over HTTP (module imports and `fetch` for templates need an origin):

```bash
python3 -m http.server 8931
# then http://localhost:8931/apps/perf-lab/
```

Devtools is **off** by default and opt-in via `?devtools` — every flush schedules a snapshot
broadcast and snapshots walk the whole registry, so leaving it on means measuring the panel
instead of the library.

## How it differs from `apps/stress`

| | `apps/stress` | `apps/perf-lab` |
| --- | --- | --- |
| Sources | 1 flat source | 1 per node — 13 to 5,000+ nested |
| Components | one raw `HTMLElement` | `FlowStateComponent` throughout, mount/unmount churn |
| UI | flat `<span>` grids | nested panels, `flow-if`, `flow-ul`/`flow-li`, multi-binding rows |
| Shadow DOM | one root | optional at every level |
| Timing | synchronous `update()` call | enqueue → flush (the `update()` promise) → paint |
| Stats | mean | p50 / p95 / p99 + long tasks |

The timing difference matters most. `update()` is async — it queues a microtask flush — so
timing the call measures the functional-update clone and a push, not the flush, the binding
pass, or the watcher notifications. This app awaits the returned promise instead.

## Scenarios

- **Mount / Unmount** — constructing and destroying N nested sources with their watchers and DOM.
- **Resolution depth** — `flowGet()` for a root-owned key from each depth. Individual calls sit
  under the clock's resolution, so a batch of 1,000 is timed as a unit and divided.
- **Root fan-out** — one root key that every leaf watches and every node binds to.
- **Leaf-local updates** — every leaf updates its own source in one tick; N independent flushes.
- **Key shadowing** — re-runs the resolution measurement with a mid-tree source that owns the
  key, so descendants stop there instead of walking to the root.
- **Subtree churn** — repeated mount/unmount in a hidden host, isolating source create/destroy
  and watcher cleanup from layout.

Set **branch = 1** to build a deep chain and isolate depth from breadth — the shape that makes
the resolution curve legible.

## Exporting

**Export JSON** downloads the whole session: run metadata (user agent, hardware
concurrency, tree shape, whether devtools was on, the scenario constants) plus one entry per
scenario run. Each run carries the flat rows shown in the table *and* a `series` object with
the raw measurements behind them — the per-depth resolution arrays, every fan-out flush and
paint sample, per-leaf update times, churn timings. That is the part a CSV would flatten away.

```
flow-state-perf-d4xb3-2026-09-06T16-27-49.json
{
  "shapeAtExport": { "depth": 4, "branch": 3, "shadow": false, "sources": 121, "leaves": 81 },
  "constants": { "fanoutRounds": 60, "resolveBatch": 1000, ... },
  "runs": [
    {
      "scenario": "resolveDepth",
      "rows": [ { "detail": "depth 0 · 1 nodes · median of 9", "value": "3µs", "ms": 0.003 } ],
      "series": { "resolution:Resolve": [ { "depth": 0, "nodes": 1, "medianMs": 0.0015, "perCallMs": [...] } ] }
    }
  ]
}
```

Rows keep both `value` (formatted, as displayed) and `ms`/`ratio` (raw), so runs are
comparable across machines and shapes without re-parsing strings. **Clear results** resets the
export buffer too.

## What the lab is careful about

Two precautions date from when every update re-queried the DOM under its source:

- **`broadcast` is owned by the tree root**, the depth-0 `perf-node`, not by the lab
  component.
- **The results table is capped** at the last `RESULTS_DISPLAY_LIMIT` rows. The export
  buffer keeps every row regardless.

Back then a key owned by the lab dragged the controls, readout and results table into every
fan-out binding pass, and an uncapped table slowed the numbers it was displaying. Five
consecutive `Run all` cycles went from 0.80ms to 3.30ms fan-out p50 with 116 rows
accumulated, and nothing wrong with the library.

Updates now read a binding index, so their cost follows the number of elements bound to
the changed key, not the amount of DOM under the source. Neither precaution should change
the numbers any more (not re-measured without them). Both are kept: they cost nothing, and
they keep the lab's own DOM out of the tree's mount and unmount work.

## Baseline

Chromium 140 headless, one machine, median of 5 `Run all` runs (3 for the depth chain).
Relative shape matters, absolute numbers do not. "Before" is the last commit that queried the
DOM on every update and resolved keys with a bubbling event (`7209820`), measured the same
way on the same machine.

Depth chain (d12 × b1), `flowGet` of a root-owned key:

| depth | 0 | 2 | 4 | 6 | 8 | 10 | 12 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| per call | 0.2µs | 0.3µs | 0.3µs | 0.3µs | 0.4µs | 0.4µs | 0.5µs |
| before | 1.3µs | 1.9µs | 3.1µs | 2.9µs | 3.9µs | 4.3µs | 5.0µs |

Still linear in depth, but about **0.025µs per ancestor source** on top of ~0.2µs fixed,
where it was ~0.3µs per hop on top of ~1.3µs of event dispatch. Three things follow:

- **Shadow DOM per level no longer costs fan-out.** Same d4 × b3 tree, root fan-out
  enqueue → flush: **1.0ms light DOM, 1.0ms with a shadow root at every level** (p50). Before,
  it was 1.2ms → 3.0ms, because the binding pass walked every shadow root on every update.
- **Shadow DOM per level costs mount instead.** Mounting the same tree takes 10.8ms in light
  DOM and 15.0ms with shadow roots. Indexing happens when nodes arrive, and each shadow root
  is one more subtree to observe and index.
- **Owning a key closer to its consumers still helps, on a much smaller number.** Moving the
  owner from the root to depth 6 took the deepest leaf's resolution from 0.5µs to 0.3µs.

Other measurements at d4 × b3 (121 sources, 81 leaves), light DOM, with shadow DOM in
brackets:

| | now | before |
| --- | --- | --- |
| Mount, 121 nested sources | 10.8ms, 89µs/source (15.0ms) | 9.1ms (6.3ms) |
| Unmount | 0.9ms (0.8ms) | 1.0ms (0.7ms) |
| Root fan-out, enqueue → flush, p50 / p95 | 1.0ms / 1.5ms (1.0ms / 1.3ms) | 1.2ms / 1.7ms (3.0ms / 3.8ms) |
| Leaf-local, 81 sources in one tick | 1.8ms (1.8ms) | 2.6ms (3.1ms) |
| Subtree churn, mount + unmount, p50 | 3.1ms (3.8ms) | 2.1ms (1.9ms) |

The trade is visible in the last column: updates and key resolution got cheaper, mount and
churn got more expensive, most of all with shadow DOM (mount 2.4× slower).

## One behavior worth knowing

`flowWatch` hands a new subscriber the current value immediately on registration. Template
bindings are push-only — a freshly mounted element keeps its placeholder until the next update
touches that key. Rebuilding the tree here makes the difference visible: leaves (which use
`flowWatch`) come back populated, nodes (which use `flow-watch-*` attributes) would not, so the
lab re-pushes the key after every rebuild.
