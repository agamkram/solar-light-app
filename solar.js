/**
 * Solar position and irradiance (SunCalc / aa.quae.nl).
 */
const Solar = (() => {
  const PI = Math.PI;
  const DEG = PI / 180;
  const RAD = 180 / PI;
  const dayMs = 86400000;
  const J1970 = 2440588;
  const J2000 = 2451545;
  const OBLIQUITY = DEG * 23.4397;
  const SUNRISE_ANGLE = -0.833 * DEG;

  function toJulian(date) {
    return date.valueOf() / dayMs - 0.5 + J1970;
  }

  function fromJulian(j) {
    return new Date((j + 0.5 - J1970) * dayMs);
  }

  function toDays(date) {
    return toJulian(date) - J2000;
  }

  function rightAscension(l) {
    return Math.atan2(
      Math.sin(l) * Math.cos(OBLIQUITY),
      Math.cos(l)
    );
  }

  function declination(l) {
    return Math.asin(Math.sin(OBLIQUITY) * Math.sin(l));
  }

  function siderealTime(d, lw) {
    return DEG * (280.16 + 360.9856235 * d) - lw;
  }

  function solarMeanAnomaly(d) {
    return DEG * (357.5291 + 0.98560028 * d);
  }

  function eclipticLongitude(M) {
    const C =
      DEG *
      (1.9148 * Math.sin(M) +
        0.02 * Math.sin(2 * M) +
        0.0003 * Math.sin(3 * M));
    const P = DEG * 102.9372;
    return M + C + P + PI;
  }

  function sunCoords(d) {
    const M = solarMeanAnomaly(d);
    const L = eclipticLongitude(M);
    return { dec: declination(L), ra: rightAscension(L) };
  }

  function altitude(H, phi, dec) {
    return Math.asin(
      Math.sin(phi) * Math.sin(dec) +
        Math.cos(phi) * Math.cos(dec) * Math.cos(H)
    );
  }

  function astroRefraction(h) {
    if (h < 0) h = 0;
    return 0.0002967 / Math.tan(h + 0.00312536 / (h + 0.08901179));
  }

  function getPosition(lat, lon, date) {
    const lw = DEG * -lon;
    const phi = DEG * lat;
    const d = toDays(date);
    const c = sunCoords(d);
    const H = siderealTime(d, lw) - c.ra;
    const geometric = altitude(H, phi, c.dec);
    return { elevation: (geometric + astroRefraction(geometric)) * RAD };
  }

  const J0 = 0.0009;

  function julianCycle(d, lw) {
    return Math.round(d - J0 - lw / (2 * PI));
  }

  function approxTransit(Ht, lw, n) {
    return J0 + (Ht + lw) / (2 * PI) + n;
  }

  function solarTransitJ(ds, M, L) {
    return J2000 + ds + 0.0053 * Math.sin(M) - 0.0069 * Math.sin(2 * L);
  }

  function hourAngle(h, phi, dec) {
    return Math.acos(
      (Math.sin(h) - Math.sin(phi) * Math.sin(dec)) /
        (Math.cos(phi) * Math.cos(dec))
    );
  }

  function getSetJ(h, lw, phi, dec, n, M, L) {
    const w = hourAngle(h, phi, dec);
    const a = approxTransit(w, lw, n);
    return solarTransitJ(a, M, L);
  }

  function getDayEvents(lat, lon, date) {
    const lw = DEG * -lon;
    const phi = DEG * lat;
    const d = toDays(date);
    const n = julianCycle(d, lw);
    const ds = approxTransit(0, lw, n);
    const M = solarMeanAnomaly(ds);
    const L = eclipticLongitude(M);
    const dec = declination(L);
    const Jnoon = solarTransitJ(ds, M, L);
    const Jset = getSetJ(SUNRISE_ANGLE, lw, phi, dec, n, M, L);
    const Jrise = Jnoon - (Jset - Jnoon);
    const solarNoon = fromJulian(Jnoon);

    return {
      sunrise: fromJulian(Jrise),
      sunset: fromJulian(Jset),
      solarNoon,
      maxElevation: getPosition(lat, lon, solarNoon).elevation,
    };
  }

  function irradiancePercent(elevation, maxElevation) {
    if (elevation <= 0 || maxElevation <= 0) return 0;
    const ratio =
      Math.sin(elevation * DEG) / Math.sin(maxElevation * DEG);
    return Math.max(0, Math.min(100, ratio * 100));
  }

  function formatTime(date) {
    return date.toLocaleTimeString([], {
      hour: "numeric",
      minute: "2-digit",
    });
  }

  function formatDuration(ms) {
    const totalMin = Math.round(ms / 60000);
    const h = Math.floor(totalMin / 60);
    const m = totalMin % 60;
    return `${h}h ${m}m`;
  }

  function sliderToTime(sunrise, sunset, sliderValue) {
    const t = sliderValue / 1000;
    return new Date(
      sunrise.getTime() + t * (sunset.getTime() - sunrise.getTime())
    );
  }

  function timeToSlider(sunrise, sunset, time) {
    const span = sunset.getTime() - sunrise.getTime();
    if (span <= 0) return 500;
    const t = (time.getTime() - sunrise.getTime()) / span;
    return Math.round(Math.max(0, Math.min(1, t)) * 1000);
  }

  /** 0 = before sunrise, 1000 = after sunset, otherwise proportional. */
  function sliderForNow(sunrise, sunset, now) {
    if (now < sunrise) return 0;
    if (now > sunset) return 1000;
    return timeToSlider(sunrise, sunset, now);
  }

  return {
    getPosition,
    getDayEvents,
    irradiancePercent,
    formatTime,
    formatDuration,
    sliderToTime,
    timeToSlider,
    sliderForNow,
  };
})();