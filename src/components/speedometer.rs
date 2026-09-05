use dioxus::prelude::*;

#[component]
pub fn Speedometer(
    speed_kmh: f64,
    altitude: Option<f64>,
    latitude: f64,
    longitude: f64,
) -> Element {
    let speed_int = speed_kmh.round() as u32;
    let speed_formatted = format!("{:03}", speed_int);

    // Rev bar percentage up to 140 km/h
    let rev_percent = ((speed_kmh / 140.0) * 100.0).clamp(2.0, 100.0);

    let alt_text = if let Some(alt) = altitude {
        format!("ALT {:.0}m", alt)
    } else {
        "ALT ---".to_string()
    };

    let coords_text = format!("{:.4}°, {:.4}°", latitude, longitude);

    rsx! {
        div { class: "speedometer-wrapper",
            div { class: "speed-display-box",
                span { class: "speed-number", "{speed_formatted}" }
                span { class: "speed-unit", "KM/H" }
            }
            div { class: "speed-rev-bar",
                div {
                    class: "speed-rev-fill",
                    style: "width: {rev_percent}%;",
                }
            }
            div { class: "hud-gps-telemetry",
                span { "{alt_text}" }
                span { "{coords_text}" }
            }
        }
    }
}
