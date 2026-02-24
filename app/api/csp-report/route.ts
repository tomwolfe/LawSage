/**
 * CSP Report Endpoint
 * 
 * Receives and logs Content Security Policy violations.
 * Helps identify security issues and misconfigurations.
 */

import { NextRequest, NextResponse } from 'next/server';
import { safeLog, safeError } from '../../../lib/pii-redactor';

interface CSPReport {
  'csp-report': {
    'document-uri': string;
    'referrer': string;
    'violated-directive': string;
    'effective-directive': string;
    'original-policy': string;
    'disposition': string;
    'blocked-uri': string;
    'line-number'?: number;
    'column-number'?: number;
    'source-file'?: string;
    'status-code'?: number;
    'script-sample'?: string;
  };
}

/**
 * POST endpoint for CSP violation reports
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as CSPReport;
    const report = body['csp-report'];

    if (!report) {
      return NextResponse.json(
        { error: 'Invalid CSP report format' },
        { status: 400 }
      );
    }

    // Log the violation
    safeLog('[CSP Report] Violation detected:', {
      documentUri: report['document-uri'],
      violatedDirective: report['violated-directive'],
      effectiveDirective: report['effective-directive'],
      blockedUri: report['blocked-uri'],
      sourceFile: report['source-file'],
      lineNumber: report['line-number'],
      columnNumber: report['column-number'],
      disposition: report['disposition'],
    });

    // Store violation in a persistent store (optional)
    // For now, we just log it. In production, you might want to:
    // 1. Store in a database for analysis
    // 2. Send alerts for critical violations
    // 3. Track violation patterns

    // Categorize violation severity
    const blockedUri = report['blocked-uri'];
    const violatedDirective = report['violated-directive'];

    let severity: 'low' | 'medium' | 'high' | 'critical' = 'low';

    // High severity: blocked external scripts or styles
    if (violatedDirective.includes('script-src') || violatedDirective.includes('style-src')) {
      if (blockedUri && !blockedUri.startsWith('self')) {
        severity = 'high';
      }
    }

    // Critical: XSS-related violations
    if (violatedDirective.includes('script-src') && blockedUri?.includes('inline')) {
      severity = 'critical';
    }

    // Medium: connect-src violations (potential data exfiltration attempt)
    if (violatedDirective.includes('connect-src')) {
      severity = 'medium';
    }

    safeLog(`[CSP Report] Severity: ${severity.toUpperCase()}`, {
      directive: violatedDirective,
      blocked: blockedUri,
    });

    return NextResponse.json({
      status: 'received',
      severity,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    safeError('[CSP Report] Failed to process CSP report:', error);
    
    // Still return 200 to prevent browser retries
    return NextResponse.json({
      status: 'error',
      message: 'Failed to process CSP report',
    });
  }
}

/**
 * GET endpoint for CSP report statistics (admin only)
 * 
 * In production, this should be protected with authentication
 */
export async function GET() {
  // For now, just return endpoint status
  // In production, return statistics from stored violations
  return NextResponse.json({
    status: 'ok',
    message: 'CSP report endpoint is active',
    note: 'Violation reports are logged but not stored persistently in this version',
  });
}
