const widthInput = document.querySelector('#widthInput');
const heightInput = document.querySelector('#heightInput');
const locationInput = document.querySelector('#locationInput');
const secondsToggle = document.querySelector('#secondsToggle');
const chromeToggle = document.querySelector('#chromeToggle');
const copyButton = document.querySelector('#copyButton');
const copyLabel = document.querySelector('#copyLabel');
const liveFrame = document.querySelector('#liveFrame');
const sizeLabel = document.querySelector('#sizeLabel');

const baseParams = {
  lat: '48.1486',
  lon: '17.1077'
};

function widgetUrl(extra = {}) {
  const params = new URLSearchParams();

  Object.entries({
    ...baseParams,
    label: locationInput.value.trim() || 'Bratislava',
    ...extra
  }).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') {
      params.set(key, value);
    }
  });

  if (!secondsToggle.checked) params.set('seconds', '0');
  if (!chromeToggle.checked) params.set('chrome', '0');

  return `/widgets/daylight/?${params.toString()}`;
}

function updateLiveFrame() {
  const width = clampNumber(widthInput.value, 280, 900);
  const height = clampNumber(heightInput.value, 180, 520);

  widthInput.value = width;
  heightInput.value = height;
  sizeLabel.textContent = `${width} x ${height}`;
  liveFrame.style.width = `${width}px`;
  liveFrame.style.height = `${height}px`;
  liveFrame.src = widgetUrl();
}

function updatePresetFrames() {
  document.querySelectorAll('[data-preset]').forEach((frame) => {
    const [width, height] = frame.dataset.preset.split('x').map(Number);
    frame.style.width = `${width}px`;
    frame.style.height = `${height}px`;
    frame.src = widgetUrl({ compact: width <= 380 ? '1' : undefined });
  });
}

function clampNumber(value, min, max) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return min;
  return Math.min(max, Math.max(min, Math.round(parsed)));
}

function updateAll() {
  updateLiveFrame();
  updatePresetFrames();
}

async function copyWidgetUrl() {
  const absoluteUrl = new URL(widgetUrl(), window.location.origin).toString();

  try {
    await navigator.clipboard.writeText(absoluteUrl);
    copyButton.dataset.copied = 'true';
    copyLabel.textContent = 'Copied';
    setTimeout(() => {
      copyButton.dataset.copied = 'false';
      copyLabel.textContent = 'Copy URL';
    }, 1200);
  } catch {
    window.prompt('Widget URL', absoluteUrl);
  }
}

[widthInput, heightInput, locationInput, secondsToggle, chromeToggle].forEach((control) => {
  control.addEventListener('input', updateAll);
  control.addEventListener('change', updateAll);
});

copyButton.addEventListener('click', copyWidgetUrl);
updateAll();
