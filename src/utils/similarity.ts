// utils/similarity.ts
// Client-side Cosine Similarity utility for template matching

/**
 * Tokenizes text into individual words, removing punctuation and converting to lowercase
 * @param text The input text to tokenize
 * @returns Array of tokens (words)
 */
export function tokenize(text: string): string[] {
  if (!text) return [];
  
  // Convert to lowercase and split by non-word characters
  return text.toLowerCase()
    .split(/\W+/)
    .filter(token => token.length > 0);
}

/**
 * Creates a term frequency map for the given tokens
 * @param tokens Array of tokens
 * @returns Map of term frequencies
 */
export function termFrequency(tokens: string[]): Map<string, number> {
  const tf = new Map<string, number>();
  
  for (const token of tokens) {
    tf.set(token, (tf.get(token) || 0) + 1);
  }
  
  // Normalize by total number of tokens
  const totalTokens = tokens.length;
  for (const [token, count] of tf.entries()) {
    tf.set(token, count / totalTokens);
  }
  
  return tf;
}

/**
 * Calculates the dot product of two term frequency maps
 * @param tf1 First term frequency map
 * @param tf2 Second term frequency map
 * @returns Dot product value
 */
export function dotProduct(tf1: Map<string, number>, tf2: Map<string, number>): number {
  let product = 0;
  
  for (const [term, freq1] of tf1.entries()) {
    const freq2 = tf2.get(term) || 0;
    product += freq1 * freq2;
  }
  
  return product;
}

/**
 * Calculates the magnitude (Euclidean norm) of a term frequency map
 * @param tf Term frequency map
 * @returns Magnitude of the vector
 */
export function magnitude(tf: Map<string, number>): number {
  let sumOfSquares = 0;
  
  for (const freq of tf.values()) {
    sumOfSquares += Math.pow(freq, 2);
  }
  
  return Math.sqrt(sumOfSquares);
}

/**
 * Calculates cosine similarity between two texts
 * @param text1 First text
 * @param text2 Second text
 * @returns Cosine similarity value between 0 and 1
 */
export function cosineSimilarity(text1: string, text2: string): number {
  if (!text1 || !text2) {
    return 0;
  }
  
  const tokens1 = tokenize(text1);
  const tokens2 = tokenize(text2);
  
  if (tokens1.length === 0 || tokens2.length === 0) {
    return 0;
  }
  
  const tf1 = termFrequency(tokens1);
  const tf2 = termFrequency(tokens2);
  
  const dotProd = dotProduct(tf1, tf2);
  const mag1 = magnitude(tf1);
  const mag2 = magnitude(tf2);
  
  if (mag1 === 0 || mag2 === 0) {
    return 0;
  }
  
  return dotProd / (mag1 * mag2);
}

/**
 * Finds the most similar template from a list of templates based on user input
 * @param userInput The user's input text
 * @param templates Array of template objects with id, title, description, keywords
 * @returns The most similar template object or null if none found
 */
export function findMostSimilarTemplate(userInput: string, templates: Array<{
  id: string;
  title: string;
  description: string;
  keywords: string[];
}>): {
  id: string;
  title: string;
  description: string;
  keywords: string[];
} | null {
  if (!userInput || !templates || templates.length === 0) {
    return null;
  }
  
  let bestMatch = null;
  let highestSimilarity = -1;
  
  // Combine user input with its keywords for better matching
  const userInputWithKeywords = userInput + ' ' + userInput.split(/\W+/).join(' ');
  
  for (const template of templates) {
    // Calculate similarity with title
    const titleSimilarity = cosineSimilarity(userInput, template.title);
    
    // Calculate similarity with description
    const descriptionSimilarity = cosineSimilarity(userInput, template.description);
    
    // Calculate similarity with keywords
    const keywordsText = template.keywords.join(' ');
    const keywordsSimilarity = cosineSimilarity(userInput, keywordsText);
    
    // Weighted average of similarities (titles and keywords might be more important)
    const combinedSimilarity = (titleSimilarity * 0.4) + (descriptionSimilarity * 0.3) + (keywordsSimilarity * 0.3);
    
    if (combinedSimilarity > highestSimilarity) {
      highestSimilarity = combinedSimilarity;
      bestMatch = { ...template, similarity: combinedSimilarity };
    }
  }
  
  return bestMatch;
}

/**
 * Preprocesses text for similarity comparison by removing common stop words
 * @param text The input text to preprocess
 * @returns Preprocessed text
 */
export function preprocessText(text: string): string {
  if (!text) return '';
  
  const stopWords = new Set([
    'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 
    'of', 'with', 'by', 'about', 'as', 'into', 'through', 'during', 'before', 
    'after', 'above', 'below', 'from', 'up', 'down', 'out', 'off', 'over', 
    'under', 'again', 'further', 'then', 'once', 'i', 'me', 'my', 'myself', 
    'we', 'our', 'ours', 'ourselves', 'you', 'your', 'yours', 'yourself', 
    'yourselves', 'he', 'him', 'his', 'himself', 'she', 'her', 'hers', 
    'herself', 'it', 'its', 'itself', 'they', 'them', 'their', 'theirs', 
    'themselves', 'what', 'which', 'who', 'whom', 'this', 'that', 'these', 
    'those', 'am', 'is', 'are', 'was', 'were', 'be', 'been', 'being', 'have', 
    'has', 'had', 'having', 'do', 'does', 'did', 'doing', 'would', 'should', 
    'could', 'ought', 'i\'m', 'you\'re', 'he\'s', 'she\'s', 'it\'s', 'we\'re', 
    'they\'re', 'i\'ve', 'you\'ve', 'we\'ve', 'they\'ve', 'i\'d', 'you\'d', 
    'he\'d', 'she\'d', 'we\'d', 'they\'d', 'i\'ll', 'you\'ll', 'he\'ll', 
    'she\'ll', 'we\'ll', 'they\'ll', 'isn\'t', 'aren\'t', 'wasn\'t', 'weren\'t', 
    'haven\'t', 'hasn\'t', 'hadn\'t', 'doesn\'t', 'don\'t', 'didn\'t', 'won\'t', 
    'wouldn\'t', 'can\'t', 'cannot', 'couldn\'t', 'mustn\'t', 'let\'s', 'that\'s', 
    'who\'s', 'what\'s', 'here\'s', 'there\'s', 'when\'s', 'where\'s', 'why\'s', 
    'how\'s', 'a\'s', 'o\'clock', 'oughtn\'t', 'shan\'t', 'shed', 'shes', 
    'shouldn\'t', 'that\'ll', 'aren', 'couldn', 'hadn', 'hasn', 'haven', 
    'isn', 'ma', 'mightn', 'mustn', 'needn', 'shan', 'shouldn', 'wasn', 'weren', 'won', 'wouldn'
  ]);
  
  return text.toLowerCase()
    .split(/\W+/)
    .filter(token => token.length > 0 && !stopWords.has(token))
    .join(' ');
}