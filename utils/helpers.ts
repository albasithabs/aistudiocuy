/* tslint:disable */
/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

export async function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = (error) => reject(error);
    reader.readAsDataURL(blob);
  });
}

export function downloadFile(url: string, filename: string) {
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

export function parseAndFormatErrorMessage(e: any, context: string): string {
    const baseMessage = `${context} gagal.`;

    if (typeof e.message !== 'string') {
        return `${baseMessage} Terjadi kesalahan tak terduga.`;
    }

    try {
        const errBody = JSON.parse(e.message);
        const err = errBody.error || {};
        const code = err.code;
        const message = err.message || 'Terjadi kesalahan yang tidak diketahui.';
        const status = err.status;

        // Specific handling for permanent quota exhaustion
        if (code === 429 && status === 'RESOURCE_EXHAUSTED') {
            return `${baseMessage} Kuota API habis. Silakan periksa dasbor Google AI Studio Anda.`;
        }
        
        // General (temporary) rate limiting
        if (code === 429) {
            return `${baseMessage} Batas laju tercapai. Silakan coba lagi sebentar lagi.`;
        }

        if (code === 400 || code === 403) return `${baseMessage} Kunci API tidak valid.`;
        if (code === 500) return `${baseMessage} Terjadi kesalahan server. Silakan coba lagi nanti.`;
        
        return `${baseMessage} Kesalahan: ${message}`;
    } catch (parseErr) {
        // If parsing fails, it's just a plain string message.
        return `${baseMessage} Detail: ${e.message}`;
    }
}

/**
 * Converts raw PCM audio data (Base64) into a playable WAV Blob URL.
 * @param base64Pcm The Base64 encoded string of raw PCM audio data.
 * @param sampleRate The sample rate of the audio, defaults to 24000 for Gemini TTS.
 * @returns A promise that resolves to a WAV Blob URL string.
 */
export function pcmToWavUrl(base64Pcm: string, sampleRate = 24000): Promise<string> {
    return new Promise((resolve) => {
        // Decode base64
        const byteCharacters = atob(base64Pcm);
        const byteNumbers = new Array(byteCharacters.length);
        for (let i = 0; i < byteCharacters.length; i++) {
            byteNumbers[i] = byteCharacters.charCodeAt(i);
        }
        const pcmData = new Uint8Array(byteNumbers);
    
        const numChannels = 1;
        const bitsPerSample = 16; 
        const blockAlign = (numChannels * bitsPerSample) / 8;
        const byteRate = sampleRate * blockAlign;
        const dataSize = pcmData.length;
        const fileSize = 36 + dataSize;
    
        const buffer = new ArrayBuffer(44);
        const view = new DataView(buffer);
    
        const writeString = (view: DataView, offset: number, string: string) => {
            for (let i = 0; i < string.length; i++) {
                view.setUint8(offset + i, string.charCodeAt(i));
            }
        };
    
        writeString(view, 0, 'RIFF');
        view.setUint32(4, fileSize, true);
        writeString(view, 8, 'WAVE');
        writeString(view, 12, 'fmt ');
        view.setUint32(16, 16, true);
        view.setUint16(20, 1, true);
        view.setUint16(22, numChannels, true);
        view.setUint32(24, sampleRate, true);
        view.setUint32(28, byteRate, true);
        view.setUint16(32, blockAlign, true);
        view.setUint16(34, bitsPerSample, true);
        writeString(view, 36, 'data');
        view.setUint32(40, dataSize, true);
    
        const wavBytes = new Uint8Array(44 + pcmData.length);
        wavBytes.set(new Uint8Array(buffer), 0);
        wavBytes.set(pcmData, 44);
    
        const blob = new Blob([wavBytes], { type: 'audio/wav' });
        
        resolve(URL.createObjectURL(blob));
    });
}


/**
 * Wraps an async function with retry logic for 429 errors,
 * incorporating exponential backoff and jitter.
 * @param fn The async function to execute.
 * @param retries The maximum number of retries.
 * @param delayMs The initial delay between retries in milliseconds.
 * @param onRetry A callback function that gets called on each retry attempt.
 * @returns The result of the async function if successful.
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  { retries, delayMs, onRetry }: { retries: number; delayMs: number; onRetry: (attempt: number, error: any) => void }
): Promise<T> {
  let lastError: any;
  for (let attempt = 1; attempt <= retries + 1; attempt++) {
    try {
      return await fn();
    } catch (e: any) {
      lastError = e;
      let isRetryable = false;
      // Check if the error is a structured API error
      if (typeof e.message === 'string') {
        try {
          const errBody = JSON.parse(e.message);
          const errorDetails = errBody?.error || {};
          // Only retry for standard rate limiting (429), not for permanent quota exhaustion.
          if (errorDetails.code === 429 && errorDetails.status !== 'RESOURCE_EXHAUSTED') {
            isRetryable = true;
          }
        } catch (parseErr) {
          // Not a JSON error message, so not a structured API error we can retry.
        }
      }

      if (isRetryable && attempt <= retries) {
        onRetry(attempt, e);
        // Exponential backoff with jitter
        const backoffTime = delayMs * (2 ** (attempt - 1));
        const jitter = Math.random() * 500; // Add up to 0.5s of random delay
        await delay(backoffTime + jitter);
      } else {
        // Not a retryable error or max retries reached, so re-throw
        throw e;
      }
    }
  }
  // This line is technically unreachable but required for TypeScript
  throw lastError;
}

/**
 * Wraps an async function with a generic retry logic for any error.
 */
export async function withGenericRetry<T>(
  fn: () => Promise<T>,
  { retries, delayMs, onRetry }: { retries: number; delayMs: number; onRetry: (attempt: number, error: any) => void }
): Promise<T> {
  let lastError: any;
  for (let attempt = 1; attempt <= retries + 1; attempt++) {
    try {
      return await fn();
    } catch (e: any) {
      lastError = e;
      if (attempt <= retries) {
        onRetry(attempt, e);
        await delay(delayMs);
      } else {
        // Max retries reached, re-throw the last error
        throw e;
      }
    }
  }
  throw lastError; // Should be unreachable
}

/**
 * Sets up drag and drop functionality for a file input.
 * @param dropZone The element that will act as the drop zone.
 * @param fileInput The file input element to associate with the drop zone.
 */
export function setupDragAndDrop(dropZone: HTMLElement | null, fileInput: HTMLInputElement | null): void {
    if (!dropZone || !fileInput) return;

    // Prevent default drag behaviors
    ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
        dropZone.addEventListener(eventName, (e) => {
            e.preventDefault();
            e.stopPropagation();
        }, false);
    });

    // Highlight drop zone when item is dragged over it
    ['dragenter', 'dragover'].forEach(eventName => {
        dropZone.addEventListener(eventName, () => {
            dropZone.classList.add('drag-over');
        }, false);
    });

    ['dragleave', 'drop'].forEach(eventName => {
        dropZone.addEventListener(eventName, () => {
            dropZone.classList.remove('drag-over');
        }, false);
    });

    // Handle dropped files
    dropZone.addEventListener('drop', (e: DragEvent) => {
        const dt = e.dataTransfer;
        if (dt?.files && dt.files.length > 0) {
            fileInput.files = dt.files;
            // Manually trigger the 'change' event so our existing listener handles the file
            const event = new Event('change', { bubbles: true });
            fileInput.dispatchEvent(event);
        }
    }, false);
}