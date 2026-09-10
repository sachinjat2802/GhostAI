# Ghost AI — API & Protocol Specification

## 1. Socket.IO Real-Time Events (Port 3001)

### 1.1 Outgoing Server Events (Server $\rightarrow$ Clients)

| Event Name | Payload Type | Description |
|------------|--------------|-------------|
| `init-state` | `{ mode, transcript, history }` | Emitted immediately on client connection with full session state. |
| `ui:transcript` | `string` | Emitted when new spoken text is transcribed by STT. |
| `ui:suggestion-chunk` | `string` | Emitted token-by-token during LLM response streaming. |
| `ui:suggestion-end` | `null` | Emitted when LLM response finishes streaming. |
| `ui:suggestion` | `string` | Emitted when a complete suggestion is ready or updated. |
| `mode-changed` | `string` | Emitted when assistant mode (`interview`, `meeting`, `coding`, `general`) is changed. |
| `context:cleared` | `null` | Emitted when session history is cleared. |
| `overlay:hide` | `null` | Emitted when screen share is detected by System Monitor. |
| `overlay:show` | `null` | Emitted when screen share ends. |

### 1.2 Incoming Client Events (Clients $\rightarrow$ Server)

| Event Name | Payload Type | Description |
|------------|--------------|-------------|
| `audio-chunk` | `ArrayBuffer` / `Buffer` | Raw 16kHz 16-bit PCM audio chunk emitted from mic/system capture. |
| `command` | `{ type: string, payload: any }` | Dispatches remote actions (`start-listening`, `stop-listening`, `clear-context`, `analyze-image`, `ai-action`). |
| `settings-sync` | `object` | Synchronizes API keys, Gemini model preference, resume, and job description. |

---

## 2. REST Endpoints

### 2.1 `GET /health`
Returns server operational health status.
- **Response**:
  ```json
  { "status": "ok", "service": "ghost-ai-core", "timestamp": 1741607248000 }
  ```

### 2.2 `GET /api/info`
Returns IP address, spy URL, and QR code generation endpoint for mobile pairing.
- **Response**:
  ```json
  {
    "status": "ok",
    "ip": "192.168.1.50",
    "port": "3001",
    "spyUrl": "http://192.168.1.50:3001/spy",
    "localSpyUrl": "http://localhost:3001/spy",
    "qrUrl": "https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=..."
  }
  ```

### 2.3 `POST /api/settings`
Syncs setting updates via HTTP POST.

### 2.4 `POST /api/audio-chunk`
Accepts binary PCM audio streams (`application/octet-stream`).

### 2.5 `GET /export/md` & `GET /export/json`
Downloads complete session context as formatted Markdown or JSON.
