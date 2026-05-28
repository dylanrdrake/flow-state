import { FlowSource, flowGet, flowWatch, flowThrough, flowCompute, startFlowDevtools } from '../../lib/FlowState.js';


const CSS = String.raw;
const HTML = String.raw;

const styles = CSS`
  :host {
    display: flex;
    align-items: center;
    gap: 14px;
    padding: 12px 0;
    border-bottom: 1px solid #f3f4f6;
    animation: slide-in 0.15s ease;
  }
  @keyframes slide-in {
    from { opacity: 0; transform: translateY(-4px); }
    to   { opacity: 1; transform: translateY(0); }
  }
  .indicator {
    width: 4px;
    align-self: stretch;
    border-radius: 4px;
    flex-shrink: 0;
    background: #d1d5db;
  }
  :host([type="income"])  .indicator { background: #16a34a; }
  :host([type="expense"]) .indicator { background: #dc2626; }

  .body {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
  }
  .description {
    font-size: 14px;
    font-weight: 500;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    color: #111827;
  }
  .meta {
    font-size: 12px;
    color: #9ca3af;
  }
  .category-tag {
    display: inline-block;
    padding: 1px 7px;
    background: #f3f4f6;
    border-radius: 10px;
    font-size: 11px;
    font-weight: 500;
    color: #6b7280;
    margin-left: 4px;
  }
  .amount {
    font-size: 14px;
    font-weight: 600;
    flex-shrink: 0;
    font-variant-numeric: tabular-nums;
  }
  :host([type="income"])  .amount { color: #16a34a; }
  :host([type="expense"]) .amount { color: #dc2626; }

  .actions {
    display: flex;
    gap: 4px;
    flex-shrink: 0;
  }
  button {
    background: none;
    border: none;
    cursor: pointer;
    padding: 4px 6px;
    border-radius: 6px;
    font-size: 14px;
    color: #d1d5db;
    transition: background 0.12s, color 0.12s;
  }
  button:hover { background: #fee2e2; color: #ef4444; }
`;

const sheet = new CSSStyleSheet();
sheet.replaceSync(styles);

const template = document.createElement('template');
template.innerHTML = HTML`
  <div class="indicator"></div>
  <div class="body">
    <div class="description"></div>
    <div class="meta"><span class="date"></span><span class="category-tag"></span></div>
  </div>
  <div class="amount"></div>
  <div class="actions">
    <button title="Delete">✕</button>
  </div>
`;


export class TransactionItem extends HTMLElement {
  #deleteTransaction = () => {};
  #deleteBtn;

  constructor(tx) {
    super();
    this.setAttribute('type', tx.type);

    const shadow = this.attachShadow({ mode: 'open' });
    shadow.appendChild(template.content.cloneNode(true));
    shadow.adoptedStyleSheets = [sheet];

    const sign   = tx.type === 'income' ? '+' : '−';
    const fmt    = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });
    const fmtAmt = fmt.format(Math.abs(tx.amount));
    const date   = new Date(tx.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

    shadow.querySelector('.description').textContent  = tx.description;
    shadow.querySelector('.date').textContent         = date;
    shadow.querySelector('.category-tag').textContent = tx.category;
    shadow.querySelector('.amount').textContent       = `${sign} ${fmtAmt}`;

    this.#deleteBtn = shadow.querySelector('button');

    this.#deleteBtn.addEventListener('click', () => {
      this.#deleteTransaction?.(tx.id);
    });
  }

  connectedCallback() {
    this.#deleteTransaction = flowGet(this, 'deleteTransaction');
  }
}

customElements.define('transaction-item', TransactionItem);
