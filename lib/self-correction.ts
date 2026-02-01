import { CitationCrossChecker } from './citation-cross-checker';
import { ResponseValidator } from './validation';

interface Source {
  title: string | null;
  uri: string | null;
}

interface CorrectionResult {
  text: string;
  sources: Source[];
}

/**
 * Self-Correction Layer to eliminate ghost citations by cross-checking AI-generated references
 * against trusted multi-jurisdictional sources.
 */
export class SelfCorrectionLayer {
  /**
   * Corrects the AI response by verifying citations and improving accuracy
   * @param text The original AI-generated text
   * @param sources Original sources from the AI response
   * @param jurisdiction The jurisdiction for verification
   * @returns Corrected text and sources
   */
  static async correctResponse(
    text: string,
    sources: Source[],
    jurisdiction: string
  ): Promise<CorrectionResult> {
    // Extract citations from the text
    const citations = CitationCrossChecker.extractCitations(text);
    
    if (citations.length === 0) {
      // If no citations found, return original content
      return { text, sources };
    }

    // Get the API key from environment or request
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      console.warn('No Gemini API key found for citation verification. Returning original content.');
      return { text, sources };
    }

    try {
      // Verify citations using the CitationCrossChecker
      const verificationResults = await CitationCrossChecker.verifyCitations(
        citations,
        jurisdiction,
        apiKey
      );

      // Create a map of citation to verification result
      const citationMap = new Map(
        verificationResults.map(result => [result.citation, result])
      );

      // Update the text to reflect citation verification status
      let correctedText = text;
      
      for (const [originalCitation, verificationResult] of citationMap.entries()) {
        // Replace citation in text with verification status if needed
        // For now, we'll append verification status to citations in the text
        if (!verificationResult.is_verified) {
          // Mark unverified citations
          correctedText = correctedText.replace(
            new RegExp(originalCitation.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'),
            `${originalCitation} [UNVERIFIED - CITATION MAY BE INCORRECT]`
          );
        }
      }

      // Add verification summary to the end of the text
      const verificationSummary = `\n\n---\nVERIFICATION SUMMARY:\n${verificationResults
        .map(result => 
          `- ${result.citation}: ${result.is_verified ? 'VERIFIED' : 'UNVERIFIED'}`
        )
        .join('\n')}\n---\n`;

      correctedText += verificationSummary;

      // Update sources if needed based on verification
      const updatedSources = [...sources];

      // Add verification sources to the sources list
      verificationResults.forEach(result => {
        if (result.verification_source && !updatedSources.some(s => s.title === result.verification_source)) {
          updatedSources.push({
            title: `Verification: ${result.citation}`,
            uri: null
          });
        }
      });

      return {
        text: correctedText,
        sources: updatedSources
      };
    } catch (error) {
      console.error('Error during self-correction process:', error);
      // If correction fails, return original content to ensure response is still delivered
      return { text, sources };
    }
  }

  /**
   * Performs a secondary verification call to Gemini 2.5 search tool
   * to confirm citation existence
   */
  static async secondaryVerification(
    text: string,
    jurisdiction: string,
    apiKey: string
  ): Promise<{ text: string; confidence: number }> {
    // Extract citations from the text
    const citations = CitationCrossChecker.extractCitations(text);
    
    if (citations.length === 0) {
      return { text, confidence: 1.0 }; // High confidence if no citations to verify
    }

    try {
      // Verify citations using the CitationCrossChecker
      const verificationResults = await CitationCrossChecker.verifyCitations(
        citations,
        jurisdiction,
        apiKey
      );

      // Calculate confidence based on verification results
      const verifiedCount = verificationResults.filter(r => r.is_verified).length;
      const totalCitations = verificationResults.length;
      const confidence = totalCitations > 0 ? verifiedCount / totalCitations : 1.0;

      // Update the text to reflect verification status
      let updatedText = text;
      
      for (const result of verificationResults) {
        if (!result.is_verified) {
          updatedText = updatedText.replace(
            new RegExp(result.citation.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'),
            `${result.citation} [UNVERIFIED - CITATION MAY BE INCORRECT - NEEDS HUMAN REVIEW]`
          );
        }
      }

      return { text: updatedText, confidence };
    } catch (error) {
      console.error('Error during secondary verification:', error);
      // Return original text with low confidence if verification fails
      return { text, confidence: 0.5 };
    }
  }

  /**
   * Performs a comprehensive self-correction cycle
   */
  static async comprehensiveCorrection(
    text: string,
    sources: Source[],
    jurisdiction: string
  ): Promise<CorrectionResult> {
    // Get the API key from environment
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      console.warn('No Gemini API key found for comprehensive correction. Returning original content.');
      return { text, sources };
    }

    try {
      // First, perform basic correction
      const basicCorrection = await this.correctResponse(text, sources, jurisdiction);
      
      // Then, perform secondary verification
      const secondaryResult = await this.secondaryVerification(
        basicCorrection.text,
        jurisdiction,
        apiKey
      );

      // If confidence is low, suggest human review
      let finalText = secondaryResult.text;
      if (secondaryResult.confidence < 0.7) {
        finalText += `\n\n⚠️  WARNING: This response has low citation verification confidence (${Math.round(secondaryResult.confidence * 100)}%). Please review citations carefully before relying on this information. ⚠️`;
      }

      return {
        text: finalText,
        sources: basicCorrection.sources
      };
    } catch (error) {
      console.error('Error during comprehensive correction:', error);
      // If correction fails, return original content to ensure response is still delivered
      return { text, sources };
    }
  }
}