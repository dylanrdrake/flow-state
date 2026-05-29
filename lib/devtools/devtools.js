import { flowGet, flowWatch } from '../FlowState.js';
import { CHANNEL_NAME, STORAGE_THEME_KEY } from './constants.js';
import { setupPanelResizers } from './layout.js';
import { createDevtoolsRenderers } from './renderers.js';
import { createDevtoolsStore } from './store.js';

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

  const store = createDevtoolsStore(appRoot);
  const { formatAge, flashNode, renderGraph, renderFromState } = createDevtoolsRenderers({
    channel,
    graphPanel,
    store,
  });

  const toTheme = (theme) => (theme === 'light' ? 'light' : 'dark');
  const watch = (key, callback) => {
    const unsub = flowWatch(appRoot, key, callback);
    if (typeof unsub === 'function') watcherUnsubs.push(unsub);
    return unsub;
  };

  const setTheme = (theme) => {
    const next = toTheme(theme);
    document.documentElement.setAttribute('data-theme', next);

    if (themeToggle) {
      themeToggle.textContent = next === 'dark' ? 'Light' : 'Dark';
      themeToggle.setAttribute('aria-label', `Switch to ${next === 'dark' ? 'light' : 'dark'} mode`);
    }
  };

  const setStatus = (status) => {
    const el = document.getElementById('status');
    if (!el) return;

    const connected = status === 'connected';
    el.textContent = connected ? '● Connected' : '○ Waiting for app…';
    el.className = connected ? 'connected' : 'waiting';
  };

  setupPanelResizers({
    resizeHandle,
    treePanel,
    sidebarSplitHandle,
    sourcesSection,
    inspectorSection,
    signal,
  });

  watch('theme', (theme) => setTheme(theme));
  watch('status', (status) => setStatus(status));
  watch('snapshots', () => renderFromState());
  watch('selectedId', () => renderFromState());
  watch('expandedSources', () => renderFromState());
  watch('expandedPaths', () => renderFromState());

  const savedTheme = localStorage.getItem(STORAGE_THEME_KEY);
  store.update({ theme: toTheme(savedTheme || 'dark') });

  if (themeToggle) {
    themeToggle.addEventListener('click', () => {
      const current = flowGet(appRoot, 'theme');
      const next = current === 'light' ? 'dark' : 'light';
      store.update({ theme: next });
      localStorage.setItem(STORAGE_THEME_KEY, next);
    }, { signal });
  }

  channel.postMessage({ type: 'ready' });
  const onChannelMessage = (e) => {
    if (e.data?.type === 'init') {
      store.resetConnectionState();
      channel.postMessage({ type: 'ready' });
      return;
    }

    const snap = e.data;
    if (!snap || snap.type !== 'snapshot') return;

    const snapshots = store.getSnapshotsMap();
    const isNew = !snapshots.has(snap.id);
    snapshots.set(snap.id, snap);
    store.writeSnapshotsMap(snapshots);

    if (isNew) {
      const expanded = store.getExpandedSourcesSet();
      expanded.add(snap.id);
      if (snap.parentId) expanded.add(snap.parentId);
      store.setExpandedSourcesSet(expanded);
    }

    store.update({ status: 'connected' });
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
    state: store.state,
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
      store.state.destroy();
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
