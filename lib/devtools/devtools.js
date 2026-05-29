import { FlowSource, flowGet, flowWatch } from '../FlowState.js';

const CHANNEL_NAME = 'flowstate-devtools';
const STORAGE_THEME_KEY = 'flowstate-devtools-theme';
const SVG_NS = 'http://www.w3.org/2000/svg';
const MIN_WIDTH = 160;
const MAX_WIDTH = 600;
const MIN_SECTION_HEIGHT = 140;

/**
 * FlowState-first devtools scaffold.
 *
 * This file is intentionally separate from `devtools.js` so the legacy tool
 * remains unchanged while we migrate behavior panel-by-panel.
 */
export function startFlowStateDevtools() {
  const appRoot = document.getElementById('app');
  if (!appRoot) {
    throw new Error('FlowState Devtools bootstrap failed: #app not found.');
  }

  const treePanel = document.getElementById('tree-panel');
  const resizeHandle = document.getElementById('resize-handle');
  const sourcesSection = document.getElementById('sources-section');
  const inspectorSection = document.getElementById('inspector-section');
  const sidebarSplitHandle = document.getElementById('sidebar-split-handle');
  const graphPanel = document.getElementById('graph-panel');
  const themeToggle = document.getElementById('theme-toggle');

  const channel = new BroadcastChannel(CHANNEL_NAME);
  const uiController = new AbortController();
  const { signal } = uiController;
  const watcherUnsubs = [];
  const destroyFns = [];

  const watch = (key, callback) => {
    const unsub = flowWatch(appRoot, key, callback);
    if (typeof unsub === 'function') watcherUnsubs.push(unsub);
    return unsub;
  };
  const state = new FlowSource(appRoot, {
    snapshots: [],
    selectedId: null,
    expandedSources: [],
    expandedPaths: [],
    treeWidth: 320,
    sidebarTopHeight: null,
    status: 'waiting',
    theme: 'dark',
  });

  const toTheme = (theme) => (theme === 'light' ? 'light' : 'dark');

  const getSnapshots = () => flowGet(appRoot, 'snapshots') || [];
  const getSelectedId = () => flowGet(appRoot, 'selectedId');
  const setSelectedId = (id) => state.update({ selectedId: id });
  const getExpandedSourcesSet = () => new Set(flowGet(appRoot, 'expandedSources') || []);
  const setExpandedSourcesSet = (setVal) => state.update({ expandedSources: Array.from(setVal) });
  const getExpandedPathsSet = () => new Set(flowGet(appRoot, 'expandedPaths') || []);
  const setExpandedPathsSet = (setVal) => state.update({ expandedPaths: Array.from(setVal) });

  function setTheme(theme) {
    const next = toTheme(theme);
    document.documentElement.setAttribute('data-theme', next);

    if (themeToggle) {
      themeToggle.textContent = next === 'dark' ? 'Light' : 'Dark';
      themeToggle.setAttribute('aria-label', `Switch to ${next === 'dark' ? 'light' : 'dark'} mode`);
    }
  }

  function setStatus(status) {
    const el = document.getElementById('status');
    if (!el) return;

    const connected = status === 'connected';
    el.textContent = connected ? '● Connected' : '○ Waiting for app…';
    el.className = connected ? 'connected' : 'waiting';
  }

  function getSnapshotsMap() {
    const snapshots = getSnapshots();
    return new Map(snapshots.map((snap) => [snap.id, snap]));
  }

  function writeSnapshotsMap(map) {
    state.update({ snapshots: Array.from(map.values()) });
  }

  function updateSourceCount() {
    const snapshots = getSnapshots();
    const countEl = document.getElementById('source-count');
    if (countEl) countEl.textContent = String(snapshots.length);
  }

  function buildTree() {
    const snapshots = getSnapshotsMap();
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
    if (!container) return;

    const snapshots = getSnapshotsMap();
    const selectedId = getSelectedId();
    const expandedSources = getExpandedSourcesSet();

    if (snapshots.size === 0) {
      container.innerHTML = `
        <div class="empty-state">
          <div class="empty-icon">◎</div>
          <div>No sources detected</div>
          <code>flowDevtools()</code>
        </div>`;
      return;
    }

    const { roots, children } = buildTree();
    container.innerHTML = '';

    function renderNode(id, depth) {
      const snap = snapshots.get(id);
      if (!snap) return;

      const tagHtml = snap.label
        ? `${snap.label} &lt;${snap.rootTag}&gt;`
        : `&lt;${snap.rootTag}&gt;`;
      const nodeChildren = children.get(id) ?? [];
      const isExpanded = expandedSources.has(id);
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
          ${snap.watcherCount > 0 ? `<span class="badge watch">${snap.watcherCount}w</span>` : ''}
          ${snap.computedKeys.length > 0 ? `<span class="badge comp">${snap.computedKeys.length}c</span>` : ''}
        </span>
        <span class="tree-age" data-ts="${snap.timestamp}">${formatAge(snap.timestamp)}</span>
      `;

      const toggleEl = rowEl.querySelector('.tree-toggle');
      if (toggleEl && nodeChildren.length > 0) {
        toggleEl.style.cursor = 'pointer';
        toggleEl.addEventListener('click', (e) => {
          e.stopPropagation();
          isExpanded ? expandedSources.delete(id) : expandedSources.add(id);
          setExpandedSourcesSet(expandedSources);
        });
      }

      rowEl.addEventListener('click', () => {
        setSelectedId(id);
      });

      rowEl.addEventListener('mouseenter', () => {
        channel.postMessage({ type: 'highlight', id });
      });

      rowEl.addEventListener('mouseleave', () => {
        channel.postMessage({ type: 'clear-highlight', id });
      });

      nodeEl.appendChild(rowEl);
      container.appendChild(nodeEl);

      if (isExpanded) {
        for (const childId of nodeChildren) renderNode(childId, depth + 1);
      }
    }

    for (const id of roots) renderNode(id, 0);
  }

  function computeGraphLayout(roots, children) {
    const positions = new Map();
    let nextColumn = 0;

    function walk(id, depth) {
      const childIds = children.get(id) ?? [];
      if (childIds.length === 0) {
        const col = nextColumn;
        nextColumn += 1;
        positions.set(id, { col, depth });
        return col;
      }

      const cols = childIds.map((childId) => walk(childId, depth + 1));
      const col = (cols[0] + cols[cols.length - 1]) / 2;
      positions.set(id, { col, depth });
      return col;
    }

    roots.forEach((rootId, idx) => {
      walk(rootId, 0);
      if (idx < roots.length - 1) nextColumn += 1.25;
    });

    return positions;
  }

  function renderGraph() {
    const svg = document.getElementById('graph-svg');
    const graphEmpty = document.getElementById('graph-empty');
    if (!svg || !graphEmpty || !graphPanel) return;

    const snapshots = getSnapshotsMap();
    const selectedId = getSelectedId();
    const width = Math.max(10, graphPanel.clientWidth);
    const height = Math.max(10, graphPanel.clientHeight);

    svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
    svg.innerHTML = '';

    if (snapshots.size === 0) {
      graphEmpty.style.display = 'flex';
      return;
    }
    graphEmpty.style.display = 'none';

    const { roots, children } = buildTree();
    const positions = computeGraphLayout(roots, children);

    const NODE_W = 146;
    const NODE_H = 36;
    const H_GAP = 44;
    const V_GAP = 56;

    const points = new Map();
    for (const [id, { col, depth }] of positions) {
      const x = col * (NODE_W + H_GAP);
      const y = depth * (NODE_H + V_GAP);
      points.set(id, { x, y });
    }

    const bounds = Array.from(points.values()).reduce((acc, p) => {
      const left = p.x - NODE_W / 2;
      const right = p.x + NODE_W / 2;
      const top = p.y - NODE_H / 2;
      const bottom = p.y + NODE_H / 2;
      return {
        minX: Math.min(acc.minX, left),
        maxX: Math.max(acc.maxX, right),
        minY: Math.min(acc.minY, top),
        maxY: Math.max(acc.maxY, bottom),
      };
    }, { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity });

    const graphCenterX = (bounds.minX + bounds.maxX) / 2;
    const offsetX = width / 2 - graphCenterX;
    const offsetY = 20 - bounds.minY;

    const edgesLayer = document.createElementNS(SVG_NS, 'g');
    const nodesLayer = document.createElementNS(SVG_NS, 'g');

    for (const [parentId, childIds] of children.entries()) {
      const from = points.get(parentId);
      if (!from) continue;
      childIds.forEach((childId) => {
        const to = points.get(childId);
        if (!to) return;

        const x1 = from.x + offsetX;
        const y1 = from.y + offsetY + NODE_H / 2;
        const x2 = to.x + offsetX;
        const y2 = to.y + offsetY - NODE_H / 2;
        const cy = y1 + (y2 - y1) * 0.55;

        const path = document.createElementNS(SVG_NS, 'path');
        path.setAttribute('d', `M ${x1} ${y1} C ${x1} ${cy}, ${x2} ${cy}, ${x2} ${y2}`);
        path.setAttribute('fill', 'none');
        path.setAttribute('stroke', 'var(--graph-edge-stroke)');
        path.setAttribute('stroke-width', '1.2');
        edgesLayer.appendChild(path);
      });
    }

    const entries = Array.from(points.entries());
    entries.sort((a, b) => a[1].y - b[1].y);
    entries.forEach(([id, p]) => {
      const snap = snapshots.get(id);
      if (!snap) return;

      const g = document.createElementNS(SVG_NS, 'g');
      g.classList.add('graph-node');
      if (id === selectedId) g.classList.add('selected');
      g.dataset.id = id;

      const x = p.x + offsetX - NODE_W / 2;
      const y = p.y + offsetY - NODE_H / 2;

      const rect = document.createElementNS(SVG_NS, 'rect');
      rect.setAttribute('x', `${x}`);
      rect.setAttribute('y', `${y}`);
      rect.setAttribute('width', `${NODE_W}`);
      rect.setAttribute('height', `${NODE_H}`);
      rect.setAttribute('rx', '6');
      rect.setAttribute('fill', 'var(--graph-node-fill)');
      rect.setAttribute('stroke', 'var(--graph-node-stroke)');
      rect.setAttribute('stroke-width', '1');
      g.appendChild(rect);

      const label = document.createElementNS(SVG_NS, 'text');
      label.setAttribute('x', `${x + 8}`);
      label.setAttribute('y', `${y + 14}`);
      label.setAttribute('fill', 'var(--graph-label)');
      label.setAttribute('font-size', '11');
      label.setAttribute('font-weight', '600');
      const tag = snap.label ? `${snap.label}` : `${snap.rootTag}`;
      label.textContent = tag.length > 18 ? `${tag.slice(0, 17)}…` : tag;
      g.appendChild(label);

      const stats = document.createElementNS(SVG_NS, 'text');
      stats.setAttribute('x', `${x + 8}`);
      stats.setAttribute('y', `${y + 28}`);
      stats.setAttribute('fill', 'var(--graph-stats)');
      stats.setAttribute('font-size', '9');
      const keyCount = snap.values ? Object.keys(snap.values).length : 0;
      stats.textContent = `${keyCount}k  ${snap.watcherCount || 0}w  ${snap.computedKeys.length || 0}c`;
      g.appendChild(stats);

      g.addEventListener('click', () => {
        const patch = { selectedId: id };
        const nodeChildren = children.get(id) ?? [];
        if (nodeChildren.length > 0) {
          const expandedSources = getExpandedSourcesSet();
          expandedSources.add(id);
          patch.expandedSources = Array.from(expandedSources);
        }
        state.update(patch);
      });

      g.addEventListener('mouseenter', () => {
        channel.postMessage({ type: 'highlight', id });
      });

      g.addEventListener('mouseleave', () => {
        channel.postMessage({ type: 'clear-highlight', id });
      });

      nodesLayer.appendChild(g);
    });

    svg.appendChild(edgesLayer);
    svg.appendChild(nodesLayer);
  }

  function renderDetail(snap) {
    const panel = document.getElementById('detail');
    if (!panel) return;

    if (!snap) {
      panel.innerHTML = `
        <div class="empty-state">
          <div class="empty-icon">◈</div>
          <div>Select a source to inspect</div>
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
      <br />
      <div class="section-label">Watchers</div>
      <div id="detail-watchers"></div>
    `;

    const valuesEl = panel.querySelector('#detail-values');
    if (snap.values && valuesEl) {
      valuesEl.appendChild(renderValueTree(snap.values, [], snap));
    } else if (valuesEl) {
      valuesEl.innerHTML = '<span class="val-null">State not serializable</span>';
    }

    const watchersEl = panel.querySelector('#detail-watchers');
    if (!watchersEl) return;

    if (snap.watchers?.length > 0) {
      const list = document.createElement('div');
      list.className = 'watcher-list';
      for (const w of snap.watchers) {
        let sourceSnap = null;
        if (w.sourceFlowId) {
          sourceSnap = getSnapshotsMap().get(w.sourceFlowId) ?? null;
        } else {
          const snapshots = getSnapshotsMap();
          sourceSnap = Array.from(snapshots.values()).find((s) => s.rootTag.startsWith(w.source)) ?? null;
        }
        const sourceId = sourceSnap?.id ?? null;

        const row = document.createElement('div');
        row.className = 'watcher-row';
        row.innerHTML = `
          <span class="watcher-source">${w.source}</span>
          <span class="watcher-arrow">→</span>
          <span class="watcher-key">${w.key}</span>
        `;

        row.addEventListener('mouseenter', () => {
          if (sourceId) {
            document.querySelector(`.tree-node[data-id="${sourceId}"]`)?.classList.add('highlighted');
            channel.postMessage({ type: 'highlight', id: sourceId });
          } else if (w.sourceElId) {
            channel.postMessage({ type: 'highlight-source-el', id: w.sourceElId });
          }
        });

        row.addEventListener('mouseleave', () => {
          if (sourceId) {
            document.querySelector(`.tree-node[data-id="${sourceId}"]`)?.classList.remove('highlighted');
            channel.postMessage({ type: 'clear-highlight', id: sourceId });
          } else if (w.sourceElId) {
            channel.postMessage({ type: 'clear-highlight', id: w.sourceElId });
          }
        });

        list.appendChild(row);
      }
      watchersEl.appendChild(list);
    } else {
      watchersEl.innerHTML = '<span class="val-null">- No watchers -</span>';
    }
  }

  function renderValueTree(obj, pathArr, snap) {
    const container = document.createElement('div');
    const expandedPaths = getExpandedPathsSet();

    for (const [key, value] of Object.entries(obj)) {
      const currentPath = [...pathArr, key];
      const pathStr = currentPath.join('.');
      const isExpanded = expandedPaths.has(pathStr);
      const isComputed = pathArr.length === 0 && snap.computedKeys.includes(key);
      const isWatched = snap.watcherKeys.includes(pathStr);
      const keyClass = `value-key${isComputed ? ' computed' : ''}${isWatched ? ' watched' : ''}`;

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
          row.querySelector('.value-key-row')?.addEventListener('click', () => {
            isExpanded ? expandedPaths.delete(pathStr) : expandedPaths.add(pathStr);
            setExpandedPathsSet(expandedPaths);
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

                item.querySelector('.value-key-row')?.addEventListener('click', () => {
                  isItemExpanded ? expandedPaths.delete(itemPathStr) : expandedPaths.add(itemPathStr);
                  setExpandedPathsSet(expandedPaths);
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

        row.querySelector('.value-key-row')?.addEventListener('click', () => {
          isExpanded ? expandedPaths.delete(pathStr) : expandedPaths.add(pathStr);
          setExpandedPathsSet(expandedPaths);
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
    if (value === null) return '<span class="val-null">null</span>';
    if (value === undefined) return '<span class="val-null">undefined</span>';
    if (typeof value === 'boolean') return `<span class="val-bool">${value}</span>`;
    if (typeof value === 'number') return `<span class="val-num">${value}</span>`;
    if (typeof value === 'string') {
      const s = value.length > 60 ? value.slice(0, 60) + '…' : value;
      return `<span class="val-str">"${s}"</span>`;
    }
    if (Array.isArray(value)) return `<span class="val-type">Array(${value.length})</span>`;
    if (typeof value === 'object') return `<span class="val-type">{${Object.keys(value).length} keys}</span>`;
    return `<span class="val-null">${String(value)}</span>`;
  }

  function formatAge(ts) {
    const diff = Date.now() - ts;
    if (diff < 1000) return 'now';
    if (diff < 60000) return `${Math.floor(diff / 1000)}s`;
    return `${Math.floor(diff / 60000)}m`;
  }

  function flashNode(id) {
    requestAnimationFrame(() => {
      const el = document.querySelector(`.tree-node[data-id="${id}"]`);
      if (el) {
        el.classList.remove('flash');
        void el.offsetWidth;
        el.classList.add('flash');
      }

      const graphNode = document.querySelector(`.graph-node[data-id="${id}"]`);
      if (graphNode) {
        graphNode.classList.remove('flash');
        void graphNode.getBoundingClientRect();
        graphNode.classList.add('flash');
      }
    });
  }

  function renderFromState() {
    const snapshots = getSnapshotsMap();
    const selectedId = getSelectedId();
    const selectedSnap = selectedId ? snapshots.get(selectedId) : null;
    updateSourceCount();
    renderTree();
    renderGraph();
    renderDetail(selectedSnap ?? null);
  }

  if (resizeHandle && treePanel) {
    resizeHandle.addEventListener('mousedown', (e) => {
      e.preventDefault();
      resizeHandle.classList.add('dragging');
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';

      const onMove = (ev) => {
        const main = document.getElementById('main');
        if (!main) return;
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
    }, { signal });
  }

  if (sidebarSplitHandle && sourcesSection && inspectorSection && treePanel) {
    sidebarSplitHandle.addEventListener('mousedown', (e) => {
      e.preventDefault();
      sidebarSplitHandle.classList.add('dragging');
      document.body.style.cursor = 'row-resize';
      document.body.style.userSelect = 'none';

      const panelRect = treePanel.getBoundingClientRect();
      const handleRect = sidebarSplitHandle.getBoundingClientRect();
      const inspectorMin = Math.max(MIN_SECTION_HEIGHT, parseInt(getComputedStyle(inspectorSection).minHeight || `${MIN_SECTION_HEIGHT}`, 10));
      const maxTop = panelRect.height - inspectorMin - handleRect.height;

      const onMove = (ev) => {
        const y = ev.clientY - panelRect.top;
        const topHeight = Math.max(MIN_SECTION_HEIGHT, Math.min(maxTop, y));
        sourcesSection.style.flex = 'none';
        sourcesSection.style.height = `${topHeight}px`;
        inspectorSection.style.flex = '1';
        inspectorSection.style.minHeight = `${inspectorMin}px`;
      };

      const onUp = () => {
        sidebarSplitHandle.classList.remove('dragging');
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
        window.removeEventListener('mousemove', onMove);
        window.removeEventListener('mouseup', onUp);
      };

      window.addEventListener('mousemove', onMove);
      window.addEventListener('mouseup', onUp);
    }, { signal });
  }

  watch('theme', (theme) => setTheme(theme));
  watch('status', (status) => setStatus(status));
  watch('snapshots', () => renderFromState());
  watch('selectedId', () => renderFromState());
  watch('expandedSources', () => renderFromState());
  watch('expandedPaths', () => renderFromState());

  const savedTheme = localStorage.getItem(STORAGE_THEME_KEY);
  state.update({ theme: toTheme(savedTheme || 'dark') });

  if (themeToggle) {
    themeToggle.addEventListener('click', () => {
      const current = flowGet(appRoot, 'theme');
      const next = current === 'light' ? 'dark' : 'light';
      state.update({ theme: next });
      localStorage.setItem(STORAGE_THEME_KEY, next);
    }, { signal });
  }

  channel.postMessage({ type: 'ready' });
  const onChannelMessage = (e) => {
    if (e.data?.type === 'init') {
      state.update({
        snapshots: [],
        selectedId: null,
        expandedSources: [],
        expandedPaths: [],
        status: 'waiting',
      });
      channel.postMessage({ type: 'ready' });
      return;
    }

    const snap = e.data;
    if (!snap || snap.type !== 'snapshot') return;

    const snapshots = getSnapshotsMap();
    const isNew = !snapshots.has(snap.id);
    snapshots.set(snap.id, snap);
    writeSnapshotsMap(snapshots);

    if (isNew) {
      const expanded = new Set(flowGet(appRoot, 'expandedSources') || []);
      expanded.add(snap.id);
      if (snap.parentId) expanded.add(snap.parentId);
      state.update({ expandedSources: Array.from(expanded) });
    }

    state.update({ status: 'connected' });
    flashNode(snap.id);
  };
  channel.addEventListener('message', onChannelMessage);
  destroyFns.push(() => channel.removeEventListener('message', onChannelMessage));

  if (typeof ResizeObserver !== 'undefined' && graphPanel) {
    const observer = new ResizeObserver(() => renderGraph());
    observer.observe(graphPanel);
    destroyFns.push(() => observer.disconnect());
  }

  const ageTimer = setInterval(() => {
    document.querySelectorAll('.tree-age[data-ts]').forEach((el) => {
      el.textContent = formatAge(parseInt(el.dataset.ts, 10));
    });
  }, 1000);
  destroyFns.push(() => clearInterval(ageTimer));

  renderFromState();

  return {
    state,
    channel,
    destroy() {
      uiController.abort();
      watcherUnsubs.forEach((unsub) => {
        try {
          unsub();
        } catch {
          // No-op: unsub failures should not block cleanup.
        }
      });
      destroyFns.forEach((fn) => {
        try {
          fn();
        } catch {
          // No-op: best-effort teardown.
        }
      });
      channel.close();
      state.destroy();
    },
  };
}

// Optional direct boot path for experimentation.
if (typeof window !== 'undefined') {
  window.FlowStateDevtools = {
    startFlowStateDevtools,
  };

  startFlowStateDevtools();
  console.info('FlowState Devtools engine: flowstate');
}
