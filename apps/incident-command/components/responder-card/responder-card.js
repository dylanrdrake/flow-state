import { FlowStateComponent } from '../../../../lib/FlowStateComponent.js';
import { flowGet, flowWatch, flowCompute } from '../../../../lib/FlowState.js';

const loadText = async (relativePath) => {
  const response = await fetch(new URL(relativePath, import.meta.url));
  if (!response.ok) throw new Error(`Failed to load ${relativePath}: ${response.status}`);
  return response.text();
};

const [styles, template] = await Promise.all([
  loadText('./responder-card.css'),
  loadText('./responder-card.html'),
]);

class ResponderCard extends FlowStateComponent {
  styles = styles;
  template = template;

  source = {
    name: '',
    status: 'idle',
    queue: [],
    hasQueue: flowCompute((queue) => queue.length > 0, ['queue']),
  };

  #regionId = '';
  #squadId = '';
  #responderId = '';
  #advanceResponderTask = () => {};
  #initialized = false;

  connectedCallback() {
    super.connectedCallback();
    if (this.#initialized) return;

    this.#regionId = this.getAttribute('region-id') || '';
    this.#squadId = this.getAttribute('squad-id') || '';
    this.#responderId = this.getAttribute('responder-id') || '';
    this.#advanceResponderTask = flowGet(this, 'advanceResponderTask') || (() => {});

    flowWatch(this, 'responders', (responders = []) => {
      const responder = responders.find((entry) => entry.id === this.#responderId);
      if (!responder) return;
      this.source.update({
        name: responder.name,
        status: responder.status,
        queue: responder.queue,
      });
    });

    flowWatch(this, 'hasQueue', (hasQueue) => {
      const button = this.querySelector('button[data-action="advance"]');
      if (!button) return;
      button.disabled = !hasQueue;
      button.textContent = hasQueue ? 'Advance' : 'Done';
    });

    this.addEventListener('click', (event) => {
      const advanceBtn = event.target.closest('button[data-action="advance"]');
      if (!advanceBtn || advanceBtn.disabled) return;
      this.#advanceResponderTask(this.#regionId, this.#squadId, this.#responderId);
    });

    this.#initialized = true;
  }
}

customElements.define('responder-card', ResponderCard);
