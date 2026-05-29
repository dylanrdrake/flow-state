import { FlowStateComponent } from '../../../../lib/FlowStateComponent.js';
import { flowGet } from '../../../../lib/FlowState.js';

const loadText = async (relativePath) => {
  const response = await fetch(new URL(relativePath, import.meta.url));
  if (!response.ok) throw new Error(`Failed to load ${relativePath}: ${response.status}`);
  return response.text();
};

const [styles, template] = await Promise.all([
  loadText('./fulfillment-queue.css'),
  loadText('./fulfillment-queue.html'),
]);

class FulfillmentQueue extends FlowStateComponent {
  styles = styles;
  template = template;

  #advanceOrder = () => {};
  #isBound = false;

  connectedCallback() {
    super.connectedCallback();

    this.#advanceOrder = flowGet(this, 'advanceOrder') || (() => {});

    if (!this.#isBound) {
      this.addEventListener('click', (event) => {
        const btn = event.target.closest('button[data-action="advance"]');
        if (!btn) return;
        const id = Number.parseInt(btn.dataset.orderId || '0', 10);
        if (!Number.isFinite(id) || id <= 0) return;
        this.#advanceOrder(id);
      });
      this.#isBound = true;
    }

  }
}

customElements.define('fulfillment-queue', FulfillmentQueue);
