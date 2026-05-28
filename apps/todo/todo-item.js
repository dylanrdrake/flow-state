import { flowGet } from '../../lib/FlowState.js';


const HTML = String.raw;
const CSS = String.raw;

const styles = CSS`
  :host {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 10px 0;
    border-bottom: 1px solid #e5e7eb;
  }

  input[type="checkbox"] {
    width: 18px;
    height: 18px;
    cursor: pointer;
    accent-color: #6366f1;
    flex-shrink: 0;
  }

  label {
    flex: 1;
    font-size: 15px;
    cursor: pointer;
    word-break: break-word;
    transition: color 0.2s;
  }

  :host([done]) label {
    text-decoration: line-through;
    color: #9ca3af;
  }

  button {
    background: none;
    border: none;
    cursor: pointer;
    color: #d1d5db;
    font-size: 20px;
    line-height: 1;
    padding: 0 2px;
    transition: color 0.15s;
    flex-shrink: 0;
  }

  button:hover {
    color: #ef4444;
  }
`;

const sheet = new CSSStyleSheet();
sheet.replaceSync(styles);

const template = document.createElement('template');
template.innerHTML = HTML`
  <input type="checkbox" id="todo-cb">
  <label for="todo-cb"></label>
  <button title="Delete">×</button>
`;


export class TodoItem extends HTMLElement {
  #doneCheckbox;
  #label;
  #deleteBtn;
  #toggleTodoDone = () => {};
  #deleteTodo = () => {};

  constructor(todo) {
    super();
    const shadow = this.attachShadow({ mode: 'open' });
    shadow.appendChild(template.content.cloneNode(true));
    shadow.adoptedStyleSheets = [sheet];

    this.#doneCheckbox = shadow.getElementById('todo-cb');
    this.#doneCheckbox.checked = todo.done;
    this.#doneCheckbox.id = `todo-cb-${todo.id}`;

    this.#label = shadow.querySelector('label');
    this.#label.htmlFor = `todo-cb-${todo.id}`;
    this.#label.textContent = todo.text;

    this.#deleteBtn = shadow.querySelector('button');

    if (todo.done) this.setAttribute('done', '');

    this.#doneCheckbox.addEventListener('change', () => {
      this.#toggleTodoDone?.(todo.id);
    });

    this.#deleteBtn.addEventListener('click', () => {
      this.#deleteTodo?.(todo.id);
    });
  }

  connectedCallback() {
    this.#toggleTodoDone = flowGet(this, 'toggleTodo');
    this.#deleteTodo = flowGet(this, 'deleteTodo');
  }
}

customElements.define('todo-item', TodoItem);
