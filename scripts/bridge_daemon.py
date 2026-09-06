"""
RayNeo HUD <-> Antigravity PC Bridge Daemon
Monitors the local Antigravity conversation transcript and relays messages
bidirectionally between this session and the RayNeo glasses via Dokploy WebSocket.
"""

import argparse
import asyncio
import json
import os
import sys
import time
import urllib.request
import websockets

DEFAULT_TRANSCRIPT = r"C:\Users\HellJack\.gemini\antigravity\brain\8b821246-0476-44f4-875d-18fbf98268f1\.system_generated\logs\transcript.jsonl"
DEFAULT_RELAY_URL = "wss://occhiali.cyb01.giize.com/api/ws?client=pc"
CDP_PORT = 58700

class AntigravityBridge:
    def __init__(self, transcript_path, relay_url):
        self.transcript_path = transcript_path
        self.relay_url = relay_url
        self.last_step_index = -1
        self.ws = None
        self.is_running = True

    async def get_cdp_ws_url(self):
        try:
            req = urllib.request.Request(f"http://127.0.0.1:{CDP_PORT}/json")
            with urllib.request.urlopen(req, timeout=3) as resp:
                targets = json.loads(resp.read().decode("utf-8"))
            for t in targets:
                if t.get("type") == "page" and "8b821246-0476-44f4-875d-18fbf98268f1" in t.get("url", ""):
                    return t.get("webSocketDebuggerUrl")
            # Fallback to first page
            for t in targets:
                if t.get("type") == "page" and t.get("webSocketDebuggerUrl"):
                    return t.get("webSocketDebuggerUrl")
        except Exception as e:
            print(f"[CDP] Errore ricerca target CDP: {e}")
        return None

    async def inject_user_message(self, text):
        print(f"[Bridge] Ricevuto messaggio dall'HUD: '{text}' -> Iniezione in Antigravity...")
        cdp_url = await self.get_cdp_ws_url()
        if not cdp_url:
            print("[CDP] Impossibile trovare la finestra di Antigravity!")
            return False

        try:
            async with websockets.connect(cdp_url) as cdp_ws:
                # 1. Focus and insert text using execCommand & InputEvent
                expr = f"""
                (function() {{
                    const input = document.querySelector('[aria-label="Message input"]') || document.querySelector('div[role="combobox"]');
                    if (!input) return {{"error": "input_not_found"}};
                    input.focus();
                    document.execCommand('selectAll', false, null);
                    document.execCommand('insertText', false, {json.dumps(text)});
                    input.dispatchEvent(new Event('input', {{ bubbles: true }}));
                    
                    // Trigger send button or Enter
                    setTimeout(() => {{
                        const btns = Array.from(document.querySelectorAll('button'));
                        const sendBtn = btns.find(b => {{
                            const label = (b.getAttribute('aria-label') || '').toLowerCase();
                            return (label.includes('send') || label.includes('invia')) && !b.disabled;
                        }});
                        if (sendBtn) {{
                            sendBtn.click();
                        }} else {{
                            input.dispatchEvent(new KeyboardEvent('keydown', {{
                                key: 'Enter',
                                code: 'Enter',
                                keyCode: 13,
                                which: 13,
                                bubbles: true,
                                cancelable: true
                            }}));
                        }}
                    }}, 80);
                    return {{"ok": true}};
                }})()
                """
                call_msg = {
                    "id": int(time.time() * 1000) % 1000000,
                    "method": "Runtime.evaluate",
                    "params": {
                        "expression": expr,
                        "returnByValue": True
                    }
                }
                await cdp_ws.send(json.dumps(call_msg))
                res = await cdp_ws.recv()
                print(f"[CDP] Risultato iniezione: {res}")
                return True
        except Exception as err:
            print(f"[CDP] Errore durante iniezione CDP: {err}")
            return False

    def process_audio(self, b64_data, mime_type):
        import base64
        import tempfile
        import subprocess
        import speech_recognition as sr

        print("[Audio] Ricevuto stream vocale dall'HUD, elaborazione...")
        try:
            raw_bytes = base64.b64decode(b64_data)
        except Exception as e:
            print(f"[Audio] Errore decodifica base64: {e}")
            return None

        ext = ".mp4" if "mp4" in mime_type.lower() else ".webm"
        with tempfile.NamedTemporaryFile(suffix=ext, delete=False) as f_in:
            f_in.write(raw_bytes)
            in_path = f_in.name

        wav_path = in_path + ".wav"
        try:
            cmd = ["ffmpeg", "-y", "-i", in_path, "-ar", "16000", "-ac", "1", wav_path]
            subprocess.run(cmd, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, check=True)

            r = sr.Recognizer()
            with sr.AudioFile(wav_path) as source:
                audio_data = r.record(source)

            text = r.recognize_google(audio_data, language="it-IT")
            print(f"[Audio] Trascrizione vocale completata: '{text}'")
            return text
        except sr.UnknownValueError:
            print("[Audio] Nessun parlato rilevato nell'audio.")
            return None
        except Exception as e:
            print(f"[Audio] Errore conversione/trascrizione audio: {e}")
            return None
        finally:
            try: os.remove(in_path)
            except: pass
            try: os.remove(wav_path)
            except: pass

    async def watch_transcript(self):
        # First read: find the current highest step_index
        if os.path.exists(self.transcript_path):
            try:
                with open(self.transcript_path, "r", encoding="utf-8") as f:
                    for line in f:
                        line = line.strip()
                        if not line:
                            continue
                        try:
                            item = json.loads(line)
                            step = item.get("step_index", 0)
                            if step > self.last_step_index:
                                self.last_step_index = step
                        except:
                            pass
            except Exception as e:
                print(f"[Watchdog] Errore lettura iniziale: {e}")

        print(f"[Watchdog] Inizializzato step di partenza: {self.last_step_index}")

        # Polling loop for new lines
        while self.is_running:
            await asyncio.sleep(0.5)
            if not self.ws:
                continue

            if not os.path.exists(self.transcript_path):
                continue

            try:
                with open(self.transcript_path, "r", encoding="utf-8") as f:
                    for line in f:
                        line = line.strip()
                        if not line:
                            continue
                        try:
                            item = json.loads(line)
                        except:
                            continue

                        step = item.get("step_index", 0)
                        if step <= self.last_step_index:
                            continue

                        self.last_step_index = step
                        item_type = item.get("type")
                        content = item.get("content")
                        thinking = item.get("thinking")
                        tool_calls = item.get("tool_calls")

                        if item_type == "PLANNER_RESPONSE":
                            if thinking:
                                thought_text = str(thinking).strip()
                                # Extract headline or first clean sentence
                                first_line = thought_text.split("\n")[0].replace("**", "").replace("#", "").strip()
                                if not first_line and len(thought_text) > 0:
                                    first_line = thought_text[:90]
                                if len(first_line) > 90:
                                    first_line = first_line[:87] + "..."
                                print(f"[Transcript] Analisi agente: {first_line}")
                                await self.ws.send(json.dumps({
                                    "type": "agent_thinking",
                                    "thought": first_line,
                                    "timestamp": int(time.time() * 1000)
                                }))

                            if tool_calls and isinstance(tool_calls, list):
                                for tc in tool_calls:
                                    if not isinstance(tc, dict):
                                        continue
                                    tool_name = tc.get("name") or "tool"
                                    args = tc.get("args") or {}
                                    action = args.get("toolAction") or args.get("toolSummary") or ""
                                    if isinstance(action, str):
                                        action = action.strip('\"\'')
                                    
                                    target = args.get("AbsolutePath") or args.get("TargetFile") or args.get("CommandLine") or args.get("Query") or ""
                                    if isinstance(target, str):
                                        target = target.strip('\"\'')
                                        if len(target) > 55:
                                            target = "..." + target[-52:]
                                    
                                    display_str = f"{action}: {target}" if (action and target) else (action or target or tool_name)
                                    print(f"[Transcript] Tool in esecuzione: [{tool_name}] {display_str}")
                                    
                                    await self.ws.send(json.dumps({
                                        "type": "agent_tool",
                                        "toolName": tool_name,
                                        "action": action or tool_name,
                                        "detail": target,
                                        "display": f"[{tool_name}] {display_str}",
                                        "timestamp": int(time.time() * 1000)
                                    }))

                            if content:
                                # Agent completed a user-facing reply!
                                print(f"[Transcript] Nuovo messaggio agente ({len(content)} caratteri)")
                                msg = {
                                    "type": "agent_response",
                                    "step": step,
                                    "content": content,
                                    "timestamp": int(time.time() * 1000)
                                }
                                await self.ws.send(json.dumps(msg))

            except Exception as e:
                print(f"[Watchdog] Errore scansione transcript: {e}")

    async def run(self):
        print(f"=== Antigravity <-> RayNeo HUD Bridge Daemon ===")
        print(f"Transcript: {self.transcript_path}")
        print(f"Relay Server: {self.relay_url}")

        # Start transcript watchdog concurrently
        asyncio.create_task(self.watch_transcript())

        while self.is_running:
            try:
                print(f"[Relay] Connessione a {self.relay_url}...")
                async with websockets.connect(self.relay_url, ping_interval=20, ping_timeout=20) as ws:
                    self.ws = ws
                    print("[Relay] Connesso con successo al server relay!")
                    
                    # Announce PC bridge is online
                    await ws.send(json.dumps({
                        "type": "system",
                        "event": "pc_online",
                        "session": "8b821246-0476-44f4-875d-18fbf98268f1",
                        "timestamp": int(time.time() * 1000)
                    }))

                    async for message in ws:
                        try:
                            data = json.loads(message)
                            mtype = data.get("type")
                            if mtype == "user_message":
                                user_text = data.get("text", "").strip()
                                if user_text:
                                    await self.inject_user_message(user_text)
                            elif mtype == "user_audio":
                                audio_b64 = data.get("audio", "")
                                mime = data.get("mimeType", "audio/mp4")
                                if audio_b64:
                                    transcribed = await asyncio.to_thread(self.process_audio, audio_b64, mime)
                                    if transcribed:
                                        # Notify HUD of recognized text
                                        await ws.send(json.dumps({
                                            "type": "transcription_result",
                                            "text": transcribed,
                                            "timestamp": int(time.time() * 1000)
                                        }))
                                        await self.inject_user_message(transcribed)
                                    else:
                                        await ws.send(json.dumps({
                                            "type": "transcription_result",
                                            "text": "⚠️ Audio non compreso o troppo breve. Riprova.",
                                            "timestamp": int(time.time() * 1000)
                                        }))
                        except Exception as e:
                            print(f"[Relay] Errore gestione messaggio in arrivo: {e}")
            except (websockets.ConnectionClosed, ConnectionRefusedError, OSError) as err:
                print(f"[Relay] Connessione persa ({err}), riconnessione tra 3 secondi...")
                self.ws = None
                await asyncio.sleep(3)
            except Exception as ex:
                print(f"[Relay] Errore imprevisto: {ex}, riprovo tra 5 secondi...")
                self.ws = None
                await asyncio.sleep(5)

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Antigravity RayNeo Bridge Daemon")
    parser.add_argument("--transcript", default=DEFAULT_TRANSCRIPT, help="Path to transcript.jsonl")
    parser.add_argument("--relay", default=DEFAULT_RELAY_URL, help="Relay WebSocket URL")
    args = parser.parse_args()

    bridge = AntigravityBridge(args.transcript, args.relay)
    try:
        asyncio.run(bridge.run())
    except KeyboardInterrupt:
        print("\n[Bridge] Terminazione richiesta dall'utente.")
