from pydantic import BaseModel, Field, ConfigDict
from typing import List, Optional

class LegalRequest(BaseModel):
    model_config = ConfigDict(extra='ignore', from_attributes=True)
    user_input: str = Field(..., min_length=1)
    jurisdiction: str = Field(..., min_length=1)

class WebChunk(BaseModel):
    model_config = ConfigDict(extra='ignore', from_attributes=True)
    title: str
    uri: str

class GroundingChunk(BaseModel):
    model_config = ConfigDict(extra='ignore', from_attributes=True)
    web: Optional[WebChunk] = None

class GroundingMetadata(BaseModel):
    model_config = ConfigDict(extra='ignore', from_attributes=True)
    grounding_chunks: Optional[List[GroundingChunk]] = None

class Part(BaseModel):
    model_config = ConfigDict(extra='ignore', from_attributes=True)
    text: str

class Content(BaseModel):
    model_config = ConfigDict(extra='ignore', from_attributes=True)
    parts: List[Part]

class GeminiCandidate(BaseModel):
    model_config = ConfigDict(extra='ignore', from_attributes=True)
    content: Content
    grounding_metadata: Optional[GroundingMetadata] = None

class Source(BaseModel):
    model_config = ConfigDict(extra='ignore', from_attributes=True)
    title: str
    uri: str

class LegalResult(BaseModel):
    model_config = ConfigDict(extra='ignore', from_attributes=True)
    text: str
    sources: List[Source]

class HealthResponse(BaseModel):
    model_config = ConfigDict(extra='ignore', from_attributes=True)
    status: str
    message: str