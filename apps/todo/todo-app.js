import { FlowState as Flow } from '../../lib/FlowState.js';
import { TodoItem } from './todo-item.js';

Flow.devtools();

const CSS = String.raw;
const HTML = String.raw;

const styles = CSS`
  :host {
    display: block;
    max-width: 520px;
    margin: 48px auto;
    font-family: system-ui, sans-serif;
    color: #111827;
  }

  h1 {
    text-align: center;
    font-size: 2.5rem;
    font-weight: 700;
    color: #6366f1;
    margin: 0 0 24px;
    letter-spacing: -1px;
  }

  #input-row {
    display: flex;
    gap: 8px;
    margin-bottom: 16px;
  }

  #new-todo {
    flex: 1;
    padding: 10px 14px;
    font-size: 15px;
    border: 1px solid #d1d5db;
    border-radius: 8px;
    outline: none;
    transition: border-color 0.15s;
  }

  #new-todo:focus {
    border-color: #6366f1;
  }

  #add-btn {
    padding: 10px 20px;
    background: #6366f1;
    color: white;
    border: none;
    border-radius: 8px;
    font-size: 15px;
    font-weight: 600;
    cursor: pointer;
    transition: background 0.15s;
  }

  #add-btn:hover {
    background: #4f46e5;
  }

  #filters {
    display: flex;
    gap: 6px;
    margin-bottom: 8px;
  }

  .filter-btn {
    padding: 5px 14px;
    border: 1px solid #d1d5db;
    border-radius: 20px;
    background: white;
    font-size: 13px;
    cursor: pointer;
    transition: all 0.15s;
  }

  .filter-btn:hover {
    border-color: #6366f1;
    color: #6366f1;
  }

  .filter-btn[active] {
    background: #6366f1;
    border-color: #6366f1;
    color: white;
  }

  #todo-list {
    min-height: 40px;
  }

  #empty-msg {
    text-align: center;
    color: #9ca3af;
    padding: 24px 0;
    font-size: 14px;
    display: none;
  }

  #empty-msg[visible] {
    display: block;
  }

  #footer {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding-top: 12px;
    font-size: 13px;
    color: #6b7280;
  }

  #clear-done-btn {
    background: none;
    border: none;
    color: #6b7280;
    cursor: pointer;
    font-size: 13px;
    padding: 0;
    transition: color 0.15s;
  }

  #clear-done-btn:hover {
    color: #ef4444;
  }
`;

const template = document.createElement('template');
template.innerHTML = HTML`
  <h1>todos</h1>

  <div id="input-row">
    <input id="new-todo" type="text" placeholder="What needs to be done?">
    <button id="add-btn">Add</button>
  </div>

  <div id="filters">
    <button class="filter-btn" data-filter="all" active>All</button>
    <button class="filter-btn" data-filter="active">Active</button>
    <button class="filter-btn" data-filter="done">Done</button>
  </div>

  <div id="todo-list"></div>
  <p id="empty-msg">Nothing here yet!</p>

  <div id="footer">
    <span><span id="active-count" flow-watch-activeCount-to-prop="textContent"></span> remaining</span>
    <button id="clear-done-btn">Clear done</button>
  </div>
`;

const sheet = new CSSStyleSheet();
sheet.replaceSync(styles);


class TodoApp extends HTMLElement {
  #state;
  #input;
  #addBtn;
  #todoList;
  #emptyMsg;
  #filters;
  #filterBtns;
  #clearDoneBtn;
  #currentFilter = 'all';

  constructor() {
    super();
    const shadow = this.attachShadow({ mode: 'closed' });
    shadow.appendChild(template.content.cloneNode(true));
    shadow.adoptedStyleSheets = [sheet];

    this.#input    = shadow.getElementById('new-todo');
    this.#addBtn   = shadow.getElementById('add-btn');
    this.#todoList = shadow.getElementById('todo-list');
    this.#emptyMsg = shadow.getElementById('empty-msg');
    this.#filters  = shadow.getElementById('filters');
    this.#filterBtns = shadow.querySelectorAll('.filter-btn');
    this.#clearDoneBtn = shadow.getElementById('clear-done-btn');

    this.#state = Flow.create(this, {
      state: {
        todos: [],
        filter: 'all',

        // Recomputes whenever todos or filter changes
        filteredTodos: (state) => {
          if (state.filter === 'active') return state.todos.filter(t => !t.done);
          if (state.filter === 'done')   return state.todos.filter(t => t.done);
          return state.todos;
        },

        // DOM-bound via flow-watch-activeCount-to-prop
        activeCount: (state) => state.todos.filter(t => !t.done).length,
      },
      hooks: {
        toggleTodo: this.#toggleTodo.bind(this),
        deleteTodo: this.#deleteTodo.bind(this),
      },
    });

    // Pierce the closed shadow root so child components can reach state
    this.#state.through(shadow);

    // Re-render the list whenever the filtered set changes
    this.#state.watch('filteredTodos', (todos) => {
      const items = todos.map(todo => new TodoItem(todo));
      this.#todoList.replaceChildren(...items);
      this.#emptyMsg.toggleAttribute('visible', items.length === 0);
    });

    // Add button
    this.#addBtn.addEventListener('click', this.#submitInput.bind(this));

    // Enter key in input
    this.#input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') this.#submitInput();
    });

    // Filter buttons
    this.#filters.addEventListener('click', (e) => {
      const filter = e.target.dataset.filter;
      if (!filter) return;
      this.#currentFilter = filter;
      this.#filterBtns.forEach(btn => {
        btn.toggleAttribute('active', btn.dataset.filter === filter);
      });
      this.#state.update({ filter });
    });

    // Clear done
    this.#clearDoneBtn.addEventListener('click', () => {
      this.#state.update(prev => ({
        todos: prev.todos.filter(t => !t.done)
      }));
    });
  }

  #submitInput() {
    const text = this.#input.value.trim();
    if (!text) return;
    this.#state.update(prev => ({
      todos: [...prev.todos, { id: Date.now(), text, done: false }]
    }));
    this.#input.value = '';
    this.#input.focus();
  }

  #toggleTodo(id) {
    this.#state.update(prev => ({
      todos: prev.todos.map(t => t.id === id ? { ...t, done: !t.done } : t)
    }));
  }

  #deleteTodo(id) {
    this.#state.update(prev => ({
      todos: prev.todos.filter(t => t.id !== id)
    }));
  }
}

customElements.define('todo-app', TodoApp);
