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
 * - DETECTS CHANGES: Compares "Last Updated" dates from official court websites
 * - FLAGS JURISDICTIONS: Marks jurisdictions that need manual review
 *
 * Usage:
 *   npm run update-legal-data
 *   node scripts/update-legal-data.js
 *
 * Environment Variables:
 *   - BROWSERLESS_TOKEN: Optional token for Browserless.io headless browser service
 */

const fs = require('fs');
const path = require('path');
const https = require('https');
const crypto = require('crypto');

// Configuration
const CONFIG = {
  backupDir: path.join(__dirname, '..', 'backups', 'legal-data'),
  dataDir: path.join(__dirname, '..', 'public', 'data'),
  rulesDir: path.join(__dirname, '..', 'public', 'rules'),
  lastUpdateFile: path.join(__dirname, '..', 'public', 'data', 'last-update.json'),
  hashesFile: path.join(__dirname, '..', 'public', 'data', 'content-hashes.json'),
  needsReviewFile: path.join(__dirname, '..', 'public', 'data', 'needs-review.json'),

  // Data sources (official .gov and .edu sources)
  sources: {
    federalRules: 'https://www.uscourts.gov/rules-policies/current-rules-practice-procedure',
    californiaRules: 'https://www.courts.ca.gov/rules.htm',
    newYorkRules: 'https://www.nycourts.gov/rules/',
    texasRules: 'https://www.txcourts.gov/rules/',
    floridaRules: 'https://www.floridasupremecourt.org/Information/Florida-Rules-of-Court',
    pennsylvaniaRules: 'https://www.pacourts.us/courts/supreme-court/rules-of-civil-procedure',

    // Legal information institutes for citation data
    LII: 'https://www.law.cornell.edu',
    CourtListener: 'https://www.courtlistener.com/api/rest/v4'
  },

  // Selectors for extracting "Last Updated" dates from court websites
  dateSelectors: {
    californiaRules: ['.field-name-field-rule-effective-date', '.effective-date', 'time'],
    newYorkRules: ['.effective-date', '[class*="effective"]', 'time'],
    texasRules: ['.effective-date', '[class*="last updated"]', 'time'],
    floridaRules: ['.effective-date', '[class*="updated"]', 'time'],
    pennsylvaniaRules: ['.effective-date', '[class*="updated"]', 'time'],
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
 * Calculate SHA256 hash of content for change detection
 */
function calculateHash(content) {
  return crypto.createHash('sha256').update(content, 'utf8').digest('hex');
}

/**
 * Load existing content hashes
 */
function loadContentHashes() {
  try {
    if (fs.existsSync(CONFIG.hashesFile)) {
      return JSON.parse(fs.readFileSync(CONFIG.hashesFile, 'utf8'));
    }
  } catch (error) {
    console.warn('Failed to load content hashes:', error.message);
  }
  return {};
}

/**
 * Save content hashes
 */
function saveContentHashes(hashes) {
  try {
    fs.writeFileSync(CONFIG.hashesFile, JSON.stringify(hashes, null, 2), 'utf8');
    console.log('Saved content hashes');
  } catch (error) {
    console.warn('Failed to save content hashes:', error.message);
  }
}

/**
 * Load needs-review data
 */
function loadNeedsReview() {
  try {
    if (fs.existsSync(CONFIG.needsReviewFile)) {
      return JSON.parse(fs.readFileSync(CONFIG.needsReviewFile, 'utf8'));
    }
  } catch (error) {
    console.warn('Failed to load needs-review data:', error.message);
  }
  return { jurisdictions: {}, lastCheck: null };
}

/**
 * Save needs-review data
 */
function saveNeedsReview(data) {
  try {
    data.lastCheck = new Date().toISOString();
    fs.writeFileSync(CONFIG.needsReviewFile, JSON.stringify(data, null, 2), 'utf8');
    console.log('Saved needs-review data');
  } catch (error) {
    console.warn('Failed to save needs-review data:', error.message);
  }
}

/**
 * Extract date from HTML content using multiple strategies
 */
function extractDateFromHtml(html, sourceName) {
  const selectors = CONFIG.dateSelectors[sourceName] || [
    '.effective-date',
    '.last-updated',
    '[class*="effective"]',
    '[class*="updated"]',
    'time',
    /[Ll]ast updated[:\s]+(\d{1,2}[\/-]\d{1,2}[\/-]\d{2,4})/,
    /[Ee]ffective[:\s]+(\d{1,2}[\/-]\d{1,2}[\/-]\d{2,4})/,
  ];

  for (const selector of selectors) {
    try {
      // Try regex pattern if it's a string pattern
      if (typeof selector === 'string' && selector.startsWith('/')) {
        const match = selector.match(/^\/(.+)\/([gimuy]*)$/);
        if (match) {
          const regex = new RegExp(match[1], match[2]);
          const dateMatch = html.match(regex);
          if (dateMatch && dateMatch[1]) {
            return normalizeDate(dateMatch[1]);
          }
        }
      } else {
        // Try to find HTML element (simplified - in production would use cheerio/jsdom)
        const classMatch = selector.replace('.', '');
        const pattern = new RegExp(`class=["'][^"']*${classMatch}[^"']*["'][^>]*>([^<]+)<`, 'i');
        const dateMatch = html.match(pattern);
        if (dateMatch && dateMatch[1]) {
          return normalizeDate(dateMatch[1].trim());
        }
      }
    } catch (error) {
      // Continue to next selector
    }
  }

  // Fallback: look for any date pattern in the HTML
  const datePatterns = [
    /\b(\d{1,2}[\/-]\d{1,2}[\/-]\d{2,4})\b/,
    /\b(January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},?\s+\d{4}\b/i,
  ];

  for (const pattern of datePatterns) {
    const match = html.match(pattern);
    if (match) {
      return normalizeDate(match[1] || match[0]);
    }
  }

  return null;
}

/**
 * Normalize date string to ISO format
 */
function normalizeDate(dateStr) {
  if (!dateStr) return null;

  try {
    // Try parsing various date formats
    const formats = [
      // MM/DD/YYYY or MM-DD-YYYY
      /(\d{1,2})[\/-](\d{1,2})[\/-](\d{2,4})/,
      // Month DD, YYYY
      /(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2}),?\s+(\d{4})/i,
    ];

    let date = null;

    // Try MM/DD/YYYY format
    const match1 = dateStr.match(/(\d{1,2})[\/-](\d{1,2})[\/-](\d{2,4})/);
    if (match1) {
      const month = parseInt(match1[1], 10);
      const day = parseInt(match1[2], 10);
      let year = parseInt(match1[3], 10);
      if (year < 100) year += 2000;
      date = new Date(year, month - 1, day);
    }

    // Try Month DD, YYYY format
    if (!date || isNaN(date.getTime())) {
      const match2 = dateStr.match(/(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2}),?\s+(\d{4})/i);
      if (match2) {
        const months = {
          january: 0, february: 1, march: 2, april: 3, may: 4, june: 5,
          july: 6, august: 7, september: 8, october: 9, november: 10, december: 11
        };
        const month = months[match2[1].toLowerCase()];
        const day = parseInt(match2[2], 10);
        const year = parseInt(match2[3], 10);
        date = new Date(year, month, day);
      }
    }

    // Fallback to Date constructor
    if (!date || isNaN(date.getTime())) {
      date = new Date(dateStr);
    }

    if (date && !isNaN(date.getTime())) {
      return date.toISOString().split('T')[0]; // YYYY-MM-DD
    }
  } catch (error) {
    // Ignore parsing errors
  }

  return null;
}

/**
 * Check for rule changes using content hashing
 */
function detectContentChanges(content, sourceName, existingHashes) {
  const newHash = calculateHash(content);
  const oldHash = existingHashes[sourceName];

  if (!oldHash) {
    return { hasChanged: true, reason: 'No previous hash available', newHash };
  }

  const hasChanged = newHash !== oldHash;
  return {
    hasChanged,
    reason: hasChanged ? 'Content hash mismatch' : 'No changes detected',
    oldHash,
    newHash
  };
}

/**
 * Flag jurisdiction for manual review
 */
function flagForReview(jurisdiction, reason, details = {}) {
  const needsReview = loadNeedsReview();

  needsReview.jurisdictions[jurisdiction] = {
    flaggedAt: new Date().toISOString(),
    reason,
    details,
    status: 'pending', // pending, reviewed, resolved
    priority: details.dateChanged ? 'high' : 'medium'
  };

  saveNeedsReview(needsReview);
  console.log(`⚠️  Flagged ${jurisdiction} for review: ${reason}`);
}

/**
 * Fetch URL with headless browser (Browserless.io) for JavaScript-rendered content
 */
async function fetchWithBrowserless(url) {
  const browserlessToken = process.env.BROWSERLESS_TOKEN;

  if (!browserlessToken) {
    // Fallback to simple fetch
    return await fetchUrl(url);
  }

  try {
    const browserlessUrl = `https://chrome.browserless.io/content?token=${browserlessToken}`;

    return new Promise((resolve, reject) => {
      const postData = JSON.stringify({
        url,
        options: {
          waitFor: 2000, // Wait for JavaScript to load
          goto: { timeout: 30000 }
        }
      });

      const req = https.request(browserlessUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(postData)
        }
      }, (res) => {
        if (res.statusCode !== 200) {
          reject(new Error(`Browserless HTTP ${res.statusCode}`));
          return;
        }

        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => resolve(data));
      });

      req.on('error', reject);
      req.write(postData);
      req.end();
    });
  } catch (error) {
    console.warn('Browserless fetch failed, falling back to simple fetch:', error.message);
    return await fetchUrl(url);
  }
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
 * Enhanced with change detection and date extraction
 */
async function checkForUpdates() {
  console.log('\n🔍 Checking for legal data updates...\n');

  const updates = {
    checked: new Date().toISOString(),
    sources: {},
    changes: [],
    flags: []
  };

  // Load existing hashes for change detection
  const existingHashes = loadContentHashes();
  const newHashes = { ...existingHashes };

  // Map source names to jurisdictions
  const jurisdictionMap = {
    californiaRules: 'California',
    newYorkRules: 'New York',
    texasRules: 'Texas',
    floridaRules: 'Florida',
    pennsylvaniaRules: 'Pennsylvania',
    federalRules: 'Federal'
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
        // For web pages, fetch and analyze content
        const content = await fetchWithBrowserless(url);
        
        // Check for content changes
        const changeDetection = detectContentChanges(content, name, existingHashes);
        
        // Extract "Last Updated" date if available
        const extractedDate = extractDateFromHtml(content, name);
        
        // Update hash if content changed
        if (changeDetection.hasChanged) {
          newHashes[name] = changeDetection.newHash;
        }

        const sourceStatus = {
          status: 'ok',
          lastCheck: new Date().toISOString(),
          available: true,
          hasChanged: changeDetection.hasChanged,
          changeReason: changeDetection.reason,
          extractedDate: extractedDate
        };

        // Flag jurisdiction if date changed or content changed significantly
        const jurisdiction = jurisdictionMap[name];
        if (jurisdiction && changeDetection.hasChanged) {
          if (extractedDate) {
            const oldDate = existingHashes[`${name}_date`];
            if (oldDate && extractedDate !== oldDate) {
              flagForReview(jurisdiction, 'Rule effective date changed', {
                oldDate,
                newDate: extractedDate,
                source: name,
                url
              });
              updates.flags.push({
                jurisdiction,
                type: 'date_change',
                oldDate,
                newDate: extractedDate
              });
              console.log(`  ⚠️  Date change detected for ${jurisdiction}: ${oldDate} → ${extractedDate}`);
            }
            newHashes[`${name}_date`] = extractedDate;
          } else {
            // Content changed but no date found - flag for manual review
            flagForReview(jurisdiction, 'Rule content changed (no date found)', {
              source: name,
              url,
              hashChanged: true
            });
            updates.flags.push({
              jurisdiction,
              type: 'content_change',
              source: name
            });
            console.log(`  ⚠️  Content change detected for ${jurisdiction} (no date)`);
          }
        }

        updates.sources[name] = sourceStatus;
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

  // Save updated hashes
  saveContentHashes(newHashes);

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
    recommendations: [],
    flags: updates.flags || []
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

  // Add recommendations based on flags
  if (updates.flags && updates.flags.length > 0) {
    report.recommendations.push(
      `URGENT: ${updates.flags.length} jurisdiction(s) flagged for review due to rule changes`
    );
    updates.flags.forEach(flag => {
      if (flag.type === 'date_change') {
        report.recommendations.push(
          `  • ${flag.jurisdiction}: Rule effective date changed from ${flag.oldDate} to ${flag.newDate}`
        );
      } else if (flag.type === 'content_change') {
        report.recommendations.push(
          `  • ${flag.jurisdiction}: Content changed (check ${flag.source})`
        );
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
  console.log(`Changes Detected: ${updates.flags?.length || 0}`);
  console.log(`Validation Errors: ${report.validationErrors.length}`);
  console.log(`Recommendations: ${report.recommendations.length}`);

  if (report.validationErrors.length > 0) {
    console.log('\n⚠️  VALIDATION ERRORS:');
    report.validationErrors.forEach(err => {
      console.log(`  - ${err.file}: ${err.errors.join(', ')}`);
    });
  }

  if (updates.flags && updates.flags.length > 0) {
    console.log('\n🚩 JURISDICTIONS FLAGGED FOR REVIEW:');
    updates.flags.forEach(flag => {
      if (flag.type === 'date_change') {
        console.log(`  - ${flag.jurisdiction}: Date changed ${flag.oldDate} → ${flag.newDate}`);
      } else if (flag.type === 'content_change') {
        console.log(`  - ${flag.jurisdiction}: Content changed (source: ${flag.source})`);
      }
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
