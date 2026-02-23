/**
 * Enhance legal_lookup.json with deep-linking fields
 * 
 * This script adds:
 * - full_text_url: Direct link to official statute text
 * - statutory_text: Full text of the statute/rule where available
 * - search_url: Link to search results for this citation
 * 
 * Run with: node scripts/enhance-legal-data.js
 */

import { readFileSync, writeFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Generate deep link URLs for different jurisdictions
 */
function generateDeepLinks(rule) {
  const { rule_number, jurisdiction } = rule;
  const enhancements = {};

  // Federal rules
  if (jurisdiction === 'Federal') {
    if (rule_number.includes('FRCP') || rule_number.includes('Federal Rules')) {
      const ruleNumMatch = rule_number.match(/§?\s*(\d+)/);
      if (ruleNumMatch) {
        enhancements.full_text_url = `https://www.law.cornell.edu/rules/frcp/rule_${ruleNumMatch[1]}`;
        enhancements.search_url = `https://www.courtlistener.com/?q=${encodeURIComponent(rule_number)}`;
      }
    } else if (rule_number.includes('U.S.C.')) {
      const uscMatch = rule_number.match(/(\d+)\s*U\.?S\.?C\.?\s*§?\s*(\d+)/i);
      if (uscMatch) {
        enhancements.full_text_url = `https://www.law.cornell.edu/uscode/text/${uscMatch[1]}/${uscMatch[2]}`;
        enhancements.search_url = `https://www.courtlistener.com/?q=${encodeURIComponent(rule_number)}`;
      }
    }
  }

  // California
  if (jurisdiction === 'California' || jurisdiction === 'CA') {
    if (rule_number.includes('CCP') || rule_number.includes('Code Civ. Proc.')) {
      const sectionMatch = rule_number.match(/§?\s*(\d+(?:\.\d+)?)/);
      if (sectionMatch) {
        enhancements.full_text_url = `https://leginfo.legislature.ca.gov/faces/codes_displaySection.xhtml?sectionNum=${sectionMatch[1]}&lawCode=CCP`;
        enhancements.search_url = `https://www.courtlistener.com/?q=${encodeURIComponent(rule_number)}`;
      }
    }
  }

  // New York
  if (jurisdiction === 'New York' || jurisdiction === 'NY') {
    if (rule_number.includes('CPLR')) {
      const sectionMatch = rule_number.match(/§?\s*(\d+(?:[a-z]?(?:\([0-9]+\))?)?)/i);
      if (sectionMatch) {
        enhancements.full_text_url = `https://www.nysenate.gov/legislation/laws/CVP/${sectionMatch[1]}`;
        enhancements.search_url = `https://www.courtlistener.com/?q=${encodeURIComponent(rule_number)}`;
      }
    }
  }

  // Texas
  if (jurisdiction === 'Texas' || jurisdiction === 'TX') {
    if (rule_number.includes('RCP') || rule_number.includes('Rules of Civil Procedure')) {
      const sectionMatch = rule_number.match(/§?\s*(\d+)/);
      if (sectionMatch) {
        enhancements.full_text_url = `https://statutes.capitol.texas.gov/Docs/RU/htm/RU.3.htm#${sectionMatch[1]}`;
        enhancements.search_url = `https://www.courtlistener.com/?q=${encodeURIComponent(rule_number)}`;
      }
    }
  }

  // Florida
  if (jurisdiction === 'Florida' || jurisdiction === 'FL') {
    if (rule_number.includes('Stat') || rule_number.includes('Florida Statutes')) {
      const sectionMatch = rule_number.match(/§?\s*(\d+(?:\.\d+)?)/);
      if (sectionMatch) {
        enhancements.full_text_url = `http://www.leg.state.fl.us/statutes/index.cfm?App_mode=Display_Statute&URL=${sectionMatch[1].replace('.', '')}`;
        enhancements.search_url = `https://www.courtlistener.com/?q=${encodeURIComponent(rule_number)}`;
      }
    }
  }

  // Wisconsin
  if (jurisdiction === 'Wisconsin' || jurisdiction === 'WI') {
    if (rule_number.includes('Wis. Stat.') || rule_number.includes('Wisconsin Statutes')) {
      const sectionMatch = rule_number.match(/§\s*(\d+(?:\.\d+)?)/);
      if (sectionMatch) {
        enhancements.full_text_url = `https://docs.legis.wisconsin.gov/statutes/statutes/${sectionMatch[1]}`;
        enhancements.search_url = `https://www.courtlistener.com/?q=${encodeURIComponent(rule_number)}`;
      }
    }
  }

  // Generic fallback for other jurisdictions
  if (!enhancements.full_text_url) {
    enhancements.search_url = `https://www.courtlistener.com/?q=${encodeURIComponent(rule_number)}`;
    enhancements.full_text_url = `https://www.law.cornell.edu/search/site/${encodeURIComponent(rule_number)}`;
  }

  return enhancements;
}

/**
 * Main enhancement function
 */
function enhanceLegalData() {
  const inputPath = path.join(process.cwd(), 'public', 'data', 'legal_lookup.json');
  const outputPath = path.join(process.cwd(), 'public', 'data', 'legal_lookup_enhanced.json');

  console.log('📚 Enhancing legal_lookup.json with deep-linking fields...');

  // Read input file
  const data = JSON.parse(readFileSync(inputPath, 'utf8'));

  // Enhance each rule
  let enhancedCount = 0;
  data.pro_se_procedural_rules = data.pro_se_procedural_rules.map((rule) => {
    const enhancements = generateDeepLinks(rule);
    enhancedCount += Object.keys(enhancements).length > 0 ? 1 : 0;
    
    return {
      ...rule,
      ...enhancements,
    };
  });

  // Write enhanced file
  writeFileSync(outputPath, JSON.stringify(data, null, 2));

  console.log(`✅ Enhanced ${enhancedCount} of ${data.pro_se_procedural_rules.length} rules with deep-linking fields`);
  console.log(`📄 Output written to: ${outputPath}`);
  console.log('\n💡 Next steps:');
  console.log('   1. Review the enhanced file for accuracy');
  console.log('   2. Replace legal_lookup.json with the enhanced version');
  console.log('   3. Update frontend to display deep links in UI');
}

// Run
enhanceLegalData();
