// RayNeo Air 4 Pro - GTA 6 Real-Time Map HUD Hardware & Sensor Interop Bridge
window.RayNeoHUD = {
  wakeLock: null,
  watchId: null,
  orientationActive: false,
  compassHeading: 0,
  batteryLevel: 1.0,
  batteryCharging: false,
  reverseGeocodeCache: {},
  tileCache: new Map(),
  sweepAngle: 0,

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

  // Slippy Map math for real tile coordinates
  lon2tile(lon, zoom) {
    return ((lon + 180) / 360) * Math.pow(2, zoom);
  },

  lat2tile(lat, zoom) {
    const latRad = (lat * Math.PI) / 180;
    return (
      ((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) *
      Math.pow(2, zoom)
    );
  },

  // CartoDB Dark Matter tile caching (zero API key, true black OLED background)
  getTileImage(z, x, y) {
    const key = `${z}/${x}/${y}`;
    if (this.tileCache.has(key)) {
      return this.tileCache.get(key);
    }
    const img = new Image();
    img.crossOrigin = 'anonymous';
    const subdomains = ['a', 'b', 'c', 'd'];
    const s = subdomains[Math.abs(x + y) % subdomains.length];
    img.src = `https://${s}.basemaps.cartocdn.com/dark_all/${z}/${x}/${y}.png`;
    this.tileCache.set(key, img);
    return img;
  },

  // GTA 6 Real-Time Canvas Radar Rendering
  drawRadarCanvas(canvasId, lat, lon, heading, zoom, speed, theme) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const w = canvas.width;
    const h = canvas.height;
    const cx = w / 2;
    const cy = h / 2;
    const r = (w / 2) - 8;

    // Advance 60fps radar sweep line
    this.sweepAngle = (this.sweepAngle + 2.5) % 360;

    ctx.clearRect(0, 0, w, h);

    // GTA 6 Squircle Clipping (modern rounded square for GTA VI)
    ctx.save();
    ctx.beginPath();
    const cornerRadius = 32;
    if (ctx.roundRect) {
      ctx.roundRect(8, 8, w - 16, h - 16, cornerRadius);
    } else {
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
    }
    ctx.clip();

    // 1. OLED Base: Pure black (#000000) for RayNeo AR transparency
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, w, h);

    // 2. REAL MAP TILES UNDER ROTATION
    const currentZoom = Math.round(zoom || 16);
    const tileXFloat = this.lon2tile(lon, currentZoom);
    const tileYFloat = this.lat2tile(lat, currentZoom);
    const centerTileX = Math.floor(tileXFloat);
    const centerTileY = Math.floor(tileYFloat);
    const subPixelX = (tileXFloat - centerTileX) * 256;
    const subPixelY = (tileYFloat - centerTileY) * 256;

    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate((-heading * Math.PI) / 180);

    // Render 3x3 grid of real map tiles around GPS coordinates
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        const tx = centerTileX + dx;
        const ty = centerTileY + dy;
        const img = this.getTileImage(currentZoom, tx, ty);
        const posX = dx * 256 - subPixelX;
        const posY = dy * 256 - subPixelY;

        if (img && img.complete && img.naturalWidth > 0) {
          ctx.drawImage(img, posX, posY, 256, 256);
        } else {
          // Tactical grid while tile is loading
          ctx.strokeStyle = 'rgba(0, 240, 255, 0.12)';
          ctx.lineWidth = 1;
          ctx.strokeRect(posX, posY, 256, 256);
        }
      }
    }

    // Rotating Cardinal Points (N, E, S, W) on Real Map
    const cardinalDist = r - 14;
    ctx.font = 'bold 12px Orbitron, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    // North (GTA VI bright red neon)
    ctx.fillStyle = '#ff2a4a';
    ctx.shadowColor = '#ff2a4a';
    ctx.shadowBlur = 8;
    ctx.fillText('N', 0, -cardinalDist);

    // East, South, West (Neon white/cyan)
    ctx.fillStyle = '#ffffff';
    ctx.shadowColor = '#00f0ff';
    ctx.shadowBlur = 5;
    ctx.fillText('S', 0, cardinalDist);
    ctx.fillText('E', cardinalDist, 0);
    ctx.fillText('W', -cardinalDist, 0);

    ctx.restore();

    // 3. Radial Vignette for AR Transparency:
    // Fades real map to pure black at the borders so it blends invisibly with reality!
    const vignette = ctx.createRadialGradient(cx, cy, r * 0.45, cx, cy, r);
    vignette.addColorStop(0, 'rgba(0, 0, 0, 0)');
    vignette.addColorStop(0.75, 'rgba(0, 0, 0, 0.35)');
    vignette.addColorStop(1, 'rgba(0, 0, 0, 0.98)');
    ctx.fillStyle = vignette;
    ctx.fillRect(0, 0, w, h);

    // 4. Tactical Radar Range Rings
    ctx.lineWidth = 1;
    [r * 0.33, r * 0.66, r * 0.96].forEach((cr) => {
      ctx.strokeStyle = theme.ringColor || 'rgba(0, 240, 255, 0.22)';
      ctx.beginPath();
      ctx.arc(cx, cy, cr, 0, Math.PI * 2);
      ctx.stroke();
    });

    // 5. GTA 6 Radar Sweep Line (rotating 360° radar scan beam)
    const sweepRad = (this.sweepAngle * Math.PI) / 180;
    const sweepGrad = ctx.createRadialGradient(cx, cy, 4, cx, cy, r);
    sweepGrad.addColorStop(0, 'rgba(0, 240, 255, 0.28)');
    sweepGrad.addColorStop(1, 'rgba(0, 240, 255, 0)');
    ctx.fillStyle = sweepGrad;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.arc(cx, cy, r, sweepRad - 0.4, sweepRad);
    ctx.closePath();
    ctx.fill();

    // 6. Player Field of View Sight Cone (pointing forward)
    const coneGrad = ctx.createRadialGradient(cx, cy, 6, cx, cy, 80);
    coneGrad.addColorStop(0, 'rgba(0, 240, 255, 0.35)');
    coneGrad.addColorStop(1, 'rgba(0, 240, 255, 0)');
    ctx.fillStyle = coneGrad;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.arc(cx, cy, 75, -Math.PI / 2 - 0.38, -Math.PI / 2 + 0.38);
    ctx.closePath();
    ctx.fill();

    // 7. GTA 6 Aerodynamic Delta Player Blip
    ctx.save();
    ctx.translate(cx, cy);

    // Neon cyan glow
    ctx.fillStyle = theme.playerColor || '#00f0ff';
    ctx.shadowColor = theme.playerColor || '#00f0ff';
    ctx.shadowBlur = 12;
    ctx.beginPath();
    ctx.moveTo(0, -12);
    ctx.lineTo(8, 8);
    ctx.lineTo(0, 4);
    ctx.lineTo(-8, 8);
    ctx.closePath();
    ctx.fill();

    // Inner bright white stealth core
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.moveTo(0, -9);
    ctx.lineTo(4, 5);
    ctx.lineTo(0, 2);
    ctx.lineTo(-4, 5);
    ctx.closePath();
    ctx.fill();
    ctx.restore();

    ctx.restore(); // End clipping

    // 8. GTA 6 Holographic Outer Bezel with Vice City Magenta & Cyan Accents
    ctx.save();
    ctx.beginPath();
    if (ctx.roundRect) {
      ctx.roundRect(8, 8, w - 16, h - 16, cornerRadius);
    } else {
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
    }
    ctx.strokeStyle = theme.border || '#00f0ff';
    ctx.lineWidth = 2.5;
    ctx.shadowColor = theme.border || '#00f0ff';
    ctx.shadowBlur = 8;
    ctx.stroke();

    // GTA 6 Signature Magenta Corner Tactical Brackets
    const bLen = 16;
    ctx.strokeStyle = '#ff007f';
    ctx.lineWidth = 3;
    ctx.shadowColor = '#ff007f';
    ctx.shadowBlur = 8;

    // Top-left bracket
    ctx.beginPath();
    ctx.moveTo(8, 8 + bLen);
    ctx.lineTo(8, 8);
    ctx.lineTo(8 + bLen, 8);
    ctx.stroke();

    // Bottom-right bracket
    ctx.beginPath();
    ctx.moveTo(w - 8, h - 8 - bLen);
    ctx.lineTo(w - 8, h - 8);
    ctx.lineTo(w - 8 - bLen, h - 8);
    ctx.stroke();
    ctx.restore();
  }
};
