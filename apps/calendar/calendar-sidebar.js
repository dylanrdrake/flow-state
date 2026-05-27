import { FlowState as Flow } from '../../lib/FlowState.js';


const CSS = String.raw;
const HTML = String.raw;

const COLOR_MAP = {
  indigo: '#6366f1',
  green:  '#16a34a',
  red:    '#dc2626',
  amber:  '#d97706',
  pink:   '#db2777',
};

const styles = CSS`
  :host {
    display: flex;
    flex-direction: column;
    width: 280px;
    flex-shrink: 0;
    border-left: 1px solid #e5e7eb;
    background: white;
    overflow-y: auto;
  }
  .date-heading {
    padding: 16px 20px 12px;
    font-size: 13px;
    font-weight: 700;
    color: #6b7280;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    border-bottom: 1px solid #f3f4f6;
    flex-shrink: 0;
  }
  .events {
    flex: 1;
    padding: 8px 12px;
    min-height: 60px;
  }
  .event-item {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 10px;
    border-radius: 8px;
    margin-bottom: 4px;
    background: #f9fafb;
  }
  .event-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    flex-shrink: 0;
  }
  .event-title {
    flex: 1;
    font-size: 13px;
    color: #374151;
    font-weight: 500;
    word-break: break-word;
  }
  .del-btn {
    background: none;
    border: none;
    color: #d1d5db;
    cursor: pointer;
    font-size: 13px;
    padding: 0;
    line-height: 1;
    transition: color 0.12s;
    flex-shrink: 0;
  }
  .del-btn:hover { color: #ef4444; }
  #no-events {
    text-align: center;
    color: #d1d5db;
    font-size: 13px;
    padding: 24px 0;
    display: block;
  }
  .form {
    border-top: 1px solid #f3f4f6;
    padding: 14px 12px;
    flex-shrink: 0;
  }
  .form input {
    width: 100%;
    padding: 8px 10px;
    border: 1px solid #d1d5db;
    border-radius: 8px;
    font-size: 13px;
    font-family: inherit;
    outline: none;
    box-sizing: border-box;
    margin-bottom: 8px;
    transition: border-color 0.15s;
  }
  .form input:focus { border-color: #6366f1; box-shadow: 0 0 0 3px rgba(99,102,241,0.1); }
  .color-row {
    display: flex;
    gap: 6px;
    margin-bottom: 10px;
  }
  .color-swatch {
    width: 20px;
    height: 20px;
    border-radius: 50%;
    border: 2px solid transparent;
    cursor: pointer;
    transition: border-color 0.12s, transform 0.12s;
    outline: none;
  }
  .color-swatch[selected] { border-color: #111827; transform: scale(1.2); }
  .add-btn {
    width: 100%;
    padding: 8px;
    background: #6366f1;
    color: white;
    border: none;
    border-radius: 8px;
    font-size: 13px;
    font-weight: 600;
    cursor: pointer;
    font-family: inherit;
    transition: background 0.15s;
  }
  .add-btn:hover { background: #4f46e5; }
  .add-btn:disabled {
    background: #c7d2fe;
    cursor: not-allowed;
  }
`;

const sheet = new CSSStyleSheet();
sheet.replaceSync(styles);

const swatchesHTML = Object.entries(COLOR_MAP).map(([name, hex], i) =>
  `<span class="color-swatch" data-color="${name}" style="background:${hex}" ${i === 0 ? 'selected' : ''} tabindex="0" role="radio" aria-label="${name}"></span>`
).join('');

const template = document.createElement('template');
template.innerHTML = HTML`
  <div class="date-heading" id="date-heading">Select a day</div>
  <div class="events" id="events-list">
    <div id="events-items" flow-list="events">
      <template>
        <div class="event-item" flow-id-to-attr="data-event-id">
          <span class="event-dot" flow-dotStyle-to-attr="style"></span>
          <span class="event-title" flow-title-to-prop="textContent"></span>
          <button class="del-btn" type="button" title="Delete" flow-id-to-attr="data-event-id">✕</button>
        </div>
      </template>
    </div>
    <template flow-if="showNoEvents">
      <p id="no-events">No events</p>
    </template>
  </div>
  <div class="form">
    <input
      id="title-input"
      type="text"
      placeholder="Event title…"
      flow-watch-eventInputValue-to-prop="value"
    />
    <div class="color-row" id="color-row">${swatchesHTML}</div>
    <button class="add-btn" type="button">Add Event</button>
  </div>
`;


export class CalendarSidebar extends HTMLElement {
  #state;
  #dateHeading;
  #eventsList;
  #titleInput;
  #colorRow;
  #addBtn;
  #selectedColor = 'indigo';
  #currentDate = null;
  #addEvent;
  #deleteEvent;

  constructor() {
    super();
    const shadow = this.attachShadow({ mode: 'open' });
    shadow.adoptedStyleSheets = [sheet];

    this.#state = Flow.create(this, {
      eventInputValue: '',
      events: [],
      showNoEvents: Flow.compute((events) => events.length === 0, ['events']),
    });

    shadow.appendChild(template.content.cloneNode(true));

    this.#dateHeading = shadow.getElementById('date-heading');
    this.#eventsList  = shadow.getElementById('events-list');
    this.#titleInput  = shadow.getElementById('title-input');
    this.#colorRow    = shadow.getElementById('color-row');
    this.#addBtn      = shadow.querySelector('.add-btn');

    this.#eventsList.addEventListener('click', (e) => {
      const btn = e.target.closest('.del-btn');
      if (!btn) return;
      const id = Number(btn.getAttribute('data-event-id'));
      if (!Number.isNaN(id)) this.#deleteEvent?.(id);
    });

    this.#colorRow.addEventListener('click', (e) => {
      const swatch = e.target.closest('.color-swatch');
      if (!swatch) return;
      this.#selectedColor = swatch.dataset.color;
      this.#colorRow.querySelectorAll('.color-swatch').forEach(s =>
        s.toggleAttribute('selected', s.dataset.color === this.#selectedColor)
      );
    });

    this.#addBtn.addEventListener('click', () => this.#submit());
    this.#titleInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') this.#submit(); });
    this.#titleInput.addEventListener('input', (e) => {
      this.#state.update({ eventInputValue: e.target.value });
    });
  }

  connectedCallback() {
    this.#addEvent = Flow.get(this, 'addEvent');
    this.#deleteEvent = Flow.get(this, 'deleteEvent');

    Flow.watch(this, 'eventInputValue', (value) => {
      if (value.length > 0) this.#addBtn.removeAttribute('disabled');
      else this.#addBtn.setAttribute('disabled', '');
    });
  }

  #submit() {
    const title = this.#state.get('eventInputValue').trim();
    if (!title || !this.#currentDate) return;
    this.#addEvent?.({ title, color: this.#selectedColor, date: this.#currentDate });
    this.#state.update({ eventInputValue: '' });
  }

  set selectedDate(date) {
    this.#currentDate = date;
    if (!date) { this.#dateHeading.textContent = 'Select a day'; return; }
    const d = new Date(date + 'T00:00:00');
    this.#dateHeading.textContent = d.toLocaleDateString('en-US', {
      weekday: 'long', month: 'long', day: 'numeric',
    });
  }

  set events(events) {
    const nextEvents = (events ?? []).map(ev => ({
      ...ev,
      dotStyle: `background:${COLOR_MAP[ev.color] ?? COLOR_MAP.indigo}`,
    }));
    this.#state.update({ events: nextEvents });
  }
}

customElements.define('calendar-sidebar', CalendarSidebar);
