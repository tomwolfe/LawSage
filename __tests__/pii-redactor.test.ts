import { redactPII, safeLog } from '../lib/pii-redactor';

describe('PII Redactor', () => {
  describe('redactPII', () => {
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
