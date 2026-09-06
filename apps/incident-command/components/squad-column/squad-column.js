import { FlowStateComponent } from '../../../../lib/FlowStateComponent.js';
import { flowGet, flowWatch } from '../../../../lib/FlowState.js';
import '../responder-card/responder-card.js';

const loadText = async (relativePath) => {
  const response = await fetch(new URL(relativePath, import.meta.url));
  if (!response.ok) throw new Error(`Failed to load ${relativePath}: ${response.status}`);
  return response.text();
};

const [styles, template] = await Promise.all([
  loadText('./squad-column.css'),
  loadText('./squad-column.html'),
]);

class SquadColumn extends FlowStateComponent {
  styles = styles;
  template = template;

  sourceConfig = {
    squadName: '',
    responders: [],
    workload: 0,
    status: 'steady',
  };

  #regionId = '';
  #squadId = '';
  #stabilizeSquad = () => {};
  #initialized = false;

  connectedCallback() {
    super.connectedCallback();
    if (this.#initialized) return;

    this.#regionId = this.getAttribute('region-id') || '';
    this.#squadId = this.getAttribute('squad-id') || '';
    this.#stabilizeSquad = flowGet(this, 'stabilizeSquad') || (() => {});

    flowWatch(this, 'squads', (squads = []) => {
      const squad = squads.find((entry) => entry.id === this.#squadId);
      if (!squad) return;

      const workload = squad.responders.reduce((sum, responder) => sum + responder.queue.length, 0);
      const status = workload >= 5 ? 'critical' : workload >= 2 ? 'active' : 'steady';

      this.source.update({
        squadName: squad.name,
        responders: squad.responders,
        workload,
        status,
      });
    });

    flowWatch(this, 'responders', (responders = []) => {
      const container = this.querySelector('#responder-list');
      container.replaceChildren(
        ...responders.map((responder) => {
          const el = document.createElement('responder-card');
          el.setAttribute('region-id', this.#regionId);
          el.setAttribute('squad-id', this.#squadId);
          el.setAttribute('responder-id', responder.id);
          return el;
        })
      );
    });

    this.addEventListener('click', (event) => {
      const stabilizeBtn = event.target.closest('button[data-action="stabilize"]');
      if (!stabilizeBtn) return;
      this.#stabilizeSquad(this.#regionId, this.#squadId);
    });

    this.#initialized = true;
  }
}

customElements.define('squad-column', SquadColumn);
