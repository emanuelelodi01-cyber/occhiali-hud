use dioxus::prelude::*;
use crate::gps::{
    commsSendHudCommand, commsSendMessage, commsSetClientRole,
    commsToggleListening, commsToggleTts, CommsState, HudTheme,
};

#[component]
pub fn PhoneController(
    state: Signal<CommsState>,
    theme: Signal<HudTheme>,
    on_switch_to_hud: EventHandler<()>,
) -> Element {
    let comms = state();
    let th = theme();
    let mut text_input = use_signal(String::new);

    // Status pill
    let (status_text, status_color) = if !comms.connected {
        ("DISCONNESSO DA DOKPLOY", "#ff3333")
    } else if comms.pc_online {
        ("COLLEGATO AD ANTIGRAVITY PC", "#00ff88")
    } else {
        ("IN ATTESA DEL BRIDGE PC", "#ffbb00")
    };

    let ptt_label = if comms.is_listening {
        "🔴 IN ASCOLTO... (TOCCA PER INVIARE)"
    } else {
        "🎙️ PUSH TO TALK (TOCCA PER PARLARE)"
    };

    rsx! {
        div {
            class: "phone-controller-root",
            style: "width: 100vw; min-height: 100vh; background: #070a0e; color: #ffffff; display: flex; flex-direction: column; font-family: 'Rajdhani', -apple-system, sans-serif; overflow-y: auto; padding: env(safe-area-inset-top, 16px) 16px env(safe-area-inset-bottom, 24px) 16px; box-sizing: border-box;",

            // Header Bar with Telemetry & Switcher
            div {
                style: "display: flex; justify-content: space-between; align-items: center; padding-bottom: 12px; border-bottom: 1px solid rgba(0, 255, 136, 0.2); margin-bottom: 16px;",
                div {
                    style: "display: flex; flex-direction: column; gap: 3px;",
                    div {
                        style: "font-family: 'Orbitron', monospace; font-size: 16px; font-weight: 900; letter-spacing: 1.5px; color: {th.primary};",
                        "📱 RAYNEO REMOTE"
                    }
                    div {
                        style: "display: flex; align-items: center; gap: 6px; font-size: 11px; color: {status_color}; font-weight: 700;",
                        span {
                            style: "display: inline-block; width: 8px; height: 8px; border-radius: 50%; background: {status_color}; box-shadow: 0 0 8px {status_color};"
                        }
                        "{status_text}"
                    }
                }

                // Switch to 1080p HUD Button
                button {
                    onclick: move |_| {
                        commsSetClientRole("hud");
                        on_switch_to_hud.call(());
                    },
                    style: "background: rgba(0, 255, 136, 0.15); border: 1.5px solid {th.primary}; border-radius: 8px; padding: 8px 12px; color: {th.primary}; font-family: 'Orbitron', monospace; font-size: 11px; font-weight: 800; cursor: pointer; box-shadow: 0 0 12px rgba(0, 255, 136, 0.2); display: flex; align-items: center; gap: 6px;",
                    "🕶️ APRI HUD"
                }
            }

            // Giant Push-To-Talk Touch Pad
            div {
                style: "margin-bottom: 18px;",
                button {
                    onclick: move |_| {
                        commsToggleListening();
                    },
                    style: if comms.is_listening {
                        "width: 100%; height: 110px; background: linear-gradient(135deg, #ff1a40 0%, #b30024 100%); border: 2px solid #ff4d6d; border-radius: 16px; color: #ffffff; font-family: 'Orbitron', monospace; font-size: 15px; font-weight: 900; letter-spacing: 1px; cursor: pointer; box-shadow: 0 0 30px rgba(255, 26, 64, 0.6); display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 8px; transition: all 0.2s ease;"
                    } else {
                        "width: 100%; height: 110px; background: linear-gradient(135deg, rgba(0, 255, 136, 0.2) 0%, rgba(0, 150, 80, 0.25) 100%); border: 2px solid rgba(0, 255, 136, 0.7); border-radius: 16px; color: #00ff88; font-family: 'Orbitron', monospace; font-size: 15px; font-weight: 900; letter-spacing: 1px; cursor: pointer; box-shadow: 0 0 20px rgba(0, 255, 136, 0.25); display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 8px; transition: all 0.2s ease;"
                    },
                    div {
                        style: "font-size: 26px;",
                        if comms.is_listening { "🔴" } else { "🎙️" }
                    }
                    div { "{ptt_label}" }
                    if comms.is_listening {
                        div {
                            style: "font-size: 11px; color: #ffccd5; font-family: 'Rajdhani', sans-serif; font-weight: 700;",
                            "Audio in streaming verso il server..."
                        }
                    }
                }
            }

            // Remote HUD Control Grid (Tactile Quick Commands)
            div {
                style: "margin-bottom: 18px;",
                div {
                    style: "font-size: 12px; font-weight: 800; letter-spacing: 1px; color: rgba(255, 255, 255, 0.5); margin-bottom: 8px;",
                    "COMANDI RAPIDI HUD OCCHIALI:"
                }
                div {
                    style: "display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px;",

                    // Cycle Map
                    button {
                        onclick: move |_| commsSendHudCommand("cycle_map_mode", "{}"),
                        style: "background: rgba(255, 255, 255, 0.06); border: 1px solid rgba(255, 255, 255, 0.2); border-radius: 8px; padding: 10px 6px; color: #ffffff; font-size: 11px; font-weight: 700; cursor: pointer; display: flex; flex-direction: column; align-items: center; gap: 4px;",
                        span { style: "font-size: 16px;", "🗺️" }
                        "Mappa HUD"
                    }

                    // Toggle AR Camera
                    button {
                        onclick: move |_| commsSendHudCommand("toggle_camera", "{}"),
                        style: "background: rgba(255, 255, 255, 0.06); border: 1px solid rgba(255, 255, 255, 0.2); border-radius: 8px; padding: 10px 6px; color: #ffffff; font-size: 11px; font-weight: 700; cursor: pointer; display: flex; flex-direction: column; align-items: center; gap: 4px;",
                        span { style: "font-size: 16px;", "📷" }
                        "Camera AR"
                    }

                    // GPS Fix
                    button {
                        onclick: move |_| commsSendHudCommand("trigger_gps", "{}"),
                        style: "background: rgba(255, 255, 255, 0.06); border: 1px solid rgba(255, 255, 255, 0.2); border-radius: 8px; padding: 10px 6px; color: #ffffff; font-size: 11px; font-weight: 700; cursor: pointer; display: flex; flex-direction: column; align-items: center; gap: 4px;",
                        span { style: "font-size: 16px;", "📍" }
                        "Fix GPS"
                    }

                    // Replay Speech
                    button {
                        onclick: move |_| commsSendHudCommand("replay_speech", "{}"),
                        style: "background: rgba(255, 255, 255, 0.06); border: 1px solid rgba(255, 255, 255, 0.2); border-radius: 8px; padding: 10px 6px; color: #ffffff; font-size: 11px; font-weight: 700; cursor: pointer; display: flex; flex-direction: column; align-items: center; gap: 4px;",
                        span { style: "font-size: 16px;", "🔄" }
                        "Ripeti Voce"
                    }

                    // Clear HUD Subtitles
                    button {
                        onclick: move |_| commsSendHudCommand("clear_subtitles", "{}"),
                        style: "background: rgba(255, 255, 255, 0.06); border: 1px solid rgba(255, 255, 255, 0.2); border-radius: 8px; padding: 10px 6px; color: #ffffff; font-size: 11px; font-weight: 700; cursor: pointer; display: flex; flex-direction: column; align-items: center; gap: 4px;",
                        span { style: "font-size: 16px;", "🧹" }
                        "Pulisci HUD"
                    }

                    // Toggle Temple Speaker TTS
                    button {
                        onclick: move |_| {
                            commsToggleTts();
                        },
                        style: if comms.tts_enabled {
                            "background: rgba(0, 229, 255, 0.15); border: 1px solid #00e5ff; border-radius: 8px; padding: 10px 6px; color: #00e5ff; font-size: 11px; font-weight: 700; cursor: pointer; display: flex; flex-direction: column; align-items: center; gap: 4px;"
                        } else {
                            "background: rgba(255, 255, 255, 0.06); border: 1px solid rgba(255, 255, 255, 0.2); border-radius: 8px; padding: 10px 6px; color: rgba(255, 255, 255, 0.5); font-size: 11px; font-weight: 700; cursor: pointer; display: flex; flex-direction: column; align-items: center; gap: 4px;"
                        },
                        span { style: "font-size: 16px;", if comms.tts_enabled { "🔊" } else { "🔇" } }
                        if comms.tts_enabled { "Voce ON" } else { "Voce MUTA" }
                    }
                }
            }

            // Quick Text Input Row
            div {
                style: "display: flex; gap: 8px; margin-bottom: 18px;",
                input {
                    r#type: "text",
                    placeholder: "Scrivi un messaggio ad Antigravity...",
                    value: "{text_input}",
                    oninput: move |e| text_input.set(e.value()),
                    onkeydown: move |e| {
                        if e.key() == Key::Enter {
                            let val = text_input.peek().clone();
                            if !val.trim().is_empty() {
                                commsSendMessage(&val);
                                text_input.set(String::new());
                            }
                        }
                    },
                    style: "flex: 1; background: rgba(255, 255, 255, 0.07); border: 1px solid rgba(0, 255, 136, 0.4); border-radius: 8px; padding: 10px 14px; color: #ffffff; font-size: 14px; font-family: inherit; outline: none;"
                }
                button {
                    onclick: move |_| {
                        let val = text_input.peek().clone();
                        if !val.trim().is_empty() {
                            commsSendMessage(&val);
                            text_input.set(String::new());
                        }
                    },
                    style: "background: {th.primary}; border: none; border-radius: 8px; padding: 10px 18px; color: #000000; font-family: 'Orbitron', monospace; font-size: 12px; font-weight: 900; cursor: pointer;",
                    "INVIA"
                }
            }

            // Full Chat Transcript Log Card
            div {
                style: "flex: 1; display: flex; flex-direction: column; background: rgba(15, 20, 28, 0.75); border: 1px solid rgba(0, 255, 136, 0.25); border-radius: 12px; padding: 14px; box-shadow: inset 0 0 15px rgba(0, 0, 0, 0.8); min-height: 250px;",
                div {
                    style: "display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; border-bottom: 1px solid rgba(255, 255, 255, 0.1); padding-bottom: 6px;",
                    span {
                        style: "font-family: 'Orbitron', monospace; font-size: 11px; font-weight: 800; letter-spacing: 1px; color: {th.primary};",
                        "📜 CRONOLOGIA MISSIONE // CHAT"
                    }
                    if comms.is_speaking {
                        span {
                            style: "font-size: 10px; color: #00ff88; font-weight: 700;",
                            "🔊 IN RIPRODUZIONE..."
                        }
                    }
                }

                div {
                    style: "flex: 1; overflow-y: auto; display: flex; flex-direction: column; gap: 10px; max-height: 420px; padding-right: 4px;",
                    if comms.history.is_empty() {
                        div {
                            style: "color: rgba(255, 255, 255, 0.4); font-size: 13px; text-align: center; margin-top: 30px;",
                            "Nessun messaggio recente. Parla o scrivi per iniziare!"
                        }
                    }
                    for msg in comms.history.iter() {
                        if msg.role == "user" {
                            div {
                                key: "{msg.id}",
                                style: "align-self: flex-end; background: rgba(0, 150, 255, 0.18); border-right: 3px solid #00e5ff; border-radius: 8px 0 8px 8px; padding: 8px 12px; max-width: 85%;",
                                div { style: "font-size: 10px; font-weight: 800; color: #00e5ff; margin-bottom: 2px;", "TU" }
                                div { style: "font-size: 14px; color: #ffffff; line-height: 1.4;", "{msg.text}" }
                            }
                        } else {
                            div {
                                key: "{msg.id}",
                                style: "align-self: flex-start; background: rgba(0, 255, 136, 0.1); border-left: 3px solid #00ff88; border-radius: 0 8px 8px 8px; padding: 8px 12px; max-width: 90%;",
                                div { style: "font-size: 10px; font-weight: 800; color: #00ff88; margin-bottom: 2px;", "ANTIGRAVITY AI" }
                                div { style: "font-size: 14px; color: #e6fffa; line-height: 1.4; word-break: break-word;", "{msg.text}" }
                            }
                        }
                    }
                }
            }
        }
    }
}
