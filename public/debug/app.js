const rows = document.querySelector('#rows');
const origin = window.location.origin;
const logPrefix = '[homarr-iframes:debug]';

console.info(`${logPrefix} loaded`, { origin });

add('Current origin', origin, true);
add('Dashdot widget URL', `${origin}/widgets/dashdot/`, true);
add('Daylight widget URL', `${origin}/widgets/daylight/`, true);

await check('Health endpoint', '/healthz');
await check('Dashdot summary endpoint', '/api/dashdot/summary');

async function check(label, url) {
  try {
    const response = await fetch(url, { cache: 'no-store' });
    const text = await response.text();
    add(label, `${response.status} ${response.statusText}: ${text.slice(0, 500)}`, response.ok);
    if (!response.ok) {
      console.error(`${logPrefix} ${label} failed`, {
        url,
        status: response.status,
        statusText: response.statusText,
        body: text
      });
    }
  } catch (error) {
    console.error(`${logPrefix} ${label} request failed`, { url, error });
    add(label, error instanceof Error ? error.message : String(error), false);
  }
}

function add(label, value, ok) {
  const row = document.createElement('div');
  const title = document.createElement('strong');
  const code = document.createElement('code');

  row.className = 'row';
  title.textContent = label;
  code.className = ok ? 'ok' : 'bad';
  code.textContent = value;
  row.append(title, code);
  rows.append(row);
}
