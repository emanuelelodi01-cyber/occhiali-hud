use dioxus::prelude::*;
use crate::gps::{checkUpdateManually, enableWakeLock, requestOrientation, toggleFullscreen, HudTheme};

#[component]
pub fn SettingsModal(
    margin_x: i32,
    margin_y: i32,
    scale: f64,
    current_theme_name: String,
    is_simulating: bool,
    on_change_margin_x: EventHandler<i32>,
    on_change_margin_y: EventHandler<i32>,
    on_change_scale: EventHandler<f64>,
    on_select_theme: EventHandler<HudTheme>,
    on_toggle_simulation: EventHandler<()>,
    on_close: EventHandler<()>,
) -> Element {
    rsx! {
        div { class: "hud-modal-backdrop",
            div { class: "hud-modal-card",
                div { class: "hud-modal-title",
                    span { "RAYNEO AR 4 PRO - CALIBRATION" }
                    button {
                        class: "hud-btn",
                        style: "padding: 2px 8px;",
                        onclick: move |_| on_close.call(()),
                        "✕",
                    }
                }

                // Lens margin X (Horiz)
                div { class: "setting-group",
                    div { class: "setting-label",
                        span { "Margin X (Eye FoV Width)" }
                        span { "{margin_x}px" }
                    }
                    input {
                        r#type: "range",
                        class: "setting-slider",
                        min: "0",
                        max: "120",
                        value: "{margin_x}",
                        oninput: move |evt| {
                            if let Ok(val) = evt.value().parse::<i32>() {
                                on_change_margin_x.call(val);
                            }
                        },
                    }
                }

                // Lens margin Y (Vert)
                div { class: "setting-group",
                    div { class: "setting-label",
                        span { "Margin Y (Eye FoV Height)" }
                        span { "{margin_y}px" }
                    }
                    input {
                        r#type: "range",
                        class: "setting-slider",
                        min: "0",
                        max: "100",
                        value: "{margin_y}",
                        oninput: move |evt| {
                            if let Ok(val) = evt.value().parse::<i32>() {
                                on_change_margin_y.call(val);
                            }
                        },
                    }
                }

                // Scale
                div { class: "setting-group",
                    div { class: "setting-label",
                        span { "HUD Zoom Scale" }
                        span { "{scale:.2}x" }
                    }
                    input {
                        r#type: "range",
                        class: "setting-slider",
                        min: "70",
                        max: "130",
                        value: "{(scale * 100.0) as i32}",
                        oninput: move |evt| {
                            if let Ok(val) = evt.value().parse::<f64>() {
                                on_change_scale.call(val / 100.0);
                            }
                        },
                    }
                }

                // Color Themes
                div { class: "setting-group",
                    div { class: "setting-label", span { "Color Profile" } }
                    div { class: "theme-selector",
                        div {
                            class: if current_theme_name == "GTA Classic" { "theme-chip active" } else { "theme-chip" },
                            onclick: {
                                let on_select = on_select_theme.clone();
                                move |_| on_select.call(HudTheme::gta_classic())
                            },
                            "GTA Classic"
                        }
                        div {
                            class: if current_theme_name == "Cyberpunk 2077" { "theme-chip active" } else { "theme-chip" },
                            onclick: {
                                let on_select = on_select_theme.clone();
                                move |_| on_select.call(HudTheme::cyberpunk())
                            },
                            "Cyberpunk 2077"
                        }
                        div {
                            class: if current_theme_name == "Night Vision" { "theme-chip active" } else { "theme-chip" },
                            onclick: {
                                let on_select = on_select_theme.clone();
                                move |_| on_select.call(HudTheme::night_vision())
                            },
                            "Night Vision"
                        }
                        div {
                            class: if current_theme_name == "Vice City" { "theme-chip active" } else { "theme-chip" },
                            onclick: {
                                let on_select = on_select_theme.clone();
                                move |_| on_select.call(HudTheme::vice_city())
                            },
                            "Vice City"
                        }
                    }
                }

                // Quick Actions: Fullscreen, WakeLock, Gyro Permission, Simulation
                div {
                    class: "setting-group",
                    style: "display: flex; flex-direction: column; gap: 8px; margin-top: 18px;",
                    button {
                        class: "hud-btn",
                        onclick: move |_| toggleFullscreen(),
                        "⛶ TOGGLE FULLSCREEN (OLED AR)",
                    }
                    button {
                        class: "hud-btn",
                        onclick: move |_| enableWakeLock(),
                        "⚡ KEEP SCREEN AWAKE (WAKELOCK)",
                    }
                    button {
                        class: "hud-btn",
                        onclick: move |_| requestOrientation(),
                        "🧭 ENABLE IPHONE GYROSCOPE & COMPASS",
                    }
                    button {
                        class: "hud-btn",
                        style: if is_simulating { "border-color: #ffcc00; color: #ffcc00;" } else { "" },
                        onclick: move |_| on_toggle_simulation.call(()),
                        if is_simulating { "MODE: SIMULATED (INDOOR TEST)" } else { "MODE: REAL GPS & SENSORS" },
                    }
                    button {
                        class: "hud-btn",
                        style: "border-color: #00f0ff; color: #00f0ff;",
                        onclick: move |_| checkUpdateManually(),
                        "🔄 VERIFICA AGGIORNAMENTI DEPLOY",
                    }
                }
            }
        }
    }
}
