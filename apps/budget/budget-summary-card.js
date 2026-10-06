const CSS = String.raw;
const HTML = String.raw;

const styles = CSS`
  :host {
    display: flex;
    flex-direction: column;
    gap: 6px;
    background: white;
    border-radius: 12px;
    padding: 18px 22px;
    box-shadow: 0 1px 4px rgba(0,0,0,0.08);
    border-top: 3px solid #e5e7eb;
  }
  :host([type="income"])  { border-top-color: #16a34a; }
  :host([type="expense"]) { border-top-color: #dc2626; }

  .label {
    font-size: 11px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.07em;
    color: #6b7280;
  }
  .amount {
    font-size: 26px;
    font-weight: 700;
    color: #111827;
    font-variant-numeric: tabular-nums;
  }
  :host([type="income"])  .amount { color: #16a34a; }
  :host([type="expense"]) .amount { color: #dc2626; }
  .count {
    font-size: 12px;
    color: #9ca3af;
  }
`;

const sheet = new CSSStyleSheet();
sheet.replaceSync(styles);

const template = document.createElement('template');
template.innerHTML = HTML`
  <div class="label"></div>
  <div class="amount">$0.00</div>
  <div class="count"></div>
`;


export class BudgetSummaryCard extends HTMLElement {
  #amountEl;
  #countEl;

  constructor() {
    super();
    const shadow = this.attachShadow({ mode: 'open' });
    shadow.appendChild(template.content.cloneNode(true));
    shadow.adoptedStyleSheets = [sheet];

    shadow.querySelector('.label').textContent = this.getAttribute('label') ?? '';
    this.#amountEl = shadow.querySelector('.amount');
    this.#countEl  = shadow.querySelector('.count');
  }

  // Called by FlowState when a flow-prop="amount: {key}" binding fires
  set amount({ total, count, label }) {
    const fmt = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });
    this.#amountEl.textContent = fmt.format(total ?? 0);
    this.#countEl.textContent  = count != null ? `${count} ${label ?? 'transactions'}` : '';
  }
}

customElements.define('budget-summary-card', BudgetSummaryCard);
