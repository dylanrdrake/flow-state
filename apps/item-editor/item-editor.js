import { FlowState as Flow } from '../../lib/FlowState.js';
const sheet = new CSSStyleSheet();
await sheet.replace(await fetch(new URL('./item-editor.css', import.meta.url)).then(r => r.text()));

const HTML = String.raw;

const template = document.createElement('template');
template.innerHTML = HTML`
  <div id="pane">
    <div id="placeholder">Select a work item to edit.</div>
    <div id="editor" hidden>
      <div id="editor-fields"></div>
      <div class="action-row">
        <button id="save-btn">Save</button>
      </div>
    </div>
  </div>
`;

const STATUS_OPTIONS = ['Active', 'On Hold', 'Planning', 'Complete'];

class ItemEditor extends HTMLElement {
  #state;
  #saveWorkItem;
  #placeholder;
  #editor;
  #editorFields;
  #saveBtn;

  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this.shadowRoot.adoptedStyleSheets = [sheet];
    this.shadowRoot.appendChild(template.content.cloneNode(true));

    this.#placeholder = this.shadowRoot.getElementById('placeholder');
    this.#editor      = this.shadowRoot.getElementById('editor');
    this.#editorFields = this.shadowRoot.getElementById('editor-fields');
    this.#saveBtn     = this.shadowRoot.getElementById('save-btn');

    // Create local FlowState for edits before children connect
    this.#state = Flow.create(this, {
      init: { edits: null },
      options: { label: 'ItemEditor' }
    });

    this.#saveBtn.addEventListener('click', () => {
      const edits = this.#state.get('edits');
      if (edits && this.#saveWorkItem) {
        this.#saveWorkItem(edits);
        this.#saveBtn.textContent = 'Saved!';
        this.#saveBtn.classList.add('saved');
        setTimeout(() => {
          this.#saveBtn.textContent = 'Save';
          this.#saveBtn.classList.remove('saved');
        }, 1500);
      }
    });
  }

  connectedCallback() {
    this.#saveWorkItem = Flow.get(this, 'saveWorkItem');

    Flow.watch(this, 'selectedItem', item => {
      this.#renderEditor(item);
    });
  }

  #renderEditor(item) {
    if (!item) {
      this.#placeholder.hidden = false;
      this.#editor.hidden = true;
      return;
    }

    this.#placeholder.hidden = true;
    this.#editor.hidden = false;
    this.#editorFields.innerHTML = '';

    // Seed edits with the current item values
    this.#state.update({ edits: { ...item } });

    const fields = [
      { key: 'name',   label: 'Name',   type: 'text'     },
      { key: 'status', label: 'Status', type: 'select'   },
      { key: 'notes',  label: 'Notes',  type: 'textarea' },
    ];

    fields.forEach(({ key, label, type }) => {
      const wrapper = document.createElement('label');
      wrapper.textContent = label;

      let input;
      if (type === 'select') {
        input = document.createElement('select');
        STATUS_OPTIONS.forEach(opt => {
          const o = document.createElement('option');
          o.value = opt;
          o.textContent = opt;
          if (opt === item[key]) o.selected = true;
          input.appendChild(o);
        });
      } else if (type === 'textarea') {
        input = document.createElement('textarea');
        input.rows = 3;
        input.value = item[key] ?? '';
      } else {
        input = document.createElement('input');
        input.type = 'text';
        input.value = item[key] ?? '';
      }

      input.addEventListener('input', e => {
        const value = e.target.value; // capture before shadow-DOM retargeting in Firefox
        this.#state.update(prev => ({
          edits: { ...prev.edits, [key]: value }
        }));
      });

      wrapper.appendChild(input);
      this.#editorFields.appendChild(wrapper);
    });
  }
}

customElements.define('item-editor', ItemEditor);
