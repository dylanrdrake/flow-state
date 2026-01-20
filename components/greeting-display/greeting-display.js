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
  // #state;

  constructor() {
    super();
    const shadow = this.attachShadow({ mode: 'closed' }); 
    shadow.adoptedStyleSheets = [sheet];
    shadow.appendChild(template.content.cloneNode(true));

    // README: closed shadowRoot will block parent state updates to bindings under this element,
    // so we need to to tunnel updates through.
    // README: can also do it manually 2 ways.
    // We have to attach NodeState to the closed shadowRoot so that updates can be tunneled through.
    // (.shadowRoot is inaccessible from outside when shadow is closed so NodeState can't access it)
    let state = NodeState.create(shadow, {
      user: {
        name: 'overwrite',
        id: 1234
      },
      config: {
        logUpdates: true
      }
    })
    NodeState.watch(this, 'user', user => state.update({ user }));
    NodeState.watch(this, 'config', config => state.update({ config }));

    NodeState.get(this, 'hooks.setName').then(setNameHook => {
      setNameHook('Overwrite Name');
    });

    // README: could also be done like this
    // this.#state = new NodeState(shadow, {
    //   user: {
    //     name: 'overwrite',
    //     id: 123,
    //   },
    //   config: {
    //     logUpdates: false
    //   }
    // });

    // NodeState.watch(this, 'user', this.#state.update);
    // NodeState.watch(this, 'config', this.#state.update);
  }
}

customElements.define('greeting-display', GreetingDisplay);
