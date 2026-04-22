import { FlowState as Flow } from '../../index.js';

const HTML = String.raw;

const template = document.createElement('template');
template.innerHTML = HTML`
  <style>
    :host {
      display: block;
      width: min(640px, 92vw);
    }

    .card {
      border: 1px solid #cbd5e1;
      border-radius: 16px;
      padding: 20px;
      background: #ffffff;
      box-shadow: 0 12px 30px rgba(15, 23, 42, 0.08);
    }

    h1 {
      margin: 0 0 10px;
      font-size: 1.3rem;
      letter-spacing: 0.01em;
    }

    p {
      margin: 0;
      line-height: 1.5;
      color: #334155;
    }

    .meta {
      margin-top: 16px;
      padding-top: 14px;
      border-top: 1px solid #e2e8f0;
      display: grid;
      gap: 8px;
      font-size: 0.95rem;
      color: #475569;
    }

    button {
      margin-top: 14px;
      width: fit-content;
      border: 1px solid #1e293b;
      background: #1e293b;
      color: #fff;
      border-radius: 10px;
      padding: 8px 12px;
      cursor: pointer;
      font: inherit;
    }

    button:hover {
      background: #0f172a;
    }
  </style>

  <section class="card">
    <h1 flow-watch-title-to-prop="textContent"></h1>
    <p flow-watch-message-to-prop="textContent"></p>

    <button id="read-btn" type="button">Read message via FlowState.get</button>

    <div class="meta">
      <div>Shadow mode: <strong flow-watch-shadowMode-to-prop="textContent"></strong></div>
      <div id="readout">Fetched value: n/a</div>
    </div>
  </section>
`;


class TitlePanel extends HTMLElement {
  #shadow;
  #readout;
  #readoutBtn;

  constructor() {
    super();

    this.#shadow = this.attachShadow({ mode: 'open' });
    this.#shadow.appendChild(template.content.cloneNode(true));

    this.#readout = this.#shadow.getElementById('readout');
    this.#readoutBtn = this.#shadow.getElementById('read-btn');

    this.#readoutBtn.addEventListener('click', async () => {
      const message = await Flow.get(this.#shadow, 'message');
      this.#readout.textContent = `Fetched value: ${message}`;
    });
  }
}

customElements.define('title-panel', TitlePanel);
