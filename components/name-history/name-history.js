import { NodeState } from '../../lib/NodeState.js';
import { NameHistoryRecord } from './name-history-record/name-history-record.js';

class NameHistory extends HTMLElement {
  #shadow;

  constructor() {
    super();
    this.#shadow = this.attachShadow({ mode: 'open' });
    this.#shadow.appendChild(document.createElement('slot'));

    // README: can read from the light DOM (unless using closed shadow)
    NodeState.watch(this, 'changeHistory', this.#renderHistory.bind(this));
  }

  #renderHistory(changeHistory) {
    this.#shadow.innerHTML = '';
    let recordEls = changeHistory.map(record => {
      return new NameHistoryRecord({
        username: record.username,
        timestamp: record.timestamp
      });
    });
    this.#shadow.append(...recordEls.reverse());
  }
}

customElements.define('name-history', NameHistory);