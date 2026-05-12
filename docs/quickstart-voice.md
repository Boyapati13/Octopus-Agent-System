# Quick Start: Voice → Octopus → Surfaces → TTS

End-to-end guide for sending voice commands to Octopus and hearing the results.

---

## Architecture

```
Wake word / Push-to-talk
        ↓
  ASR (device-native)
  Apple SFSpeechRecognizer (iOS/macOS)
  Android SpeechRecognizer
  ESP32 microphone + Porcupine wake word
        ↓
  Recognized text → AgentDeck
        ↓
  OctopusAdapter.handleCommand({
    type: 'send_prompt',
    text: 'refactor the auth module',
    source: 'voice',          ← routes to /api/tasks/voice
  })
        ↓
  POST http://localhost:3001/api/tasks/voice { "text": "..." }
        ↓
  Octopus runs agent chain
  Emits: chain_start, agent_start × N, chain_done
        ↓
  WS event: voice_summary { summary, success }
        ↓
  AgentDeck surfaces update (LCD strip, TUI, Android card)
        ↓
  Optional TTS:
  Apple AVSpeechSynthesizer.speak(summary)
  Android TextToSpeech.speak(summary)
  ESP32 plays audio
```

---

## Why `/api/tasks/voice` instead of `/api/tasks/run`

`/api/tasks/run` streams many detailed WS events (one per agent, gate, tool call).
`/api/tasks/voice` runs the same chain but emits a single `voice_summary` event at the end — a 1–2 sentence TTS-ready result. This keeps voice output clean and non-repetitive.

---

## AgentDeck voice wiring (OctopusAdapter)

In your AgentDeck session, tag voice commands with `source: 'voice'`:

```typescript
// Push-to-talk button handler (from your AgentDeck plugin code)
onVoiceInput(recognizedText: string): void {
  this.adapter.handleCommand({
    type: 'send_prompt',
    text: recognizedText,
    source: 'voice',      // ← key: routes to /api/tasks/voice
  } as PluginCommand & { source: string });
}
```

The `OctopusAdapter` checks `cmd.source === 'voice'` and calls `client.runVoiceTask(text)` instead of the normal `planTask` + `runTaskChain` path.

---

## WS voice_summary event

After the chain completes, Octopus emits:
```json
{
  "type": "voice_summary",
  "data": {
    "summary": "Task complete in 14.2 seconds. 6 agents ran.",
    "success": true
  }
}
```

Your TTS handler in AgentDeck:
```typescript
// In daemon.ts or your surface handler
adapter.on('adapter_event', (ev: AdapterEvent) => {
  if (ev.event === 'status_line' && ev.data.tts === true) {
    const text = ev.data.text as string;
    speakText(text.replace('🎙 ', ''));  // strip emoji for TTS
  }
});
```

---

## iOS/macOS (SwiftUI)

```swift
import AVFoundation
import Speech

// 1. Wake word or push-to-talk → ASR
class VoiceManager: ObservableObject {
    private let speechRecognizer = SFSpeechRecognizer(locale: Locale(identifier: "en-US"))!
    private let synthesizer = AVSpeechSynthesizer()

    func startListening() {
        // ... SFSpeechRecognizer request setup ...
        request.shouldReportPartialResults = true
        task = speechRecognizer.recognitionTask(with: request) { result, _ in
            if let text = result?.bestTranscription.formattedString, result?.isFinal == true {
                self.sendToOctopus(text)
            }
        }
    }

    // 2. Send to Octopus via REST
    func sendToOctopus(_ text: String) {
        guard let url = URL(string: "http://localhost:3001/api/tasks/voice") else { return }
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try? JSONEncoder().encode(["text": text])
        URLSession.shared.dataTask(with: request).resume()
    }

    // 3. TTS — called from your WS event handler when voice_summary arrives
    func speak(_ text: String) {
        let utterance = AVSpeechUtterance(string: text)
        utterance.rate = 0.5
        utterance.voice = AVSpeechSynthesisVoice(language: "en-US")
        synthesizer.speak(utterance)
    }
}
```

---

## Android

```kotlin
// 1. ASR
val recognizer = SpeechRecognizer.createSpeechRecognizer(context)
recognizer.setRecognitionListener(object : RecognitionListener {
    override fun onResults(bundle: Bundle) {
        val text = bundle.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION)?.firstOrNull()
        text?.let { sendToOctopus(it) }
    }
    // ... other overrides ...
})

// 2. Send to Octopus
fun sendToOctopus(text: String) {
    val url = "http://localhost:3001/api/tasks/voice"
    val body = JSONObject().put("text", text).toString().toRequestBody("application/json".toMediaType())
    OkHttpClient().newCall(Request.Builder().url(url).post(body).build()).enqueue(object : Callback {
        override fun onResponse(call: Call, response: Response) { /* handled via WS */ }
        override fun onFailure(call: Call, e: IOException) { /* log */ }
    })
}

// 3. TTS — called when voice_summary WS event arrives
fun speak(text: String) {
    val tts = TextToSpeech(context) { status ->
        if (status == TextToSpeech.SUCCESS) {
            it.speak(text, TextToSpeech.QUEUE_FLUSH, null, null)
        }
    }
}
```

---

## ESP32 wake word (offline)

Using Porcupine wake word engine:
```cpp
// After wake word detected + ASR completes (e.g. via Whisper or device ASR):
void onVoiceInput(const char* recognized_text) {
    // POST to Octopus via WiFi
    HTTPClient http;
    http.begin("http://192.168.1.100:3001/api/tasks/voice");  // Octopus IP
    http.addHeader("Content-Type", "application/json");
    String body = "{\"text\":\"" + String(recognized_text) + "\"}";
    http.POST(body);
    http.end();
    // Voice summary will arrive via WS and can drive a display or buzzer
}
```

---

## Voice REST API reference

```
POST /api/tasks/voice
  Body:    { "text": "your voice prompt" }
  Returns: { "ok": true, "text": "...", "message": "Voice task started..." }

WS event: voice_summary
  { "type": "voice_summary", "data": { "summary": "...", "success": true/false } }
```

Runs asynchronously. The HTTP call returns immediately; the summary arrives on the WS stream after the chain completes.

---

## Testing voice without hardware

```bash
# Send a voice prompt directly via curl
curl -X POST http://localhost:3001/api/tasks/voice \
  -H "Content-Type: application/json" \
  -d '{"text": "summarize the last architectural decision"}'

# Watch WS events in a separate terminal:
wscat -c ws://localhost:3001/ws
# → {"type":"chain_start","data":{"task":"summarize...",...}}
# → ...
# → {"type":"voice_summary","data":{"summary":"Complete in 8.1s. 4 agents ran.","success":true}}
```

---

## Limitations

- ASR and TTS are not built into Octopus — use your device's native speech APIs
- Octopus provides text-in / text-out (`/api/tasks/voice`)
- Concurrent voice commands are not supported — one chain at a time
- The voice summary is intentionally short (~1–2 sentences) for TTS clarity
