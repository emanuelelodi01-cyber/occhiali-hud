use dioxus::prelude::*;
use crate::gps::{drawRadarCanvas, HudTheme};

#[component]
pub fn Radar(
    latitude: f64,
    longitude: f64,
    heading: f64,
    speed_kmh: f64,
    theme: HudTheme,
) -> Element {
    let lat = latitude;
    let lon = longitude;
    let hdg = heading;
    let spd = speed_kmh;
    let th = theme.clone();

    use_effect(move || {
        let theme_json = serde_json::to_string(&th).unwrap_or_default();
        if let Ok(js_theme) = js_sys::JSON::parse(&theme_json) {
            drawRadarCanvas("gta-radar-canvas", lat, lon, hdg, 1.0, spd, &js_theme);
        }
    });

    rsx! {
        div { class: "gta-radar-canvas-box",
            canvas {
                id: "gta-radar-canvas",
                class: "gta-radar-canvas",
                width: "200",
                height: "200",
            }
        }
    }
}
