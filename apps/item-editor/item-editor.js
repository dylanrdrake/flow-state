import { FlowSource, flowGet, flowWatch } from '../../lib/FlowState.js';
const sheet = new CSSStyleSheet();
await sheet.replace(await fetch(new URL('./item-editor.css', import.meta.url)).then(r => r.text()));

const HTML = String.raw;

const template = document.createElement('template');
template.innerHTML = HTML`
  <div id="pane">
    <template flow-if="hasSelection">
      <div id="editor">
        <div id="editor-fields"></div>
        <div class="action-row">
          <button id="save-btn">Save</button>
        </div>
      </div>
      <div id="placeholder">Select a work item to edit.</div>
    </template>
  </div>
`;

const STATUS_OPTIONS = ['Active', 'On Hold', 'Planning', 'Complete'];

class ItemEditor extends HTMLElement {
  #source;
  #shadow;
  #saveWorkItem;

  constructor() {
    super();
    this.#shadow = this.attachShadow({ mode: 'closed' });
    this.#shadow.adoptedStyleSheets = [sheet];
    this.#shadow.appendChild(template.content.cloneNode(true));

    // Create local FlowState and register the closed shadow so parent
    // bindings can reach elements inside it.
    this.#source = new FlowSource(this, {
      hasSelection: false,
      edits: null,
    });
    flowThrough(this.#shadow);

    this.#shadow.addEventListener('click', (e) => {
      const target = e.target;
      if (!(target instanceof Element) || target.id !== 'save-btn') return;

      const edits = flowGet(this, 'edits');
      if (edits && this.#saveWorkItem) {
        this.#saveWorkItem(edits);
        target.textContent = 'Saved!';
        target.classList.add('saved');
        setTimeout(() => {
          target.textContent = 'Save';
          target.classList.remove('saved');
        }, 1500);
      }
    });
  }

  connectedCallback() {
    this.#saveWorkItem = flowGet(this, 'saveWorkItem');

    flowWatch(this, 'selectedItem', item => {
      this.#source.update({
        hasSelection: Boolean(item),
        edits: item ? { ...item } : null,
      }).then(() => {
        if (item) this.#renderEditor(item);
      });
    });
  }

  #renderEditor(item) {
    const editorFields = this.#shadow.getElementById('editor-fields');
    if (!editorFields) return;
    editorFields.innerHTML = '';

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
        this.#source.update(prev => ({
          edits: { ...prev.edits, [key]: e.target.value }
        }));
      });

      wrapper.appendChild(input);
      editorFields.appendChild(wrapper);
    });
  }
}

customElements.define('item-editor', ItemEditor);
