import { FlowSource, flowGet } from '../FlowState.js';

export function createDevtoolsStore(appRoot) {
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

  const update = (patch) => state.update(patch);
  const getSnapshots = () => flowGet(appRoot, 'snapshots') || [];
  const getSnapshotsMap = () => new Map(getSnapshots().map((snap) => [snap.id, snap]));
  const writeSnapshotsMap = (map) => update({ snapshots: Array.from(map.values()) });

  const getSelectedId = () => flowGet(appRoot, 'selectedId');
  const setSelectedId = (id) => update({ selectedId: id });

  const getExpandedSourcesSet = () => new Set(flowGet(appRoot, 'expandedSources') || []);
  const setExpandedSourcesSet = (setVal) => update({ expandedSources: Array.from(setVal) });

  const getExpandedPathsSet = () => new Set(flowGet(appRoot, 'expandedPaths') || []);
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
