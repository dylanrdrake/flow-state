import { State } from '../../lib/state.js';
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

  constructor() {
    super();

    this.attachShadow({ mode: 'open' });
    this.shadowRoot.adoptedStyleSheets = [sheet];
    this.shadowRoot.appendChild(template.content.cloneNode(true));

    this.#input = this.shadowRoot.querySelector('input');

    this.#input.addEventListener('input', async (e) => {
      this.dispatchEvent(new CustomEvent('state-emission', {
        detail: {
          user: {
            name: e.target.value
          }
        },
        bubbles: true,
        composed: true
      }));
    });
  }
}

customElements.define('name-input', NameInput);
