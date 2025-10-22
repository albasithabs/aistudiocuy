/* tslint:disable */
/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

// FIX: Import `GenerateContentResponse` for proper typing.
import { GenerateContentResponse } from "@google/genai";
// --- FIX: Import withRetry ---
import { blobToDataUrl, downloadFile, parseAndFormatErrorMessage, setupDragAndDrop, withRetry } from "../utils/helpers.ts";
// FIX: Added missing import that is now available in gemini.ts.
import { generateStyledImage } from "../utils/gemini.ts";

type OutfitProState = 'idle' | 'processing' | 'results' | 'error';

export const OutfitPro = {
    // DOM Elements
    view: document.querySelector('#outfit-pro-view') as HTMLDivElement,
    inputStateEl: null as HTMLDivElement | null, resultsStateEl: null as HTMLDivElement | null,
    fileInput: null as HTMLInputElement | null, previewContainer: null as HTMLDivElement | null,
    generateButton: null as HTMLButtonElement | null, startOverButton: null as HTMLButtonElement | null,
    statusContainer: null as HTMLDivElement | null, statusText: null as HTMLParagraphElement | null,
    
    // Results
    flatlayBox: null as HTMLDivElement | null, modelBox: null as HTMLDivElement | null,
    downloadFlatlayButton: null as HTMLButtonElement | null, downloadModelButton: null as HTMLButtonElement | null,
    
    // State
    state: 'idle' as OutfitProState,
    garmentImages: [] as { file: File, base64: string }[],
    flatlayResultUrl: null as string | null, modelResultUrl: null as string | null,

    // Dependencies
    getApiKey: (() => '') as () => string,
    showPreviewModal: ((urls: (string | null)[], startIndex?: number) => {}) as (urls: (string | null)[], startIndex?: number) => void,

    init(dependencies: { getApiKey: () => string; showPreviewModal: (urls: (string | null)[], startIndex?: number) => void; }) {
        if (!this.view) return;

        this.getApiKey = dependencies.getApiKey;
        this.showPreviewModal = dependencies.showPreviewModal;

        this.queryDOMElements();
        // --- FIX: Add validation after querying elements ---
        if (!this.validateDOMElements()) return;

        this.addEventListeners();
        this.render();
    },

    queryDOMElements() {
        this.inputStateEl = this.view.querySelector('#outfit-pro-input-state');
        this.resultsStateEl = this.view.querySelector('#outfit-pro-results-state');
        this.fileInput = this.view.querySelector('#outfit-pro-input');
        this.previewContainer = this.view.querySelector('#outfit-pro-preview-container');
        this.generateButton = this.view.querySelector('#outfit-pro-generate-button');
        this.startOverButton = this.view.querySelector('#outfit-pro-start-over-button');
        this.statusContainer = this.view.querySelector('#outfit-pro-status-container');
        this.statusText = this.view.querySelector('#outfit-pro-status');
        this.flatlayBox = this.view.querySelector('#outfit-pro-flatlay-box');
        this.modelBox = this.view.querySelector('#outfit-pro-model-box');
        this.downloadFlatlayButton = this.view.querySelector('#outfit-pro-download-flatlay-button');
        this.downloadModelButton = this.view.querySelector('#outfit-pro-download-model-button');
    },
    
    // --- FIX: New validation method ---
    validateDOMElements(): boolean {
        const requiredElements = [
            this.inputStateEl, this.resultsStateEl, this.fileInput, this.previewContainer,
            this.generateButton, this.startOverButton, this.statusContainer, this.statusText,
            this.flatlayBox, this.modelBox, this.downloadFlatlayButton, this.downloadModelButton
        ];
        if (requiredElements.some(el => !el)) {
            console.error("Outfit Pro initialization failed: One or more required elements are missing from the DOM.");
            return false;
        }
        return true;
    },

    addEventListeners() {
        const dropZone = this.fileInput?.closest('.file-drop-zone') as HTMLElement;
        if(dropZone && this.fileInput) {
            setupDragAndDrop(dropZone, this.fileInput);
        }
        
        this.fileInput?.addEventListener('change', this.handleUpload.bind(this));
        this.previewContainer?.addEventListener('click', this.handleRemoveImage.bind(this));
        this.generateButton?.addEventListener('click', this.runGeneration.bind(this));
        this.startOverButton?.addEventListener('click', this.handleStartOver.bind(this));
        this.downloadFlatlayButton?.addEventListener('click', () => this.handleDownload('flatlay'));
        this.downloadModelButton?.addEventListener('click', () => this.handleDownload('model'));
        this.flatlayBox?.addEventListener('click', () => this.handlePreview('flatlay'));
        this.modelBox?.addEventListener('click', () => this.handlePreview('model'));
    },

    render() {
        if (!this.inputStateEl || !this.resultsStateEl || !this.statusContainer || !this.generateButton || !this.downloadFlatlayButton || !this.downloadModelButton || !this.statusText || !this.flatlayBox || !this.modelBox) return;

        this.inputStateEl.style.display = this.state === 'idle' ? 'block' : 'none';
        this.resultsStateEl.style.display = (this.state !== 'idle') ? 'block' : 'none';
        this.statusContainer.style.display = this.state === 'processing' ? 'flex' : 'none';

        this.generateButton.disabled = this.garmentImages.length === 0 || this.state === 'processing';

        if (this.state === 'processing') {
            this.statusText.textContent = 'AI sedang menata pakaian Anda...';
            // --- FIX: Safely access elements after validation ---
            this.flatlayBox.innerHTML = '<div class="loading-clock"></div>';
            this.modelBox.innerHTML = '<div class="loading-clock"></div>';
        }
        
        if (this.state === 'results' || this.state === 'error') {
            this.displayResult(this.flatlayBox, this.flatlayResultUrl, 'Flat lay mockup');
            this.displayResult(this.modelBox, this.modelResultUrl, 'Model try-on');
        }
        
        this.downloadFlatlayButton.disabled = !this.flatlayResultUrl;
        this.downloadModelButton.disabled = !this.modelResultUrl;
    },
    
    displayResult(box: HTMLDivElement | null, url: string | null, alt: string) {
        if (!box) return;
        if (url) {
            box.innerHTML = `<img src="${url}" alt="${alt}" style="width:100%; height:100%; object-fit: cover; cursor: pointer;">`;
        } else {
            box.innerHTML = `<p class="pending-status-text" style="padding: 1rem;">Gagal membuat gambar.</p>`;
        }
    },

    async handleUpload(e: Event) {
        const files = (e.target as HTMLInputElement).files;
        if (!files) return;

        for (const file of Array.from(files)) {
            if (this.garmentImages.length >= 10) break;
            const dataUrl = await blobToDataUrl(file);
            // --- FIX: More robust Base64 parsing ---
            this.garmentImages.push({ file, base64: dataUrl.substring(dataUrl.indexOf(',') + 1) });

            const item = document.createElement('div');
            item.className = 'multi-image-preview-item';
            item.innerHTML = `<img src="${dataUrl}" alt="${file.name}"><button class="remove-image-btn" data-filename="${file.name}">&times;</button>`;
            this.previewContainer?.appendChild(item);
        }
        this.render();
    },

    handleRemoveImage(e: MouseEvent) {
        const target = e.target as HTMLElement;
        if (target.classList.contains('remove-image-btn')) {
            const filename = target.dataset.filename;
            this.garmentImages = this.garmentImages.filter(img => img.file.name !== filename);
            target.parentElement?.remove();
            this.render();
        }
    },

    async runGeneration() {
        if (this.garmentImages.length === 0) return;

        this.state = 'processing';
        this.render();

        const imageParts = this.garmentImages.map(img => ({
            inlineData: { data: img.base64, mimeType: img.file.type }
        }));
        
        const mainImageBase64 = imageParts.shift()!.inlineData.data;
        const additionalImages = imageParts;

        const flatlayPrompt = `Buat komposisi flat lay fotografi produk profesional dari item pakaian yang disediakan. Atur secara artistik di atas latar belakang kain linen berwarna netral yang bersih.`;
        const modelPrompt = `Buat gambar fotorealistik seluruh tubuh dari model fesyen yang mengenakan pakaian yang terdiri dari item-item yang disediakan. Model harus berada dalam suasana studio yang terang dengan latar belakang abu-abu muda.`;

        try {
            // --- FIX: Wrap API calls in withRetry for resilience ---
            const [flatlayResponse, modelResponse] = await Promise.all([
                // FIX: Added missing options object to withRetry call.
                // FIX: Typed the response to avoid property access errors.
                withRetry(() => generateStyledImage(mainImageBase64, null, flatlayPrompt, this.getApiKey, additionalImages), { retries: 2, delayMs: 1000, onRetry: (attempt, err) => console.warn(`Attempt ${attempt} failed for flatlay. Retrying...`, err) }) as Promise<GenerateContentResponse>,
                // FIX: Added missing options object to withRetry call.
                // FIX: Typed the response to avoid property access errors.
                withRetry(() => generateStyledImage(mainImageBase64, null, modelPrompt, this.getApiKey, additionalImages), { retries: 2, delayMs: 1000, onRetry: (attempt, err) => console.warn(`Attempt ${attempt} failed for model. Retrying...`, err) }) as Promise<GenerateContentResponse>
            ]);

            const flatlayPart = flatlayResponse.candidates?.[0]?.content?.parts.find(p => p.inlineData);
            if (flatlayPart?.inlineData) {
                this.flatlayResultUrl = `data:${flatlayPart.inlineData.mimeType};base64,${flatlayPart.inlineData.data}`;
            }

            const modelPart = modelResponse.candidates?.[0]?.content?.parts.find(p => p.inlineData);
            if (modelPart?.inlineData) {
                this.modelResultUrl = `data:${modelPart.inlineData.mimeType};base64,${modelPart.inlineData.data}`;
            }

            this.state = 'results';

        } catch (e: any) {
            console.error("Error generating Outfit Pro mockups:", e);
            this.state = 'error';
            this.flatlayResultUrl = null;
            this.modelResultUrl = null;
        } finally {
            this.render();
        }
    },

    handlePreview(type: 'flatlay' | 'model') {
        const url = type === 'flatlay' ? this.flatlayResultUrl : this.modelResultUrl;
        if (url) {
            this.showPreviewModal([url], 0);
        }
    },

    handleDownload(type: 'flatlay' | 'model') {
        const url = type === 'flatlay' ? this.flatlayResultUrl : this.modelResultUrl;
        if (url) {
            downloadFile(url, `outfit_pro_${type}.png`);
        }
    },

    handleStartOver() {
        this.state = 'idle';
        this.garmentImages = [];
        this.flatlayResultUrl = null;
        this.modelResultUrl = null;
        if(this.fileInput) this.fileInput.value = '';
        if(this.previewContainer) this.previewContainer.innerHTML = '';
        this.render();
    }
};
