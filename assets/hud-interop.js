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
  },

  // --- External Display Video Projector Engine (YouTube Style) ---
  projector: {
    isActive: false,
    videoEl: null,
    canvasEl: null,
    stream: null,
    animFrame: null,

    init() {
      if (typeof document === 'undefined') return;
      if (!this.canvasEl) {
        this.canvasEl = document.createElement('canvas');
        this.canvasEl.id = 'hud-projector-canvas';
        this.canvasEl.width = 1920;
        this.canvasEl.height = 1080;
        this.canvasEl.style.display = 'none';
        document.body.appendChild(this.canvasEl);
      }
      if (!this.videoEl) {
        this.videoEl = document.createElement('video');
        this.videoEl.id = 'hud-projector-video';
        this.videoEl.setAttribute('playsinline', '');
        this.videoEl.setAttribute('webkit-playsinline', '');
        this.videoEl.setAttribute('x-webkit-airplay', 'allow');
        this.videoEl.setAttribute('controls', '');
        this.videoEl.muted = true;
        this.videoEl.autoplay = true;
        this.videoEl.style.width = '100%';
        this.videoEl.style.height = '100%';
        this.videoEl.style.objectFit = 'contain';
        this.videoEl.style.borderRadius = '10px';
        this.videoEl.style.background = '#000000';
      }
    },

    renderFrame() {
      if (!this.isActive || !this.canvasEl) return;
      const ctx = this.canvasEl.getContext('2d');
      const w = 1920;
      const h = 1080;

      ctx.fillStyle = '#000000';
      ctx.fillRect(0, 0, w, h);

      const state = window.RayNeoHUD.state || { heading: 0, speed: 0 };
      const comms = window.RayNeoHUD.comms;

      this.drawCompass(ctx, w, state.heading);
      this.drawTelemetry(ctx, w);
      this.drawSubtitles(ctx, w, comms);
      this.drawMinimap(ctx, h);
      this.drawSpeedometer(ctx, w, h, state.speed);

      this.animFrame = requestAnimationFrame(() => this.renderFrame());
    },

    drawCompass(ctx, w, heading) {
      const cx = w / 2;
      ctx.save();
      ctx.fillStyle = 'rgba(0, 0, 0, 0.75)';
      ctx.strokeStyle = 'rgba(0, 255, 136, 0.4)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      if (ctx.roundRect) ctx.roundRect(cx - 160, 20, 320, 50, 8);
      else ctx.rect(cx - 160, 20, 320, 50);
      ctx.fill();
      ctx.stroke();

      const deg = Math.round(heading || 0);
      const dirs = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
      const dirIdx = Math.round(deg / 45) % 8;
      const dirStr = dirs[dirIdx];

      ctx.fillStyle = '#00ff88';
      ctx.font = 'bold 22px "Orbitron", monospace';
      ctx.textAlign = 'center';
      ctx.fillText(`${dirStr}  ${deg}°`, cx, 52);
      ctx.restore();
    },

    drawTelemetry(ctx, w) {
      ctx.save();
      const now = new Date();
      const timeStr = now.toTimeString().split(' ')[0];
      const locStr = window.RayNeoHUD.getLocationName() || 'GPS ONLINE';

      ctx.textAlign = 'right';
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 28px "Orbitron", monospace';
      ctx.fillText(timeStr, w - 60, 55);

      ctx.fillStyle = '#ffcc00';
      ctx.font = 'bold 16px "Rajdhani", sans-serif';
      ctx.fillText(locStr, w - 60, 85);
      ctx.restore();
    },

    drawSubtitles(ctx, w, comms) {
      const text = (comms && comms.streamedSubtitle) ? comms.streamedSubtitle : '';
      if (!text || text === 'In attesa di collegamento con la sessione PC...') return;

      const cardW = 920;
      const cardH = 170;
      const x = (w - cardW) / 2;
      const y = 95;

      ctx.save();
      ctx.fillStyle = 'rgba(0, 0, 0, 0.9)';
      ctx.strokeStyle = '#00ff88';
      ctx.lineWidth = 2;
      ctx.shadowColor = 'rgba(0, 255, 136, 0.4)';
      ctx.shadowBlur = 15;
      ctx.beginPath();
      if (ctx.roundRect) ctx.roundRect(x, y, cardW, cardH, 12);
      else ctx.rect(x, y, cardW, cardH);
      ctx.fill();
      ctx.stroke();

      ctx.shadowBlur = 0;
      ctx.fillStyle = '#00ff88';
      ctx.font = 'bold 15px "Orbitron", monospace';
      ctx.textAlign = 'left';
      ctx.fillText('🤖 ANTIGRAVITY // AI HUD', x + 24, y + 34);

      ctx.textAlign = 'right';
      ctx.fillStyle = (comms && comms.isSpeaking) ? '#00ff88' : '#00e5ff';
      ctx.font = 'bold 13px "Rajdhani", sans-serif';
      ctx.fillText((comms && comms.isSpeaking) ? '🔊 VOCE ATTIVA' : 'PRONTO', x + cardW - 24, y + 34);

      ctx.strokeStyle = 'rgba(0, 255, 136, 0.3)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x + 24, y + 46);
      ctx.lineTo(x + cardW - 24, y + 46);
      ctx.stroke();

      ctx.textAlign = 'left';
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 21px "Rajdhani", sans-serif';
      this.wrapText(ctx, text + ((comms && comms.isTyping) ? ' ▌' : ''), x + 24, y + 80, cardW - 48, 30, 3);
      ctx.restore();
    },

    wrapText(ctx, text, x, y, maxWidth, lineHeight, maxLines) {
      const words = text.split(' ');
      let line = '';
      let currentY = y;
      let lineCount = 0;

      for (let n = 0; n < words.length; n++) {
        const testLine = line + words[n] + ' ';
        const metrics = ctx.measureText(testLine);
        if (metrics.width > maxWidth && n > 0) {
          ctx.fillText(line, x, currentY);
          line = words[n] + ' ';
          currentY += lineHeight;
          lineCount++;
          if (lineCount >= maxLines - 1) {
            ctx.fillText(words.slice(n).join(' '), x, currentY);
            return;
          }
        } else {
          line = testLine;
        }
      }
      ctx.fillText(line, x, currentY);
    },

    drawMinimap(ctx, h) {
      const mx = 60;
      const my = h - 310;
      const mw = 250;
      const mh = 250;
      ctx.save();
      const radarCanvas = document.getElementById('gta-radar-canvas');
      if (radarCanvas) {
        ctx.drawImage(radarCanvas, mx, my, mw, mh);
      }
      ctx.restore();
    },

    drawSpeedometer(ctx, w, h, speed) {
      const sx = w - 260;
      const sy = h - 150;
      ctx.save();
      ctx.fillStyle = 'rgba(0, 0, 0, 0.75)';
      ctx.strokeStyle = 'rgba(0, 229, 255, 0.4)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      if (ctx.roundRect) ctx.roundRect(sx, sy, 200, 85, 8);
      else ctx.rect(sx, sy, 200, 85);
      ctx.fill();
      ctx.stroke();

      ctx.textAlign = 'center';
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 38px "Orbitron", monospace';
      ctx.fillText(Math.round(speed || 0), sx + 75, sy + 56);

      ctx.fillStyle = '#00e5ff';
      ctx.font = 'bold 15px "Orbitron", monospace';
      ctx.fillText('KM/H', sx + 155, sy + 54);
      ctx.restore();
    },

    startProjecting() {
      this.init();
      this.isActive = true;
      this.renderFrame();

      try {
        if (!this.stream && this.canvasEl) {
          this.stream = this.canvasEl.captureStream(30);
          this.videoEl.srcObject = this.stream;
        }

        // Mount preview player into container so it's visible with native iOS controls
        const mount = document.getElementById('projector-player-mount');
        if (mount && this.videoEl) {
          mount.innerHTML = '';
          mount.appendChild(this.videoEl);
          mount.style.display = 'block';
        }

        this.videoEl.play().catch(e => console.warn('[Projector] Play warning:', e));

        // Direct synchronous Fullscreen call on user gesture (iOS routes to USB-C display)
        if (typeof this.videoEl.webkitEnterFullscreen === 'function') {
          console.log('[Projector] Invoking webkitEnterFullscreen directly...');
          this.videoEl.webkitEnterFullscreen();
          return true;
        }

        if (typeof this.videoEl.webkitShowPlaybackTargetPicker === 'function') {
          console.log('[Projector] Invoking webkitShowPlaybackTargetPicker...');
          this.videoEl.webkitShowPlaybackTargetPicker();
          return true;
        }

        return true;
      } catch (err) {
        console.warn('[Projector] Errore startProjecting:', err);
        return false;
      }
    },

    stopProjecting() {
      this.isActive = false;
      if (this.animFrame) cancelAnimationFrame(this.animFrame);
      if (this.videoEl) {
        this.videoEl.pause();
        const mount = document.getElementById('projector-player-mount');
        if (mount) mount.style.display = 'none';
      }
    }
  },

  // --- Antigravity Bidirectional Voice & HUD Comms Engine ---
  comms: {
    ws: null,
    wsUrl: null,
    connected: false,
    pcOnline: false,
    ttsEnabled: true,
    isListening: false,
    isSpeaking: false,
    recognition: null,
    agentStatus: 'idle', // 'idle', 'thinking', 'tool_running', 'speaking', 'transcribing'
    toolDetail: '',
    lastAgentMessage: 'In attesa di collegamento con la sessione PC...',
    lastUserMessage: '',
    streamedSubtitle: 'In attesa di collegamento con la sessione PC...',
    targetSubtitle: '',
    typewriterInterval: null,
    history: [],
    clientRole: 'hud', // 'hud' or 'controller'
    listeners: new Set(),

    detectClientRole() {
      try {
        const params = new URLSearchParams(window.location.search);
        const path = window.location.pathname.toLowerCase();
        if (params.get('view') === 'controller' || params.get('client') === 'controller' || path.includes('/controller')) {
          return 'controller';
        }
        if (params.get('view') === 'hud' || params.get('client') === 'hud' || path.includes('/hud')) {
          return 'hud';
        }
        return localStorage.getItem('rayneo_client_role') || 'hud';
      } catch (e) {
        return 'hud';
      }
    },

    setClientRole(role) {
      if (role !== 'hud' && role !== 'controller') return;
      this.clientRole = role;
      try {
        localStorage.setItem('rayneo_client_role', role);
      } catch (e) {}
      // Reconnect with new client role if changed
      if (this.ws) {
        this.ws.close();
      }
      this.connect();
      this.notify();
    },

    setTargetSubtitle(text) {
      const clean = (text || '').trim();
      this.targetSubtitle = clean;
      if (this.typewriterInterval) {
        clearInterval(this.typewriterInterval);
        this.typewriterInterval = null;
      }
      if (!clean) {
        this.streamedSubtitle = '';
        this.notify();
        return;
      }
      let idx = 0;
      // Dynamic typing speed: between 12ms and 30ms per step
      const stepChars = clean.length > 300 ? 4 : 2;
      const intervalMs = Math.max(12, Math.min(28, Math.floor(3500 / (clean.length || 1))));
      this.typewriterInterval = setInterval(() => {
        idx += stepChars;
        if (idx >= clean.length) {
          this.streamedSubtitle = clean;
          clearInterval(this.typewriterInterval);
          this.typewriterInterval = null;
        } else {
          this.streamedSubtitle = clean.slice(0, idx);
        }
        this.notify();
      }, intervalMs);
    },

    addHistory(role, text) {
      if (!text || !text.trim()) return;
      this.history.push({
        id: 'msg_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
        role: role,
        text: text.trim(),
        timestamp: Date.now()
      });
      if (this.history.length > 35) {
        this.history.shift();
      }
    },

    sendHudCommand(command, payload = {}) {
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        console.log('[Comms] Inviando comando remoto all\'HUD:', command, payload);
        this.ws.send(JSON.stringify({
          type: 'hud_command',
          command: command,
          payload: payload,
          timestamp: Date.now()
        }));
      }
    },

    executeRemoteCommand(command, payload = {}) {
      console.log('[Comms] Ricevuto comando remoto da Controller:', command, payload);
      try {
        if (command === 'set_map_mode') {
          if (window.RayNeoHUD && window.RayNeoHUD.setMapMode) {
            window.RayNeoHUD.setMapMode(payload.mode || 'satellite');
          }
        } else if (command === 'cycle_map_mode') {
          if (window.RayNeoHUD && window.RayNeoHUD.cycleMapMode) {
            window.RayNeoHUD.cycleMapMode();
          }
        } else if (command === 'toggle_camera') {
          if (window.RayNeoHUD && window.RayNeoHUD.toggleCamera) {
            window.RayNeoHUD.toggleCamera();
          }
        } else if (command === 'trigger_gps') {
          if (window.RayNeoHUD && window.RayNeoHUD.triggerGpsFix) {
            window.RayNeoHUD.triggerGpsFix();
          }
        } else if (command === 'clear_subtitles') {
          this.lastAgentMessage = '';
          this.setTargetSubtitle('');
        } else if (command === 'replay_speech') {
          if (this.lastAgentMessage) {
            this.speak(this.lastAgentMessage);
          }
        } else if (command === 'toggle_tts') {
          this.toggleTts();
        }
      } catch (err) {
        console.warn('[Comms] Errore esecuzione comando remoto:', err);
      }
    },

    init() {
      this.clientRole = this.detectClientRole();
      if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) return;
      this.connect();
      this.initMediaSession();
      this.initHardwareKeyListeners();
      this.initGamepadListener();
    },

    initMediaSession() {
      try {
        if (!('mediaSession' in navigator)) return;
        if (!this.silentAudio) {
          const silentWav = 'data:audio/wav;base64,UklGRigAAABXQVZFZm10IBIAAAABAAEARKwAAIhYAQACABAAAABkYXRhAgAAAAEA';
          this.silentAudio = new Audio(silentWav);
          this.silentAudio.loop = true;
          this.silentAudio.volume = 0.001;
        }

        navigator.mediaSession.metadata = new MediaMetadata({
          title: 'RayNeo Push-To-Talk',
          artist: 'Tasto RayNeo Air 4 Pro',
          album: 'GTA 6 AR HUD'
        });

        const handlePtt = () => {
          console.log('[MediaSession] Hardware RayNeo button triggered PTT!');
          this.toggleListening();
        };

        ['nexttrack', 'previoustrack'].forEach((action) => {
          try {
            navigator.mediaSession.setActionHandler(action, handlePtt);
          } catch (e) {}
        });
      } catch (err) {
        console.warn('[Comms] Errore setup MediaSession:', err);
      }
    },

    initHardwareKeyListeners() {
      window.addEventListener('keydown', (e) => {
        const triggerKeys = ['MediaPlayPause', 'MediaTrackNext', 'MediaTrackPrevious', 'F12', 'F9', 'F8'];
        if (triggerKeys.includes(e.code) || triggerKeys.includes(e.key)) {
          e.preventDefault();
          console.log('[Comms] Hardware key pressed:', e.code || e.key);
          this.toggleListening();
        }
      });
    },

    initGamepadListener() {
      let lastButtonPressed = false;
      const pollGamepad = () => {
        try {
          const gamepads = navigator.getGamepads ? navigator.getGamepads() : [];
          for (const gp of gamepads) {
            if (gp && gp.buttons) {
              const isAnyPressed = gp.buttons.some(b => b && b.pressed);
              if (isAnyPressed && !lastButtonPressed) {
                lastButtonPressed = true;
                console.log('[Comms] RayNeo Gamepad button pressed -> PTT toggle');
                this.toggleListening();
              } else if (!isAnyPressed) {
                lastButtonPressed = false;
              }
            }
          }
        } catch (e) {}
        requestAnimationFrame(pollGamepad);
      };
      requestAnimationFrame(pollGamepad);
    },

    connect() {
      try {
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const host = window.location.host;
        this.wsUrl = `${protocol}//${host}/api/ws?client=${this.clientRole}`;
        console.log('[Comms] Connessione a', this.wsUrl);
        this.ws = new WebSocket(this.wsUrl);

        this.ws.onopen = () => {
          this.connected = true;
          console.log('[Comms] WebSocket connesso come', this.clientRole);
          this.notify();
        };

        this.ws.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);
            this.handleMessage(data);
          } catch (e) {
            console.warn('[Comms] Errore parse messaggio:', e);
          }
        };

        this.ws.onclose = () => {
          this.connected = false;
          this.pcOnline = false;
          this.ws = null;
          this.notify();
          setTimeout(() => this.connect(), 3000);
        };

        this.ws.onerror = (err) => {
          console.warn('[Comms] WebSocket errore:', err);
        };
      } catch (e) {
        console.warn('[Comms] Impossibile aprire WebSocket:', e);
        setTimeout(() => this.connect(), 4000);
      }
    },

    handleMessage(data) {
      if (data.type === 'system') {
        if (data.event === 'welcome') {
          this.pcOnline = !!data.pcOnline;
          if (data.history && Array.isArray(data.history)) {
            this.history = data.history;
          }
          if (data.lastStatus) {
            this.agentStatus = data.lastStatus.status || 'idle';
            this.toolDetail = data.lastStatus.toolName ? `Tool: ${data.lastStatus.toolName}` : '';
          }
        } else if (data.event === 'pc_status') {
          this.pcOnline = !!data.online;
        }
      } else if (data.type === 'agent_status') {
        this.agentStatus = data.status || 'idle';
        this.toolDetail = data.toolName ? `Tool: ${data.toolName}` : '';
      } else if (data.type === 'agent_thinking') {
        this.agentStatus = 'thinking';
        this.toolDetail = data.thought || 'Analisi in corso...';
        if (data.thought) {
          this.setTargetSubtitle(`⚡ [ANALISI] ${data.thought}`);
          this.addHistory('thinking', data.thought);
        }
      } else if (data.type === 'agent_tool') {
        this.agentStatus = 'tool_running';
        const display = data.display || `[${data.toolName}] ${data.action || ''}`;
        this.toolDetail = display;
        this.setTargetSubtitle(`🛠️ ${display}`);
        this.addHistory('tool', display);
      } else if (data.type === 'agent_response') {
        this.agentStatus = 'idle';
        this.toolDetail = '';
        if (data.content) {
          this.lastAgentMessage = data.content;
          this.addHistory('assistant', data.content);
          this.setTargetSubtitle(data.content);
          if (this.ttsEnabled) {
            this.speak(data.content);
          }
        }
      } else if (data.type === 'transcription_result') {
        if (data.text) {
          this.lastUserMessage = data.text;
          if (!data.text.startsWith('⚠️')) {
            this.addHistory('user', data.text);
          }
        }
      } else if (data.type === 'user_message') {
        if (data.text) {
          this.lastUserMessage = data.text;
          this.addHistory('user', data.text);
        }
      } else if (data.type === 'hud_command') {
        this.executeRemoteCommand(data.command, data.payload || {});
      }
      this.notify();
    },

    sendMessage(text) {
      const clean = (text || '').trim();
      if (!clean) return;
      this.lastUserMessage = clean;
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        this.ws.send(JSON.stringify({
          type: 'user_message',
          text: clean,
          timestamp: Date.now()
        }));
      } else {
        console.warn('[Comms] WebSocket non connesso, messaggio in coda o non inviato');
      }
      this.notify();
    },

    speak(text) {
      if (!('speechSynthesis' in window)) return;
      window.speechSynthesis.cancel(); // Stop any previous speech
      
      // Clean markdown tags, URLs, backticks for pleasant voice readout
      const clean = text
        .replace(/```[\s\S]*?```/g, 'Blocco di codice.')
        .replace(/`([^`]+)`/g, '$1')
        .replace(/https?:\/\/\S+/g, 'collegamento web')
        .replace(/[*#_~\[\]]/g, '')
        .trim();

      if (!clean) return;

      const utterance = new SpeechSynthesisUtterance(clean);
      utterance.lang = 'it-IT';
      utterance.rate = 1.05; // Natural pacing
      utterance.pitch = 1.0;

      const bestVoice = this.getBestItalianVoice();
      if (bestVoice) {
        utterance.voice = bestVoice;
        utterance.lang = bestVoice.lang || 'it-IT';
      }

      utterance.onstart = () => {
        this.isSpeaking = true;
        this.notify();
      };
      utterance.onend = utterance.onerror = () => {
        this.isSpeaking = false;
        this.notify();
      };

      window.speechSynthesis.speak(utterance);
    },

    getBestItalianVoice() {
      if (!('speechSynthesis' in window)) return null;
      const voices = window.speechSynthesis.getVoices() || [];
      const itVoices = voices.filter(v => v.lang && v.lang.toLowerCase().startsWith('it'));
      if (itVoices.length === 0) return null;

      // 1. Siri voice if installed / available on iOS
      const siri = itVoices.find(v => 
        (v.name && v.name.toLowerCase().includes('siri')) ||
        (v.voiceURI && v.voiceURI.toLowerCase().includes('siri'))
      );
      if (siri) {
        console.log('[TTS] Utilizzo voce Siri:', siri.name);
        return siri;
      }

      // 2. Premium / Enhanced / Natural Apple voice
      const enhanced = itVoices.find(v => 
        (v.name && (v.name.includes('Enhanced') || v.name.includes('Premium') || v.name.includes('Natural') || v.name.includes('Migliorat'))) ||
        (v.voiceURI && (v.voiceURI.includes('enhanced') || v.voiceURI.includes('premium')))
      );
      if (enhanced) {
        console.log('[TTS] Utilizzo voce Enhanced/Premium:', enhanced.name);
        return enhanced;
      }

      // 3. Apple quality Italian voices (Alice, Luca, Federica, Chiara)
      const appleNamed = itVoices.find(v => 
        v.name && (v.name.includes('Alice') || v.name.includes('Federica') || v.name.includes('Luca') || v.name.includes('Chiara'))
      );
      if (appleNamed) {
        console.log('[TTS] Utilizzo voce Apple:', appleNamed.name);
        return appleNamed;
      }

      // 4. Default or first available Italian voice
      return itVoices.find(v => v.default) || itVoices[0];
    },

    stopSpeaking() {
      if ('speechSynthesis' in window) {
        window.speechSynthesis.cancel();
      }
      this.isSpeaking = false;
      this.notify();
    },

    mediaRecorder: null,
    audioChunks: [],
    audioStream: null,
    isListening: false,
    isLocked: false,
    recordStartTime: 0,
    recordDurationSec: 0,
    waveformLevels: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    analyserCtx: null,
    analyserNode: null,
    analyserData: null,
    animFrameId: null,
    _recordSessionId: 0,
    _isCancelled: false,
    _lastToggleTime: 0,

    initAudioAnalyser(stream) {
      try {
        const AudioCtx = window.AudioContext || window.webkitAudioContext;
        if (!this.analyserCtx) {
          this.analyserCtx = new AudioCtx();
        }
        if (this.analyserCtx.state === 'suspended') {
          this.analyserCtx.resume();
        }
        const source = this.analyserCtx.createMediaStreamSource(stream);
        this.analyserNode = this.analyserCtx.createAnalyser();
        this.analyserNode.fftSize = 64;
        this.analyserNode.smoothingTimeConstant = 0.55;
        source.connect(this.analyserNode);
        this.analyserData = new Uint8Array(this.analyserNode.frequencyBinCount);
        this.startWaveformLoop();
      } catch (e) {
        console.warn('[Comms] Web Audio Analyser warning:', e);
      }
    },

    startWaveformLoop() {
      if (this.animFrameId) cancelAnimationFrame(this.animFrameId);
      const loop = () => {
        if (!this.isListening) {
          this.waveformLevels.fill(0);
          this.drawWaveformCanvases();
          return;
        }

        if (this.analyserNode && this.analyserData) {
          this.analyserNode.getByteFrequencyData(this.analyserData);
          for (let i = 0; i < 16; i++) {
            const val = this.analyserData[i + 1] || 0;
            this.waveformLevels[i] = val / 255.0;
          }
        }

        if (this.recordStartTime > 0) {
          this.recordDurationSec = Math.floor((Date.now() - this.recordStartTime) / 1000);
          const mins = String(Math.floor(this.recordDurationSec / 60)).padStart(2, '0');
          const secs = String(this.recordDurationSec % 60).padStart(2, '0');
          const timerEl = document.getElementById('whatsapp-timer-text');
          if (timerEl) {
            timerEl.textContent = `${mins}:${secs}`;
          }
        }

        this.drawWaveformCanvases();
        this.animFrameId = requestAnimationFrame(loop);
      };
      this.animFrameId = requestAnimationFrame(loop);
    },

    stopWaveformAnalyser() {
      if (this.animFrameId) {
        cancelAnimationFrame(this.animFrameId);
        this.animFrameId = null;
      }
      this.waveformLevels.fill(0);
      this.drawWaveformCanvases();
    },

    drawWaveformCanvases() {
      const canvases = document.querySelectorAll('.live-waveform-canvas');
      if (!canvases.length) return;
      const levels = this.waveformLevels;
      const numBars = levels.length;

      canvases.forEach((canvas) => {
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        const w = canvas.width;
        const h = canvas.height;
        ctx.clearRect(0, 0, w, h);

        const color = canvas.dataset.color || '#00ff88';
        const gap = 3;
        const barWidth = Math.max(3, (w - (numBars - 1) * gap) / numBars);

        for (let i = 0; i < numBars; i++) {
          const raw = levels[i];
          const level = Math.max(0.12, raw);
          const barHeight = Math.max(3, level * (h - 4));
          const x = i * (barWidth + gap);
          const y = (h - barHeight) / 2;

          ctx.fillStyle = color;
          ctx.shadowColor = color;
          ctx.shadowBlur = raw > 0.25 ? 8 : 1;

          ctx.beginPath();
          if (ctx.roundRect) {
            ctx.roundRect(x, y, barWidth, barHeight, barWidth / 2);
          } else {
            ctx.rect(x, y, barWidth, barHeight);
          }
          ctx.fill();
        }
      });
    },

    startRecording() {
      if (this.isListening) return false;
      this.isListening = true;
      this.isLocked = false;
      this._isCancelled = false;
      this.recordStartTime = Date.now();
      this.recordDurationSec = 0;
      const currentSession = ++this._recordSessionId;

      this.stopSpeaking();
      this.lastUserMessage = '🎙️ In ascolto... Parla ora! (Scorri ⬆️ per bloccare)';
      this.notify();

      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        this.isListening = false;
        this.lastUserMessage = '⚠️ Registrazione audio non supportata.';
        this.notify();
        return false;
      }

      // Detect supported audio mimeType on iOS Safari
      let mimeType = '';
      if (typeof MediaRecorder !== 'undefined') {
        if (MediaRecorder.isTypeSupported('audio/mp4')) mimeType = 'audio/mp4';
        else if (MediaRecorder.isTypeSupported('audio/webm')) mimeType = 'audio/webm';
        else if (MediaRecorder.isTypeSupported('audio/aac')) mimeType = 'audio/aac';
      }

      navigator.mediaDevices.getUserMedia({ audio: true }).then((stream) => {
        // If the user cancelled or stopped while getUserMedia was resolving
        if (this._recordSessionId !== currentSession || !this.isListening || this._isCancelled) {
          console.log('[Comms] getUserMedia terminato ma la registrazione era già stata chiusa.');
          stream.getTracks().forEach(t => t.stop());
          return;
        }

        this.audioStream = stream;
        this.audioChunks = [];
        this.initAudioAnalyser(stream);
        
        try {
          this.mediaRecorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
        } catch (e) {
          this.mediaRecorder = new MediaRecorder(stream);
        }

        this.mediaRecorder.ondataavailable = (e) => {
          if (e.data && e.data.size > 0) {
            this.audioChunks.push(e.data);
          }
        };

        this.mediaRecorder.onstop = () => {
          if (this.audioStream) {
            this.audioStream.getTracks().forEach(t => t.stop());
            this.audioStream = null;
          }
          this.stopWaveformAnalyser();

          if (this._isCancelled || this._recordSessionId !== currentSession) {
            console.log('[Comms] Registrazione annullata o sessione scartata: audio non inviato.');
            this.audioChunks = [];
            return;
          }

          const finalMime = (this.mediaRecorder && this.mediaRecorder.mimeType) || mimeType || 'audio/mp4';
          const blob = new Blob(this.audioChunks, { type: finalMime });
          this.audioChunks = [];

          if (blob.size < 400) {
            this.lastUserMessage = '⚠️ Audio troppo breve o vuoto.';
            this.notify();
            return;
          }

          this.lastUserMessage = '⏳ Trascrizione vocale in corso...';
          this.notify();

          const reader = new FileReader();
          reader.onloadend = () => {
            const base64Data = (reader.result || '').split(',')[1];
            if (base64Data && this.ws && this.ws.readyState === WebSocket.OPEN) {
              console.log('[Comms] Invio blob vocale (' + blob.size + ' bytes) a PC...');
              this.ws.send(JSON.stringify({
                type: 'user_audio',
                audio: base64Data,
                mimeType: finalMime,
                timestamp: Date.now()
              }));
            }
          };
          reader.readAsDataURL(blob);
        };

        this.mediaRecorder.start(200);
        this.notify();
      }).catch((err) => {
        console.warn('[Comms] Errore microfono getUserMedia:', err);
        if (this._recordSessionId === currentSession) {
          this.isListening = false;
          this.isLocked = false;
          this.lastUserMessage = '⚠️ Errore microfono: ' + (err.name || err.message || err);
          this.notify();
        }
      });

      return true;
    },

    stopRecording() {
      if (!this.isListening) return false;
      this._recordSessionId++; // Invalidate active session immediately
      this.isListening = false;
      this.isLocked = false;

      if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
        try { this.mediaRecorder.stop(); } catch (e) {}
      } else if (this.audioStream) {
        try { this.audioStream.getTracks().forEach(t => t.stop()); } catch(e){}
        this.audioStream = null;
      }
      this.stopWaveformAnalyser();
      this.notify();
      return true;
    },

    cancelRecording() {
      if (!this.isListening) return false;
      this._isCancelled = true;
      this._recordSessionId++;
      this.isListening = false;
      this.isLocked = false;
      this.audioChunks = [];

      if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
        try { this.mediaRecorder.stop(); } catch (e) {}
      } else if (this.audioStream) {
        try { this.audioStream.getTracks().forEach(t => t.stop()); } catch(e){}
        this.audioStream = null;
      }
      this.stopWaveformAnalyser();
      this.lastUserMessage = '❌ Registrazione annullata.';
      this.notify();
      return true;
    },

    sendLockedRecording() {
      this.isLocked = false;
      return this.stopRecording();
    },

    toggleListening() {
      const now = Date.now();
      if (now - this._lastToggleTime < 350) {
        console.log('[Comms] Debouncing toggleListening');
        return this.isListening;
      }
      this._lastToggleTime = now;

      // Haptic feedback
      try { if (navigator.vibrate) navigator.vibrate(35); } catch (e) {}

      // Stop speech output so mic doesn't capture assistant
      this.stopSpeaking();

      if (this.isListening) {
        this.stopRecording();
      } else {
        this.startRecording();
      }

      return this.isListening;
    },

    toggleTts() {
      this.ttsEnabled = !this.ttsEnabled;
      if (!this.ttsEnabled) this.stopSpeaking();
      this.notify();
      return this.ttsEnabled;
    },

    notify() {
      for (const cb of this.listeners) {
        try { cb(this.getState()); } catch (e) {}
      }
    },

    getState() {
      return {
        connected: this.connected,
        pcOnline: this.pcOnline,
        ttsEnabled: this.ttsEnabled,
        isListening: this.isListening,
        isSpeaking: this.isSpeaking,
        isLocked: this.isLocked,
        recordDurationSec: this.recordDurationSec,
        agentStatus: this.agentStatus,
        toolDetail: this.toolDetail,
        lastAgentMessage: this.lastAgentMessage,
        lastUserMessage: this.lastUserMessage,
        streamedSubtitle: this.streamedSubtitle || this.lastAgentMessage,
        isTyping: !!this.typewriterInterval,
        history: this.history,
        clientRole: this.clientRole
      };
    }
  }
};

// Global interop helpers for Rust / Dioxus
window.commsInit = function() {
  if (window.RayNeoHUD && window.RayNeoHUD.comms) {
    window.RayNeoHUD.comms.init();
  }
};

window.commsToggleListening = function() {
  return (window.RayNeoHUD && window.RayNeoHUD.comms) ? window.RayNeoHUD.comms.toggleListening() : false;
};

window.commsToggleTts = function() {
  return (window.RayNeoHUD && window.RayNeoHUD.comms) ? window.RayNeoHUD.comms.toggleTts() : false;
};

window.commsSendMessage = function(text) {
  if (window.RayNeoHUD && window.RayNeoHUD.comms) {
    window.RayNeoHUD.comms.sendMessage(text);
  }
};

window.commsStopSpeaking = function() {
  if (window.RayNeoHUD && window.RayNeoHUD.comms) {
    window.RayNeoHUD.comms.stopSpeaking();
  }
};

window.commsSendHudCommand = function(cmd, payloadJson) {
  if (window.RayNeoHUD && window.RayNeoHUD.comms) {
    let payload = {};
    try { payload = JSON.parse(payloadJson || '{}'); } catch(e) {}
    window.RayNeoHUD.comms.sendHudCommand(cmd, payload);
  }
};

window.commsSetClientRole = function(role) {
  if (window.RayNeoHUD && window.RayNeoHUD.comms) {
    window.RayNeoHUD.comms.setClientRole(role);
  }
};

window.commsGetClientRole = function() {
  return (window.RayNeoHUD && window.RayNeoHUD.comms) ? window.RayNeoHUD.comms.clientRole : 'hud';
};

window.commsStartListening = function() {
  if (window.RayNeoHUD && window.RayNeoHUD.comms) {
    try { if (navigator.vibrate) navigator.vibrate(40); } catch (e) {}
    window.RayNeoHUD.comms.stopSpeaking();
    return window.RayNeoHUD.comms.startRecording();
  }
  return false;
};

window.commsStopListening = function() {
  if (window.RayNeoHUD && window.RayNeoHUD.comms) {
    try { if (navigator.vibrate) navigator.vibrate(25); } catch (e) {}
    window.RayNeoHUD.comms.stopRecording();
    return true;
  }
  return false;
};

window.commsCancelRecording = function() {
  if (window.RayNeoHUD && window.RayNeoHUD.comms) {
    return window.RayNeoHUD.comms.cancelRecording();
  }
  return false;
};

window.commsSendLockedRecording = function() {
  if (window.RayNeoHUD && window.RayNeoHUD.comms) {
    return window.RayNeoHUD.comms.sendLockedRecording();
  }
  return false;
};

window.commsLockRecording = function() {
  if (window.RayNeoHUD && window.RayNeoHUD.comms) {
    window.RayNeoHUD.comms.isLocked = true;
    window.RayNeoHUD.comms.notify();
    return true;
  }
  return false;
};

window.commsGetStateJson = function() {
  try {
    return (window.RayNeoHUD && window.RayNeoHUD.comms)
      ? JSON.stringify(window.RayNeoHUD.comms.getState())
      : '{}';
  } catch (e) {
    return '{}';
  }
};

// Automatically start when DOM is ready or already ready
if (typeof document !== 'undefined') {
  const initHUD = () => {
    window.RayNeoHUD.startAnimationLoop('gta-radar-canvas');
    window.RayNeoHUD.initBattery();
    window.RayNeoHUD.initOrientationListener();
    window.RayNeoHUD.initPwaUpdateWatcher();
    if (window.RayNeoHUD.comms) window.RayNeoHUD.comms.init();
    if ('speechSynthesis' in window) {
      window.speechSynthesis.getVoices();
      window.speechSynthesis.onvoiceschanged = () => {
        window.speechSynthesis.getVoices();
      };
    }
  };
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initHUD);
  } else {
    initHUD();
  }

  // Audio Engine Unlocker for iOS Safari
  const unlockAudioEngine = () => {
    try {
      if ('speechSynthesis' in window) {
        window.speechSynthesis.resume();
        const dummy = new SpeechSynthesisUtterance('');
        dummy.volume = 0.01;
        window.speechSynthesis.speak(dummy);
      }
    } catch(e) {}
  };
  document.addEventListener('touchstart', unlockAudioEngine, { passive: true, once: true });
  document.addEventListener('click', unlockAudioEngine, { passive: true, once: true });

  // Persistent hidden switch & label for iOS Taptic Engine
  let hapticSwitch = null;
  let hapticLabel = null;

  const initIosHaptics = () => {
    if (hapticLabel && document.body && document.body.contains(hapticLabel)) return;
    try {
      if (!hapticSwitch) {
        hapticSwitch = document.createElement('input');
        hapticSwitch.type = 'checkbox';
        hapticSwitch.setAttribute('switch', '');
        hapticSwitch.id = 'ios-taptic-switch';
        hapticSwitch.style.cssText = 'position: fixed; bottom: 0; right: 0; width: 1px; height: 1px; opacity: 0.01; z-index: -9999; pointer-events: auto;';
        if (document.body) document.body.appendChild(hapticSwitch);
      }
      if (!hapticLabel) {
        hapticLabel = document.createElement('label');
        hapticLabel.htmlFor = 'ios-taptic-switch';
        hapticLabel.style.cssText = 'position: fixed; bottom: 0; right: 0; width: 1px; height: 1px; opacity: 0.01; z-index: -9999; pointer-events: auto;';
        if (document.body) document.body.appendChild(hapticLabel);
      }
    } catch(e) {}
  };

  const triggerTapticEngine = (pattern = 'medium') => {
    initIosHaptics();
    try {
      if (hapticLabel) {
        hapticLabel.click();
        if (pattern === 'heavy') {
          setTimeout(() => { try { hapticLabel.click(); } catch(e){} }, 75);
        }
      }
    } catch (e) {}

    try {
      if (navigator.vibrate) {
        navigator.vibrate(pattern === 'heavy' ? [50, 40, 50] : 35);
      }
    } catch (e) {}
  };

  // Synthetic Tactical Audio Click (Haptic Audio Micro-Click)
  let audioCtx = null;
  const playTactileClick = (freq = 850, duration = 0.025) => {
    try {
      if (!audioCtx) {
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      }
      if (audioCtx.state === 'suspended') {
        audioCtx.resume();
      }
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, audioCtx.currentTime);
      gain.gain.setValueAtTime(0.2, audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + duration);
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.start();
      osc.stop(audioCtx.currentTime + duration);
    } catch(e) {}
  };

  // WhatsApp-style Floating Audio Dock with Slide-To-Lock (⬆️ 🔒) & Slide-To-Cancel (◀️)
  const bindWhatsAppFloatingDock = () => {
    const micBtn = document.getElementById('whatsapp-mic-btn');
    const container = document.getElementById('whatsapp-voice-dock-container');
    const cancelBtn = document.getElementById('dock-cancel-btn');
    const sendBtn = document.getElementById('dock-send-btn');
    const lockTrack = document.getElementById('whatsapp-lock-track');

    if (cancelBtn && !cancelBtn._bound) {
      cancelBtn._bound = true;
      cancelBtn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopImmediatePropagation();
        triggerTapticEngine('medium');
        playTactileClick(500, 0.04);
        window.commsCancelRecording();
        if (container) container.classList.remove('is-locked', 'is-recording');
      });
    }

    if (sendBtn && !sendBtn._bound) {
      sendBtn._bound = true;
      sendBtn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopImmediatePropagation();
        triggerTapticEngine('heavy');
        playTactileClick(1000, 0.04);
        window.commsSendLockedRecording();
        if (container) container.classList.remove('is-locked', 'is-recording');
      });
    }

    if (micBtn && !micBtn._whatsappBound) {
      micBtn._whatsappBound = true;

      let isPointerDown = false;
      let startX = 0;
      let startY = 0;
      let pressStartTime = 0;
      let isLocked = false;
      let isCancelled = false;

      const onPointerDown = (e) => {
        unlockAudioEngine();
        initIosHaptics();
        isPointerDown = true;
        startX = e.clientX;
        startY = e.clientY;
        pressStartTime = Date.now();
        isLocked = false;
        isCancelled = false;

        triggerTapticEngine('medium');
        playTactileClick(850, 0.03);

        const comms = window.RayNeoHUD && window.RayNeoHUD.comms;
        if (comms && !comms.isListening) {
          comms.stopSpeaking();
          comms.startRecording();
        }

        if (container) {
          container.classList.add('is-recording');
          container.classList.remove('is-locked');
        }

        try { micBtn.setPointerCapture(e.pointerId); } catch(err) {}
      };

      const onPointerMove = (e) => {
        if (!isPointerDown || isLocked || isCancelled) return;

        const deltaY = startY - e.clientY; // Upwards
        const deltaX = startX - e.clientX; // Leftwards

        // Vertical Slide-To-Lock threshold: 45px
        if (deltaY >= 45) {
          isLocked = true;
          isPointerDown = false;
          triggerTapticEngine('heavy');
          playTactileClick(1250, 0.045);

          const comms = window.RayNeoHUD && window.RayNeoHUD.comms;
          if (comms) {
            comms.isLocked = true;
            comms.notify();
          }

          if (container) {
            container.classList.remove('is-recording');
            container.classList.add('is-locked');
          }
          if (micBtn) micBtn.style.transform = '';
          return;
        }

        // Horizontal Slide-To-Cancel threshold: 75px
        if (deltaX >= 75) {
          isCancelled = true;
          isPointerDown = false;
          triggerTapticEngine('medium');
          playTactileClick(450, 0.03);

          const comms = window.RayNeoHUD && window.RayNeoHUD.comms;
          if (comms) {
            comms.cancelRecording();
          }

          if (container) {
            container.classList.remove('is-recording', 'is-locked');
          }
          if (micBtn) micBtn.style.transform = '';
          return;
        }

        // Smooth physical drag feedback
        if (deltaY > 6) {
          const clampedY = Math.min(45, Math.max(0, deltaY));
          micBtn.style.transform = `translateY(-${clampedY}px) scale(1.12)`;
          if (lockTrack) {
            lockTrack.style.opacity = '1';
            lockTrack.style.transform = `translateY(-${Math.floor(clampedY * 0.35)}px)`;
          }
        } else if (deltaX > 6) {
          const clampedX = Math.min(60, Math.max(0, deltaX));
          micBtn.style.transform = `translateX(-${clampedX}px)`;
        } else {
          micBtn.style.transform = '';
          if (lockTrack) {
            lockTrack.style.opacity = '';
            lockTrack.style.transform = '';
          }
        }
      };

      const onPointerUp = (e) => {
        if (!isPointerDown) return;
        isPointerDown = false;
        micBtn.style.transform = '';
        if (lockTrack) {
          lockTrack.style.opacity = '';
          lockTrack.style.transform = '';
        }

        if (isLocked) {
          // Hands-Free active! Lifting finger keeps recording active.
          return;
        }

        if (isCancelled) {
          if (container) container.classList.remove('is-recording', 'is-locked');
          return;
        }

        const duration = Date.now() - pressStartTime;
        const comms = window.RayNeoHUD && window.RayNeoHUD.comms;

        if (duration >= 250) {
          // Normal Hold-to-Talk release -> send audio!
          triggerTapticEngine('medium');
          playTactileClick(700, 0.025);
          if (comms && comms.isListening) {
            comms.stopRecording();
          }
        } else {
          // Too short tap: discard and hint user
          if (comms && comms.isListening) {
            comms.cancelRecording();
            comms.lastUserMessage = '💡 Tieni premuto per parlare o scorri ⬆️ per bloccare';
            comms.notify();
          }
        }

        if (container) container.classList.remove('is-recording', 'is-locked');
      };

      micBtn.addEventListener('pointerdown', onPointerDown);
      micBtn.addEventListener('pointermove', onPointerMove);
      micBtn.addEventListener('pointerup', onPointerUp);
      micBtn.addEventListener('pointercancel', onPointerUp);

      micBtn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopImmediatePropagation();
        return false;
      }, true);
    }
  };

  // Center Sight PTT for RayNeo HUD Screen
  const bindCenterSight = (btn) => {
    if (!btn || btn._sightBound) return;
    btn._sightBound = true;

    btn.addEventListener('pointerdown', (e) => {
      unlockAudioEngine();
      initIosHaptics();
      triggerTapticEngine('medium');
      playTactileClick(850, 0.03);
      const comms = window.RayNeoHUD && window.RayNeoHUD.comms;
      if (comms) {
        if (comms.isListening) {
          comms.stopRecording();
        } else {
          comms.stopSpeaking();
          comms.startRecording();
        }
      }
    });

    btn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopImmediatePropagation();
    }, true);
  };

  const bindAllVoiceControls = () => {
    bindWhatsAppFloatingDock();
    bindCenterSight(document.getElementById('hud-center-sight'));
    bindCenterSight(document.getElementById('controller-ptt-btn'));
  };

  const observer = new MutationObserver(() => {
    bindAllVoiceControls();
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });
  setTimeout(bindAllVoiceControls, 500);
}
