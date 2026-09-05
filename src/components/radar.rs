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
    let mut zoom_level = use_signal(|| 16.0);

    let lat = latitude;
    let lon = longitude;
    let hdg = heading;
    let spd = speed_kmh;
    let zm = zoom_level();
    let th = theme.clone();

    use_effect(move || {
        let theme_json = serde_json::to_string(&th).unwrap_or_default();
        if let Ok(js_theme) = js_sys::JSON::parse(&theme_json) {
            drawRadarCanvas("gta-radar-canvas", lat, lon, hdg, zm, spd, &js_theme);
        }
    });

    rsx! {
        div { class: "gta6-radar-wrapper",
            div { class: "gta6-radar-badge",
                span { class: "radar-badge-pulse" }
                span { "GTA VI · LIVE MAP" }
                span { class: "radar-zoom-label", "Z{zm as i32}" }
            }

            div { class: "gta-radar-canvas-box",
                canvas {
                    id: "gta-radar-canvas",
                    class: "gta-radar-canvas",
                    width: "240",
                    height: "240",
                }

                // Interactive Zoom buttons
                div { class: "radar-zoom-controls",
                    button {
                        class: "radar-zoom-btn",
                        title: "Zoom In",
                        onclick: move |_| {
                            let cur = zoom_level();
                            if cur < 18.0 {
                                zoom_level.set(cur + 1.0);
                            }
                        },
                        "+"
                    }
                    button {
                        class: "radar-zoom-btn",
                        title: "Zoom Out",
                        onclick: move |_| {
                            let cur = zoom_level();
                            if cur > 14.0 {
                                zoom_level.set(cur - 1.0);
                            }
                        },
                        "−"
                    }
                }
            }
        }
    }
}
