/**
 * Proof of Service Form Generator
 * 
 * Generates court-standard Proof of Service (POS) forms for multiple jurisdictions:
 * - California: POS-040 (Proof of Service by Mail)
 * - California: FL-335 (Proof of Service by Mail - Family Law)
 * - California: FL-330 (Proof of Personal Service - Family Law)
 * - Federal: AO 006 (Summons - includes service section)
 * - Generic: Universal Proof of Service
 * 
 * Usage:
 * POST /api/generate-proof-of-service
 * {
 *   jurisdiction: "California",
 *   formType: "POS-040",
 *   caseInfo: { ... },
 *   servedDocuments: [...],
 *   serviceInfo: { ... }
 * }
 */

import { NextRequest, NextResponse } from 'next/server';
import type PDFDocumentType from 'pdfkit';
import { Readable } from 'stream';
import { safeLog, safeError, safeWarn } from '../../../lib/pii-redactor';

export const runtime = 'nodejs';

type PDFDoc = InstanceType<typeof PDFDocumentType>;
type PDFDocument = PDFDoc;

/**
 * Supported Proof of Service forms by jurisdiction
 */
const SUPPORTED_FORMS: Record<string, string[]> = {
  'California': ['POS-040', 'FL-335', 'FL-330', 'MC-030'],
  'Federal': ['AO-006', 'GENERIC'],
  'New York': ['GENERIC'],
  'Texas': ['GENERIC'],
  'Florida': ['GENERIC'],
};

interface PartyInfo {
  name: string;
  attorney?: string;
  barNumber?: string;
  firm?: string;
  address: string[];
  phone?: string;
  email?: string;
  partyType?: 'plaintiff' | 'defendant' | 'petitioner' | 'respondent';
}

interface CaseInfo {
  courtName: string;
  county?: string;
  state: string;
  caseNumber: string;
  plaintiff: string;
  defendant: string;
  documentTitle?: string;
}

interface ServiceInfo {
  serviceDate: string;
  serviceMethod: 'mail' | 'personal' | 'electronic' | 'courthouse_pickup';
  servedTo: PartyInfo;
  servedBy: {
    name: string;
    title: string;
    address: string;
    phone?: string;
    email?: string;
  };
  mailingAddress?: string; // For mail service
  cityStateZip?: string; // e.g., "Los Angeles, CA 90012"
}

interface GenerateProofOfServiceRequest {
  jurisdiction: string;
  formType: string;
  caseInfo: CaseInfo;
  servedDocuments: string[]; // List of document titles served
  serviceInfo: ServiceInfo;
  additionalParties?: PartyInfo[];
}

/**
 * Convert Readable stream to Buffer
 */
function streamToBuffer(stream: Readable): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    stream.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
    stream.on('error', reject);
    stream.on('end', () => resolve(Buffer.concat(chunks)));
  });
}

/**
 * Draw California-style pleading paper line numbers
 */
function drawPleadingLineNumbers(doc: PDFDocument, startY: number, endY: number) {
  const leftMargin = 35;

  // Draw vertical red line
  doc.strokeColor('#cc0000')
    .lineWidth(2)
    .moveTo(65, startY)
    .lineTo(65, endY)
    .stroke();

  // Draw line numbers (1-28 per page per California rules)
  doc.fontSize(10)
    .fillColor('#666666')
    .text('', leftMargin, startY, {
      align: 'right',
      width: 25,
      lineGap: 24,
      continued: true
    });

  for (let i = 1; i <= 28; i++) {
    const y = startY + (i - 1) * 24;
    doc.text(i.toString(), leftMargin, y - 5, {
      align: 'right',
      width: 25
    });
  }
}

/**
 * Draw court caption for Proof of Service forms
 */
function drawProofOfServiceCaption(doc: PDFDocument, caseInfo: CaseInfo, formType: string) {
  const pageWidth = doc.page.width;
  const margin = 72;
  let yPosition = 72;

  // Court name
  doc.fontSize(12)
    .font('Helvetica-Bold')
    .text(caseInfo.courtName, margin + 100, yPosition, {
      align: 'center',
      width: pageWidth - margin * 2 - 100
    });

  // County and State (for California forms)
  if (caseInfo.state === 'California') {
    yPosition += 20;
    doc.fontSize(10)
      .font('Helvetica')
      .text(`County of ${caseInfo.county || '[COUNTY]'}`, margin + 100, yPosition, {
        align: 'center',
        width: pageWidth - margin * 2 - 100
      });
  }

  // Case number
  yPosition += 25;
  doc.fontSize(10)
    .font('Helvetica')
    .text(`Case No.: ${caseInfo.caseNumber || '[CASE NUMBER]'}`, margin + 100, yPosition, {
      align: 'right',
      width: pageWidth - margin * 2 - 100
    });

  // Parties
  yPosition += 25;
  doc.fontSize(10)
    .font('Helvetica-Bold')
    .text(caseInfo.plaintiff, margin + 100, yPosition, {
      align: 'left',
      width: pageWidth - margin * 2 - 100
    });

  yPosition += 18;
  doc.fontSize(10)
    .font('Helvetica')
    .text('v.', margin + 100, yPosition, {
      align: 'left',
      width: pageWidth - margin * 2 - 100
    });

  yPosition += 18;
  doc.fontSize(10)
    .font('Helvetica-Bold')
    .text(caseInfo.defendant, margin + 100, yPosition, {
      align: 'left',
      width: pageWidth - margin * 2 - 100
    });

  // Form title
  yPosition += 35;
  doc.fontSize(14)
    .font('Helvetica-Bold')
    .text(getFormTitle(formType), margin, yPosition, {
      align: 'center',
      width: pageWidth - margin * 2
    });

  return yPosition + 30;
}

/**
 * Get form title based on form type
 */
function getFormTitle(formType: string): string {
  const titles: Record<string, string> = {
    'POS-040': 'PROOF OF SERVICE BY MAIL',
    'FL-335': 'PROOF OF SERVICE BY MAIL (FAMILY LAW)',
    'FL-330': 'PROOF OF PERSONAL SERVICE (FAMILY LAW)',
    'MC-030': 'PROOF OF SERVICE',
    'AO-006': 'SUMMONS - PROOF OF SERVICE',
    'GENERIC': 'PROOF OF SERVICE',
  };
  return titles[formType] || 'PROOF OF SERVICE';
}

/**
 * Generate POS-040 (Proof of Service by Mail) - California Civil
 */
function generatePOS040(doc: PDFDoc, caseInfo: CaseInfo, serviceInfo: ServiceInfo, documents: string[]) {
  const pageWidth = doc.page.width;
  const margin = 72;
  let yPosition = drawProofOfServiceCaption(doc, caseInfo, 'POS-040');

  doc.fontSize(10).font('Helvetica').fillColor('#000000');

  // Introductory paragraph
  doc.text('TO THE COURT AND ALL PARTIES:', margin, yPosition, {
    width: pageWidth - margin * 2,
    align: 'left'
  });
  yPosition += 25;

  // Service statement
  doc.text(`I am a citizen of the United States and a resident of the State in which the above-captioned matter is pending. I am over the age of 18 years and not a party to this action.`, margin, yPosition, {
    width: pageWidth - margin * 2,
    align: 'left',
    lineGap: 8
  });
  yPosition += 45;

  // Business address
  doc.text(`My business address is:`, margin, yPosition, {
    width: pageWidth - margin * 2
  });
  yPosition += 18;
  doc.text(serviceInfo.servedBy.address, margin + 10, yPosition, {
    width: pageWidth - margin * 2 - 10,
    lineGap: 4
  });
  yPosition += 50;

  // Service date
  doc.text(`On ${formatDate(serviceInfo.serviceDate)}, I served the documents listed below:`, margin, yPosition, {
    width: pageWidth - margin * 2
  });
  yPosition += 25;

  // List of documents served
  doc.text('DOCUMENTS SERVED:', margin, yPosition, {
    width: pageWidth - margin * 2,
    bold: true
  });
  yPosition += 18;

  documents.forEach((docTitle, index) => {
    doc.text(`☐ ${docTitle}`, margin + 10, yPosition, {
      width: pageWidth - margin * 2 - 10
    });
    yPosition += 18;
  });

  yPosition += 15;

  // Mailing information
  doc.text('METHOD OF SERVICE:', margin, yPosition, {
    width: pageWidth - margin * 2,
    bold: true
  });
  yPosition += 18;

  doc.text(`☐ By Mail: I placed the documents in a sealed envelope and mailed them to the addresses below via United States Postal Service with postage prepaid.`, margin, yPosition, {
    width: pageWidth - margin * 2,
    lineGap: 8
  });
  yPosition += 50;

  // Parties served
  doc.text('PARTIES SERVED:', margin, yPosition, {
    width: pageWidth - margin * 2,
    bold: true
  });
  yPosition += 18;

  doc.text(`To: ${serviceInfo.servedTo.name}`, margin + 10, yPosition, {
    width: pageWidth - margin * 2 - 10
  });
  yPosition += 18;

  if (serviceInfo.servedTo.attorney) {
    doc.text(`Attorney for: ${serviceInfo.servedTo.partyType || 'Opposing Party'}`, margin + 10, yPosition, {
      width: pageWidth - margin * 2 - 10
    });
    yPosition += 18;
  }

  serviceInfo.servedTo.address.forEach(addr => {
    doc.text(addr, margin + 20, yPosition, {
      width: pageWidth - margin * 2 - 20
    });
    yPosition += 16;
  });

  yPosition += 25;

  // Declaration
  yPosition += 10;
  doc.text('I declare under penalty of perjury under the laws of the United States that the above is true and correct.', margin, yPosition, {
    width: pageWidth - margin * 2,
    lineGap: 8
  });
  yPosition += 40;

  // Signature block
  const today = new Date().toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });

  doc.text(`Dated: ${today}`, margin, yPosition, {
    width: pageWidth - margin * 2
  });
  yPosition += 30;

  doc.text('_'.repeat(60), margin, yPosition, {
    width: pageWidth - margin * 2
  });
  yPosition += 20;

  doc.text(serviceInfo.servedBy.name, margin, yPosition, {
    width: pageWidth - margin * 2
  });
  yPosition += 18;

  doc.text(serviceInfo.servedBy.title, margin, yPosition, {
    width: pageWidth - margin * 2
  });
}

/**
 * Generate FL-335 (Proof of Service by Mail - Family Law)
 */
function generateFL335(doc: PDFDoc, caseInfo: CaseInfo, serviceInfo: ServiceInfo, documents: string[]) {
  const pageWidth = doc.page.width;
  const margin = 72;
  let yPosition = drawProofOfServiceCaption(doc, caseInfo, 'FL-335');

  doc.fontSize(10).font('Helvetica').fillColor('#000000');

  // Notice
  doc.text('NOTICE:', margin, yPosition, {
    width: pageWidth - margin * 2,
    bold: true
  });
  yPosition += 18;

  doc.text('The person serving the documents must fill out this form and sign it on page 2. This form cannot be served by the party to this case. Mail service is not allowed for certain documents. Check the court rules.', margin, yPosition, {
    width: pageWidth - margin * 2,
    lineGap: 8
  });
  yPosition += 50;

  // Server information
  doc.text('1. SERVER INFORMATION', margin, yPosition, {
    width: pageWidth - margin * 2,
    bold: true
  });
  yPosition += 18;

  doc.text(`Name: ${serviceInfo.servedBy.name}`, margin, yPosition, {
    width: pageWidth - margin * 2
  });
  yPosition += 18;

  doc.text(`Address: ${serviceInfo.servedBy.address}`, margin, yPosition, {
    width: pageWidth - margin * 2
  });
  yPosition += 18;

  doc.text(`City, State, ZIP: ${serviceInfo.mailingAddress || serviceInfo.cityStateZip || ''}`, margin, yPosition, {
    width: pageWidth - margin * 2
  });
  yPosition += 18;

  doc.text(`Telephone: ${serviceInfo.servedBy.phone || '(PHONE)'}`, margin, yPosition, {
    width: pageWidth - margin * 2
  });
  yPosition += 18;

  doc.text(`Email: ${serviceInfo.servedBy.email || '(EMAIL)'}`, margin, yPosition, {
    width: pageWidth - margin * 2
  });
  yPosition += 30;

  // Party information
  doc.text('2. PARTY SERVED', margin, yPosition, {
    width: pageWidth - margin * 2,
    bold: true
  });
  yPosition += 18;

  doc.text(`Name: ${serviceInfo.servedTo.name}`, margin, yPosition, {
    width: pageWidth - margin * 2
  });
  yPosition += 18;

  doc.text(`Address: ${serviceInfo.servedTo.address.join(', ')}`, margin, yPosition, {
    width: pageWidth - margin * 2
  });
  yPosition += 18;

  doc.text(`City, State, ZIP: ${serviceInfo.mailingAddress || serviceInfo.cityStateZip || ''}`, margin, yPosition, {
    width: pageWidth - margin * 2
  });
  yPosition += 30;

  // Documents served
  doc.text('3. DOCUMENTS SERVED', margin, yPosition, {
    width: pageWidth - margin * 2,
    bold: true
  });
  yPosition += 18;

  documents.forEach((docTitle, index) => {
    doc.text(`☐ ${docTitle}`, margin + 10, yPosition, {
      width: pageWidth - margin * 2 - 10
    });
    yPosition += 18;
  });
  yPosition += 25;

  // Service method
  doc.text('4. METHOD OF SERVICE', margin, yPosition, {
    width: pageWidth - margin * 2,
    bold: true
  });
  yPosition += 18;

  doc.text(`☐ By Mail: On ${formatDate(serviceInfo.serviceDate)}, I served the party named above by placing a copy of the documents listed above in a sealed envelope with postage prepaid, and mailed it via United States Postal Service to the address shown above.`, margin, yPosition, {
    width: pageWidth - margin * 2,
    lineGap: 8
  });
  yPosition += 50;

  // Declaration
  doc.text('5. DECLARATION', margin, yPosition, {
    width: pageWidth - margin * 2,
    bold: true
  });
  yPosition += 18;

  doc.text('I declare under penalty of perjury under the laws of the State of California that the above is true and correct.', margin, yPosition, {
    width: pageWidth - margin * 2,
    lineGap: 8
  });
  yPosition += 40;

  // Signature
  const today = new Date().toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });

  doc.text(`Date: ${today}`, margin, yPosition, {
    width: pageWidth - margin * 2
  });
  yPosition += 30;

  doc.text('_'.repeat(60), margin, yPosition, {
    width: pageWidth - margin * 2
  });
  yPosition += 20;

  doc.text('Signature of Server', margin, yPosition, {
    width: pageWidth - margin * 2
  });
  yPosition += 25;

  doc.text(serviceInfo.servedBy.name, margin, yPosition, {
    width: pageWidth - margin * 2
  });
}

/**
 * Generate generic Proof of Service (for jurisdictions without specific forms)
 */
function generateGenericProofOfService(doc: PDFDoc, caseInfo: CaseInfo, serviceInfo: ServiceInfo, documents: string[]) {
  const pageWidth = doc.page.width;
  const margin = 72;
  let yPosition = drawProofOfServiceCaption(doc, caseInfo, 'GENERIC');

  doc.fontSize(10).font('Helvetica').fillColor('#000000');

  // Server declaration
  doc.text('DECLARATION OF SERVER', margin, yPosition, {
    width: pageWidth - margin * 2,
    bold: true
  });
  yPosition += 20;

  doc.text(`I, ${serviceInfo.servedBy.name}, being duly sworn, depose and state:`, margin, yPosition, {
    width: pageWidth - margin * 2
  });
  yPosition += 25;

  // Server qualifications
  doc.text(`1. I am over the age of 18 years and not a party to the above-captioned action.`, margin, yPosition, {
    width: pageWidth - margin * 2
  });
  yPosition += 20;

  doc.text(`2. My business address is: ${serviceInfo.servedBy.address}`, margin, yPosition, {
    width: pageWidth - margin * 2
  });
  yPosition += 25;

  // Service details
  doc.text(`3. On ${formatDate(serviceInfo.serviceDate)}, I served the following document(s):`, margin, yPosition, {
    width: pageWidth - margin * 2
  });
  yPosition += 20;

  documents.forEach((docTitle) => {
    doc.text(`   • ${docTitle}`, margin, yPosition, {
      width: pageWidth - margin * 2
    });
    yPosition += 18;
  });
  yPosition += 20;

  // Service method
  doc.text(`4. Service was made by: ${getServiceMethodText(serviceInfo.serviceMethod)}`, margin, yPosition, {
    width: pageWidth - margin * 2
  });
  yPosition += 25;

  // Party served
  doc.text(`5. The documents were served to:`, margin, yPosition, {
    width: pageWidth - margin * 2
  });
  yPosition += 18;

  doc.text(`   Name: ${serviceInfo.servedTo.name}`, margin, yPosition, {
    width: pageWidth - margin * 2
  });
  yPosition += 18;

  doc.text(`   Address: ${serviceInfo.servedTo.address.join(', ')}`, margin, yPosition, {
    width: pageWidth - margin * 2
  });
  yPosition += 25;

  // Verification
  doc.text('VERIFICATION', margin, yPosition, {
    width: pageWidth - margin * 2,
    bold: true
  });
  yPosition += 18;

  doc.text('I verify under penalty of perjury that the foregoing is true and correct.', margin, yPosition, {
    width: pageWidth - margin * 2
  });
  yPosition += 35;

  // Signature block
  const today = new Date().toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });

  doc.text(`Executed on: ${today}`, margin, yPosition, {
    width: pageWidth - margin * 2
  });
  yPosition += 30;

  doc.text('_'.repeat(60), margin, yPosition, {
    width: pageWidth - margin * 2
  });
  yPosition += 20;

  doc.text(serviceInfo.servedBy.name, margin, yPosition, {
    width: pageWidth - margin * 2
  });
  yPosition += 18;

  doc.text('Server', margin, yPosition, {
    width: pageWidth - margin * 2
  });
}

/**
 * Get service method description text
 */
function getServiceMethodText(method: ServiceInfo['serviceMethod']): string {
  const methods: Record<ServiceInfo['serviceMethod'], string> = {
    'mail': 'United States Postal Service first-class mail, postage prepaid',
    'personal': 'personal delivery to the party or their authorized agent',
    'electronic': 'electronic service via court-approved e-filing system',
    'courthouse_pickup': 'courthouse pickup for parties without known address'
  };
  return methods[method] || 'method not specified';
}

/**
 * Format date for display
 */
function formatDate(dateString: string): string {
  try {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  } catch {
    return dateString;
  }
}

/**
 * Validate request data
 */
function validateRequest(data: Partial<GenerateProofOfServiceRequest>): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!data.jurisdiction) {
    errors.push('Jurisdiction is required');
  }

  if (!data.formType) {
    errors.push('Form type is required');
  }

  if (!data.caseInfo) {
    errors.push('Case information is required');
  } else {
    if (!data.caseInfo.courtName) errors.push('Court name is required');
    if (!data.caseInfo.state) errors.push('State is required');
  }

  if (!data.serviceInfo) {
    errors.push('Service information is required');
  } else {
    if (!data.serviceInfo.serviceDate) errors.push('Service date is required');
    if (!data.serviceInfo.serviceMethod) errors.push('Service method is required');
    if (!data.serviceInfo.servedBy) errors.push('Server information is required');
    if (!data.serviceInfo.servedTo) errors.push('Party to be served is required');
  }

  if (!data.servedDocuments || data.servedDocuments.length === 0) {
    errors.push('At least one document must be listed for service');
  }

  return {
    valid: errors.length === 0,
    errors
  };
}

/**
 * Generate Proof of Service PDF
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as Partial<GenerateProofOfServiceRequest>;

    // Validate request
    const validation = validateRequest(body);
    if (!validation.valid) {
      return NextResponse.json(
        {
          error: 'Validation failed',
          detail: validation.errors.join('; ')
        },
        { status: 400 }
      );
    }

    const {
      jurisdiction,
      formType,
      caseInfo,
      serviceInfo,
      servedDocuments,
      additionalParties
    } = body;

    // Check if form is supported
    const supportedForms = SUPPORTED_FORMS[jurisdiction] || SUPPORTED_FORMS['Federal'];
    if (!supportedForms.includes(formType)) {
      safeWarn(`Requested form ${formType} not supported for ${jurisdiction}, using GENERIC`);
    }

    // Create PDF document
    const doc = new PDFDocumentType({
      size: 'LETTER',
      margins: {
        top: 72,
        bottom: 72,
        left: 90, // Extra margin for line numbers
        right: 72
      }
    });

    const chunks: Buffer[] = [];
    doc.on('data', (chunk) => chunks.push(chunk));

    const pageHeight = doc.page.height;

    // Draw pleading paper line numbers for California forms
    if (jurisdiction === 'California') {
      drawPleadingLineNumbers(doc, 72, pageHeight - 72);
    }

    // Generate appropriate form based on type
    switch (formType) {
      case 'POS-040':
        generatePOS040(doc, caseInfo!, serviceInfo!, servedDocuments!);
        break;
      case 'FL-335':
        generateFL335(doc, caseInfo!, serviceInfo!, servedDocuments!);
        break;
      case 'FL-330':
        // Similar to FL-335 but for personal service
        generateFL335(doc, caseInfo!, serviceInfo!, servedDocuments!);
        break;
      default:
        generateGenericProofOfService(doc, caseInfo!, serviceInfo!, servedDocuments!);
    }

    // Finalize PDF
    doc.end();

    const pdfBuffer = Buffer.concat(chunks);

    // Generate filename
    const safeCaseNumber = caseInfo?.caseNumber?.replace(/[^a-z0-9]/gi, '_') || 'unknown';
    const safeFormType = formType || 'GENERIC';
    const filename = `proof_of_service_${safeCaseNumber}_${safeFormType.toLowerCase()}.pdf`;

    safeLog(`Generated Proof of Service: ${safeFormType} for case ${caseInfo?.caseNumber}`);

    return new NextResponse(pdfBuffer, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Content-Length': pdfBuffer.length.toString(),
        'X-Form-Type': safeFormType,
        'X-Jurisdiction': jurisdiction || 'Unknown'
      }
    });
  } catch (error: unknown) {
    safeError('Proof of Service generation error:', error);

    return NextResponse.json(
      {
        error: 'Proof of Service generation failed',
        detail: error instanceof Error ? error.message : 'Unknown error occurred'
      },
      { status: 500 }
    );
  }
}

/**
 * GET endpoint for health check and supported forms
 */
export async function GET() {
  return NextResponse.json({
    status: 'ok',
    message: 'Proof of Service generator is running',
    supportedForms: SUPPORTED_FORMS,
    features: [
      'California POS-040 (Proof of Service by Mail)',
      'California FL-335 (Family Law Proof of Service)',
      'California FL-330 (Personal Service)',
      'Generic Proof of Service (all jurisdictions)',
      'California-style pleading paper formatting',
      'Automatic date formatting',
      'Multi-party service support'
    ]
  });
}
