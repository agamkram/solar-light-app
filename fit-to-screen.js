/**
 * FitToScreen — shared viewport-fit kit for scaled-canvas web apps.
 * One artboard, scale as large as fits (optional cap at 1 for desktop).
 */
(function (root) {
  "use strict";

  function resolveEl(elOrId) {
    if (!elOrId) return null;
    if (typeof elOrId === "string") return document.getElementById(elOrId);
    return elOrId;
  }

  function create(options) {
    const {
      stage: stageOpt = "fit-stage",
      app: appOpt = "app",
      phoneMaxWidth = 767,
      wideAppWidth = 560,
      phoneTopBuffer = 0,
      scaleEpsilon = 0.008,
      settleMaxMs = 600,
      settleStableFrames = 4,
      resizeGraceMs = 350,
      capScaleAtOne = true,
      shouldFit = () => true,
      getTopBuffer,
      getAppLayoutWidth,
      getCapScaleAtOne,
      getLayoutName,
      onFit = () => {},
    } = options || {};

    const topBufferFor =
      getTopBuffer || ((layout) => (layout === "phone" ? phoneTopBuffer : 0));

    let stage = null;
    let app = null;
    let fitFrame = 0;
    let fitNaturalH = 0;
    let fitNaturalW = 0;
    let fitAvailH = 0;
    let fitAvailW = 0;
    let fitLayout = "";
    let appliedScale = 0;
    let layoutReady = false;
    let layoutShownAt = 0;
    let listenersBound = false;

    function ensureElements() {
      if (!stage) stage = resolveEl(stageOpt);
      if (!app) app = resolveEl(appOpt);
      return stage && app;
    }

    function isPhoneLayout(availW) {
      return availW <= phoneMaxWidth;
    }

    function layoutFor(availW, availH) {
      if (typeof getLayoutName === "function") {
        return getLayoutName(availW, availH);
      }
      return isPhoneLayout(availW) ? "phone" : "wide";
    }

    function appLayoutWidth(availW, availH) {
      const layout = layoutFor(availW, availH);
      if (typeof getAppLayoutWidth === "function") {
        const custom = getAppLayoutWidth(availW, layout, availH);
        if (custom != null) return custom;
      }
      return isPhoneLayout(availW) ? availW : wideAppWidth;
    }

    function isTouchLike() {
      return (
        (root.navigator && root.navigator.maxTouchPoints > 0) ||
        root.matchMedia?.("(pointer: coarse)")?.matches ||
        root.matchMedia?.("(hover: none)")?.matches
      );
    }

    function syncFitStageViewport() {
      if (!ensureElements()) return;
      const vv = root.visualViewport;
      // Phone + tablet (not desktop monitors)
      const useVv =
        vv &&
        (isPhoneLayout(root.innerWidth) ||
          (root.innerWidth <= 1366 && isTouchLike()));
      if (!useVv) {
        stage.style.top = "";
        stage.style.left = "";
        stage.style.width = "";
        stage.style.height = "";
        return;
      }
      const top = vv.offsetTop;
      const left = vv.offsetLeft;
      const width = vv.width;
      const height = Math.max(vv.height, root.innerHeight - top);
      stage.style.top = `${top}px`;
      stage.style.left = `${left}px`;
      stage.style.width = `${width}px`;
      stage.style.height = `${height}px`;
    }

    function viewportSizeMatchesFit() {
      if (!ensureElements() || !layoutReady) return false;
      syncFitStageViewport();
      return stage.clientHeight === fitAvailH && stage.clientWidth === fitAvailW;
    }

    function fitToScreen(remasure = false) {
      if (!ensureElements() || !shouldFit()) return;

      syncFitStageViewport();

      const availH = stage.clientHeight;
      const availW = stage.clientWidth;
      const viewportChanged = availH !== fitAvailH || availW !== fitAvailW;
      const layout = layoutFor(availW, availH);
      const layoutChanged = layout !== fitLayout;

      app.style.width = `${appLayoutWidth(availW, availH)}px`;
      app.dataset.layout = layout;

      if (remasure || viewportChanged || layoutChanged || !fitNaturalH) {
        const alreadyFitted = app.classList.contains("is-fitted");
        if (!alreadyFitted) app.style.transform = "scale(1)";
        fitNaturalH = app.offsetHeight;
        fitNaturalW = app.offsetWidth;
        if (!alreadyFitted) app.style.transform = "";
        fitAvailH = availH;
        fitAvailW = availW;
        fitLayout = layout;
      }

      if (!fitNaturalH || !fitNaturalW) return;

      const buffer = topBufferFor(layout);
      const SAFETY = 6;
      const heightRoom = Math.max(1, availH - buffer - SAFETY);
      const widthRoom = Math.max(1, availW);
      const capAtOne = getCapScaleAtOne
        ? getCapScaleAtOne(layout, availW, availH)
        : capScaleAtOne;
      let scale = Math.min(heightRoom / fitNaturalH, widthRoom / fitNaturalW);
      if (capAtOne) scale = Math.min(scale, 1);
      if (!Number.isFinite(scale) || scale <= 0) scale = 1;

      app.style.transform = `scale(${scale})`;

      // Paint-test against real stage box: keep under notch, eat empty bottom band.
      const cs = root.getComputedStyle(stage);
      const padT = parseFloat(cs.paddingTop) || 0;
      const padB = parseFloat(cs.paddingBottom) || 0;
      const padL = parseFloat(cs.paddingLeft) || 0;
      const padR = parseFloat(cs.paddingRight) || 0;

      function stageLimits() {
        const stageRect = stage.getBoundingClientRect();
        return {
          limitTop: stageRect.top + padT,
          limitBottom: stageRect.bottom - padB - 4,
          limitLeft: stageRect.left + padL,
          limitRight: stageRect.right - padR - 1,
          contentH: Math.max(1, stageRect.height - padT - padB - 4),
          contentW: Math.max(1, stageRect.width - padL - padR - 1),
        };
      }

      // Shrink until fully inside (especially top under notch / bottom overshoot).
      for (let i = 0; i < 5; i += 1) {
        const { limitTop, limitBottom, limitRight, contentH, contentW } =
          stageLimits();
        const painted = app.getBoundingClientRect();
        let fix = 1;
        if (painted.top < limitTop - 0.5) {
          fix = Math.min(fix, contentH / Math.max(1, painted.height));
        }
        if (painted.bottom > limitBottom + 0.5) {
          fix = Math.min(fix, contentH / Math.max(1, painted.height));
        }
        if (painted.right > limitRight + 0.5) {
          fix = Math.min(fix, contentW / Math.max(1, painted.width));
        }
        if (fix >= 0.999) break;
        scale = Math.max(0.05, scale * fix);
        if (capAtOne) scale = Math.min(scale, 1);
        app.style.transform = `scale(${scale})`;
      }

      // Grow into leftover room under the UI (and above if any), keeping aspect.
      {
        const { limitTop, limitBottom, limitRight, contentW } = stageLimits();
        const painted = app.getBoundingClientRect();
        const unusedBottom = limitBottom - painted.bottom;
        const unusedTop = painted.top - limitTop;
        const unused = Math.min(unusedBottom, unusedTop);
        // Prefer reclaiming bottom band when both sides have slack (centered).
        const slack = Math.max(0, unusedBottom);
        if (slack > 3 && painted.height > 1) {
          // Use half of bottom slack if top is already tight; else use min of both.
          const usable =
            unusedTop < 4 ? Math.max(0, unusedBottom - 2) : Math.min(unusedBottom, unusedTop) * 2;
          if (usable > 3) {
            let grow = (painted.height + usable) / painted.height;
            const nextW = painted.width * grow;
            if (nextW > contentW + 0.5) {
              grow = contentW / Math.max(1, painted.width);
            }
            if (grow > 1.001) {
              scale = Math.max(0.05, scale * grow);
              if (capAtOne) scale = Math.min(scale, 1);
              app.style.transform = `scale(${scale})`;
              const after = app.getBoundingClientRect();
              if (
                after.top < limitTop - 0.5 ||
                after.bottom > limitBottom + 0.5 ||
                after.right > limitRight + 0.5
              ) {
                const fix = Math.min(
                  after.top < limitTop - 0.5
                    ? contentW &&
                      (limitBottom - limitTop) / Math.max(1, after.height)
                    : 1,
                  after.bottom > limitBottom + 0.5
                    ? (limitBottom - after.top) / Math.max(1, after.height)
                    : 1,
                  after.right > limitRight + 0.5
                    ? contentW / Math.max(1, after.width)
                    : 1
                );
                // Fix top overflow using full content height
                let fix2 = fix;
                if (after.top < limitTop - 0.5) {
                  fix2 = Math.min(
                    fix2,
                    (limitBottom - limitTop) / Math.max(1, after.height)
                  );
                }
                if (fix2 < 0.999) {
                  scale = Math.max(0.05, scale * fix2);
                  if (capAtOne) scale = Math.min(scale, 1);
                  app.style.transform = `scale(${scale})`;
                }
              }
            }
          }
        }
      }

      if (
        layoutReady &&
        app.classList.contains("is-fitted") &&
        Math.abs(scale - appliedScale) < scaleEpsilon
      ) {
        appliedScale = scale;
        return;
      }

      appliedScale = scale;
      if (!app.classList.contains("is-fitted")) {
        layoutShownAt = performance.now();
      }
      app.classList.add("is-fitted");
      layoutReady = true;
      onFit({ scale, layout, availH, availW });
    }

    function scheduleFitToScreen(remasure = false) {
      if (!remasure && viewportSizeMatchesFit()) return;
      cancelAnimationFrame(fitFrame);
      fitFrame = requestAnimationFrame(() => fitToScreen(remasure));
    }

    function settleViewport() {
      if (!ensureElements()) return Promise.resolve();

      let stable = 0;
      let lastW = -1;
      let lastH = -1;
      const start = performance.now();

      return new Promise((resolve) => {
        function tick() {
          syncFitStageViewport();
          const w = stage.clientWidth;
          const h = stage.clientHeight;

          if (w > 0 && h > 0 && w === lastW && h === lastH) {
            stable += 1;
            if (stable >= settleStableFrames) {
              resolve();
              return;
            }
          } else {
            stable = 0;
            lastW = w;
            lastH = h;
          }

          if (performance.now() - start >= settleMaxMs) {
            resolve();
            return;
          }

          requestAnimationFrame(tick);
        }

        requestAnimationFrame(tick);
      });
    }

    async function bootLayout() {
      if (document.fonts?.ready) {
        try {
          await document.fonts.ready;
        } catch (_) {}
      }
      await settleViewport();
      fitToScreen(true);
    }

    function resetNaturalSize() {
      fitNaturalH = 0;
      fitNaturalW = 0;
    }

    function onViewportResize() {
      if (!layoutReady) return;
      if (performance.now() - layoutShownAt < resizeGraceMs) return;
      scheduleFitToScreen(true);
    }

    function onOrientationChange() {
      scheduleFitToScreen(true);
    }

    function bindViewportListeners() {
      if (listenersBound) return;
      listenersBound = true;
      root.addEventListener("resize", onViewportResize);
      root.addEventListener("orientationchange", onOrientationChange);
      root.visualViewport?.addEventListener("resize", onViewportResize);
    }

    return {
      syncFitStageViewport,
      fitToScreen,
      scheduleFitToScreen,
      settleViewport,
      bootLayout,
      resetNaturalSize,
      bindViewportListeners,
      isLayoutReady: () => layoutReady,
      getAppliedScale: () => appliedScale,
    };
  }

  root.FitToScreen = { create };
})(typeof window !== "undefined" ? window : globalThis);
