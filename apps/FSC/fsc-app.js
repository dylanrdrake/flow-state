import { FlowStateComponent, flowDevtools } from '../../index.js';
import './title-panel.js';
import './title-editor.js';

flowDevtools();

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

  source = {
    title: 'Hello, FlowStateComponent!',
    message: 'This message is stored in FlowState and can be read with the button below.',
    changeTitle: this.#updateTitle.bind(this),
  };

  #updateTitle(newTitle) {
    this.source.update({ title: newTitle });
  }
}

customElements.define('fsc-app', FSCApp);