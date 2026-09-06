use dioxus::prelude::*;
use crate::gps::{
    commsSendMessage, commsStopSpeaking, commsToggleListening, commsToggleTts,
    CommsState, HudTheme,
};

#[component]
pub fn CommsWidget(
    state: Signal<CommsState>,
    theme: Signal<HudTheme>,
    is_expanded: Signal<bool>,
) -> Element {
    let comms = state();
    let th = theme();
    let expanded = is_expanded();

    // Status pill text & color
    let (status_text, status_color) = if !comms.connected {
        ("OFFLINE", "#ff3333")
    } else if comms.pc_online {
        ("LINK ONLINE", "#00ff88")
    } else {
        ("STANDBY (PC DISCONNESSO)", "#ffbb00")
    };

    // Agent state detail
    let (activity_badge, activity_color) = match comms.agent_status.as_str() {
        "thinking" => ("PENSANDO...", "#ffbb00"),
        "tool_running" => ("ESECUZIONE TOOL...", "#00e5ff"),
        "speaking" => ("VOCE ATTIVA...", "#00ff88"),
        _ => {
            if comms.is_speaking {
                ("AUDIO ATTIVO...", "#00ff88")
            } else if comms.is_listening {
                ("ASCOLTO IN CORSO...", "#ff3366")
            } else {
                ("PRONTO", "rgba(255,255,255,0.4)")
            }
        }
    };

    rsx! {
        div {
            class: "comms-root-container",
            style: "position: fixed; top: 72px; right: 28px; z-index: 950; pointer-events: auto; font-family: 'ChaletCompania', 'Montserrat', 'Segoe UI', sans-serif;",

            // Collapsed Pill Button (when not expanded)
            if !expanded {
                button {
                    class: "comms-collapsed-btn",
                    onclick: move |_| is_expanded.set(true),
                    style: "background: rgba(0, 0, 0, 0.85); border: 1px solid {status_color}; border-radius: 20px; padding: 6px 14px; display: flex; align-items: center; gap: 8px; color: #ffffff; cursor: pointer; backdrop-filter: blur(8px); box-shadow: 0 4px 15px rgba(0, 0, 0, 0.7);",
                    span {
                        style: "display: inline-block; width: 8px; height: 8px; border-radius: 50%; background: {status_color}; box-shadow: 0 0 8px {status_color};"
                    }
                    span {
                        style: "font-size: 11px; font-weight: 800; letter-spacing: 1px; color: {th.primary};",
                        "📻 COMMS // AGY"
                    }
                    if comms.is_speaking || comms.agent_status == "speaking" {
                        span {
                            style: "font-size: 10px; color: #00ff88; font-weight: 700; animation: pulse 1s infinite;",
                            "🔊 VOCE"
                        }
                    } else if comms.agent_status == "thinking" {
                        span {
                            style: "font-size: 10px; color: #ffbb00; font-weight: 700; animation: pulse 1s infinite;",
                            "⚡ ANALISI"
                        }
                    }
                }
            }

            // Expanded Holographic Panel (GTA / Cyberpunk Comms Box)
            if expanded {
                div {
                    class: "comms-panel-holo",
                    style: "width: 330px; max-width: 88vw; background: rgba(0, 0, 0, 0.92); border: 1px solid {th.primary}; border-radius: 12px; padding: 14px; box-shadow: 0 0 25px rgba(0, 255, 136, 0.25), inset 0 0 15px rgba(0, 0, 0, 0.8); backdrop-filter: blur(12px);",

                    // Header Row
                    div {
                        style: "display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid rgba(0, 255, 136, 0.2); padding-bottom: 8px; margin-bottom: 10px;",
                        div {
                            style: "display: flex; align-items: center; gap: 8px;",
                            span {
                                style: "font-size: 12px; font-weight: 900; letter-spacing: 1.5px; color: {th.primary}; text-shadow: 0 0 8px {th.primary};",
                                "📻 COMMS // ANTIGRAVITY"
                            }
                        }
                        div {
                            style: "display: flex; align-items: center; gap: 6px;",
                            button {
                                onclick: move |_| is_expanded.set(false),
                                style: "background: transparent; border: none; color: rgba(255,255,255,0.6); font-size: 14px; cursor: pointer; padding: 2px 6px;",
                                "✕"
                            }
                        }
                    }

                    // Status & Activity Badges
                    div {
                        style: "display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px; font-size: 10px;",
                        div {
                            style: "display: flex; align-items: center; gap: 5px;",
                            span {
                                style: "display: inline-block; width: 7px; height: 7px; border-radius: 50%; background: {status_color}; box-shadow: 0 0 6px {status_color};"
                            }
                            span {
                                style: "color: {status_color}; font-weight: 700; letter-spacing: 0.5px;",
                                "{status_text}"
                            }
                        }
                        div {
                            style: "color: {activity_color}; font-weight: 700; letter-spacing: 0.5px;",
                            "{activity_badge}"
                        }
                    }

                    // Audio Waveform Equalizer (Visible when speaking or thinking)
                    if comms.is_speaking || comms.agent_status == "speaking" || comms.is_listening {
                        div {
                            style: "display: flex; justify-content: center; align-items: flex-end; gap: 4px; height: 22px; margin-bottom: 10px; padding: 0 20px;",
                            for h in [8, 18, 12, 22, 16, 10, 20, 14, 22, 10] {
                                div {
                                    style: "width: 4px; height: {h}px; background: {th.primary}; border-radius: 2px; box-shadow: 0 0 8px {th.primary}; opacity: 0.85;"
                                }
                            }
                        }
                    }

                    // Transcript / Message Bubble
                    div {
                        style: "background: rgba(10, 15, 12, 0.8); border: 1px solid rgba(0, 255, 136, 0.2); border-radius: 8px; padding: 10px; margin-bottom: 12px; max-height: 180px; overflow-y: auto; color: #e0f8ea; font-size: 12px; line-height: 1.45; word-break: break-word;",
                        div {
                            style: "font-size: 9px; font-weight: 800; letter-spacing: 1px; color: rgba(0, 255, 136, 0.6); margin-bottom: 4px;",
                            "ULTIMO MESSAGGIO ASSISTENTE:"
                        }
                        "{comms.last_agent_message}"
                    }

                    // User Last Spoken Prompt Preview (if any)
                    if !comms.last_user_message.is_empty() {
                        div {
                            style: "font-size: 10px; color: #88ccee; margin-bottom: 10px; padding: 4px 8px; background: rgba(0, 40, 60, 0.4); border-left: 2px solid #00e5ff; border-radius: 0 4px 4px 0;",
                            span { style: "font-weight: 700;", "TU: " }
                            "{comms.last_user_message}"
                        }
                    }

                    // Controls Row: PTT Mic & Audio Buttons
                    div {
                        style: "display: flex; gap: 8px; margin-bottom: 10px;",
                        
                        // Big Mic Push-To-Talk Button
                        button {
                            class: "comms-mic-btn",
                            onclick: move |_| {
                                commsToggleListening();
                            },
                            style: if comms.is_listening {
                                "flex: 2; background: #ff2a55; border: 1px solid #ff5577; border-radius: 8px; padding: 8px 12px; color: #ffffff; font-weight: 800; font-size: 12px; cursor: pointer; box-shadow: 0 0 15px #ff2a55; display: flex; align-items: center; justify-content: center; gap: 6px;"
                            } else {
                                "flex: 2; background: rgba(0, 255, 136, 0.15); border: 1px solid rgba(0, 255, 136, 0.6); border-radius: 8px; padding: 8px 12px; color: #00ff88; font-weight: 800; font-size: 12px; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 6px;"
                            },
                            if comms.is_listening {
                                "🔴 REGISTRAZIONE..."
                            } else {
                                "🎙️ PARLA (PTT)"
                            }
                        }

                        // TTS Voice in Temple Speakers Toggle
                        button {
                            onclick: move |_| {
                                commsToggleTts();
                            },
                            title: "Attiva o disattiva la voce negli altoparlanti delle aste RayNeo",
                            style: if comms.tts_enabled {
                                "flex: 1; background: rgba(0, 229, 255, 0.15); border: 1px solid #00e5ff; border-radius: 8px; color: #00e5ff; font-size: 10px; font-weight: 800; cursor: pointer;"
                            } else {
                                "flex: 1; background: rgba(100, 100, 100, 0.2); border: 1px solid rgba(255, 255, 255, 0.2); border-radius: 8px; color: rgba(255, 255, 255, 0.4); font-size: 10px; font-weight: 800; cursor: pointer;"
                            },
                            if comms.tts_enabled {
                                "🔊 VOCE ON"
                            } else {
                                "🔇 MUTE"
                            }
                        }

                        // Stop Audio if currently playing
                        if comms.is_speaking {
                            button {
                                onclick: move |_| commsStopSpeaking(),
                                style: "background: rgba(255, 60, 60, 0.2); border: 1px solid #ff4444; border-radius: 8px; color: #ff6666; font-size: 10px; padding: 0 8px; cursor: pointer; font-weight: 800;",
                                "⏹ STOP"
                            }
                        }
                    }

                    // Hardware Tip
                    div {
                        style: "font-size: 9px; color: rgba(255, 255, 255, 0.45); margin-bottom: 8px; text-align: center;",
                        "💡 Puoi attivare il microfono anche premendo il tasto fisico sulle aste RayNeo"
                    }

                    // Quick Prompt Chips
                    div {
                        style: "display: flex; flex-wrap: wrap; gap: 5px;",
                        for (label, text) in [
                            ("📊 Status", "Dammi uno status sintetico dell'avanzamento"),
                            ("⚡ Cosa fai?", "Cosa stai eseguendo in questo momento?"),
                            ("🚀 Deploy", "Esegui un deploy e aggiorna la PWA"),
                            ("🛑 Stop", "Pausa tutte le operazioni"),
                        ] {
                            button {
                                onclick: move |_| {
                                    commsSendMessage(text);
                                },
                                style: "background: rgba(255, 255, 255, 0.06); border: 1px solid rgba(255, 255, 255, 0.15); border-radius: 4px; padding: 4px 8px; color: rgba(255, 255, 255, 0.75); font-size: 10px; font-weight: 600; cursor: pointer;",
                                "{label}"
                            }
                        }
                    }
                }
            }
        }
    }
}
