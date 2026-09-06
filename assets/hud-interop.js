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

        ['play', 'pause', 'nexttrack', 'previoustrack'].forEach((action) => {
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
        const triggerKeys = ['MediaPlayPause', 'MediaTrackNext', 'MediaTrackPrevious', 'AudioVolumeMute', 'F12', 'F9', 'F8'];
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
      utterance.rate = 1.05; // Slightly faster, natural pacing
      utterance.pitch = 1.0;

      // Select natural Italian voice if available
      const voices = window.speechSynthesis.getVoices();
      const itVoice = voices.find(v => v.lang.startsWith('it') && (v.name.includes('Natural') || v.name.includes('Siri') || v.name.includes('Google') || v.name.includes('Alice')));
      if (itVoice) utterance.voice = itVoice;

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

    startRecording() {
      try {
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
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
          this.audioStream = stream;
          this.audioChunks = [];
          
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

            const finalMime = (this.mediaRecorder && this.mediaRecorder.mimeType) || mimeType || 'audio/mp4';
            const blob = new Blob(this.audioChunks, { type: finalMime });
            this.audioChunks = [];

            if (blob.size < 400) {
              this.lastUserMessage = '⚠️ Audio troppo breve. Riprova.';
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
          this.isListening = true;
          this.lastUserMessage = '🎙️ In ascolto... Parla ora! (Tocca per inviare)';
          this.notify();
        }).catch((err) => {
          console.warn('[Comms] Errore microfono getUserMedia:', err);
          this.isListening = false;
          this.lastUserMessage = '⚠️ Errore microfono: ' + (err.name || err.message || err);
          this.notify();
        });

        return true;
      } catch (err) {
        console.warn('[Comms] Eccezione microfono:', err);
        this.lastUserMessage = '⚠️ Errore microfono: ' + (err.message || err);
        this.isListening = false;
        this.notify();
        return false;
      }
    },

    stopRecording() {
      if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
        try { this.mediaRecorder.stop(); } catch (e) {}
      }
      this.isListening = false;
      this.notify();
    },

    toggleListening() {
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
  };
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initHUD);
  } else {
    initHUD();
  }
}
