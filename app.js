(() => {
  const DEG = Math.PI / 180;
  const SUN_RADIUS = 14;
  const GLOW_RADIUS = 36;
  const GROUND_LINE = 0.5;
  const CIRCLE_RADIUS_RATIO = 0.38;
  const SKY_TOP_MARGIN = 52;
  const TICK_MS = 1000;
  const DAY_CHECK_MS = 30000;

  const canvas = document.getElementById("sky-canvas");
  const ctx = canvas.getContext("2d");
  const slider = document.getElementById("time-slider");
  const percentageEl = document.getElementById("percentage");
  const timeEl = document.getElementById("current-time");
  const elevationEl = document.getElementById("elevation");
  const dayLengthEl = document.getElementById("day-length");
  const maxElevationEl = document.getElementById("max-elevation");
  const altitudeEl = document.getElementById("altitude");
  const sunriseLabel = document.getElementById("sunrise-label");
  const noonLabel = document.getElementById("noon-label");
  const sunsetLabel = document.getElementById("sunset-label");
  const locationText = document.getElementById("location-text");
  const nowBtn = document.getElementById("now-btn");
  const manualBtn = document.getElementById("manual-location-btn");
  const locateBtn = document.getElementById("locate-btn");
  const dialog = document.getElementById("location-dialog");
  const locationForm = document.getElementById("location-form");
  const latInput = document.getElementById("lat-input");
  const lonInput = document.getElementById("lon-input");
  const mapCoordsEl = document.getElementById("map-coords");
  const cancelLocation = document.getElementById("cancel-location");

  let lat = null;
  let lon = null;
  let dayEvents = null;
  let followNow = false;
  let trackedDay = null;
  let midnightTimer = null;
  let locationMap = null;
  let locationMarker = null;
  let pickLat = 35.5951;
  let pickLon = -82.5515;
  let terrainAltitudeM = 0;

  function lerpColor(a, b, t) {
    return a.map((v, i) => Math.round(v + (b[i] - v) * t));
  }

  function rgb(c) {
    return `rgb(${c[0]}, ${c[1]}, ${c[2]})`;
  }

  function formatAltitude(meters) {
    return `${Math.round(meters * 3.28084).toLocaleString()} ft`;
  }

  function setTerrainAltitude(meters) {
    terrainAltitudeM = Number.isFinite(meters) ? Math.max(0, meters) : 0;
  }

  async function updateAltitude(latitude, longitude, gpsAltitude) {
    altitudeEl.textContent = "…";
    if (Number.isFinite(gpsAltitude)) {
      setTerrainAltitude(gpsAltitude);
      altitudeEl.textContent = formatAltitude(gpsAltitude);
      update();
      return;
    }
    try {
      const res = await fetch(
        `https://api.open-meteo.com/v1/elevation?latitude=${latitude}&longitude=${longitude}`
      );
      const data = await res.json();
      if (Number.isFinite(data.elevation?.[0])) {
        setTerrainAltitude(data.elevation[0]);
        altitudeEl.textContent = formatAltitude(data.elevation[0]);
        update();
      } else {
        setTerrainAltitude(0);
        altitudeEl.textContent = "—";
      }
    } catch {
      setTerrainAltitude(0);
      altitudeEl.textContent = "—";
    }
  }

  function setLocation(newLat, newLon, label, gpsAltitude = null) {
    lat = newLat;
    lon = newLon;
    locationText.textContent = label;
    latInput.value = newLat.toFixed(4);
    lonInput.value = newLon.toFixed(4);
    updateAltitude(newLat, newLon, gpsAltitude);
    refreshDay();
  }

  function ensureCurrentDay() {
    const stamp = Solar.dayStamp(new Date());
    if (trackedDay === stamp) return false;
    refreshDay();
    return true;
  }

  function scheduleMidnightRefresh() {
    clearTimeout(midnightTimer);
    const now = new Date();
    const nextMidnight = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate() + 1
    );
    midnightTimer = setTimeout(() => {
      refreshDay();
      scheduleMidnightRefresh();
    }, nextMidnight.getTime() - now.getTime() + 100);
  }

  function getSolarTime() {
    const now = new Date();
    if (!dayEvents) return now;
    if (followNow) return now;
    return Solar.sliderToTime(Number(slider.value), now);
  }

  function syncSliderToNow() {
    slider.value = Solar.sliderForNow(new Date());
  }

  function updateSliderMarkers() {
    if (!dayEvents) return;
    const sunrisePos = (Solar.timeToSlider(dayEvents.sunrise) / 1000) * 100;
    const noonPos = (Solar.timeToSlider(dayEvents.solarNoon) / 1000) * 100;
    const sunsetPos = (Solar.timeToSlider(dayEvents.sunset) / 1000) * 100;
    slider.style.setProperty("--sunrise-pos", `${sunrisePos}%`);
    slider.style.setProperty("--noon-pos", `${noonPos}%`);
    slider.style.setProperty("--sunset-pos", `${sunsetPos}%`);
  }

  function refreshDay() {
    if (lat == null || lon == null) return;

    const now = new Date();
    dayEvents = Solar.getDayEvents(lat, lon, now);
    trackedDay = Solar.dayStamp(now);

    sunriseLabel.textContent = `Sunrise ${Solar.formatTime(dayEvents.sunrise)}`;
    noonLabel.textContent = `Noon ${Solar.formatTime(dayEvents.solarNoon)}`;
    sunsetLabel.textContent = `Sunset ${Solar.formatTime(dayEvents.sunset)}`;
    dayLengthEl.textContent = Solar.formatDuration(
      dayEvents.sunset - dayEvents.sunrise
    );
    maxElevationEl.textContent = `${dayEvents.maxElevation.toFixed(1)}°`;

    updateSliderMarkers();

    if (followNow) syncSliderToNow();

    scheduleMidnightRefresh();
    update();
  }

  function skyColors(elevation, pct) {
    const t = Math.max(0, Math.min(1, elevation / 70));
    const warmth = pct / 100;
    return {
      top: lerpColor([15, 20, 40], [55, 130, 210], t),
      mid: lerpColor([35, 45, 75], [120, 185, 240], t),
      horizon: lerpColor(
        [180, 90, 50],
        [255, 220, 160],
        Math.max(t, warmth * 0.6)
      ),
    };
  }

  function circleRadius(w, h, groundY) {
    return Math.min(
      w * CIRCLE_RADIUS_RATIO,
      w * 0.46,
      groundY - SKY_TOP_MARGIN,
      h - groundY - 28
    );
  }

  function sunOnCircle(solarTime, groundY, arcR, arcCx) {
    const angle = Solar.cycleAngleForEvents(solarTime, dayEvents);
    return {
      x: arcCx + Math.cos(angle) * arcR,
      y: groundY - Math.sin(angle) * arcR,
      angle,
    };
  }

  function isDaylight(solarTime) {
    const t = solarTime.getTime();
    return t >= dayEvents.sunrise.getTime() && t <= dayEvents.sunset.getTime();
  }

  function drawSun(sunX, sunY, groundY, w, belowHorizon, straddlesHorizon) {
    const alpha = belowHorizon ? 0.45 : 1;

    ctx.save();
    ctx.globalAlpha = alpha;
    if (!belowHorizon && !straddlesHorizon) {
      ctx.beginPath();
      ctx.rect(0, 0, w, groundY);
      ctx.clip();
    }

    const glow = ctx.createRadialGradient(sunX, sunY, 0, sunX, sunY, GLOW_RADIUS * 2);
    glow.addColorStop(0, "rgba(255, 230, 150, 0.35)");
    glow.addColorStop(0.4, "rgba(255, 180, 60, 0.12)");
    glow.addColorStop(1, "rgba(255, 150, 40, 0)");
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(sunX, sunY, GLOW_RADIUS * 2, 0, Math.PI * 2);
    ctx.fill();

    const sunGrad = ctx.createRadialGradient(
      sunX - 4,
      sunY - 4,
      2,
      sunX,
      sunY,
      SUN_RADIUS
    );
    sunGrad.addColorStop(0, "#fffbe8");
    sunGrad.addColorStop(0.6, "#ffd54a");
    sunGrad.addColorStop(1, "#f5a623");
    ctx.fillStyle = sunGrad;
    ctx.beginPath();
    ctx.arc(sunX, sunY, SUN_RADIUS, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  function drawSky(elevation, pct, solarTime) {
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    if (w < 1 || h < 1) return;

    const colors = skyColors(elevation, pct);
    const groundY = h * GROUND_LINE;
    const arcR = circleRadius(w, h, groundY);
    const arcCx = w / 2;

    const skyGrad = ctx.createLinearGradient(0, 0, 0, groundY);
    skyGrad.addColorStop(0, rgb(colors.top));
    skyGrad.addColorStop(0.55, rgb(colors.mid));
    skyGrad.addColorStop(1, rgb(colors.horizon));
    ctx.fillStyle = skyGrad;
    ctx.fillRect(0, 0, w, groundY);

    const groundBright = pct / 100;
    const groundGrad = ctx.createLinearGradient(0, groundY, 0, h);
    groundGrad.addColorStop(0, rgb(lerpColor([18, 32, 16], [78, 128, 62], groundBright)));
    groundGrad.addColorStop(1, rgb(lerpColor([10, 18, 9], [32, 52, 26], groundBright)));
    ctx.fillStyle = groundGrad;
    ctx.fillRect(0, groundY, w, h - groundY);

    ctx.strokeStyle = "rgba(255,255,255,0.08)";
    ctx.beginPath();
    ctx.moveTo(0, groundY);
    ctx.lineTo(w, groundY);
    ctx.stroke();

    ctx.setLineDash([4, 6]);
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = "rgba(255,255,255,0.1)";
    ctx.beginPath();
    ctx.arc(arcCx, groundY, arcR, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);

    const { x: sunX, y: sunY } = sunOnCircle(solarTime, groundY, arcR, arcCx);
    const daylight = isDaylight(solarTime);
    const straddlesHorizon =
      sunY + SUN_RADIUS > groundY && sunY - SUN_RADIUS < groundY;
    drawSun(sunX, sunY, groundY, w, !daylight, straddlesHorizon);

    ctx.fillStyle = "rgba(255,255,255,0.45)";
    ctx.font = "10px DM Sans, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("E", arcCx - arcR - 6, groundY + 14);
    ctx.fillText("W", arcCx + arcR + 6, groundY + 14);
    ctx.fillText("N", arcCx, groundY - arcR - 8);
    ctx.fillStyle = "rgba(255, 255, 255, 0.3)";
    ctx.fillText("Midnight", arcCx, groundY + arcR + 14);
  }

  function resizeCanvas() {
    const parent = canvas.parentElement;
    const rect = parent.getBoundingClientRect();
    if (rect.width < 1 || rect.height < 1) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(rect.width * dpr);
    canvas.height = Math.round(rect.height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function update() {
    if (!dayEvents) return;
    if (ensureCurrentDay()) return;

    if (followNow) syncSliderToNow();

    const now = new Date();
    const solarTime = getSolarTime();
    const { elevation } = Solar.getPosition(lat, lon, solarTime);
    const pct = Solar.irradiancePercent(
      elevation,
      dayEvents.maxElevation,
      terrainAltitudeM
    );

    percentageEl.textContent = `${pct.toFixed(1)}%`;
    timeEl.textContent = Solar.formatTime(followNow ? now : solarTime);
    elevationEl.textContent = `${Math.max(0, elevation).toFixed(1)}°`;
    drawSky(elevation, pct, solarTime);
  }

  function updateMapCoordsDisplay() {
    mapCoordsEl.textContent = `${pickLat.toFixed(4)}°, ${pickLon.toFixed(4)}°`;
    latInput.value = pickLat.toFixed(4);
    lonInput.value = pickLon.toFixed(4);
  }

  function setMapPin(newLat, newLon, pan = false) {
    pickLat = newLat;
    pickLon = newLon;
    updateMapCoordsDisplay();
    if (!locationMap) return;

    if (locationMarker) {
      locationMarker.setLatLng([newLat, newLon]);
    } else {
      locationMarker = L.marker([newLat, newLon], { draggable: true }).addTo(
        locationMap
      );
      locationMarker.on("dragend", () => {
        const pos = locationMarker.getLatLng();
        setMapPin(pos.lat, pos.lng);
      });
    }

    if (pan) locationMap.setView([newLat, newLon], locationMap.getZoom());
  }

  function initLocationMap() {
    if (locationMap) return;

    locationMap = L.map("location-map", {
      zoomControl: true,
      attributionControl: true,
    });

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    }).addTo(locationMap);

    locationMap.on("click", (event) => {
      setMapPin(event.latlng.lat, event.latlng.lng);
    });
  }

  function openLocationDialog() {
    const startLat = lat ?? 35.5951;
    const startLon = lon ?? -82.5515;
    pickLat = startLat;
    pickLon = startLon;
    updateMapCoordsDisplay();
    dialog.showModal();

    requestAnimationFrame(() => {
      initLocationMap();
      const zoom = lat != null ? 10 : 4;
      locationMap.setView([startLat, startLon], zoom);
      setMapPin(startLat, startLon);
      locationMap.invalidateSize();
    });
  }

  function requestLocation(userInitiated = false) {
    if (userInitiated) locationText.textContent = "Detecting location…";

    if (!navigator.geolocation) {
      locationText.textContent = "Geolocation unavailable";
      openLocationDialog();
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude, longitude, altitude } = pos.coords;
        followNow = true;
        setLocation(
          latitude,
          longitude,
          `${latitude.toFixed(2)}°, ${longitude.toFixed(2)}°`,
          altitude
        );
      },
      () => {
        locationText.textContent = "Location denied — set on map";
        openLocationDialog();
      },
      { enableHighAccuracy: false, timeout: 10000 }
    );
  }

  slider.addEventListener("input", () => {
    followNow = false;
    update();
  });

  nowBtn.addEventListener("click", () => {
    followNow = true;
    refreshDay();
  });

  manualBtn.addEventListener("click", openLocationDialog);
  locateBtn.addEventListener("click", () => requestLocation(true));
  cancelLocation.addEventListener("click", () => dialog.close());

  locationForm.addEventListener("submit", (e) => {
    e.preventDefault();
    if (Number.isFinite(pickLat) && Number.isFinite(pickLon)) {
      followNow = true;
      setLocation(
        pickLat,
        pickLon,
        `${pickLat.toFixed(2)}°, ${pickLon.toFixed(2)}°`
      );
      dialog.close();
    }
  });

  function onLayoutChange() {
    resizeCanvas();
    update();
  }

  window.addEventListener("resize", onLayoutChange);
  new ResizeObserver(onLayoutChange).observe(canvas.parentElement);

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") refreshDay();
  });

  window.addEventListener("pageshow", (event) => {
    if (event.persisted) refreshDay();
  });

  window.addEventListener("focus", () => {
    if (lat != null) ensureCurrentDay();
  });

  setInterval(() => {
    if (lat == null) return;
    if (ensureCurrentDay()) return;
    if (followNow) {
      syncSliderToNow();
      update();
    }
  }, TICK_MS);

  setInterval(() => {
    if (lat == null) return;
    ensureCurrentDay();
  }, DAY_CHECK_MS);

  resizeCanvas();
  requestLocation();
})();