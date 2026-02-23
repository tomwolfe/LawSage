/**
 * Pleading Paper Template Generator
 *
 * Creates court-compliant California-style pleading paper templates.
 * Uses PDFKit to generate precise 28-line-per-page format with line numbers.
 *
 * Court Compliance Features:
 * - 28 lines per page (California standard)
 * - Line numbers 1-28 on left margin
 * - Vertical red line at 65pt from left edge
 * - Proper margins (90pt left for line numbers, 72pt other sides)
 * - Letter size (8.5" x 11")
 */

import type PDFDocumentType from 'pdfkit';
import { Readable } from 'stream';

export interface PleadingPaperOptions {
  court?: string;
  county?: string;
  caseNumber?: string;
  plaintiff?: string;
  defendant?: string;
  documentTitle?: string;
  attorneyName?: string;
  barNumber?: string;
  firmName?: string;
  address?: string;
  phone?: string;
  email?: string;
}

export type PDFDoc = InstanceType<typeof PDFDocumentType>;

/**
 * Generate a blank pleading paper template
 * Can be used as a background for overlaying text
 */
export function generatePleadingPaperTemplate(
  options: PleadingPaperOptions = {},
  pageCount: number = 1
): PDFDoc {
  const doc = new PDFDocumentType({
    size: 'LETTER',
    margins: {
      top: 72,
      bottom: 72,
      left: 90, // Extra space for line numbers
      right: 72,
    },
  });

  const pageWidth = doc.page.width;
  const pageHeight = doc.page.height;
  const lineHeight = 24; // 28 lines per page
  const startY = 72;

  for (let pageNum = 0; pageNum < pageCount; pageNum++) {
    if (pageNum > 0) {
      doc.addPage();
    }

    const currentPage = pageNum + 1;

    // Draw vertical red line (2pt, at 65pt from left)
    doc.strokeColor('#cc0000')
      .lineWidth(2)
      .moveTo(65, startY)
      .lineTo(65, pageHeight - 72)
      .stroke();

    // Draw line numbers (1-28)
    doc.fontSize(10)
      .font('Helvetica')
      .fillColor('#666666');

    for (let lineNum = 1; lineNum <= 28; lineNum++) {
      const y = startY + (lineNum - 1) * lineHeight;
      
      // Line number
      doc.text(lineNum.toString(), 35, y - 5, {
        align: 'right',
        width: 25,
      });

      // Optional: Draw faint horizontal guide lines (commented out for clean template)
      // doc.strokeColor('#eeeeee')
      //   .lineWidth(0.5)
      //   .moveTo(70, y)
      //   .lineTo(pageWidth - 72, y)
      //   .stroke();
    }

    // Draw court caption on first page
    if (pageNum === 0 && (options.court || options.caseNumber || options.plaintiff)) {
      drawCourtCaption(doc, options, startY);
    }

    // Draw page number on subsequent pages
    if (pageNum > 0) {
      doc.fontSize(10)
        .fillColor('#666666')
        .text(`Page ${currentPage}`, pageWidth - 100, pageHeight - 50, {
          align: 'right',
        });
    }
  }

  doc.end();
  return doc;
}

/**
 * Draw court caption box on pleading paper
 */
function drawCourtCaption(
  doc: PDFDoc,
  options: PleadingPaperOptions,
  startY: number
): number {
  const pageWidth = doc.page.width;
  const margin = 90;
  let yPosition = startY;

  // Attorney information (top left)
  if (options.attorneyName || options.barNumber) {
    doc.fontSize(11)
      .font('Helvetica')
      .fillColor('#000000')
      .text(options.attorneyName || '', margin, yPosition, {
        width: 200,
        align: 'left',
      });

    yPosition += 18;
    doc.text(`Bar No. ${options.barNumber || ''}`, margin, yPosition, {
      width: 200,
      align: 'left',
    });

    yPosition += 18;
    if (options.firmName) {
      doc.text(options.firmName, margin, yPosition, {
        width: 200,
        align: 'left',
      });
      yPosition += 18;
    }
    if (options.address) {
      doc.text(options.address, margin, yPosition, {
        width: 200,
        align: 'left',
      });
      yPosition += 18;
    }
    if (options.phone) {
      doc.text(options.phone, margin, yPosition, {
        width: 200,
        align: 'left',
      });
      yPosition += 18;
    }
    if (options.email) {
      doc.text(options.email, margin, yPosition, {
        width: 200,
        align: 'left',
      });
    }

    yPosition += 20;
  }

  // "Attorney for" line
  const partyName = options.plaintiff || 'Plaintiff';
  doc.fontSize(11)
    .font('Helvetica')
    .text(`Attorney for ${partyName}`, margin, yPosition, {
      width: 200,
      align: 'left',
    });

  yPosition += 30;

  // Court name (centered)
  const courtName = options.court || 'SUPERIOR COURT OF CALIFORNIA';
  const county = options.county || 'COUNTY';
  
  doc.fontSize(14)
    .font('Helvetica-Bold')
    .text(courtName, margin + 100, yPosition, {
      align: 'center',
      width: pageWidth - margin * 2 - 100,
    });

  yPosition += 20;
  doc.fontSize(12)
    .font('Helvetica')
    .text(`${county.toUpperCase()} COUNTY`, margin + 100, yPosition, {
      align: 'center',
      width: pageWidth - margin * 2 - 100,
    });

  yPosition += 25;

  // Case number
  doc.fontSize(11)
    .text(`Case No.: ${options.caseNumber || '[To be assigned]'}`, margin + 100, yPosition, {
      align: 'right',
      width: pageWidth - margin * 2 - 100,
    });

  yPosition += 35;

  // Parties
  const plaintiff = options.plaintiff || '[Plaintiff Name]';
  const defendant = options.defendant || '[Defendant Name]';

  doc.fontSize(11)
    .font('Helvetica')
    .text(plaintiff, margin + 100, yPosition, {
      align: 'left',
      width: pageWidth - margin * 2 - 100,
    });

  yPosition += 20;
  doc.text('Plaintiff,', margin + 100, yPosition, {
    align: 'left',
    width: pageWidth - margin * 2 - 100,
  });

  yPosition += 25;
  doc.text('v.', margin + 100, yPosition, {
    align: 'left',
    width: pageWidth - margin * 2 - 100,
  });

  yPosition += 25;
  doc.text(defendant, margin + 100, yPosition, {
    align: 'left',
    width: pageWidth - margin * 2 - 100,
  });

  yPosition += 20;
  doc.text('Defendant.', margin + 100, yPosition, {
    align: 'left',
    width: pageWidth - margin * 2 - 100,
  });

  yPosition += 35;

  // Document title
  const docTitle = options.documentTitle || 'MOTION';
  doc.fontSize(14)
    .font('Helvetica-Bold')
    .text(docTitle.toUpperCase(), margin + 100, yPosition, {
      align: 'center',
      width: pageWidth - margin * 2 - 100,
    });

  return yPosition + 50;
}

/**
 * Calculate how many lines a text will wrap to
 * Useful for pagination planning
 */
export function calculateLineCount(
  text: string,
  charsPerLine: number = 80
): number {
  const lines = text.split('\n');
  let totalLines = 0;

  for (const line of lines) {
    // Handle headings (add extra spacing)
    if (line.startsWith('#')) {
      totalLines += 2;
      continue;
    }

    // Calculate wrapped lines for this line
    const wrappedLines = Math.ceil((line.length + 1) / charsPerLine);
    totalLines += Math.max(1, wrappedLines);
  }

  return totalLines;
}

/**
 * Split text into pages based on line count
 * Returns array of text chunks, one per page
 */
export function paginateText(
  text: string,
  maxLinesPerPage: number = 28
): string[] {
  const lines = text.split('\n');
  const pages: string[] = [];
  let currentPage: string[] = [];
  let currentLineCount = 0;

  for (const line of lines) {
    // Estimate line count for this line (headings take more space)
    const lineHeight = line.startsWith('#') ? 2 : 1;

    if (currentLineCount + lineHeight > maxLinesPerPage) {
      // Start new page
      pages.push(currentPage.join('\n'));
      currentPage = [];
      currentLineCount = 0;
    }

    currentPage.push(line);
    currentLineCount += lineHeight;
  }

  // Add last page
  if (currentPage.length > 0) {
    pages.push(currentPage.join('\n'));
  }

  return pages;
}
