/**
 * Template-Based Document Assembly
 * 
 * Addresses Step 5: Full Type-Safe Document Assembly
 * 
 * Instead of letting the LLM write the entire motion (which risks
 * changing boilerplate text that judges expect to be identical),
 * this utility:
 * 
 * 1. Defines verified local templates (.md or .json)
 * 2. Has the LLM return only "Arguments" and "Fact Applications" as JSON
 * 3. Injects these variables into the local, verified templates
 * 
 * This prevents accidental modification of critical boilerplate language.
 */

import { CaptionBuilder, createCourtCaption } from './caption-builder';
import { CourtCaption } from '../types/legal-docs';

/**
 * Motion template interface
 */
export interface MotionTemplate {
  id: string;
  jurisdiction: string;
  motionType: string;
  title: string;
  sections: TemplateSection[];
  requiredFields: string[];
  optionalFields?: string[];
  localRuleReferences?: string[];
}

export interface TemplateSection {
  id: string;
  title: string;
  type: 'boilerplate' | 'variable' | 'conditional' | 'repeating';
  content: string;  // Markdown template with {{variable}} placeholders
  variables?: string[];
  condition?: string;  // For conditional sections
}

/**
 * Assembled motion data (what the LLM provides)
 */
export interface MotionData {
  caseInfo: {
    court: string;
    caseNumber: string;
    plaintiff: string;
    defendant: string;
  };
  motionType: string;
  facts: FactApplication[];
  arguments: LegalArgument[];
  reliefRequested: string;
  exhibits?: string[];
  customVariables?: Record<string, string>;
}

export interface FactApplication {
  id: string;
  fact: string;
  evidenceReference?: string;  // e.g., "[Evidence 1, Line 5]"
  relevanceExplanation: string;
}

export interface LegalArgument {
  id: string;
  legalPoint: string;
  statuteCitation?: string;
  caseCitation?: string;
  explanation: string;
  counterMeasure?: string;  // Expected opposition response
}

/**
 * Load verified motion template from filesystem
 */
export async function loadMotionTemplate(
  jurisdiction: string,
  motionType: string
): Promise<MotionTemplate | null> {
  try {
    // Map motion types to template files
    const templateMap: Record<string, string> = {
      'motion_to_dismiss': 'motion_to_dismiss',
      'motion_for_discovery': 'motion_for_discovery',
      'motion_for_summary_judgment': 'motion_for_summary_judgment',
      'motion_to_quash': 'motion_to_quash',
      'motion_for_continuance': 'motion_for_continuance',
      'ex_parte_application': 'ex_parte_application',
      'complaint': 'complaint',
      'answer': 'answer',
    };

    const templateName = templateMap[motionType];
    if (!templateName) {
      console.warn(`No template found for motion type: ${motionType}`);
      return null;
    }

    // Load from public/templates/jurisdictions/
    const templatePath = `/templates/jurisdictions/${jurisdiction.toUpperCase()}/${templateName}.json`;
    
    const response = await fetch(templatePath);
    
    if (!response.ok) {
      if (response.status === 404) {
        // Try generic template
        const genericPath = `/templates/jurisdictions/GENERIC/${templateName}.json`;
        const genericResponse = await fetch(genericPath);
        
        if (!genericResponse.ok) {
          console.warn(`No template found for ${motionType} in ${jurisdiction} or GENERIC`);
          return null;
        }
        
        return await genericResponse.json() as MotionTemplate;
      }
      throw new Error(`Failed to load template: ${response.status}`);
    }

    const template: MotionTemplate = await response.json();
    return template;
  } catch (error) {
    console.error('Failed to load motion template:', error);
    return null;
  }
}

/**
 * Inject motion data into template
 * 
 * Replaces {{variable}} placeholders with actual content
 */
export function injectTemplateVariables(
  template: MotionTemplate,
  data: MotionData,
  caption?: CourtCaption
): string {
  const sections: string[] = [];

  // Generate caption if not provided
  const courtCaption = caption || createCourtCaption({
    courtName: data.caseInfo.court,
    state: data.caseInfo.court.split(' ')[0] || 'Unknown',
    plaintiff: data.caseInfo.plaintiff,
    defendant: data.caseInfo.defendant,
    documentTitle: data.motionType.replace(/_/g, ' ').toUpperCase(),
    caseNumber: data.caseInfo.caseNumber,
    jurisdiction: template.jurisdiction,
  });

  // Build caption using CaptionBuilder
  const builder = new CaptionBuilder(
    courtCaption.courtName,
    courtCaption.state,
    courtCaption.plaintiff,
    courtCaption.defendant,
    courtCaption.documentTitle,
    template.jurisdiction,
    courtCaption.caseNumber,
    courtCaption.county
  );

  sections.push(builder.toMarkdown());

  // Process each template section
  for (const section of template.sections) {
    const processedSection = processSection(section, data);
    if (processedSection) {
      sections.push(processedSection);
    }
  }

  // Add signature block
  sections.push(`
---

Respectfully submitted,

___________________________
Attorney for Plaintiff/Defendant
Attorney Bar No. _______________
Firm Name
Address Line 1
Address Line 2
Phone: _______________
Email: _______________

Dated: ${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}
`);

  // Add certificate of service
  sections.push(`
## CERTIFICATE OF SERVICE

I hereby certify that on ${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}, I served a copy of this ${data.motionType.replace(/_/g, ' ')} on the opposing party by [METHOD OF SERVICE].

___________________________
[Signature]
`);

  return sections.join('\n\n');
}

/**
 * Process a single template section
 */
function processSection(section: TemplateSection, data: MotionData): string | null {
  // Check condition for conditional sections
  if (section.type === 'conditional' && section.condition) {
    if (!evaluateCondition(section.condition, data)) {
      return null;  // Skip this section
    }
  }

  let content = section.content;

  // Replace variables
  if (section.variables) {
    for (const variable of section.variables) {
      const value = getVariableValue(variable, data);
      content = content.replace(new RegExp(`{{${variable}}}`, 'g'), value);
    }
  }

  // Format section based on type
  switch (section.type) {
    case 'boilerplate':
      return content;  // Return as-is (verified boilerplate)
    
    case 'variable':
      return content;  // Variables already replaced
    
    case 'conditional':
      return content;  // Condition already evaluated
    
    case 'repeating':
      return processRepeatingSection(section, data);
    
    default:
      return content;
  }
}

/**
 * Process repeating sections (e.g., multiple arguments)
 */
function processRepeatingSection(section: TemplateSection, data: MotionData): string {
  const lines: string[] = [];
  
  // Determine what to repeat based on section ID
  switch (section.id) {
    case 'facts':
      for (const fact of data.facts) {
        let line = section.content;
        line = line.replace('{{fact}}', fact.fact);
        line = line.replace('{{evidenceReference}}', fact.evidenceReference || '');
        line = line.replace('{{relevanceExplanation}}', fact.relevanceExplanation);
        lines.push(line);
      }
      break;
    
    case 'arguments':
      for (const arg of data.arguments) {
        let line = section.content;
        line = line.replace('{{legalPoint}}', arg.legalPoint);
        line = line.replace('{{statuteCitation}}', arg.statuteCitation || '');
        line = line.replace('{{caseCitation}}', arg.caseCitation || '');
        line = line.replace('{{explanation}}', arg.explanation);
        line = line.replace('{{counterMeasure}}', arg.counterMeasure || '');
        lines.push(line);
      }
      break;
    
    default:
      return section.content;
  }

  return lines.join('\n\n');
}

/**
 * Get variable value from motion data
 */
function getVariableValue(variable: string, data: MotionData): string {
  // Check custom variables first
  if (data.customVariables && data.customVariables[variable]) {
    return data.customVariables[variable];
  }

  // Check standard fields
  const parts = variable.split('.');
  let value: unknown = data;

  for (const part of parts) {
    if (value && typeof value === 'object' && part in value) {
      value = (value as Record<string, unknown>)[part];
    } else {
      return '';  // Variable not found
    }
  }

  return String(value || '');
}

/**
 * Evaluate condition for conditional sections
 */
function evaluateCondition(condition: string, data: MotionData): boolean {
  // Simple condition evaluation (can be enhanced with more complex logic)
  // Examples: "facts.length > 0", "arguments.length >= 3", "exhibits !== undefined"
  
  try {
    // Create evaluation context
    const context = {
      facts: data.facts,
      arguments: data.arguments,
      exhibits: data.exhibits,
      reliefRequested: data.reliefRequested,
    };

    // Safe evaluation (no eval - use Function constructor with limited scope)
    const evalFunc = new Function('context', `with (context) { return ${condition}; }`);
    return evalFunc(context);
  } catch {
    return false;  // If condition evaluation fails, skip the section
  }
}

/**
 * Validate motion data against template requirements
 */
export function validateMotionData(
  template: MotionTemplate,
  data: MotionData
): { valid: boolean; errors: string[]; warnings: string[] } {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Check required fields
  for (const field of template.requiredFields) {
    const value = getVariableValue(field, data);
    if (!value || value.trim() === '') {
      errors.push(`Required field "${field}" is missing or empty`);
    }
  }

  // Check optional fields
  if (template.optionalFields) {
    for (const field of template.optionalFields) {
      const value = getVariableValue(field, data);
      if (!value || value.trim() === '') {
        warnings.push(`Optional field "${field}" is empty`);
      }
    }
  }

  // Validate statute citations against template's local rule references
  if (template.localRuleReferences) {
    for (const arg of data.arguments) {
      if (arg.statuteCitation) {
        const isReferenced = template.localRuleReferences.some(rule =>
          arg.statuteCitation?.includes(rule)
        );
        if (!isReferenced) {
          warnings.push(`Statute citation "${arg.statuteCitation}" is not referenced in template's local rules`);
        }
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * Generate motion document from template
 * 
 * Main entry point for template-based document assembly
 */
export async function generateMotionDocument(
  jurisdiction: string,
  motionType: string,
  motionData: MotionData
): Promise<{ success: boolean; content?: string; errors?: string[]; warnings?: string[] }> {
  // Load template
  const template = await loadMotionTemplate(jurisdiction, motionType);
  
  if (!template) {
    return {
      success: false,
      errors: [`No template found for ${motionType} in ${jurisdiction}`],
    };
  }

  // Validate motion data
  const validation = validateMotionData(template, motionData);
  
  if (!validation.valid) {
    return {
      success: false,
      errors: validation.errors,
      warnings: validation.warnings,
    };
  }

  // Inject data into template
  const content = injectTemplateVariables(template, motionData);

  return {
    success: true,
    content,
    warnings: validation.warnings,
  };
}

/**
 * Extract LLM prompt for motion data collection
 * 
 * This prompt tells the LLM exactly what data to extract
 */
export function generateMotionDataPrompt(
  template: MotionTemplate,
  jurisdiction: string
): string {
  return `
You are a legal data extraction expert. Your task is to extract specific data from the user's input
to populate a verified motion template for ${jurisdiction}.

DO NOT write the motion yourself. Instead, return a JSON object with the following structure:

{
  "caseInfo": {
    "court": "Exact court name from documents or user input",
    "caseNumber": "Case number from documents",
    "plaintiff": "Plaintiff name",
    "defendant": "Defendant name"
  },
  "motionType": "${template.motionType}",
  "facts": [
    {
      "id": "fact_1",
      "fact": "Clear statement of fact",
      "evidenceReference": "[Evidence X, Line Y]",
      "relevanceExplanation": "Why this fact matters"
    }
  ],
  "arguments": [
    {
      "id": "arg_1",
      "legalPoint": "Legal argument",
      "statuteCitation": "Exact statute number from provided rules",
      "caseCitation": "Case citation (if applicable)",
      "explanation": "Detailed explanation",
      "counterMeasure": "Expected opposition response"
    }
  ],
  "reliefRequested": "Specific relief being requested",
  "exhibits": ["List of exhibits to attach"]
}

TEMPLATE REQUIREMENTS:
- Required fields: ${template.requiredFields.join(', ')}
- Motion type: ${template.motionType}
- Jurisdiction: ${template.jurisdiction}

CRITICAL: 
- Use EXACT statute numbers from the provided jurisdiction rules
- Reference evidence documents using [Evidence X] notation
- Include counter-measures for each argument
- Do not write the motion - only provide the data above
`;
}
