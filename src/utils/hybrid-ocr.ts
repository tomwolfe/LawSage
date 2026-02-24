/**
 * Hybrid OCR Pre-processing Utility
 * 
 * Enhances legal document images before sending to multimodal LLM.
 * Addresses the "Legal Small Print" vulnerability by:
 * 1. Applying image enhancement filters (contrast, sharpening)
 * 2. Detecting document regions (header, body, footer)
 * 3. Creating crops of important regions for focused OCR
 * 
 * This complements the GLM-4V-Flash model with traditional image processing
 * to improve accuracy on small text and degraded documents.
 */

export interface ImageEnhancementOptions {
  /** Increase contrast (0-100, default: 30) */
  contrast?: number;
  /** Sharpen edges for better text clarity (0-100, default: 20) */
  sharpen?: number;
  /** Convert to grayscale (default: true for OCR) */
  grayscale?: boolean;
  /** Threshold for binarization (0-255, default: auto) */
  threshold?: number;
  /** Enhance small text regions (default: true) */
  enhanceSmallText?: boolean;
}

export interface DocumentRegion {
  /** Region type */
  type: 'header' | 'body' | 'footer' | 'case_caption' | 'signature_block';
  /** Bounding box coordinates [x, y, width, height] */
  bbox: [number, number, number, number];
  /** Confidence score (0-1) */
  confidence: number;
}

export interface EnhancedOCRResult {
  /** Enhanced base64 image */
  enhancedImage: string;
  /** Detected document regions */
  regions: DocumentRegion[];
  /** Quality score (0-100) */
  qualityScore: number;
  /** Recommendations for improvement */
  recommendations: string[];
}

/**
 * Convert canvas to base64 string
 */
function canvasToBase64(canvas: HTMLCanvasElement): string {
  return canvas.toDataURL('image/png');
}

/**
 * Convert base64 string to Image object
 */
function base64ToImage(base64: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = base64;
  });
}

/**
 * Create canvas from image
 */
function imageToCanvas(img: HTMLImageElement): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = img.width;
  canvas.height = img.height;
  return canvas;
}

/**
 * Apply contrast adjustment to canvas
 */
function applyContrast(canvas: HTMLCanvasElement, contrast: number): void {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const data = imageData.data;
  
  // Contrast factor: -100 to 100 -> 0 to 2 (centered at 1)
  const factor = (contrast + 100) / 100;

  for (let i = 0; i < data.length; i += 4) {
    // Apply contrast to RGB channels only
    for (let j = 0; j < 3; j++) {
      const value = data[i + j];
      const adjusted = ((value / 255 - 0.5) * factor + 0.5) * 255;
      data[i + j] = Math.max(0, Math.min(255, adjusted));
    }
  }

  ctx.putImageData(imageData, 0, 0);
}

/**
 * Apply sharpening filter using convolution kernel
 */
function applySharpen(canvas: HTMLCanvasElement, amount: number): void {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const width = canvas.width;
  const height = canvas.height;
  const imageData = ctx.getImageData(0, 0, width, height);
  const data = imageData.data;

  // Create a copy of the data
  const copy = new Uint8ClampedArray(data);

  // Sharpen kernel (simplified 3x3)
  // Amount controls the intensity (0-100)
  const strength = amount / 100;
  
  // Simple sharpening: enhance edges by subtracting blurred version
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const idx = (y * width + x) * 4;
      
      for (let c = 0; c < 3; c++) {
        const center = copy[idx + c];
        const neighbors = (
          copy[((y - 1) * width + x) * 4 + c] +
          copy[((y + 1) * width + x) * 4 + c] +
          copy[(y * width + (x - 1)) * 4 + c] +
          copy[(y * width + (x + 1)) * 4 + c]
        ) / 4;
        
        // Sharpen: enhance difference from neighbors
        const sharpened = center + strength * (center - neighbors);
        data[idx + c] = Math.max(0, Math.min(255, sharpened));
      }
    }
  }

  ctx.putImageData(imageData, 0, 0);
}

/**
 * Convert to grayscale
 */
function applyGrayscale(canvas: HTMLCanvasElement): void {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const data = imageData.data;

  for (let i = 0; i < data.length; i += 4) {
    const avg = (data[i] + data[i + 1] + data[i + 2]) / 3;
    data[i] = avg;     // R
    data[i + 1] = avg; // G
    data[i + 2] = avg; // B
  }

  ctx.putImageData(imageData, 0, 0);
}

/**
 * Apply adaptive thresholding for binarization
 */
function applyThreshold(canvas: HTMLCanvasElement, threshold?: number): void {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const data = imageData.data;

  // Auto-threshold using Otsu's method approximation
  let autoThreshold = threshold;
  if (autoThreshold === undefined) {
    // Simple histogram-based auto threshold
    const histogram = new Array(256).fill(0);
    for (let i = 0; i < data.length; i += 4) {
      const gray = data[i]; // Use R channel (already grayscale at this point)
      histogram[gray]++;
    }
    
    // Find threshold at histogram valley
    let maxCount = 0;
    let minCount = Infinity;
    autoThreshold = 128; // Default
    
    for (let i = 0; i < 256; i++) {
      if (histogram[i] > maxCount) {
        maxCount = histogram[i];
      }
      if (histogram[i] < minCount && i > 50 && i < 200) {
        minCount = histogram[i];
        autoThreshold = i;
      }
    }
  }

  // Apply threshold
  for (let i = 0; i < data.length; i += 4) {
    const value = data[i];
    const newValue = value < autoThreshold ? 0 : 255;
    data[i] = newValue;
    data[i + 1] = newValue;
    data[i + 2] = newValue;
  }

  ctx.putImageData(imageData, 0, 0);
}

/**
 * Detect document regions using simple heuristics
 * This is a lightweight alternative to full OCR engines
 */
function detectDocumentRegions(canvas: HTMLCanvasElement): DocumentRegion[] {
  const regions: DocumentRegion[] = [];
  const ctx = canvas.getContext('2d');
  if (!ctx) return regions;

  const width = canvas.width;
  const height = canvas.height;
  const imageData = ctx.getImageData(0, 0, width, height);
  const data = imageData.data;

  // Helper: calculate text density in a region
  function getTextDensity(x: number, y: number, w: number, h: number): number {
    let darkPixels = 0;
    let totalPixels = 0;
    
    for (let dy = 0; dy < h; dy += 4) {
      for (let dx = 0; dx < w; dx += 4) {
        const idx = ((y + dy) * width + (x + dx)) * 4;
        if (idx < data.length) {
          totalPixels++;
          if (data[idx] < 200) { // Dark pixel
            darkPixels++;
          }
        }
      }
    }
    
    return totalPixels > 0 ? darkPixels / totalPixels : 0;
  }

  // Detect header region (top 15% of document, usually has high text density)
  const headerHeight = Math.floor(height * 0.15);
  const headerDensity = getTextDensity(0, 0, width, headerHeight);
  if (headerDensity > 0.1) {
    regions.push({
      type: 'header',
      bbox: [0, 0, width, headerHeight],
      confidence: Math.min(1, headerDensity * 2),
    });
  }

  // Detect case caption (usually in upper third, centered text)
  const captionY = Math.floor(height * 0.1);
  const captionHeight = Math.floor(height * 0.2);
  const captionDensity = getTextDensity(
    Math.floor(width * 0.2),
    captionY,
    Math.floor(width * 0.6),
    captionHeight
  );
  if (captionDensity > 0.15) {
    regions.push({
      type: 'case_caption',
      bbox: [
        Math.floor(width * 0.2),
        captionY,
        Math.floor(width * 0.6),
        captionHeight
      ],
      confidence: Math.min(1, captionDensity * 1.5),
    });
  }

  // Detect body (main content area)
  const bodyY = Math.floor(height * 0.2);
  const bodyHeight = Math.floor(height * 0.6);
  const bodyDensity = getTextDensity(0, bodyY, width, bodyHeight);
  if (bodyDensity > 0.05) {
    regions.push({
      type: 'body',
      bbox: [0, bodyY, width, bodyHeight],
      confidence: Math.min(1, bodyDensity),
    });
  }

  // Detect footer/signature block (bottom 20%)
  const footerY = Math.floor(height * 0.75);
  const footerDensity = getTextDensity(0, footerY, width, height - footerY);
  if (footerDensity > 0.05) {
    regions.push({
      type: footerDensity > 0.2 ? 'signature_block' : 'footer',
      bbox: [0, footerY, width, height - footerY],
      confidence: Math.min(1, footerDensity * 2),
    });
  }

  return regions;
}

/**
 * Calculate image quality score for OCR
 */
function calculateQualityScore(canvas: HTMLCanvasElement): { score: number; recommendations: string[] } {
  const ctx = canvas.getContext('2d');
  const recommendations: string[] = [];
  
  if (!ctx) {
    return { score: 0, recommendations: ['Unable to analyze image'] };
  }

  const width = canvas.width;
  const height = canvas.height;
  const imageData = ctx.getImageData(0, 0, width, height);
  const data = imageData.data;

  let score = 100;

  // Check resolution (penalize if too small)
  const minDimension = Math.min(width, height);
  if (minDimension < 800) {
    score -= 20;
    recommendations.push(`Low resolution (${width}x${height}). Use at least 800px on shortest side.`);
  } else if (minDimension < 1200) {
    score -= 10;
    recommendations.push(`Consider higher resolution for better OCR accuracy.`);
  }

  // Check brightness
  let totalBrightness = 0;
  for (let i = 0; i < data.length; i += 4) {
    totalBrightness += (data[i] + data[i + 1] + data[i + 2]) / 3;
  }
  const avgBrightness = totalBrightness / (data.length / 4);
  
  if (avgBrightness < 100) {
    score -= 20;
    recommendations.push('Image is too dark. Improve lighting or increase exposure.');
  } else if (avgBrightness > 220) {
    score -= 15;
    recommendations.push('Image is too bright. Reduce glare or adjust exposure.');
  }

  // Check contrast (variance in pixel values)
  let variance = 0;
  for (let i = 0; i < data.length; i += 4) {
    const brightness = (data[i] + data[i + 1] + data[i + 2]) / 3;
    variance += Math.pow(brightness - avgBrightness, 2);
  }
  variance /= (data.length / 4);
  const stdDev = Math.sqrt(variance);
  
  if (stdDev < 40) {
    score -= 25;
    recommendations.push('Low contrast. Text may be faded or image is blurry.');
  }

  // Check for blur (simplified - would need more sophisticated analysis in production)
  // High frequency content indicates sharp edges
  let highFrequencyContent = 0;
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const idx = (y * width + x) * 4;
      const prevIdx = ((y - 1) * width + x) * 4;
      const diff = Math.abs(data[idx] - data[prevIdx]);
      highFrequencyContent += diff;
    }
  }
  highFrequencyContent /= (width * height);
  
  if (highFrequencyContent < 15) {
    score -= 20;
    recommendations.push('Image appears blurry. Ensure document is flat and camera is steady.');
  }

  return {
    score: Math.max(0, score),
    recommendations
  };
}

/**
 * Enhance image for OCR processing
 * This is the main entry point for hybrid OCR pre-processing
 */
export async function enhanceImageForOCR(
  base64Image: string,
  options: ImageEnhancementOptions = {}
): Promise<EnhancedOCRResult> {
  const {
    contrast = 30,
    sharpen = 20,
    grayscale = true,
    threshold,
    enhanceSmallText = true,
  } = options;

  // Load image
  const img = await base64ToImage(base64Image);
  let canvas = imageToCanvas(img);
  const ctx = canvas.getContext('2d');
  
  if (!ctx) {
    throw new Error('Unable to get canvas context');
  }

  // Draw image
  ctx.drawImage(img, 0, 0);

  // Apply enhancements in order
  if (grayscale) {
    applyGrayscale(canvas);
  }

  if (contrast !== 0) {
    applyContrast(canvas, contrast);
  }

  if (sharpen !== 0) {
    applySharpen(canvas, sharpen);
  }

  // Apply threshold if specified or if enhanceSmallText is enabled
  if (threshold !== undefined || enhanceSmallText) {
    applyThreshold(canvas, threshold);
  }

  // Detect document regions
  const regions = detectDocumentRegions(canvas);

  // Calculate quality score
  const { score: qualityScore, recommendations } = calculateQualityScore(canvas);

  // Convert to base64
  const enhancedImage = canvasToBase64(canvas);

  return {
    enhancedImage,
    regions,
    qualityScore,
    recommendations,
  };
}

/**
 * Create region crops for focused OCR
 * Returns base64-encoded crops of important regions
 */
export async function createRegionCrops(
  base64Image: string,
  regions: DocumentRegion[]
): Promise<Record<string, string>> {
  const img = await base64ToImage(base64Image);
  const crops: Record<string, string> = {};

  for (const region of regions) {
    const [x, y, w, h] = region.bbox;
    
    // Create canvas for crop
    const cropCanvas = document.createElement('canvas');
    cropCanvas.width = w;
    cropCanvas.height = h;
    const cropCtx = cropCanvas.getContext('2d');
    
    if (!cropCtx) continue;

    // Draw crop region
    cropCtx.drawImage(img, x, y, w, h, 0, 0, w, h);

    // Store crop
    crops[region.type] = cropCanvas.toDataURL('image/png');
  }

  return crops;
}
