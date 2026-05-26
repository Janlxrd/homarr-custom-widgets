import assert from 'node:assert/strict';
import test from 'node:test';
import {
  formatDuration,
  getDaylightProgress,
  getSunTimes
} from '../public/widgets/daylight/solar.js';

test('calculates long summer daylight for Bratislava', () => {
  const times = getSunTimes(new Date('2026-06-21T12:00:00Z'), 48.1486, 17.1077);

  assert.equal(times.type, 'normal');
  assert.ok(times.sunrise < times.sunset);

  const hours = times.daylightMs / 1000 / 60 / 60;
  assert.ok(hours > 15);
  assert.ok(hours < 17);
});

test('daylight progress clamps before and after daylight', () => {
  const times = {
    type: 'normal',
    sunrise: new Date('2026-05-26T05:00:00Z'),
    sunset: new Date('2026-05-26T17:00:00Z')
  };

  assert.equal(getDaylightProgress(new Date('2026-05-26T03:00:00Z'), times).progress, 0);
  assert.equal(getDaylightProgress(new Date('2026-05-26T19:00:00Z'), times).progress, 1);
  assert.equal(getDaylightProgress(new Date('2026-05-26T11:00:00Z'), times).progress, 0.5);
});

test('handles polar day without sunrise and sunset', () => {
  const times = getSunTimes(new Date('2026-06-21T12:00:00Z'), 78.2232, 15.6267);

  assert.equal(times.type, 'polar-day');
  assert.equal(times.sunrise, null);
  assert.equal(times.sunset, null);
});

test('formats durations compactly', () => {
  assert.equal(formatDuration(13 * 60 * 60 * 1000 + 52 * 60 * 1000), '13h 52m');
  assert.equal(formatDuration(42 * 60 * 1000), '42m');
});
