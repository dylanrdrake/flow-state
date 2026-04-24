import { FlowState } from 'flow-state';

const HTML = String.raw;
const CSS = String.raw;

const styles = CSS`
  :host {
    display: block;
  }

  .card {
    background: #0f172a;
    border: 1px solid #334155;
    border-radius: 9px;
    padding: 10px 12px;
    cursor: pointer;
    transition: border-color 0.12s, box-shadow 0.12s;
    user-select: none;
  }

  .card:hover {
    border-color: #6366f1;
  }

  :host([selected]) .card {
    border-color: #6366f1;
    box-shadow: 0 0 0 2px rgba(99, 102, 241, 0.35);
  }

  .card-title {
    font-size: 13px;
    font-weight: 600;
    color: #e2e8f0;
    margin-bottom: 4px;
  }

  .card-desc {
    font-size: 12px;
    color: #64748b;
    line-height: 1.4;
    white-space: pre-wrap;
    display: -webkit-box;
    -webkit-line-clamp: 5;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }

  .card-actions {
    position: absolute;
    top: 7px;
    right: 7px;
    display: none;
    gap: 2px;
  }

  .card:hover .card-actions,
  :host([selected]) .card .card-actions {
    display: flex;
  }

  .card-actions button {
    background: none;
    border: none;
    cursor: pointer;
    padding: 3px 4px;
    line-height: 1;
    border-radius: 4px;
    font-size: 13px;
  }

  .edit-btn  { color: #64748b; }
  .edit-btn:hover  { color: #a5b4fc; background: rgba(165,180,252,0.1); }
  .delete-btn { color: #64748b; }
  .delete-btn:hover { color: #ef4444; background: rgba(239,68,68,0.1); }
`;

const sheet = new CSSStyleSheet();
sheet.replaceSync(styles);

const template = document.createElement('template');
template.innerHTML = HTML`
  <div class="card" style="position:relative">
    <div class="card-actions">
      <button class="edit-btn" title="Edit card">✏️</button>
      <button class="delete-btn" title="Delete card">✕</button>
    </div>
    <div class="card-title" id="title"></div>
    <div class="card-desc" id="desc"></div>
  </div>
`;

class KanbanCard extends HTMLElement {
  #shadow;
  #titleEl;
  #descEl;
  #editBtn;
  #deleteBtn;
  #cardId;
  #columnId;
  #cardData = null;
  #selectCard = () => {};
  #deleteCard = () => {};
  #editCard = () => {};

  constructor() {
    super();
    this.#shadow = this.attachShadow({ mode: 'open' });
    this.#shadow.adoptedStyleSheets = [sheet];
    this.#shadow.appendChild(template.content.cloneNode(true));

    this.#titleEl  = this.#shadow.getElementById('title');
    this.#descEl   = this.#shadow.getElementById('desc');
    this.#editBtn   = this.#shadow.querySelector('.edit-btn');
    this.#deleteBtn = this.#shadow.querySelector('.delete-btn');
  }

  connectedCallback() {
    this.#cardId   = Number(this.dataset.cardId);
    this.#columnId = this.dataset.columnId;

    // Get hooks from the nearest parent scope (KanbanColumn or KanbanApp)
    this.#deleteCard = FlowState.get(this, 'deleteCard');
    this.#selectCard = FlowState.get(this, 'selectCard');
    this.#editCard   = FlowState.get(this, 'editCard');

    // Watch the parent column's local `columnData` to get this card's data.
    // KanbanColumn owns columnData in its own FlowState scope.
    FlowState.watch(this, 'columnData', (columnData) => {
      const card = columnData?.cards?.find(c => c.id === this.#cardId);
      if (!card) return;
      this.#cardData = card;
      this.#titleEl.textContent = card.title;
      this.#descEl.textContent  = card.desc || '';
    });

    // Watch global selectedCard from KanbanApp to toggle selected attribute
    FlowState.watch(this, 'selectedCardId', (selectedCardId) => {
      this.toggleAttribute('selected', selectedCardId === this.#cardId);
    });

    this.#shadow.querySelector('.card').addEventListener('click', (e) => {
      e.stopPropagation();
      this.#selectCard?.(this.#cardId);
    });

    this.#editBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.#editCard?.(this.#cardData, this.#columnId);
    });

    this.#deleteBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      const title = this.#cardData?.title ? `"${this.#cardData.title}"` : 'this card';
      if (!confirm(`Delete ${title}? This cannot be undone.`)) return;
      this.#deleteCard?.(this.#cardId, this.#columnId);
    });
  }
}

customElements.define('kanban-card', KanbanCard);
