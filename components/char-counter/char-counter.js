import { State } from "../../lib/state.js";

const sheet = new CSSStyleSheet();
const template = document.createElement('template');

fetch(new URL('./char-counter.css', import.meta.url))
  .then(res => res.text())
  .then(css => sheet.replaceSync(css));

fetch(new URL('./char-counter.html', import.meta.url))
  .then(res => res.text())
  .then(html => template.innerHTML = html);

export class CharCounter extends HTMLElement {
  #clearButton;
  // state tracked outside of State.js.
  // You can put it in a State scope if needed elsewhere.
  #clearCount = 0;

  constructor() {
    super();
    const shadowRoot = this.attachShadow({ mode: 'open' });
    this.shadowRoot.adoptedStyleSheets = [sheet];
    this.shadowRoot.innerHTML = template.innerHTML;

    State.create(shadowRoot, {
      clearBtnLabel: 'Clear'
    });

    this.#clearButton = this.shadowRoot.querySelector('#clear-btn');
    this.#clearButton.addEventListener('click', (e) => {
      State.update(this, {
        user: {
          name: ''
        },
        clearBtnLabel: `Clear ${++this.#clearCount}`
      });
    });

  }

  async connectedCallback() {
  }
}

customElements.define('char-counter', CharCounter);