import whisper
import tempfile
import os

class AudioProcessor:
    _model = None

    @classmethod
    def get_model(cls):
        if cls._model is None:
            # Use the 'base' model as requested
            cls._model = whisper.load_model("base")
        return cls._model

    @staticmethod
    def transcribe(file_bytes: bytes) -> str:
        """Transcribes audio bytes to text using OpenAI Whisper."""
        model = AudioProcessor.get_model()
        
        # Whisper requires a file path or a numpy array
        # We'll save to a temp file for simplicity
        with tempfile.NamedTemporaryFile(delete=False, suffix=".mp3") as tmp:
            tmp.write(file_bytes)
            tmp_path = tmp.name

        try:
            result = model.transcribe(tmp_path)
            return result.get("text", "").strip()
        finally:
            if os.path.exists(tmp_path):
                os.remove(tmp_path)
