(() => {
  const DEG = Math.PI / 180;
  const SUN_RADIUS = 14;
  const GLOW_RADIUS = 36;
  const TUCK_FADE_DEG = 4;
  const GROUND_LINE = 0.66;
  const ARC_RADIUS_RATIO = 0.42;
  const SKY_TOP_MARGIN = 20;
  const TICK_MS = 30000;

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
  const dialog = document.getElementById("location-dialog");
  const locationForm = document.getElementById("location-form");
  const latInput = document.getElementById("lat-input");
  const lonInput = document.getElementById("lon-input");
  const cancelLocation = document.getElementById("cancel-location");

  let lat = null;
  let lon = null;
  let dayEvents = null;
  let followNow = false;
  let trackedDay = null;

  function lerpColor(a, b, t) {
    return a.map((v, i) => Math.round(v + (b[i] - v) * t));
  }

  function rgb(c) {
    return `rgb(${c[0]}, ${c[1]}, ${c[2]})`;
  }

  function formatAltitude(meters) {
    return `${Math.round(meters * 3.28084).toLocaleString()} ft`;
  }

  async function updateAltitude(latitude, longitude, gpsAltitude) {
    altitudeEl.textContent = "…";
    if (Number.isFinite(gpsAltitude)) {
      altitudeEl.textContent = formatAltitude(gpsAltitude);
      return;
    }
    try {
      const res = await fetch(
        `https://api.open-meteo.com/v1/elevation?latitude=${latitude}&longitude=${longitude}`
      );
      const data = await res.json();
      altitudeEl.textContent = Number.isFinite(data.elevation?.[0])
        ? formatAltitude(data.elevation[0])
        : "—";
    } catch {
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

  function dayStamp(date) {
    return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
  }

  function getSolarTime() {
    const now = new Date();
    if (!dayEvents) return now;
    if (followNow) return now;
    return Solar.sliderToTime(
      dayEvents.sunrise,
      dayEvents.sunset,
      Number(slider.value)
    );
  }

  function syncSliderToNow() {
    const now = new Date();
    slider.value = Solar.sliderForNow(
      dayEvents.sunrise,
      dayEvents.sunset,
      now
    );
  }

  function refreshDay() {
    if (lat == null || lon == null) return;

    const now = new Date();
    trackedDay = dayStamp(now);
    dayEvents = Solar.getDayEvents(lat, lon, now);

    sunriseLabel.textContent = `Sunrise ${Solar.formatTime(dayEvents.sunrise)}`;
    noonLabel.textContent = `Noon ${Solar.formatTime(dayEvents.solarNoon)}`;
    sunsetLabel.textContent = `Sunset ${Solar.formatTime(dayEvents.sunset)}`;
    dayLengthEl.textContent = Solar.formatDuration(
      dayEvents.sunset - dayEvents.sunrise
    );
    maxElevationEl.textContent = `${dayEvents.maxElevation.toFixed(1)}°`;

    const noonSlider = Solar.timeToSlider(
      dayEvents.sunrise,
      dayEvents.sunset,
      dayEvents.solarNoon
    );
    slider.style.setProperty("--noon-pos", `${(noonSlider / 1000) * 100}%`);

    if (followNow) syncSliderToNow();

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

  function sunPosition(elevation, maxElev, isAfternoon, groundY, arcR) {
    const elevRad = elevation * DEG;
    const maxElevRad = maxElev * DEG;
    const heightPx = (Math.sin(elevRad) / Math.sin(maxElevRad)) * arcR;
    const heightFrac = Math.max(0, Math.min(1, heightPx / arcR));
    const arcAngle = isAfternoon
      ? (heightFrac > 0 ? Math.asin(heightFrac) : 0)
      : (heightFrac > 0 ? Math.PI - Math.asin(heightFrac) : Math.PI);
    const arcCx = canvas.clientWidth / 2;
    const tuck =
      elevation <= 0
        ? SUN_RADIUS
        : SUN_RADIUS * (1 - Math.min(1, elevation / TUCK_FADE_DEG));

    return {
      x: arcCx + Math.cos(arcAngle) * arcR,
      y: groundY - heightPx + tuck,
    };
  }

  function drawSun(sunX, sunY, groundY, w) {
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, w, groundY);
    ctx.clip();

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

  function arcRadius(w, groundY) {
    return Math.min(
      w * ARC_RADIUS_RATIO,
      w * 0.48,
      Math.max(0, groundY - SKY_TOP_MARGIN)
    );
  }

  function drawSky(elevation, pct, isAfternoon, maxElev) {
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    if (w < 1 || h < 1) return;

    const colors = skyColors(elevation, pct);
    const groundY = h * GROUND_LINE;
    const arcR = arcRadius(w, groundY);
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
    ctx.strokeStyle = "rgba(255,255,255,0.12)";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(arcCx, groundY, arcR, Math.PI, 0);
    ctx.stroke();
    ctx.setLineDash([]);

    const { x: sunX, y: sunY } = sunPosition(
      elevation,
      maxElev,
      isAfternoon,
      groundY,
      arcR
    );
    if (sunY - SUN_RADIUS < groundY) {
      drawSun(sunX, sunY, groundY, w);
    }

    ctx.fillStyle = "rgba(255,255,255,0.45)";
    ctx.font = "11px DM Sans, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("E", arcCx - arcR - 8, groundY + 16);
    ctx.fillText("W", arcCx + arcR + 8, groundY + 16);
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

    if (followNow) syncSliderToNow();

    const now = new Date();
    const solarTime = getSolarTime();
    const { elevation } = Solar.getPosition(lat, lon, solarTime);
    const pct = Solar.irradiancePercent(elevation, dayEvents.maxElevation);

    percentageEl.textContent = `${pct.toFixed(1)}%`;
    timeEl.textContent = Solar.formatTime(followNow ? now : solarTime);
    elevationEl.textContent = `${Math.max(0, elevation).toFixed(1)}°`;
    drawSky(
      elevation,
      pct,
      solarTime >= dayEvents.solarNoon,
      dayEvents.maxElevation
    );
  }

  function requestLocation() {
    if (!navigator.geolocation) {
      locationText.textContent = "Geolocation unavailable";
      dialog.showModal();
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
        locationText.textContent = "Location denied — set manually";
        latInput.value = "35.5951";
        lonInput.value = "-82.5515";
        dialog.showModal();
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

  manualBtn.addEventListener("click", () => dialog.showModal());
  cancelLocation.addEventListener("click", () => dialog.close());

  locationForm.addEventListener("submit", (e) => {
    e.preventDefault();
    const newLat = parseFloat(latInput.value);
    const newLon = parseFloat(lonInput.value);
    if (Number.isFinite(newLat) && Number.isFinite(newLon)) {
      followNow = true;
      setLocation(newLat, newLon, `${newLat.toFixed(2)}°, ${newLon.toFixed(2)}°`);
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
    if (document.visibilityState === "visible" && followNow) refreshDay();
  });

  setInterval(() => {
    if (!followNow || lat == null) return;
    const now = new Date();
    if (dayStamp(now) !== trackedDay) {
      refreshDay();
      return;
    }
    syncSliderToNow();
    update();
  }, TICK_MS);

  resizeCanvas();
  requestLocation();
})();