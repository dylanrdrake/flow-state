import { FlowState, FlowStateComponent } from '../../index.js';
import './title-panel.js';
import './title-editor.js';

FlowState.devtools();

const HTML = String.raw;

const template = document.createElement('template');
template.innerHTML = HTML`
  <style>
    :host {
      display: block;
    }
  </style>
  <slot></slot>
`;

class FSCApp extends FlowStateComponent {

  flowConfig = {
    init: {
      title: 'Hello, FlowStateComponent!',
      message: 'This message is stored in FlowState and can be read with the button below.',
    },

    hooks: {
      changeTitle: (newTitle) => {
        this.Flow.update({ title: newTitle });
      }
    },

    options: {
      label: 'FSCApp FlowState',
    }
  };


  constructor() {
    super();

    this.attachShadow({ mode: 'open' });
    this.shadowRoot.appendChild(template.content.cloneNode(true));
  }
}

customElements.define('fsc-app', FSCApp);