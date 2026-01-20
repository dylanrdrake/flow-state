import { NodeState } from '../../../lib/NodeState.js';

let html = await fetch(new URL('./name-history-record.html', import.meta.url))
  .then(res => res.text())

export class NameHistoryRecord extends HTMLElement {
  #state;

  constructor(record) {
    super();

    // README: can use light DOM also if template is rendered there
    this.#state = new NodeState(this, {
      name: record?.username || '',
      timestamp: record?.timestamp || null,
      nameCharCount: (state) => state.name ? state.name.length : 0
    });

  }

  async connectedCallback() {
    this.innerHTML = html; // render to light DOM
  }
}

customElements.define('name-history-record', NameHistoryRecord);