import { StructuredLegalOutput, StrategyItem } from './types';

export interface ParsedLegalOutput {
  strategy: string;
  filings: string;
  structured?: StructuredLegalOutput;
}

/**
 * Enhanced parsing function to handle both legacy and structured formats.
 * Extracted from ResultDisplay for reuse across the result tab components.
 */
export function parseLegalOutput(text: string): ParsedLegalOutput {
  if (!text || typeof text !== 'string') {
    return {
      strategy: 'No content available.',
      filings: 'No filings generated.'
    };
  }

  // Try to parse as structured JSON first
  try {
    const parsedRaw = JSON.parse(text);
    // Handle AI field naming variations with comprehensive fallbacks
    const parsed: StructuredLegalOutput = {
      ...parsedRaw,
      // Roadmap aliases: roadmap, procedural_roadmap, next_steps, action_plan
      roadmap: parsedRaw.roadmap || parsedRaw.procedural_roadmap || parsedRaw.next_steps || parsedRaw.action_plan || [],
      // Citations aliases: citations, legal_citations, authorities, case_law
      citations: parsedRaw.citations || parsedRaw.legal_citations || parsedRaw.authorities || parsedRaw.case_law || [],
      // Strategy aliases
      strategy: parsedRaw.strategy || parsedRaw.legal_strategy || parsedRaw.analysis || '',
      // Filing template aliases
      filing_template: parsedRaw.filing_template || parsedRaw.motion_template || parsedRaw.filing || parsedRaw.template || '',
      // Local logistics aliases
      local_logistics: parsedRaw.local_logistics || parsedRaw.logistics || parsedRaw.court_info || {},
      // Procedural checks aliases
      procedural_checks: parsedRaw.procedural_checks || parsedRaw.checks || parsedRaw.compliance_checks || []
    };

    if (parsed.disclaimer && parsed.strategy && parsed.filing_template) {
      // Format the structured output for display
      let strategyText = `${parsed.disclaimer}\n\n${parsed.strategy}\n\n`;

      // Add adversarial strategy if present
      if (parsed.adversarial_strategy) {
        strategyText += "## Opposition View (Red-Team Analysis):\n";
        strategyText += `${parsed.adversarial_strategy}\n\n`;
      }

      if (parsed.roadmap && parsed.roadmap.length > 0) {
        strategyText += "## Procedural Roadmap:\n";
        for (const item of parsed.roadmap) {
          const stepNum = item.step ?? 0;
          const title = item.title || 'Step Pending';
          const description = item.description || 'Details to be determined.';
          strategyText += `\n### ${stepNum}. ${title}\n`;
          strategyText += `${description}\n`;
          if (item.estimated_time) {
            strategyText += `*Estimated Time: ${item.estimated_time}*\n`;
          }
          if (item.required_documents && item.required_documents.length > 0) {
            strategyText += `*Required Documents: ${item.required_documents.join(', ')}*\n`;
          }
        }
      }

      if (parsed.procedural_checks && parsed.procedural_checks.length > 0) {
        strategyText += "\n## Procedural Checks:\n";
        for (const check of parsed.procedural_checks) {
          strategyText += `- ${check}\n`;
        }
      }

      if (parsed.citations && parsed.citations.length > 0) {
        strategyText += "\n## Legal Citations:\n";
        for (const citation of parsed.citations) {
          const citeText = citation.text || 'Citation unavailable';
          strategyText += `- ${citeText}`;
          if (citation.source) {
            strategyText += ` (${citation.source})`;
          }
          if (citation.url) {
            strategyText += ` ${citation.url}`;
          }
          strategyText += "\n";
        }
      }

      // Handle filing_template - it may be an object (structured motion) or string
      // Also handle case where AI nests JSON inside a string
      let filingsContent = '';
      if (typeof parsed.filing_template === 'object' && parsed.filing_template !== null) {
        // Check if it's a LegalMotion schema object
        if ('type' in parsed.filing_template && 'caseInfo' in parsed.filing_template) {
          filingsContent = JSON.stringify(parsed.filing_template, null, 2);
        } else {
          // Convert nested JSON object to beautiful Markdown
          const f = parsed.filing_template as Record<string, unknown>;
          filingsContent = `
# ${String(f.motion_title || f.title || 'LEGAL PLEADING')}
**COURT:** ${String(f.court || f.courtName || '[COURT NAME]')}
**CASE NO:** ${String(f.case_no || f.caseNumber || '[CASE NUMBER]')}

**${String(f.plaintiff || '[PLAINTIFF]')}**, 
v. 
**${String(f.defendant || '[DEFENDANT]')}**

---
${String(f.body || f.description || 'Filing content generation failed.')}
          `.trim();
        }
      } else if (typeof parsed.filing_template === 'string') {
        // Check if the string itself contains JSON that needs parsing
        const trimmedTemplate = parsed.filing_template.trim();
        if (trimmedTemplate.startsWith('{') && trimmedTemplate.endsWith('}')) {
          try {
            const nestedJson = JSON.parse(trimmedTemplate);
            filingsContent = typeof nestedJson === 'object'
              ? JSON.stringify(nestedJson, null, 2)
              : trimmedTemplate;
          } catch {
            filingsContent = trimmedTemplate;
          }
        } else {
          filingsContent = trimmedTemplate;
        }
      } else {
        filingsContent = 'No filings generated.';
      }

      return {
        strategy: strategyText,
        filings: filingsContent,
        structured: parsed
      };
    }
  } catch {
    // If JSON parsing fails, fall back to delimiter-based parsing
  }

  // Regex to match ---, ***, or ___ with optional spaces, on their own line if possible
  const delimiterRegex = /\n\s*([-*_]{3,})\s*\n/;
  const match = text.match(delimiterRegex);

  if (!match) {
    // Fallback to simple index check if regex doesn't match a dedicated line
    const fallbackDelimiter = '---';
    const index = text.indexOf(fallbackDelimiter);

    if (index === -1) {
      return {
        strategy: text.trim(),
        filings: 'No filings generated.'
      };
    }

    return {
      strategy: text.substring(0, index).trim() || 'No strategy provided.',
      filings: text.substring(index + fallbackDelimiter.length).trim() || 'No filings generated.'
    };
  }

  const delimiterIndex = match.index!;
  const delimiterLength = match[0].length;

  const strategy = text.substring(0, delimiterIndex).trim();
  const filings = text.substring(delimiterIndex + delimiterLength).trim();

  return {
    strategy: strategy || 'No strategy provided.',
    filings: filings || 'No filings generated.'
  };
}

/**
 * Calculate a deadline from the roadmap.
 * Extracted from ResultDisplay for reuse in the survival guide tab.
 */
export function calculateDeadlineFromRoadmap(roadmap: StrategyItem[] | undefined): { answerDue?: Date; daysRemaining?: number } | null {
  if (!roadmap || roadmap.length === 0) return null;

  // Look for steps that mention "answer" or "deadline" - use safe optional chaining
  const answerStep = roadmap.find(step =>
    step?.title?.toLowerCase()?.includes('answer') ||
    step?.description?.toLowerCase()?.includes('answer') ||
    step?.title?.toLowerCase()?.includes('deadline')
  );

  if (!answerStep || !answerStep.estimated_time) return null;

  // Parse estimated time (e.g., "30 days", "2 weeks", "within 5 days")
  const timeMatch = answerStep.estimated_time.match(/(\d+)\s*(day|week|month)s?/i);
  if (!timeMatch) return null;

  const value = parseInt(timeMatch[1], 10);
  const unit = timeMatch[2].toLowerCase();

  const now = new Date();
  let daysToAdd = value;

  if (unit === 'week') {
    daysToAdd = value * 7;
  } else if (unit === 'month') {
    daysToAdd = value * 30; // Approximate
  }

  const dueDate = new Date(now.getTime() + daysToAdd * 24 * 60 * 60 * 1000);
  const daysRemaining = daysToAdd;

  return { answerDue: dueDate, daysRemaining };
}
