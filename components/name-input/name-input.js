import { NodeState } from '../../lib/NodeState.js';

const sheet = new CSSStyleSheet();
const template = document.createElement('template');

fetch(new URL('./name-input.css', import.meta.url))
  .then(res => res.text())
  .then(css => sheet.replaceSync(css));

fetch(new URL('./name-input.html', import.meta.url))
  .then(res => res.text())
  .then(html => template.innerHTML = html);

export class NameInput extends HTMLElement {
  #input;
  #setName;

  constructor() {
    super();

    this.attachShadow({ mode: 'open' });
    this.shadowRoot.adoptedStyleSheets = [sheet];
    this.shadowRoot.appendChild(template.content.cloneNode(true));

    NodeState.get(this.shadowRoot, 'hooks.setName').then(h => this.#setName = h);

    this.#input = this.shadowRoot.querySelector('input');

    this.#input.addEventListener('input', (e) => {
      this.#setName(e.target.value);
    });
  }
}

customElements.define('name-input', NameInput);
