from fastapi import FastAPI, Header, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from google import genai
from google.genai import types
import os

from .models import (
    LegalRequest,
    WebChunk,
    GroundingChunk,
    GroundingMetadata,
    Part,
    Content,
    GeminiCandidate,
    Source,
    LegalResult,
)

app = FastAPI(redirect_slashes=False)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.post("/api/generate", response_model=LegalResult)
@app.post("/generate", response_model=LegalResult)
async def generate_legal_help(request: LegalRequest, x_gemini_api_key: str = Header(None)):
    if not x_gemini_api_key:
        raise HTTPException(status_code=401, detail="GEMINI_API_KEY is missing")
    
    try:
        client = genai.Client(api_key=x_gemini_api_key, http_options={'api_version': 'v1alpha'})
        
        # Enable Grounding with Google Search
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
        
        MODEL_ID = "gemini-3-flash-preview"
        
        response = client.models.generate_content(
            model=MODEL_ID,
            contents=prompt,
            config=types.GenerateContentConfig(
                tools=[search_tool]
            )
        )
        
        text_output = ""
        sources = []
        
        if response.candidates and len(response.candidates) > 0:
            raw_candidate = response.candidates[0]
            
            # Safe parsing of parts
            parts = []
            if raw_candidate.content and raw_candidate.content.parts:
                for p in raw_candidate.content.parts:
                    # Check for text attribute safely
                    t = getattr(p, 'text', None)
                    if t:
                        parts.append(Part(text=t))
            
            content = Content(parts=parts)
            
            gm = None
            try:
                raw_gm = getattr(raw_candidate, 'grounding_metadata', None)
                if raw_gm:
                    chunks = []
                    raw_chunks = getattr(raw_gm, 'grounding_chunks', None)
                    if raw_chunks:
                        for chunk in raw_chunks:
                            web = getattr(chunk, 'web', None)
                            if web:
                                chunks.append(GroundingChunk(web=WebChunk(
                                    title=getattr(web, 'title', "Untitled Source"),
                                    uri=getattr(web, 'uri', "#")
                                )))
                    gm = GroundingMetadata(grounding_chunks=chunks)
            except Exception as e:
                print(f"Error parsing grounding metadata: {e}")
                gm = None

            candidate = GeminiCandidate(content=content, grounding_metadata=gm)
            
            if candidate.content.parts:
                # Join all text parts if there are multiple
                text_output = "\n".join([p.text for p in candidate.content.parts])

            # Reliability Delimiter: Ensure '---' exists for frontend split logic
            if '---' not in text_output:
                text_output += "\n\n---\n\nNo filings generated. Please try a more specific request."
            
            if candidate.grounding_metadata and candidate.grounding_metadata.grounding_chunks:
                for chunk in candidate.grounding_metadata.grounding_chunks:
                    if chunk.web:
                        sources.append(Source(title=chunk.web.title, uri=chunk.web.uri))
        else:
            text_output = "I'm sorry, I couldn't generate a response for that situation. Please try rephrasing.\n\n---\n\nNo filings generated."

        return LegalResult(
            text=text_output,
            sources=sources
        )
    except Exception as e:
        print(f"ERROR in generate_legal_help: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/health")
@app.get("/health")
async def health_check():
    return {"status": "ok"}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="127.0.0.1", port=8000)
