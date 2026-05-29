import { FlowSource, flowWatch, flowCompute, flowDevtools } from '../../lib/FlowState.js';
import './components/inventory-stats/inventory-stats.js';
import './components/inventory-grid/inventory-grid.js';
import './components/reorder-queue/reorder-queue.js';
import './components/fulfillment-queue/fulfillment-queue.js';

const loadText = async (relativePath) => {
  const response = await fetch(new URL(relativePath, import.meta.url));
  if (!response.ok) throw new Error(`Failed to load ${relativePath}: ${response.status}`);
  return response.text();
};

const [appStyles, appTemplateMarkup, appConfigText] = await Promise.all([
  loadText('./fulfillment-desk-app.css'),
  loadText('./fulfillment-desk-app.html'),
  loadText('./config.json'),
]);

const APP_STYLE_ID = '--flow-style-fulfillment-desk-app';

const ensureAppStyles = () => {
  if (document.getElementById(APP_STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = APP_STYLE_ID;
  style.textContent = appStyles;
  document.head.appendChild(style);
};

flowDevtools();

const money = (value) => `$${value.toFixed(2)}`;
const minutesAgo = (minutes) => new Date(Date.now() - minutes * 60_000).toISOString();

const appConfig = JSON.parse(appConfigText);
const seedInventory = Array.isArray(appConfig.seedInventory) ? appConfig.seedInventory : [];
const seedOrders = Array.isArray(appConfig.seedOrders)
  ? appConfig.seedOrders.map((order) => {
    const { createdMinutesAgo, ...orderData } = order;
    return {
      ...orderData,
      createdAt: minutesAgo(createdMinutesAgo || 0),
    };
  })
  : [];
const nextOrderStatus = appConfig.nextOrderStatus || {};
const initialActivity = Array.isArray(appConfig.initialActivity) ? appConfig.initialActivity : [];

class FulfillmentDeskApp extends HTMLElement {
  #source;
  #activityUnsub = () => {};

  constructor() {
    super();
    ensureAppStyles();

    this.#source = new FlowSource(this, {
      inventory: seedInventory,
      orders: seedOrders,
      purchaseOrders: [],
      supplierFilter: 'all',
      stockFilter: 'all',
      searchTerm: '',
      activity: initialActivity,

      filteredInventory: flowCompute((inventory, supplierFilter, stockFilter, searchTerm) => {
        const search = searchTerm.trim().toLowerCase();

        return inventory
          .filter((item) => supplierFilter === 'all' ? true : item.supplier === supplierFilter)
          .filter((item) => {
            if (stockFilter === 'low') return item.stock > 0 && item.stock <= item.reorderPoint;
            if (stockFilter === 'healthy') return item.stock > item.reorderPoint;
            if (stockFilter === 'out') return item.stock === 0;
            return true;
          })
          .filter((item) => {
            if (!search) return true;
            return item.sku.toLowerCase().includes(search) || item.name.toLowerCase().includes(search);
          })
          .map((item) => ({
            ...item,
            unitCostLabel: money(item.unitCost),
          }));
      }, ['inventory', 'supplierFilter', 'stockFilter', 'searchTerm']),

          hasFilteredInventory: flowCompute((filteredInventory) => filteredInventory.length > 0, ['filteredInventory']),

      inventoryMetrics: flowCompute((inventory, orders, purchaseOrders) => {
        const openOrders = orders.filter((order) => order.status !== 'shipped').length;
        const openPurchaseOrders = purchaseOrders.filter((po) => po.status === 'open').length;

        return {
          totalSkus: inventory.length,
          lowStockCount: inventory.filter((item) => item.stock > 0 && item.stock <= item.reorderPoint).length,
          outOfStockCount: inventory.filter((item) => item.stock === 0).length,
          openOrders,
          openPurchaseOrders,
          inventoryValueLabel: money(
            inventory.reduce((sum, item) => sum + (item.stock * item.unitCost), 0)
          ),
        };
      }, ['inventory', 'orders', 'purchaseOrders']),

      inventoryMetricsTotalSkus: flowCompute((inventoryMetrics) => inventoryMetrics.totalSkus, ['inventoryMetrics']),
      inventoryMetricsLowStockCount: flowCompute((inventoryMetrics) => inventoryMetrics.lowStockCount, ['inventoryMetrics']),
      inventoryMetricsOutOfStockCount: flowCompute((inventoryMetrics) => inventoryMetrics.outOfStockCount, ['inventoryMetrics']),
      inventoryMetricsOpenOrders: flowCompute((inventoryMetrics) => inventoryMetrics.openOrders, ['inventoryMetrics']),
      inventoryMetricsOpenPurchaseOrders: flowCompute((inventoryMetrics) => inventoryMetrics.openPurchaseOrders, ['inventoryMetrics']),
      inventoryMetricsInventoryValueLabel: flowCompute((inventoryMetrics) => inventoryMetrics.inventoryValueLabel, ['inventoryMetrics']),

      reorderSuggestions: flowCompute((inventory, purchaseOrders, orders) => {
        const openBySku = purchaseOrders
          .filter((po) => po.status === 'open')
          .reduce((map, po) => ({ ...map, [po.sku]: (map[po.sku] || 0) + po.qty }), {});

        const queuedBySku = orders
          .filter((order) => order.status !== 'shipped')
          .reduce((map, order) => ({ ...map, [order.sku]: (map[order.sku] || 0) + order.qty }), {});

        return inventory
          .filter((item) => item.stock <= item.reorderPoint)
          .sort((a, b) => {
            const aQueueDemand = queuedBySku[a.sku] || 0;
            const bQueueDemand = queuedBySku[b.sku] || 0;
            const aDisparity = (a.reorderPoint + aQueueDemand) - a.stock;
            const bDisparity = (b.reorderPoint + bQueueDemand) - b.stock;
            return bDisparity - aDisparity;
          })
          .map((item) => {
            const incoming = openBySku[item.sku] || 0;
            const queueDemand = queuedBySku[item.sku] || 0;
            const target = item.reorderPoint + (item.dailyDemand * item.leadTimeDays);
            const shortage = Math.max(target - (item.stock + incoming), 0);
            return {
              sku: item.sku,
              suggestedQty: Math.max(shortage, 1),
              reason: `${item.stock} in stock, target ${target}, queue ${queueDemand}, incoming ${incoming}`,
            };
          });
      }, ['inventory', 'purchaseOrders', 'orders']),

          hasReorderSuggestions: flowCompute((reorderSuggestions) => reorderSuggestions.length > 0, ['reorderSuggestions']),
          hasPurchaseOrders: flowCompute((purchaseOrders) => purchaseOrders.length > 0, ['purchaseOrders']),

      fulfillmentQueue: flowCompute((orders, inventory) => {
        const inventoryBySku = Object.fromEntries(inventory.map((item) => [item.sku, item.stock]));

        return orders
          .filter((order) => order.status !== 'shipped')
          .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt))
          .map((order) => {
            const available = inventoryBySku[order.sku] || 0;
            const canFulfill = available >= order.qty;
            return {
              ...order,
              createdLabel: `Created ${new Date(order.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`,
              availabilityLabel: canFulfill ? 'Ready to process' : 'Insufficient stock',
              availabilityClass: canFulfill ? 'ok' : 'warn',
              nextLabel: nextOrderStatus[order.status] === 'shipped' ? 'Complete' : `Move to ${nextOrderStatus[order.status]}`,
            };
          });
      }, ['orders', 'inventory']),

          hasFulfillmentQueue: flowCompute((fulfillmentQueue) => fulfillmentQueue.length > 0, ['fulfillmentQueue']),

      setSearchTerm: this.#setSearchTerm.bind(this),
      setSupplierFilter: this.#setSupplierFilter.bind(this),
      setStockFilter: this.#setStockFilter.bind(this),
      adjustStock: this.#adjustStock.bind(this),
      setReorderPoint: this.#setReorderPoint.bind(this),
      createPurchaseOrder: this.#createPurchaseOrder.bind(this),
      receivePurchaseOrder: this.#receivePurchaseOrder.bind(this),
      advanceOrder: this.#advanceOrder.bind(this),
      simulateDemandTick: this.#simulateDemandTick.bind(this),
    });

    this.innerHTML = appTemplateMarkup;

    const searchEl = this.querySelector('#search');
    const supplierEl = this.querySelector('#supplier-filter');
    const stockEl = this.querySelector('#stock-filter');
    const demandBtn = this.querySelector('#simulate-demand');

    const uniqueSuppliers = [...new Set(seedInventory.map((item) => item.supplier))];
    supplierEl.insertAdjacentHTML(
      'beforeend',
      uniqueSuppliers.map((supplier) => `<option value="${supplier}">${supplier}</option>`).join('')
    );

    searchEl.addEventListener('input', (event) => {
      this.#setSearchTerm(event.target.value || '');
    });

    supplierEl.addEventListener('change', (event) => {
      this.#setSupplierFilter(event.target.value || 'all');
    });

    stockEl.addEventListener('change', (event) => {
      this.#setStockFilter(event.target.value || 'all');
    });

    demandBtn.addEventListener('click', () => {
      this.#simulateDemandTick();
    });

    this.#activityUnsub = flowWatch(this, 'activity', (activity = []) => {
      const listEl = this.querySelector('#activity-list');
      if (!activity.length) {
        listEl.innerHTML = '<li class="activity-empty">No activity yet.</li>';
        return;
      }

      listEl.replaceChildren(
        ...activity.map((entry) => {
          const li = document.createElement('li');
          li.className = `activity-item ${entry.tone || ''}`.trim();
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
    return [{ id: Date.now(), tone, text }, ...activity].slice(0, 18);
  }

  #setSearchTerm(value) {
    this.#source.update({ searchTerm: value });
  }

  #setSupplierFilter(value) {
    this.#source.update({ supplierFilter: value });
  }

  #setStockFilter(value) {
    this.#source.update({ stockFilter: value });
  }

  #adjustStock(sku, delta) {
    this.#source.update((prev) => {
      const updatedInventory = prev.inventory.map((item) => {
        if (item.sku !== sku) return item;
        return { ...item, stock: Math.max(0, item.stock + delta) };
      });

      return {
        inventory: updatedInventory,
        activity: this.#appendLog(prev.activity, delta > 0 ? 'good' : 'warn', `${sku} stock ${delta > 0 ? 'increased' : 'decreased'} by ${Math.abs(delta)}.`),
      };
    });
  }

  #setReorderPoint(sku, reorderPoint) {
    this.#source.update((prev) => ({
      inventory: prev.inventory.map((item) => item.sku === sku ? { ...item, reorderPoint } : item),
      activity: this.#appendLog(prev.activity, 'info', `${sku} reorder point set to ${reorderPoint}.`),
    }));
  }

  #createPurchaseOrder(sku, qty) {
    this.#source.update((prev) => {
      const item = prev.inventory.find((entry) => entry.sku === sku);
      if (!item) return {};

      const id = Number(`${Date.now()}`.slice(-7));
      return {
        purchaseOrders: [
          {
            id,
            sku,
            qty,
            status: 'open',
            etaDays: item.leadTimeDays,
            createdAt: new Date().toISOString(),
          },
          ...prev.purchaseOrders,
        ],
        activity: this.#appendLog(prev.activity, 'info', `PO ${id} created for ${sku} (${qty}).`),
      };
    });
  }

  #receivePurchaseOrder(id) {
    this.#source.update((prev) => {
      const po = prev.purchaseOrders.find((entry) => entry.id === id);
      if (!po || po.status !== 'open') return {};

      return {
        inventory: prev.inventory.map((item) =>
          item.sku === po.sku ? { ...item, stock: item.stock + po.qty } : item
        ),
        purchaseOrders: prev.purchaseOrders.map((entry) =>
          entry.id === id ? { ...entry, status: 'received', etaDays: 0 } : entry
        ),
        activity: this.#appendLog(prev.activity, 'good', `PO ${id} received. ${po.sku} stock increased by ${po.qty}.`),
      };
    });
  }

  #advanceOrder(id) {
    this.#source.update((prev) => {
      const order = prev.orders.find((entry) => entry.id === id);
      if (!order) return {};
      if (order.status === 'shipped') return {};

      if (order.status === 'queued') {
        const item = prev.inventory.find((entry) => entry.sku === order.sku);
        const available = item?.stock || 0;
        if (available < order.qty) {
          return {
            activity: this.#appendLog(prev.activity, 'warn', `Order ${id} blocked. Need ${order.qty} of ${order.sku}, have ${available}.`),
          };
        }

        return {
          inventory: prev.inventory.map((entry) =>
            entry.sku === order.sku ? { ...entry, stock: entry.stock - order.qty } : entry
          ),
          orders: prev.orders.map((entry) =>
            entry.id === id ? { ...entry, status: 'picking' } : entry
          ),
          activity: this.#appendLog(prev.activity, 'good', `Order ${id} moved to picking. Reserved ${order.qty} of ${order.sku}.`),
        };
      }

      const nextStatus = nextOrderStatus[order.status] || order.status;
      return {
        orders: prev.orders.map((entry) =>
          entry.id === id ? { ...entry, status: nextStatus } : entry
        ),
        activity: this.#appendLog(prev.activity, nextStatus === 'shipped' ? 'good' : 'info', `Order ${id} moved to ${nextStatus}.`),
      };
    });
  }

  #simulateDemandTick() {
    this.#source.update((prev) => {
      let touched = 0;
      const updated = prev.inventory.map((item) => {
        const draw = Math.min(item.stock, Math.max(0, Math.round(Math.random() * item.dailyDemand)));
        if (draw > 0) touched += 1;
        return { ...item, stock: item.stock - draw };
      });

      return {
        inventory: updated,
        activity: this.#appendLog(prev.activity, touched > 0 ? 'warn' : 'info', touched > 0 ? `Demand tick consumed stock across ${touched} SKUs.` : 'Demand tick had no stock impact.'),
      };
    });
  }
}

customElements.define('fulfillment-desk-app', FulfillmentDeskApp);
