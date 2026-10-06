import { FlowSource, flowGet, flowKeys } from '../FlowState.js';

const keys = flowKeys();

/** @typedef {import('../../types/index.d.ts').Snapshot} Snapshot */
/** @typedef {import('../../types/index.d.ts').FlowSourceInstance<any>} FlowSourceInstance */

export function createDevtoolsStore(appRoot) {
  // `new FlowSource(...)` returns the frozen { update, destroy } facade, not the class
  // instance — see the constructor note in lib/FlowState.js.
  const state = /** @type {FlowSourceInstance} */ (/** @type {unknown} */ (new FlowSource(appRoot, {
    snapshots: [],
    selectedId: null,
    expandedSources: [],
    expandedPaths: [],
    treeWidth: 320,
    sidebarTopHeight: null,
    status: 'waiting',
    theme: 'dark',
  })));

  const update = (patch) => state.update(patch);
  /** @returns {Snapshot[]} */
  const getSnapshots = () => flowGet(appRoot, keys.snapshots) || [];
  const getSnapshotsMap = () => new Map(getSnapshots().map((snap) => [snap.id, snap]));
  const writeSnapshotsMap = (map) => update({ snapshots: Array.from(map.values()) });

  const getSelectedId = () => flowGet(appRoot, keys.selectedId);
  const setSelectedId = (id) => update({ selectedId: id });

  const getExpandedSourcesSet = () => new Set(flowGet(appRoot, keys.expandedSources) || []);
  const setExpandedSourcesSet = (setVal) => update({ expandedSources: Array.from(setVal) });

  const getExpandedPathsSet = () => new Set(flowGet(appRoot, keys.expandedPaths) || []);
  const setExpandedPathsSet = (setVal) => update({ expandedPaths: Array.from(setVal) });

  const resetConnectionState = () => update({
    snapshots: [],
    selectedId: null,
    expandedSources: [],
    expandedPaths: [],
    status: 'waiting',
  });

  return {
    state,
    update,
    getSnapshots,
    getSnapshotsMap,
    writeSnapshotsMap,
    getSelectedId,
    setSelectedId,
    getExpandedSourcesSet,
    setExpandedSourcesSet,
    getExpandedPathsSet,
    setExpandedPathsSet,
    resetConnectionState,
  };
}
