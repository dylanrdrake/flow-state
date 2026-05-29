import { FlowStateComponent } from '../../../../lib/FlowStateComponent.js';
import { flowGet, flowWatch } from '../../../../lib/FlowState.js';

const loadText = async (relativePath) => {
  const response = await fetch(new URL(relativePath, import.meta.url));
  if (!response.ok) throw new Error(`Failed to load ${relativePath}: ${response.status}`);
  return response.text();
};

const [styles, template] = await Promise.all([
  loadText('./reorder-queue.css'),
  loadText('./reorder-queue.html'),
]);

class ReorderQueue extends FlowStateComponent {
  styles = styles;
  template = template;

  #createPurchaseOrder = () => {};
  #receivePurchaseOrder = () => {};
  #isBound = false;

  #syncReceiveButtons() {
    this.querySelectorAll('button[data-action="receive"]').forEach((button) => {
      const isOpen = button.dataset.status === 'open';
      button.disabled = !isOpen;
      button.textContent = isOpen ? 'Receive' : 'Received';
    });
  }

  connectedCallback() {
    super.connectedCallback();

    this.#createPurchaseOrder = flowGet(this, 'createPurchaseOrder') || (() => {});
    this.#receivePurchaseOrder = flowGet(this, 'receivePurchaseOrder') || (() => {});

    flowWatch(this, 'purchaseOrders', () => {
      queueMicrotask(() => this.#syncReceiveButtons());
    });

    if (!this.#isBound) {
      this.addEventListener('click', (event) => {
        const createBtn = event.target.closest('button[data-action="create"]');
        if (createBtn) {
          const sku = createBtn.dataset.sku;
          const qty = Number.parseInt(createBtn.dataset.qty || '0', 10);
          if (sku && Number.isFinite(qty) && qty > 0) this.#createPurchaseOrder(sku, qty);
          return;
        }

        const receiveBtn = event.target.closest('button[data-action="receive"]');
        if (!receiveBtn) return;
        if (receiveBtn.dataset.status !== 'open') return;
        const id = Number.parseInt(receiveBtn.dataset.poId || '0', 10);
        if (!Number.isFinite(id) || id <= 0) return;
        this.#receivePurchaseOrder(id);
      });

      this.#isBound = true;
    }

  }
}

customElements.define('reorder-queue', ReorderQueue);
