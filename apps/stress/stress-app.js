import { FlowState as Flow } from '../../lib/FlowState.js';

const CSS = String.raw;
const HTML = String.raw;

const BINDING_COUNT = 200;
const CELL_COUNT = 100;
const BATCH_SIZE = 100;
const FLOOD_RATE = 10; // updates per setInterval(0) tick
const LIST_SIZE = 1000;   // items in the realistic list scenario
const INTERACTION_RATE = 100; // ms between simulated user interactions

const SCENARIOS = [
  {
    id: 'singleKey',
    label: `Single Key · ${BINDING_COUNT} Bindings`,
    desc: `One state key (tick) updated each frame. ${BINDING_COUNT} DOM elements all bound to it. Tests update fan-out.`,
  },
  {
    id: 'wideUpdate',
    label: `Wide Update · ${CELL_COUNT} Keys`,
    desc: `${CELL_COUNT} keys (c0–c${CELL_COUNT - 1}) updated simultaneously per frame in one .update() call. Tests clone + freeze overhead on a wide state object.`,
  },
  {
    id: 'batched',
    label: `Batched · ${BATCH_SIZE}× per Frame`,
    desc: `${BATCH_SIZE} .update() calls per rAF, collapsed into a single flush via queueMicrotask. Tests batching throughput.`,
  },
  {
    id: 'flood',
    label: `Async Flood · setInterval`,
    desc: `${FLOOD_RATE} .update() calls fired per setInterval(0) tick, independent of rAF (~250Hz). Tests whether microtask flushes keep up when updates arrive faster than frames render. Watch Calls/Frame to see batching in action.`,
  },
  {
    id: 'listUpdate',
    label: `List · ${LIST_SIZE} Items`,
    desc: `${LIST_SIZE} items, each with 4 keys (name, value, status, ts). One random item's fields are updated per frame — the closest to a real data table or feed list.`,
  },
  {
    id: 'nestedState',
    label: `Nested State`,
    desc: `State shaped like a real app: { user: {…}, settings: {…}, ui: {…} }. Each frame updates one nested key. Tests that deep clone + freeze handles nested objects efficiently.`,
  },
  {
    id: 'mixedInteraction',
    label: `Mixed Interaction`,
    desc: `Simulates human-paced UI events: a random single key is updated every ${INTERACTION_RATE}ms (~10/s) via setInterval, while rAF renders normally. The realistic baseline — one interaction, a few bindings, no tight loops.`,
  },
];

// Build initial flat cell keys: { c0: 0, c1: 0, ... c99: 0 }
const initialCells = Object.fromEntries(
  Array.from({ length: CELL_COUNT }, (_, i) => [`c${i}`, 0])
);

// Initial list items: item0…item29, each with 4 sub-keys
const initialList = Object.fromEntries(
  Array.from({ length: LIST_SIZE }, (_, i) => [
    `item${i}`,
    { name: `Item ${i}`, value: 0, status: 'idle', ts: 0 }
  ])
);

// Nested app-like state
const initialNested = {
  user:     { name: 'Alice', score: 0, level: 1 },
  settings: { theme: 'dark', volume: 50 },
  ui:       { loading: false, page: 0 },
};

// Pre-build cell grid HTML strings (avoid rebuilding on each render)
const tickGridHTML = Array.from({ length: BINDING_COUNT }, () =>
  `<span class="cell" flow-watch-tick-to-prop="textContent"></span>`
).join('');

const wideGridHTML = Array.from({ length: CELL_COUNT }, (_, i) =>
  `<span class="cell" flow-watch-c${i}-to-prop="textContent"></span>`
).join('');

const listGridHTML = Array.from({ length: LIST_SIZE }, (_, i) =>
  `<span class="cell" flow-watch-item${i}-value-to-prop="textContent"></span>`
).join('');

const nestedGridHTML = [
  `<span class="cell" flow-watch-user-score-to-prop="textContent"></span>`,
  `<span class="cell" flow-watch-user-level-to-prop="textContent"></span>`,
  `<span class="cell" flow-watch-settings-volume-to-prop="textContent"></span>`,
  `<span class="cell" flow-watch-ui-page-to-prop="textContent"></span>`,
].join('');

const styles = CSS`
  :host {
    display: block;
    font-family: system-ui, sans-serif;
    background: #0f172a;
    color: #e2e8f0;
    min-height: 100vh;
    padding: 28px 32px;
    box-sizing: border-box;
  }

  h1 {
    font-size: 1.4rem;
    font-weight: 700;
    color: #f8fafc;
    margin: 0 0 2px;
    letter-spacing: -0.4px;
  }

  .subtitle {
    font-size: 13px;
    color: #64748b;
    margin: 0 0 24px;
  }

  #controls {
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
    align-items: center;
    margin-bottom: 10px;
  }

  .scenario-btn {
    padding: 7px 14px;
    border: 1px solid #334155;
    border-radius: 8px;
    background: #1e293b;
    color: #94a3b8;
    font-size: 13px;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.15s;
  }

  .scenario-btn:hover {
    border-color: #6366f1;
    color: #c7d2fe;
  }

  .scenario-btn[active] {
    background: #312e81;
    border-color: #6366f1;
    color: #c7d2fe;
  }

  #start-btn {
    padding: 8px 22px;
    background: #16a34a;
    color: white;
    border: none;
    border-radius: 8px;
    font-size: 14px;
    font-weight: 600;
    cursor: pointer;
    margin-left: auto;
    transition: background 0.15s;
    letter-spacing: 0.01em;
  }

  #start-btn[running] {
    background: #dc2626;
  }

  #desc {
    font-size: 13px;
    color: #64748b;
    margin: 0 0 24px;
    min-height: 18px;
  }

  #metrics {
    display: flex;
    gap: 12px;
    margin-bottom: 28px;
    flex-wrap: wrap;
  }

  .metric {
    background: #1e293b;
    border: 1px solid #334155;
    border-radius: 10px;
    padding: 14px 20px;
    min-width: 130px;
  }

  .metric .label {
    display: block;
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: #64748b;
    margin-bottom: 6px;
  }

  .metric .value {
    display: block;
    font-size: 1.8rem;
    font-weight: 700;
    font-variant-numeric: tabular-nums;
    color: #7dd3fc;
    line-height: 1;
  }

  .metric .unit {
    font-size: 12px;
    font-weight: 400;
    color: #64748b;
  }

  .grids {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 16px;
  }

  .grid-section {
    background: #1e293b;
    border: 1px solid #334155;
    border-radius: 10px;
    padding: 16px;
  }

  .grid-section h2 {
    font-size: 11px;
    color: #94a3b8;
    margin: 0 0 12px;
    font-weight: 500;
    text-transform: uppercase;
    letter-spacing: 0.06em;
  }

  .grid-section code {
    color: #818cf8;
    background: rgba(99, 102, 241, 0.12);
    padding: 1px 5px;
    border-radius: 4px;
    font-size: 11px;
  }

  .cells {
    display: flex;
    flex-wrap: wrap;
    gap: 3px;
  }

  .cell {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 36px;
    height: 22px;
    background: #0f172a;
    border: 1px solid #1e293b;
    border-radius: 4px;
    font-size: 9px;
    font-variant-numeric: tabular-nums;
    color: #475569;
    overflow: hidden;
  }
`;

const sheet = new CSSStyleSheet();
sheet.replaceSync(styles);

const template = document.createElement('template');
template.innerHTML = HTML`
  <h1>FlowState — Stress Test</h1>
  <p class="subtitle">Measures real-world update throughput and DOM binding overhead.</p>

  <div id="controls">
    ${SCENARIOS.map(s => `<button class="scenario-btn" data-id="${s.id}">${s.label}</button>`).join('')}
    <button id="start-btn">▶ Start</button>
  </div>

  <p id="desc"></p>

  <div id="metrics">
    <div class="metric">
      <span class="label">Frames / sec</span>
      <span class="value" flow-watch-metrics-fps-to-prop="textContent">—</span>
    </div>
    <div class="metric">
      <span class="label">Avg update()</span>
      <span class="value">
        <span flow-watch-metrics-callus-to-prop="textContent">—</span>
        <span class="unit"> µs</span>
      </span>
    </div>
    <div class="metric">
      <span class="label">Total calls</span>
      <span class="value" flow-watch-metrics-total-to-prop="textContent">0</span>
    </div>
    <div class="metric">
      <span class="label">Calls / Frame</span>
      <span class="value" flow-watch-metrics-cpf-to-prop="textContent">—</span>
    </div>
    <div class="metric">
      <span class="label">Tick</span>
      <span class="value" flow-watch-tick-to-prop="textContent">0</span>
    </div>
  </div>

  <div class="grids">
    <div class="grid-section">
      <h2>${BINDING_COUNT} elements → <code>tick</code></h2>
      <div class="cells">${tickGridHTML}</div>
    </div>
    <div class="grid-section">
      <h2>${CELL_COUNT} elements → <code>c0…c${CELL_COUNT - 1}</code></h2>
      <div class="cells">${wideGridHTML}</div>
    </div>
    <div class="grid-section">
      <h2>${LIST_SIZE} items → <code>item0…item${LIST_SIZE - 1}.value</code></h2>
      <div class="cells">${listGridHTML}</div>
    </div>
    <div class="grid-section">
      <h2>Nested bindings</h2>
      <div class="cells">${nestedGridHTML}</div>
    </div>
  </div>
`;


class StressApp extends HTMLElement {
  #state;
  #shadow;
  #frameId = null;
  #intervalId = null;
  #metricsTimer = null;
  #scenario = SCENARIOS[0].id;
  #callsThisFrame = 0;

  // Perf tracking
  #frameCount = 0;
  #callTimes = []; // rolling window of µs per update() call
  #totalCalls = 0;
  #callsSinceMetrics = 0;
  #lastMetricsTime = 0;

  constructor() {
    super();
    this.#shadow = this.attachShadow({ mode: 'open' });
    this.#shadow.adoptedStyleSheets = [sheet];
    this.#shadow.appendChild(template.content.cloneNode(true));

    this.#state = Flow.create(this, {
      tick: 0,
      ...initialCells,
      ...initialList,
      ...initialNested,
      metrics: {
        fps: 0,
        callus: 0,
        total: 0,
        cpf: 0,
      },
    });

    this.#state.through(this.#shadow);
    this.#setupControls();
  }

  #setupControls() {
    const descEl = this.#shadow.getElementById('desc');
    const startBtn = this.#shadow.getElementById('start-btn');

    // Set initial description
    descEl.textContent = SCENARIOS[0].desc;

    // Scenario selection
    this.#shadow.querySelectorAll('.scenario-btn').forEach((btn, i) => {
      if (i === 0) btn.setAttribute('active', '');
      btn.addEventListener('click', () => {
        if (this.#frameId !== null) return; // don't switch while running
        this.#scenario = btn.dataset.id;
        this.#shadow.querySelectorAll('.scenario-btn')
          .forEach(b => b.toggleAttribute('active', b === btn));
        descEl.textContent = SCENARIOS.find(s => s.id === this.#scenario)?.desc ?? '';
      });
    });

    startBtn.addEventListener('click', () => {
      this.#frameId !== null ? this.#stop() : this.#start();
    });
  }

  #start() {
    this.#frameCount = 0;
    this.#callTimes = [];
    this.#totalCalls = 0;
    this.#lastMetricsTime = performance.now();

    const startBtn = this.#shadow.getElementById('start-btn');
    startBtn.textContent = '■ Stop';
    startBtn.setAttribute('running', '');

    // Reset counters in state
    const resetCells = Object.fromEntries(Array.from({ length: CELL_COUNT }, (_, i) => [`c${i}`, 0]));
    const resetList  = Object.fromEntries(Array.from({ length: LIST_SIZE }, (_, i) => [`item${i}`, { name: `Item ${i}`, value: 0, status: 'idle', ts: 0 }]));
    this.#state.update({ tick: 0, ...resetCells, ...resetList, user: { score: 0, level: 1 }, settings: { volume: 50 }, ui: { page: 0 }, metrics: { fps: 0, callus: 0, total: 0, cpf: 0 } });

    this.#metricsTimer = setInterval(() => this.#flushMetrics(), 500);

    if (this.#scenario === 'flood') {
      this.#intervalId = setInterval(() => {
        for (let i = 0; i < FLOOD_RATE; i++) {
          const us = this.#timeCall(() =>
            this.#state.update(prev => ({ tick: prev.tick + 1 }))
          );
          this.#callTimes.push(us);
          this.#totalCalls++;
          this.#callsSinceMetrics++;
        }
      }, 0);
    }

    if (this.#scenario === 'mixedInteraction') {
      const keys = ['tick', 'user', 'settings', 'ui'];
      this.#intervalId = setInterval(() => {
        const key = keys[Math.floor(Math.random() * keys.length)];
        let patch;
        if (key === 'tick')     patch = { tick: this.#totalCalls };
        if (key === 'user')     patch = { user: { score: this.#totalCalls } };
        if (key === 'settings') patch = { settings: { volume: (this.#totalCalls % 100) } };
        if (key === 'ui')       patch = { ui: { page: Math.floor(this.#totalCalls / 10) } };
        const us = this.#timeCall(() => this.#state.update(patch));
        this.#callTimes.push(us);
        this.#totalCalls++;
        this.#callsSinceMetrics++;
      }, INTERACTION_RATE);
    }

    this.#scheduleFrame();
  }

  #stop() {
    cancelAnimationFrame(this.#frameId);
    this.#frameId = null;
    if (this.#intervalId !== null) {
      clearInterval(this.#intervalId);
      this.#intervalId = null;
    }
    clearInterval(this.#metricsTimer);
    this.#metricsTimer = null;

    const startBtn = this.#shadow.getElementById('start-btn');
    startBtn.textContent = '▶ Start';
    startBtn.removeAttribute('running');

    this.#flushMetrics();
  }

  #scheduleFrame() {
    const intervalDriven = this.#scenario === 'flood' || this.#scenario === 'mixedInteraction';
    this.#frameId = requestAnimationFrame(() => {
      if (!intervalDriven) {
        this.#runScenario();
      }
      this.#frameCount++;
      this.#scheduleFrame();
    });
  }

  // Returns µs elapsed for fn()
  #timeCall(fn) {
    const t0 = performance.now();
    fn();
    return (performance.now() - t0) * 1000;
  }

  #runScenario() {
    switch (this.#scenario) {
      case 'singleKey': {
        const us = this.#timeCall(() =>
          this.#state.update(prev => ({ tick: prev.tick + 1 }))
        );
        this.#callTimes.push(us);
        this.#totalCalls++;
        this.#callsSinceMetrics++;
        break;
      }

      case 'wideUpdate': {
        const patch = Object.fromEntries(
          Array.from({ length: CELL_COUNT }, (_, i) => [`c${i}`, this.#totalCalls + i])
        );
        const us = this.#timeCall(() => this.#state.update(patch));
        this.#callTimes.push(us);
        this.#totalCalls++;
        this.#callsSinceMetrics++;
        break;
      }

      case 'batched': {
        let totalUs = 0;
        for (let i = 0; i < BATCH_SIZE; i++) {
          totalUs += this.#timeCall(() =>
            this.#state.update(prev => ({ tick: prev.tick + 1 }))
          );
          this.#totalCalls++;
          this.#callsSinceMetrics++;
        }
        this.#callTimes.push(totalUs / BATCH_SIZE); // avg per call this frame
        break;
      }

      case 'listUpdate': {
        const i = Math.floor(Math.random() * LIST_SIZE);
        const key = `item${i}`;
        const us = this.#timeCall(() =>
          this.#state.update(prev => ({
            [key]: { name: prev[key].name, value: prev[key].value + 1, status: 'updated', ts: this.#totalCalls }
          }))
        );
        this.#callTimes.push(us);
        this.#totalCalls++;
        this.#callsSinceMetrics++;
        break;
      }

      case 'nestedState': {
        // Cycle through updating one nested key per frame
        const cycle = this.#totalCalls % 3;
        let patch;
        if (cycle === 0) patch = { user: { score: this.#totalCalls } };
        if (cycle === 1) patch = { settings: { volume: this.#totalCalls % 100 } };
        if (cycle === 2) patch = { ui: { page: Math.floor(this.#totalCalls / 60) } };
        const us = this.#timeCall(() => this.#state.update(patch));
        this.#callTimes.push(us);
        this.#totalCalls++;
        this.#callsSinceMetrics++;
        break;
      }

      // interval-driven scenarios: rAF just counts frames
      case 'flood':
      case 'mixedInteraction': break;
    }

    // Keep rolling window to last 120 samples
    if (this.#callTimes.length > 120) {
      this.#callTimes.splice(0, this.#callTimes.length - 120);
    }
  }

  #flushMetrics() {
    const now = performance.now();
    const elapsed = (now - this.#lastMetricsTime) / 1000;
    this.#lastMetricsTime = now;

    const fps = elapsed > 0 ? Math.round(this.#frameCount / elapsed) : 0;
    const avgUs = this.#callTimes.length
      ? Math.round(this.#callTimes.reduce((a, b) => a + b, 0) / this.#callTimes.length)
      : 0;
    const cpf = this.#frameCount > 0 ? Math.round(this.#callsSinceMetrics / this.#frameCount) : 0;

    this.#frameCount = 0;
    this.#callsSinceMetrics = 0;

    this.#state.update({
      metrics: { fps, callus: avgUs, total: this.#totalCalls, cpf },
    });
  }
}

customElements.define('stress-app', StressApp);
