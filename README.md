# LawSage: The Universal Public Defender

**Democratizing Legal Access for Everyone**

LawSage is an open-source AI-powered platform designed to empower individuals representing themselves in court (Pro Se litigants). By leveraging advanced AI models and real-time legal grounding, LawSage analyzes your unique legal situation and generates a personalized, court-admissible roadmap, structured timelines, and IRAC-compliant legal filings.

> **Legal Disclaimer:** I am an AI, not an attorney. This tool provides legal information, not legal advice. Use of this tool does not create an attorney-client relationship.

## Features

*   **Multi-Modal Evidence Processing:** Upload documents (PDF, DOCX) or audio recordings (MP3, WAV, M4A). Audio is automatically transcribed using **OpenAI Whisper**.
*   **Structured Evidence Extraction:** Automatically identifies dates and factual events to generate a chronological `case_timeline.json` with importance ratings.
*   **High-Reliability Pipeline:** A 5-stage agentic workflow (Researcher, Reasoner, Drafter, Formatter, Verifier) powered by LangGraph ensures accuracy and structural integrity.
*   **Strict IRAC Formatting:** Generates legal memos following the professional **Issue, Rule, Application, and Conclusion** framework.
*   **AES-256 Vault Security:** Local vector data (ChromaDB) is secured with AES-256 encryption using the `cryptography` library, ensuring your sensitive case data remains private and protected at rest.
*   **Automated Citation Verification:** Integrated "Verification Loop" cross-references every cited statute against grounding data, triggering an automatic re-search if hallucinations are detected.
*   **Jurisdiction-Specific Analysis:** Performs secondary 'expansion' searches to suggest related statutes based on metadata cross-referencing.
*   **Local & Private:** Your data remains private. Your API key and local database stay on your machine.

## Technology Stack

LawSage is built on a modern, performant full-stack architecture:

*   **Frontend:** Next.js 16 (React 19) with Tailwind CSS and Lucide Icons.
*   **Backend:** FastAPI (Python) for a robust, asynchronous API.
*   **Workflow Orchestration:** **LangGraph** for complex multi-agent state management and iterative loops.
*   **AI Engine:** Google Gemini 2.5 Flash with web search grounding for real-time legal research and timeline extraction.
*   **Speech-to-Text:** **OpenAI Whisper (base model)** for local audio evidence transcription.
*   **Security:** **Cryptography (Fernet)** for AES-256 directory encryption of the local vector store.
*   **Offline Cache:** **SQLite with FTS5** for high-performance local statute indexing.
*   **Vector Search:** LangChain with Google Generative AI embeddings (**ChromaDB**) for semantic search over case-specific documents.

## Getting Started

### Prerequisites

*   Node.js (v18+ recommended)
*   Python (v3.11+ recommended)
*   Rust compiler (required for `setuptools-rust`)
*   A Google Gemini API Key (Get one from the [Google AI Studio](https://aistudio.google.com/))

### Installation

1.  **Clone the Repository**
    ```bash
    git clone https://github.com/tomwolfe/lawsage.git
    cd lawsage
    ```

2.  **Install Frontend Dependencies**
    ```bash
    npm install
    ```

3.  **Install Backend Dependencies**
    ```bash
    pip install -r requirements.txt
    ```

4.  **Seed the Offline Database**
    ```bash
    python3 scripts/seed_offline_db.py
    ```

5.  **Set Your API Key & Vault Key**
    *   Set `LAWSAGE_ENCRYPTION_KEY` as an environment variable (optional, for persistent vault security).
    *   Open the application in your browser (`http://localhost:3000`).
    *   Click the "Settings" button in the top right corner.
    *   Enter your Google Gemini API Key and click "Save Settings".

### Running the Application

Start both the Next.js frontend and the FastAPI backend simultaneously:
```bash
npm run dev
```

## How It Works

LawSage uses a **5-Stage High-Reliability Pipeline** to process your request:

1.  **Researcher (Search):** Queries the local SQLite database, Google Search (site:.gov), and performs jurisdictional expansion to find relevant statutes.
2.  **Reasoner (Strategy):** Analyzes the research results to develop a procedural roadmap and legal theory.
3.  **Drafter (IRAC):** Drafts a formal legal memo strictly adhering to the **ISSUE, RULE, APPLICATION, CONCLUSION** format.
4.  **Formatter (Templates):** Applies the strategy and draft to structured JSON templates to generate court-admissible documents.
5.  **Verifier (Citation Check):** Scans the final draft for legal citations. If it finds an unverified citation, it **automatically routes back to the Researcher**.


### Evidence Management

1.  **Upload Evidence:** Use the `/api/upload-evidence` endpoint to upload audio or document files.
2.  **Transcription:** Audio files are transcribed locally using Whisper.
3.  **Timeline Generation:** LawSage identifies key dates and events, assigning importance levels to help you organize your case chronologically.
4.  **Encryption:** When the application closes, your `chroma_db` is automatically zipped and encrypted with AES-256.

## Contributing

LawSage is an open-source project dedicated to legal democratization. Contributions are welcome!

1.  Fork the repository.
2.  Create a feature branch (`git checkout -b feature/your-feature-name`).
3.  Commit your changes (`git commit -m 'Add some feature'`).
4.  Push to the branch (`git push origin feature/your-feature-name`).
5.  Open a pull request.

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Acknowledgments

*   [Next.js](https://nextjs.org/)
*   [FastAPI](https://fastapi.tiangolo.com/)
*   [Google AI Studio](https://aistudio.google.com/)
*   [LangGraph](https://python.langchain.com/docs/langgraph)
*   [OpenAI Whisper](https://github.com/openai/whisper)
*   [Cryptography.io](https://cryptography.io/)

