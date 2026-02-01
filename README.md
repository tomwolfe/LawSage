# LawSage: The Universal Public Defender
**Democratizing Legal Access for Everyone**

LawSage is an open-source AI-powered platform designed to empower individuals representing themselves in court (Pro Se litigants). By leveraging advanced AI models and real-time legal grounding, LawSage analyzes your unique legal situation and generates a personalized, court-admissible roadmap and legal filings.

> **Legal Disclaimer:** I am an AI, not an attorney. This tool provides legal information, not legal advice. Use of this tool does not create an attorney-client relationship.

## Features
*   **Voice Input:** Describe your situation naturally using your microphone.
*   **Jurisdiction-Specific Analysis:** Tailor your legal strategy and filings to your specific state or federal jurisdiction (including all 50 U.S. states and Federal).
*   **AI-Powered Strategy:** Receive clear, plain-language analysis and a step-by-step procedural roadmap.
*   **Court-Admissible Filings:** Generate draft legal documents (motions, answers, etc.) formatted for court submission.
*   **Real-Time Grounding:** All responses are grounded in current statutes and legal resources, with direct links to sources.
*   **Local & Private:** Your data never leaves your browser. Your API key is stored securely in your browser's `localStorage`.
*   **Comprehensive History:** Save and revisit your past cases with a full audit trail. Import and export your history as JSON.
*   **Export & Share:** Copy all content to your clipboard or download your filings as a Markdown (.md) file or PDF.
*   **Structured Output:** AI responses are validated for reliability, ensuring mandatory disclaimers, legal citations, and a clear procedural roadmap.
*   **Robust Reliability Layer:** A multi-layered system ensures safety, accuracy, and structural completeness of every output.

## Technology Stack
LawSage is built on a modern, performant full-stack architecture:
*   **Frontend:** Next.js 16 (React 19) with Tailwind CSS and Lucide Icons.
*   **Backend:** FastAPI (Python) for a robust, asynchronous API.
*   **AI Engine:** Google Gemini 2.5 Flash (via the Google AI Python SDK) with web search grounding for real-time legal research.
*   **AI Safety & Structure:** A multi-layered Reliability Layer ensures consistent, safe output with mandatory disclaimers, citation validation, and structural hardening.
*   **State Management:** Local browser storage (`localStorage`) for user preferences and case history.
*   **Deployment:** Optimized for Vercel (frontend) and local/Python hosting (backend).

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

4.  **Set Your API Key**
*   Open the application in your browser (`http://localhost:3000`).
*   Click the "Settings" button in the top right corner.
*   Enter your Google Gemini API Key and click "Save Settings".
*   *Your key is stored securely in your browser's `localStorage` and is never sent to any server except when making requests to Google's API.*

### Running the Application
Start both the Next.js frontend and the FastAPI backend simultaneously:
```bash
npm run dev
```
This command runs `next dev` and `uvicorn api.index:app --host 127.0.0.1 --port 8000 --reload` in parallel.

Open your browser and navigate to [http://localhost:3000](http://localhost:3000) to begin.

## AI Safety & Structure
LawSage employs a multi-layered Reliability Layer to ensure that AI-generated content is safe, accurate, and structurally complete:
*   **Red-Team Auditing:** Every user request is audited for safety violations and jurisdictional clarity before being processed.
*   **Grounded Generation:** Gemini 2.5 Flash is utilized with real-time Google Search grounding to ensure information is based on current statutes.
*   **Reliability Validation:**
    *   **Citations Validation:** Ensures every response contains at least three verifiable legal citations (e.g., U.S.C., State Codes).
    *   **Procedural Completeness:** Verifies the presence of a 'Procedural Roadmap' section to guide the pro se litigant.
    *   **Mandatory Disclaimers:** Every response is prepended with a legal disclaimer to clearly distinguish legal information from legal advice.
    *   **Structural Hardening:** A custom validator enforces a strict delimiter system ('---') to separate legal strategy from filing templates.
    *   **Retry Mechanism:** Built-in exponential backoff for AI service rate limits ensures high availability.
    *   **Structured Output:** The AI is prompted to return a JSON schema, which is validated server-side for completeness and safety before being presented to the user.

## How It Works
1.  **Input:** Describe your legal issue in plain language (e.g., "I was evicted from my apartment without notice").
2.  **Jurisdiction:** Select your relevant state or "Federal" from the dropdown.
3.  **Analyze:** Click "Analyze Case" or use the voice input button.
4.  **Output:** LawSage's AI:
    *   Searches the web for the latest statutes and court rules.
    *   Generates a clear, step-by-step legal strategy and procedural roadmap.
    *   Creates a draft, court-admissible legal filing (e.g., an Answer or Motion).
    *   Provides direct links to the legal sources used for grounding.
5.  **Action:** Review, edit, and copy the generated content to use in your case. You can also download it as a `.md` file or PDF.

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