import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

class MockBroadcastChannel {
  static instances = [];

  constructor(name) {
    this.name = name;
    this.messages = [];
    this.messageListeners = new Set();
    this.postMessage = vi.fn((message) => {
      this.messages.push(message);
    });
    MockBroadcastChannel.instances.push(this);
  }

  addEventListener(type, callback) {
    if (type === 'message') {
      this.messageListeners.add(callback);
    }
  }

  removeEventListener(type, callback) {
    if (type === 'message') {
      this.messageListeners.delete(callback);
    }
  }

  emitMessage(message) {
    this.messageListeners.forEach((listener) => listener({ data: message }));
  }

  close() {}
}

describe('flowDevtools', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    MockBroadcastChannel.instances = [];
    globalThis.BroadcastChannel = MockBroadcastChannel;
  });

  afterEach(() => {
    vi.useRealTimers();
    document.body.innerHTML = '';
    delete globalThis.BroadcastChannel;
  });

  it('creates the devtools channel only once', async () => {
    vi.resetModules();
    const { flowDevtools } = await import('../lib/FlowState.js');

    flowDevtools();
    flowDevtools();

    expect(MockBroadcastChannel.instances).toHaveLength(1);
    expect(MockBroadcastChannel.instances[0].name).toBe('flowstate-devtools');
  });

  it('sends init when devtools channel is created', async () => {
    vi.resetModules();
    const { flowDevtools } = await import('../lib/FlowState.js');

    flowDevtools();

    const channel = MockBroadcastChannel.instances[0];
    expect(channel.messages).toContainEqual({ type: 'init' });
  });

  it('broadcasts current snapshots when devtools sends ready', async () => {
    vi.resetModules();
    const { FlowSource, flowDevtools } = await import('../lib/FlowState.js');

    const root = document.createElement('div');
    document.body.appendChild(root);
    const source = new FlowSource(root, { count: 1 });

    flowDevtools();
    const channel = MockBroadcastChannel.instances[0];
    channel.emitMessage({ type: 'ready' });
    vi.advanceTimersByTime(60);

    const snapshot = channel.messages.find((message) => message?.type === 'snapshot');
    expect(snapshot).toBeTruthy();
    expect(snapshot.values.count).toBe(1);

    source.destroy();
    root.remove();
  });

  it('builds a snapshot for a shadow-rooted source without throwing', async () => {
    vi.resetModules();
    const { FlowSource, flowDevtools } = await import('../lib/FlowState.js');

    // The flow-through check only inspects *other* registry entries, so a second
    // source has to exist for the shadow-rooted snapshot to reach it.
    const outerRoot = document.createElement('div');
    document.body.appendChild(outerRoot);
    const outerSource = new FlowSource(outerRoot, { outer: true });

    const host = document.createElement('div');
    outerRoot.appendChild(host);
    const shadowRoot = host.attachShadow({ mode: 'open' });
    const source = new FlowSource(shadowRoot, { count: 1 });

    flowDevtools();
    const channel = MockBroadcastChannel.instances[0];
    channel.emitMessage({ type: 'ready' });
    vi.advanceTimersByTime(60);

    const snapshot = channel.messages.find(
      (message) => message?.type === 'snapshot' && message?.isShadow
    );
    expect(snapshot).toBeTruthy();
    expect(snapshot.values.count).toBe(1);
    expect(snapshot.isFlowThrough).toBe(false);

    source.destroy();
    outerSource.destroy();
    outerRoot.remove();
  });

  it('broadcasts an updated snapshot after state updates in dev mode', async () => {
    vi.resetModules();
    const { FlowSource, flowDevtools } = await import('../lib/FlowState.js');

    flowDevtools();
    const channel = MockBroadcastChannel.instances[0];

    const root = document.createElement('div');
    document.body.appendChild(root);
    const source = new FlowSource(root, { count: 0 });

    await source.update({ count: 2 });
    vi.advanceTimersByTime(120);

    const updated = channel.messages.find(
      (message) => message?.type === 'snapshot' && message?.values?.count === 2
    );
    expect(updated).toBeTruthy();

    source.destroy();
    root.remove();
  });
});
