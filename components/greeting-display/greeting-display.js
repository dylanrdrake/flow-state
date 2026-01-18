import { NodeState } from '../../lib/NodeState.js';

const sheet = new CSSStyleSheet();
const template = document.createElement('template');

fetch(new URL('./greeting-display.css', import.meta.url))
  .then(res => res.text())
  .then(css => sheet.replaceSync(css));

fetch(new URL('./greeting-display.html', import.meta.url))
  .then(res => res.text())
  .then(html => template.innerHTML = html);

export class GreetingDisplay extends HTMLElement {
  #state;
  #shadow;

  constructor() {
    super();
    this.#shadow = this.attachShadow({ mode: 'closed' }); 
    this.#shadow.adoptedStyleSheets = [sheet];
    this.#shadow.appendChild(template.content.cloneNode(true));

    // README: closed shadowRoot will block parent state updates to bindings under this element,
    // so we need to create a new NodeState instance and watcher here to tunnel updates through.
    this.#state = new NodeState(this.#shadow, {
      name: 'overwrite',
      id: 123
    });

    NodeState.watch(this, 'user', this.#state.update);
  }
}

customElements.define('greeting-display', GreetingDisplay);
