import base64
import tempfile
from pathlib import Path

import numpy as np
import soundfile as sf
import nemo.collections.asr as nemo_asr
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
import uvicorn

app = FastAPI(title="Parakeet Transcription Server")

model = None
model_status = "loading"


class TranscribeRequest(BaseModel):
    audio: str  # base64-encoded raw float32 bytes, 16kHz mono


class TranscribeResponse(BaseModel):
    text: str


class HealthResponse(BaseModel):
    status: str


@app.on_event("startup")
async def load_model():
    global model, model_status
    model_path = Path(__file__).parent / ".." / "transcription-model" / "parakeet-tdt-0.6b-v2.nemo"
    if not model_path.exists():
        model_status = f"error: model not found at {model_path.resolve()}"
        return
    try:
        model = nemo_asr.models.ASRModel.restore_from(str(model_path.resolve()))
        model_status = "ready"
    except Exception as e:
        model_status = f"error: {e}"


@app.get("/health")
def health() -> HealthResponse:
    return HealthResponse(status=model_status)


@app.post("/transcribe")
async def transcribe(req: TranscribeRequest) -> TranscribeResponse:
    if model is None:
        raise HTTPException(status_code=503, detail=f"Model not ready: {model_status}")

    try:
        raw_bytes = base64.b64decode(req.audio)
        samples = np.frombuffer(raw_bytes, dtype=np.float32)

        # Write to temp WAV file for NeMo (expects file paths)
        with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as f:
            sf.write(f.name, samples, 16000)
            temp_path = f.name

        transcriptions = model.transcribe([temp_path])
        Path(temp_path).unlink(missing_ok=True)

        # NeMo may return list of strings or (hypotheses, ...)
        if isinstance(transcriptions, tuple):
            transcriptions = transcriptions[0]

        if transcriptions and len(transcriptions) > 0:
            result = transcriptions[0]
            text = result.text if hasattr(result, "text") else str(result)
        else:
            text = ""

        return TranscribeResponse(text=text.strip())
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


if __name__ == "__main__":
    uvicorn.run(app, host="127.0.0.1", port=8787)
