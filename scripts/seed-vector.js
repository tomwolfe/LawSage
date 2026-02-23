/**
 * Seed Vector Database with Legal Rules
 * 
 * This script indexes all legal rules from legal_lookup.json into Upstash Vector.
 * Run once to populate the vector index for RAG.
 * 
 * Usage: node scripts/seed-vector.js
 */

import { readFile } from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { batchIndexLegalRules, isVectorConfigured, getIndexStats } from '../lib/vector.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function seedVector() {
  console.log('🌱 LawSage Vector Seeder\n');

  // Check if vector is configured
  if (!isVectorConfigured()) {
    console.error('❌ Upstash Vector not configured.');
    console.error('Set UPSTASH_VECTOR_URL and UPSTASH_VECTOR_TOKEN in your .env.local file.');
    console.error('\nGet your credentials from: https://console.upstash.com/vector');
    process.exit(1);
  }

  console.log('✅ Vector configuration detected');

  // Get current stats
  const stats = await getIndexStats();
  console.log(`📊 Current vector count: ${stats.totalVectors}`);

  // Load legal rules
  console.log('\n📖 Loading legal rules...');
  const legalDataPath = path.join(__dirname, '..', 'public', 'data', 'legal_lookup.json');
  
  let legalData;
  try {
    const content = await readFile(legalDataPath, 'utf8');
    legalData = JSON.parse(content);
  } catch (error) {
    console.error('❌ Failed to load legal_lookup.json:', error);
    process.exit(1);
  }

  const rules = legalData.pro_se_procedural_rules || [];
  const exParteRules = legalData.ex_parte_notice_rules || [];
  
  console.log(`📋 Found ${rules.length} procedural rules and ${exParteRules.length} ex parte rules`);

  // Transform rules into vector format
  const vectors = [];

  // Index procedural rules
  for (const rule of rules) {
    vectors.push({
      id: rule.id,
      rule_number: rule.rule_number,
      title: rule.title,
      description: rule.description,
      jurisdiction: rule.jurisdiction,
      category: rule.category,
      full_text: `${rule.rule_number} - ${rule.title}: ${rule.description}`,
      source_url: undefined,
    });
  }

  // Index ex parte rules with different ID range to avoid collisions
  for (const rule of exParteRules) {
    vectors.push({
      id: 10000 + rule.id, // Use offset to avoid ID collisions
      rule_number: 'Ex Parte Notice Rule',
      title: rule.courthouse,
      description: rule.rule,
      jurisdiction: rule.jurisdiction,
      category: 'Ex Parte',
      full_text: `${rule.courthouse} (${rule.jurisdiction}): ${rule.rule}. Notice time: ${rule.notice_time}`,
      source_url: undefined,
    });
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
  console.log('\n💡 Next steps:');
  console.log('   1. Test vector search: curl http://localhost:3000/api/vector/search -d \'{"query":"eviction notice","topK":3}\'');
  console.log('   2. The /api/analyze endpoint will now use vector search for RAG');
}

// Handle errors
seedVector().catch((error) => {
  console.error('\n❌ Seeder failed:', error);
  process.exit(1);
});
