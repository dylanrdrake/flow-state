import { NodeState } from '../../../lib/NodeState.js';

let html = await fetch(new URL('./name-history-record.html', import.meta.url))
  .then(res => res.text())

export class NameHistoryRecord extends HTMLElement {
  #shadow;
  #state;

  constructor() {
    super();

    // README: can use light DOM also if template is rendered there
    this.#state = new NodeState(this, {
      name: null,
      timestamp: null
    });
  }

  connectedCallback() {
    this.innerHTML = html; // render to light DOM
  }

  set username(value) {
    this.#state.update({ name: value });
  }

  set timestamp(value) {
    this.#state.update({ timestamp: value });
  }
}

customElements.define('name-history-record', NameHistoryRecord);