import { NodeState } from '../../lib/NodeState.js';
import './name-history-record/name-history-record.js';

class NameHistory extends HTMLElement {
  #shadow;

  constructor() {
    super();
    this.#shadow = this.attachShadow({ mode: 'open' });
    this.#shadow.appendChild(document.createElement('slot'));

    // README: can always read from the light DOM if below
    NodeState.watch(this, 'changeHistory', this.#renderHistory.bind(this));
  }

  #renderHistory(history) {
    this.#shadow.innerHTML = '';
    let records = history.map(record => {
      const recordEl = document.createElement('name-history-record');
      recordEl.username = record.username;
      recordEl.timestamp = record.timestamp;
      return recordEl;
    });
    this.#shadow.append(...records.reverse());
  }
}

customElements.define('name-history', NameHistory);