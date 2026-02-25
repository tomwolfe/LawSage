/**
 * Plain English Translation Hook
 * 
 * Addresses Accessibility Item #6: Plain English Toggle
 * 
 * This hook provides functionality to translate legal content into
 * plain English for better accessibility and comprehension.
 */

import { useState, useCallback } from 'react';

export interface PlainEnglishOptions {
  enabled: boolean;
  preserveCitations?: boolean;
}

interface UsePlainEnglishReturn {
  isPlainEnglish: boolean;
  togglePlainEnglish: () => void;
  setPlainEnglish: (value: boolean) => void;
  translateContent: (content: string) => Promise<string>;
  isTranslating: boolean;
  translatedContent: string | null;
  error: string | null;
}

/**
 * Hook for translating legal content to plain English
 */
export function usePlainEnglish(): UsePlainEnglishReturn {
  const [isPlainEnglish, setIsPlainEnglish] = useState(false);
  const [isTranslating, setIsTranslating] = useState(false);
  const [translatedContent, setTranslatedContent] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const togglePlainEnglish = useCallback(() => {
    setIsPlainEnglish(prev => !prev);
    if (isPlainEnglish) {
      setTranslatedContent(null);
    }
  }, [isPlainEnglish]);

  const setPlainEnglish = useCallback((value: boolean) => {
    setIsPlainEnglish(value);
    if (!value) {
      setTranslatedContent(null);
    }
  }, []);

  const translateContent = useCallback(async (content: string): Promise<string> => {
    if (!isPlainEnglish || !content) {
      return content;
    }

    setIsTranslating(true);
    setError(null);

    try {
      // Try to use an API for translation if available
      const response = await fetch('/api/translate-plain', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content })
      });

      if (response.ok) {
        const data = await response.json();
        const translated = data.translated || content;
        setTranslatedContent(translated);
        return translated;
      }

      // Fallback: Simple client-side transformation
      const plainContent = await simpleClientSideTranslation(content);
      setTranslatedContent(plainContent);
      return plainContent;
    } catch (err) {
      // Fallback to simple client-side transformation
      try {
        const plainContent = await simpleClientSideTranslation(content);
        setTranslatedContent(plainContent);
        return plainContent;
      } catch (fallbackError) {
        const errorMsg = err instanceof Error ? err.message : 'Translation failed';
        setError(errorMsg);
        return content;
      }
    } finally {
      setIsTranslating(false);
    }
  }, [isPlainEnglish]);

  return {
    isPlainEnglish,
    togglePlainEnglish,
    setPlainEnglish,
    translateContent,
    isTranslating,
    translatedContent,
    error
  };
}

/**
 * Simple client-side translation for common legal terms
 * This is a fallback when the API is not available
 */
async function simpleClientSideTranslation(content: string): Promise<string> {
  const legalTerms: Record<string, string> = {
    'plaintiff': 'the person suing',
    'defendant': 'the person being sued',
    'hereby': 'by this document',
    'thereof': 'of that thing',
    'whereas': 'because',
    'pursuant to': 'following',
    'notwithstanding': 'despite',
    'herein': 'in this document',
    'therein': 'in that document',
    'aforementioned': 'mentioned before',
    'shall': 'must',
    'may': 'might',
    'should': 'ought to',
    'in the event that': 'if',
    'prior to': 'before',
    'subsequent to': 'after',
    'commence': 'start',
    'terminate': 'end',
    'reside': 'live',
    'dwelling': 'home',
    'assert': 'claim',
    'commenced': 'started',
    'in lieu of': 'instead of',
    'with respect to': 'about',
    'in regard to': 'about',
    'as to': 'about',
    'jurisdiction': 'court authority',
    'statute': 'law',
    'citation': 'legal reference',
    'motion': 'formal request',
    'complaint': 'legal claim',
    'answer': 'response to claims',
    'discovery': 'information exchange',
    'deposition': 'sworn statement',
    'subpoena': 'court order to appear',
    'remedy': 'legal solution',
    'damages': 'money compensation',
    'injunction': 'court order to stop',
    'affidavit': 'written sworn statement',
    'testimony': 'spoken evidence',
    'verdict': 'court decision',
    'judgment': 'final court decision',
    'appeal': 'request for review',
    'pro se': 'representing yourself',
    'litigant': 'person in a lawsuit',
    'proceeding': 'court case',
    'tribunal': 'court',
    'counsel': 'lawyer',
    'attorney': 'lawyer',
    'counsel for': 'lawyer for',
    'hereunto': 'to this document',
    'wit': 'know',
    'thenceforth': 'from then on',
    'forthwith': 'immediately',
    'hereafter': 'after this time',
    'thereafter': 'after that time',
    'heretofore': 'before now',
    'thereunto': 'to that',
    'ipse dixit': 'unproven claim',
    'prima facie': 'at first glance',
    'res judicata': 'already decided',
    'collateral estoppel': 'already settled',
    'stare decisis': 'follow previous rulings',
    'habeas corpus': 'produce the person',
    'certiorari': 'review request',
    'mandamus': 'court order',
    'quo warranto': 'authority challenge',
  };

  let translated = content;

  // Replace legal terms with plain English
  for (const [legal, plain] of Object.entries(legalTerms)) {
    const regex = new RegExp(`\\b${legal}\\b`, 'gi');
    translated = translated.replace(regex, plain);
  }

  // Simplify complex sentence structures
  translated = simplifySentences(translated);

  return translated;
}

/**
 * Simplify complex legal sentences
 */
function simplifySentences(text: string): string {
  let simplified = text;

  // Remove redundant phrases
  const redundantPhrases = [
    { from: 'at this point in time', to: 'now' },
    { from: 'for the purpose of', to: 'to' },
    { from: 'in order to', to: 'to' },
    { from: 'due to the fact that', to: 'because' },
    { from: 'for the reason that', to: 'because' },
    { from: 'in the matter of', to: 'regarding' },
    { from: 'under the circumstances', to: 'since' },
    { from: 'as a matter of law', to: 'legally' },
    { from: 'it is hereby ordered that', to: 'the court orders' },
    { from: 'hereby orders', to: 'orders' },
    { from: 'notwithstanding the foregoing', to: 'despite this' },
    { from: 'in addition to the above', to: 'also' },
  ];

  for (const { from, to } of redundantPhrases) {
    const regex = new RegExp(from, 'gi');
    simplified = simplified.replace(regex, to);
  }

  // Break up very long sentences (simple heuristic: sentences over 50 words)
  const sentences = simplified.split(/([.!?]+)/);
  const result: string[] = [];

  for (let i = 0; i < sentences.length; i += 2) {
    const sentence = sentences[i];
    const punctuation = sentences[i + 1] || '';

    if (sentence && sentence.split(/\s+/).length > 50) {
      // Try to split at conjunctions
      const split = sentence.split(/\b(and|but|because|although|however|therefore|thus|hence)\b/i);
      if (split.length > 1) {
        result.push(split[0] + '.');
        result.push(split.slice(1).join(' '));
        result.push(punctuation);
        continue;
      }
    }

    result.push(sentence);
    result.push(punctuation);
  }

  return result.join('');
}

export default usePlainEnglish;
