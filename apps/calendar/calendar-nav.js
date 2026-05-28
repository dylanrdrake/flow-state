import { FlowSource, flowGet, flowWatch, flowThrough, flowCompute, startFlowDevtools } from '../../lib/FlowState.js';


const CSS = String.raw;
const HTML = String.raw;

const styles = CSS`
  :host {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 14px 20px;
    background: white;
    border-bottom: 1px solid #e5e7eb;
    flex-shrink: 0;
  }
  .label {
    font-size: 1.15rem;
    font-weight: 700;
    color: #1f2937;
    min-width: 160px;
    text-align: center;
  }
  .nav {
    display: flex;
    gap: 6px;
    align-items: center;
  }
  button {
    background: none;
    border: 1px solid #e5e7eb;
    border-radius: 8px;
    height: 34px;
    padding: 0 10px;
    font-size: 16px;
    cursor: pointer;
    color: #6b7280;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: background 0.12s, color 0.12s;
    font-family: inherit;
    white-space: nowrap;
  }
  button:hover { background: #f3f4f6; color: #111827; }
  #prev, #next { width: 34px; font-size: 18px; }
  #today { font-size: 12px; font-weight: 600; }
  .spacer { width: 120px; }
`;

const sheet = new CSSStyleSheet();
sheet.replaceSync(styles);

const template = document.createElement('template');
template.innerHTML = HTML`
  <div class="nav">
    <button id="prev" title="Previous month">‹</button>
    <button id="next" title="Next month">›</button>
    <button id="today">Today</button>
  </div>
  <span class="label"></span>
  <div class="spacer"></div>
`;


export class CalendarNav extends HTMLElement {
  #label;
  #prevMonth = () => {};
  #nextMonth = () => {};
  #goToday = () => {};

  constructor() {
    super();
    const shadow = this.attachShadow({ mode: 'open' });
    shadow.appendChild(template.content.cloneNode(true));
    shadow.adoptedStyleSheets = [sheet];

    this.#label = shadow.querySelector('.label');

    shadow.getElementById('prev').addEventListener('click', () => this.#prevMonth?.());
    shadow.getElementById('next').addEventListener('click', () => this.#nextMonth?.());
    shadow.getElementById('today').addEventListener('click', () => this.#goToday?.());
  }


  connectedCallback() {
    this.#prevMonth = flowGet(this, 'prevMonth');
    this.#nextMonth = flowGet(this, 'nextMonth');
    this.#goToday = flowGet(this, 'goToday');
  }

  set label(str) {
    this.#label.textContent = str;
  }
}

customElements.define('calendar-nav', CalendarNav);
