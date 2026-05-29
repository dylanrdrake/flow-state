import { FlowStateComponent } from '../../../../lib/FlowStateComponent.js';
import { flowGet } from '../../../../lib/FlowState.js';

const loadText = async (relativePath) => {
  const response = await fetch(new URL(relativePath, import.meta.url));
  if (!response.ok) throw new Error(`Failed to load ${relativePath}: ${response.status}`);
  return response.text();
};

const [styles, template] = await Promise.all([
  loadText('./inventory-grid.css'),
  loadText('./inventory-grid.html'),
]);

class InventoryGrid extends FlowStateComponent {
  styles = styles;
  template = template;

  #rowsEl = null;
  #adjustStock = () => {};
  #setReorderPoint = () => {};
  #isBound = false;

  connectedCallback() {
    super.connectedCallback();

    this.#rowsEl = this.querySelector('#rows');

    this.#adjustStock = flowGet(this, 'adjustStock') || (() => {});
    this.#setReorderPoint = flowGet(this, 'setReorderPoint') || (() => {});

    if (!this.#isBound) {
      this.#rowsEl.addEventListener('click', (event) => {
        const btn = event.target.closest('button[data-action]');
        if (!btn) return;
        const sku = btn.dataset.sku;
        if (!sku) return;
        const delta = btn.dataset.action === 'inc' ? 1 : -1;
        this.#adjustStock(sku, delta);
      });

      this.#rowsEl.addEventListener('change', (event) => {
        const input = event.target.closest('input[data-field="reorder"]');
        if (!input) return;
        const sku = input.dataset.sku;
        if (!sku) return;
        const value = Number.parseInt(input.value, 10);
        if (!Number.isFinite(value) || value < 0) return;
        this.#setReorderPoint(sku, value);
      });

      this.#isBound = true;
    }
  }

}

customElements.define('inventory-grid', InventoryGrid);
