import { redactPII, safeLog } from '../lib/pii-redactor';

describe('PII Redactor', () => {
  describe('redactPII - Pass 1 (Regex)', () => {
    test('should redact email addresses', () => {
      const input = 'Contact me at john.doe@example.com for details';
      const result = redactPII(input);

      expect(result.redacted).toContain('[EMAIL_REDACTED]');
      expect(result.redactedFields).toContain('email');
      expect(result.redacted).not.toContain('john.doe@example.com');
    });

    test('should redact phone numbers in various formats', () => {
      const testCases = [
        'Call me at (123) 456-7890',
        'Call me at 123-456-7890',
        'Call me at 123.456.7890',
        'Call me at 123 456 7890',
        'Call me at 1-123-456-7890',
        'Call me at +1-123-456-7890'
      ];

      for (const input of testCases) {
        const result = redactPII(input);
        expect(result.redacted).toContain('[PHONE_REDACTED]');
        expect(result.redactedFields).toContain('phone');
      }
    });

    test('should redact Social Security Numbers', () => {
      const input = 'My SSN is 123-45-6789';
      const result = redactPII(input);

      expect(result.redacted).toContain('[SSN_REDACTED]');
      expect(result.redactedFields).toContain('ssn');
    });

    test('should redact case numbers', () => {
      const testCases = [
        'Case number 1:22-cv-12345',
        'Reference 22-1234-5678',
        'File ABC-2024-1234'
      ];

      for (const input of testCases) {
        const result = redactPII(input);
        expect(result.redactedFields).toContain('case_number');
      }
    });

    test('should redact street addresses', () => {
      const input = 'I live at 123 Main Street and work at 456 Oak Avenue';
      const result = redactPII(input);

      expect(result.redacted).toContain('[ADDRESS_REDACTED]');
      expect(result.redactedFields).toContain('address');
    });

    test('should redact ZIP codes', () => {
      const input = 'The address is 90210 and also 12345-6789';
      const result = redactPII(input);

      expect(result.redacted).toContain('[ZIP_REDACTED]');
      expect(result.redactedFields).toContain('zip');
    });

    test('should handle multiple PII types in one text', () => {
      const input = 'John Doe lives at 123 Main Street, email john@example.com, phone 123-456-7890, SSN 123-45-6789';
      const result = redactPII(input);

      expect(result.redactedFields.length).toBeGreaterThan(1);
      expect(result.redacted).not.toContain('john@example.com');
      expect(result.redacted).not.toContain('123-456-7890');
      expect(result.redacted).not.toContain('123-45-6789');
    });

    test('should return empty redactedFields when no PII found', () => {
      const input = 'This is a general legal question about contract law';
      const result = redactPII(input);

      expect(result.redactedFields).toHaveLength(0);
      expect(result.redacted).toBe(input);
    });

    test('should redact driver license numbers', () => {
      const input = 'Driver license number A1234567';
      const result = redactPII(input);

      expect(result.redactedFields).toContain('drivers_license');
    });

    test('should redact credit card numbers', () => {
      const input = 'Credit card 1234-5678-9012-3456';
      const result = redactPII(input);

      expect(result.redactedFields).toContain('credit_card');
      expect(result.redacted).toContain('[CC_REDACTED]');
    });

    test('should track pass1Count and pass2Count separately', () => {
      const input = 'Contact john@example.com';
      const result = redactPII(input);

      expect(result.pass1Count).toBeGreaterThan(0);
      expect(result.pass2Count).toBe(0);
    });
  });

  describe('redactPII - Pass 2 (Contextual Entity Recognition)', () => {
    test('should redact relationship + name patterns', () => {
      const input = 'My landlord John refused to fix the heat';
      const result = redactPII(input);

      expect(result.redacted).toContain('[NAME_REDACTED]');
      expect(result.redactedFields).toContain('contextual_name');
      expect(result.redacted).not.toContain('landlord John');
    });

    test('should redact attorney/lawyer names', () => {
      const input = 'The attorney Smith filed the motion';
      const result = redactPII(input);

      expect(result.redacted).toContain('[NAME_REDACTED]');
      expect(result.redactedFields).toContain('contextual_name');
    });

    test('should redact possessive name patterns', () => {
      const input = "John's apartment was flooded";
      const result = redactPII(input);

      expect(result.redacted).toContain('[NAME_REDACTED]');
      expect(result.redactedFields).toContain('possessive_name');
    });

    test('should redact contextual address references', () => {
      const input = 'The property at 123 Oak has code violations';
      const result = redactPII(input);

      // Pass 2 catches this with contextual_address
      expect(result.redacted).toContain('[ADDRESS_REDACTED]');
      expect(result.redactedFields).toContain('contextual_address');
    });

    test('should redact first-person location statements', () => {
      const input = 'I live at Oak Apartments since 2023';
      const result = redactPII(input);

      // This pattern is tricky - "Oak Apartments" may be caught by name redaction
      // The key test is that PII gets redacted, even if by different passes
      expect(result.redactedFields.length).toBeGreaterThan(0);
      expect(result.redacted).not.toContain('Oak Apartments');
    });

    test('should redact contextual phone numbers (short format)', () => {
      const input = 'Call me at 555-1234 for questions';
      const result = redactPII(input);

      // This short format may be caught by pass2
      expect(result.redactedFields.length).toBeGreaterThan(0);
    });

    test('should redact contextual email addresses', () => {
      const input = 'Email me at john.doe@example.com for more info';
      const result = redactPII(input);

      // Full email should be caught by pass1
      expect(result.redacted).toContain('[EMAIL_REDACTED]');
      expect(result.redactedFields).toContain('email');
    });

    test('should handle complex contextual PII', () => {
      const input = "My landlord John Smith owns the property at 456 Elm Street. His phone number is 555-9876 and email is landlord@example.com. I live at the same address.";
      const result = redactPII(input);

      expect(result.pass2Count).toBeGreaterThan(0);
      expect(result.redacted).not.toContain('John Smith');
      expect(result.redacted).not.toContain('456 Elm Street');
    });

    test('should allow disabling Pass 2 for Edge runtime', () => {
      const input = 'My landlord John lives at 123 Main St';
      const resultWithPass2 = redactPII(input, true);
      const resultWithoutPass2 = redactPII(input, false);

      expect(resultWithPass2.pass2Count).toBeGreaterThan(0);
      expect(resultWithoutPass2.pass2Count).toBe(0);
    });
  });

  describe('safeLog', () => {
    test('should log message without PII', () => {
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

      safeLog('This is a safe message');

      expect(consoleSpy).toHaveBeenCalledWith('This is a safe message');
      consoleSpy.mockRestore();
    });

    test('should log message with PII warning', () => {
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

      safeLog('Contact: john@example.com');

      expect(consoleSpy).toHaveBeenCalled();
      const callArg = consoleSpy.mock.calls[0][0] as string;
      expect(callArg).toContain('[PII_REDACTED:');
      expect(callArg).toContain('[EMAIL_REDACTED]');
      consoleSpy.mockRestore();
    });
  });
});
