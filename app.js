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


const tenThousandNumbers = Array.from({ length: 1000000 }, (_, i) => i);
const tenThousandStrings = (nums) => nums.map(num => `Item ${num}`);
const tenThousandObjects = (strings) => strings.map(str => ({ label: str }));


class SignalApp extends HTMLElement {
  #state;
  #testPerfBtn;
  #testPerfLabel;

  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this.shadowRoot.adoptedStyleSheets = [sheet];
    this.shadowRoot.appendChild(template.content.cloneNode(true));
    this.#testPerfBtn = this.shadowRoot.getElementById('test-perf-btn');
    this.#testPerfLabel = this.shadowRoot.getElementById('test-perf-label');

    this.#testPerfBtn.addEventListener('click', (e) => {
      console.time('State Update Propagation');
      State.update(this.shadowRoot, {
        numberArr: tenThousandNumbers.reverse()
      });
    });


    // Use constructor directly to get immediate access to State instance
    State.create(this.shadowRoot, {
      user: {
        name: 'World'
      },
      count: (state) => state.user.name.length,
      numberArr: tenThousandNumbers,
      stringArr: (state) => tenThousandObjects(tenThousandStrings(state.numberArr)),
    });

    State.watch(this.shadowRoot, 'stringArr', (newValue) => {
      console.timeEnd('State Update Propagation');
      let firstFive = newValue.slice(0, 5).map(obj => obj.label);
      this.#testPerfLabel.textContent = `First 5 items: ${firstFive.join(', ')}`;
    });

    console.time('State Update Propagation');
    State.update(this.shadowRoot, {
      numberArr: tenThousandNumbers.reverse()
    });
  }  
}

customElements.define('signal-app', SignalApp);


// Mount to #app element
const appRoot = document.getElementById('app');
if (appRoot) {
  appRoot.appendChild(document.createElement('signal-app'));
}