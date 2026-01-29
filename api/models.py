from pydantic import BaseModel, Field
from typing import List, Optional

class LegalRequest(BaseModel):
    user_input: str = Field(..., min_length=1)
    jurisdiction: str = Field(..., min_length=1)

from pydantic import BaseModel, Field, ConfigDict
from typing import List, Optional

class WebChunk(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    title: str
    uri: str

class GroundingChunk(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    web: Optional[WebChunk] = None

class GroundingMetadata(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    grounding_chunks: Optional[List[GroundingChunk]] = None

class Part(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    text: str

class Content(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    parts: List[Part]

class GeminiCandidate(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    content: Content
    grounding_metadata: Optional[GroundingMetadata] = None

class Source(BaseModel):
    title: str
    uri: str

class LegalResult(BaseModel):
    text: str
    sources: List[Source]

class HealthResponse(BaseModel):
    status: str
    message: str
