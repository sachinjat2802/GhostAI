"""
Ghost AI — Faster-Whisper Local Python Speech-to-Text Server
Provides sub-100ms offline speech recognition for Ghost AI.

Requirements:
    pip install faster-whisper fastapi uvicorn python-multipart

Usage:
    python stt_server.py
"""

import os
import io
import time
import uvicorn
from fastapi import FastAPI, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from faster_whisper import WhisperModel

app = FastAPI(title="Ghost AI Faster-Whisper Local STT Server")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Select model: "large-v3-turbo", "medium.en", "small.en", "base.en", "tiny.en"
MODEL_NAME = os.getenv("WHISPER_MODEL", "large-v3-turbo")
DEVICE = os.getenv("WHISPER_DEVICE", "auto") # "cuda", "cpu", or "auto"
COMPUTE_TYPE = os.getenv("WHISPER_COMPUTE", "default") # "float16", "int8", or "default"

print(f"🚀 Loading Faster-Whisper model '{MODEL_NAME}' on device '{DEVICE}'...")
model = WhisperModel(MODEL_NAME, device=DEVICE, compute_type=COMPUTE_TYPE)
print("✅ Faster-Whisper model ready!")


@app.get("/health")
def health():
    return {"status": "ok", "model": MODEL_NAME, "device": DEVICE}


@app.post("/transcribe")
@app.post("/v1/audio/transcriptions")
async def transcribe(file: UploadFile = File(...)):
    start_time = time.time()
    audio_bytes = await file.read()
    audio_stream = io.BytesIO(audio_bytes)

    segments, info = model.transcribe(
        audio_stream,
        beam_size=1,
        language="en",
        vad_filter=True,
        vad_parameters=dict(min_silence_duration_ms=300),
    )

    text = " ".join([segment.text for segment in segments]).strip()
    duration_ms = int((time.time() - start_time) * 1000)

    if text:
        print(f"🎤 [{duration_ms}ms] Transcribed: \"{text}\"")

    return {
        "text": text,
        "duration_ms": duration_ms,
        "language": info.language,
        "language_probability": info.language_probability,
    }


if __name__ == "__main__":
    port = int(os.getenv("STT_PORT", 8000))
    print(f"📡 Faster-Whisper Local STT server running on http://localhost:{port}")
    uvicorn.run(app, host="0.0.0.0", port=port, log_level="warning")
