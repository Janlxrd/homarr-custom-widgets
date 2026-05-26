const dayMs = 1000 * 60 * 60 * 24;
const rad = Math.PI / 180;
const j1970 = 2440588;
const j2000 = 2451545;
const e = rad * 23.4397;
const j0 = 0.0009;

function toJulian(date) {
  return date.valueOf() / dayMs - 0.5 + j1970;
}

function fromJulian(julian) {
  return new Date((julian + 0.5 - j1970) * dayMs);
}

function toDays(date) {
  return toJulian(date) - j2000;
}

function rightAscension(longitude, latitude) {
  return Math.atan2(
    Math.sin(longitude) * Math.cos(e) - Math.tan(latitude) * Math.sin(e),
    Math.cos(longitude)
  );
}

function declination(longitude, latitude) {
  return Math.asin(
    Math.sin(latitude) * Math.cos(e) + Math.cos(latitude) * Math.sin(e) * Math.sin(longitude)
  );
}

function siderealTime(days, longitudeWest) {
  return rad * (280.16 + 360.9856235 * days) - longitudeWest;
}

function azimuth(hourAngleValue, latitude, declinationValue) {
  return Math.atan2(
    Math.sin(hourAngleValue),
    Math.cos(hourAngleValue) * Math.sin(latitude) - Math.tan(declinationValue) * Math.cos(latitude)
  );
}

function altitude(hourAngleValue, latitude, declinationValue) {
  return Math.asin(
    Math.sin(latitude) * Math.sin(declinationValue)
      + Math.cos(latitude) * Math.cos(declinationValue) * Math.cos(hourAngleValue)
  );
}

function solarMeanAnomaly(days) {
  return rad * (357.5291 + 0.98560028 * days);
}

function eclipticLongitude(meanAnomaly) {
  const center = rad * (
    1.9148 * Math.sin(meanAnomaly)
      + 0.02 * Math.sin(2 * meanAnomaly)
      + 0.0003 * Math.sin(3 * meanAnomaly)
  );
  const perihelion = rad * 102.9372;
  return meanAnomaly + center + perihelion + Math.PI;
}

function julianCycle(days, longitudeWest) {
  return Math.round(days - j0 - longitudeWest / (2 * Math.PI));
}

function approxTransit(hourAngleValue, longitudeWest, cycle) {
  return j0 + (hourAngleValue + longitudeWest) / (2 * Math.PI) + cycle;
}

function solarTransitJulian(approxTransitValue, meanAnomaly, eclipticLongitudeValue) {
  return j2000
    + approxTransitValue
    + 0.0053 * Math.sin(meanAnomaly)
    - 0.0069 * Math.sin(2 * eclipticLongitudeValue);
}

function hourAngle(height, latitude, declinationValue) {
  const cosHourAngle = (
    Math.sin(height) - Math.sin(latitude) * Math.sin(declinationValue)
  ) / (Math.cos(latitude) * Math.cos(declinationValue));

  if (cosHourAngle > 1) return { type: 'polar-night', value: NaN };
  if (cosHourAngle < -1) return { type: 'polar-day', value: NaN };

  return { type: 'normal', value: Math.acos(cosHourAngle) };
}

function getSetJulian(height, longitudeWest, latitude, declinationValue, cycle, meanAnomaly, eclipticLongitudeValue) {
  const angle = hourAngle(height, latitude, declinationValue);
  if (angle.type !== 'normal') return angle;

  const setTransit = approxTransit(angle.value, longitudeWest, cycle);
  return {
    type: 'normal',
    value: solarTransitJulian(setTransit, meanAnomaly, eclipticLongitudeValue)
  };
}

export function getSunPosition(date, latitude, longitude) {
  const longitudeWest = rad * -longitude;
  const latitudeRad = rad * latitude;
  const days = toDays(date);
  const meanAnomaly = solarMeanAnomaly(days);
  const eclipticLongitudeValue = eclipticLongitude(meanAnomaly);
  const declinationValue = declination(eclipticLongitudeValue, 0);
  const rightAscensionValue = rightAscension(eclipticLongitudeValue, 0);
  const hourAngleValue = siderealTime(days, longitudeWest) - rightAscensionValue;

  return {
    azimuth: azimuth(hourAngleValue, latitudeRad, declinationValue),
    altitude: altitude(hourAngleValue, latitudeRad, declinationValue)
  };
}

export function getSunTimes(date, latitude, longitude) {
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    throw new TypeError('Latitude and longitude must be finite numbers.');
  }

  const longitudeWest = rad * -longitude;
  const latitudeRad = rad * latitude;
  const days = toDays(date);
  const cycle = julianCycle(days, longitudeWest);
  const transit = approxTransit(0, longitudeWest, cycle);
  const meanAnomaly = solarMeanAnomaly(transit);
  const eclipticLongitudeValue = eclipticLongitude(meanAnomaly);
  const declinationValue = declination(eclipticLongitudeValue, 0);
  const solarNoonJulian = solarTransitJulian(transit, meanAnomaly, eclipticLongitudeValue);
  const setJulian = getSetJulian(
    -0.833 * rad,
    longitudeWest,
    latitudeRad,
    declinationValue,
    cycle,
    meanAnomaly,
    eclipticLongitudeValue
  );

  const solarNoon = fromJulian(solarNoonJulian);

  if (setJulian.type !== 'normal') {
    return {
      type: setJulian.type,
      solarNoon,
      sunrise: null,
      sunset: null,
      daylightMs: setJulian.type === 'polar-day' ? dayMs : 0
    };
  }

  const sunriseJulian = solarNoonJulian - (setJulian.value - solarNoonJulian);
  const sunrise = fromJulian(sunriseJulian);
  const sunset = fromJulian(setJulian.value);

  return {
    type: 'normal',
    solarNoon,
    sunrise,
    sunset,
    daylightMs: sunset.valueOf() - sunrise.valueOf()
  };
}

export function clamp(value, min = 0, max = 1) {
  return Math.min(max, Math.max(min, value));
}

export function getDaylightProgress(now, sunTimes) {
  if (sunTimes.type === 'polar-day') {
    return { progress: 1, isDaylight: true, elapsedMs: dayMs, remainingMs: 0 };
  }

  if (sunTimes.type === 'polar-night') {
    return { progress: 0, isDaylight: false, elapsedMs: 0, remainingMs: dayMs };
  }

  const start = sunTimes.sunrise.valueOf();
  const end = sunTimes.sunset.valueOf();
  const current = now.valueOf();
  const progress = clamp((current - start) / (end - start));

  return {
    progress,
    isDaylight: current >= start && current <= end,
    elapsedMs: clamp(current - start, 0, end - start),
    remainingMs: clamp(end - current, 0, end - start)
  };
}

export function formatDuration(milliseconds) {
  const totalMinutes = Math.max(0, Math.round(milliseconds / 60000));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  if (hours <= 0) return `${minutes}m`;
  if (minutes === 0) return `${hours}h`;
  return `${hours}h ${minutes}m`;
}
