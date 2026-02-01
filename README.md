# LawSage: The Universal Public Defender
**Democratizing Legal Access for Everyone**

LawSage is an open-source, AI-powered platform designed to empower individuals representing themselves in court (Pro Se litigants). By leveraging advanced AI models and real-time legal grounding, LawSage analyzes your unique legal situation and generates a personalized, court-admissible roadmap and legal filings.

> **Legal Disclaimer:** I am an AI, not an attorney. This tool provides legal information, not legal advice. Use of this tool does not create an attorney-client relationship.

## Key Advancements (v3.0): The Vercel-Native Revolution

LawSage has undergone a transformative upgrade! Version 3.0 is now a **fully monolithic, serverless application** running entirely on Vercel's Edge Functions. This eliminates the need for any external backend, drastically simplifying deployment and enhancing security and cost-efficiency.

**Major Architectural Shifts:**
*   **No External Backend Required:** The entire application, including AI processing, is now powered by Vercel Edge Functions. No need to host or manage a separate FastAPI server.
*   **Seamless Vercel Deployment:** Deploy the entire application with a single click on Vercel. Simply set your `GEMINI_API_KEY` environment variable.
*   **Edge Runtime Optimized:** All API routes (`/api/analyze`, `/api/ocr`, `/api/verify-citation`, `/api/checkpoint`, `/api/health`) are configured for Vercel's Edge Runtime for optimal performance and cost efficiency within the Hobby Tier.
*   **Client-Side Rate Limiting:** Built-in client-side rate limiting ensures compliance with Vercel's free tier limits.

**Enhanced Core Capabilities:**
*   **Multi-Step Checkpointing:** Persistent serverless state management for complex, multi-step legal analysis, allowing for longer and more comprehensive reasoning while staying under execution limits.
*   **Shadow Vector Search:** Scalable hybrid RAG system using Supabase to extend the Virtual Case Folder beyond Gemini's context limits, enabling analysis of large document collections.
*   **Advanced Shepardizing Agent:** Automated citation verification system that checks each legal citation for subsequent negative treatment (overruled/distinguished) via Gemini Search, ensuring only current "good law" is relied upon.
*   **Jurisdictional Style Presets:** Professional court-standard formatting for the top 10 US jurisdictions (NY, CA, TX, FL, IL, PA, OH, GA, NC, MI) with CSS/Markdown rules for proper margins and line spacing in exports.
*   **Virtual Case Folder Architecture:** Leverages Gemini 2.5 Flash's long context to analyze multiple documents simultaneously, enhanced with vector search capabilities for larger document sets.
*   **Adversarial Strategy Component:** Automatically generates opposition arguments and 'red-teams' your case to identify potential weaknesses and counterarguments.
*   **Procedural Grounding Enhancement:** Retrieves and validates Local Rules of Court (county/district level) in addition to general statutes for comprehensive procedural compliance.
*   **Pro Se Survival Guide UI:** Displays hyper-local logistical data (courthouse addresses, filing fees, and dress codes) fetched via real-time search in a dedicated tab.
*   **Multimodal OCR:** Upload images of legal documents (summonses, notices, complaints) for AI-powered text extraction and analysis.
*   **Professional Court Templates:** Generate filings with built-in, court-standard formatting and caption templates ready for PDF export.
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
*   **Comprehensive History:** Save and revisit your past cases with a full audit trail. Import and export your history as JSON.
*   **Export & Share:** Copy all content to your clipboard or download your filings as a Markdown (.md) file, PDF, or Word (.docx) document.
*   **OCR for Evidence:** Upload images of legal documents to extract text and analyze them alongside your description.
*   **Court-Standard Formatting:** Automatically generate filings with professional court captions and formatting for PDF printing.
*   **Structured Output:** AI responses are validated for reliability, ensuring mandatory disclaimers, legal citations, and a clear procedural roadmap.
*   **Robust Reliability Layer:** A multi-layered system ensures safety, accuracy, and structural completeness of every output.
*   **Structural Hardening Validation:** Implements a strict 'Mission Contract' that enforces deterministic AI output compliance, mandating the presence of at least three verifiable legal citations, a procedural roadmap, adversarial strategy, and local court logistics in every response.
*   **Citation Verification:** Verify legal citations in real-time to ensure they are still 'good law' using the Verify Citation button.
*   **Interactive Next Steps Checklist:** Track your legal progress with a proactive checklist featuring due dates and status indicators.
*   **Human-in-the-Loop Verification:** Proactive legal agent with verification layers to prevent hallucinations and ensure accuracy.
*   **Agentic RAG System:** Multi-turn research engine that generates search plans, performs iterative legal research, and synthesizes findings for comprehensive analysis.
*   **Zod Schema Validation:** Strict JSON schema validation ensures structured, complete legal responses with all required sections.
*   **Enhanced Local Rules Compliance:** Dedicated service for retrieving hyper-local court rules, filing fees, courthouse logistics, and procedural requirements.

## Technology Stack
LawSage is built on a modern, performant full-stack architecture:
*   **Frontend & Backend:** Next.js 16 (React 19) with Tailwind CSS and Lucide Icons. The entire backend logic now runs on Vercel Edge Functions.
*   **AI Engine:** Google Gemini 2.5 Flash (via the Google AI Python SDK) with web search grounding for real-time legal research.
*   **AI Safety & Structure:** A multi-layered Reliability Layer ensures consistent, safe output with mandatory disclaimers, citation validation, and structural hardening.
*   **State Management:** Serverless checkpointing for multi-step analysis and local browser storage (`localStorage`) for user preferences and case history.
*   **Vector Storage:** Lightweight serverless database integration (Supabase) for scalable document indexing and retrieval.
*   **Citation Verification:** Advanced Shepardizing agent for automated legal citation status verification.
*   **Document Generation:** Docx library for professional Word (.docx) export functionality with jurisdictional formatting presets.
*   **Rate Limiting:** Client-side rate limiting utility for Vercel Hobby Tier compliance.
*   **Validation:** Zod schemas for strict JSON validation and structured output.
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
    *   Executes multi-turn agentic research to find the most relevant legal precedents and statutes.
    *   Searches the web for the latest statutes and Local Rules of Court (county/district level).
    *   Validates all responses using Zod schemas to ensure completeness and accuracy.
    *   Generates a clear, step-by-step legal strategy and procedural roadmap.
    *   Creates a draft, court-admissible legal filing (e.g., an Answer or Motion).
    *   Provides hyper-local logistical data (courthouse addresses, filing fees, dress codes).
    *   Provides direct links to the legal sources used for grounding.
    *   *(For OCR)* Extracts text from your uploaded image and performs the same analysis.
5.  **Verification & Action:**
    *   **Citation Verification:** Use the "Verify Citation" button to check if legal citations are still 'good law' using real-time web search.
    *   **Opposition View:** Review potential opposition arguments in the dedicated tab.
    *   **Pro Se Survival Guide:** Access courthouse logistics and local procedural requirements in the dedicated tab.
    *   **Interactive Checklist:** Track your progress with the Next Steps checklist featuring due dates and status indicators.
    *   **Export Options:** Download your analysis as a `.md` file, PDF, or Word (.docx) document.
    *   **Review & Edit:** Review, edit, and copy the generated content to use in your case.

## Deployment (Vercel)
The easiest and recommended way to deploy LawSage is on **Vercel**. The entire application, including the AI backend, is designed to run on Vercel's Edge Functions.

1.  Push your code to a public GitHub repository.
2.  Go to [https://vercel.com/new](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme).
3.  Import your repository.
4.  **CRITICAL:** Set the `GEMINI_API_KEY` environment variable in your Vercel project settings.
    *   Go to your Vercel project's **Settings** > **Environment Variables**.
    *   Add a new variable named `GEMINI_API_KEY` and paste your API key as the value.
5.  Click "Deploy". Your application will be live!

## API Routes
The application includes several API routes optimized for Vercel Edge Functions:
*   **/api/analyze:** Main analysis endpoint for legal situation processing with grounding, agentic research, and Zod validation.
*   **/api/ocr:** Multimodal OCR endpoint for legal document image analysis.
*   **/api/health:** Health check endpoint.
*   **/api/verify-citation:** Real-time citation verification endpoint using Gemini Web Search.
*   **/api/checkpoint:** Multi-step state persistence endpoint for complex legal analysis workflows.
All API routes are configured to run on Vercel's Edge Runtime for optimal performance and cost efficiency within Hobby Tier limits.

## AI Safety & Structure
LawSage employs a multi-layered Reliability Layer to ensure that AI-generated content is safe, accurate, and structurally complete:
*   **Red-Team Auditing:** Every user request is audited for safety violations and jurisdictional clarity before being processed.
*   **Agentic RAG System:** Multi-turn research engine that generates search plans, performs iterative legal research, and synthesizes findings for comprehensive analysis.
*   **Zod Schema Validation:** Strict JSON schema validation ensures structured, complete legal responses with all required sections.
*   **Grounded Generation:** Gemini 2.5 Flash is utilized with real-time Google Search grounding to ensure information is based on current statutes and Local Rules of Court.
*   **Advanced Citation Verification:** The Shepardizing agent automatically verifies each legal citation for subsequent negative treatment (overruled/distinguished) to ensure only current "good law" is relied upon.
*   **Reliability Validation:**
    *   **Citations Validation:** Ensures every response contains at least three verifiable legal citations (e.g., U.S.C., State Codes).
    *   **Procedural Completeness:** Verifies the presence of a 'Procedural Roadmap' section to guide the pro se litigant.
    *   **Adversarial Strategy Validation:** Ensures the presence of opposition arguments and 'red-team' analysis of the user's case.
    *   **Procedural Checks Validation:** Verifies inclusion of local court rule compliance checks.
    *   **Logistics Data Validation:** Ensures hyper-local courthouse information is included in responses.
*   **Mandatory Disclaimers:** Every response is prepended with a legal disclaimer to clearly distinguish legal information from legal advice.
*   **Structural Hardening:** A custom validator enforces a strict delimiter system ('---') to separate legal strategy from filing templates.
*   **Multi-Step Analysis:** Serverless checkpointing enables complex multi-step legal reasoning while staying under execution limits.
*   **Scalable Context:** Shadow vector search extends the Virtual Case Folder beyond Gemini's context limits using lightweight serverless databases.
*   **Retry Mechanism:** Built-in exponential backoff for AI service rate limits ensures high availability.
*   **Structured Output:** The AI is prompted to return a JSON schema, which is validated server-side using Zod for completeness and safety before being presented to the user.

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
*   [Zod](https://zod.dev/)
