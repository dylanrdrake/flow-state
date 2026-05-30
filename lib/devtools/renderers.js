import { SVG_NS } from './constants.js';

export function createDevtoolsRenderers({ channel, graphPanel, store }) {
  const COMPUTED_MARKER = '__flowstate_computed_marker__';
  const ACTION_MARKER = '__flowstate_action_marker__';

  const graphCamera = {
    scale: 1,
    tx: 0,
    ty: 0,
    minScale: 0.35,
    maxScale: 2.5,
    initialized: false,
  };

  let graphInteractionsBound = false;

  function getSvgPoint(svg, clientX, clientY) {
    const rect = svg.getBoundingClientRect();
    const viewBox = svg.viewBox.baseVal;
    const x = ((clientX - rect.left) / rect.width) * viewBox.width + viewBox.x;
    const y = ((clientY - rect.top) / rect.height) * viewBox.height + viewBox.y;
    return { x, y };
  }

  function getViewportLayer(svg) {
    return svg.querySelector('g[data-graph-viewport="true"]');
  }

  function applyGraphCamera(svg) {
    const viewport = getViewportLayer(svg);
    if (!viewport) return;
    viewport.setAttribute('transform', `translate(${graphCamera.tx} ${graphCamera.ty}) scale(${graphCamera.scale})`);
  }

  function initGraphInteractions(svg) {
    if (graphInteractionsBound || !svg) return;
    graphInteractionsBound = true;

    let isPanning = false;
    let panStartX = 0;
    let panStartY = 0;
    let panStartTx = 0;
    let panStartTy = 0;

    svg.addEventListener('wheel', (e) => {
      e.preventDefault();

      const { x, y } = getSvgPoint(svg, e.clientX, e.clientY);
      const zoomFactor = e.deltaY < 0 ? 1.1 : 0.9;
      const nextScale = Math.max(graphCamera.minScale, Math.min(graphCamera.maxScale, graphCamera.scale * zoomFactor));
      if (nextScale === graphCamera.scale) return;

      const worldX = (x - graphCamera.tx) / graphCamera.scale;
      const worldY = (y - graphCamera.ty) / graphCamera.scale;

      graphCamera.scale = nextScale;
      graphCamera.tx = x - worldX * graphCamera.scale;
      graphCamera.ty = y - worldY * graphCamera.scale;
      applyGraphCamera(svg);
    }, { passive: false });

    svg.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      if (e.target.closest('.graph-node')) return;

      isPanning = true;
      panStartX = e.clientX;
      panStartY = e.clientY;
      panStartTx = graphCamera.tx;
      panStartTy = graphCamera.ty;
      svg.classList.add('panning');
      svg.setPointerCapture?.(e.pointerId);
    });

    svg.addEventListener('pointermove', (e) => {
      if (!isPanning) return;
      graphCamera.tx = panStartTx + (e.clientX - panStartX);
      graphCamera.ty = panStartTy + (e.clientY - panStartY);
      applyGraphCamera(svg);
    });

    function endPan(e) {
      if (!isPanning) return;
      isPanning = false;
      svg.classList.remove('panning');
      if (e?.pointerId != null && svg.hasPointerCapture?.(e.pointerId)) {
        svg.releasePointerCapture(e.pointerId);
      }
    }

    svg.addEventListener('pointerup', endPan);
    svg.addEventListener('pointercancel', endPan);
    svg.addEventListener('pointerleave', endPan);
  }

  function updateSourceCount() {
    const countEl = document.getElementById('source-count');
    if (countEl) countEl.textContent = String(store.getSnapshots().length);
  }

  function buildTree() {
    const snapshots = store.getSnapshotsMap();
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

    return { roots, children, snapshots };
  }

  function renderTree() {
    const container = document.getElementById('tree');
    if (!container) return;

    const { roots, children, snapshots } = buildTree();
    const selectedId = store.getSelectedId();
    const expandedSources = store.getExpandedSourcesSet();

    if (snapshots.size === 0) {
      container.innerHTML = `
        <div class="empty-state">
          <div class="empty-icon">◎</div>
          <div>No sources detected</div>
          <code>flowDevtools()</code>
        </div>`;
      return;
    }

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
          store.setExpandedSourcesSet(expandedSources);
        });
      }

      rowEl.addEventListener('click', () => {
        store.setSelectedId(id);
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

    initGraphInteractions(svg);

    const snapshots = store.getSnapshotsMap();
    const selectedId = store.getSelectedId();
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
    if (!graphCamera.initialized) {
      graphCamera.tx = width / 2 - graphCenterX;
      graphCamera.ty = 20 - bounds.minY;
      graphCamera.scale = 1;
      graphCamera.initialized = true;
    }

    const viewportLayer = document.createElementNS(SVG_NS, 'g');
    viewportLayer.setAttribute('data-graph-viewport', 'true');

    const edgesLayer = document.createElementNS(SVG_NS, 'g');
    const nodesLayer = document.createElementNS(SVG_NS, 'g');

    for (const [parentId, childIds] of children.entries()) {
      const from = points.get(parentId);
      if (!from) continue;
      childIds.forEach((childId) => {
        const to = points.get(childId);
        if (!to) return;

        const x1 = from.x;
        const y1 = from.y + NODE_H / 2;
        const x2 = to.x;
        const y2 = to.y - NODE_H / 2;
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

      const x = p.x - NODE_W / 2;
      const y = p.y - NODE_H / 2;

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
          const expandedSources = store.getExpandedSourcesSet();
          expandedSources.add(id);
          patch.expandedSources = Array.from(expandedSources);
        }
        store.update(patch);
      });

      g.addEventListener('mouseenter', () => {
        channel.postMessage({ type: 'highlight', id });
      });

      g.addEventListener('mouseleave', () => {
        channel.postMessage({ type: 'clear-highlight', id });
      });

      nodesLayer.appendChild(g);
    });

    viewportLayer.appendChild(edgesLayer);
    viewportLayer.appendChild(nodesLayer);
    svg.appendChild(viewportLayer);
    applyGraphCamera(svg);
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
      ? `<span class="detail-class-name">${snap.label}</span> <span class="detail-root-tag">&lt;${snap.rootTag}&gt;</span>`
      : `<span class="detail-root-tag">&lt;${snap.rootTag}&gt;</span>`;
    const inferredShadow = typeof snap.rootTag === 'string' && snap.rootTag.endsWith(' (shadow)');
    const inferredHostTag = typeof snap.rootTag === 'string'
      ? snap.rootTag.replace(/\s*\(shadow\)$/, '')
      : null;
    const hostTag = snap.shadowHostTag || inferredHostTag || '#document';
    const isShadow = typeof snap.isShadow === 'boolean' ? snap.isShadow : inferredShadow;
    const shadowMode = snap.shadowMode || (isShadow ? 'unknown' : 'n/a');
    const shadowInfoHtml = `<div class="detail-shadow-row">host: &lt;${hostTag}&gt; · shadow: ${isShadow ? 'yes' : 'no'} · mode: ${shadowMode} · flowThrough: ${snap.isFlowThrough ? 'yes' : 'no'}</div>`;

    panel.innerHTML = `
      <div class="detail-header">
        <div class="detail-title-row">
          <span class="detail-tag">${tagHtml}</span>
          <span class="detail-id">${snap.id.slice(0, 8)}…</span>
        </div>
        ${shadowInfoHtml}
      </div>
      <div class="detail-meta">
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
    if (valuesEl) {
      const stateView = (snap.values && typeof snap.values === 'object') ? { ...snap.values } : {};
      if (Array.isArray(snap.computedKeys) && snap.computedKeys.length > 0) {
        snap.computedKeys.forEach((key) => {
          stateView[key] = COMPUTED_MARKER;
        });
      }
      if (Array.isArray(snap.actionKeys) && snap.actionKeys.length > 0) {
        snap.actionKeys.forEach((key) => {
          stateView[key] = ACTION_MARKER;
        });
      }
      valuesEl.appendChild(renderValueTree(stateView, [], snap));
    }

    const watchersEl = panel.querySelector('#detail-watchers');
    if (!watchersEl) return;

    if (snap.watchers?.length > 0) {
      const list = document.createElement('div');
      list.className = 'watcher-list';
      for (const w of snap.watchers) {
        let sourceSnap = null;
        if (w.sourceFlowId) {
          sourceSnap = store.getSnapshotsMap().get(w.sourceFlowId) ?? null;
        } else {
          const snapshots = store.getSnapshotsMap();
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
            document.querySelector(`.graph-node[data-id="${sourceId}"]`)?.classList.add('highlighted');
            channel.postMessage({ type: 'highlight', id: sourceId });
          } else if (w.sourceElId) {
            channel.postMessage({ type: 'highlight-source-el', id: w.sourceElId });
          }
        });

        row.addEventListener('mouseleave', () => {
          if (sourceId) {
            document.querySelector(`.tree-node[data-id="${sourceId}"]`)?.classList.remove('highlighted');
            document.querySelector(`.graph-node[data-id="${sourceId}"]`)?.classList.remove('highlighted');
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
    const expandedPaths = store.getExpandedPathsSet();

    for (const [key, value] of Object.entries(obj)) {
      const currentPath = [...pathArr, key];
      const pathStr = currentPath.join('.');
      const isExpanded = expandedPaths.has(pathStr);
      const isComputed = pathArr.length === 0 && snap.computedKeys.includes(key);
      const isAction = pathArr.length === 0 && Array.isArray(snap.actionKeys) && snap.actionKeys.includes(key);
      const isWatched = snap.watcherKeys.includes(pathStr);
      const keyClass = `value-key${isComputed ? ' computed' : ''}${isAction ? ' action' : ''}${isWatched ? ' watched' : ''}`;

      const row = document.createElement('div');
      row.className = 'value-row';

      if (isComputed) {
        row.innerHTML = `
          <span class="value-toggle"> </span>
          <span class="${keyClass}">${key}</span>
          <span class="val-computed">(computed)</span>
        `;
        container.appendChild(row);
        continue;
      }

      if (isAction) {
        row.innerHTML = `
          <span class="value-toggle"> </span>
          <span class="${keyClass}">${key}</span>
          <span class="val-action">(action)</span>
        `;
        container.appendChild(row);
        continue;
      }

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
            store.setExpandedPathsSet(expandedPaths);
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
                  store.setExpandedPathsSet(expandedPaths);
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
          store.setExpandedPathsSet(expandedPaths);
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
    const snapshots = store.getSnapshotsMap();
    const selectedId = store.getSelectedId();
    const selectedSnap = selectedId ? snapshots.get(selectedId) : null;
    updateSourceCount();
    renderTree();
    renderGraph();
    renderDetail(selectedSnap ?? null);
  }

  return {
    formatAge,
    flashNode,
    renderGraph,
    renderFromState,
  };
}
