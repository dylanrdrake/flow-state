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
  #state;
  #clearButton;
  #clearCount = 0;

  constructor() {
    super();
    const shadowRoot = this.attachShadow({ mode: 'open' });
    this.shadowRoot.adoptedStyleSheets = [sheet];
    this.shadowRoot.innerHTML = template.innerHTML;

    State.create(shadowRoot, {
      clearBtnLabel: 'Clear',
    }).then((state) => {
      this.#state = state;
    });

    State.watch(this.shadowRoot, 'clearBtnLabel', (newValue) => {
      console.timeEnd('Clear Button Clicked - State Update');
      console.log('CharCounter clearBtnLabel changed to:', newValue);
    });

    State.watch(this.shadowRoot, 'user.name', (newValue) => {
      console.log('CharCounter user.name changed. New length:', newValue);
    });

    this.#clearButton = this.shadowRoot.querySelector('#clear-btn');
    this.#clearButton.addEventListener('click', (e) => {
      console.time('Clear Button Clicked - State Update');
      State.update(this.shadowRoot, {
        user: {
          name: ''
        },
        clearBtnLabel: `Clear ${++this.#clearCount}`
      });
    });
  }
}

customElements.define('char-counter', CharCounter);