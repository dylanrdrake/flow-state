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

  state = {
    title: 'Hello, FlowStateComponent!',
    message: 'This message is stored in FlowState and can be read with the button below.',
    changeTitle: this.#updateTitle.bind(this),
  };

  #updateTitle(newTitle) {
    this.state.update({ title: newTitle });
  }

  disconnectedCallback() {
    this.state?.destroy();
  }
}

customElements.define('fsc-app', FSCApp);