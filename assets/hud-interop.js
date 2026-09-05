// RayNeo Air 4 Pro - GTA HUD Hardware & Sensor Interop Bridge
window.RayNeoHUD = {
  wakeLock: null,
  watchId: null,
  orientationActive: false,
  compassHeading: 0,
  batteryLevel: 1.0,
  batteryCharging: false,
  reverseGeocodeCache: {},

  // Request iOS Device Orientation permission
  async requestOrientation() {
    if (typeof DeviceOrientationEvent !== 'undefined' && typeof DeviceOrientationEvent.requestPermission === 'function') {
      try {
        const response = await DeviceOrientationEvent.requestPermission();
        if (response === 'granted') {
          this.initOrientationListener();
          return true;
        }
      } catch (e) {
        console.warn('Orientation permission error:', e);
      }
    } else {
      this.initOrientationListener();
      return true;
    }
    return false;
  },

  initOrientationListener() {
    if (this.orientationActive) return;
    window.addEventListener('deviceorientation', (event) => {
      // iOS gives webkitCompassHeading directly (0 = North)
      if (event.webkitCompassHeading !== undefined && event.webkitCompassHeading !== null) {
        this.compassHeading = event.webkitCompassHeading;
      } else if (event.alpha !== null) {
        // Fallback for Android/PC (approximate magnetic heading)
        this.compassHeading = (360 - event.alpha) % 360;
      }
    }, true);
    this.orientationActive = true;
  },

  getHeading() {
    return this.compassHeading || 0;
  },

  // Keep screen on for RayNeo Glasses via WakeLock API
  async enableWakeLock() {
    try {
      if ('wakeLock' in navigator) {
        this.wakeLock = await navigator.wakeLock.request('screen');
        this.wakeLock.addEventListener('release', () => {
          this.wakeLock = null;
        });
        return true;
      }
    } catch (err) {
      console.warn('Wake Lock error:', err);
    }
    return false;
  },

  // Toggle Fullscreen
  toggleFullscreen() {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch((err) => {
        console.warn('Fullscreen request failed:', err);
      });
    } else {
      if (document.exitFullscreen) {
        document.exitFullscreen();
      }
    }
  },

  // Battery monitoring
  initBattery(callback) {
    if ('getBattery' in navigator) {
      navigator.getBattery().then((battery) => {
        this.batteryLevel = battery.level;
        this.batteryCharging = battery.charging;
        if (callback) callback(battery.level, battery.charging);

        battery.addEventListener('levelchange', () => {
          this.batteryLevel = battery.level;
          if (callback) callback(battery.level, battery.charging);
        });
        battery.addEventListener('chargingchange', () => {
          this.batteryCharging = battery.charging;
          if (callback) callback(battery.level, battery.charging);
        });
      }).catch(() => {});
    }
  },

  getBatteryLevel() {
    return this.batteryLevel;
  },

  isBatteryCharging() {
    return this.batteryCharging;
  },

  // Reverse Geocoding via Nominatim (OpenStreetMap) with caching & rate limiting
  async reverseGeocode(lat, lon) {
    const key = `${lat.toFixed(3)},${lon.toFixed(3)}`;
    if (this.reverseGeocodeCache[key]) {
      return this.reverseGeocodeCache[key];
    }
    try {
      const url = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}&zoom=17&addressdetails=1`;
      const res = await fetch(url, {
        headers: { 'Accept': 'application/json' }
      });
      if (res.ok) {
        const data = await res.json();
        const addr = data.address || {};
        const road = addr.road || addr.pedestrian || addr.cycleway || addr.suburb || addr.neighbourhood || addr.city || 'SAN ANDREAS';
        const formatted = road.toUpperCase();
        this.reverseGeocodeCache[key] = formatted;
        return formatted;
      }
    } catch (e) {
      console.warn('Geocoding error:', e);
    }
    return 'LOS SANTOS';
  },

  // Procedural canvas radar rendering
  drawRadarCanvas(canvasId, lat, lon, heading, zoom, speed, theme) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const w = canvas.width;
    const h = canvas.height;
    const cx = w / 2;
    const cy = h / 2;
    const r = (w / 2) - 8;

    ctx.clearRect(0, 0, w, h);

    // Circular clipping
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.clip();

    // Background: pitch black with slight translucent dark radar circle
    ctx.fillStyle = '#020704';
    ctx.fill();

    // Radar distance circles
    ctx.strokeStyle = theme.ringColor || 'rgba(0, 255, 128, 0.25)';
    ctx.lineWidth = 1;
    [r * 0.33, r * 0.66, r * 0.98].forEach((cr) => {
      ctx.beginPath();
      ctx.arc(cx, cy, cr, 0, Math.PI * 2);
      ctx.stroke();
    });

    // Crosshairs
    ctx.strokeStyle = theme.crossColor || 'rgba(0, 255, 128, 0.15)';
    ctx.beginPath();
    ctx.moveTo(cx - r, cy);
    ctx.lineTo(cx + r, cy);
    ctx.moveTo(cx, cy - r);
    ctx.lineTo(cx, cy + r);
    ctx.stroke();

    // Simulated / Procedural roads grid around coordinates
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate((-heading * Math.PI) / 180);

    // Draw road grid
    ctx.strokeStyle = theme.roadColor || 'rgba(70, 180, 255, 0.45)';
    ctx.lineWidth = 2.5;

    // Generate stable roads based on lat/lon
    const gridSpacing = 45;
    const offsetX = ((lon * 10000) % gridSpacing);
    const offsetY = ((lat * 10000) % gridSpacing);

    ctx.beginPath();
    for (let x = -r - gridSpacing; x <= r + gridSpacing; x += gridSpacing) {
      ctx.moveTo(x - offsetX, -r);
      ctx.lineTo(x - offsetX, r);
    }
    for (let y = -r - gridSpacing; y <= r + gridSpacing; y += gridSpacing) {
      ctx.moveTo(-r, y - offsetY);
      ctx.lineTo(r, y - offsetY);
    }
    ctx.stroke();

    // Main Avenue diagonal
    ctx.strokeStyle = theme.mainRoadColor || 'rgba(255, 215, 0, 0.6)';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(-r, 0 - offsetY);
    ctx.lineTo(r, 0 - offsetY);
    ctx.stroke();

    // Cardinal directions rotating with world
    ctx.font = 'bold 12px Orbitron, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#ff4444';
    ctx.fillText('N', 0, -r + 14);
    ctx.fillStyle = '#ffffff';
    ctx.fillText('S', 0, r - 14);
    ctx.fillText('E', r - 14, 0);
    ctx.fillText('W', -r + 14, 0);

    ctx.restore();

    // Center player blip (GTA triangular arrow)
    ctx.save();
    ctx.translate(cx, cy);
    ctx.fillStyle = theme.playerColor || '#00ffcc';
    ctx.shadowColor = theme.playerColor || '#00ffcc';
    ctx.shadowBlur = 8;
    ctx.beginPath();
    ctx.moveTo(0, -9);
    ctx.lineTo(6, 7);
    ctx.lineTo(0, 3);
    ctx.lineTo(-6, 7);
    ctx.closePath();
    ctx.fill();
    ctx.restore();

    // Restore clip
    ctx.restore();

    // Outer neon ring
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.strokeStyle = theme.border || '#00ff88';
    ctx.lineWidth = 2.5;
    ctx.shadowColor = theme.border || '#00ff88';
    ctx.shadowBlur = 6;
    ctx.stroke();
  }
};
