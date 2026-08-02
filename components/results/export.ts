import { toast } from 'sonner';
import { LegalMotion, MotionToDismiss, MotionForDiscovery, validateLegalMotion } from '../../lib/schemas/motions';
import type * as docx from 'docx';
import { StructuredLegalOutput } from './types';
import { parseLegalOutput } from './parse';

function createCaliforniaFilingHeader(
  docxModule: typeof import('docx'),
  caseInfo: { attorneyName?: string; barNumber?: string; firmName?: string; partyName?: string; courtName?: string; caseNumber?: string; plaintiff?: string; defendant?: string; documentTitle?: string }
): docx.FileChild[] {
  const { Paragraph, TextRun, Table, TableRow, TableCell, WidthType, BorderStyle, AlignmentType } = docxModule;

  const newParagraph = (options: { text?: string; children?: docx.ParagraphChild[]; alignment?: string }) => {
    if (options.children) {
      return new Paragraph({
        children: options.children,
        alignment: options.alignment === 'center' ? AlignmentType.CENTER :
                   options.alignment === 'right' ? AlignmentType.RIGHT :
                   options.alignment === 'justified' ? AlignmentType.BOTH :
                   AlignmentType.LEFT
      });
    }
    return new Paragraph({ text: options.text || '' });
  };

  const newTextRun = (options: { text?: string; bold?: boolean }) => {
    return new TextRun({ text: options.text || '', bold: options.bold || false }) as docx.ParagraphChild;
  };

  return [
    newParagraph({
      children: [
        newTextRun({ text: caseInfo.attorneyName || '[NAME]', bold: true }),
        newTextRun({ text: `, Bar No. ${caseInfo.barNumber || '[BAR NO]'}` }),
      ],
    }) as docx.FileChild,
    newParagraph({ text: caseInfo.firmName || '[FIRM NAME]' }),
    newParagraph({ text: '[ADDRESS]' }),
    newParagraph({ text: '[PHONE]' }),
    newParagraph({ text: '' }),
    newParagraph({
      children: [
        newTextRun({ text: `Attorney for ${caseInfo.partyName || 'Plaintiff, [NAME]'}`, bold: true }),
      ],
    }),
    newParagraph({ text: '' }),
    newParagraph({ text: '' }),

    newParagraph({
      children: [
        newTextRun({ text: caseInfo.courtName || 'SUPERIOR COURT OF CALIFORNIA', bold: true }),
      ],
      alignment: AlignmentType.CENTER,
    }),
    newParagraph({
      children: [
        newTextRun({ text: 'COUNTY OF [COUNTY]', bold: true }),
      ],
      alignment: AlignmentType.CENTER,
    }),
    newParagraph({ text: '' }),

    new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      borders: {
        top: { style: BorderStyle.NONE },
        bottom: { style: BorderStyle.NONE },
        left: { style: BorderStyle.NONE },
        right: { style: BorderStyle.NONE },
        insideHorizontal: { style: BorderStyle.NONE },
        insideVertical: { style: BorderStyle.NONE },
      },
      rows: [
        new TableRow({
          children: [
            new TableCell({
              width: { size: 50, type: WidthType.PERCENTAGE },
              children: [
                newParagraph({ text: caseInfo.plaintiff || '[PLAINTIFF NAME],' }),
                newParagraph({ text: '' }),
                newParagraph({ text: '          Plaintiff,' }),
                newParagraph({ text: '' }),
                newParagraph({ text: '    vs.' }),
                newParagraph({ text: '' }),
                newParagraph({ text: caseInfo.defendant || '[DEFENDANT NAME],' }),
                newParagraph({ text: '' }),
                newParagraph({ text: '          Defendant.' }),
              ],
              borders: {
                right: { style: BorderStyle.SINGLE, size: 1, color: '000000' },
              },
            }),
            new TableCell({
              width: { size: 50, type: WidthType.PERCENTAGE },
              children: [
                newParagraph({
                  children: [newTextRun({ text: `)  Case No. ${caseInfo.caseNumber || '[CASE NO]'}`, bold: true })],
                }),
                newParagraph({ text: ')' }),
                newParagraph({
                  children: [newTextRun({ text: `)  ${caseInfo.documentTitle || '[DOCUMENT TITLE]'}`, bold: true })],
                }),
                newParagraph({ text: ')' }),
                newParagraph({ text: ')' }),
                newParagraph({ text: ')' }),
                newParagraph({ text: ')' }),
                newParagraph({ text: ')' }),
              ],
            }),
          ],
        }),
      ],
    }),
    newParagraph({ text: '________________________)' }),
    newParagraph({ text: '' }),
  ] as docx.FileChild[];
}

async function createStandardDocument(args: {
  strategyText: string;
  filingsText: string;
  structured?: StructuredLegalOutput;
  jurisdiction: string;
}): Promise<docx.Document> {
  const docx = await import('docx');
  const { Document, Paragraph, TextRun, HeadingLevel, AlignmentType, Table, TableRow, TableCell, WidthType, BorderStyle } = docx;
  const { strategyText, filingsText, structured, jurisdiction } = args;

  const isCalifornia = jurisdiction.toLowerCase().includes('california');
  let children: docx.FileChild[] = [];

  if (isCalifornia) {
    const header = createCaliforniaFilingHeader(docx, {
      courtName: `${jurisdiction.toUpperCase()} SUPERIOR COURT`,
      documentTitle: 'COMPLAINT AND EX PARTE APPLICATION',
      plaintiff: 'PLAINTIFF [NAME]',
      defendant: 'DEFENDANT [NAME]',
    });
    children = [...header];
  } else {
    children.push(
      new Paragraph({
        text: 'LEGAL ANALYSIS AND FILINGS',
        heading: HeadingLevel.HEADING_1,
        alignment: AlignmentType.CENTER,
      })
    );
  }

  children.push(
    new Paragraph({
      text: 'Disclaimer: This document contains legal information, not legal advice. Consult with a qualified attorney.',
      heading: HeadingLevel.HEADING_2,
    }),
    new Paragraph({
      text: strategyText,
    }),
    new Paragraph({
      text: 'Generated Filings',
      heading: HeadingLevel.HEADING_2,
      alignment: AlignmentType.CENTER,
    }),
    new Paragraph({
      text: filingsText,
    })
  );

  children.push(
    new Paragraph({
      text: 'Sources & Citations',
      heading: HeadingLevel.HEADING_2,
    }),
    ...(structured?.citations || []).map(citation => new Paragraph({
      children: [
        new TextRun({
          text: citation.text,
          bold: true,
        }),
        new TextRun(` - ${citation.source || ''}`),
        ...(citation.url ? [new TextRun(` (${citation.url})`)] : []),
        ...(citation.is_verified !== undefined ? [
          new TextRun(` [Status: ${citation.is_verified ? 'VERIFIED' : 'UNVERIFIED'}]`)
        ] : []),
      ]
    }))
  );

  if (isCalifornia && filingsText && filingsText !== 'No filings generated.') {
    const lines = filingsText.split('\n').slice(0, 100);

    children.push(
      new Paragraph({
        text: '',
        spacing: { before: 400 },
      }),
      new Paragraph({
        text: 'PROFESSIONAL PLEADING PAPER FORMAT (with line numbers):',
        heading: HeadingLevel.HEADING_3,
      }),
      new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        borders: {
          top: { style: BorderStyle.NONE },
          bottom: { style: BorderStyle.NONE },
          left: { style: BorderStyle.NONE },
          right: { style: BorderStyle.NONE },
          insideHorizontal: { style: BorderStyle.NONE },
          insideVertical: { style: BorderStyle.SINGLE, size: 1, color: 'CCCCCC' },
        },
        rows: lines.map((line, index) =>
          new TableRow({
            children: [
              new TableCell({
                width: { size: 8, type: WidthType.PERCENTAGE },
                children: [
                  new Paragraph({
                    text: `${index + 1}`,
                    alignment: AlignmentType.RIGHT,
                  }),
                ],
                borders: {
                  right: { style: BorderStyle.SINGLE, size: 1, color: '000000' },
                },
              }),
              new TableCell({
                width: { size: 92, type: WidthType.PERCENTAGE },
                children: [
                  new Paragraph({
                    text: line || ' ',
                  }),
                ],
              }),
            ],
          })
        ),
      })
    );
  }

  return new Document({
    sections: [{
      properties: {
        page: {
          margin: {
            top: 1440,
            bottom: 1440,
            left: 1440,
            right: 1440,
          },
        },
      },
      children: children,
    }],
  });
}

async function createMotionDocument(motion: LegalMotion): Promise<docx.Document> {
  const docx = await import('docx');
  const { Document, Paragraph, TextRun, HeadingLevel, AlignmentType } = docx;

  const isCalifornia = motion.caseInfo.jurisdiction.toLowerCase().includes('california');
  let children: docx.FileChild[] = [];

  if (isCalifornia) {
    const header = createCaliforniaFilingHeader(docx, {
      courtName: motion.caseInfo.courtName,
      caseNumber: motion.caseInfo.caseNumber,
      documentTitle: motion.title,
      plaintiff: motion.filingParty,
      defendant: motion.opposingParty,
      attorneyName: motion.signatureBlock.attorneyName,
      barNumber: motion.signatureBlock.attorneyBarNumber,
      firmName: motion.signatureBlock.firmName,
    });
    children = [...header];
  } else {
    children.push(
      new Paragraph({
        text: motion.caseInfo.courtName,
        heading: HeadingLevel.HEADING_1,
        alignment: AlignmentType.CENTER,
      }),
      new Paragraph({
        text: `${motion.caseInfo.jurisdiction.toUpperCase()}, ${motion.caseInfo.caseNumber}`,
        alignment: AlignmentType.CENTER,
      }),
      new Paragraph({ text: '' }),
      new Paragraph({ text: `${motion.filingParty},`, alignment: AlignmentType.LEFT }),
      new Paragraph({ text: '                       Plaintiff/Petitioner', alignment: AlignmentType.LEFT }),
      new Paragraph({ text: '' }),
      new Paragraph({ text: 'vs.', alignment: AlignmentType.CENTER }),
      new Paragraph({ text: '' }),
      new Paragraph({ text: `${motion.opposingParty},`, alignment: AlignmentType.LEFT }),
      new Paragraph({ text: '                       Defendant/Respondent', alignment: AlignmentType.LEFT }),
      new Paragraph({ text: '' }),
      new Paragraph({ text: '_________________________________', alignment: AlignmentType.CENTER }),
      new Paragraph({ text: '' }),
      new Paragraph({ text: motion.title, heading: HeadingLevel.HEADING_1, alignment: AlignmentType.CENTER }),
      new Paragraph({ text: '' })
    );
  }

  children.push(
    new Paragraph({
      text: motion.description,
    }),
    new Paragraph({
      text: '',
    }),
    new Paragraph({
      text: 'I. FACTUAL BASIS',
      heading: HeadingLevel.HEADING_2,
    }),
    new Paragraph({
      text: motion.factualBasis,
    }),
    new Paragraph({
      text: '',
    }),
    new Paragraph({
      text: 'II. LEGAL AUTHORITY',
      heading: HeadingLevel.HEADING_2,
    }),
    ...motion.legalAuthority.map(auth => new Paragraph({
      children: [
        new TextRun('• '),
        new TextRun(auth),
      ]
    })),
    new Paragraph({
      text: '',
    }),
    new Paragraph({
      text: 'III. RELIEF REQUESTED',
      heading: HeadingLevel.HEADING_2,
    }),
    new Paragraph({
      text: motion.reliefRequested,
    }),
    new Paragraph({
      text: '',
    })
  );

  switch (motion.type) {
    case 'motion_to_dismiss': {
      const dismissMotion = motion as MotionToDismiss;
      children.push(
        new Paragraph({
          text: 'IV. GROUNDS FOR DISMISSAL',
          heading: HeadingLevel.HEADING_2,
        }),
        new Paragraph({
          children: [
            new TextRun(dismissMotion.dismissalFacts),
          ]
        }),
        new Paragraph({
          text: '',
        }),
        new Paragraph({
          text: 'V. ANTICIPATED OPPOSITION ARGUMENTS',
          heading: HeadingLevel.HEADING_2,
        }),
        new Paragraph({
          children: [
            new TextRun(dismissMotion.anticipatedOpposition),
          ]
        }),
        new Paragraph({
          text: '',
        })
      );
      break;
    }

    case 'motion_for_discovery': {
      const discoveryMotion = motion as MotionForDiscovery;
      children.push(
        new Paragraph({
          text: 'IV. DISCOVERY REQUESTS',
          heading: HeadingLevel.HEADING_2,
        }),
        ...discoveryMotion.discoveryRequests.map(req => new Paragraph({
          children: [
            new TextRun('• '),
            new TextRun(`${req.itemDescription} - ${req.relevanceExplanation}`),
          ]
        })),
        new Paragraph({
          text: '',
        })
      );
      break;
    }
  }

  children.push(
    new Paragraph({
      text: '',
    }),
    new Paragraph({
      text: '',
    }),
    new Paragraph({
      text: '',
    }),
    new Paragraph({
      children: [
        new TextRun(motion.signatureBlock.attorneyName),
      ],
      alignment: AlignmentType.RIGHT,
    }),
    new Paragraph({
      children: [
        new TextRun(`Attorney for ${motion.filingParty}`),
      ],
      alignment: AlignmentType.RIGHT,
    }),
    new Paragraph({
      children: [
        new TextRun(`Bar No. ${motion.signatureBlock.attorneyBarNumber}`),
      ],
      alignment: AlignmentType.RIGHT,
    }),
    new Paragraph({
      children: [
        new TextRun(motion.signatureBlock.firmName || ''),
      ],
      alignment: AlignmentType.RIGHT,
    }),
    new Paragraph({
      children: [
        new TextRun(motion.signatureBlock.date),
      ],
      alignment: AlignmentType.RIGHT,
    })
  );

  return new Document({
    sections: [{
      properties: {
        page: {
          margin: {
            top: 1440,
            bottom: 1440,
            left: 1440,
            right: 1440,
          },
        },
      },
      children: children,
    }],
  });
}

export async function exportAnalysisToWord(args: {
  strategyText: string;
  filingsText: string;
  structured?: StructuredLegalOutput;
  jurisdiction: string;
}): Promise<void> {
  const { strategyText, filingsText, structured, jurisdiction } = args;

  let doc: docx.Document | null = null;
  if (structured && structured.filing_template) {
    try {
      const parsedMotion = JSON.parse(structured.filing_template) as LegalMotion;
      const validation = validateLegalMotion(parsedMotion);

      if (validation.isValid) {
        doc = await createMotionDocument(parsedMotion);
      } else {
        doc = await createStandardDocument({ strategyText, filingsText, structured, jurisdiction });
      }
    } catch {
      doc = await createStandardDocument({ strategyText, filingsText, structured, jurisdiction });
    }
  } else {
    doc = await createStandardDocument({ strategyText, filingsText, structured, jurisdiction });
  }

  if (!doc) return;

  const docxModule = await import('docx');
  const { Packer } = docxModule;
  const blob = await Packer.toBlob(doc);
  const url = URL.createObjectURL(blob);

  const a = document.createElement('a');
  a.href = url;
  a.download = `legal_analysis_${jurisdiction.toLowerCase()}_${new Date().toISOString().slice(0, 10)}.docx`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export async function generateProfessionalPdf(args: {
  strategyText: string;
  resultText: string;
  jurisdiction: string;
}): Promise<void> {
  const { strategyText, resultText, jurisdiction } = args;
  try {
    const contentToExport = strategyText || resultText;

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
        content: contentToExport,
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
    toast.error('Failed to generate PDF. Please try again or use the browser print option.');
    window.print();
  }
}

export function downloadFilingsAsMarkdown(resultText: string, jurisdiction: string): void {
  if (!resultText) return;
  const { filings } = parseLegalOutput(resultText);
  const blob = new Blob([filings], { type: 'text/markdown' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `legal_filings_${jurisdiction.toLowerCase()}.md`;
  a.click();
  URL.revokeObjectURL(url);
}

export function downloadFilingsAsPDF(resultText: string, jurisdiction: string): void {
  if (!resultText) return;
  const { filings } = parseLegalOutput(resultText);

  const lines = filings.split('\n');
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
            counter-reset: page;
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
          .case-number {
            font-weight: bold;
            margin-top: 1em;
          }
          .parties {
            margin: 1em 0;
          }
          .document-title {
            text-align: center;
            font-size: 14pt;
            font-weight: bold;
            margin: 1.5em 0;
            margin-left: 45px;
          }
          .signature-block {
            margin-top: 3em;
            text-align: right;
            margin-right: 1in;
          }
          .page-number::after {
            content: counter(page);
          }
          .footer {
            position: fixed;
            bottom: 0;
            width: 100%;
            text-align: center;
            font-size: 10pt;
            font-family: Arial, sans-serif;
          }
          .red-line {
            position: absolute;
            left: 45px;
            top: 0;
            bottom: 0;
            width: 2px;
            background-color: #cc0000;
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
            <div>Firm Name</div>
            <div>Address Line 1</div>
            <div>Address Line 2</div>
          </div>
        </div>

        <div class="footer">
          <div>Page <span class="page-number"></span></div>
        </div>
      </body>
    </html>
  `;

  const blob = new Blob([htmlContent], { type: 'text/html' });
  const url = URL.createObjectURL(blob);
  window.open(url, '_blank');
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
