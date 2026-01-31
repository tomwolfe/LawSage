import base64
from google import genai
from google.genai import types
from api.config_loader import get_settings

class AudioProcessor:
    @staticmethod
    def transcribe(file_bytes: bytes, api_key: str) -> str:
        """Transcribes audio bytes to text using Gemini Multimodal API."""
        client = genai.Client(api_key=api_key)
        model_id = get_settings()["model"]["id"]

        # Base64 encode the audio bytes
        encoded_audio = base64.b64encode(file_bytes).decode("utf-8")
        
        try:
            response = client.models.generate_content(
                model=model_id,
                contents=[
                    "Transcribe this audio accurately. Return only the transcription text.",
                    types.Part.from_bytes(data=file_bytes, mime_type="audio/mp3")
                ]
            )
            return response.text.strip()
        except Exception as e:
            print(f"Gemini transcription failed: {e}")
            return "Transcription failed."
