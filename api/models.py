from pydantic import BaseModel
from typing import List, Optional

class LegalRequest(BaseModel):
    user_input: str
    jurisdiction: str

class WebChunk(BaseModel):
    title: str
    uri: str

class GroundingChunk(BaseModel):
    web: Optional[WebChunk] = None

class GroundingMetadata(BaseModel):
    grounding_chunks: Optional[List[GroundingChunk]] = None

class Part(BaseModel):
    text: str

class Content(BaseModel):
    parts: List[Part]

class GeminiCandidate(BaseModel):
    content: Content
    grounding_metadata: Optional[GroundingMetadata] = None

class Source(BaseModel):
    title: str
    uri: str

class LegalResult(BaseModel):
    text: str
    sources: List[Source]
