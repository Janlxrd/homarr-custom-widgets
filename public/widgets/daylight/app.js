import {
  clamp,
  formatDuration,
  getDaylightProgress,
  getSunTimes
} from './solar.js';

const params = new URLSearchParams(window.location.search);
const locale = params.get('locale') || undefined;
const requestedTimezone = params.get('tz');
const browserTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
const timezone = requestedTimezone || browserTimezone;
const logPrefix = '[homarr-iframes:daylight]';

const state = {
  coords: null,
  label: 'Detecting location',
  source: 'startup',
  status: 'Starting widget'
};

const elements = {
  locationLabel: document.querySelector('#locationLabel'),
  timezoneLabel: document.querySelector('#timezoneLabel'),
  refreshButton: document.querySelector('#refreshButton'),
  preciseButton: document.querySelector('#preciseButton'),
  modeLabel: document.querySelector('#modeLabel'),
  timeValue: document.querySelector('#timeValue'),
  dateValue: document.querySelector('#dateValue'),
  daylightWindow: document.querySelector('#daylightWindow'),
  sunDot: document.querySelector('#sunDot'),
  sunriseMarker: document.querySelector('#sunriseMarker'),
  sunsetMarker: document.querySelector('#sunsetMarker'),
  progressValue: document.querySelector('#progressValue'),
  barFill: document.querySelector('#barFill'),
  sunriseValue: document.querySelector('#sunriseValue'),
  durationValue: document.querySelector('#durationValue'),
  sunsetValue: document.querySelector('#sunsetValue'),
  statusText: document.querySelector('#statusText')
};

console.info(`${logPrefix} loaded`, {
  origin: window.location.origin,
  pathname: window.location.pathname,
  search: window.location.search,
  timezone
});

window.addEventListener('error', (event) => {
  console.error(`${logPrefix} JavaScript error`, event.error || event.message);
});

window.addEventListener('unhandledrejection', (event) => {
  console.error(`${logPrefix} Unhandled promise rejection`, event.reason);
});

if (params.get('chrome') === '0') {
  document.body.classList.add('no-chrome');
}

if (params.get('compact') === '1') {
  document.body.classList.add('compact');
}

if (params.get('bg') === 'solid') {
  document.body.classList.add('solid-bg');
}

if (params.get('debug') === '1') {
  document.body.classList.add('debug');
}

elements.refreshButton.addEventListener('click', () => detectLocation({ force: true }));
elements.preciseButton.addEventListener('click', () => useBrowserLocation());

render();
detectLocation();
setInterval(render, 1000);

async function detectLocation({ force = false } = {}) {
  const fixedLocation = getFixedLocation();

  if (fixedLocation) {
    applyLocation(fixedLocation);
    return;
  }

  setStatus(force ? 'Refreshing approximate location' : 'Detecting approximate location');

  const serverLocation = await getServerGeoIp();
  if (serverLocation) {
    applyLocation(serverLocation);
    return;
  }

  const browserIpLocation = await getBrowserIpLocation();
  if (browserIpLocation) {
    applyLocation(browserIpLocation);
    return;
  }

  state.coords = null;
  state.label = 'Location unavailable';
  state.source = 'none';
  setStatus('Add ?lat=...&lon=... or use the precise location button.');
  render();
}

function getFixedLocation() {
  const latitude = Number(params.get('lat'));
  const longitude = Number(params.get('lon'));

  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    return null;
  }

  return {
    latitude,
    longitude,
    label: params.get('label') || 'Fixed location',
    source: 'url',
    accuracy: 'fixed'
  };
}

async function getServerGeoIp() {
  try {
    const response = await fetch('/api/geoip', { cache: 'no-store' });
    if (!response.ok) return null;
    const data = await response.json();
    return normalizeGeoPayload(data, 'server IP estimate');
  } catch {
    return null;
  }
}

async function getBrowserIpLocation() {
  try {
    const response = await fetch('https://ipapi.co/json/', { cache: 'no-store' });
    if (!response.ok) return null;
    const data = await response.json();
    return normalizeGeoPayload(data, 'browser IP estimate');
  } catch {
    return null;
  }
}

function normalizeGeoPayload(data, fallbackLabel) {
  const latitude = Number(data.latitude);
  const longitude = Number(data.longitude);

  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    return null;
  }

  const label = data.label || [data.city, data.region_code || data.region, data.country_code]
    .filter(Boolean)
    .join(', ');

  return {
    latitude,
    longitude,
    label: label || fallbackLabel,
    source: data.source || fallbackLabel,
    accuracy: data.accuracy || 'approximate'
  };
}

function useBrowserLocation() {
  if (!navigator.geolocation) {
    setStatus('This browser does not support precise location.');
    return;
  }

  setStatus('Requesting precise browser location');
  navigator.geolocation.getCurrentPosition(
    (position) => {
      applyLocation({
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
        label: 'Precise browser location',
        source: 'browser geolocation',
        accuracy: position.coords.accuracy
      });
    },
    (error) => {
      setStatus(error.message || 'Precise location was blocked.');
    },
    {
      enableHighAccuracy: false,
      timeout: 8000,
      maximumAge: 60 * 60 * 1000
    }
  );
}

function applyLocation(location) {
  state.coords = {
    latitude: location.latitude,
    longitude: location.longitude
  };
  state.label = location.label;
  state.source = location.source;

  const accuracy = typeof location.accuracy === 'number'
    ? `within about ${Math.round(location.accuracy)}m`
    : location.accuracy;

  setStatus(`Location from ${location.source}${accuracy ? ` (${accuracy})` : ''}`);
  render();
}

function setStatus(message) {
  state.status = message;
  elements.statusText.textContent = message;
}

function render() {
  const now = new Date();
  const timeParts = new Intl.DateTimeFormat(locale, {
    hour: 'numeric',
    minute: '2-digit',
    second: params.get('seconds') === '0' ? undefined : '2-digit',
    timeZone: timezone
  }).formatToParts(now);

  elements.timeValue.textContent = timeParts.map((part) => part.value).join('');
  elements.dateValue.textContent = new Intl.DateTimeFormat(locale, {
    weekday: 'long',
    month: 'short',
    day: 'numeric',
    timeZone: timezone
  }).format(now);
  elements.locationLabel.textContent = state.label;
  elements.timezoneLabel.textContent = timezone;
  elements.statusText.textContent = state.status;

  if (!state.coords) {
    renderUnavailable();
    return;
  }

  try {
    const sunTimes = getSunTimes(now, state.coords.latitude, state.coords.longitude);
    renderSun(now, sunTimes);
  } catch (error) {
    renderUnavailable(error instanceof Error ? error.message : 'Could not calculate sun times.');
  }
}

function renderSun(now, sunTimes) {
  if (sunTimes.type === 'polar-day') {
    renderExtremeDay('Polar day', 'Sun does not set', '24h');
    return;
  }

  if (sunTimes.type === 'polar-night') {
    renderExtremeDay('Polar night', 'Sun does not rise', '0m');
    return;
  }

  const progress = getDaylightProgress(now, sunTimes);
  const dayProgress = getDayProgress(now);
  const percent = Math.round(dayProgress * 100);
  const sunriseProgress = getDayProgress(sunTimes.sunrise);
  const sunsetProgress = getDayProgress(sunTimes.sunset);

  elements.modeLabel.textContent = progress.isDaylight ? 'Daylight' : 'Night';
  elements.progressValue.textContent = `${percent}% day passed`;
  elements.sunriseValue.textContent = formatTime(sunTimes.sunrise);
  elements.durationValue.textContent = formatDuration(sunTimes.daylightMs);
  elements.sunsetValue.textContent = formatTime(sunTimes.sunset);
  setTimeline({
    dayProgress,
    sunriseProgress,
    sunsetProgress,
    showSunEvents: true,
    daylightVisible: true
  });
}

function renderExtremeDay(mode, progressLabel, duration) {
  const dayProgress = getDayProgress(new Date());
  const percent = Math.round(dayProgress * 100);
  elements.modeLabel.textContent = mode;
  elements.progressValue.textContent = `${percent}% day passed`;
  elements.sunriseValue.textContent = '--';
  elements.durationValue.textContent = duration;
  elements.sunsetValue.textContent = '--';
  setTimeline({
    dayProgress,
    sunriseProgress: 0,
    sunsetProgress: 1,
    showSunEvents: false,
    daylightVisible: duration === '24h'
  });
}

function renderUnavailable(detail = 'Waiting for location') {
  elements.modeLabel.textContent = 'Daylight';
  elements.progressValue.textContent = detail;
  elements.sunriseValue.textContent = '--:--';
  elements.durationValue.textContent = '--';
  elements.sunsetValue.textContent = '--:--';
  setTimeline({
    dayProgress: getDayProgress(new Date()),
    sunriseProgress: 0,
    sunsetProgress: 0,
    showSunEvents: false,
    daylightVisible: false
  });
}

function setTimeline({
  dayProgress,
  sunriseProgress,
  sunsetProgress,
  showSunEvents,
  daylightVisible
}) {
  const dayPercent = toPercent(dayProgress);
  const sunrisePercent = toPercent(sunriseProgress);
  const sunsetPercent = toPercent(sunsetProgress);
  const daylightLeft = Math.min(sunrisePercent, sunsetPercent);
  const daylightWidth = Math.max(0, Math.abs(sunsetPercent - sunrisePercent));

  elements.barFill.style.width = `${dayPercent}%`;
  elements.sunDot.style.left = `${dayPercent}%`;
  elements.daylightWindow.style.left = `${daylightLeft}%`;
  elements.daylightWindow.style.width = daylightVisible ? `${daylightWidth}%` : '0%';
  elements.sunriseMarker.style.left = `${sunrisePercent}%`;
  elements.sunsetMarker.style.left = `${sunsetPercent}%`;
  elements.sunriseMarker.hidden = !showSunEvents;
  elements.sunsetMarker.hidden = !showSunEvents;
}

function toPercent(value) {
  return Math.round(clamp(value) * 1000) / 10;
}

function getDayProgress(date) {
  return secondsSinceMidnight(date) / 86400;
}

function secondsSinceMidnight(date) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
    timeZone: timezone
  }).formatToParts(date);

  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  const hours = Number(values.hour || 0);
  const minutes = Number(values.minute || 0);
  const seconds = Number(values.second || 0);

  return ((hours % 24) * 3600) + (minutes * 60) + seconds + (date.getMilliseconds() / 1000);
}

function formatTime(date) {
  return new Intl.DateTimeFormat(locale, {
    hour: 'numeric',
    minute: '2-digit',
    timeZone: timezone
  }).format(date);
}
