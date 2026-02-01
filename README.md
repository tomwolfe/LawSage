# LawSage: The Universal Public Defender
**Democratizing Legal Access for Everyone**

LawSage is an open-source, AI-powered platform designed to empower individuals representing themselves in court (Pro Se litigants). By leveraging advanced AI models and real-time legal grounding, LawSage analyzes your unique legal situation and generates a personalized, court-admissible roadmap and legal filings.

> **Legal Disclaimer:** I am an AI, not an attorney. This tool provides legal information, not legal advice. Use of this tool does not create an attorney-client relationship.

## Key Advancements (v2.0)
LawSage has undergone a major transformation! The latest version is now a **monolithic, Vercel-native application**. This means:
*   **No External Backend Required:** The entire application, including the AI processing, runs within Vercel's Edge Functions. No need to host a separate FastAPI server.
*   **Multimodal OCR:** Upload images of legal documents (summonses, notices, complaints) for AI-powered text extraction and analysis.
*   **Professional Court Templates:** Generate filings with built-in, court-standard formatting and caption templates ready for PDF export.
*   **Simplified Deployment:** Deploy the entire application with a single click on Vercel.

## Features
*   **Voice Input:** Describe your legal situation naturally using your microphone.
*   **Jurisdiction-Specific Analysis:** Tailor your legal strategy and filings to your specific state or federal jurisdiction (all 50 U.S. states and Federal).
*   **AI-Powered Strategy:** Receive clear, plain-language analysis and a step-by-step procedural roadmap.
*   **Court-Admissible Filings:** Generate draft legal documents (motions, answers, etc.) formatted for court submission.
*   **Real-Time Grounding:** All responses are grounded in current statutes and legal resources, with direct links to authoritative sources.
*   **Local & Private:** Your data never leaves your browser. Your API key is stored securely in your browser's `localStorage`.
*   **Comprehensive History:** Save and revisit your past cases with a full audit trail. Import and export your history as JSON.
*   **Export & Share:** Copy all content to your clipboard or download your filings as a Markdown (.md) file or PDF.
*   **OCR for Evidence:** Upload images of legal documents to extract text and analyze them alongside your description.
*   **Court-Standard Formatting:** Automatically generate filings with professional court captions and formatting for PDF printing.
*   **Structured Output:** AI responses are validated for reliability, ensuring mandatory disclaimers, legal citations, and a clear procedural roadmap.
*   **Robust Reliability Layer:** A multi-layered system ensures safety, accuracy, and structural completeness of every output.

## Technology Stack
LawSage is built on a modern, performant full-stack architecture:
*   **Frontend & Backend:** Next.js 16 (React 19) with Tailwind CSS and Lucide Icons. The entire backend logic now runs on Vercel Edge Functions.
*   **AI Engine:** Google Gemini 2.5 Flash (via the Google AI Python SDK) with web search grounding for real-time legal research.
*   **AI Safety & Structure:** A multi-layered Reliability Layer ensures consistent, safe output with mandatory disclaimers, citation validation, and structural hardening.
*   **State Management:** Local browser storage (`localStorage`) for user preferences and case history.
*   **Deployment:** Optimized for seamless deployment on Vercel.

## Getting Started

### Prerequisites
*   Node.js (v18+ recommended)
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

### Running the Application Locally
Start the Next.js development server:
```bash
npm run dev
```
Open your browser and navigate to [http://localhost:3000](http://localhost:3000) to begin.

### Setting Your API Key
1.  Open the application in your browser (`http://localhost:3000`).
2.  Click the "Settings" button in the top right corner.
3.  Enter your Google Gemini API Key and click "Save Settings".
*   **Important:** Your key is stored securely in your browser's `localStorage` and is only sent to Google's API when you request an analysis. It is never sent to any other server.

## How It Works
1.  **Input:** Describe your legal issue in plain language (e.g., "I was evicted from my apartment without notice") or upload an image of a legal document.
2.  **Jurisdiction:** Select your relevant state or "Federal" from the dropdown.
3.  **Analyze:** Click "Analyze Case" or use the voice input button.
4.  **Output:** LawSage's AI:
    *   Searches the web for the latest statutes and court rules.
    *   Generates a clear, step-by-step legal strategy and procedural roadmap.
    *   Creates a draft, court-admissible legal filing (e.g., an Answer or Motion).
    *   Provides direct links to the legal sources used for grounding.
    *   *(For OCR)* Extracts text from your uploaded image and performs the same analysis.
5.  **Action:** Review, edit, and copy the generated content to use in your case. You can also download it as a `.md` file or PDF.

## Deployment (Vercel)
The easiest and recommended way to deploy LawSage is on **Vercel**. The entire application, including the AI backend, is designed to run on Vercel's Edge Functions.

1.  Push your code to a public GitHub repository.
2.  Go to [https://vercel.com/new](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme).
3.  Import your repository.
4.  **Important:** Set the `GEMINI_API_KEY` environment variable in your Vercel project settings.
    *   Go to your Vercel project's **Settings** > **Environment Variables**.
    *   Add a new variable named `GEMINI_API_KEY` and paste your API key as the value.
5.  Click "Deploy". Your application will be live!

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
*   [Google AI Studio](https://aistudio.google.com/)
*   [Tailwind CSS](https://tailwindcss.com/)
*   [Lucide Icons](https://lucide.dev/)
*   [Vercel](https://vercel.com/)