import { FlowState, FlowStateComponent } from '../../index.js';
import './title-panel.js';
import './title-editor.js';

FlowState.devtools();

const HTML = String.raw;
const CSS = String.raw;

class FSCApp extends FlowStateComponent {

  styles = CSS`
    :host {
      display: block;
    }
  `;

  template = HTML`
    <title-panel></title-panel>
    <title-editor></title-editor>
  `;

  flowConfig = {
    init: {
      title: 'Hello, FlowStateComponent!',
      message: 'This message is stored in FlowState and can be read with the button below.',
    },

    hooks: {
      changeTitle: this.#updateTitle.bind(this),
    },

    options: {
      label: 'FSCApp FlowState',
    }
  };

  #updateTitle(newTitle) {
    this.state.update({ title: newTitle });
  }
}

customElements.define('fsc-app', FSCApp);