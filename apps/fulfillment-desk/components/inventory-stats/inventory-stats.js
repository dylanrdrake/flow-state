import { FlowStateComponent } from '../../../../lib/FlowStateComponent.js';

const loadText = async (relativePath) => {
  const response = await fetch(new URL(relativePath, import.meta.url));
  if (!response.ok) throw new Error(`Failed to load ${relativePath}: ${response.status}`);
  return response.text();
};

const [styles, template] = await Promise.all([
  loadText('./inventory-stats.css'),
  loadText('./inventory-stats.html'),
]);

class InventoryStats extends FlowStateComponent {
  styles = styles;
  template = template;
}

customElements.define('inventory-stats', InventoryStats);
