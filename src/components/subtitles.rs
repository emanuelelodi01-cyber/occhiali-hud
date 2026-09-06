use dioxus::prelude::*;
use crate::gps::{CommsState, HudTheme};

#[component]
pub fn AiSubtitles(
    state: Signal<CommsState>,
    theme: Signal<HudTheme>,
) -> Element {
    let comms = state();
    let th = theme();

    // Check if there is anything to display
    let _has_agent_msg = !comms.streamed_subtitle.is_empty() && comms.streamed_subtitle != "In attesa di collegamento con la sessione PC...";
    let has_user_prompt = !comms.last_user_message.is_empty();
    let is_active = comms.is_speaking || comms.is_listening || comms.agent_status != "idle" || comms.is_typing;

    // Agent status badge
    let (status_text, status_color) = match comms.agent_status.as_str() {
        "thinking" => ("⚡ ANALISI IN CORSO...", "#ffbb00"),
        "tool_running" => {
            if !comms.tool_detail.is_empty() {
                ("🛠️ ESECUZIONE TOOL", "#00e5ff")
            } else {
                ("🛠️ OPERAZIONE...", "#00e5ff")
            }
        },
        "speaking" => ("🔊 VOCE ATTIVA", "#00ff88"),
        "transcribing" => ("⏳ TRASCRIZIONE VOCE...", "#00e5ff"),
        _ => {
            if comms.is_speaking {
                ("🔊 RIPRODUZIONE AUDIO...", "#00ff88")
            } else if comms.is_listening {
                ("🎙️ IN ASCOLTO (PARLA ORA)...", "#ff3366")
            } else if comms.is_typing {
                ("✍️ RISPOSTA IN CORSO...", "#00e5ff")
            } else {
                ("PRONTO", "rgba(255,255,255,0.4)")
            }
        }
    };

    let display_text = if !comms.streamed_subtitle.is_empty() {
        &comms.streamed_subtitle
    } else {
        &comms.last_agent_message
    };

    rsx! {
        div {
            class: "ai-subtitles-container",
            style: "position: fixed; top: 92px; left: 50%; transform: translateX(-50%); width: 780px; max-width: 90vw; z-index: 900; pointer-events: none; font-family: 'Rajdhani', 'Orbitron', -apple-system, sans-serif;",

            // Main Subtitle Card
            div {
                class: "ai-subtitles-card",
                style: "background: rgba(0, 0, 0, 0.88); border: 1.5px solid {th.primary}; border-radius: 12px; padding: 16px 24px; box-shadow: 0 0 25px rgba(0, 255, 136, 0.35), inset 0 0 20px rgba(0, 0, 0, 0.9); backdrop-filter: blur(10px); transition: all 0.3s ease;",

                // Header Bar inside Subtitles
                div {
                    style: "display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid rgba(0, 255, 136, 0.25); padding-bottom: 8px; margin-bottom: 12px;",
                    
                    // Identity
                    div {
                        style: "display: flex; align-items: center; gap: 10px;",
                        span {
                            style: "display: inline-block; width: 10px; height: 10px; border-radius: 50%; background: {status_color}; box-shadow: 0 0 10px {status_color};"
                        }
                        span {
                            style: "font-family: 'Orbitron', monospace; font-size: 13px; font-weight: 900; letter-spacing: 2px; color: {th.primary}; text-shadow: 0 0 10px {th.primary};",
                            "🤖 ANTIGRAVITY // AI HUD"
                        }
                        if !comms.tool_detail.is_empty() {
                            span {
                                style: "font-size: 11px; font-weight: 700; color: #00e5ff; background: rgba(0, 229, 255, 0.15); padding: 2px 8px; border-radius: 4px; border: 1px solid rgba(0, 229, 255, 0.4);",
                                "{comms.tool_detail}"
                            }
                        }
                    }

                    // Live Status Pill
                    div {
                        style: "font-family: 'Rajdhani', sans-serif; font-size: 13px; font-weight: 800; letter-spacing: 1px; color: {status_color}; text-shadow: 0 0 8px {status_color};",
                        "{status_text}"
                    }
                }

                // Audio Waveform Visualizer (When speaking or listening)
                if comms.is_speaking || comms.is_listening || comms.agent_status == "speaking" {
                    div {
                        style: "display: flex; justify-content: center; align-items: flex-end; gap: 5px; height: 20px; margin-bottom: 12px;",
                        for h in [6, 14, 10, 18, 12, 8, 16, 11, 20, 15, 9, 17, 12, 6] {
                            div {
                                style: "width: 4px; height: {h}px; background: {th.primary}; border-radius: 2px; box-shadow: 0 0 10px {th.primary};"
                            }
                        }
                    }
                }

                // User Prompt Preview (if user just spoke or typed)
                if has_user_prompt && is_active {
                    div {
                        style: "font-size: 14px; color: #88ccee; margin-bottom: 10px; padding: 6px 12px; background: rgba(0, 40, 60, 0.5); border-left: 3px solid #00e5ff; border-radius: 0 6px 6px 0; font-style: italic;",
                        span { style: "font-weight: 800; font-style: normal; color: #00e5ff;", "TU: " }
                        "\"{comms.last_user_message}\""
                    }
                }

                // Subtitle Dialogue Text (Large & High Contrast for Micro-OLED RayNeo)
                div {
                    style: "font-size: 19px; line-height: 1.5; font-weight: 700; color: #ffffff; text-shadow: 0 2px 4px rgba(0, 0, 0, 0.95); max-height: 240px; overflow-y: hidden; word-break: break-word;",
                    "{display_text}"
                    if comms.is_typing {
                        span {
                            style: "display: inline-block; color: {th.secondary}; font-weight: 900; animation: blink-cursor 0.7s infinite;",
                            " ▌"
                        }
                    }
                }
            }
        }
    }
}
