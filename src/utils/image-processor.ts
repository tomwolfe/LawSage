// utils/image-processor.ts
// Client-side image processing utility for resizing and compressing images before OCR

/**
 * Resizes and compresses an image using the Canvas API with optional grayscaling
 * @param file The image file to process
 * @param maxWidth Maximum width for the resized image (default: 1200)
 * @param quality Quality factor for JPEG compression (default: 0.7)
 * @param grayscale Whether to apply grayscale filter (default: true)
 * @returns Promise resolving to a base64-encoded string of the processed image
 */
export async function resizeAndCompressImage(
  file: File,
  maxWidth: number = 1200,  // Reduced from 1600 to 1200 as per requirements
  quality: number = 0.7,
  grayscale: boolean = true  // Added grayscale option
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

        // Apply grayscale filter if requested
        if (grayscale) {
          // Get image data
          const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
          const data = imageData.data;

          // Convert to grayscale using luminance formula
          for (let i = 0; i < data.length; i += 4) {
            const r = data[i];
            const g = data[i + 1];
            const b = data[i + 2];

            // Calculate grayscale value using luminance formula
            const gray = 0.299 * r + 0.587 * g + 0.114 * b;

            data[i] = gray;       // Red channel
            data[i + 1] = gray;   // Green channel
            data[i + 2] = gray;   // Blue channel
            // Alpha channel (data[i + 3]) remains unchanged
          }

          // Put the modified image data back to canvas
          ctx.putImageData(imageData, 0, 0);
        }

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
 * @param maxWidth Maximum width for the resized image (default: 1200)
 * @returns Promise resolving to a base64-encoded string of the processed image
 */
export async function processImageForOCR(
  file: File,
  maxSize: number = 4.5 * 1024 * 1024,
  maxWidth: number = 1200  // Updated to 1200px as per requirements
): Promise<string> {
  // First, try with default quality and grayscale enabled
  let processedImage = await resizeAndCompressImage(file, maxWidth, 0.7, true);

  // Check if it's still too large
  if (isImageTooLarge(processedImage, maxSize)) {
    // Try with lower quality and grayscale
    processedImage = await resizeAndCompressImage(file, maxWidth, 0.5, true);
  }

  // Check again
  if (isImageTooLarge(processedImage, maxSize)) {
    // Try with even lower quality and grayscale
    processedImage = await resizeAndCompressImage(file, maxWidth, 0.3, true);
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