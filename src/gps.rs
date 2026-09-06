use serde::{Deserialize, Serialize};
use wasm_bindgen::prelude::*;

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct GpsData {
    pub latitude: f64,
    pub longitude: f64,
    pub altitude: Option<f64>,
    pub speed_kmh: f64,
    pub heading: f64,
    pub accuracy: f64,
    pub battery_level: f64,
    pub is_charging: bool,
    pub location_name: String,
    pub wanted_stars: u8,
    pub is_simulated: bool,
}

impl Default for GpsData {
    fn default() -> Self {
        Self {
            latitude: 45.4642,
            longitude: 9.1900,
            altitude: Some(120.0),
            speed_kmh: 0.0,
            heading: 45.0,
            accuracy: 8.0,
            battery_level: 0.95,
            is_charging: false,
            location_name: "LOCALIZZAZIONE GPS...".to_string(),
            wanted_stars: 0,
            is_simulated: false,
        }
    }
}

// JS Interop Bindings to window.RayNeoHUD
#[wasm_bindgen]
extern "C" {
    #[wasm_bindgen(js_namespace = ["window", "RayNeoHUD"])]
    pub fn getHeading() -> f64;

    #[wasm_bindgen(js_namespace = ["window", "RayNeoHUD"])]
    pub fn getBatteryLevel() -> f64;

    #[wasm_bindgen(js_namespace = ["window", "RayNeoHUD"])]
    pub fn isBatteryCharging() -> bool;

    #[wasm_bindgen(js_namespace = ["window", "RayNeoHUD"])]
    pub fn enableWakeLock();

    #[wasm_bindgen(js_namespace = ["window", "RayNeoHUD"])]
    pub fn toggleFullscreen();

    #[wasm_bindgen(js_namespace = ["window", "RayNeoHUD"])]
    pub fn requestOrientation();

    #[wasm_bindgen(js_namespace = ["window", "RayNeoHUD"])]
    pub fn toggleCamera();

    #[wasm_bindgen(js_namespace = ["window", "RayNeoHUD"])]
    pub fn isCameraRunning() -> bool;

    #[wasm_bindgen(js_namespace = ["window", "RayNeoHUD"])]
    pub fn getMapMode() -> String;

    #[wasm_bindgen(js_namespace = ["window", "RayNeoHUD"])]
    pub fn setMapMode(mode: &str);

    #[wasm_bindgen(js_namespace = ["window", "RayNeoHUD"])]
    pub fn cycleMapMode() -> String;

    #[wasm_bindgen(js_namespace = ["window", "RayNeoHUD"])]
    pub fn triggerGpsFix();

    #[wasm_bindgen(js_namespace = ["window", "RayNeoHUD"])]
    pub fn getLocationName() -> String;

    #[wasm_bindgen(js_namespace = ["window", "RayNeoHUD"])]
    pub fn checkUpdateManually();

    #[wasm_bindgen(js_namespace = ["window", "RayNeoHUD"])]
    pub fn drawRadarCanvas(
        canvas_id: &str,
        lat: f64,
        lon: f64,
        heading: f64,
        zoom: f64,
        speed: f64,
        theme: &JsValue,
    );

    #[wasm_bindgen]
    pub fn commsInit();

    #[wasm_bindgen]
    pub fn commsToggleListening() -> bool;

    #[wasm_bindgen]
    pub fn commsToggleTts() -> bool;

    #[wasm_bindgen]
    pub fn commsSendMessage(text: &str);

    #[wasm_bindgen]
    pub fn commsStopSpeaking();

    #[wasm_bindgen]
    pub fn commsGetStateJson() -> String;
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct CommsState {
    pub connected: bool,
    #[serde(rename = "pcOnline")]
    pub pc_online: bool,
    #[serde(rename = "ttsEnabled")]
    pub tts_enabled: bool,
    #[serde(rename = "isListening")]
    pub is_listening: bool,
    #[serde(rename = "isSpeaking")]
    pub is_speaking: bool,
    #[serde(rename = "agentStatus")]
    pub agent_status: String,
    #[serde(rename = "toolDetail")]
    pub tool_detail: String,
    #[serde(rename = "lastAgentMessage")]
    pub last_agent_message: String,
    #[serde(rename = "lastUserMessage")]
    pub last_user_message: String,
}

impl Default for CommsState {
    fn default() -> Self {
        Self {
            connected: false,
            pc_online: false,
            tts_enabled: true,
            is_listening: false,
            is_speaking: false,
            agent_status: "idle".to_string(),
            tool_detail: String::new(),
            last_agent_message: "In attesa di collegamento con la sessione PC...".to_string(),
            last_user_message: String::new(),
        }
    }
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct HudTheme {
    pub name: String,
    pub primary: String,
    pub secondary: String,
    pub accent: String,
    pub danger: String,
    pub border: String,
    pub player_color: String,
    pub ring_color: String,
    pub cross_color: String,
    pub road_color: String,
    pub main_road_color: String,
}

impl HudTheme {
    pub fn gta_classic() -> Self {
        Self {
            name: "GTA Classic".to_string(),
            primary: "#00ff88".to_string(),
            secondary: "#00e5ff".to_string(),
            accent: "#ffcc00".to_string(),
            danger: "#ff2a2a".to_string(),
            border: "#00ff88".to_string(),
            player_color: "#00ffcc".to_string(),
            ring_color: "rgba(0, 255, 136, 0.25)".to_string(),
            cross_color: "rgba(0, 255, 136, 0.15)".to_string(),
            road_color: "rgba(70, 180, 255, 0.45)".to_string(),
            main_road_color: "rgba(255, 204, 0, 0.6)".to_string(),
        }
    }

    pub fn cyberpunk() -> Self {
        Self {
            name: "Cyberpunk 2077".to_string(),
            primary: "#ffe600".to_string(),
            secondary: "#00f0ff".to_string(),
            accent: "#ff003c".to_string(),
            danger: "#ff003c".to_string(),
            border: "#ffe600".to_string(),
            player_color: "#ffe600".to_string(),
            ring_color: "rgba(255, 230, 0, 0.25)".to_string(),
            cross_color: "rgba(0, 240, 255, 0.15)".to_string(),
            road_color: "rgba(0, 240, 255, 0.4)".to_string(),
            main_road_color: "rgba(255, 0, 60, 0.6)".to_string(),
        }
    }

    pub fn night_vision() -> Self {
        Self {
            name: "Night Vision".to_string(),
            primary: "#39ff14".to_string(),
            secondary: "#20c20e".to_string(),
            accent: "#76ff03".to_string(),
            danger: "#ff5555".to_string(),
            border: "#39ff14".to_string(),
            player_color: "#39ff14".to_string(),
            ring_color: "rgba(57, 255, 20, 0.2)".to_string(),
            cross_color: "rgba(57, 255, 20, 0.15)".to_string(),
            road_color: "rgba(32, 194, 14, 0.4)".to_string(),
            main_road_color: "rgba(118, 255, 3, 0.6)".to_string(),
        }
    }

    pub fn vice_city() -> Self {
        Self {
            name: "Vice City".to_string(),
            primary: "#ff2a85".to_string(),
            secondary: "#00f0ff".to_string(),
            accent: "#ffe600".to_string(),
            danger: "#ff0055".to_string(),
            border: "#ff2a85".to_string(),
            player_color: "#00f0ff".to_string(),
            ring_color: "rgba(255, 42, 133, 0.25)".to_string(),
            cross_color: "rgba(0, 240, 255, 0.15)".to_string(),
            road_color: "rgba(255, 42, 133, 0.45)".to_string(),
            main_road_color: "rgba(0, 240, 255, 0.6)".to_string(),
        }
    }
}
