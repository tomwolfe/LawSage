/**
 * DocumentPreview Component
 * 
 * Handles document preview and export functionality.
 * Addresses Step 5: Type-Safe Document Assembly
 */

'use client';

import { useState } from 'react';
import { Copy, Download, FileText, FileDown, Printer } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

interface DocumentPreviewProps {
  filingsText: string;
  filingTemplate?: string | Record<string, unknown>;
  strategyText: string;
  jurisdiction: string;
}

/**
 * DocumentPreview Component
 * 
 * Features:
 * 1. Markdown rendering with syntax highlighting
 * 2. Multiple export formats (MD, PDF, Word)
 * 3. Copy to clipboard functionality
 * 4. Professional PDF generation
 */
export function DocumentPreview({
  filingsText,
  filingTemplate,
  strategyText,
  jurisdiction,
}: DocumentPreviewProps) {
  const [copyStatus, setCopyStatus] = useState<{filings: boolean; template: boolean}>({
    filings: false,
    template: false,
  });

  const copyToClipboard = async (text: string, section: 'filings' | 'template') => {
    try {
      await navigator.clipboard.writeText(text);
      setCopyStatus(prev => ({ ...prev, [section]: true }));
      setTimeout(() => setCopyStatus(prev => ({ ...prev, [section]: false })), 2000);
    } catch (err) {
      console.error('Failed to copy text:', err);
    }
  };

  const downloadFilingsAsMarkdown = () => {
    const blob = new Blob([filingsText], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `legal_filings_${jurisdiction.toLowerCase()}.md`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const downloadFilingsAsPDF = async () => {
    // Generate line numbers for pleading paper format
    const lines = filingsText.split('\n');
    const maxLines = 100;
    const linedContent = lines.slice(0, maxLines).map((line, index) => {
      const lineNum = index + 1;
      const pageBreak = lineNum > 0 && lineNum % 28 === 0 ? '<div class="page-break"></div>' : '';
      return `${pageBreak}<div class="pleading-line"><span class="line-number">${lineNum}</span><span class="line-content">${line || '&nbsp;'}</span></div>`;
    }).join('');

    const htmlContent = `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="UTF-8">
          <title>Court Filing - ${jurisdiction}</title>
          <style>
            @page {
              margin: 0.5in 1in;
              size: 8.5in 11in;
            }
            @media print {
              .page-break {
                page-break-before: always;
              }
            }
            body {
              font-family: "Courier New", Courier, monospace;
              font-size: 12pt;
              line-height: 2em;
              margin: 0;
              padding: 0;
            }
            .pleading-paper-container {
              position: relative;
              padding-left: 45px;
              border-left: 2px solid #cc0000;
              margin-left: 20px;
            }
            .pleading-line {
              display: flex;
              min-height: 2em;
            }
            .line-number {
              position: absolute;
              left: 5px;
              width: 35px;
              text-align: right;
              color: #666;
              font-size: 10pt;
              font-family: Arial, sans-serif;
              user-select: none;
            }
            .line-content {
              flex: 1;
              padding-left: 10px;
              white-space: pre-wrap;
            }
            .court-caption {
              text-align: center;
              margin-bottom: 1.5em;
              border-bottom: 2px solid black;
              padding-bottom: 10px;
              margin-left: 45px;
            }
            .signature-block {
              margin-top: 3em;
              text-align: right;
              margin-right: 1in;
            }
          </style>
        </head>
        <body>
          <div class="pleading-paper-container">
            <div class="red-line"></div>

            <div class="court-caption">
              <div class="court-name"><strong>${jurisdiction.toUpperCase()} SUPERIOR COURT</strong></div>
              <div class="county-address">COUNTY, STATE</div>
              <div class="case-number">CASE NO: ________________________</div>
              <div class="parties">
                <div class="plaintiff">PLAINTIFF,</div>
                <div class="v-line">v.</div>
                <div class="defendant">DEFENDANT.</div>
              </div>
            </div>

            <div class="document-title">MOTION FOR ________________________</div>

            ${linedContent}

            <div class="signature-block">
              <div>___________________________</div>
              <div>Attorney for Plaintiff/Defendant</div>
              <div>Attorney Bar No. _______________</div>
            </div>
          </div>
        </body>
      </html>
    `;

    const blob = new Blob([htmlContent], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    window.open(url, '_blank');
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const handleGeneratePdf = async () => {
    try {
      const loadingMsg = document.createElement('div');
      loadingMsg.textContent = 'Generating professional PDF...';
      loadingMsg.style.cssText = 'position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);background:#1e40af;color:white;padding:20px 40px;border-radius:8px;font-size:16px;z-index:9999;box-shadow:0 4px 6px rgba(0,0,0,0.1);';
      document.body.appendChild(loadingMsg);

      const response = await fetch('/api/generate-pdf', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          title: 'Legal Analysis & Strategy',
          content: strategyText,
          court: `${jurisdiction} Superior Court`,
          usePleadingPaper: true,
          metadata: {
            author: 'LawSage Legal Assistant',
            subject: 'Legal Analysis',
            keywords: 'legal, analysis, strategy, court filing'
          }
        })
      });

      document.body.removeChild(loadingMsg);

      if (!response.ok) {
        throw new Error('PDF generation failed');
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `legal-analysis-${new Date().toISOString().split('T')[0]}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);

    } catch (error) {
      console.error('Error generating PDF:', error);
      alert('Failed to generate PDF. Please try again or use the browser print option.');
      window.print();
    }
  };

  const handleExportToWord = async () => {
    try {
      const docxModule = await import('docx');
      const { Packer, Document, Paragraph, TextRun, HeadingLevel, AlignmentType } = docxModule;

      const doc = new Document({
        sections: [{
          properties: {},
          children: [
            new Paragraph({
              text: "LEGAL ANALYSIS AND FILINGS",
              heading: HeadingLevel.HEADING_1,
              alignment: AlignmentType.CENTER,
            }),
            new Paragraph({
              text: strategyText,
            }),
            new Paragraph({
              text: "Generated Filings",
              heading: HeadingLevel.HEADING_2,
              alignment: AlignmentType.CENTER,
            }),
            new Paragraph({
              text: filingsText,
            }),
          ],
        }],
      });

      const blob = await Packer.toBlob(doc as unknown as Parameters<typeof Packer.toBlob>[0]);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `legal_analysis_${jurisdiction.toLowerCase()}_${new Date().toISOString().slice(0, 10)}.docx`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Error exporting to Word:', error);
      alert('Failed to export to Word. Please try again.');
    }
  };

  return (
    <div className="relative">
      {/* Action Buttons */}
      <div className="absolute top-0 right-0 flex gap-2 z-10">
        <button
          onClick={() => copyToClipboard(filingsText, 'filings')}
          className="p-2 text-indigo-600 hover:bg-indigo-50 rounded-lg flex items-center gap-1 text-sm font-semibold transition-colors"
          title={copyStatus.filings ? "Copied!" : "Copy to clipboard"}
        >
          <Copy size={16} />
          <span>{copyStatus.filings ? "Copied!" : "Copy"}</span>
        </button>
        <button
          onClick={() => {
            const templateContent = filingTemplate
              ? (typeof filingTemplate === 'string'
                  ? filingTemplate
                  : JSON.stringify(filingTemplate, null, 2))
              : filingsText;
            copyToClipboard(templateContent, 'template');
          }}
          className="p-2 text-emerald-600 hover:bg-emerald-50 rounded-lg flex items-center gap-1 text-sm font-semibold transition-colors"
          title={copyStatus.template ? "Copied!" : "Copy filing template only"}
        >
          <FileText size={16} />
          <span>{copyStatus.template ? "Copied!" : "Copy Template"}</span>
        </button>
        <button
          onClick={downloadFilingsAsMarkdown}
          className="p-2 text-indigo-600 hover:bg-indigo-50 rounded-lg flex items-center gap-1 text-sm font-semibold transition-colors"
        >
          <Download size={16} />
          Download .md
        </button>
        <button
          onClick={downloadFilingsAsPDF}
          className="p-2 text-indigo-600 hover:bg-indigo-50 rounded-lg flex items-center gap-1 text-sm font-semibold transition-colors"
        >
          <FileDown size={16} />
          Download PDF
        </button>
        <button
          onClick={handleGeneratePdf}
          className="p-2 text-emerald-600 hover:bg-emerald-50 rounded-lg flex items-center gap-1 text-sm font-semibold transition-colors"
          title="Generate professional PDF with pleading paper format"
        >
          <FileText size={16} />
          Generate PDF
        </button>
        <button
          onClick={handleExportToWord}
          className="p-2 text-indigo-600 hover:bg-indigo-50 rounded-lg flex items-center gap-1 text-sm font-semibold transition-colors"
        >
          <FileDown size={16} />
          Export to Word
        </button>
        <button
          onClick={() => window.print()}
          className="p-2 text-indigo-600 hover:bg-indigo-50 rounded-lg flex items-center gap-1 text-sm font-semibold transition-colors"
        >
          <Printer size={16} />
          Print
        </button>
      </div>

      {/* Document Preview */}
      <div className="mt-8 bg-slate-900 rounded-xl p-6 text-slate-300 font-mono text-sm overflow-x-auto">
        {filingsText === 'No filings generated.' ? (
          <div className="text-slate-500 italic">No filings generated.</div>
        ) : typeof filingsText === 'object' ? (
          <pre className="whitespace-pre-wrap break-words">
            {JSON.stringify(filingsText, null, 2)}
          </pre>
        ) : (
          <div className="markdown-filings">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>
              {filingsText}
            </ReactMarkdown>
          </div>
        )}
      </div>
    </div>
  );
}
