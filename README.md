# RayNeo Air 4 Pro - GTA AR HUD (Rust + Dioxus PWA)

Un Heads-Up Display (HUD) ultra-leggero in stile **Grand Theft Auto**, sviluppato in **Rust** e **Dioxus 0.7** compilato in WebAssembly, progettato specificamente per gli occhiali AR **RayNeo Air 4 Pro** tramite mirroring/connessione USB-C da iPhone.

---

## Caratteristiche Principali per RayNeo Air 4 Pro (Micro-OLED)

- **Trasparenza AR Nativa**: Con i pannelli Micro-OLED a 1080p degli occhiali, il colore nero puro (`#000000`) spegne completamente i pixel, garantendo il 100% di visibilità del mondo reale.
- **Campo Visivo Pulito**: Gli indicatori sono disposti sulla visione periferica (radar in basso a sinistra, tachimetro in basso a destra, nastro bussola in alto al centro).
- **Radar Minimappa GTA**:
  - Radar circolare con griglia vettoriale orientata in base alla bussola/giroscopio del dispositivo.
  - Indicatore giocatore dinamico (blip triangolare GTA).
  - Punti cardinali rotanti (N, E, S, W).
- **Barre di Stato GTA**:
  - **Health (Verde)**: sincronizzata con il livello della batteria dell'iPhone (`Battery Status API`).
  - **Armor (Blu)**: sincronizzata con la precisione del segnale GPS (metri di tolleranza).
  - **Stamina (Giallo)**: indicatore velocità/accelerazione.
- **Tachimetro GTA**:
  - Lettura digitale `KM/H` calcolata dai sensori GPS.
  - Barra contagiri dinamica ad arco con gradiente neon.
  - Altimetro (`ALT`) e coordinate GPS in tempo reale.
- **Bussola Tattica & Intestazione**:
  - Nastro bussola orizzontale in alto con gradi e direzione cardinale.
  - Orologio digitale sincronizzato.
  - Stelle del livello di ricercato (*Wanted Level* da 0 a 5 stelle).
- **PWA & Esperienza iPhone**:
  - Installabile su iPhone come PWA tramite "Aggiungi a schermata Home" (nessuna barra o UI di Safari visibile).
  - Supporto a **Screen Wake Lock** (impedisce lo spegnimento dello schermo durante l'uso).
  - Modalità calibrazione per RayNeo (regolazione margini lente X/Y, zoom scala HUD, 4 temi colore: *GTA Classic*, *Cyberpunk 2077*, *Night Vision*, *Vice City*).

---

## Struttura del Progetto

```
├── Cargo.toml          # Configurazione dipendenze Dioxus 0.7 & web-sys
├── Dioxus.toml         # Configurazione build Dioxus Web
├── index.html          # Template PWA con viewport-fit e meta iOS
├── nginx.conf          # Configurazione Nginx per Dokploy con cache WASM
├── Dockerfile          # Multi-stage Docker build ultra-leggera (<20MB)
├── assets/
│   ├── hud.css         # Stili HUD GTA con glow neon e OLED black
│   ├── hud-interop.js  # Bridge JavaScript per sensori bussola, batteria, wakeLock
│   ├── manifest.json   # Manifest PWA
│   ├── sw.js           # Service Worker per caching offline
│   └── icons/          # Icone PWA ad alta risoluzione
└── src/
    ├── main.rs         # Entry point Dioxus, stato globale e loop sensori
    ├── gps.rs          # Tipi dati telemetria, bridge JS e temi colore
    └── components/
        ├── compass.rs      # Nastro bussola superiore
        ├── header.rs       # Orologio, location e stelle ricercato
        ├── radar.rs        # Minimappa canvas GTA hardware-accelerated
        ├── speedometer.rs  # Tachimetro digitale KM/H e coordinate
        ├── status_bars.rs  # Barre HP, Armor, Stamina
        └── settings.rs     # Modal calibrazione margini ottici RayNeo
```

---

## Deploy Automatico su Dokploy via GitHub

1. Il repository viene collegato al tuo server **Dokploy**.
2. Su ogni `git push` sul branch `main`, Dokploy costruisce l'immagine Docker multi-stage ed espone il servizio con certificato SSL Let's Encrypt automatico.
3. Apri il link su iPhone, premi **Condividi -> Aggiungi a schermata Home**, collega gli occhiali RayNeo Air 4 Pro via cavo USB-C (o mirroring AirPlay) e goditi l'HUD!
