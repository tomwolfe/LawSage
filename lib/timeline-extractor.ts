/**
 * Service for extracting chronological timelines from discovery documents
 */

interface TimelineEvent {
  date: string;
  event: string;
  description: string;
  parties_involved: string[];
  document_reference?: string;
}

interface TimelineExtractionResult {
  events: TimelineEvent[];
  summary: string;
  key_dates: string[];
}

export class TimelineExtractor {
  /**
   * Extracts a chronological timeline from discovery documents
   * @param documents Array of document texts to analyze
   * @returns Structured timeline with events in chronological order
   */
  static extractTimeline(documents: string[]): TimelineExtractionResult {
    const events: TimelineEvent[] = [];
    const keyDates: string[] = [];
    
    // Regular expressions for date patterns
    const datePatterns = [
      /\b(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})\b/g,           // MM/DD/YYYY or MM-DD-YYYY
      /\b(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2}),?\s+(\d{4})\b/gi,
      /\b(\d{4})-(\d{2})-(\d{2})\b/g,                        // YYYY-MM-DD
      /\b(\d{1,2})\s+(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{4})\b/gi,
    ];
    
    // Patterns for identifying parties
    const partyPatterns = [
      /\b(plaintiff|defendant|petitioner|respondent|appellant|appellee)\b/gi,
      /\bvs\.?|v\.?\b/gi, // versus markers
    ];
    
    // Process each document
    documents.forEach((doc, docIndex) => {
      // Extract dates
      for (const pattern of datePatterns) {
        const matches = doc.match(pattern) || [];
        matches.forEach(match => {
          const cleanDate = match.trim();
          if (!keyDates.includes(cleanDate)) {
            keyDates.push(cleanDate);
          }
        });
      }
      
      // Extract events and create timeline entries
      const sentences = this.splitIntoSentences(doc);
      sentences.forEach(sentence => {
        const dateMatch = this.findDateInSentence(sentence, datePatterns);
        if (dateMatch) {
          const parties = this.extractParties(sentence, partyPatterns);
          const eventDescription = this.sanitizeEventDescription(sentence);
          
          if (eventDescription) {
            events.push({
              date: dateMatch,
              event: this.classifyEventType(eventDescription),
              description: eventDescription,
              parties_involved: parties,
              document_reference: `Document ${docIndex + 1}`
            });
          }
        }
      });
    });
    
    // Sort events chronologically
    this.sortEventsChronologically(events);
    
    // Create summary
    const summary = this.createTimelineSummary(events);
    
    return {
      events,
      summary,
      key_dates: keyDates.sort(this.compareDates)
    };
  }
  
  /**
   * Splits text into sentences for processing
   */
  private static splitIntoSentences(text: string): string[] {
    // Split on sentence-ending punctuation
    return text
      .split(/(?<!\w\.\w.)(?<![A-Z][a-z].)(?<=\.|\!|\?)\s+/g)
      .map(s => s.trim())
      .filter(s => s.length > 0);
  }
  
  /**
   * Finds a date in a sentence
   */
  private static findDateInSentence(sentence: string, datePatterns: RegExp[]): string | null {
    for (const pattern of datePatterns) {
      const match = sentence.match(pattern);
      if (match) {
        return match[0].trim();
      }
    }
    return null;
  }
  
  /**
   * Extracts parties mentioned in a sentence
   */
  private static extractParties(sentence: string, partyPatterns: RegExp[]): string[] {
    const parties: string[] = [];
    const lowerSentence = sentence.toLowerCase();
    
    for (const pattern of partyPatterns) {
      const matches = lowerSentence.match(pattern) || [];
      matches.forEach(match => {
        const cleanMatch = match.trim();
        if (!parties.includes(cleanMatch)) {
          parties.push(cleanMatch);
        }
      });
    }
    
    return parties;
  }
  
  /**
   * Sanitizes event description by removing noise
   */
  private static sanitizeEventDescription(description: string): string {
    // Remove leading/trailing whitespace and common prefixes
    let cleanDesc = description.trim();
    
    // Remove common prefixes that don't add meaning
    const prefixes = [
      /^on/i,
      /^according to/i,
      /^the/i,
      /^a/i,
      /^an/i
    ];
    
    for (const prefix of prefixes) {
      cleanDesc = cleanDesc.replace(prefix, '').trim();
    }
    
    // Capitalize first letter
    if (cleanDesc.length > 0) {
      cleanDesc = cleanDesc.charAt(0).toUpperCase() + cleanDesc.slice(1);
    }
    
    return cleanDesc;
  }
  
  /**
   * Classifies the type of event based on keywords
   */
  private static classifyEventType(description: string): string {
    const lowerDesc = description.toLowerCase();
    
    // Common legal event types
    if (lowerDesc.includes('filed') || lowerDesc.includes('submitted')) {
      return 'Filing';
    } else if (lowerDesc.includes('served') || lowerDesc.includes('service')) {
      return 'Service';
    } else if (lowerDesc.includes('motion') || lowerDesc.includes('brief')) {
      return 'Motion/Filing';
    } else if (lowerDesc.includes('hearing') || lowerDesc.includes('trial') || lowerDesc.includes('court')) {
      return 'Court Proceeding';
    } else if (lowerDesc.includes('agreement') || lowerDesc.includes('contract')) {
      return 'Agreement';
    } else if (lowerDesc.includes('payment') || lowerDesc.includes('money') || lowerDesc.includes('fee')) {
      return 'Financial Transaction';
    } else if (lowerDesc.includes('meeting') || lowerDesc.includes('conference')) {
      return 'Meeting/Conference';
    } else if (lowerDesc.includes('discovery') || lowerDesc.includes('deposition')) {
      return 'Discovery';
    } else if (lowerDesc.includes('settlement') || lowerDesc.includes('resolution')) {
      return 'Settlement';
    } else {
      return 'General Event';
    }
  }
  
  /**
   * Sorts events chronologically
   */
  private static sortEventsChronologically(events: TimelineEvent[]): void {
    events.sort((a, b) => {
      return this.compareDateString(a.date, b.date);
    });
  }
  
  /**
   * Compares two date strings
   */
  private static compareDateString(dateStr1: string, dateStr2: string): number {
    try {
      const date1 = new Date(dateStr1);
      const date2 = new Date(dateStr2);
      
      // If dates are invalid, try to parse them differently
      if (isNaN(date1.getTime())) {
        // Try to parse MM/DD/YYYY format
        const parts1 = dateStr1.split(/[\/\-]/);
        if (parts1.length === 3) {
          const [month, day, year] = parts1;
          const paddedMonth = month.padStart(2, '0');
          const paddedDay = day.padStart(2, '0');
          const paddedYear = year.length === 2 ? `20${year}` : year;
          const reformattedDate1 = `${paddedYear}-${paddedMonth}-${paddedDay}`;
          return this.compareDateString(reformattedDate1, dateStr2);
        }
      }
      
      if (isNaN(date2.getTime())) {
        // Try to parse MM/DD/YYYY format
        const parts2 = dateStr2.split(/[\/\-]/);
        if (parts2.length === 3) {
          const [month, day, year] = parts2;
          const paddedMonth = month.padStart(2, '0');
          const paddedDay = day.padStart(2, '0');
          const paddedYear = year.length === 2 ? `20${year}` : year;
          const reformattedDate2 = `${paddedYear}-${paddedMonth}-${paddedDay}`;
          return this.compareDateString(dateStr1, reformattedDate2);
        }
      }
      
      return date1.getTime() - date2.getTime();
    } catch (e) {
      // If all parsing fails, sort alphabetically
      return dateStr1.localeCompare(dateStr2);
    }
  }
  
  /**
   * Compares dates for sorting
   */
  private static compareDates(dateStr1: string, dateStr2: string): number {
    return this.compareDateString(dateStr1, dateStr2);
  }
  
  /**
   * Creates a summary of the timeline
   */
  private static createTimelineSummary(events: TimelineEvent[]): string {
    if (events.length === 0) {
      return "No significant events were identified in the provided documents.";
    }
    
    const eventCount = events.length;
    const firstEvent = events[0];
    const lastEvent = events[events.length - 1];
    
    return `Timeline Summary: ${eventCount} events identified spanning from ${firstEvent.date} to ${lastEvent.date}. Key events include ${firstEvent.event} on ${firstEvent.date} and ${lastEvent.event} on ${lastEvent.date}.`;
  }
}