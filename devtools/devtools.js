const channel = new BroadcastChannel('flowstate-devtools');

const snapshots = new Map();       // id → snapshot
let selectedId = null;
let expandedInstances = new Set(); // which tree nodes are open
let expandedPaths = new Set();     // which value paths are open in the inspector


// ── Resize handle ─────────────────────────────────────────

const treePanel   = document.getElementById('tree-panel');
const resizeHandle = document.getElementById('resize-handle');
const MIN_WIDTH = 160;
const MAX_WIDTH = 600;

resizeHandle.addEventListener('mousedown', (e) => {
  e.preventDefault();
  resizeHandle.classList.add('dragging');
  document.body.style.cursor = 'col-resize';
  document.body.style.userSelect = 'none';

  const onMove = (ev) => {
    const main = document.getElementById('main');
    const mainRect = main.getBoundingClientRect();
    const newWidth = Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, ev.clientX - mainRect.left));
    treePanel.style.width = `${newWidth}px`;
    document.documentElement.style.setProperty('--tree-width', `${newWidth}px`);
  };

  const onUp = () => {
    resizeHandle.classList.remove('dragging');
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
    window.removeEventListener('mousemove', onMove);
    window.removeEventListener('mouseup', onUp);
  };

  window.addEventListener('mousemove', onMove);
  window.addEventListener('mouseup', onUp);
});


// ── Bootstrap ─────────────────────────────────────────────

// Tell the app we're ready to receive snapshots (handles case: app already running when devtools opens)
channel.postMessage({ type: 'ready' });

channel.addEventListener('message', (e) => {
  // App has (re)loaded — re-request all snapshots
  if (e.data?.type === 'init') {
    console.log('App initialized, requesting snapshots…');
    snapshots.clear();
    selectedId = null;
    expandedInstances.clear();
    expandedPaths.clear();
    setStatus('waiting');
    renderTree();
    renderDetail(null);
    channel.postMessage({ type: 'ready' });
    return;
  }

  const snap = e.data;
  if (!snap || snap.type !== 'snapshot') return;

  const isNew = !snapshots.has(snap.id);
  snapshots.set(snap.id, snap);

  // Auto-expand the first instance that arrives
  if (isNew && expandedInstances.size === 0) expandedInstances.add(snap.id);

  renderTree();
  if (selectedId === snap.id) renderDetail(snap);
  flashNode(snap.id);

  document.getElementById('instance-count').textContent = snapshots.size;
  setStatus('connected');
});


// ── Tree ─────────────────────────────────────────────────

function buildTree() {
  const children = new Map();
  const roots = [];

  for (const [id, snap] of snapshots) {
    if (!snap.parentId || !snapshots.has(snap.parentId)) {
      roots.push(id);
    } else {
      if (!children.has(snap.parentId)) children.set(snap.parentId, []);
      children.get(snap.parentId).push(id);
    }
  }

  return { roots, children };
}


function renderTree() {
  const container = document.getElementById('tree');

  if (snapshots.size === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">◎</div>
        <div>No instances detected</div>
        <code>FlowState.devtools()</code>
      </div>`;
    return;
  }

  const { roots, children } = buildTree();
  container.innerHTML = '';

  function renderNode(id, depth) {
    const snap = snapshots.get(id);
    const tagHtml = snap.label
      ? `${snap.label} &lt;${snap.rootTag}&gt;`
      : `&lt;${snap.rootTag}&gt;`;
    if (!snap) return;

    const nodeChildren = children.get(id) ?? [];
    const isExpanded = expandedInstances.has(id);
    const keyCount = snap.values ? Object.keys(snap.values).length : 0;

    const nodeEl = document.createElement('div');
    nodeEl.className = `tree-node${id === selectedId ? ' selected' : ''}`;
    nodeEl.dataset.id = id;

    const rowEl = document.createElement('div');
    rowEl.className = 'tree-row';
    rowEl.style.paddingLeft = `${depth * 18 + 10}px`;
    rowEl.innerHTML = `
      <span class="tree-toggle">${nodeChildren.length > 0 ? (isExpanded ? '▼' : '▶') : '·'}</span>
      <span class="tree-tag">${tagHtml}</span>
      <span class="tree-badges">
        <span class="badge keys">${keyCount}k</span>
        ${snap.watcherCount > 0  ? `<span class="badge watch">${snap.watcherCount}w</span>` : ''}
        ${snap.computedKeys.length > 0 ? `<span class="badge comp">${snap.computedKeys.length}c</span>` : ''}
      </span>
      <span class="tree-age" data-ts="${snap.timestamp}">${formatAge(snap.timestamp)}</span>
    `;

    rowEl.addEventListener('click', () => {
      if (nodeChildren.length > 0) {
        isExpanded ? expandedInstances.delete(id) : expandedInstances.add(id);
      }
      selectedId = id;
      renderTree();
      renderDetail(snap);
    });

    nodeEl.appendChild(rowEl);
    container.appendChild(nodeEl);

    if (isExpanded) {
      for (const childId of nodeChildren) renderNode(childId, depth + 1);
    }
  }

  for (const id of roots) renderNode(id, 0);
}


function flashNode(id) {
  requestAnimationFrame(() => {
    const el = document.querySelector(`.tree-node[data-id="${id}"]`);
    if (!el) return;
    el.classList.remove('flash');
    void el.offsetWidth; // force reflow to restart animation
    el.classList.add('flash');
  });
}


// ── Detail inspector ──────────────────────────────────────

function renderDetail(snap) {
  const panel = document.getElementById('detail');

  if (!snap) {
    panel.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">◈</div>
        <div>Select an instance to inspect</div>
      </div>`;
    return;
  }

  const tagHtml = snap.label
    ? `${snap.label} &lt;${snap.rootTag}&gt;`
    : `&lt;${snap.rootTag}&gt;`;

  panel.innerHTML = `
    <div class="detail-header">
      <span class="detail-tag">${tagHtml}</span>
      <span class="detail-id">${snap.id.slice(0, 8)}…</span>
    </div>
    <div class="detail-meta">
      ${snap.computedKeys.length > 0 ? `
        <div class="meta-row">
          <span class="meta-label">Computed</span>
          <span class="meta-val computed-list">${snap.computedKeys.join(', ')}</span>
        </div>` : ''}
      ${snap.watcherKeys.length > 0 ? `
        <div class="meta-row">
          <span class="meta-label">Watchers</span>
          <span class="meta-val">${snap.watcherKeys.join(', ')}</span>
        </div>` : ''}
      <div class="meta-row">
        <span class="meta-label">Flow-throughs</span>
        <span class="meta-val">${snap.flowThroughCount}</span>
      </div>
      <div class="meta-row">
        <span class="meta-label">Updated</span>
        <span class="meta-val">${new Date(snap.timestamp).toLocaleTimeString()}</span>
      </div>
    </div>
    <div class="section-label">State</div>
    <div id="detail-values"></div>
  `;

  const valuesEl = panel.querySelector('#detail-values');
  if (snap.values) {
    valuesEl.appendChild(renderValueTree(snap.values, [], snap));
  } else {
    valuesEl.innerHTML = '<span class="val-null">State not serializable</span>';
  }
}


function renderValueTree(obj, pathArr, snap) {
  const container = document.createElement('div');

  for (const [key, value] of Object.entries(obj)) {
    const currentPath = [...pathArr, key];
    const pathStr = currentPath.join('.');
    const isExpanded = expandedPaths.has(pathStr);
    const isComputed = pathArr.length === 0 && snap.computedKeys.includes(key);
    const isWatched  = snap.watcherKeys.includes(pathStr);
    const keyClass   = `value-key${isComputed ? ' computed' : ''}${isWatched ? ' watched' : ''}`;

    const row = document.createElement('div');
    row.className = 'value-row';

    if (Array.isArray(value)) {
      row.innerHTML = `
        <div class="value-key-row">
          <span class="value-toggle">${value.length > 0 ? (isExpanded ? '▼' : '▶') : '·'}</span>
          <span class="${keyClass}">${key}</span>
          <span class="value-type">Array(${value.length})</span>
        </div>
      `;
      if (value.length > 0) {
        row.querySelector('.value-key-row').addEventListener('click', () => {
          isExpanded ? expandedPaths.delete(pathStr) : expandedPaths.add(pathStr);
          renderDetail(snap);
        });
        if (isExpanded) {
          const listEl = document.createElement('div');
          listEl.style.marginLeft = '16px';
          const limit = Math.min(value.length, 50);
          for (let i = 0; i < limit; i++) {
            const itemVal = value[i];
            const itemPath = currentPath.concat(i);
            const itemPathStr = itemPath.join('.');
            const isItemExpanded = expandedPaths.has(itemPathStr);
            const item = document.createElement('div');
            item.className = 'value-row';

            if (itemVal !== null && typeof itemVal === 'object') {
              const isArr = Array.isArray(itemVal);
              const summary = isArr ? `Array(${itemVal.length})` : `{${Object.keys(itemVal).length}}`;
              item.innerHTML = `
                <div class="value-key-row">
                  <span class="value-toggle">${isItemExpanded ? '▼' : '▶'}</span>
                  <span class="arr-index">${i}</span>
                  <span class="value-type">${summary}</span>
                </div>
              `;
              item.querySelector('.value-key-row').addEventListener('click', () => {
                isItemExpanded ? expandedPaths.delete(itemPathStr) : expandedPaths.add(itemPathStr);
                renderDetail(snap);
              });
              if (isItemExpanded) {
                const nested = isArr
                  ? renderValueTree(Object.fromEntries(itemVal.map((v, j) => [j, v])), itemPath, snap)
                  : renderValueTree(itemVal, itemPath, snap);
                nested.style.marginLeft = '16px';
                item.appendChild(nested);
              }
            } else {
              item.innerHTML = `<span class="value-toggle"> </span><span class="arr-index">${i}</span> ${inlineValue(itemVal)}`;
            }

            listEl.appendChild(item);
          }
          if (value.length > limit) {
            const more = document.createElement('div');
            more.className = 'value-more';
            more.textContent = `… ${value.length - limit} more items`;
            listEl.appendChild(more);
          }
          row.appendChild(listEl);
        }
      }

    } else if (value !== null && typeof value === 'object') {
      const entryCount = Object.keys(value).length;
      row.innerHTML = `
        <div class="value-key-row">
          <span class="value-toggle">${isExpanded ? '▼' : '▶'}</span>
          <span class="${keyClass}">${key}</span>
          <span class="value-type">{${entryCount}}</span>
        </div>
      `;
      row.querySelector('.value-key-row').addEventListener('click', () => {
        isExpanded ? expandedPaths.delete(pathStr) : expandedPaths.add(pathStr);
        renderDetail(snap);
      });
      if (isExpanded) {
        const nested = renderValueTree(value, currentPath, snap);
        nested.style.marginLeft = '16px';
        row.appendChild(nested);
      }

    } else {
      row.innerHTML = `
        <span class="value-toggle"> </span>
        <span class="${keyClass}">${key}</span>
        ${inlineValue(value)}
      `;
    }

    container.appendChild(row);
  }

  return container;
}


function inlineValue(value) {
  if (value === null)      return `<span class="val-null">null</span>`;
  if (value === undefined) return `<span class="val-null">undefined</span>`;
  if (typeof value === 'boolean') return `<span class="val-bool">${value}</span>`;
  if (typeof value === 'number')  return `<span class="val-num">${value}</span>`;
  if (typeof value === 'string') {
    const s = value.length > 60 ? value.slice(0, 60) + '…' : value;
    return `<span class="val-str">"${s}"</span>`;
  }
  if (Array.isArray(value))      return `<span class="val-type">Array(${value.length})</span>`;
  if (typeof value === 'object') return `<span class="val-type">{${Object.keys(value).length} keys}</span>`;
  return `<span class="val-null">${String(value)}</span>`;
}


// ── Utilities ─────────────────────────────────────────────

function formatAge(ts) {
  const diff = Date.now() - ts;
  if (diff < 1000)  return 'now';
  if (diff < 60000) return `${Math.floor(diff / 1000)}s`;
  return `${Math.floor(diff / 60000)}m`;
}

function setStatus(s) {
  const el = document.getElementById('status');
  el.textContent = s === 'connected' ? '● Connected' : '○ Waiting for app…';
  el.className = s;
}

// Refresh timestamps every second
setInterval(() => {
  document.querySelectorAll('.tree-age[data-ts]').forEach(el => {
    el.textContent = formatAge(parseInt(el.dataset.ts, 10));
  });
}, 1000);


// ── Initial render ────────────────────────────────────────
renderTree();
renderDetail(null);
