import { State } from './lib/state.js';
import './components/name-input/name-input.js';
import './components/greeting-display/greeting-display.js';
import './components/char-counter/char-counter.js';

const sheet = new CSSStyleSheet();
const template = document.createElement('template');

await fetch(new URL('./app.html', import.meta.url))
  .then(res => res.text())
  .then(html => template.innerHTML = html),

await fetch(new URL('./app.css', import.meta.url))
  .then(res => res.text())
  .then(css => sheet.replaceSync(css))


class SignalApp extends HTMLElement {
  #state;

  constructor() {
    super();
    const shadowRoot = this.attachShadow({ mode: 'open' });
    this.shadowRoot.adoptedStyleSheets = [sheet];
    this.shadowRoot.appendChild(template.content.cloneNode(true));

    // Use constructor directly to get immediate access to State instance
    this.#state = new State(shadowRoot, {
      user: {
        name: 'World'
      },
      count: (state) => state.user.name.length
    });

    // let update1 = this.#state.update({
    //   name: 'SignalApp'
    // });
    // console.log('update1', update1.name);

    this.#state.ready.then(() => {
      let updated = this.#state.update((prev) => {
        console.error('prev:', prev);
        return {
          user: {
            name: 'Signal'
          }
        }
      });
      console.log('updated', updated.name);
    });
  }
}

customElements.define('signal-app', SignalApp);


// Mount to #app element
const appRoot = document.getElementById('app');
if (appRoot) {
  appRoot.appendChild(document.createElement('signal-app'));
}