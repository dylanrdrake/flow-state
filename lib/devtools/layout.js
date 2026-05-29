import { MIN_SECTION_HEIGHT, TREE_MAX_WIDTH, TREE_MIN_WIDTH } from './constants.js';

export function setupPanelResizers({
  resizeHandle,
  treePanel,
  sidebarSplitHandle,
  sourcesSection,
  inspectorSection,
  signal,
}) {
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
        const newWidth = Math.min(TREE_MAX_WIDTH, Math.max(TREE_MIN_WIDTH, ev.clientX - mainRect.left));
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
}
