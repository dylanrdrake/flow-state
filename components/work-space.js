import { FlowState as Flow } from '../lib/FlowState.js';
import './side-bar.js';
import './work-view.js';


const CSS = String.raw;
const HTML = String.raw;

const styles = CSS`
  :host {
    display: flex;
    flex-direction: row;
  }
  :host #divider {
    width: 5px;
    background-color: gray;
    cursor: col-resize;
  }
  :host #side-bar-container {
    width: 30%;
    overflow-x: hidden;
    border-right: 2px solid gray;
  }
  :host side-bar {
    display: block;
    min-width: 30vw;
  }
  :host work-view {
    flex-grow: 1;
  }
`

const template = document.createElement('template');
template.innerHTML = HTML`
  <div id="side-bar-container">
    <side-bar></side-bar>
  </div>
  <div id="divider"></div>
  <work-view></work-view>
`;

const sheet = new CSSStyleSheet();
sheet.replaceSync(styles);


class Workspace extends HTMLElement {
  minWidth = 10;
 
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this.shadowRoot.appendChild(template.content.cloneNode(true));
    this.shadowRoot.adoptedStyleSheets = [sheet];

    this.divider = this.shadowRoot.getElementById('divider');
    this.sideBarContainer = this.shadowRoot.getElementById('side-bar-container');
    
    this.isDragging = false;
    
    this.divider.addEventListener('mousedown', this.onMouseDown.bind(this));
    document.addEventListener('mousemove', this.onMouseMove.bind(this));
    document.addEventListener('mouseup', this.onMouseUp.bind(this));
  }

  onMouseDown(e) {
    this.isDragging = true;
    e.preventDefault();
  }

  onMouseMove(e) {
    if (!this.isDragging) return;
    
    const containerRect = this.getBoundingClientRect();
    const maxWidth = containerRect.width - 150;
    
    if (e.clientX >= this.minWidth && e.clientX <= maxWidth) {
      this.sideBarContainer.style.width = `${e.clientX}px`;
    }
  }

  onMouseUp() {
    this.isDragging = false;
  }

}

window.customElements.define('work-space', Workspace);