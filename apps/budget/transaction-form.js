import { FlowSource, flowGet, flowWatch, flowThrough, flowCompute, startFlowDevtools } from '../../lib/FlowState.js';


const CSS = String.raw;
const HTML = String.raw;

const styles = CSS`
  :host {
    display: block;
    background: white;
    border-radius: 12px;
    padding: 20px 22px;
    box-shadow: 0 1px 4px rgba(0,0,0,0.08);
  }
  h2 {
    margin: 0 0 14px;
    font-size: 14px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: #6b7280;
  }
  .grid {
    display: grid;
    grid-template-columns: 2fr 1fr 1fr 1fr;
    gap: 8px;
    align-items: end;
  }
  input, select {
    width: 100%;
    padding: 9px 12px;
    border: 1px solid #d1d5db;
    border-radius: 8px;
    font-size: 14px;
    font-family: inherit;
    outline: none;
    box-sizing: border-box;
    transition: border-color 0.15s;
    background: white;
  }
  input:focus, select:focus { border-color: #6366f1; box-shadow: 0 0 0 3px rgba(99,102,241,0.1); }
  label {
    font-size: 11px;
    font-weight: 600;
    color: #6b7280;
    display: block;
    margin-bottom: 4px;
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }
  .field { display: flex; flex-direction: column; }
  button {
    padding: 9px 20px;
    background: #6366f1;
    color: white;
    border: none;
    border-radius: 8px;
    font-size: 14px;
    font-weight: 600;
    cursor: pointer;
    transition: background 0.15s;
    white-space: nowrap;
    font-family: inherit;
  }
  button:hover { background: #4f46e5; }
  .error {
    color: #dc2626;
    font-size: 12px;
    margin-top: 8px;
    min-height: 16px;
  }
`;

const sheet = new CSSStyleSheet();
sheet.replaceSync(styles);

const template = document.createElement('template');
template.innerHTML = HTML`
  <h2>New Transaction</h2>
  <div class="grid">
    <div class="field">
      <label for="desc">Description</label>
      <input id="desc" type="text" placeholder="e.g. Monthly rent">
    </div>
    <div class="field">
      <label for="amount">Amount</label>
      <input id="amount" type="number" placeholder="0.00" min="0.01" step="0.01">
    </div>
    <div class="field">
      <label for="type">Type</label>
      <select id="type">
        <option value="expense">Expense</option>
        <option value="income">Income</option>
      </select>
    </div>
    <div class="field">
      <label for="category">Category</label>
      <input id="category" type="text" placeholder="e.g. Food">
    </div>
  </div>
  <div class="error" id="err"></div>
  <button type="button">Add Transaction</button>
`;


export class TransactionForm extends HTMLElement {
  #addTransaction = () => {};
  #desc;
  #amount;
  #type;
  #category;
  #err;
  #submitBtn;

  constructor() {
    super();
    const shadow = this.attachShadow({ mode: 'open' });
    shadow.appendChild(template.content.cloneNode(true));
    shadow.adoptedStyleSheets = [sheet];

    this.#desc     = shadow.getElementById('desc');
    this.#amount   = shadow.getElementById('amount');
    this.#type     = shadow.getElementById('type');
    this.#category = shadow.getElementById('category');
    this.#err      = shadow.getElementById('err');
    this.#submitBtn = shadow.querySelector('button');

    this.#submitBtn.addEventListener('click', () => this.#submit());
    shadow.addEventListener('keydown', (e) => { if (e.key === 'Enter') this.#submit(); });
  }

  connectedCallback() {
    this.#addTransaction = flowGet(this, 'addTransaction');
  }

  #submit() {
    this.#err.textContent = '';
    if (!this.#desc.value.trim()) { this.#err.textContent = 'Description is required.'; return; }
    if (!this.#amount.value || parseFloat(this.#amount.value) <= 0) { this.#err.textContent = 'Enter a valid amount.'; return; }

    this.#addTransaction?.({
      description: this.#desc.value.trim(),
      amount:      parseFloat(this.#amount.value),
      type:        this.#type.value,
      category:    this.#category.value.trim() || 'General',
    });

    this.#desc.value = this.#amount.value = this.#category.value = '';
    this.#type.value = 'expense';
    this.#desc.focus();
  }
}

customElements.define('transaction-form', TransactionForm);
