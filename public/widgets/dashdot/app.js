const params = new URLSearchParams(window.location.search);
const refreshMs = clampNumber(params.get('refresh'), 5000, 120000, 10000);
const historyLimit = clampNumber(params.get('points'), 20, 120, 54);
const baseWidth = clampNumber(params.get('baseWidth'), 320, 1200, 574);
const baseHeight = clampNumber(params.get('baseHeight'), 240, 1200, 574);
const demoMode = params.get('demo') === '1';
const logPrefix = '[homarr-iframes:dashdot]';

const state = {
  cpuHistory: [],
  lastPayload: null
};

const elements = {
  scaleRoot: document.querySelector('#scaleRoot'),
  serverName: document.querySelector('#serverName'),
  storagePercent: document.querySelector('#storagePercent'),
  storageDetail: document.querySelector('#storageDetail'),
  networkUp: document.querySelector('#networkUp'),
  networkDown: document.querySelector('#networkDown'),
  cpuLabel: document.querySelector('#cpuLabel'),
  cpuLine: document.querySelector('#cpuLine'),
  ramLabel: document.querySelector('#ramLabel'),
  ramFill: document.querySelector('#ramFill'),
  statusText: document.querySelector('#statusText')
};

console.info(`${logPrefix} loaded`, {
  origin: window.location.origin,
  pathname: window.location.pathname,
  search: window.location.search,
  demoMode
});

window.addEventListener('error', (event) => {
  console.error(`${logPrefix} JavaScript error`, event.error || event.message);
});

window.addEventListener('unhandledrejection', (event) => {
  console.error(`${logPrefix} Unhandled promise rejection`, event.reason);
});

if (params.get('bg') === 'solid') {
  document.body.classList.add('solid-bg');
}

if (params.get('debug') === '1') {
  document.body.classList.add('debug');
}

setupAutoScale();
await refresh();
setInterval(refresh, refreshMs);

function setupAutoScale() {
  elements.scaleRoot.style.setProperty('--widget-base-width', `${baseWidth}px`);
  elements.scaleRoot.style.setProperty('--widget-base-height', `${baseHeight}px`);

  const updateScale = () => {
    const scale = Math.max(0.1, Math.min(window.innerWidth / baseWidth, window.innerHeight / baseHeight));
    elements.scaleRoot.style.setProperty('--widget-scale', scale.toFixed(4));
  };

  updateScale();
  window.addEventListener('resize', updateScale);

  if ('ResizeObserver' in window) {
    new ResizeObserver(updateScale).observe(document.documentElement);
  }
}

async function refresh() {
  try {
    const payload = demoMode ? demoPayload() : await fetchSummary();
    state.lastPayload = payload;
    render(payload);
  } catch (error) {
    console.error(`${logPrefix} Failed to refresh Dashdot summary`, error);
    render(state.lastPayload || demoPayload(), error);
  }
}

async function fetchSummary() {
  const response = await fetch('/api/dashdot/summary', { cache: 'no-store' });
  if (!response.ok) {
    const detail = await response.json().catch(() => ({}));
    console.error(`${logPrefix} /api/dashdot/summary failed`, {
      status: response.status,
      statusText: response.statusText,
      detail
    });
    throw new Error(detail.error || `Dashdot API returned ${response.status}`);
  }

  const payload = await response.json();
  if (payload.ok === false && payload.errors && Object.keys(payload.errors).length > 0) {
    payload.warning = Object.entries(payload.errors)
      .map(([key, value]) => `${key}: ${value}`)
      .join('; ');
    console.warn(`${logPrefix} Partial Dashdot data`, payload.errors);
  }
  return payload;
}

function render(payload, error = null) {
  if (!payload || typeof payload !== 'object') {
    console.error(`${logPrefix} Invalid payload`, payload);
  }

  document.body.classList.toggle('has-error', Boolean(error));

  const info = payload.info || {};
  const loads = payload.loads || {};
  const storage = normalizeStorage(loads.storage);
  const ram = normalizeRam(loads.ram);
  const network = normalizeNetwork(loads.network, info.network);
  const cpuPercent = normalizePercent(loads.cpu);

  pushHistory(state.cpuHistory, cpuPercent, historyLimit);

  elements.serverName.textContent = params.get('title') || info.hostname || info.os?.hostname || 'Main Server';
  elements.storagePercent.textContent = Number.isFinite(storage.percent)
    ? `${storage.percent.toFixed(1)}%`
    : '--';
  elements.storageDetail.textContent = storage.usedBytes && storage.totalBytes
    ? `${formatBytes(storage.usedBytes)} / ${formatBytes(storage.totalBytes)}`
    : '-- / --';
  elements.networkUp.textContent = `${formatNetwork(network.up)} ↑`;
  elements.networkDown.textContent = `${formatNetwork(network.down)} ↓`;
  elements.cpuLabel.textContent = `%: ${formatOneDecimal(cpuPercent)}`;
  elements.ramLabel.textContent = `%: ${formatOneDecimal(ram.percent)}${ram.usedBytes ? ` (${formatBytes(ram.usedBytes)})` : ''}`;
  elements.ramFill.style.height = `${clampNumber(ram.percent, 0, 100, 0)}%`;
  elements.cpuLine.setAttribute('d', historyPath(state.cpuHistory));
  elements.statusText.textContent = error
    ? `Using cached/demo data: ${error.message}`
    : payload.warning
      ? `Partial Dashdot data: ${payload.warning}`
    : `Updated ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
}

function normalizeStorage(value) {
  const target = unwrapFirst(value);
  const percent = firstNumber(target, [
    'percentage',
    'percent',
    'usedPercent',
    'load',
    'value'
  ]);
  const usedBytes = firstBytes(target, ['used', 'usedBytes', 'use', 'sizeUsed']);
  const totalBytes = firstBytes(target, ['total', 'totalBytes', 'size', 'sizeTotal']);

  return {
    percent: Number.isFinite(percent) ? percent : usedBytes && totalBytes ? (usedBytes / totalBytes) * 100 : NaN,
    usedBytes,
    totalBytes
  };
}

function normalizeRam(value) {
  const target = unwrapFirst(value);
  const percent = firstNumber(target, ['percentage', 'percent', 'usedPercent', 'load', 'value']);
  const usedBytes = firstBytes(target, ['used', 'usedBytes', 'active', 'sizeUsed']);
  const totalBytes = firstBytes(target, ['total', 'totalBytes', 'size', 'sizeTotal']);

  return {
    percent: Number.isFinite(percent) ? percent : usedBytes && totalBytes ? (usedBytes / totalBytes) * 100 : NaN,
    usedBytes,
    totalBytes
  };
}

function normalizeNetwork(loadValue, infoValue) {
  const load = unwrapFirst(loadValue);
  const info = unwrapFirst(infoValue);

  return {
    up: firstNumber(load, ['up', 'upload', 'tx', 'speedUp', 'bytesTx']) ?? firstNumber(info, ['speedUp', 'up']),
    down: firstNumber(load, ['down', 'download', 'rx', 'speedDown', 'bytesRx']) ?? firstNumber(info, ['speedDown', 'down'])
  };
}

function normalizePercent(value) {
  const target = unwrapFirst(value);
  return firstNumber(target, ['percentage', 'percent', 'load', 'value', 'usage']) ?? 0;
}

function unwrapFirst(value) {
  if (Array.isArray(value)) return unwrapFirst(value[0]);
  if (value && typeof value === 'object') {
    if (Array.isArray(value.data)) return unwrapFirst(value.data);
    if (Array.isArray(value.values)) return unwrapFirst(value.values);
  }
  return value;
}

function firstNumber(target, keys) {
  if (typeof target === 'number') return normalizeRawPercent(target);
  if (!target || typeof target !== 'object') return undefined;

  for (const key of keys) {
    const value = target[key];
    if (typeof value === 'number') return normalizeRawPercent(value);
    if (typeof value === 'string' && Number.isFinite(Number(value))) return normalizeRawPercent(Number(value));
  }

  for (const value of Object.values(target)) {
    if (typeof value === 'number') return normalizeRawPercent(value);
  }

  return undefined;
}

function normalizeRawPercent(value) {
  if (!Number.isFinite(value)) return value;
  return value <= 1 ? value * 100 : value;
}

function firstBytes(target, keys) {
  if (!target || typeof target !== 'object') return undefined;

  for (const key of keys) {
    const value = target[key];
    if (typeof value === 'number') return value;
    if (typeof value === 'string' && Number.isFinite(Number(value))) return Number(value);
  }

  return undefined;
}

function formatBytes(bytes) {
  if (!Number.isFinite(bytes)) return '--';

  const units = ['B', 'KiB', 'MiB', 'GiB', 'TiB'];
  let value = bytes;
  let unit = 0;

  while (Math.abs(value) >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }

  return `${value.toFixed(unit === 0 ? 0 : 1)} ${units[unit]}`;
}

function formatNetwork(value) {
  if (!Number.isFinite(value)) return '--';

  const bits = value > 100000 ? value * 8 : value;
  const units = ['b/s', 'Kb/s', 'Mb/s', 'Gb/s'];
  let scaled = bits;
  let unit = 0;

  while (Math.abs(scaled) >= 1000 && unit < units.length - 1) {
    scaled /= 1000;
    unit += 1;
  }

  return `${scaled.toFixed(scaled >= 100 ? 1 : 2)} ${units[unit]}`;
}

function formatOneDecimal(value) {
  return Number.isFinite(value) ? value.toFixed(1) : '--';
}

function pushHistory(history, value, limit) {
  const safeValue = clampNumber(value, 0, 100, 0);
  history.push(safeValue);

  while (history.length < 8) {
    history.unshift(safeValue);
  }

  while (history.length > limit) {
    history.shift();
  }
}

function historyPath(values) {
  if (!values.length) return '';

  const width = 240;
  const height = 116;
  const step = values.length === 1 ? 0 : width / (values.length - 1);

  return values
    .map((value, index) => {
      const x = Math.round(index * step * 10) / 10;
      const y = Math.round((height - (value / 100) * (height - 10) - 5) * 10) / 10;
      return `${index === 0 ? 'M' : 'L'} ${x} ${y}`;
    })
    .join(' ');
}

function clampNumber(value, min, max, fallback) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

function demoPayload() {
  const t = Date.now() / 1000;
  return {
    info: {
      hostname: 'Main Server',
      network: {
        speedUp: 324300000 / 8,
        speedDown: 833900000 / 8
      }
    },
    loads: {
      cpu: 1.2 + Math.max(0, Math.sin(t / 4)) * 2.4,
      storage: {
        percent: 26,
        used: 33.3 * 1024 ** 3,
        total: 128 * 1024 ** 3
      },
      ram: {
        percent: 45.9,
        used: 3.6 * 1024 ** 3,
        total: 7.8 * 1024 ** 3
      },
      network: {
        up: 324300000 / 8,
        down: 833900000 / 8
      }
    }
  };
}
