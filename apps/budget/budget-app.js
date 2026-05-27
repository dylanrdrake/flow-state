import { FlowState as Flow } from '../../lib/FlowState.js';
import './budget-summary-card.js';
import { TransactionItem } from './transaction-item.js';
import './transaction-form.js';

Flow.startFlowDevtools();

const CSS = String.raw;
const HTML = String.raw;


// ===========
//  BudgetApp
// ===========

const appCSS = CSS`
  :host {
    display: block;
    max-width: 820px;
    margin: 40px auto;
    padding: 0 24px 60px;
    font-family: system-ui, sans-serif;
    color: #111827;
  }
  header {
    display: flex;
    align-items: baseline;
    gap: 10px;
    margin-bottom: 24px;
  }
  h1 {
    font-size: 1.8rem;
    font-weight: 800;
    margin: 0;
    color: #1f2937;
  }
  h1 span { color: #6366f1; }
  .subtitle {
    font-size: 13px;
    color: #9ca3af;
  }

  .summary-row {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 14px;
    margin-bottom: 20px;
  }

  transaction-form {
    display: block;
    margin-bottom: 20px;
  }

  .panel {
    background: white;
    border-radius: 12px;
    padding: 20px 22px;
    box-shadow: 0 1px 4px rgba(0,0,0,0.08);
  }
  .panel-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 16px;
    gap: 12px;
    flex-wrap: wrap;
  }
  .panel-title {
    font-size: 14px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: #6b7280;
    flex-shrink: 0;
  }
  .controls {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
  }
  .filters {
    display: flex;
    gap: 4px;
  }
  .filter-btn {
    padding: 4px 12px;
    border: 1px solid #e5e7eb;
    border-radius: 20px;
    background: white;
    font-size: 12px;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.12s;
    font-family: inherit;
    color: #6b7280;
  }
  .filter-btn:hover { border-color: #6366f1; color: #6366f1; }
  .filter-btn[active] { background: #6366f1; border-color: #6366f1; color: white; }

  #sort-select {
    padding: 4px 10px;
    border: 1px solid #e5e7eb;
    border-radius: 8px;
    font-size: 12px;
    font-family: inherit;
    color: #6b7280;
    background: white;
    cursor: pointer;
    outline: none;
  }

  #tx-list { min-height: 60px; }

  #empty-msg {
    text-align: center;
    color: #9ca3af;
    padding: 32px 0;
    font-size: 14px;
    display: block;
  }

  #tx-count {
    font-size: 12px;
    color: #9ca3af;
    margin-left: auto;
  }
`;
const appSheet = new CSSStyleSheet();
appSheet.replaceSync(appCSS);

// flow-watch-{key}-to-prop bindings set properties on budget-summary-card elements.
// The value passed is the computed object { total, count, label }.
const appTemplate = document.createElement('template');
appTemplate.innerHTML = HTML`
  <header>
    <h1>Budget <span>Tracker</span></h1>
    <span class="subtitle">Personal finance at a glance</span>
  </header>

  <div class="summary-row">
    <budget-summary-card label="Net Balance"
      flow-watch-balanceSummary-to-prop="amount">
    </budget-summary-card>
    <budget-summary-card label="Total Income" type="income"
      flow-watch-incomeSummary-to-prop="amount">
    </budget-summary-card>
    <budget-summary-card label="Total Expenses" type="expense"
      flow-watch-expenseSummary-to-prop="amount">
    </budget-summary-card>
  </div>

  <transaction-form></transaction-form>

  <div class="panel">
    <div class="panel-header">
      <span class="panel-title">Transactions</span>
      <div class="controls">
        <div class="filters">
          <button class="filter-btn" data-filter="all" active>All</button>
          <button class="filter-btn" data-filter="income">Income</button>
          <button class="filter-btn" data-filter="expense">Expenses</button>
        </div>
        <select id="sort-select">
          <option value="date-desc">Newest first</option>
          <option value="date-asc">Oldest first</option>
          <option value="amount-desc">Highest amount</option>
          <option value="amount-asc">Lowest amount</option>
        </select>
      </div>
      <span id="tx-count"></span>
    </div>
    <div id="tx-list"></div>
    <template flow-if="showEmptyMessage">
      <p id="empty-msg">No transactions to show.</p>
    </template>
  </div>
`;

const agoDays = (n) => new Date(Date.now() - n * 86_400_000).toISOString();

class BudgetApp extends HTMLElement {
  #state;
  #txList;
  #txCount;
  #filters;
  #filterBtns;
  #sortSelect;

  constructor() {
    super();
    const shadow = this.attachShadow({ mode: 'closed' });
    shadow.adoptedStyleSheets = [appSheet];

    this.#state = Flow.create(this, {

        transactions: [
          { id: 1,  description: 'Monthly salary',    amount: 4200,  type: 'income',  category: 'Work',         date: agoDays(14) },
          { id: 2,  description: 'Rent',              amount: 1350,  type: 'expense', category: 'Housing',      date: agoDays(13) },
          { id: 3,  description: 'Grocery run',       amount: 134.5, type: 'expense', category: 'Food',         date: agoDays(10) },
          { id: 4,  description: 'Freelance project', amount: 950,   type: 'income',  category: 'Work',         date: agoDays(8)  },
          { id: 5,  description: 'Electricity bill',  amount: 92,    type: 'expense', category: 'Utilities',    date: agoDays(7)  },
          { id: 6,  description: 'Dinner out',        amount: 67,    type: 'expense', category: 'Food',         date: agoDays(5)  },
          { id: 7,  description: 'Gym membership',    amount: 45,    type: 'expense', category: 'Health',       date: agoDays(4)  },
          { id: 8,  description: 'Dividend payout',   amount: 310,   type: 'income',  category: 'Investments',  date: agoDays(2)  },
          { id: 9,  description: 'Internet bill',     amount: 60,    type: 'expense', category: 'Utilities',    date: agoDays(1)  },
          { id: 10, description: 'Coffee & snacks',   amount: 28.5,  type: 'expense', category: 'Food',         date: agoDays(0)  },
        ],

        filter: 'all',
        sort: 'date-desc',

        // --- Computed values ---

        // Filtered + sorted slice of transactions for the list view
        filteredTransactions: Flow.compute((transactions, filter, sort) => {
          let txs = filter === 'all'
            ? transactions
            : transactions.filter(t => t.type === filter);

          return [...txs].sort((a, b) => {
            switch (sort) {
              case 'date-asc':    return new Date(a.date) - new Date(b.date);
              case 'amount-desc': return b.amount - a.amount;
              case 'amount-asc':  return a.amount - b.amount;
              default:            return new Date(b.date) - new Date(a.date);
            }
          });
        }, ['transactions', 'filter', 'sort']),

        // Objects consumed by budget-summary-card's `amount` setter
        balanceSummary: Flow.compute((transactions) => ({
          total: transactions.reduce((sum, t) => t.type === 'income' ? sum + t.amount : sum - t.amount, 0),
          count: transactions.length,
          label: 'transactions total',
        }), ['transactions']),

        incomeSummary: Flow.compute((transactions) => {
          const txs = transactions.filter(t => t.type === 'income');
          return { total: txs.reduce((sum, t) => sum + t.amount, 0), count: txs.length, label: 'income entries' };
        }, ['transactions']),

        expenseSummary: Flow.compute((transactions) => {
          const txs = transactions.filter(t => t.type === 'expense');
          return { total: txs.reduce((sum, t) => sum + t.amount, 0), count: txs.length, label: 'expense entries' };
        }, ['transactions']),

        showEmptyMessage: Flow.compute((filteredTxs) => filteredTxs.length === 0, ['filteredTransactions']),

      addTransaction:    this.#addTransaction.bind(this),
      deleteTransaction: this.#deleteTransaction.bind(this),
    });

    shadow.appendChild(appTemplate.content.cloneNode(true));
    this.#txList    = shadow.getElementById('tx-list');
    this.#txCount   = shadow.getElementById('tx-count');
    this.#filters   = shadow.querySelector('.filters');
    this.#filterBtns = shadow.querySelectorAll('.filter-btn');
    this.#sortSelect = shadow.getElementById('sort-select');

    // Pierce the closed shadow so child components can reach state
    this.#state.through(shadow);

    // Re-render list when filtered/sorted set changes
    this.#state.watch('filteredTransactions', (txs) => {
      this.#txCount.textContent = `${txs.length} item${txs.length !== 1 ? 's' : ''}`;
      this.#txList.replaceChildren(...txs.map(tx => new TransactionItem(tx)));
    });

    // Filter buttons
    this.#filters.addEventListener('click', (e) => {
      const filter = e.target.dataset.filter;
      if (!filter) return;
      this.#filterBtns.forEach(btn => btn.toggleAttribute('active', btn.dataset.filter === filter));
      this.#state.update({ filter });
    });

    // Sort select
    this.#sortSelect.addEventListener('change', (e) => {
      this.#state.update({ sort: e.target.value });
    });
  }

  #addTransaction({ description, amount, type, category }) {
    this.#state.update(prev => ({
      transactions: [
        ...prev.transactions,
        { id: Date.now(), description, amount, type, category, date: new Date().toISOString() },
      ],
    }));
  }

  #deleteTransaction(id) {
    this.#state.update(prev => ({
      transactions: prev.transactions.filter(t => t.id !== id),
    }));
  }
}

customElements.define('budget-app', BudgetApp);
