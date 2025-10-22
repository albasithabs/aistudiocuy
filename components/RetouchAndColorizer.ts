/* tslint:disable */
/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

// FIX: Import `GenerateContentResponse` for proper typing.
import { GenerateContentResponse } from "@google/genai";
// --- FIX: Import withGenericRetry ---
import { blobToDataUrl, downloadFile, parseAndFormatErrorMessage, withGenericRetry } from "../utils/helpers.ts";
// FIX: Import `generateStyledImage` which is now available.
import { generateStyledImage } from "../utils/gemini.ts";

type RetouchState = 'idle' | 'processing' | 'results' | 'error';

export const RetouchAndColorizer = {
    // DOM Elements - Initialized to null for safe checking
    idleStateEl: null as HTMLDivElement | null,
    activeStateEl: null as HTMLDivElement | null,
    fileInput: null as HTMLInputElement | null,
    originalImage: null as HTMLImageElement | null,
    originalImageBox: null as HTMLDivElement | null,
    resultBox: null as HTMLDivElement | null,
    downloadButton: null as HTMLButtonElement | null,
    startOverButton: null as HTMLButtonElement | null,

    // State
    state: 'idle' as RetouchState,
    sourceImage: null as { dataUrl: string; base64: string; } | null,
    resultImageUrl: null as string | null,
    errorMessage: '',

    // Dependencies
    getApiKey: (() => '') as () => string,
    showPreviewModal: ((urls: (string | null)[], startIndex?: number) => {}) as (urls: (string | null)[], startIndex?: number) => void,

    init(dependencies: { getApiKey: () => string; showPreviewModal: (urls: (string | null)[], startIndex?: number) => void; }) {
        this.getApiKey = dependencies.getApiKey;
        this.showPreviewModal = dependencies.showPreviewModal;

        this.queryDOMElements();
        // --- FIX: Add validation after querying elements ---
        if (!this.validateDOMElements()) return;

        this.addEventListeners();
        this.render();
    },

    queryDOMElements() {
        this.idleStateEl = document.querySelector('#retouch-idle-state');
        this.activeStateEl = document.querySelector('#retouch-active-state');
        this.fileInput = document.querySelector('#retouch-file-input');
        this.originalImage = document.querySelector('#retouch-original-image');
        this.originalImageBox = document.querySelector('#retouch-original-image')?.closest('.retouch-image-box');
        this.resultBox = document.querySelector('#retouch-result-box');
        this.downloadButton = document.querySelector('#retouch-download-button');
        this.startOverButton = document.querySelector('#retouch-start-over-button');
    },

    validateDOMElements(): boolean {
        const requiredElements = [
            this.idleStateEl, this.activeStateEl, this.fileInput, this.originalImage,
            this.originalImageBox, this.resultBox, this.downloadButton, this.startOverButton
        ];
        if (requiredElements.some(el => !el)) {
            console.error("RetouchAndColorizer initialization failed: One or more required elements are missing from the DOM.");
            return false;
        }
        return true;
    },

    addEventListeners() {
        // Now we can safely use ! because validation passed
        this.fileInput!.addEventListener('change', this.handleUpload.bind(this));
        this.downloadButton!.addEventListener('click', this.handleDownload.bind(this));
        this.startOverButton!.addEventListener('click', this.handleStartOver.bind(this));
        
        this.originalImageBox!.addEventListener('click', () => this.handleImageClick(0));
        this.resultBox!.addEventListener('click', () => this.handleImageClick(1));
    },

    render() {
        // With validation, we know these elements exist.
        this.idleStateEl!.style.display = this.state === 'idle' ? 'flex' : 'none';
        this.activeStateEl!.style.display = this.state !== 'idle' ? 'block' : 'none';
        
        if (this.state !== 'idle' && this.sourceImage) {
            this.originalImage!.src = this.sourceImage.dataUrl;
        }

        switch(this.state) {
            case 'processing':
                this.resultBox!.innerHTML = '<div class="loading-clock"></div>';
                this.downloadButton!.disabled = true;
                break;
            case 'results':
                if (this.resultImageUrl) {
                    this.resultBox!.innerHTML = `<img src="${this.resultImageUrl}" alt="Retouched and colorized image" />`;
                    this.downloadButton!.disabled = false;
                }
                break;
            case 'error':
                this.resultBox!.innerHTML = `<p class="pending-status-text" style="padding: 1rem;">${this.errorMessage}</p>`;
                this.downloadButton!.disabled = true;
                break;
        }
    },

    async handleUpload(e: Event) {
        const file = (e.target as HTMLInputElement).files?.[0];
        if (!file) return;

        try {
            const dataUrl = await blobToDataUrl(file);
            this.sourceImage = {
                dataUrl,
                base64: dataUrl.substring(dataUrl.indexOf(',') + 1), // More robust parsing
            };
            this.state = 'processing';
            this.render();
            await this.runGeneration();
        } catch (error: any) {
            this.state = 'error';
            this.errorMessage = `Kesalahan memproses file: ${error.message}`;
            this.render();
        }
    },

    async runGeneration() {
        if (!this.sourceImage) return;

        const prompt = "Tolong pulihkan, tingkatkan, dan warnai foto ini secara realistis. Perbaiki kerusakan apa pun seperti goresan, sobekan, atau pudar. Tingkatkan kejernihan, ketajaman, dan rentang dinamis secara keseluruhan. Jika hitam putih, tambahkan warna yang alami dan sesuai secara historis.";

        try {
            // --- FIX: Wrap API call in withGenericRetry for resilience ---
            // FIX: Added missing options object to withGenericRetry call.
            // FIX: Typed the response to avoid property access errors.
            const response: GenerateContentResponse = await withGenericRetry(() => 
                generateStyledImage(this.sourceImage!.base64, null, prompt, this.getApiKey),
                { retries: 2, delayMs: 1000, onRetry: (attempt, err) => console.warn(`Attempt ${attempt} failed for Retouch. Retrying...`, err) }
            );
            
            const imagePart = response.candidates?.[0]?.content?.parts.find(p => p.inlineData);

            if (imagePart?.inlineData) {
                this.resultImageUrl = `data:${imagePart.inlineData.mimeType};base64,${imagePart.inlineData.data}`;
                this.state = 'results';
            } else {
                // FIX: Correctly access the text part from the response.
                const textPart = response.candidates?.[0]?.content?.parts.find(p => p.text);
                throw new Error(textPart?.text || "Tidak ada data gambar dalam respons. Gambar mungkin diblokir karena alasan keamanan.");
            }
        } catch (e: any) {
            console.error("Error during image retouching:", e);
            this.state = 'error';
            this.errorMessage = parseAndFormatErrorMessage(e, 'Pembuatan gambar');
        } finally {
            this.render();
        }
    },

    handleImageClick(startIndex: number) {
        if (!this.sourceImage) return;
    
        if (this.state === 'results' && this.resultImageUrl) {
            const urls = [this.sourceImage.dataUrl, this.resultImageUrl];
            this.showPreviewModal(urls, startIndex);
        } else if (startIndex === 0) {
            this.showPreviewModal([this.sourceImage.dataUrl], 0);
        }
    },

    handleDownload() {
        if (this.resultImageUrl) {
            downloadFile(this.resultImageUrl, 'retouched_image.png');
        }
    },

    handleStartOver() {
        this.state = 'idle';
        this.sourceImage = null;
        this.resultImageUrl = null;
        this.errorMessage = '';
        if (this.fileInput) this.fileInput.value = '';
        this.render();
    },
};
