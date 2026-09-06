// RayNeo Air 4 Pro - GTA 6 Real-Time Satellite & Map Engine + AR Camera Passthrough
window.RayNeoHUD = {
  wakeLock: null,
  watchId: null,
  orientationActive: false,
  compassHeading: 0,
  batteryLevel: 1.0,
  batteryCharging: false,
  cameraStream: null,
  isCameraActive: false,
  locationName: 'RICERCA POSIZIONE GPS...',
  reverseGeocodeCache: {},
  tileCache: new Map(),
  sweepAngle: 0,
  isLoopRunning: false,

  // Global telemetry state updated by Rust or sensors
  state: {
    lat: 45.4642,
    lon: 9.1900,
    heading: 45,
    speed: 0,
    zoom: 16,
    mapMode: (() => {
      try { return localStorage.getItem('rayneo_map_mode') || 'satellite'; } catch (e) { return 'satellite'; }
    })(),
    theme: {}
  },

  // Switch between 'satellite', 'streets', and 'dark'
  setMapMode(mode) {
    if (['satellite', 'streets', 'dark'].includes(mode)) {
      this.state.mapMode = mode;
      try {
        localStorage.setItem('rayneo_map_mode', mode);
      } catch (e) {}
    }
  },

  getMapMode() {
    try {
      return (window.RayNeoHUD && window.RayNeoHUD.state && window.RayNeoHUD.state.mapMode)
        ? String(window.RayNeoHUD.state.mapMode)
        : 'satellite';
    } catch (e) {
      return 'satellite';
    }
  },

  cycleMapMode() {
    try {
      const modes = ['satellite', 'streets', 'dark'];
      const current = this.getMapMode();
      const currentIdx = modes.indexOf(current);
      const nextMode = modes[(currentIdx + 1) % modes.length];
      this.setMapMode(nextMode);
      return nextMode;
    } catch (e) {
      return 'satellite';
    }
  },

  // AR Camera Passthrough: stream real-world back camera behind HUD
  async toggleCamera() {
    const video = document.getElementById('ar-camera-video');
    if (!video) return false;

    if (this.isCameraActive) {
      if (this.cameraStream) {
        this.cameraStream.getTracks().forEach(t => t.stop());
        this.cameraStream = null;
      }
      video.srcObject = null;
      video.style.display = 'none';
      this.isCameraActive = false;
      return false;
    } else {
      try {
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
          alert('Fotocamera non supportata da questo browser.');
          return false;
        }
        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: { ideal: 'environment' },
            width: { ideal: 1920 },
            height: { ideal: 1080 }
          },
          audio: false
        });
        this.cameraStream = stream;
        video.srcObject = stream;
        await video.play();
        video.style.display = 'block';
        this.isCameraActive = true;
        return true;
      } catch (err) {
        console.warn('Camera permission or stream error:', err);
        alert('Permesso fotocamera negato o non disponibile: ' + (err.message || err));
        return false;
      }
    }
  },

  isCameraRunning() {
    return !!this.isCameraActive;
  },

  getLocationName() {
    return this.locationName || '';
  },

  // Explicit High-Accuracy GPS Trigger on user tap
  triggerGpsFix(callback) {
    if (!('geolocation' in navigator)) {
      alert('Geolocalizzazione non supportata.');
      return;
    }
    this.locationName = '📍 AGGANCIO SATELLITI GPS...';
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const coords = pos.coords;
        this.state.lat = coords.latitude;
        this.state.lon = coords.longitude;
        if (coords.speed !== null && coords.speed >= 0) {
          this.state.speed = coords.speed * 3.6;
        }
        if (coords.heading !== null && coords.heading >= 0) {
          this.state.heading = coords.heading;
        }
        this.reverseGeocode(coords.latitude, coords.longitude).then((name) => {
          if (name) this.locationName = name;
        });
        if (callback && typeof callback === 'function') {
          callback(coords.latitude, coords.longitude, coords.accuracy);
        }
      },
      (err) => {
        console.warn('Geolocation error:', err);
        alert('GPS non disponibile. Assicurati di aver concesso l\'accesso alla posizione a Safari: ' + err.message);
      },
      {
        enableHighAccuracy: true,
        timeout: 12000,
        maximumAge: 0
      }
    );
  },

  // Called from Rust or JS to update coordinates and start 60fps engine
  updateTelemetry(lat, lon, heading, speed, zoom, theme) {
    const latChanged = Math.abs(this.state.lat - lat) > 0.0005;
    const lonChanged = Math.abs(this.state.lon - lon) > 0.0005;
    this.state.lat = lat;
    this.state.lon = lon;
    if (heading !== undefined && heading >= 0) {
      this.state.heading = heading;
    }
    this.state.speed = speed;
    if (zoom) this.state.zoom = zoom;
    if (theme) this.state.theme = theme;

    if (latChanged || lonChanged) {
      this.reverseGeocode(lat, lon).then((name) => {
        if (name) this.locationName = name;
      });
    }

    if (!this.isLoopRunning) {
      this.startAnimationLoop('gta-radar-canvas');
    }
  },

  startAnimationLoop(canvasId) {
    if (this.isLoopRunning) return;
    this.isLoopRunning = true;

    const tick = () => {
      this.renderRadarFrame(canvasId);
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  },

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
      if (event.webkitCompassHeading !== undefined && event.webkitCompassHeading !== null) {
        this.compassHeading = event.webkitCompassHeading;
        this.state.heading = event.webkitCompassHeading;
      } else if (event.alpha !== null) {
        const h = (360 - event.alpha) % 360;
        this.compassHeading = h;
        this.state.heading = h;
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

  // Reverse Geocoding via Nominatim
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
        const road = addr.road || addr.pedestrian || addr.cycleway || addr.suburb || addr.neighbourhood;
        const city = addr.city || addr.town || addr.village || addr.municipality || addr.county || '';
        let formatted = '';
        if (road && city) {
          formatted = `${road}, ${city}`.toUpperCase();
        } else if (road) {
          formatted = road.toUpperCase();
        } else if (city) {
          formatted = city.toUpperCase();
        } else {
          formatted = 'POSIZIONE GPS AGGANCIATA';
        }
        this.reverseGeocodeCache[key] = formatted;
        this.locationName = formatted;
        return formatted;
      }
    } catch (e) {
      console.warn('Geocoding error:', e);
    }
    return this.locationName || 'GPS REALE';
  },

  // Web Mercator slippy tile conversions
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

  // High quality Multi-Mode Tile Loader (Real Satellite, Real Streets, GTA Dark Canvas)
  getTileImage(z, x, y) {
    const mode = this.getMapMode();
    const key = `${mode}/${z}/${y}/${x}`;
    if (this.tileCache.has(key)) {
      return this.tileCache.get(key);
    }
    const img = new Image();
    img.crossOrigin = 'anonymous';
    if (mode === 'satellite') {
      // High-resolution real photographic satellite imagery (Esri World Imagery)
      img.src = `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/${z}/${y}/${x}`;
    } else if (mode === 'streets') {
      // High-contrast real street map with street names and building outlines (Esri World Street Map)
      img.src = `https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/${z}/${y}/${x}`;
    } else {
      // GTA 6 Dark Gray Base Canvas
      img.src = `https://services.arcgisonline.com/arcgis/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/${z}/${y}/${x}`;
    }
    img.onerror = () => {
      if (!img._fallback) {
        img._fallback = true;
        // Fallback to OpenStreetMap tile if primary server is unreachable
        img.src = `https://tile.openstreetmap.org/${z}/${x}/${y}.png`;
      }
    };
    this.tileCache.set(key, img);
    return img;
  },

  // 60FPS Hardware-Accelerated GTA 6 Radar Render Function
  renderRadarFrame(canvasId) {
    const canvas = document.getElementById(canvasId || 'gta-radar-canvas');
    if (!canvas) return;

    // Hide initial splash loading screen once HUD starts rendering
    const loader = document.getElementById('hud-loading');
    if (loader && loader.style.display !== 'none') {
      loader.style.display = 'none';
    }

    const ctx = canvas.getContext('2d');
    const w = canvas.width;
    const h = canvas.height;
    const cx = w / 2;
    const cy = h / 2;
    const r = (w / 2) - 8;

    const lat = this.state.lat;
    const lon = this.state.lon;
    const heading = this.state.heading;
    const currentZoom = Math.round(this.state.zoom || 16);
    const theme = this.state.theme || {};
    const mode = this.getMapMode();

    // 60fps radar sweep rotation
    this.sweepAngle = (this.sweepAngle + 2) % 360;

    ctx.clearRect(0, 0, w, h);

    // GTA 6 Squircle Clipping (32px corner radius)
    ctx.save();
    ctx.beginPath();
    const cornerRadius = 32;
    if (ctx.roundRect) {
      ctx.roundRect(8, 8, w - 16, h - 16, cornerRadius);
    } else {
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
    }
    ctx.clip();

    // 1. OLED Pitch Black Background (#000000 for 100% RayNeo AR Transparency)
    ctx.fillStyle = '#0a0d10';
    ctx.fillRect(0, 0, w, h);

    // 2. REAL MAP TILES UNDER ROTATION
    const tileXFloat = this.lon2tile(lon, currentZoom);
    const tileYFloat = this.lat2tile(lat, currentZoom);
    const centerTileX = Math.floor(tileXFloat);
    const centerTileY = Math.floor(tileYFloat);
    const subPixelX = (tileXFloat - centerTileX) * 256;
    const subPixelY = (tileYFloat - centerTileY) * 256;

    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate((-heading * Math.PI) / 180);

    // Filter tuned per mode
    if (mode === 'satellite') {
      ctx.filter = 'contrast(115%) brightness(105%) saturate(110%)';
    } else if (mode === 'streets') {
      ctx.filter = 'contrast(120%) brightness(95%)';
    } else {
      ctx.filter = 'contrast(160%) brightness(125%)';
    }

    // Draw 3x3 grid of real map tiles
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
          // Tactical grid while loading
          ctx.strokeStyle = 'rgba(0, 240, 255, 0.15)';
          ctx.lineWidth = 1;
          ctx.strokeRect(posX, posY, 256, 256);
        }
      }
    }

    // Reset filter for HUD overlays
    ctx.filter = 'none';

    // Rotating Cardinal Points (N, E, S, W)
    const cardinalDist = r - 14;
    ctx.font = 'bold 13px Orbitron, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    // North (GTA VI Neon Red)
    ctx.fillStyle = '#ff2a4a';
    ctx.shadowColor = '#ff2a4a';
    ctx.shadowBlur = 10;
    ctx.fillText('N', 0, -cardinalDist);

    // East, South, West (Neon Cyan)
    ctx.fillStyle = '#ffffff';
    ctx.shadowColor = '#00f0ff';
    ctx.shadowBlur = 6;
    ctx.fillText('S', 0, cardinalDist);
    ctx.fillText('E', cardinalDist, 0);
    ctx.fillText('W', -cardinalDist, 0);

    ctx.restore();

    // 3. Radial Vignette (smoothly fades the map into black at the edges for AR transparency)
    const vignette = ctx.createRadialGradient(cx, cy, r * 0.4, cx, cy, r);
    vignette.addColorStop(0, 'rgba(0, 0, 0, 0)');
    vignette.addColorStop(0.7, 'rgba(0, 0, 0, 0.25)');
    vignette.addColorStop(1, 'rgba(0, 0, 0, 0.95)');
    ctx.fillStyle = vignette;
    ctx.fillRect(0, 0, w, h);

    // 4. Tactical Radar Range Rings
    ctx.lineWidth = 1;
    [r * 0.33, r * 0.66, r * 0.96].forEach((cr) => {
      ctx.strokeStyle = theme.ringColor || 'rgba(0, 240, 255, 0.25)';
      ctx.beginPath();
      ctx.arc(cx, cy, cr, 0, Math.PI * 2);
      ctx.stroke();
    });

    // 5. GTA 6 Radar Sweep Line (360° radar scan beam)
    const sweepRad = (this.sweepAngle * Math.PI) / 180;
    const sweepGrad = ctx.createRadialGradient(cx, cy, 4, cx, cy, r);
    sweepGrad.addColorStop(0, 'rgba(0, 240, 255, 0.35)');
    sweepGrad.addColorStop(1, 'rgba(0, 240, 255, 0)');
    ctx.fillStyle = sweepGrad;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.arc(cx, cy, r, sweepRad - 0.45, sweepRad);
    ctx.closePath();
    ctx.fill();

    // 6. Player Field of View Sight Cone (pointing forward)
    const coneGrad = ctx.createRadialGradient(cx, cy, 6, cx, cy, 85);
    coneGrad.addColorStop(0, 'rgba(0, 240, 255, 0.4)');
    coneGrad.addColorStop(1, 'rgba(0, 240, 255, 0)');
    ctx.fillStyle = coneGrad;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.arc(cx, cy, 80, -Math.PI / 2 - 0.38, -Math.PI / 2 + 0.38);
    ctx.closePath();
    ctx.fill();

    // 7. GTA 6 Delta Stealth Player Blip (Center)
    ctx.save();
    ctx.translate(cx, cy);
    ctx.fillStyle = theme.playerColor || '#00f0ff';
    ctx.shadowColor = theme.playerColor || '#00f0ff';
    ctx.shadowBlur = 14;
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

    ctx.restore(); // Restore clip

    // 8. GTA 6 Outer Holographic Bezel with Vice City Magenta Accents
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
    ctx.shadowBlur = 10;
    ctx.stroke();

    // GTA 6 Magenta Corner Brackets
    const bLen = 18;
    ctx.strokeStyle = '#ff007f';
    ctx.lineWidth = 3.5;
    ctx.shadowColor = '#ff007f';
    ctx.shadowBlur = 10;

    // Top-left
    ctx.beginPath();
    ctx.moveTo(8, 8 + bLen);
    ctx.lineTo(8, 8);
    ctx.lineTo(8 + bLen, 8);
    ctx.stroke();

    // Bottom-right
    ctx.beginPath();
    ctx.moveTo(w - 8, h - 8 - bLen);
    ctx.lineTo(w - 8, h - 8);
    ctx.lineTo(w - 8 - bLen, h - 8);
    ctx.stroke();
    ctx.restore();
  },

  // Legacy wrapper for backwards compatibility
  drawRadarCanvas(canvasId, lat, lon, heading, zoom, speed, theme) {
    this.updateTelemetry(lat, lon, heading, speed, zoom, theme);
  },

  // PWA Auto-Update Detection & User Prompt Banner
  waitingWorker: null,

  initPwaUpdateWatcher() {
    if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;

    navigator.serviceWorker.register('/sw.js').then((reg) => {
      // Periodic check for new Dokploy builds every 45 seconds
      setInterval(() => {
        reg.update().catch(() => {});
      }, 45000);

      // Check when user returns to app
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') {
          reg.update().catch(() => {});
        }
      });

      // 1. Worker already waiting from prior background fetch
      if (reg.waiting) {
        this.showUpdatePrompt(reg.waiting);
      }

      // 2. New worker discovered and downloaded
      reg.addEventListener('updatefound', () => {
        const newWorker = reg.installing;
        if (!newWorker) return;
        newWorker.addEventListener('statechange', () => {
          if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
            this.showUpdatePrompt(newWorker);
          }
        });
      });
    }).catch((err) => {
      console.warn('[PWA] Registration error:', err);
    });

    // Seamlessly reload page once new worker takes control
    let refreshing = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (!refreshing) {
        refreshing = true;
        window.location.reload();
      }
    });
  },

  showUpdatePrompt(worker) {
    this.waitingWorker = worker;
    let banner = document.getElementById('pwa-update-banner');
    if (!banner) {
      banner = document.createElement('div');
      banner.id = 'pwa-update-banner';
      banner.className = 'pwa-update-banner';
      banner.innerHTML = `
        <div class="pwa-update-pulse"></div>
        <div class="pwa-update-content">
          <div class="pwa-update-title">⚡ NUOVO AGGIORNAMENTO DISPONIBILE</div>
          <div class="pwa-update-desc">Nuovo deploy completato. Ricarica per applicare le novità.</div>
        </div>
        <div class="pwa-update-actions">
          <button id="pwa-apply-update-btn" class="pwa-btn-update">AGGIORNA ORA</button>
          <button id="pwa-dismiss-btn" class="pwa-btn-dismiss">DOPO</button>
        </div>
      `;
      document.body.appendChild(banner);

      document.getElementById('pwa-apply-update-btn').addEventListener('click', () => {
        if (this.waitingWorker) {
          this.waitingWorker.postMessage({ type: 'SKIP_WAITING' });
        } else {
          window.location.reload();
        }
      });

      document.getElementById('pwa-dismiss-btn').addEventListener('click', () => {
        banner.style.display = 'none';
      });
    } else {
      banner.style.display = 'flex';
    }
  },

  checkUpdateManually() {
    if (typeof navigator !== 'undefined' && 'serviceWorker' in navigator) {
      navigator.serviceWorker.getRegistration().then((reg) => {
        if (reg) {
          reg.update().then(() => {
            if (!reg.waiting && !reg.installing) {
              alert('Nessun aggiornamento in attesa. Stai già usando l\'ultima versione live!');
            }
          }).catch((e) => {
            alert('Errore controllo aggiornamenti: ' + e);
          });
        } else {
          alert('Service worker non ancora registrato.');
        }
      });
    } else {
      alert('Service Worker non supportato dal browser.');
    }
  }
};

// Automatically start when DOM is ready or already ready
if (typeof document !== 'undefined') {
  const initHUD = () => {
    window.RayNeoHUD.startAnimationLoop('gta-radar-canvas');
    window.RayNeoHUD.initBattery();
    window.RayNeoHUD.initOrientationListener();
    window.RayNeoHUD.initPwaUpdateWatcher();
  };
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initHUD);
  } else {
    initHUD();
  }
}
