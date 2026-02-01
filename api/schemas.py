"""
Pydantic models for structured legal output.
This module defines the schema for reliable, machine-parsable legal responses.
"""
from pydantic import BaseModel, Field
from typing import List, Optional


class Citation(BaseModel):
    """
    Model for legal citations with source information.
    """
    text: str = Field(..., description="The citation text (e.g., '12 U.S.C. § 345')")
    source: Optional[str] = Field(None, description="Source of the citation (e.g., statute, case law)")
    url: Optional[str] = Field(None, description="URL to the citation source")
    is_verified: bool = Field(False, description="Whether the citation has been verified as 'good law'")
    verification_source: Optional[str] = Field(None, description="Source used to verify the citation status")


class StrategyItem(BaseModel):
    """
    Model for individual strategy items in the legal roadmap.
    """
    step: int = Field(..., description="Sequential step number")
    title: str = Field(..., description="Brief title of the step")
    description: str = Field(..., description="Detailed description of the step")
    estimated_time: Optional[str] = Field(None, description="Estimated time to complete the step")
    required_documents: Optional[List[str]] = Field(default_factory=list, description="Documents needed for this step")
    due_date_placeholder: Optional[str] = Field(None, description="Placeholder for due date of the step")
    status: str = Field("pending", description="Current status of the step (pending, in_progress, completed)")


class LegalOutput(BaseModel):
    """
    Main model for structured legal output.
    This replaces the previous delimiter-based approach with a reliable, machine-parsable format.
    """
    disclaimer: str = Field(
        ...,
        description="Mandatory legal disclaimer that must appear in all responses"
    )
    strategy: str = Field(
        ...,
        description="Legal strategy and analysis for the user's situation"
    )
    roadmap: List[StrategyItem] = Field(
        ...,
        description="Step-by-step procedural roadmap for the user"
    )
    filing_template: str = Field(
        ...,
        description="Template for legal filings that can be used in court"
    )
    citations: List[Citation] = Field(
        ...,
        description="Legal citations supporting the strategy and filings"
    )
    sources: List[str] = Field(
        default_factory=list,
        description="Additional sources referenced in the response"
    )


class ValidationError(BaseModel):
    """
    Model for validation errors in the reliability layer.
    """
    field: str = Field(..., description="Name of the field that failed validation")
    error: str = Field(..., description="Description of the validation error")
    suggestion: Optional[str] = Field(None, description="Suggested fix for the error")