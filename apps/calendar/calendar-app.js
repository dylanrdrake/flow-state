import { FlowState as Flow } from '../../lib/FlowState.js';
import './calendar-nav.js';
import './calendar-grid.js';
import './calendar-sidebar.js';

Flow.devtools();

const CSS = String.raw;
const HTML = String.raw;

// Format a Date as YYYY-MM-DD in local time
const localDate = (d = new Date()) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

const styles = CSS`
  :host {
    display: flex;
    flex-direction: column;
    height: 100vh;
    font-family: system-ui, sans-serif;
    color: #111827;
    overflow: hidden;
  }
  .main {
    flex: 1;
    display: flex;
    overflow: hidden;
    min-height: 0;
  }
`;

const sheet = new CSSStyleSheet();
sheet.replaceSync(styles);

const appTemplate = document.createElement('template');
appTemplate.innerHTML = HTML`
  <calendar-nav flow-watch-monthLabel-to-prop="label">
  </calendar-nav>
  <div class="main">
    <calendar-grid flow-watch-calendarDays-to-prop="days">
    </calendar-grid>
    <calendar-sidebar
      flow-watch-selectedDayEvents-to-prop="events"
      flow-watch-selectedDate-to-prop="selectedDate"
    >
    </calendar-sidebar>
  </div>
`;

const today = localDate();
const now   = new Date();

// Seed a couple of events on today so the app opens with something to see
const seedEvents = [
  { id: 1, date: today, title: 'Team standup',      color: 'indigo' },
  { id: 2, date: today, title: 'Lunch with Alex',   color: 'green'  },
  { id: 3, date: localDate(new Date(now.getFullYear(), now.getMonth(), now.getDate() + 3)), title: 'Project deadline', color: 'red' },
];


class CalendarApp extends HTMLElement {
  #state;

  constructor() {
    super();
    const shadow = this.attachShadow({ mode: 'closed' });
    shadow.adoptedStyleSheets = [sheet];

    this.#state = Flow.create(this, {

        today,
        viewYear:     now.getFullYear(),
        viewMonth:    now.getMonth(),
        selectedDate: today,
        events:       seedEvents,

        monthLabel: (s) =>
          new Date(s.viewYear, s.viewMonth).toLocaleDateString('en-US', {
            month: 'long', year: 'numeric',
          }),

        // 42-cell (6×7) grid: prev-month overflow, current month, next-month overflow.
        // Each cell carries the date string, display flags, and event dot colors.
        calendarDays: (s) => {
          const { viewYear: yr, viewMonth: mo } = s;
          const firstDayOfWeek = new Date(yr, mo, 1).getDay();
          const daysInMonth    = new Date(yr, mo + 1, 0).getDate();
          const days           = [];

          // Prev-month overflow (day 0 = last day of prev month, day -1 = second-to-last, …)
          for (let i = firstDayOfWeek - 1; i >= 0; i--) {
            days.push({ date: localDate(new Date(yr, mo, -i)), overflow: true, isToday: false, isSelected: false, dots: [] });
          }

          // Current month
          for (let n = 1; n <= daysInMonth; n++) {
            const date         = localDate(new Date(yr, mo, n));
            const eventsOnDay  = s.events.filter(e => e.date === date);
            days.push({
              date,
              overflow:   false,
              isToday:    date === s.today,
              isSelected: date === s.selectedDate,
              dots:       eventsOnDay.slice(0, 3).map(e => e.color),
            });
          }

          // Next-month overflow to reach exactly 42 cells
          const remaining = 42 - days.length;
          for (let n = 1; n <= remaining; n++) {
            days.push({ date: localDate(new Date(yr, mo + 1, n)), overflow: true, isToday: false, isSelected: false, dots: [] });
          }

          return days;
        },

        selectedDayEvents: (s) => s.events.filter(e => e.date === s.selectedDate),

      actions: {

        prevMonth:   this.#prevMonth.bind(this),
        nextMonth:   this.#nextMonth.bind(this),
        goToday:     this.#goToday.bind(this),
        selectDate:  this.#selectDate.bind(this),
        addEvent:    this.#addEvent.bind(this),
        deleteEvent: this.#deleteEvent.bind(this),

      }

    });

    // Let FlowState pierce the closed shadow to find flow-watch attributes
    Flow.through(shadow);

    // Stamp template AFTER FlowState is initialized so that child connectedCallbacks
    // can synchronously resolve Flow.get/watch calls against the listener on `this`.
    shadow.appendChild(appTemplate.content.cloneNode(true));

  }

  #prevMonth() {
    this.#state.update(s => ({
      viewMonth: s.viewMonth === 0 ? 11 : s.viewMonth - 1,
      viewYear:  s.viewMonth === 0 ? s.viewYear - 1 : s.viewYear,
    }));
  }

  #nextMonth() {
    this.#state.update(s => ({
      viewMonth: s.viewMonth === 11 ? 0  : s.viewMonth + 1,
      viewYear:  s.viewMonth === 11 ? s.viewYear + 1 : s.viewYear,
    }));
  }

  #goToday() {
    const now = new Date();
    this.#state.update({ viewYear: now.getFullYear(), viewMonth: now.getMonth(), selectedDate: localDate() });
  }

  #selectDate(date) {
    this.#state.update({ selectedDate: date });
  }

  #addEvent({ title, color, date }) {
    this.#state.update(s => ({
      events: [...s.events, { id: Date.now(), title, color, date }],
    }));
  }

  #deleteEvent(id) {
    this.#state.update(s => ({
      events: s.events.filter(e => e.id !== id),
    }));
  }
}

customElements.define('calendar-app', CalendarApp);
