# LawSage: The Universal Public Defender

**Democratizing Legal Access for Everyone**

LawSage is an open-source AI-powered platform designed to empower individuals representing themselves in court (Pro Se litigants). By leveraging advanced AI models and real-time legal grounding, LawSage analyzes your unique legal situation and generates a personalized, court-admissible roadmap, structured timelines, and IRAC-compliant legal filings.

> **Legal Disclaimer:** I am an AI, not an attorney. This tool provides legal information, not legal advice. Use of this tool does not create an attorney-client relationship.

## Features

*   **Hierarchical Agent Swarm:** Transitioned from a linear pipeline to a multi-agent swarm featuring a **Senior Attorney** node that red-teams final drafts for logical fallacies (non-sequiturs, circular reasoning) and tactical errors.
*   **Hybrid Search (Semantic + BM25):** Combines vector-based semantic retrieval with **BM25 keyword ranking** and Reciprocal Rank Fusion (RRF) for ultra-precise legal citation discovery.
*   **Reasoning-Based Verification:** Upgraded verification service that uses Gemini to validate if the 'holding' of a cited case law actually supports the specific legal argument being made in the memo.
*   **Local-Local Rules Engine:** Deep intelligence for county-specific superior court rules (starting with **Los Angeles County**), covering specific filing requirements like Mandatory Settlement Conferences and Ex Parte procedures.
*   **Conversational Discovery Loop:** The Interrogator now supports a multi-turn conversational loop, allowing users to answer discovery questions and clarify facts before research begins.
*   **Procedural Engine:** Automatically generates jurisdiction-specific court checklists and deadlines (e.g., California CCP rules) to keep your litigation on track.
*   **Multimodal Evidence Intake:** Upload documents (PDF, DOCX), images (PNG, JPG), or audio recordings. Images are processed using **multimodal OCR** to extract facts for the IRAC 'Application' section.
*   **API-Backed Citation Verification:** Integrates with the **CourtListener (Free Law Project)** API to validate legal citations and flag unverified rules in real-time.
*   **Map-Reduce Legal Aggregation:** Autonomously handles massive document sets (100+ pages) by summarizing individual chunks and performing a "reduce" step to create a master **Case Fact Sheet**.
*   **AES-256 Vault Security:** Local vector data (ChromaDB) is secured with AES-256 encryption using the `cryptography` library.
*   **Automated Shepardizing:** Integrated "Verification Loop" that performs real-time checks to detect if cited laws have been overruled or superseded.

## Technology Stack

LawSage is built on a modern, performant full-stack architecture:

*   **Frontend:** Next.js 16 (React 19) with Tailwind CSS and Lucide Icons.
*   **Backend:** FastAPI (Python) for a robust, asynchronous API.
*   **Workflow Orchestration:** **LangGraph** for hierarchical multi-agent state management and red-teaming loops.
*   **AI Engine:** Google Gemini 2.0 Flash with web search grounding for real-time legal research and reasoning validation.
*   **Hybrid Search:** **rank_bm25** combined with **ChromaDB** for dual-mode information retrieval.
*   **Speech-to-Text:** **OpenAI Whisper (base model)** for local audio evidence transcription.
*   **Security:** **Cryptography (Fernet)** for AES-256 directory encryption of the local vector store.
*   **Offline Cache:** **SQLite with FTS5** for high-performance local statute indexing.

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

LawSage uses a **Hierarchical Multi-Agent Swarm** to process your request:

1.  **Interrogator (Conversational Loop):** Identifies factual gaps via a multi-turn chat, gathering necessary details before research starts.
2.  **Researcher (Hybrid Search):** Performs combined semantic and BM25 keyword searches across local databases and the live web.
3.  **Procedural Guide (Local-Local):** Injects state-specific and county-level court rules (e.g., LASC rules) into the planning phase.
4.  **Reasoner (Strategy):** Develops a high-level roadmap. Uses **Map-Reduce** for large-scale context aggregation.
5.  **Drafter (IRAC):** Preparation of the formal memo strictly following the **ISSUE, RULE, APPLICATION, CONCLUSION** framework.
6.  **Formatter (Templates):** Maps the strategy to jurisdiction-compliant legal templates and 28-line pleadings.
7.  **Verifier (Reasoning Validation):** Shepardizes citations and performs deep reasoning checks to ensure case law actually supports the arguments.
8.  **Senior Attorney (Red-Teamer):** The final supervisor. Analyzes the work for logical fallacies and strategy holes, routing back to the Drafter if improvements are needed.


### Evidence Management

1.  **Upload Evidence:** Upload audio, documents, or **images (PNG/JPG)**.
2.  **OCR & Transcription:** Audio is transcribed via Whisper; images are analyzed via Gemini multimodal vision to extract legal facts.
3.  **Timeline Generation:** LawSage identifies key dates and events, assigning importance levels.
4.  **Pleading Export:** Export final filings in a standard **28-line numbered pleading format** ready for U.S. courts.
5.  **Encryption:** When the application closes, your `chroma_db` is automatically secured with AES-256.

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

