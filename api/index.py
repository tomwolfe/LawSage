from fastapi import FastAPI, Header, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from google import genai
from google.genai import types
import os

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class LegalRequest(BaseModel):
    user_input: str
    jurisdiction: str

@app.post("/api/generate")
async def generate_legal_help(request: LegalRequest, x_gemini_api_key: str = Header(None)):
    if not x_gemini_api_key:
        raise HTTPException(status_code=401, detail="GEMINI_API_KEY is missing")
    
    try:
        client = genai.Client(api_key=x_gemini_api_key, http_options={'api_version': 'v1alpha'})
        
        # Enable Grounding with Google Search
        # Note: Using the google-genai SDK format
        search_tool = types.Tool(
            google_search_retrieval=types.GoogleSearchRetrieval()
        )
        
        prompt = f"""
        User Situation: {request.user_input}
        Jurisdiction: {request.jurisdiction}
        
        Act as a Universal Public Defender. 
        1. Search for current statutes and local court procedures relevant to this situation.
        2. Provide a breakdown of the situation in plain English.
        3. Generate a procedural roadmap (step-by-step instructions).
        
        ---
        
        4. Generate the text for necessary legal filings that are court-admissible in the specified jurisdiction.
        
        Format the response such that the strategy and roadmap come BEFORE the '---' delimiter, and the actual legal filings come AFTER the '---' delimiter.
        
        Explicitly state that you are an AI helping the user represent themselves (Pro Se) and that this is legal information, not legal advice.
        """
        
        MODEL_ID = "gemini-3-flash-preview" # or "gemini-2.0-flash" if available
        
        response = client.models.generate_content(
            model=MODEL_ID,
            contents=prompt,
            config=types.GenerateContentConfig(
                tools=[search_tool]
            )
        )
        
        # Extract content and grounding metadata
        text_output = ""
        sources = []
        
        if response.candidates:
            candidate = response.candidates[0]
            if candidate.content.parts:
                text_output = candidate.content.parts[0].text
            
            # Grounding metadata might contain links
            if candidate.grounding_metadata and candidate.grounding_metadata.search_entry_point:
                 # The search_entry_point.rendered_content might contain HTML/Link
                 pass
            
            if candidate.grounding_metadata and candidate.grounding_metadata.grounding_chunks:
                for chunk in candidate.grounding_metadata.grounding_chunks:
                    if chunk.web:
                        sources.append({
                            "title": chunk.web.title,
                            "uri": chunk.web.uri
                        })

        return {
            "text": text_output,
            "sources": sources
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/health")
async def health_check():
    return {"status": "ok"}
