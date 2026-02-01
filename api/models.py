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
    confidence_score: Optional[float] = Field(default=0.0, ge=0.0, le=1.0)

class LegalElement(BaseModel):
    name: str
    definition: str
    evidence_links: List[str] = Field(default_factory=list)
    confidence: float = 0.0

class FactLawMatrix(BaseModel):
    elements: List[LegalElement]
    summary: str

class VerificationReport(BaseModel):
    model_config = ConfigDict(extra='ignore', from_attributes=True)
    unverified_citations: List[str] = Field(default_factory=list)
    reasoning_mismatches: List[str] = Field(default_factory=list)
    fallacies_found: List[str] = Field(default_factory=list)
    senior_attorney_feedback: Optional[str] = None
    is_approved: bool = True
    exhibit_list: List[str] = Field(default_factory=list)
    grounding_audit_log: List['AuditEntry'] = Field(default_factory=list)
    fact_law_matrix: Optional[FactLawMatrix] = None
    shadow_brief: Optional[str] = None

class AuditEntry(BaseModel):
    node: str
    query: str
    raw_results: List[str]
    timestamp: str

class LegalHelpResponse(BaseModel):
    model_config = ConfigDict(extra='ignore', from_attributes=True)
    text: str
    sources: List[Source]
    thinking_steps: Optional[List[str]] = Field(default_factory=list)
    chat_history: Optional[List[dict]] = Field(default_factory=list)
    discovery_questions: Optional[List[str]] = Field(default_factory=list)
    verification_report: Optional[VerificationReport] = None
    grounding_audit_log: List[AuditEntry] = Field(default_factory=list)
    fact_law_matrix: Optional[FactLawMatrix] = None
    shadow_brief: Optional[str] = None

class AnalysisResponse(BaseModel):
    model_config = ConfigDict(extra='ignore', from_attributes=True)
    analysis: str
    weaknesses: List[str]
    recommendations: List[str]

class HealthResponse(BaseModel):
    model_config = ConfigDict(extra='ignore', from_attributes=True)
    status: str
    message: str