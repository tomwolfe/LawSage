# LawSage: The Universal Public Defender

**Democratizing Legal Access for Everyone**

LawSage is an open-source, AI-powered platform designed to empower individuals representing themselves in court (Pro Se litigants). By leveraging a sophisticated hierarchical agent swarm and real-time legal grounding, LawSage analyzes your unique legal situation and generates a personalized, court-admissible roadmap, structured timelines, and IRAC-compliant legal filings.

> **Legal Disclaimer:** I am an AI, not an attorney. This tool provides legal information, not legal advice. Use of this tool does not create an attorney-client relationship.

## Features

*   **Hierarchical Agent Swarm:** Transitioned from a linear pipeline to a multi-agent swarm featuring a **Senior Attorney** node that acts as 'Opposing Counsel' to red-team final drafts for logical fallacies, **strategy holes**, and missing **rebuttals/anticipatory defenses**.
*   **Hybrid Search (Semantic + BM25):** Combines vector-based semantic retrieval with **BM25 keyword ranking** and Reciprocal Rank Fusion (RRF) for ultra-precise legal citation discovery.
*   **Deep Shepardizing & Reasoning Verification:** Upgraded verification service that uses Gemini Search Grounding to detect **Negative Treatment** (overruled, superseded, or questioned) and validates if the 'holding' of a cited case law actually supports the specific 'Application' facts in the memo. Includes circular validity checks.
*   **Pluggable Local Rules Engine:** Deep intelligence for county-specific superior court rules. Features a **LocalRulesIngestor** pipeline for indexing PDF/text court rules into ChromaDB, enabling jurisdiction-specific compliance for any US county.
*   **Conversational Discovery Loop:** The Interrogator now supports a multi-turn conversational loop, allowing users to answer discovery questions and clarify facts before research begins.
*   **Procedural Engine:** Automatically generates jurisdiction-specific court checklists and deadlines (e.g., California CCP rules) to keep your litigation on track.
*   **Multimodal Fact Correlation:** Upload documents (PDF, DOCX), images (PNG, JPG), or audio recordings. LawSage automatically maps evidence descriptions to specific case facts and generates a structured **Exhibit List** in the final output.
*   **API-Backed Citation Verification:** Integrates with the **CourtListener (Free Law Project)** API to validate legal citations and flag unverified rules. Includes a structured **Verification Report** identifying unverified citations and reasoning mismatches.
*   **Map-Reduce Legal Aggregation:** Autonomously handles massive document sets (100+ pages) by summarizing individual chunks and performing a "reduce" step to create a master **Case Fact Sheet**.
*   **Full-Stack AES-256 Security:**
    *   **Backend:** Local vector data (ChromaDB) is secured with AES-256 encryption.
    *   **Frontend:** Case history is encrypted with **AES-256 (crypto-js)** before being stored in `localStorage` or exported, ensuring sensitive legal data remains private.
*   **Pleading Format Export:** Export final filings in a standard **28-line numbered pleading format** ready for U.S. courts.
*   **Transparency & Audit Trail:** Every legal claim is backed by a machine-verifiable audit log, showing the exact queries and sources used by each agent in the workflow.

## Technology Stack

LawSage is built on a modern, performant full-stack architecture:
*   **Frontend:** Next.js 16 (React 19) with Tailwind CSS, Lucide Icons, and **Crypto-JS** for client-side vault security.
*   **Backend:** FastAPI (Python) for a robust, asynchronous API.
*   **Workflow Orchestration:** **LangGraph** for hierarchical multi-agent state management and red-teaming loops.
*   **AI Engine:** Google Gemini 2.5 Flash with web search grounding for real-time legal research, **Shepardizing**, and reasoning validation.
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
*   *(Optional)* A CourtListener API Key for enhanced citation verification (Get one from [Free Law Project](https://free.law/courtlister/))

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

4.  **Seed the Offline Database** (Optional but recommended)
```bash
python3 scripts/seed_offline_db.py
```

5.  **Set Your API Keys & Vault Key**
*   **Gemini API Key:** Open the application in your browser (`http://localhost:3000`). Click the "Settings" button in the top right corner. Enter your Google Gemini API Key and click "Save Settings".
*   **(Optional) CourtListener API Key:** Set the `COURTLISTENER_API_KEY` environment variable.
*   **(Optional) Encryption Key:** Set `LAWSAGE_ENCRYPTION_KEY` as an environment variable for persistent vault security. If not set, a default key is used (not recommended for production).

### Running the Application
Start both the Next.js frontend and the FastAPI backend simultaneously:
```bash
npm run dev
```
The application will be available at `http://localhost:3000`.

## How It Works

LawSage uses a **Hierarchical Multi-Agent Swarm** to process your request:

1.  **Interrogator (Conversational Loop):** Identifies factual gaps via a multi-turn chat, gathering necessary details before research starts.
2.  **Researcher (Hybrid Search):** Performs combined semantic and BM25 keyword searches across local databases and the live web. Includes counter-grounding for adversarial analysis.
3.  **Procedural Guide (Local-Local):** Injects state-specific and county-level court rules (e.g., LASC rules) into the planning phase.
4.  **Reasoner (Strategy):** Develops a high-level roadmap. Uses **Map-Reduce** for large-scale context aggregation.
5.  **Drafter (IRAC):** Preparation of the formal memo strictly following the **ISSUE, RULE, APPLICATION, CONCLUSION** framework. Integrates evidence-to-fact correlations and generates an **Exhibit List**.
6.  **Formatter (Templates):** Maps the strategy to jurisdiction-compliant legal templates and 28-line pleadings.
7.  **Verifier (Deep Shepardizing):** Checks citations for negative treatment (overruled/superseded) via real-time search and performs deep reasoning checks to ensure case law actually supports the arguments.
8.  **Senior Attorney (Red-Teamer):** The final supervisor. Acts as opposing counsel to find **strategy holes** and ensures the inclusion of **Anticipatory Defenses and Rebuttals**, routing back to the Drafter if improvements are needed.

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
*   [Free Law Project / CourtListener](https://free.law/courtlister/)
*   [ChromaDB](https://www.trychroma.com/)
*   [Tailwind CSS](https://tailwindcss.com/)
*   [Lucide Icons](https://lucide.dev/)