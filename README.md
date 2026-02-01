# LawSage: The Universal Public Defender
**Democratizing Legal Access for Everyone**

LawSage is an open-source, AI-powered platform designed to empower individuals representing themselves in court (Pro Se litigants). By leveraging advanced AI models and real-time legal grounding, LawSage analyzes your unique legal situation and generates a personalized, court-admissible roadmap and legal filings.

> **Legal Disclaimer:** I am an AI, not an attorney. This tool provides legal information, not legal advice. Use of this tool does not create an attorney-client relationship.

## Key Advancements (v4.0)
LawSage has undergone another major transformation! The latest version is now a **resilient, high-performance 'zero-infrastructure' platform with enhanced capabilities**. This means:
*   **URL-Based State Persistence:** Zero-DB state synchronization using lz-string compression to store Virtual Case Folder metadata and summaries directly in the URL hash, enabling persistent sessions without external storage.
*   **API Request Consolidation:** Unified 'Structural Hardening' suite combining Adversarial Strategy, Procedural Roadmap, and Local Logistics into a single batch request to minimize Gemini API latency and token usage.
*   **Optimized Document Processing:** Client-side image downscaling and grayscaling before transmission to OCR endpoints, preventing Vercel Hobby tier timeouts and improving performance.
*   **High-Reliability Static Grounding:** Static `legal_lookup.json` containing the top 100 pro se procedural rules for instant, zero-latency research of common queries without API calls.
*   **Virtual Case Folder Architecture:** Leverages Gemini 2.5 Flash's long context to analyze multiple documents simultaneously, enabling cross-document reasoning without external vector databases.
*   **Adversarial Strategy Component:** Automatically generates opposition arguments and 'red-teams' your case to identify potential weaknesses and counterarguments.
*   **Procedural Grounding Enhancement:** Retrieves and validates Local Rules of Court (county/district level) in addition to general statutes for comprehensive procedural compliance.
*   **Pro Se Survival Guide UI:** Displays hyper-local logistical data (courthouse addresses, filing fees, and dress codes) fetched via real-time search in a dedicated tab.
*   **No External Backend Required:** The entire application, including the AI processing, runs within Vercel's Edge Functions. No need to host a separate FastAPI server.
*   **Multimodal OCR:** Upload images of legal documents (summonses, notices, complaints) for AI-powered text extraction and analysis.
*   **Professional Court Templates:** Generate filings with built-in, court-standard formatting and caption templates ready for PDF export.
*   **Simplified Deployment:** Deploy the entire application with a single click on Vercel.
*   **Citation Verification:** Real-time verification of legal citations against 'good law' using Gemini Web Search tool.
*   **Export to Word:** Direct export functionality to generate professional .docx documents compatible with legal workflows (Clio/Word).
*   **Interactive Next Steps Checklist:** Proactive procedural timeline that maps out actionable steps with due dates and status tracking.
*   **Vercel Hobby Tier Optimized:** Client-side rate limiting and edge runtime optimization to stay within free tier limits.

## Features
*   **Voice Input:** Describe your legal situation naturally using your microphone.
*   **Virtual Case Folder:** Upload and analyze multiple legal documents simultaneously for comprehensive cross-document analysis.
*   **Adversarial Strategy:** Automatic generation of opposition arguments and 'red-team' analysis to identify potential weaknesses in your case.
*   **Jurisdiction-Specific Analysis:** Tailor your legal strategy and filings to your specific state or federal jurisdiction (all 50 U.S. states and Federal).
*   **AI-Powered Strategy:** Receive clear, plain-language analysis and a step-by-step procedural roadmap.
*   **Court-Admissible Filings:** Generate draft legal documents (motions, answers, etc.) formatted for court submission.
*   **Real-Time Grounding:** All responses are grounded in current statutes and legal resources, with direct links to authoritative sources.
*   **Local Rules Compliance:** Retrieves and validates Local Rules of Court (county/district level) for procedural compliance.
*   **Pro Se Survival Guide:** Dedicated UI tab displaying hyper-local logistical data (courthouse addresses, filing fees, dress codes) fetched via real-time search.
*   **Local & Private:** Your data never leaves your browser. Your API key is stored securely in your browser's `localStorage`.
*   **URL-Based State Persistence:** Comprehensive case data and analysis results are automatically saved to and restored from the URL hash, eliminating the need for external storage.
*   **Zero-DB Architecture:** No traditional SQL/NoSQL database required - all state is managed through compressed URL fragments.
*   **Comprehensive History:** Save and revisit your past cases with a full audit trail. Import and export your history as JSON.
*   **Export & Share:** Copy all content to your clipboard or download your filings as a Markdown (.md) file, PDF, or Word (.docx) document.
*   **OCR for Evidence:** Upload images of legal documents to extract text and analyze them alongside your description.
*   **Optimized Image Processing:** Client-side downscaling and grayscaling of images before transmission to prevent API timeouts and reduce bandwidth usage.
*   **Court-Standard Formatting:** Automatically generate filings with professional court captions and formatting for PDF printing.
*   **Structured Output:** AI responses are validated for reliability, ensuring mandatory disclaimers, legal citations, and a clear procedural roadmap.
*   **Robust Reliability Layer:** A multi-layered system ensures safety, accuracy, and structural completeness of every output.
*   **Static Procedural Knowledge Base:** Instant access to the top 100 pro se procedural rules without API calls for common legal queries.
*   **Structural Hardening Validation:** Implements a strict 'Mission Contract' that enforces deterministic AI output compliance, mandating the presence of at least three verifiable legal citations, a procedural roadmap, adversarial strategy, and local court logistics in every response.
*   **Citation Verification:** Verify legal citations in real-time to ensure they are still 'good law' using the Verify Citation button.
*   **Interactive Next Steps Checklist:** Track your legal progress with a proactive checklist featuring due dates and status indicators.
*   **Human-in-the-Loop Verification:** Proactive legal agent with verification layers to prevent hallucinations and ensure accuracy.

## Technology Stack
LawSage is built on a modern, performant full-stack architecture:
*   **Frontend & Backend:** Next.js 16 (React 19) with Tailwind CSS and Lucide Icons. The entire backend logic now runs on Vercel Edge Functions.
*   **AI Engine:** Google Gemini 2.5 Flash (via the Google AI Python SDK) with web search grounding for real-time legal research.
*   **AI Safety & Structure:** A multi-layered Reliability Layer ensures consistent, safe output with mandatory disclaimers, citation validation, and structural hardening.
*   **State Management:** URL-based state persistence using lz-string compression for zero-DB architecture.
*   **Static Grounding Layer:** Embedded procedural rules database for instant legal research without API calls.
*   **Document Generation:** Docx library for professional Word (.docx) export functionality.
*   **Rate Limiting:** Client-side rate limiting utility for Vercel Hobby Tier compliance.
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
1.  **Input:** Describe your legal issue in plain language (e.g., "I was evicted from my apartment without notice") or upload multiple legal documents to your Virtual Case Folder.
2.  **Jurisdiction:** Select your relevant state or "Federal" from the dropdown.
3.  **Analyze:** Click "Analyze Case" or use the voice input button.
4.  **Output:** LawSage's AI:
    *   Performs cross-document analysis using your Virtual Case Folder for comprehensive context.
    *   Conducts 'red-team' analysis to identify potential weaknesses and opposition arguments.
    *   Searches the web for the latest statutes and Local Rules of Court (county/district level).
    *   Generates a clear, step-by-step legal strategy and procedural roadmap.
    *   Creates a draft, court-admissible legal filing (e.g., an Answer or Motion).
    *   Provides hyper-local logistical data (courthouse addresses, filing fees, dress codes).
    *   Provides direct links to the legal sources used for grounding.
    *   *(For OCR)* Extracts text from your uploaded image with optimized processing and performs the same analysis.
5.  **Verification & Action:**
    *   **Citation Verification:** Use the "Verify Citation" button to check if legal citations are still 'good law' using real-time web search.
    *   **Opposition View:** Review potential opposition arguments in the dedicated tab.
    *   **Pro Se Survival Guide:** Access courthouse logistics and local procedural requirements in the dedicated tab.
    *   **Interactive Checklist:** Track your progress with the Next Steps checklist featuring due dates and status indicators.
    *   **Export Options:** Download your analysis as a `.md` file, PDF, or Word (.docx) document.
    *   **URL Sharing:** Share your complete case analysis via URL with automatic state restoration.
    *   **Review & Edit:** Review, edit, and copy the generated content to use in your case.

## Deployment (Vercel)
The easiest and recommended way to deploy LawSage is on **Vercel**. The entire application, including the AI backend, is designed to run on Vercel's Edge Functions.

1.  Push your code to a public GitHub repository.
2.  Go to [https://vercel.com/new](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme).
3.  Import your repository.
4.  **Important:** Set the `GEMINI_API_KEY` environment variable in your Vercel project settings.
    *   Go to your Vercel project's **Settings** > **Environment Variables**.
    *   Add a new variable named `GEMINI_API_KEY` and paste your API key as the value.
5.  Click "Deploy". Your application will be live!

## API Routes
The application includes several API routes optimized for Vercel Edge Functions:
*   **/api/analyze:** Main analysis endpoint for legal situation processing with grounding. Consolidated response includes adversarial strategy, procedural roadmap, and local logistics.
*   **/api/ocr:** Multimodal OCR endpoint for legal document image analysis with optimized image processing.
*   **/api/health:** Health check endpoint.
*   **/api/verify-citation:** Real-time citation verification endpoint using Gemini Web Search.
All API routes are configured to run on Vercel's Edge Runtime for optimal performance and cost efficiency within Hobby Tier limits.

## AI Safety & Structure
LawSage employs a multi-layered Reliability Layer to ensure that AI-generated content is safe, accurate, and structurally complete:
*   **Red-Team Auditing:** Every user request is audited for safety violations and jurisdictional clarity before being processed.
*   **Static Grounding Layer:** Checks the embedded procedural rules database for common queries before making API calls, providing instant zero-latency research.
*   **Grounded Generation:** Gemini 2.5 Flash is utilized with real-time Google Search grounding to ensure information is based on current statutes and Local Rules of Court.
*   **Reliability Validation:**
    *   **Citations Validation:** Ensures every response contains at least three verifiable legal citations (e.g., U.S.C., State Codes).
    *   **Procedural Completeness:** Verifies the presence of a 'Procedural Roadmap' section to guide the pro se litigant.
    *   **Adversarial Strategy Validation:** Ensures the presence of opposition arguments and 'red-team' analysis of the user's case.
    *   **Procedural Checks Validation:** Verifies inclusion of local court rule compliance checks.
    *   **Logistics Data Validation:** Ensures hyper-local courthouse information is included in responses.
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
*   [lz-string](https://github.com/pieroxy/lz-string)
