# Perf Lab

A performance demo for the part of flow-state that the flat `apps/stress` app cannot reach:
**nested sources**. Every node in the tree owns its own `FlowSource`, so a depth-4,
branch-3 tree mounts 121 of them, and a key owned by the root is resolved by an event that
bubbles through every ancestor between the consumer and the owner.

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

## Baseline

Chromium 151 headless, one machine, single run. Relative shape matters, absolute numbers do not.

Depth chain (d12 × b1), `flowGet` of a root-owned key:

| depth | 0 | 2 | 4 | 6 | 8 | 10 | 12 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| per call | 4µs | 5µs | 7µs | 8µs | 11µs | 12µs | 13µs |

Roughly linear in depth — about **0.75µs per ancestor hop** on top of ~4µs of fixed dispatch
cost. Two things follow:

- **Shadow DOM per level costs fan-out, not resolution.** Same d4 × b3 tree, root fan-out
  enqueue → flush: **1.6ms light DOM → 5.0ms with a shadow root at every level** (p50). Key
  resolution barely moves (2.06× vs 2.09× depth slowdown). The cost is in the binding pass —
  `#updateBindingsForKey` re-queries from the source root on every update, and crossing shadow
  roots means walking each one.
- **Owning a key closer to its consumers is worth real time.** Moving the owner from the root
  to depth 2 made the deepest leaf's resolution **~39% faster**.

Other measurements at d4 × b3 (121 sources, 81 leaves):

| | |
| --- | --- |
| Mount, 121 nested sources | 19.2ms (159µs/source) |
| Unmount | 2.0ms |
| Root fan-out, enqueue → flush | 1.6ms p50 / 2.4ms p95 |
| Leaf-local, 81 sources in one tick | 7.6ms |
| Subtree churn, mount + unmount | 7.3ms p50 |

## One behavior worth knowing

`flowWatch` hands a new subscriber the current value immediately on registration. Template
bindings are push-only — a freshly mounted element keeps its placeholder until the next update
touches that key. Rebuilding the tree here makes the difference visible: leaves (which use
`flowWatch`) come back populated, nodes (which use `flow-watch-*` attributes) would not, so the
lab re-pushes the key after every rebuild.
