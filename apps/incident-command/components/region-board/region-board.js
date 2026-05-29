import { FlowStateComponent } from '../../../../lib/FlowStateComponent.js';
import { flowGet, flowWatch, flowCompute } from '../../../../lib/FlowState.js';
import '../squad-column/squad-column.js';

const loadText = async (relativePath) => {
  const response = await fetch(new URL(relativePath, import.meta.url));
  if (!response.ok) throw new Error(`Failed to load ${relativePath}: ${response.status}`);
  return response.text();
};

const [styles, template] = await Promise.all([
  loadText('./region-board.css'),
  loadText('./region-board.html'),
]);

class RegionBoard extends FlowStateComponent {
  styles = styles;
  template = template;

  source = {
    regionName: '',
    regionStatus: 'nominal',
    escalations: 0,
    muteLabel: 'Mute',
    squads: [],
    muted: false,
    escalationBand: flowCompute((escalations) => {
      if (escalations >= 6) return 'critical';
      if (escalations >= 3) return 'active';
      return 'nominal';
    }, ['escalations']),
  };

  #regionId = '';
  #toggleRegionMute = () => {};
  #initialized = false;

  connectedCallback() {
    super.connectedCallback();
    if (this.#initialized) return;

    this.#regionId = this.getAttribute('region-id') || '';
    this.#toggleRegionMute = flowGet(this, 'toggleRegionMute') || (() => {});

    flowWatch(this, 'regions', (regions = []) => {
      const region = regions.find((entry) => entry.id === this.#regionId);
      if (!region) return;

      const escalations = region.squads.reduce(
        (sum, squad) => sum + squad.responders.reduce((count, responder) => count + responder.queue.length, 0),
        0
      );

      this.source.update({
        regionName: region.name,
        squads: region.squads,
        escalations,
        muted: region.muted,
        muteLabel: region.muted ? 'Unmute' : 'Mute',
      });
    });

    flowWatch(this, 'escalationBand', (band) => {
      this.source.update({ regionStatus: band });
    });

    flowWatch(this, 'globalAlert', (globalAlert) => {
      this.dataset.alert = globalAlert ? 'true' : 'false';
    });

    flowWatch(this, 'squads', (squads = []) => {
      const squadList = this.querySelector('#squad-list');
      squadList.replaceChildren(
        ...squads.map((squad) => {
          const el = document.createElement('squad-column');
          el.setAttribute('region-id', this.#regionId);
          el.setAttribute('squad-id', squad.id);
          return el;
        })
      );
    });

    this.addEventListener('click', (event) => {
      const muteBtn = event.target.closest('button[data-action="mute"]');
      if (!muteBtn) return;
      this.#toggleRegionMute(this.#regionId);
    });

    this.#initialized = true;
  }
}

customElements.define('region-board', RegionBoard);
