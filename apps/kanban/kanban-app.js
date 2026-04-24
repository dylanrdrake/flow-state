import { FlowState, FlowStateComponent } from 'flow-state';
import './kanban-column.js';

FlowState.devtools();

const HTML = String.raw;
const CSS = String.raw;

const styles = CSS`
  :host {
      display: flex;
      flex-direction: column;
      height: 100vh;
      background: #0f172a;
      color: #e2e8f0;
      font-family: system-ui, sans-serif;
  }

  header {
      display: flex;
      align-items: center;
      gap: 16px;
      padding: 16px 24px;
      border-bottom: 1px solid #1e293b;
      flex-shrink: 0;
  }

  header h1 {
      font-size: 1.1rem;
      font-weight: 700;
      color: #f1f5f9;
      letter-spacing: -0.3px;
  }

  .new-card-btn {
      margin-left: auto;
      padding: 6px 14px;
      border-radius: 7px;
      border: none;
      background: #6366f1;
      color: #fff;
      font: inherit;
      font-size: 13px;
      font-weight: 600;
      cursor: pointer;
  }

  .new-card-btn:hover { background: #4f46e5; }

  .board {
      display: flex;
      flex-direction: row;
      gap: 16px;
      padding: 20px 24px;
      overflow-x: auto;
      flex: 1;
      align-items: flex-start;
  }

  .board::-webkit-scrollbar { height: 6px; }
  .board::-webkit-scrollbar-track { background: transparent; }
  .board::-webkit-scrollbar-thumb { background: #334155; border-radius: 3px; }

  /* ── Edit modal ─────────────────────────────────────────── */

  .modal-backdrop {
    display: none;
    position: fixed;
    inset: 0;
    background: rgba(0,0,0,0.6);
    z-index: 1000;
    align-items: center;
    justify-content: center;
  }

  .modal-backdrop.open {
    display: flex;
  }

  .modal {
    background: #1e293b;
    border: 1px solid #334155;
    border-radius: 14px;
    padding: 24px;
    width: 480px;
    max-width: calc(100vw - 32px);
    display: flex;
    flex-direction: column;
    gap: 14px;
    box-shadow: 0 24px 60px rgba(0,0,0,0.5);
  }

  .modal h2 {
    font-size: 15px;
    font-weight: 700;
    color: #f1f5f9;
    margin: 0;
  }

  .modal label {
    display: flex;
    flex-direction: column;
    gap: 5px;
    font-size: 12px;
    font-weight: 600;
    color: #64748b;
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  .modal input,
  .modal textarea,
  .modal select {
    padding: 8px 10px;
    border-radius: 7px;
    border: 1px solid #334155;
    background: #0f172a;
    color: #e2e8f0;
    font: inherit;
    font-size: 13px;
    resize: vertical;
  }

  .modal input:focus,
  .modal textarea:focus,
  .modal select:focus {
    outline: none;
    border-color: #6366f1;
  }

  .modal-actions {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
    margin-top: 4px;
  }

  .modal-actions button {
    padding: 7px 18px;
    border-radius: 7px;
    border: none;
    font: inherit;
    font-size: 13px;
    font-weight: 600;
    cursor: pointer;
  }

  .btn-cancel { background: #334155; color: #94a3b8; }
  .btn-cancel:hover { background: #475569; color: #e2e8f0; }
  .btn-save   { background: #6366f1; color: #fff; }
  .btn-save:hover { background: #4f46e5; }
`;

const template = HTML`
  <header>
    <h1>Kanban Board</h1>
    <button class="new-card-btn" id="new-card-btn">+ New Card</button>
  </header>
  <div class="board" id="board"></div>

  <!-- Edit Modal -->
  <div class="modal-backdrop" id="modal-backdrop">
    <div class="modal">
      <h2>Edit Card</h2>
      <label>Title<input id="modal-title" type="text" /></label>
      <label>Description / Notes<textarea id="modal-desc" rows="6"></textarea></label>
      <label>Column<select id="modal-column"></select></label>
      <div class="modal-actions">
        <button class="btn-cancel" id="modal-cancel">Cancel</button>
        <button class="btn-save" id="modal-save">Save</button>
      </div>
    </div>
  </div>
`;


const uid = () => Date.now();

class KanbanApp extends FlowStateComponent {
  #board;
  #newCardBtn;
  // Modal
  #modalBackdrop;
  #modalHeading;
  #modalTitle;
  #modalDesc;
  #modalColumn;
  #editingCard = null; // { card: Card|null, columnId: string }

  shadowMode = 'open';

  styles = styles;

  template = template;

  flowConfig = {
    init: {
      columns: [],
      selectedCard: null,
    },
    hooks: {
      moveCard:   (...args) => this.#moveCard(...args),
      deleteCard: (...args) => this.#deleteCard(...args),
      selectCard: (...args) => this.#selectCard(...args),
      editCard:   (...args) => this.#openModal(...args),
    },
    options: { label: 'KanbanApp' },
  };

  connectedCallback() {
    super.connectedCallback();

    this.#board        = this.shadowRoot.getElementById('board');
    this.#newCardBtn   = this.shadowRoot.getElementById('new-card-btn');
    this.#modalBackdrop = this.shadowRoot.getElementById('modal-backdrop');
    this.#modalHeading  = this.shadowRoot.querySelector('.modal h2');
    this.#modalTitle    = this.shadowRoot.getElementById('modal-title');
    this.#modalDesc     = this.shadowRoot.getElementById('modal-desc');
    this.#modalColumn   = this.shadowRoot.getElementById('modal-column');

    // Close modal on backdrop click
    this.#modalBackdrop.addEventListener('click', (e) => {
      if (e.target === this.#modalBackdrop) this.#closeModal();
    });
    this.shadowRoot.getElementById('modal-cancel').addEventListener('click', () => this.#closeModal());
    this.shadowRoot.getElementById('modal-save').addEventListener('click', () => this.#saveModal());

    // Close on Escape
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') this.#closeModal();
    });

    // Load columns from API, then watch for render
    fetch('/api/kanban')
      .then(r => r.json())
      .then(columns => this.state.update({ columns }))
      .catch(err => console.error('Failed to load kanban data:', err));

    this.state.watch('columns', this.#renderColumns.bind(this));

    this.#newCardBtn.addEventListener('click', () => this.#openModal(null, null));
  }

  #renderColumns(columns) {
    // Sync modal column selector
    const opts = columns.map(c => `<option value="${c.id}">${c.title}</option>`).join('');
    if (this.#modalColumn) {
      const mprev = this.#modalColumn.value;
      this.#modalColumn.innerHTML = opts;
      if (mprev) this.#modalColumn.value = mprev;
    }

    // Sync kanban-column elements
    const existing = new Map(
      [...this.#board.querySelectorAll('kanban-column')].map(el => [el.dataset.columnId, el])
    );

    // Remove columns that no longer exist
    for (const [id, el] of existing) {
      if (!columns.find(c => c.id === id)) el.remove();
    }

    // Add or update columns in order
    columns.forEach((col, i) => {
      let el = existing.get(col.id);
      if (!el) {
        el = document.createElement('kanban-column');
        el.dataset.columnId = col.id;
        this.#board.appendChild(el);
      }
      // Move to correct position if needed
      if (this.#board.children[i] !== el) this.#board.insertBefore(el, this.#board.children[i]);
    });

  }

  #persist() {
    fetch('/api/kanban', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(this.state.get('columns')),
    }).catch(err => console.error('Failed to save kanban data:', err));
  }

  #addCard(columnId, title, desc = '') {
    this.state.update(prev => ({
      columns: prev.columns.map(col =>
        col.id === columnId
          ? { ...col, cards: [...col.cards, { id: uid(), title, desc }] }
          : col
      ),
    })).then(() => this.#persist());
  }

  #moveCard(cardId, fromColumnId, toColumnId) {
    if (fromColumnId === toColumnId) return;
    this.state.update(prev => {
      let card;
      const columns = prev.columns.map(col => {
        if (col.id === fromColumnId) {
          card = col.cards.find(c => c.id === cardId);
          return { ...col, cards: col.cards.filter(c => c.id !== cardId) };
        }
        return col;
      });
      return {
        columns: columns.map(col =>
          col.id === toColumnId ? { ...col, cards: [...col.cards, card] } : col
        ),
      };
    }).then(() => this.#persist());
  }

  #deleteCard(cardId, columnId) {
    this.state.update(prev => ({
      columns: prev.columns.map(col =>
        col.id === columnId
          ? { ...col, cards: col.cards.filter(c => c.id !== cardId) }
          : col
      ),
    })).then(() => this.#persist());
  }

  #openModal(card, columnId) {
    const isNew = card === null;
    // Default to first column when opening for a new card
    const resolvedColumnId = columnId ?? this.state.get('columns')?.[0]?.id ?? '';
    this.#editingCard = { card, columnId: resolvedColumnId };
    this.#modalHeading.textContent = isNew ? 'New Card' : 'Edit Card';
    this.#modalTitle.value = card?.title ?? '';
    this.#modalDesc.value  = card?.desc  ?? '';
    this.#modalColumn.value = resolvedColumnId;
    this.#modalBackdrop.classList.add('open');
    this.#modalTitle.focus();
  }

  #closeModal() {
    this.#editingCard = null;
    this.#modalBackdrop.classList.remove('open');
  }

  #saveModal() {
    if (!this.#editingCard) return;
    const { card, columnId } = this.#editingCard;
    const newTitle    = this.#modalTitle.value.trim();
    const newDesc     = this.#modalDesc.value.trim();
    const newColumnId = this.#modalColumn.value;
    if (!newTitle) return;

    if (card === null) {
      // Creating a new card
      this.#addCard(newColumnId, newTitle, newDesc);
    } else {
      // Editing an existing card
      this.state.update(prev => {
        let movedCard;
        const columns = prev.columns.map(col => {
          if (col.id === columnId) {
            movedCard = { ...col.cards.find(c => c.id === card.id), title: newTitle, desc: newDesc };
            return { ...col, cards: col.cards.filter(c => c.id !== card.id) };
          }
          return col;
        });
        return {
          columns: columns.map(col =>
            col.id === newColumnId
              ? { ...col, cards: [...col.cards, movedCard] }
              : col
          ),
        };
      }).then(() => this.#persist());
    }

    this.#closeModal();
  }

  #selectCard(card) {
    this.state.update({ selectedCard: card });
  }
}

customElements.define('kanban-app', KanbanApp);
