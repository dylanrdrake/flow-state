import { FlowSource, flowGet, flowWatch, flowThrough, flowCompute, startFlowDevtools } from '../../lib/FlowState.js';


const CSS = String.raw;
const HTML = String.raw;

const COLOR_MAP = {
  indigo: '#6366f1',
  green:  '#16a34a',
  red:    '#dc2626',
  amber:  '#d97706',
  pink:   '#db2777',
};

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const styles = CSS`
  :host {
    display: block;
    flex: 1;
    overflow-y: auto;
    padding: 16px;
    background: #f9fafb;
    min-width: 0;
  }
  .weekdays {
    display: grid;
    grid-template-columns: repeat(7, 1fr);
    gap: 4px;
    margin-bottom: 4px;
  }
  .weekday {
    text-align: center;
    font-size: 11px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: #9ca3af;
    padding: 4px 0;
  }
  .grid {
    display: grid;
    grid-template-columns: repeat(7, 1fr);
    gap: 4px;
  }
  .day {
    aspect-ratio: 1;
    border-radius: 10px;
    border: 1px solid transparent;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: flex-start;
    padding: 6px 4px 4px;
    cursor: pointer;
    transition: background 0.1s;
    min-width: 0;
    box-sizing: border-box;
    gap: 4px;
    background: white;
  }
  .day:hover { background: #f3f4f6; }
  .day.overflow { background: transparent; opacity: 0.35; }
  .day.overflow:hover { background: #f3f4f6; }
  .day.selected { background: #eef2ff; border-color: #6366f1; }
  .num {
    font-size: 13px;
    font-weight: 500;
    color: #374151;
    width: 26px;
    height: 26px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 50%;
    flex-shrink: 0;
  }
  .day.today .num {
    background: #6366f1;
    color: white;
  }
  .day.selected .num { color: #4f46e5; font-weight: 700; }
  .day.today.selected .num { background: #6366f1; color: white; }
  .dots {
    display: flex;
    gap: 3px;
    justify-content: center;
    flex-wrap: wrap;
    max-width: 100%;
  }
  .dot {
    width: 5px;
    height: 5px;
    border-radius: 50%;
    flex-shrink: 0;
  }
`;

const sheet = new CSSStyleSheet();
sheet.replaceSync(styles);

const weekdaysHTML = WEEKDAYS.map(d => `<div class="weekday">${d}</div>`).join('');

const template = document.createElement('template');
template.innerHTML = HTML`
  <div class="weekdays">${weekdaysHTML}</div>
  <div class="grid" id="grid"></div>
`;


export class CalendarGrid extends HTMLElement {
  #grid;
  #selectDate = () => {};

  constructor() {
    super();
    const shadow = this.attachShadow({ mode: 'open' });
    shadow.appendChild(template.content.cloneNode(true));
    shadow.adoptedStyleSheets = [sheet];

    this.#grid = shadow.getElementById('grid');
  }

  connectedCallback() {
    this.#selectDate = flowGet(this, 'selectDate');
    console.log('CalendarGrid connected, selectDate:', this.#selectDate);
  }

  set days(days) {
    const cells = days.map(day => {
      const cell = document.createElement('div');
      cell.className = [
        'day',
        day.overflow   ? 'overflow' : '',
        day.isToday    ? 'today'    : '',
        day.isSelected ? 'selected' : '',
      ].filter(Boolean).join(' ');

      const num = document.createElement('div');
      num.className = 'num';
      // Parse in local time by appending T00:00:00 without timezone
      num.textContent = new Date(day.date + 'T00:00:00').getDate();
      cell.appendChild(num);

      if (day.dots.length > 0) {
        const dotsEl = document.createElement('div');
        dotsEl.className = 'dots';
        for (const color of day.dots) {
          const dot = document.createElement('div');
          dot.className = 'dot';
          dot.style.background = COLOR_MAP[color] ?? COLOR_MAP.indigo;
          dotsEl.appendChild(dot);
        }
        cell.appendChild(dotsEl);
      }

      cell.addEventListener('click', () => this.#selectDate?.(day.date));
      return cell;
    });

    this.#grid.replaceChildren(...cells);
  }
}

customElements.define('calendar-grid', CalendarGrid);
