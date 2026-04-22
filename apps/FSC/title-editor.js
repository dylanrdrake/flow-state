import { FlowState } from '../../index.js';

FlowState.devtools();

const HTML = String.raw;

const template = document.createElement('template');
template.innerHTML = HTML`
  <style>
    button {
      margin-top: 14px;
      width: fit-content;
      border: 1px solid #1e293b;
      background: #1e293b;
      color: #fff;
      border-radius: 10px;
      padding: 8px 12px;
      cursor: pointer;
      font: inherit;
    }

    button:hover {
      background: #0f172a;
    }
  </style>

  <section class="card">
    <input id="title-input" type="text" placeholder="Enter new title..." />
    <button id="update-btn" type="button">Save</button>
  </section>
`;


class TitleEditor extends HTMLElement {
  #shadow;
  #titleInput;
  #updateBtn;
  #updateTitleHook = () => {};

  constructor() {
    super();

    this.#shadow = this.attachShadow({ mode: 'open' });
    this.#shadow.appendChild(template.content.cloneNode(true));

    this.#titleInput = this.#shadow.querySelector('#title-input');
    this.#updateBtn = this.#shadow.querySelector('#update-btn');

    this.#updateBtn.addEventListener('click', () => {
      this.#updateTitleHook(this.#titleInput.value);
      this.#titleInput.value = '';
    });
  }

  connectedCallback() {
    FlowState.get(this.#shadow, 'changeTitle').then(fn => {
      this.#updateTitleHook = fn;
    });
  }
}

customElements.define('title-editor', TitleEditor);
