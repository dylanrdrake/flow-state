import { FlowState, FlowStateComponent } from 'flow-state';
import './kanban-card.js';

const HTML = String.raw;
const CSS = String.raw;

class KanbanColumn extends FlowStateComponent {
  #columnId = null; // set from dataset by parent
  #cardsList = null;
  #colTitle = null;
  #cardCount = null;

  shadowMode = 'open';

  styles = CSS`
    :host {
      display: flex;
      flex-direction: column;
      width: 272px;
      flex-shrink: 0;
      background: #1e293b;
      border-radius: 12px;
      border: 1px solid #334155;
      max-height: calc(100vh - 100px);
    }

    .column-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 12px 14px 10px;
      border-bottom: 1px solid #334155;
      flex-shrink: 0;
    }

    .column-title {
      font-size: 13px;
      font-weight: 600;
      color: #94a3b8;
      text-transform: uppercase;
      letter-spacing: 0.07em;
    }

    .card-count {
      font-size: 12px;
      color: #475569;
      background: #0f172a;
      border-radius: 10px;
      padding: 1px 8px;
      font-variant-numeric: tabular-nums;
    }

    .cards-list {
      display: flex;
      flex-direction: column;
      gap: 8px;
      padding: 10px;
      overflow-y: auto;
      flex: 1;
    }

    .cards-list::-webkit-scrollbar { width: 4px; }
    .cards-list::-webkit-scrollbar-track { background: transparent; }
    .cards-list::-webkit-scrollbar-thumb { background: #334155; border-radius: 2px; }

    .empty {
      font-size: 12px;
      color: #475569;
      text-align: center;
      padding: 20px 0;
    }
  `;

  template = HTML`
    <div class="column-header">
      <span class="column-title" id="col-title"></span>
      <span class="card-count" id="card-count">0</span>
    </div>
    <div class="cards-list" id="cards-list"></div>
  `;

  // Local state: which card in this column is selected, and the full columns list
  // (needed to populate the move-target select and render cards).
  flowConfig = {
    init: {
      columnData: null,    // { id, title, cards[] } — set by parent watcher
      selectedCardId: null,
    },
    options: { label: 'KanbanColumn' }
  };


  connectedCallback() {
    super.connectedCallback();

    this.#columnId = this.dataset.columnId;
    const shadow = this.shadowRoot;
    this.#cardsList  = shadow.getElementById('cards-list');
    this.#colTitle   = shadow.getElementById('col-title');
    this.#cardCount  = shadow.getElementById('card-count');

    // Get shared hooks from parent KanbanApp scope
    const moveCard   = FlowState.get(this, 'moveCard');
    const deleteCard = FlowState.get(this, 'deleteCard');
    const selectCard = FlowState.get(this, 'selectCard');

    // Watch the full columns list from the parent to extract this column's data
    // and keep the move-target selector up to date.
    FlowState.watch(this, 'columns', this.#render.bind(this));
  }

  #render(columns) {
    const col = columns?.find(c => c.id === this.#columnId);
    if (!col) return;

    // Update local columnData so kanban-cards can watch it
    this.state.update({ columnData: col });

    // Update header
    this.#colTitle.textContent  = col.title;
    this.#cardCount.textContent = col.cards.length;

    // Sync kanban-card elements
    const existing = new Map(
      [...this.#cardsList.querySelectorAll('kanban-card')].map(el => [Number(el.dataset.cardId), el])
    );

    // Remove cards no longer in this column
    for (const [id, el] of existing) {
      if (!col.cards.find(c => c.id === id)) el.remove();
    }

    if (col.cards.length === 0) {
      if (!this.#cardsList.querySelector('.empty')) {
        this.#cardsList.innerHTML = '<p class="empty">No cards</p>';
      }
    } else {
      const emptyEl = this.#cardsList.querySelector('.empty');
      if (emptyEl) emptyEl.remove();

      col.cards.forEach((card, i) => {
        let el = existing.get(card.id);
        if (!el) {
          el = document.createElement('kanban-card');
          el.dataset.cardId = card.id;
          el.dataset.columnId = this.#columnId;
          this.#cardsList.appendChild(el);
        }
        if (this.#cardsList.children[i] !== el) this.#cardsList.insertBefore(el, this.#cardsList.children[i]);
      });
    }
  }
}

customElements.define('kanban-column', KanbanColumn);
