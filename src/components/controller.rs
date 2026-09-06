use dioxus::prelude::*;
use crate::gps::{
    commsCancelRecording, commsSendHudCommand, commsSendLockedRecording,
    commsSendMessage, commsSetClientRole, commsToggleTts,
    CommsState, HudTheme,
};

fn format_duration(sec: u32) -> String {
    let mins = sec / 60;
    let secs = sec % 60;
    format!("{:02}:{:02}", mins, secs)
}

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

    rsx! {
        div {
            class: "phone-controller-root",
            style: "width: 100vw; min-height: 100vh; background: #070a0e; color: #ffffff; display: flex; flex-direction: column; font-family: 'Rajdhani', -apple-system, sans-serif; overflow-y: auto; padding: env(safe-area-inset-top, 16px) 16px env(safe-area-inset-bottom, 24px) 16px; box-sizing: border-box;",

            // Header Bar with Telemetry & Switcher
            div {
                style: "display: flex; justify-content: space-between; align-items: center; padding-bottom: 12px; border-bottom: 1px solid rgba(0, 255, 136, 0.2); margin-bottom: 14px;",
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
                    style: "background: rgba(0, 255, 136, 0.2); border: 1.5px solid {th.primary}; border-radius: 8px; padding: 8px 14px; color: {th.primary}; font-family: 'Orbitron', monospace; font-size: 11px; font-weight: 800; cursor: pointer; box-shadow: 0 0 12px rgba(0, 255, 136, 0.3); display: flex; align-items: center; gap: 6px;",
                    "🕶️ APRI HUD 1080p"
                }
            }

            // Quick Guidance Card
            div {
                style: "margin-bottom: 14px; background: rgba(0, 229, 255, 0.08); border: 1px solid rgba(0, 229, 255, 0.3); border-radius: 10px; padding: 10px 14px; display: flex; flex-direction: column; gap: 4px;",
                div {
                    style: "font-size: 11px; font-weight: 800; color: #00e5ff;",
                    "💡 OPZIONI DISPLAY PER I RAYNEO:"
                }
                div {
                    style: "font-size: 11px; color: rgba(255, 255, 255, 0.8); line-height: 1.4;",
                    "• In Mirroring: tocca 'APRI HUD 1080p' e gira l'iPhone in Orizzontale (Landscape) per riempire al 100% le lenti 16:9!"
                }
                div {
                    style: "font-size: 11px; color: rgba(255, 255, 255, 0.8); line-height: 1.4;",
                    "• Con app 'External Display Browser': apri /hud sulle lenti e tieni /controller sul telefono."
                }
            }

            // Remote HUD Control Grid (Tactile Quick Commands)
            div {
                style: "margin-bottom: 14px;",
                div {
                    style: "font-size: 11px; font-weight: 800; letter-spacing: 1px; color: rgba(255, 255, 255, 0.5); margin-bottom: 6px;",
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
                        } else if msg.role == "tool" {
                            div {
                                key: "{msg.id}",
                                style: "align-self: flex-start; background: rgba(0, 229, 255, 0.08); border-left: 3px solid #00e5ff; border-radius: 0 8px 8px 8px; padding: 6px 10px; max-width: 95%; font-family: monospace; font-size: 12px;",
                                div { style: "font-size: 10px; font-weight: 800; color: #00e5ff; margin-bottom: 2px;", "🛠️ TOOL ESEGUITO" }
                                div { style: "color: #b3f0ff; line-height: 1.3; word-break: break-word;", "{msg.text}" }
                            }
                        } else if msg.role == "thinking" || msg.role == "thought" {
                            div {
                                key: "{msg.id}",
                                style: "align-self: flex-start; background: rgba(255, 204, 0, 0.08); border-left: 3px solid #ffcc00; border-radius: 0 8px 8px 8px; padding: 6px 10px; max-width: 95%; font-size: 12px;",
                                div { style: "font-size: 10px; font-weight: 800; color: #ffcc00; margin-bottom: 2px;", "⚡ ANALISI AGENTE" }
                                div { style: "color: #fff2b3; font-style: italic; line-height: 1.3; word-break: break-word;", "{msg.text}" }
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

            // WhatsApp-style Floating Voice Dock (Slide-to-Lock ⬆️ 🔒 & Live Waveform)
            div {
                class: "whatsapp-voice-dock-container",
                id: "whatsapp-voice-dock-container",

                // Locked Hands-Free Panel (Visible when is_locked is true)
                div {
                    class: if comms.is_locked { "whatsapp-locked-panel is-active" } else { "whatsapp-locked-panel" },
                    id: "whatsapp-locked-panel",

                    // Discard / Cancel Button
                    button {
                        id: "dock-cancel-btn",
                        class: "whatsapp-btn-cancel",
                        r#type: "button",
                        onclick: move |_| {
                            commsCancelRecording();
                        },
                        span { class: "whatsapp-btn-icon", "🗑️" }
                        span { class: "whatsapp-btn-label", "ANNULLA" }
                    }

                    // Center Waveform & Timer
                    div {
                        class: "whatsapp-locked-status",
                        div {
                            class: "whatsapp-timer-row",
                            span { class: "whatsapp-rec-dot", "🔴" }
                            span {
                                id: "whatsapp-timer-text",
                                class: "whatsapp-timer-text",
                                "{format_duration(comms.record_duration_sec)}"
                            }
                            span { class: "whatsapp-rec-badge", "HANDS-FREE" }
                        }
                        canvas {
                            class: "live-waveform-canvas whatsapp-waveform-canvas",
                            id: "controller-waveform-canvas",
                            width: "140",
                            height: "32",
                            "data-color": "#00ff88",
                        }
                    }

                    // Send Button
                    button {
                        id: "dock-send-btn",
                        class: "whatsapp-btn-send",
                        r#type: "button",
                        onclick: move |_| {
                            commsSendLockedRecording();
                        },
                        span { class: "whatsapp-btn-icon", "🚀" }
                        span { class: "whatsapp-btn-label", "INVIA" }
                    }
                }

                // Idle & Dragging Bar (Hidden when locked)
                div {
                    class: if comms.is_locked { "whatsapp-idle-bar is-hidden" } else { "whatsapp-idle-bar" },
                    id: "whatsapp-idle-bar",

                    // Lock Guide Track (animates vertically upwards)
                    div {
                        class: "whatsapp-lock-track",
                        id: "whatsapp-lock-track",
                        div { class: "whatsapp-lock-icon", "🔒" }
                        div { class: "whatsapp-lock-arrow", "▲" }
                        div { class: "whatsapp-lock-text", "Scorri in alto per bloccare" }
                    }

                    // Slide Cancel hint
                    div {
                        class: "whatsapp-slide-cancel",
                        id: "whatsapp-slide-cancel",
                        "◀️ Scorri per annullare"
                    }

                    // Idle Hint text
                    div {
                        class: "whatsapp-idle-hint",
                        id: "whatsapp-idle-hint",
                        div { class: "hint-title", "VOCE ANTIGRAVITY" }
                        div { class: "hint-sub", "Tieni premuto per parlare • Trascina ⬆️ per bloccare" }
                    }

                    // The Floating Mic Button
                    button {
                        id: "whatsapp-mic-btn",
                        class: if comms.is_listening { "whatsapp-floating-mic-btn is-listening" } else { "whatsapp-floating-mic-btn" },
                        r#type: "button",
                        div {
                            class: "whatsapp-mic-circle",
                            div {
                                class: "whatsapp-mic-icon",
                                if comms.is_listening { "🔴" } else { "🎙️" }
                            }
                        }
                    }
                }
            }
        }
    }
}
