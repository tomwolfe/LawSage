# LawSage: The Universal Public Defender

**Democratizing Legal Access for Everyone**

LawSage is an open-source AI-powered platform designed to empower individuals representing themselves in court (Pro Se litigants). By leveraging advanced AI models and real-time legal grounding, LawSage analyzes your unique legal situation and generates a personalized, court-admissible roadmap and legal filings.

> **Legal Disclaimer:** I am an AI, not an attorney. This tool provides legal information, not legal advice. Use of this tool does not create an attorney-client relationship.

## Features

*   **Voice Input:** Describe your situation naturally using your microphone.
*   **High-Reliability Pipeline:** A 4-stage agentic workflow (Researcher, Reasoner, Formatter, Verifier) powered by LangGraph ensures accuracy and structural integrity.
*   **Automated Citation Verification:** Integrated "Verification Loop" cross-references every cited statute against grounding data, triggering an automatic re-search if hallucinations are detected.
*   **Offline-First Grounding:** Local SQLite database with FTS5 (Full-Text Search) provides instant access to common state statutes even without web access.
*   **Case-Aware RAG:** Segment your research and uploads by `case_id` to maintain strict context between different legal matters.
*   **Jurisdiction-Specific Analysis:** Tailor your legal strategy and filings to your specific state or federal jurisdiction.
*   **Structured Legal Templates:** Uses jurisdiction-compliant JSON templates for common filings like Motions to Dismiss, Answers, and Summary Judgments.
*   **Local & Private:** Your data remains private. Your API key and local database stay on your machine.

## Technology Stack

LawSage is built on a modern, performant full-stack architecture:

*   **Frontend:** Next.js 16 (React 19) with Tailwind CSS and Lucide Icons.
*   **Backend:** FastAPI (Python) for a robust, asynchronous API.
*   **Workflow Orchestration:** **LangGraph** for complex multi-agent state management and iterative loops.
*   **AI Engine:** Google Gemini 2.5 Flash with web search grounding for real-time legal research.
*   **Offline Cache:** **SQLite with FTS5** for high-performance local statute indexing.
*   **Vector Search:** LangChain with Google Generative AI embeddings (ChromaDB) for semantic search over case-specific documents.
*   **AI Safety & Structure:** Multi-stage validation layer enforces consistent output with mandatory disclaimers and structured filings.

## Getting Started

### Prerequisites

*   Node.js (v18+ recommended)
*   Python (v3.9+ recommended)
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
    pip install -r api/requirements.txt
    ```

4.  **Seed the Offline Database**
    ```bash
    python3 scripts/seed_offline_db.py
    ```

5.  **Set Your API Key**
    *   Open the application in your browser (`http://localhost:3000`).
    *   Click the "Settings" button in the top right corner.
    *   Enter your Google Gemini API Key and click "Save Settings".

### Running the Application

Start both the Next.js frontend and the FastAPI backend simultaneously:
```bash
npm run dev
```

## How It Works

LawSage uses a **4-Stage High-Reliability Pipeline** to process your request:

1.  **Researcher (Search):** Queries the local SQLite database and Google Search (site:.gov) to find relevant statutes and codes.
2.  **Reasoner (Strategy):** Analyzes the research results to develop a procedural roadmap and legal theory.
3.  **Formatter (Templates):** Applies the strategy to structured JSON templates to generate court-admissible documents.
4.  **Verifier (Citation Check):** Scans the final draft for legal citations. If it finds a citation not present in the grounding data, it **automatically routes back to the Researcher** to find the missing info and re-draft the document.


### Document Analysis (Red Team)

1.  **Upload:** Use the "Upload Document for Analysis" button to select a PDF, DOCX, or TXT file.
2.  **Analyze:** LawSage will automatically analyze the document and display a "Red Team Analysis" tab.
3.  **Output:** The AI will provide:
    *   A summary of the document.
    *   A list of potential legal and procedural weaknesses.
    *   Strategic recommendations to improve your position.

## Deployment

The easiest way to deploy LawSage is on **Vercel**.

1.  Push your code to a public GitHub repository.
2.  Go to [https://vercel.com/new](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme).
3.  Import your repository.
4.  **Important:** Vercel only deploys the frontend. To use the AI features, you must host the FastAPI backend separately.
    *   You can deploy the backend to a service like Render, Railway, or a cloud VM.
    *   Update the `next.config.ts` file's `rewrites` to point to your deployed backend URL.
5.  Set the `GEMINI_API_KEY` environment variable in your Vercel project settings.

## Contributing

LawSage is an open-source project dedicated to legal democratization. Contributions are welcome!

1.  Fork the repository.
2.  Create a feature branch (`git checkout -b feature/your-feature-name`).
3.  Commit your changes (`git commit -m 'Add some feature'`).
4.  Push to the branch (`git push origin feature/your-feature-name`).
5.  Open a pull request.

Please ensure your code adheres to the existing style and includes tests for new features.

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Acknowledgments

*   [Next.js](https://nextjs.org/)
*   [FastAPI](https://fastapi.tiangolo.com/)
*   [Google AI Studio](https://aistudio.google.com/)
*   [Tailwind CSS](https://tailwindcss.com/)
*   [Lucide Icons](https://lucide.dev/)
*   [Vercel](https://vercel.com/)
*   [LangChain](https://python.langchain.com/)
*   [PyPDF2](https://pypi.org/project/PyPDF2/)
*   [python-docx](https://python-docx.readthedocs.io/)
