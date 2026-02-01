// utils/image-processor.ts
// Client-side image processing utility for resizing and compressing images before OCR

/**
 * Resizes and compresses an image using the Canvas API
 * @param file The image file to process
 * @param maxWidth Maximum width for the resized image (default: 1600)
 * @param quality Quality factor for JPEG compression (default: 0.7)
 * @returns Promise resolving to a base64-encoded string of the processed image
 */
export async function resizeAndCompressImage(
  file: File,
  maxWidth: number = 1600,
  quality: number = 0.7
): Promise<string> {
  return new Promise((resolve, reject) => {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    
    if (!ctx) {
      reject(new Error('Could not get 2D context from canvas'));
      return;
    }

    const img = new Image();
    img.onload = () => {
      try {
        // Calculate dimensions maintaining aspect ratio
        let { width, height } = img;
        
        if (width > maxWidth) {
          const aspectRatio = height / width;
          width = maxWidth;
          height = Math.round(width * aspectRatio);
        }
        
        // Set canvas dimensions
        canvas.width = width;
        canvas.height = height;
        
        // Draw image on canvas
        ctx.drawImage(img, 0, 0, width, height);
        
        // Convert to data URL with specified quality
        const dataUrl = canvas.toDataURL('image/jpeg', quality);
        
        resolve(dataUrl);
      } catch (error) {
        reject(error);
      } finally {
        // Clean up
        img.src = '';
      }
    };
    
    img.onerror = (error) => {
      reject(error);
    };
    
    // Load the image
    const reader = new FileReader();
    reader.onload = (e) => {
      img.src = e.target?.result as string;
    };
    reader.onerror = (error) => {
      reject(error);
    };
    reader.readAsDataURL(file);
  });
}

/**
 * Gets the size of a base64-encoded image in bytes
 * @param base64String The base64-encoded image string
 * @returns Size in bytes
 */
export function getImageSize(base64String: string): number {
  // Remove the data URL prefix if present
  const base64Data = base64String.includes(',') ? base64String.split(',')[1] : base64String;
  
  // Calculate approximate size (base64 increases size by ~33%)
  return Math.round((base64Data.length * 3) / 4);
}

/**
 * Checks if an image exceeds the size limit (4.5MB for Vercel)
 * @param base64String The base64-encoded image string
 * @param maxSize Maximum allowed size in bytes (default: 4.5MB)
 * @returns Boolean indicating if the image exceeds the size limit
 */
export function isImageTooLarge(base64String: string, maxSize: number = 4.5 * 1024 * 1024): boolean {
  const size = getImageSize(base64String);
  return size > maxSize;
}

/**
 * Processes an image file by resizing and compressing it to fit within size limits
 * @param file The image file to process
 * @param maxSize Maximum allowed size in bytes (default: 4.5MB)
 * @param maxWidth Maximum width for the resized image (default: 1600)
 * @returns Promise resolving to a base64-encoded string of the processed image
 */
export async function processImageForOCR(
  file: File,
  maxSize: number = 4.5 * 1024 * 1024,
  maxWidth: number = 1600
): Promise<string> {
  // First, try with default quality
  let processedImage = await resizeAndCompressImage(file, maxWidth, 0.7);
  
  // Check if it's still too large
  if (isImageTooLarge(processedImage, maxSize)) {
    // Try with lower quality
    processedImage = await resizeAndCompressImage(file, maxWidth, 0.5);
  }
  
  // Check again
  if (isImageTooLarge(processedImage, maxSize)) {
    // Try with even lower quality
    processedImage = await resizeAndCompressImage(file, maxWidth, 0.3);
  }
  
  // Final check - if still too large, throw an error
  if (isImageTooLarge(processedImage, maxSize)) {
    throw new Error(`Processed image is still too large: ${(getImageSize(processedImage) / (1024 * 1024)).toFixed(2)} MB. Maximum allowed: ${(maxSize / (1024 * 1024)).toFixed(2)} MB.`);
  }
  
  return processedImage;
}

/**
 * Converts a File object to a base64 string without processing
 * @param file The file to convert
 * @returns Promise resolving to a base64-encoded string
 */
export function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = error => reject(error);
  });
}