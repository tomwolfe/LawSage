# LawSage: The Universal Public Defender

**Democratizing Legal Access for Everyone**

LawSage is an open-source AI-powered platform designed to empower individuals representing themselves in court (Pro Se litigants). By leveraging a hierarchical multi-agent swarm and real-time legal grounding, LawSage analyzes your unique legal situation to generate personalized, court-admissible roadmaps and legal filings.

> **Legal Disclaimer:** I am an AI, not an attorney. This tool provides legal information, not legal advice. Use of this tool does not create an attorney-client relationship.

## Features

*   **Hierarchical Agent Swarm (LangGraph):** A multi-agent workflow featuring specialized nodes:
    *   **The Interrogator:** Identifies factual gaps via targeted discovery questions.
    *   **Researcher:** Performs deep legal research using Google Search Grounding.
    *   **Senior Attorney (Red Team):** Analyzes drafts for logical fallacies, weak arguments, and strategic holes.
    *   **Verifier:** Shepardizes citations via CourtListener API and performs circular validity checks.
*   **Advanced Legal Reasoning:** Integration of IRAC-formatted memos, "Shadow Briefs" (adversarial rebuttals), and Fact-Law matrices mapping evidence to legal elements.
*   **Machine-Verifiable Audit Trail:** A complete transparency log of every agent's queries, retrieved data snippets, and reasoning steps.
*   **Security & Encryption:** Client-side AES-256 encryption using `crypto-js` to ensure your case data remains private in `localStorage`.
*   **Vercel Optimized:** Fully compatible with Vercel's ephemeral filesystem using high-performance in-memory vector storage and API-centric multimodal processing.
*   **Multimodal Input:** Support for voice (Gemini Multimodal), image evidence analysis, and document uploads (PDF, DOCX).
*   **Jurisdiction-Specific Analysis:** Tailored procedural roadmaps including local county-level court rules and standing orders.

## Technology Stack

LawSage is built on a modern, performant full-stack architecture:

*   **Frontend:** Next.js 16 (React 19) with Tailwind CSS, Lucide Icons, and Framer Motion.
*   **Backend:** FastAPI (Python) for robust, asynchronous API management.
*   **Orchestration:** LangGraph for complex, stateful multi-agent workflows.
*   **AI Engine:** Google Gemini 2.0 Flash with Search Grounding and Multimodal capabilities.
*   **Search Engine:** Hybrid Search (Vector + BM25) using Reciprocal Rank Fusion (RRF).
*   **Security:** `crypto-js` for AES-256 client-side encryption; `cryptography` for server-side vaulting (local mode).
*   **Verification:** CourtListener API integration for real-time citation validation.
*   **Deployment:** Optimized for Vercel (Frontend/Serverless) and containerized local environments.

## Getting Started

### Prerequisites

*   Node.js (v18+ recommended)
*   Python (v3.9+ recommended)
*   A Google Gemini API Key ([Google AI Studio](https://aistudio.google.com/))
*   (Optional) CourtListener API Key for enhanced citation verification.

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

4.  **Set Your API Key**
*   Open the application in your browser (`http://localhost:3000`).
*   Click the "Settings" button in the top right corner.
*   Enter your Google Gemini API Key.
*   *Your key is stored securely in your browser's `localStorage` using AES-256 encryption.*

### Running the Application

Start both the Next.js frontend and the FastAPI backend:
```bash
npm run dev
```

Open your browser and navigate to [http://localhost:3000](http://localhost:3000) to begin.

## How It Works

1.  **Discovery:** Describe your situation. "The Interrogator" agent will ask 2-3 targeted questions to bridge any factual gaps.
2.  **Research:** The "Researcher" performs a deep dive into statutes and case law, combining local knowledge bases with real-time web grounding.
3.  **Strategy:** The "Reasoner" develops a procedural roadmap and legal theory.
4.  **Drafting:** The "Drafter" generates an IRAC-formatted memo and Exhibit List.
5.  **Verification:** Citations are cross-referenced against the CourtListener database.
6.  **Red-Teaming:** A "Senior Attorney" agent attempts to defeat your argument with a "Shadow Brief" to identify weaknesses before you file.

## Deployment

LawSage is Pareto-optimized for **Vercel**.

1.  Push your code to GitHub.
2.  Import the project into Vercel.
3.  Configure the `X-Gemini-API-Key` as a header or allow users to provide their own in the UI.
4.  The backend is designed to run as Vercel Serverless Functions (Next.js API routes) or a standalone FastAPI service.

## Contributing

LawSage is an open-source project dedicated to legal democratization. Contributions are welcome!

1.  Fork the repository.
2.  Create a feature branch.
3.  Commit your changes.
4.  Open a pull request.

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.
