/**
 * Seed Vector Database with Legal Rules
 * 
 * This script indexes all legal rules from legal_lookup.json into Upstash Vector.
 * Run once to populate the vector index for RAG.
 * 
 * Usage: node scripts/seed-vector.js
 */

import { readFile, readdir } from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { batchIndexLegalRules, isVectorConfigured, getIndexStats } from '../lib/vector.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Generate a unique ID for a rule
 */
function generateRuleId(jurisdiction, category, name) {
  const clean = (str) => str.toLowerCase().replace(/[^a-z0-9]/g, '_');
  return `${clean(jurisdiction)}_${clean(category)}_${clean(name)}`;
}

async function seedVector() {
  console.log('🌱 LawSage Vector Seeder\n');

  // Check if vector is configured
  if (!isVectorConfigured()) {
    console.error('❌ Upstash Vector not configured.');
    process.exit(1);
  }

  console.log('✅ Vector configuration detected');

  // Get current stats
  const stats = await getIndexStats();
  console.log(`📊 Current vector count: ${stats.totalVectors}`);

  const vectors = [];

  // 1. Index legal_lookup.json (Legacy but useful)
  console.log('\n📖 Loading legal_lookup.json...');
  const legalLookupPath = path.join(__dirname, '..', 'public', 'data', 'legal_lookup.json');
  try {
    const content = await readFile(legalLookupPath, 'utf8');
    const legalData = JSON.parse(content);
    
    const rules = legalData.pro_se_procedural_rules || [];
    const exParteRules = legalData.ex_parte_notice_rules || [];
    
    for (const rule of rules) {
      vectors.push({
        id: `lookup_proc_${rule.id}`,
        rule_number: rule.rule_number,
        title: rule.title,
        description: rule.description,
        jurisdiction: rule.jurisdiction,
        category: rule.category,
        full_text: `${rule.rule_number} - ${rule.title}: ${rule.description}`,
      });
    }

    for (const rule of exParteRules) {
      vectors.push({
        id: `lookup_exparte_${rule.id}`,
        rule_number: 'Ex Parte Notice Rule',
        title: rule.courthouse,
        description: rule.rule,
        jurisdiction: rule.jurisdiction,
        category: 'Ex Parte',
        full_text: `${rule.courthouse} (${rule.jurisdiction}): ${rule.rule}. Notice time: ${rule.notice_time}`,
      });
    }
  } catch (error) {
    console.warn('⚠️ Could not load legal_lookup.json, skipping...');
  }

  // 2. Index all files in public/rules/*.json
  console.log('\n📖 Loading jurisdiction-specific rules...');
  const rulesDir = path.join(__dirname, '..', 'public', 'rules');
  
  try {
    const files = await readdir(rulesDir);
    const jsonFiles = files.filter(f => f.endsWith('.json'));

    for (const file of jsonFiles) {
      const filePath = path.join(rulesDir, file);
      const content = await readFile(filePath, 'utf8');
      const data = JSON.parse(content);
      const jur = data.jurisdiction;

      console.log(`  - Processing ${jur} (${file})`);

      // Index Filing Deadlines
      if (data.filing_deadlines) {
        for (const [key, val] of Object.entries(data.filing_deadlines)) {
          if (key === 'discovery_deadlines') {
            for (const [discKey, discVal] of Object.entries(val)) {
              vectors.push({
                id: generateRuleId(jur, 'discovery', discKey),
                rule_number: discVal.statute || 'Discovery Rule',
                title: `${jur} Discovery: ${discKey}`,
                description: discVal.description,
                jurisdiction: jur,
                category: 'Discovery',
                full_text: `${jur} Discovery ${discKey}: ${discVal.description}. Authority: ${discVal.statute}`,
              });
            }
          } else {
            vectors.push({
              id: generateRuleId(jur, 'filing', key),
              rule_number: val.statute || 'Filing Rule',
              title: `${jur} Filing Deadline: ${key}`,
              description: val.description,
              jurisdiction: jur,
              category: 'Procedural',
              full_text: `${jur} Filing Deadline for ${key}: ${val.description}. Statute: ${val.statute}`,
            });
          }
        }
      }

      // Index Ex Parte Rules
      if (data.ex_parte_rules) {
        const ep = data.ex_parte_rules;
        if (ep.notice_period) {
          vectors.push({
            id: generateRuleId(jur, 'ex_parte', 'notice'),
            rule_number: ep.notice_period.statute || 'Ex Parte Rule',
            title: `${jur} Ex Parte Notice`,
            description: ep.notice_period.description,
            jurisdiction: jur,
            category: 'Ex Parte',
            full_text: `${jur} Ex Parte Notice: ${ep.notice_period.description}. Required hours: ${ep.notice_period.hours}. Statute: ${ep.notice_period.statute}`,
          });
        }
        if (ep.requirements) {
          vectors.push({
            id: generateRuleId(jur, 'ex_parte', 'requirements'),
            rule_number: 'Procedural Requirements',
            title: `${jur} Ex Parte Requirements`,
            description: ep.requirements.join(', '),
            jurisdiction: jur,
            category: 'Ex Parte',
            full_text: `${jur} Ex Parte Requirements: ${ep.requirements.join('. ')}`,
          });
        }
      }

      // Index Service Rules
      if (data.service_rules) {
        for (const [key, val] of Object.entries(data.service_rules)) {
          vectors.push({
            id: generateRuleId(jur, 'service', key),
            rule_number: val.statute || 'Service Rule',
            title: `${jur} Service Rule: ${key}`,
            description: val.description || (val.requirements ? val.requirements.join(', ') : ''),
            jurisdiction: jur,
            category: 'Service',
            full_text: `${jur} Service of Process - ${key}: ${val.description || ''}. Requirements: ${val.requirements?.join('. ') || ''}. Statute: ${val.statute}`,
          });
        }
      }

      // Index Court Fees
      if (data.court_fees) {
        vectors.push({
          id: generateRuleId(jur, 'fees', 'summary'),
          rule_number: 'Fee Schedule',
          title: `${jur} Court Fees`,
          description: `Filing: $${data.court_fees.first_paper_filing}, Motion: $${data.court_fees.motion_filing}`,
          jurisdiction: jur,
          category: 'Logistics',
          full_text: `${jur} Court Fees: First Paper Filing: $${data.court_fees.first_paper_filing}. Motion Filing: $${data.court_fees.motion_filing}. Fee waiver available: ${data.court_fees.fee_waiver_available ? 'Yes (' + data.court_fees.fee_waiver_form + ')' : 'No'}`,
        });
      }
    }
  } catch (error) {
    console.error('❌ Failed to process jurisdiction rules:', error);
  }

  console.log(`\n📦 Prepared ${vectors.length} vectors for indexing`);

  // Batch index
  console.log('\n⬆️  Indexing vectors...');
  const successCount = await batchIndexLegalRules(vectors);
  
  console.log(`\n✅ Successfully indexed ${successCount}/${vectors.length} rules`);

  // Verify
  const newStats = await getIndexStats();
  console.log(`📊 New vector count: ${newStats.totalVectors}`);
  
  console.log('\n✨ Vector seeding complete!');
}

// Handle errors
seedVector().catch((error) => {
  console.error('\n❌ Seeder failed:', error);
  process.exit(1);
});
