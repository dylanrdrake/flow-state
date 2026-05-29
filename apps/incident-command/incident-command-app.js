import { FlowSource, flowWatch, flowCompute, flowDevtools } from '../../lib/FlowState.js';
import './components/region-board/region-board.js';

const loadText = async (relativePath) => {
  const response = await fetch(new URL(relativePath, import.meta.url));
  if (!response.ok) throw new Error(`Failed to load ${relativePath}: ${response.status}`);
  return response.text();
};

const [appStyles, appTemplateMarkup, appConfigText] = await Promise.all([
  loadText('./incident-command-app.css'),
  loadText('./incident-command-app.html'),
  loadText('./config.json'),
]);

const APP_STYLE_ID = '--flow-style-incident-command-app';

const ensureAppStyles = () => {
  if (document.getElementById(APP_STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = APP_STYLE_ID;
  style.textContent = appStyles;
  document.head.appendChild(style);
};

flowDevtools();

const appConfig = JSON.parse(appConfigText);
const seedRegions = Array.isArray(appConfig.regions) ? appConfig.regions : [];
const initialActivity = Array.isArray(appConfig.initialActivity) ? appConfig.initialActivity : [];

class IncidentCommandApp extends HTMLElement {
  #source;
  #activityUnsub = () => {};

  constructor() {
    super();
    ensureAppStyles();

    this.#source = new FlowSource(this, {
      regions: seedRegions,
      globalAlert: false,
      activity: initialActivity,

      openIncidents: flowCompute((regions) => regions.reduce(
        (total, region) => total + region.squads.reduce(
          (regionTotal, squad) => regionTotal + squad.responders.reduce(
            (responderTotal, responder) => responderTotal + responder.queue.length,
            0
          ),
          0
        ),
        0
      ), ['regions']),

      activeResponders: flowCompute((regions) => regions.reduce(
        (total, region) => total + region.squads.reduce(
          (regionTotal, squad) => regionTotal + squad.responders.filter((responder) => responder.status !== 'idle').length,
          0
        ),
        0
      ), ['regions']),

      mutedRegions: flowCompute((regions) => regions.filter((region) => region.muted).length, ['regions']),

      toggleGlobalAlert: this.#toggleGlobalAlert.bind(this),
      injectLoadSpike: this.#injectLoadSpike.bind(this),
      toggleRegionMute: this.#toggleRegionMute.bind(this),
      advanceResponderTask: this.#advanceResponderTask.bind(this),
      stabilizeSquad: this.#stabilizeSquad.bind(this),
    });

    this.innerHTML = appTemplateMarkup;

    const regionGrid = this.querySelector('#region-grid');
    regionGrid.innerHTML = seedRegions
      .map((region) => `<region-board region-id="${region.id}"></region-board>`)
      .join('');

    const toggleAlertBtn = this.querySelector('#toggle-alert');
    const loadSpikeBtn = this.querySelector('#load-spike');

    toggleAlertBtn.addEventListener('click', () => {
      this.#toggleGlobalAlert();
    });

    loadSpikeBtn.addEventListener('click', () => {
      this.#injectLoadSpike();
    });

    this.#activityUnsub = flowWatch(this, 'activity', (activity = []) => {
      const activityList = this.querySelector('#activity-list');
      if (!activity.length) {
        activityList.innerHTML = '<li>No activity yet.</li>';
        return;
      }

      activityList.replaceChildren(
        ...activity.map((entry) => {
          const li = document.createElement('li');
          li.className = entry.tone || '';
          li.textContent = entry.text;
          return li;
        })
      );
    });
  }

  disconnectedCallback() {
    this.#activityUnsub();
    this.#source?.destroy();
  }

  #appendLog(activity, tone, text) {
    return [{ id: Date.now(), tone, text }, ...activity].slice(0, 20);
  }

  #toggleGlobalAlert() {
    this.#source.update((prev) => ({
      globalAlert: !prev.globalAlert,
      activity: this.#appendLog(prev.activity, prev.globalAlert ? 'good' : 'warn', prev.globalAlert ? 'Global alert cleared.' : 'Global alert activated.'),
    }));
  }

  #injectLoadSpike() {
    this.#source.update((prev) => {
      const updatedRegions = prev.regions.map((region) => ({
        ...region,
        squads: region.squads.map((squad) => ({
          ...squad,
          responders: squad.responders.map((responder, index) => {
            if (index !== 0) return responder;
            return {
              ...responder,
              status: 'busy',
              queue: [
                ...responder.queue,
                { title: `Investigate surge in ${region.name}`, priority: prev.globalAlert ? 'high' : 'medium' },
              ],
            };
          }),
        })),
      }));

      return {
        regions: updatedRegions,
        activity: this.#appendLog(prev.activity, 'warn', 'Synthetic load spike injected across primary responders.'),
      };
    });
  }

  #toggleRegionMute(regionId) {
    this.#source.update((prev) => {
      const updatedRegions = prev.regions.map((region) => {
        if (region.id !== regionId) return region;
        return { ...region, muted: !region.muted };
      });

      const updated = updatedRegions.find((region) => region.id === regionId);
      const tone = updated?.muted ? 'warn' : 'good';
      const text = updated?.muted ? `${updated.name} muted escalation pings.` : `${updated.name} restored escalation pings.`;

      return {
        regions: updatedRegions,
        activity: this.#appendLog(prev.activity, tone, text),
      };
    });
  }

  #stabilizeSquad(regionId, squadId) {
    this.#source.update((prev) => {
      const updatedRegions = prev.regions.map((region) => {
        if (region.id !== regionId) return region;

        return {
          ...region,
          squads: region.squads.map((squad) => {
            if (squad.id !== squadId) return squad;

            return {
              ...squad,
              responders: squad.responders.map((responder) => ({
                ...responder,
                status: responder.queue.length ? 'busy' : 'monitoring',
              })),
            };
          }),
        };
      });

      return {
        regions: updatedRegions,
        activity: this.#appendLog(prev.activity, 'good', `Stabilization command sent to ${squadId}.`),
      };
    });
  }

  #advanceResponderTask(regionId, squadId, responderId) {
    this.#source.update((prev) => {
      let completedTaskTitle = '';

      const updatedRegions = prev.regions.map((region) => {
        if (region.id !== regionId) return region;

        return {
          ...region,
          squads: region.squads.map((squad) => {
            if (squad.id !== squadId) return squad;

            return {
              ...squad,
              responders: squad.responders.map((responder) => {
                if (responder.id !== responderId) return responder;
                if (!responder.queue.length) return responder;

                const [completedTask, ...remainingQueue] = responder.queue;
                completedTaskTitle = completedTask.title;
                return {
                  ...responder,
                  queue: remainingQueue,
                  status: remainingQueue.length ? 'busy' : 'idle',
                };
              }),
            };
          }),
        };
      });

      if (!completedTaskTitle) return {};

      return {
        regions: updatedRegions,
        activity: this.#appendLog(prev.activity, 'good', `Task completed: ${completedTaskTitle}.`),
      };
    });
  }
}

customElements.define('incident-command-app', IncidentCommandApp);
