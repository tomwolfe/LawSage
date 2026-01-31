from pydantic import BaseModel, Field, ConfigDict
from typing import List, Optional

class StandardErrorResponse(BaseModel):
    model_config = ConfigDict(extra='ignore')
    error: bool = True
    type: str
    detail: str

class LegalRequest(BaseModel):
    model_config = ConfigDict(extra='ignore', from_attributes=True)
    user_input: str = Field(..., min_length=1)
    jurisdiction: str = Field(..., min_length=1)
    case_id: Optional[str] = None
    chat_history: Optional[List[dict]] = Field(default_factory=list)

class WebChunk(BaseModel):
    model_config = ConfigDict(extra='ignore', from_attributes=True)
    title: Optional[str] = None
    uri: Optional[str] = None

class GroundingChunk(BaseModel):
    model_config = ConfigDict(extra='ignore', from_attributes=True)
    web: Optional[WebChunk] = None

class GroundingMetadata(BaseModel):
    model_config = ConfigDict(extra='ignore', from_attributes=True)
    grounding_chunks: Optional[List[GroundingChunk]] = None

class Part(BaseModel):
    model_config = ConfigDict(extra='ignore', from_attributes=True)
    text: Optional[str] = None
    thought: Optional[bool] = None

class Content(BaseModel):
    model_config = ConfigDict(extra='ignore', from_attributes=True)
    parts: Optional[List[Part]] = None

class GeminiCandidate(BaseModel):
    model_config = ConfigDict(extra='ignore', from_attributes=True)
    content: Optional[Content] = None
    finish_reason: Optional[str] = None
    grounding_metadata: Optional[GroundingMetadata] = None

class Source(BaseModel):
    model_config = ConfigDict(extra='ignore', from_attributes=True)
    title: Optional[str] = None
    uri: Optional[str] = None

class LegalHelpResponse(BaseModel):
    model_config = ConfigDict(extra='ignore', from_attributes=True)
    text: str
    sources: List[Source]
    thinking_steps: Optional[List[str]] = Field(default_factory=list)
    chat_history: Optional[List[dict]] = Field(default_factory=list)
    discovery_questions: Optional[List[str]] = Field(default_factory=list)

class AnalysisResponse(BaseModel):
    model_config = ConfigDict(extra='ignore', from_attributes=True)
    analysis: str
    weaknesses: List[str]
    recommendations: List[str]

class HealthResponse(BaseModel):
    model_config = ConfigDict(extra='ignore', from_attributes=True)
    status: str
    message: str