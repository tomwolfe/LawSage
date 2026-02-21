/**
 * Legal Lookup Data Update Script
 * 
 * This script automates the process of updating legal lookup data from official sources.
 * It can be run periodically (e.g., weekly) via cron job or GitHub Actions.
 * 
 * Features:
 * - Fetches updated court rules from official sources
 * - Validates data integrity
 * - Creates backup of existing data
 * - Generates update report
 * 
 * Usage:
 *   npm run update-legal-data
 *   node scripts/update-legal-data.js
 */

const fs = require('fs');
const path = require('path');
const https = require('https');

// Configuration
const CONFIG = {
  backupDir: path.join(__dirname, '..', 'backups', 'legal-data'),
  dataDir: path.join(__dirname, '..', 'public', 'data'),
  rulesDir: path.join(__dirname, '..', 'public', 'rules'),
  lastUpdateFile: path.join(__dirname, '..', 'public', 'data', 'last-update.json'),
  
  // Data sources (official .gov and .edu sources)
  sources: {
    federalRules: 'https://www.uscourts.gov/rules-policies/current-rules-practice-procedure',
    californiaRules: 'https://www.courts.ca.gov/rules.htm',
    newYorkRules: 'https://www.nycourts.gov/rules/',
    texasRules: 'https://www.txcourts.gov/rules/',
    floridaRules: 'https://www.floridasupremecourt.org/Information/Florida-Rules-of-Court',
    
    // Legal information institutes for citation data
    LII: 'https://www.law.cornell.edu',
    CourtListener: 'https://www.courtlistener.com/api/rest/v4'
  }
};

/**
 * Ensure backup directory exists
 */
function ensureBackupDir() {
  if (!fs.existsSync(CONFIG.backupDir)) {
    fs.mkdirSync(CONFIG.backupDir, { recursive: true });
    console.log(`Created backup directory: ${CONFIG.backupDir}`);
  }
}

/**
 * Create backup of existing data files
 */
function createBackup() {
  ensureBackupDir();
  
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupPath = path.join(CONFIG.backupDir, `backup-${timestamp}`);
  
  fs.mkdirSync(backupPath, { recursive: true });
  
  // Backup legal_lookup.json
  const lookupSrc = path.join(CONFIG.dataDir, 'legal_lookup.json');
  if (fs.existsSync(lookupSrc)) {
    fs.copyFileSync(lookupSrc, path.join(backupPath, 'legal_lookup.json'));
    console.log('Backed up legal_lookup.json');
  }
  
  // Backup all rules files
  if (fs.existsSync(CONFIG.rulesDir)) {
    const rulesBackup = path.join(backupPath, 'rules');
    fs.mkdirSync(rulesBackup, { recursive: true });
    
    const rulesFiles = fs.readdirSync(CONFIG.rulesDir);
    rulesFiles.forEach(file => {
      if (file.endsWith('.json')) {
        fs.copyFileSync(
          path.join(CONFIG.rulesDir, file),
          path.join(rulesBackup, file)
        );
        console.log(`Backed up rules/${file}`);
      }
    });
  }
  
  return backupPath;
}

/**
 * Fetch URL content with error handling
 */
function fetchUrl(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      if (res.statusCode !== 200) {
        reject(new Error(`HTTP ${res.statusCode}: ${url}`));
        return;
      }
      
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve(data));
    }).on('error', reject);
  });
}

/**
 * Validate JSON structure
 */
function validateLegalLookup(data) {
  const errors = [];
  
  if (!data.pro_se_procedural_rules || !Array.isArray(data.pro_se_procedural_rules)) {
    errors.push('Missing or invalid pro_se_procedural_rules array');
  }
  
  if (!data.ex_parte_notice_rules || !Array.isArray(data.ex_parte_notice_rules)) {
    errors.push('Missing or invalid ex_parte_notice_rules array');
  }
  
  // Validate rule objects
  if (data.pro_se_procedural_rules) {
    data.pro_se_procedural_rules.forEach((rule, index) => {
      if (!rule.rule_number) {
        errors.push(`Rule ${index}: missing rule_number`);
      }
      if (!rule.title) {
        errors.push(`Rule ${index}: missing title`);
      }
      if (!rule.jurisdiction) {
        errors.push(`Rule ${index}: missing jurisdiction`);
      }
    });
  }
  
  return errors;
}

/**
 * Validate rules file structure
 */
function validateRulesFile(data, filename) {
  const errors = [];
  
  if (!data.jurisdiction) {
    errors.push(`${filename}: missing jurisdiction field`);
  }
  
  if (!data.filing_deadlines) {
    errors.push(`${filename}: missing filing_deadlines`);
  }
  
  if (!data.ex_parte_rules) {
    errors.push(`${filename}: missing ex_parte_rules`);
  }
  
  return errors;
}

/**
 * Check for data updates from sources
 * Note: This is a placeholder - actual implementation would need
 * to parse HTML/API responses from official sources
 */
async function checkForUpdates() {
  console.log('\n🔍 Checking for legal data updates...\n');
  
  const updates = {
    checked: new Date().toISOString(),
    sources: {},
    changes: []
  };
  
  // Check each source
  for (const [name, url] of Object.entries(CONFIG.sources)) {
    try {
      console.log(`Checking ${name}...`);
      
      // For API sources, we can check actual data
      if (url.includes('courtlistener.com/api')) {
        const response = await fetchUrl(`${url}/search/?q=*&order_by=-date_created&limit=1`);
        const data = JSON.parse(response);
        updates.sources[name] = {
          status: 'ok',
          lastCheck: new Date().toISOString(),
          available: true
        };
      } else {
        // For web pages, just check accessibility
        await fetchUrl(url);
        updates.sources[name] = {
          status: 'ok',
          lastCheck: new Date().toISOString(),
          available: true
        };
      }
      
      console.log(`  ✓ ${name} is accessible`);
    } catch (error) {
      console.log(`  ✗ ${name} check failed: ${error.message}`);
      updates.sources[name] = {
        status: 'error',
        error: error.message,
        lastCheck: new Date().toISOString()
      };
    }
  }
  
  return updates;
}

/**
 * Generate update report
 */
function generateReport(backupPath, updates) {
  const report = {
    timestamp: new Date().toISOString(),
    backupLocation: backupPath,
    updateCheck: updates,
    filesUpdated: [],
    validationErrors: [],
    recommendations: []
  };
  
  // Check for any manual updates needed
  const legalLookupPath = path.join(CONFIG.dataDir, 'legal_lookup.json');
  if (fs.existsSync(legalLookupPath)) {
    const data = JSON.parse(fs.readFileSync(legalLookupPath, 'utf8'));
    const errors = validateLegalLookup(data);
    
    if (errors.length > 0) {
      report.validationErrors.push({
        file: 'legal_lookup.json',
        errors
      });
      report.recommendations.push('Review and fix validation errors in legal_lookup.json');
    }
  }
  
  // Check rules files
  if (fs.existsSync(CONFIG.rulesDir)) {
    const rulesFiles = fs.readdirSync(CONFIG.rulesDir);
    rulesFiles.forEach(file => {
      if (file.endsWith('.json')) {
        const data = JSON.parse(fs.readFileSync(path.join(CONFIG.rulesDir, file), 'utf8'));
        const errors = validateRulesFile(data, file);
        
        if (errors.length > 0) {
          report.validationErrors.push({
            file: `rules/${file}`,
            errors
          });
        }
      }
    });
  }
  
  // Add recommendations
  if (Object.values(updates.sources).some(s => s.status === 'error')) {
    report.recommendations.push('Some data sources are unavailable. Check network connectivity.');
  }
  
  report.recommendations.push(
    'Review official court websites for recent rule changes',
    'Update ex_parte_notice_rules with new jurisdictions as needed',
    'Consider adding more states to rules directory'
  );
  
  return report;
}

/**
 * Save last update metadata
 */
function saveUpdateMetadata(updates) {
  const metadata = {
    lastUpdate: new Date().toISOString(),
    lastCheck: updates.checked,
    sourcesStatus: updates.sources,
    version: '1.0.0'
  };
  
  fs.writeFileSync(
    CONFIG.lastUpdateFile,
    JSON.stringify(metadata, null, 2)
  );
  
  console.log(`\n💾 Saved update metadata to ${CONFIG.lastUpdateFile}`);
}

/**
 * Main update function
 */
async function runUpdate() {
  console.log('⚖️  LawSage Legal Data Update Script\n');
  console.log('=' .repeat(50));
  
  // Step 1: Create backup
  console.log('\n📦 Creating backup...');
  const backupPath = createBackup();
  console.log(`Backup created at: ${backupPath}`);
  
  // Step 2: Check for updates
  console.log('\n🔍 Checking for updates...');
  const updates = await checkForUpdates();
  
  // Step 3: Generate report
  console.log('\n📊 Generating report...');
  const report = generateReport(backupPath, updates);
  
  // Step 4: Save metadata
  saveUpdateMetadata(updates);
  
  // Step 5: Save report
  const reportPath = path.join(CONFIG.backupDir, `update-report-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
  console.log(`\n📄 Update report saved to: ${reportPath}`);
  
  // Step 6: Print summary
  console.log('\n' + '='.repeat(50));
  console.log('📋 UPDATE SUMMARY\n');
  console.log(`Backup Location: ${backupPath}`);
  console.log(`Sources Checked: ${Object.keys(updates.sources).length}`);
  console.log(`Sources OK: ${Object.values(updates.sources).filter(s => s.status === 'ok').length}`);
  console.log(`Validation Errors: ${report.validationErrors.length}`);
  console.log(`Recommendations: ${report.recommendations.length}`);
  
  if (report.validationErrors.length > 0) {
    console.log('\n⚠️  VALIDATION ERRORS:');
    report.validationErrors.forEach(err => {
      console.log(`  - ${err.file}: ${err.errors.join(', ')}`);
    });
  }
  
  console.log('\n💡 RECOMMENDATIONS:');
  report.recommendations.forEach(rec => console.log(`  • ${rec}`));
  
  console.log('\n✅ Update check complete!\n');
  
  return report;
}

// Run if executed directly
if (require.main === module) {
  runUpdate()
    .then(() => process.exit(0))
    .catch(err => {
      console.error('Update failed:', err);
      process.exit(1);
    });
}

module.exports = { runUpdate, checkForUpdates, createBackup };
