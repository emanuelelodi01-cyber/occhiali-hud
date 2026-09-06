#![allow(non_snake_case)]

mod components;
mod gps;

use components::comms::CommsWidget;
use components::compass::Compass;
use components::controller::PhoneController;
use components::header::Header;
use components::radar::Radar;
use components::settings::SettingsModal;
use components::speedometer::Speedometer;
use components::status_bars::StatusBars;
use components::subtitles::AiSubtitles;
use gps::{
    commsGetStateJson, commsInit, commsSetClientRole, commsToggleListening, getBatteryLevel, getHeading, getLocationName,
    isBatteryCharging, isCameraRunning, toggleCamera, toggleFullscreen, triggerGpsFix,
    CommsState, GpsData, HudTheme,
};

use dioxus::prelude::*;
use wasm_bindgen::prelude::*;
use wasm_bindgen::JsCast;

fn main() {
    dioxus::launch(App);
}

#[component]
fn App() -> Element {
    let mut gps_data = use_signal(GpsData::default);
    let mut margin_x = use_signal(|| 32);
    let mut margin_y = use_signal(|| 24);
    let mut scale = use_signal(|| 1.0);
    let mut theme = use_signal(HudTheme::gta_classic);
    let mut show_settings = use_signal(|| false);
    let mut clock_str = use_signal(|| "00:00:00".to_string());
    let mut camera_active = use_signal(|| false);
    let mut comms_state = use_signal(CommsState::default);
    let comms_expanded = use_signal(|| false);

    let mut current_view = use_signal(|| {
        if let Some(window) = web_sys::window() {
            if let Ok(pathname) = window.location().pathname() {
                if pathname.contains("/controller") {
                    return "controller".to_string();
                }
                if pathname.contains("/hud") {
                    return "hud".to_string();
                }
            }
            if let Ok(search) = window.location().search() {
                if search.contains("view=controller") || search.contains("client=controller") {
                    return "controller".to_string();
                }
                if search.contains("view=hud") || search.contains("client=hud") {
                    return "hud".to_string();
                }
            }
        }
        "hud".to_string()
    });

    // Clock update & GPS/Heading polling loop using use_hook to run ONCE on mount
    use_hook(move || {
        wasm_bindgen_futures::spawn_local(async move {
            // Ensure comms WebSocket is initialized
            commsInit();

            let mut tick_counter: u64 = 0;
            loop {
                gloo_timers::future::TimeoutFuture::new(100).await;
                tick_counter += 1;

                // Sync Comms state from JavaScript interop every 300ms
                if tick_counter % 3 == 0 {
                    let json_str = commsGetStateJson();
                    if !json_str.is_empty() && json_str != "{}" {
                        if let Ok(new_comms) = serde_json::from_str::<CommsState>(&json_str) {
                            if new_comms != comms_state.peek().clone() {
                                comms_state.set(new_comms);
                            }
                        }
                    }
                }

                // Update clock once every second
                if tick_counter % 10 == 0 {
                    let date = js_sys::Date::new_0();
                    let hours = date.get_hours();
                    let minutes = date.get_minutes();
                    let seconds = date.get_seconds();
                    clock_str.set(format!("{:02}:{:02}:{:02}", hours, minutes, seconds));
                }

                // Update reverse geocoded street/city name if available
                let real_loc = getLocationName();
                let mut data = gps_data.peek().clone();
                let mut loc_changed = false;
                if !real_loc.is_empty() && real_loc != data.location_name {
                    data.location_name = real_loc;
                    loc_changed = true;
                }

                // Check simulation vs real sensors without reactive dependency
                if data.is_simulated {
                    // Smooth simulated drive around Los Santos / Milan
                    let sim_time = (tick_counter as f64) * 0.05;
                    data.heading = ((sim_time * 15.0) % 360.0).abs();
                    data.speed_kmh = 45.0 + 20.0 * (sim_time * 0.5).sin();
                    let rad = data.heading.to_radians();
                    let delta = (data.speed_kmh / 3600.0) * 0.0009; // approximate coordinate delta
                    data.latitude += delta * rad.cos();
                    data.longitude += delta * rad.sin();
                    data.battery_level = 0.88;
                    data.is_charging = false;
                    data.accuracy = 4.2;
                    gps_data.set(data);
                } else {
                    // Real hardware heading & battery from RayNeoHUD bridge
                    let sensor_hdg = getHeading();
                    let mut changed = loc_changed;
                    if sensor_hdg > 0.0 && (sensor_hdg - data.heading).abs() > 0.2 {
                        data.heading = sensor_hdg;
                        changed = true;
                    }
                    let bat = getBatteryLevel();
                    if (bat - data.battery_level).abs() > 0.02 {
                        data.battery_level = bat;
                        changed = true;
                    }
                    let chg = isBatteryCharging();
                    if chg != data.is_charging {
                        data.is_charging = chg;
                        changed = true;
                    }
                    if changed {
                        gps_data.set(data);
                    }
                }
            }
        });
    });

    // Setup Geolocation watcher on mount using use_hook
    use_hook(move || {
        if let Some(window) = web_sys::window() {
            let navigator = window.navigator();
            if let Ok(geolocation) = navigator.geolocation() {
                let success_callback = {
                    Closure::<dyn FnMut(web_sys::Position)>::new(move |pos: web_sys::Position| {
                        let coords = pos.coords();
                        let mut current = gps_data.peek().clone();
                        if !current.is_simulated {
                            current.latitude = coords.latitude();
                            current.longitude = coords.longitude();
                            if let Some(alt) = coords.altitude() {
                                current.altitude = Some(alt);
                            }
                            if let Some(spd) = coords.speed() {
                                current.speed_kmh = (spd * 3.6).max(0.0);
                            }
                            if let Some(hdg) = coords.heading() {
                                if hdg >= 0.0 {
                                    current.heading = hdg;
                                }
                            }
                            current.accuracy = coords.accuracy();
                            gps_data.set(current);
                        }
                    })
                };

                let error_callback = Closure::<dyn FnMut(web_sys::PositionError)>::new(
                    move |err: web_sys::PositionError| {
                        web_sys::console::warn_1(
                            &format!("Geolocation error: {}", err.message()).into(),
                        );
                    },
                );

                let options = web_sys::PositionOptions::new();
                options.set_enable_high_accuracy(true);
                options.set_timeout(10000);
                options.set_maximum_age(2000);

                let _ = geolocation.watch_position_with_error_callback_and_options(
                    success_callback.as_ref().unchecked_ref(),
                    Some(error_callback.as_ref().unchecked_ref()),
                    &options,
                );

                // Prevent closures from being dropped immediately
                success_callback.forget();
                error_callback.forget();
            }
        }
    });

    let cur_gps = gps_data();
    let cur_theme = theme();
    let theme_name = cur_theme.name.clone();

    let root_style = format!(
        "--margin-x: {}px; --margin-y: {}px; --hud-scale: {}; --hud-primary: {}; --hud-secondary: {}; --hud-accent: {}; --hud-danger: {}; --hud-glow: {};",
        margin_x(),
        margin_y(),
        scale(),
        cur_theme.primary,
        cur_theme.secondary,
        cur_theme.accent,
        cur_theme.danger,
        cur_theme.primary
    );

    if current_view() == "controller" {
        rsx! {
            PhoneController {
                state: comms_state,
                theme: theme,
                on_switch_to_hud: move |_| {
                    current_view.set("hud".to_string());
                },
            }
        }
    } else {
        rsx! {
            div {
                class: "rayneo-hud-root",
                style: "{root_style}",

                // Quick action overlay
                div { class: "hud-quick-actions",
                    button {
                        class: "hud-btn",
                        title: "Passa alla modalità Controller Telefono per iPhone",
                        onclick: move |_| {
                            commsSetClientRole("controller");
                            current_view.set("controller".to_string());
                        },
                        "📱 CONTROLLER",
                    }
                    button {
                        class: "hud-btn",
                        onclick: move |_| {
                            let curr = show_settings();
                            show_settings.set(!curr);
                        },
                        "⚙ SETUP",
                    }
                    button {
                        class: if camera_active() { "hud-btn hud-btn-active" } else { "hud-btn" },
                        title: "Attiva la fotocamera posteriore dell'iPhone per vedere il mondo reale",
                        onclick: move |_| {
                            toggleCamera();
                            let active = isCameraRunning();
                            camera_active.set(active);
                        },
                        if camera_active() { "📷 CAMERA ON" } else { "📷 CAMERA AR" }
                    }
                    button {
                        class: "hud-btn",
                        title: "Aggancia coordinate GPS reali ad alta precisione",
                        onclick: move |_| triggerGpsFix(),
                        "📍 GPS REALE",
                    }
                    button {
                        class: "hud-btn",
                        onclick: move |_| toggleFullscreen(),
                        "⛶ OLED",
                    }
                }

                // Top Bar
                div { class: "hud-top-bar",
                    div { class: "hud-top-spacer" }
                    Compass { heading: cur_gps.heading }
                    Header {
                        time_str: clock_str(),
                        location_name: cur_gps.location_name.clone(),
                        wanted_stars: cur_gps.wanted_stars,
                        on_toggle_stars: move |_| {
                            let mut updated = gps_data();
                            updated.wanted_stars = (updated.wanted_stars + 1) % 6;
                            gps_data.set(updated);
                        },
                    }
                }

                // Cinematic AR Subtitle Banner (Optimized center-top sightline for RayNeo glasses)
                AiSubtitles {
                    state: comms_state,
                    theme: theme,
                }

                // Center Area: Open sightline for RayNeo Micro-OLED AR transparency & Blind-Touch PTT
                div {
                    class: "hud-center-sight",
                    onclick: move |_| {
                        commsToggleListening();
                    },
                    div { class: "hud-crosshair" }
                }

                // Bottom Bar: Minimap Radar (Left) + Speedometer (Right)
                div { class: "hud-bottom-bar",
                    div { class: "gta6-radar-wrapper",
                        Radar {
                            latitude: cur_gps.latitude,
                            longitude: cur_gps.longitude,
                            heading: cur_gps.heading,
                            speed_kmh: cur_gps.speed_kmh,
                            theme: cur_theme.clone(),
                        }
                        StatusBars {
                            battery_level: cur_gps.battery_level,
                            is_charging: cur_gps.is_charging,
                            accuracy: cur_gps.accuracy,
                            speed_kmh: cur_gps.speed_kmh,
                        }
                    }

                    Speedometer {
                        speed_kmh: cur_gps.speed_kmh,
                        altitude: cur_gps.altitude,
                        latitude: cur_gps.latitude,
                        longitude: cur_gps.longitude,
                    }
                }

                // Antigravity Voice & Hologram Comms Widget (Collapsible fallback)
                CommsWidget {
                    state: comms_state,
                    theme: theme,
                    is_expanded: comms_expanded,
                }

                // Settings Modal
                if show_settings() {
                    SettingsModal {
                        margin_x: margin_x(),
                        margin_y: margin_y(),
                        scale: scale(),
                        current_theme_name: theme_name,
                        is_simulating: cur_gps.is_simulated,
                        on_change_margin_x: move |val| margin_x.set(val),
                        on_change_margin_y: move |val| margin_y.set(val),
                        on_change_scale: move |val| scale.set(val),
                        on_select_theme: move |th| theme.set(th),
                        on_toggle_simulation: move |_| {
                            let mut updated = gps_data();
                            updated.is_simulated = !updated.is_simulated;
                            gps_data.set(updated);
                        },
                        on_close: move |_| show_settings.set(false),
                    }
                }
            }
        }
    }
}
