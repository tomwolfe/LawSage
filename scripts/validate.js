#!/usr/bin/env node
/**
 * Pre-commit Validation Script
 * 
 * Validates data integrity, schema consistency, and coding standards
 * before commits are accepted. Prevents data redundancy and schema drift.
 * 
 * Usage: node scripts/validate.js
 *        Add to .husky/pre-commit: npm run validate
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.join(__dirname, '..');

// ANSI colors for output
const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
};

let errors = 0;
let warnings = 0;

function log(message, color = colors.reset) {
  console.log(`${color}${message}${colors.reset}`);
}

function error(message) {
  log(`❌ ERROR: ${message}`, colors.red);
  errors++;
}

function warn(message) {
  log(`⚠️  WARNING: ${message}`, colors.yellow);
  warnings++;
}

function success(message) {
  log(`✅ ${message}`, colors.green);
}

function info(message) {
  log(`ℹ️  ${message}`, colors.cyan);
}

/**
 * Validate rules files structure and consistency
 */
function validateRulesFiles() {
  info('Validating rules files...');
  
  const rulesDir = path.join(ROOT_DIR, 'public', 'rules');
  
  if (!fs.existsSync(rulesDir)) {
    error('Rules directory not found: public/rules');
    return;
  }
  
  const files = fs.readdirSync(rulesDir).filter(f => f.endsWith('.json'));
  const stateCodes = new Set();
  const jurisdictionNames = new Set();
  
  for (const file of files) {
    const filePath = path.join(rulesDir, file);
    
    try {
      const content = fs.readFileSync(filePath, 'utf8');
      const rules = JSON.parse(content);
      
      // Check required fields
      if (!rules.jurisdiction) {
        error(`${file}: Missing "jurisdiction" field`);
      } else {
        jurisdictionNames.add(rules.jurisdiction);
      }
      
      if (!rules.state_code) {
        error(`${file}: Missing "state_code" field (must be ISO-3166-2)`);
      } else if (!/^[A-Z]{2}$/.test(rules.state_code)) {
        error(`${file}: state_code "${rules.state_code}" must be 2 uppercase letters (ISO-3166-2)`);
      } else {
        // Check for duplicate state codes
        if (stateCodes.has(rules.state_code)) {
          error(`${file}: Duplicate state_code "${rules.state_code}"`);
        }
        stateCodes.add(rules.state_code);
      }
      
      // Check filing_deadlines exists
      if (!rules.filing_deadlines) {
        error(`${file}: Missing "filing_deadlines" field`);
      }
      
      // Check filename matches state_code
      const expectedFilename = `${rules.state_code}.json`;
      if (file !== expectedFilename) {
        // Check if it's federal
        if (!(file === 'federal.json' && rules.state_code === 'US')) {
          warn(`${file}: Filename should be ${expectedFilename} to match state_code`);
        }
      }
      
      // Validate state_code matches jurisdiction
      const jurisdictionLower = (rules.jurisdiction || '').toLowerCase();
      const codeLower = (rules.state_code || '').toLowerCase();
      
      const aliasMap = {
        'california': 'ca',
        'new york': 'ny',
        'texas': 'tx',
        'florida': 'fl',
        'illinois': 'il',
        'pennsylvania': 'pa',
        'ohio': 'oh',
        'georgia': 'ga',
      };
      
      if (aliasMap[jurisdictionLower] && aliasMap[jurisdictionLower] !== codeLower) {
        error(`${file}: state_code "${rules.state_code}" doesn't match jurisdiction "${rules.jurisdiction}"`);
      }
      
    } catch (err) {
      error(`${file}: Invalid JSON - ${err.message}`);
    }
  }
  
  success(`Validated ${files.length} rules file(s)`);
}

/**
 * Validate constants file exists and has required exports
 */
function validateConstants() {
  info('Validating configuration constants...');
  
  const constantsPath = path.join(ROOT_DIR, 'config', 'constants.ts');
  
  if (!fs.existsSync(constantsPath)) {
    error('config/constants.ts not found');
    return;
  }
  
  const content = fs.readFileSync(constantsPath, 'utf8');
  
  const requiredConstants = [
    'RATE_LIMIT',
    'API',
    'CITATION_VERIFICATION',
    'LEGAL_DATA',
  ];
  
  for (const constant of requiredConstants) {
    if (!content.includes(`export const ${constant}`)) {
      error(`constants.ts: Missing required export "${constant}"`);
    }
  }
  
  success('Configuration constants validated');
}

/**
 * Validate middleware exists for server-side rate limiting
 */
function validateMiddleware() {
  info('Validating middleware configuration...');
  
  const middlewarePath = path.join(ROOT_DIR, 'middleware.ts');
  
  if (!fs.existsSync(middlewarePath)) {
    error('middleware.ts not found - server-side rate limiting required');
    return;
  }
  
  const content = fs.readFileSync(middlewarePath, 'utf8');
  
  if (!content.includes('checkRateLimit')) {
    error('middleware.ts: Missing rate limiting implementation');
  }
  
  if (!content.includes('@vercel/kv')) {
    warn('middleware.ts: Consider using Vercel KV for distributed rate limiting');
  }
  
  success('Middleware validated');
}

/**
 * Validate citation verification has strict mode
 */
function validateCitationVerification() {
  info('Validating citation verification...');
  
  const verifyRoutePath = path.join(ROOT_DIR, 'app', 'api', 'verify-citation', 'route.ts');
  
  if (!fs.existsSync(verifyRoutePath)) {
    error('verify-citation route not found');
    return;
  }
  
  const content = fs.readFileSync(verifyRoutePath, 'utf8');
  
  if (!content.includes('strict_mode')) {
    error('verify-citation: Missing strict_mode parameter');
  }
  
  if (!content.includes('STRICT_MODE') && !content.includes('Strict Mode')) {
    error('verify-citation: Missing strict mode implementation');
  }
  
  // Check that AI cannot verify citations
  if (content.includes('is_verified: true') && content.includes('GLM')) {
    warn('verify-citation: Ensure AI fallback never sets is_verified=true');
  }
  
  success('Citation verification validated');
}

/**
 * Check for magic numbers that should be in constants
 */
function validateMagicNumbers() {
  info('Scanning for magic numbers...');
  
  const filesToCheck = [
    'lib/rate-limiter-client.ts',
    'app/api/verify-citation/route.ts',
    'app/api/generate-pdf/route.ts',
  ];
  
  const magicNumberPatterns = [
    /\b60\s*\*\s*60\s*\*\s*1000\b/, // 1 hour in ms
    /\b4\.5\s*\*\s*1024\s*\*\s*1024\b/, // 4.5MB
    /\b1500\s*chars?/i,
    /\b\d+\s*days?\b(?!.*description)/, // Unexplained day counts
  ];
  
  for (const file of filesToCheck) {
    const filePath = path.join(ROOT_DIR, file);
    if (!fs.existsSync(filePath)) continue;
    
    const content = fs.readFileSync(filePath, 'utf8');
    
    for (const pattern of magicNumberPatterns) {
      const matches = content.match(pattern);
      if (matches) {
        warn(`${file}: Found magic number "${matches[0]}" - consider moving to constants.ts`);
      }
    }
  }
  
  success('Magic number scan complete');
}

/**
 * Validate TypeScript compilation readiness
 */
function validateTypeScript() {
  info('Checking TypeScript configuration...');
  
  const tsConfigPath = path.join(ROOT_DIR, 'tsconfig.json');
  
  if (!fs.existsSync(tsConfigPath)) {
    error('tsconfig.json not found');
    return;
  }
  
  try {
    const tsConfig = JSON.parse(fs.readFileSync(tsConfigPath, 'utf8'));
    
    if (!tsConfig.compilerOptions?.strict) {
      warn('tsconfig.json: Consider enabling strict mode for better type safety');
    }
    
    success('TypeScript configuration validated');
  } catch (err) {
    error(`tsconfig.json: Invalid JSON - ${err.message}`);
  }
}

/**
 * Check for sensitive data exposure
 */
function validateSecurity() {
  info('Scanning for security issues...');
  
  const filesToCheck = [
    'middleware.ts',
    'lib/rate-limiter-client.ts',
    'app/api/verify-citation/route.ts',
  ];
  
  for (const file of filesToCheck) {
    const filePath = path.join(ROOT_DIR, file);
    if (!fs.existsSync(filePath)) continue;
    
    const content = fs.readFileSync(filePath, 'utf8');
    
    // Check for API key exposure
    if (content.includes('process.env.GLM_API_KEY') && content.includes('console.log')) {
      warn(`${file}: Ensure API keys are not logged`);
    }
    
    // Check for proper error handling
    if (!content.includes('try') && !content.includes('catch')) {
      warn(`${file}: Consider adding error handling`);
    }
  }
  
  success('Security scan complete');
}

/**
 * Main validation runner
 */
async function runValidations() {
  log('\n' + '='.repeat(60), colors.blue);
  log('  LawSage Pre-commit Validation', colors.blue);
  log('='.repeat(60) + '\n', colors.blue);
  
  validateConstants();
  validateMiddleware();
  validateRulesFiles();
  validateCitationVerification();
  validateMagicNumbers();
  validateTypeScript();
  validateSecurity();
  
  log('\n' + '='.repeat(60), colors.blue);
  
  if (errors > 0) {
    log(`\n❌ Validation FAILED: ${errors} error(s), ${warnings} warning(s)\n`, colors.red);
    process.exit(1);
  } else if (warnings > 0) {
    log(`\n⚠️  Validation PASSED with ${warnings} warning(s)\n`, colors.yellow);
    process.exit(0);
  } else {
    log(`\n✅ Validation PASSED: All checks successful\n`, colors.green);
    process.exit(0);
  }
}

// Run validations
runValidations().catch(err => {
  error(`Validation script error: ${err.message}`);
  process.exit(1);
});
