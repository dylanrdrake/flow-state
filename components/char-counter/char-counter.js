import { NodeState } from "../../lib/NodeState.js";

const sheet = new CSSStyleSheet();
const template = document.createElement('template');

fetch(new URL('./char-counter.css', import.meta.url))
  .then(res => res.text())
  .then(css => sheet.replaceSync(css));

await fetch(new URL('./char-counter.html', import.meta.url))
  .then(res => res.text())
  .then(html => template.innerHTML = html);

export class CharCounter extends HTMLElement {
  #clearBtn;
  #reset;

  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this.shadowRoot.adoptedStyleSheets = [sheet];
    this.shadowRoot.innerHTML = template.innerHTML;

    NodeState.get(this, 'hooks.reset').then(h => this.#reset = h);

    this.#clearBtn = this.shadowRoot.getElementById('clear-btn');
    this.#clearBtn?.addEventListener('click', () => this.#reset());
  }
}

customElements.define('char-counter', CharCounter);