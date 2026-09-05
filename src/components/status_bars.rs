use dioxus::prelude::*;

#[component]
pub fn StatusBars(
    battery_level: f64,
    is_charging: bool,
    accuracy: f64,
    speed_kmh: f64,
) -> Element {
    let health_percent = (battery_level * 100.0).clamp(0.0, 100.0) as u32;

    // Accuracy <= 5m -> 100%, 25m -> 50%, >= 50m -> 10%
    let armor_percent = if accuracy <= 5.0 {
        100
    } else if accuracy >= 50.0 {
        10
    } else {
        ((50.0 - accuracy) / 45.0 * 90.0 + 10.0).clamp(10.0, 100.0) as u32
    };

    // Stamina: speed ratio against 80 km/h
    let stamina_percent = ((speed_kmh / 80.0) * 100.0).clamp(5.0, 100.0) as u32;

    let bat_label = if is_charging {
        format!("BAT ⚡{}%", health_percent)
    } else {
        format!("BAT {}%", health_percent)
    };

    let gps_label = format!("GPS ±{:.0}m", accuracy);

    rsx! {
        div { class: "gta-status-bars",
            div { class: "gta-bar-row",
                div { class: "gta-bar-track gta-health-track",
                    div {
                        class: "gta-bar-fill health-fill",
                        style: "width: {health_percent}%",
                    }
                }
                div { class: "gta-bar-track gta-armor-track",
                    div {
                        class: "gta-bar-fill armor-fill",
                        style: "width: {armor_percent}%",
                    }
                }
            }
            div { class: "gta-bar-labels",
                span { "{bat_label}" }
                span { "{gps_label}" }
            }
            div { class: "gta-bar-track gta-stamina-track",
                div {
                    class: "gta-bar-fill stamina-fill",
                    style: "width: {stamina_percent}%",
                }
            }
        }
    }
}
