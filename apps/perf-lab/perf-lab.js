import { FlowStateComponent } from '../../lib/FlowStateComponent.js';
import { flowGet, flowDevtools } from '../../lib/FlowState.js';
import { nodesAtDepth, depths, totalNodes, clearRegistry } from './registry.js';
import './components/perf-node/perf-node.js';

// Devtools is opt-in here. It is a real cost — every flush schedules a snapshot
// broadcast, and snapshots walk the whole registry — so leaving it on by default
// would mean measuring the panel instead of the library.
if (new URLSearchParams(location.search).has('devtools')) flowDevtools();

const loadText = async (relativePath) => {
  const response = await fetch(new URL(relativePath, import.meta.url));
  if (!response.ok) throw new Error(`Failed to load ${relativePath}: ${response.status}`);
  return response.text();
};

const [styles, template] = await Promise.all([
  loadText('./perf-lab.css'),
  loadText('./perf-lab.html'),
]);

const DEPTHS = [2, 3, 4, 5, 6, 8, 10, 12];
const BRANCHES = [1, 2, 3, 4];
const DEFAULT_DEPTH = 4;
const DEFAULT_BRANCH = 3;

const FANOUT_ROUNDS = 60;
const RESOLVE_BATCH = 1000;  // flowGet calls timed as one batch
const RESOLVE_ROUNDS = 9;    // batches per depth
const CHURN_ROUNDS = 20;

const SCENARIOS = [
  {
    id: 'mount',
    label: 'Mount / Unmount',
    desc: 'Builds the whole tree, then tears it down. Every node owns a FlowSource, so this is the '
        + 'cost of constructing and destroying N nested sources, their watchers, and their DOM.',
  },
  {
    id: 'resolveDepth',
    label: 'Resolution depth',
    desc: 'flowGet() for a root-owned key, called from nodes at each depth. The key is resolved by a '
        + 'bubbling event that every ancestor source listens for, so this traces the cost curve of '
        + 'nesting itself — the number the flat stress app cannot produce.',
  },
  {
    id: 'fanout',
    label: 'Root fan-out',
    desc: 'The root updates one key that every leaf watches and every node binds to. Measures '
        + 'enqueue → flush (the update() promise) and enqueue → paint, not just the synchronous '
        + 'enqueue call.',
  },
  {
    id: 'leafLocal',
    label: 'Leaf-local updates',
    desc: 'Every leaf updates its own source in the same tick. Nested sources should flush '
        + 'independently, so this is N concurrent flushes rather than one wide one.',
  },
  {
    id: 'shadowedKey',
    label: 'Key shadowing',
    desc: 'Re-runs the resolution measurement with a mid-tree source that owns the key itself. '
        + 'Descendants should stop there instead of walking to the root — the difference is what '
        + 'shadowing buys.',
  },
  {
    id: 'churn',
    label: 'Subtree churn',
    desc: 'Mounts and unmounts a subtree repeatedly in a hidden host, so the number is source '
        + 'create + destroy and watcher cleanup rather than layout.',
  },
];

// --- measurement helpers ---------------------------------------------------

const nextPaint = () => new Promise((resolve) => requestAnimationFrame(() => resolve()));
const nextTick = () => new Promise((resolve) => setTimeout(resolve, 0));

const percentile = (samples, p) => {
  if (!samples.length) return 0;
  const sorted = [...samples].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length));
  return sorted[index];
};

/** ms -> a human-readable duration that keeps sub-millisecond detail. */
const fmt = (ms) => (ms < 1 ? `${(ms * 1000).toFixed(0)}µs` : `${ms.toFixed(2)}ms`);

class PerfLab extends FlowStateComponent {
  styles = styles;
  template = template;

  sourceConfig = {
    // The key every leaf watches and every node binds to. Owned here, at the root.
    broadcast: 0,
    sourceCount: 0,
    leafCount: 0,
    treeShape: '–',
    scenarioDesc: SCENARIOS[0].desc,
    p50: '–',
    p95: '–',
    p99: '–',
    samples: 0,
    longTasks: 0,
    status: 'idle',
    running: false,
    results: [],
  };

  #depth = DEFAULT_DEPTH;
  #branch = DEFAULT_BRANCH;
  #useShadow = false;
  #scenario = SCENARIOS[0].id;
  #busy = false;
  #longTaskCount = 0;
  #longTaskObserver = null;
  #initialized = false;

  connectedCallback() {
    super.connectedCallback();
    if (this.#initialized) return;
    this.#initialized = true;

    this.#buildControls();
    this.#observeLongTasks();
    this.#rebuildTree();
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    this.#longTaskObserver?.disconnect();
  }

  // --- setup ---------------------------------------------------------------

  #buildControls() {
    const depthSelect = this.querySelector('#depth-select');
    const branchSelect = this.querySelector('#branch-select');
    const shadowToggle = this.querySelector('#shadow-toggle');

    for (const d of DEPTHS) depthSelect.add(new Option(String(d), String(d), false, d === this.#depth));
    for (const b of BRANCHES) branchSelect.add(new Option(String(b), String(b), false, b === this.#branch));

    depthSelect.addEventListener('change', () => {
      this.#depth = Number(depthSelect.value);
      this.#updateShapeHint();
    });
    branchSelect.addEventListener('change', () => {
      this.#branch = Number(branchSelect.value);
      this.#updateShapeHint();
    });
    shadowToggle.addEventListener('change', () => { this.#useShadow = shadowToggle.checked; });
    this.#updateShapeHint();

    const buttonHost = this.querySelector('#scenario-buttons');
    for (const scenario of SCENARIOS) {
      const btn = document.createElement('button');
      btn.className = 'btn scenario-btn';
      btn.dataset.id = scenario.id;
      btn.textContent = scenario.label;
      if (scenario.id === this.#scenario) btn.setAttribute('active', '');
      btn.addEventListener('click', () => this.#selectScenario(scenario.id));
      buttonHost.appendChild(btn);
    }

    this.querySelector('#rebuild-btn').addEventListener('click', () => this.#guard(() => this.#rebuildTree()));
    this.querySelector('#run-btn').addEventListener('click', () => this.#guard(() => this.#run(this.#scenario)));
    this.querySelector('#run-all-btn').addEventListener('click', () => this.#guard(() => this.#runAll()));
    this.querySelector('#clear-btn').addEventListener('click', () => this.source.update({ results: [] }));
  }

  #observeLongTasks() {
    if (typeof PerformanceObserver === 'undefined') return;
    try {
      this.#longTaskObserver = new PerformanceObserver((list) => {
        this.#longTaskCount += list.getEntries().length;
      });
      this.#longTaskObserver.observe({ entryTypes: ['longtask'] });
    } catch {
      // Long-task timing is not supported everywhere; the rest still works.
      this.#longTaskObserver = null;
    }
  }

  #selectScenario(id) {
    if (this.#busy) return;
    this.#scenario = id;
    this.querySelectorAll('.scenario-btn')
      .forEach((btn) => btn.toggleAttribute('active', btn.dataset.id === id));
    this.source.update({ scenarioDesc: SCENARIOS.find((s) => s.id === id)?.desc ?? '' });
  }

  async #guard(work) {
    if (this.#busy) return;
    this.#busy = true;
    this.#setButtonsDisabled(true);
    try {
      await work();
    } catch (error) {
      this.#log('error', String(error?.message ?? error), '—');
      throw error;
    } finally {
      this.#busy = false;
      this.#setButtonsDisabled(false);
      await this.source.update({ running: false, status: 'idle' });
    }
  }

  #setButtonsDisabled(disabled) {
    this.querySelectorAll('button').forEach((btn) => { btn.disabled = disabled; });
  }

  // --- tree ----------------------------------------------------------------

  /** Replaces the tree. Returns the synchronous mount time in ms. */
  #rebuildTree({ shadowAt = null } = {}) {
    const host = this.querySelector('#tree-host');
    host.replaceChildren();
    clearRegistry();

    const root = document.createElement('perf-node');
    root.setAttribute('depth', '0');
    root.setAttribute('path', 'root');
    root.setAttribute('max-depth', String(this.#depth));
    root.setAttribute('branch', String(this.#branch));
    if (this.#useShadow) root.setAttribute('use-shadow', '');
    if (shadowAt !== null) root.setAttribute('shadow-at', String(shadowAt));

    // Custom elements upgrade synchronously on append, so the whole subtree mounts
    // inside this call and the elapsed time is the tree's construction cost.
    const started = performance.now();
    host.appendChild(root);
    const elapsed = performance.now() - started;

    this.#syncTreeFacts();
    return elapsed;
  }

  #syncTreeFacts() {
    return this.source.update({
      sourceCount: totalNodes(),
      leafCount: nodesAtDepth(this.#depth).length,
      treeShape: `d${this.#depth} × b${this.#branch}${this.#useShadow ? ' · shadow' : ''}`,
      // Re-push the root-owned key. flowWatch hands a new subscriber the current value
      // immediately, so rebuilt leaves are correct on mount, but template bindings are
      // push-only — without this, a freshly mounted node keeps its placeholder until the
      // next update. The asymmetry is worth seeing; a stale-looking tree is not.
      broadcast: flowGet(this, 'broadcast') ?? 0,
    });
  }

  /** Nodes a given shape will mount, so the cost is visible before building it. */
  #projectedNodes(depth = this.#depth, branch = this.#branch) {
    let total = 1;
    for (let level = 1; level <= depth; level++) total += branch ** level;
    return total;
  }

  #updateShapeHint() {
    const hint = this.querySelector('#shape-hint');
    if (hint) hint.textContent = `${this.#projectedNodes()} sources`;
  }

  #log(scenario, detail, value) {
    const results = flowGet(this, 'results') ?? [];
    return this.source.update({
      results: [...results, { scenario, detail, value }].slice(-60),
    });
  }

  #report(samples) {
    return this.source.update({
      p50: fmt(percentile(samples, 50)),
      p95: fmt(percentile(samples, 95)),
      p99: fmt(percentile(samples, 99)),
      samples: samples.length,
      longTasks: this.#longTaskCount,
    });
  }

  // --- runner --------------------------------------------------------------

  async #runAll() {
    for (const scenario of SCENARIOS) {
      this.#selectScenario(scenario.id);
      await this.#run(scenario.id);
      await nextTick();
    }
  }

  async #run(id) {
    const scenario = SCENARIOS.find((s) => s.id === id);
    this.#longTaskCount = 0;
    await this.source.update({ running: true, status: `running · ${scenario.label}` });
    await nextPaint();

    switch (id) {
      case 'mount': return this.#runMount();
      case 'resolveDepth': return this.#runResolveDepth();
      case 'fanout': return this.#runFanout();
      case 'leafLocal': return this.#runLeafLocal();
      case 'shadowedKey': return this.#runShadowedKey();
      case 'churn': return this.#runChurn();
      default: return undefined;
    }
  }

  async #runMount() {
    const mountMs = this.#rebuildTree();
    const nodes = totalNodes();
    await nextPaint();

    const host = this.querySelector('#tree-host');
    const teardownStarted = performance.now();
    host.replaceChildren();
    const teardownMs = performance.now() - teardownStarted;
    clearRegistry();

    await this.#log('Mount', `${nodes} nested sources`, fmt(mountMs));
    await this.#log('Mount', 'per source', fmt(mountMs / Math.max(1, nodes)));
    await this.#log('Unmount', `${nodes} sources destroyed`, fmt(teardownMs));

    // Leave a usable tree behind.
    this.#rebuildTree();
    await this.#report([mountMs, teardownMs]);
  }

  async #runResolveDepth() {
    const samples = await this.#measureResolution();
    await this.#report(samples.flatMap((row) => row.perCall));
  }

  /**
   * Times flowGet() for a root-owned key from each depth.
   *
   * Individual calls are far below the clock's resolution, so a batch of calls is
   * timed as a unit and divided — timing them one at a time would measure
   * performance.now() itself.
   */
  async #measureResolution({ label = 'Resolve' } = {}) {
    const rows = [];

    for (const depth of depths()) {
      const nodes = nodesAtDepth(depth);
      if (!nodes.length) continue;

      const perCall = [];
      for (let round = 0; round < RESOLVE_ROUNDS; round++) {
        const node = nodes[round % nodes.length];
        const started = performance.now();
        for (let i = 0; i < RESOLVE_BATCH; i++) flowGet(node, 'broadcast');
        perCall.push((performance.now() - started) / RESOLVE_BATCH);
      }

      const median = percentile(perCall, 50);
      rows.push({ depth, perCall, median });
      await this.#log(label, `depth ${depth} · ${nodes.length} nodes · median of ${RESOLVE_ROUNDS}`, fmt(median));
    }

    if (rows.length > 1) {
      const first = rows[0].median;
      const last = rows[rows.length - 1].median;
      const ratio = first > 0 ? (last / first).toFixed(2) : '–';
      await this.#log(label, `d${rows[0].depth} → d${rows[rows.length - 1].depth} slowdown`, `${ratio}×`);
    }

    return rows;
  }

  async #runFanout() {
    const flushSamples = [];
    const paintSamples = [];

    for (let i = 0; i < FANOUT_ROUNDS; i++) {
      const started = performance.now();
      await this.source.update({ broadcast: i });
      flushSamples.push(performance.now() - started);

      const paintStarted = performance.now();
      await this.source.update({ broadcast: i });
      await nextPaint();
      paintSamples.push(performance.now() - paintStarted);
    }

    const leaves = nodesAtDepth(this.#depth).length;
    await this.#log('Fan-out', `enqueue → flush · ${leaves} watchers · p50`, fmt(percentile(flushSamples, 50)));
    await this.#log('Fan-out', 'enqueue → flush · p95', fmt(percentile(flushSamples, 95)));
    await this.#log('Fan-out', 'enqueue → paint · p50', fmt(percentile(paintSamples, 50)));
    await this.#report(flushSamples);
  }

  async #runLeafLocal() {
    const leaves = nodesAtDepth(this.#depth);
    if (!leaves.length) {
      await this.#log('Leaf-local', 'no leaves in tree', '—');
      return;
    }

    const started = performance.now();
    // Fired in one tick: each leaf's source schedules its own flush.
    await Promise.all(leaves.map((leaf, i) => leaf.bump(i + 1)));
    const totalMs = performance.now() - started;

    const perLeaf = [];
    for (let i = 0; i < Math.min(30, leaves.length); i++) {
      const leafStarted = performance.now();
      await leaves[i].bump(i + 100);
      perLeaf.push(performance.now() - leafStarted);
    }

    await this.#log('Leaf-local', `${leaves.length} sources updated in one tick`, fmt(totalMs));
    await this.#log('Leaf-local', 'per source, one at a time · p50', fmt(percentile(perLeaf, 50)));
    await this.#report(perLeaf);
  }

  async #runShadowedKey() {
    const shadowDepth = Math.max(1, Math.floor(this.#depth / 2));

    this.#rebuildTree();
    await nextPaint();
    const plain = await this.#measureResolution({ label: 'Resolve · to root' });

    this.#rebuildTree({ shadowAt: shadowDepth });
    await nextPaint();
    const shadowed = await this.#measureResolution({ label: `Resolve · owned at d${shadowDepth}` });

    const deepest = (rows) => rows[rows.length - 1]?.median ?? 0;
    const before = deepest(plain);
    const after = deepest(shadowed);
    const delta = before > 0 ? `${((1 - after / before) * 100).toFixed(0)}% faster` : '–';
    await this.#log('Key shadowing', `deepest leaf, owner at d${shadowDepth} vs root`, delta);

    this.#rebuildTree();
    await this.#report(shadowed.flatMap((row) => row.perCall));
  }

  async #runChurn() {
    // A hidden host, so the number is source create/destroy rather than layout.
    const host = this.querySelector('#churn-host');
    const samples = [];

    for (let round = 0; round < CHURN_ROUNDS; round++) {
      const subtree = document.createElement('perf-node');
      subtree.setAttribute('depth', '0');
      subtree.setAttribute('path', `churn-${round}`);
      subtree.setAttribute('max-depth', String(Math.min(3, this.#depth)));
      subtree.setAttribute('branch', String(this.#branch));
      if (this.#useShadow) subtree.setAttribute('use-shadow', '');

      const started = performance.now();
      host.appendChild(subtree);
      subtree.remove();
      samples.push(performance.now() - started);
    }

    // The churn subtrees deregister on disconnect; restore the counts for the real tree.
    await this.#syncTreeFacts();
    await this.#log('Churn', `mount + unmount × ${CHURN_ROUNDS} · p50`, fmt(percentile(samples, 50)));
    await this.#log('Churn', 'p95', fmt(percentile(samples, 95)));
    await this.#report(samples);
  }
}

customElements.define('perf-lab', PerfLab);
