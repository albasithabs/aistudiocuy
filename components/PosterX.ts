/* tslint:disable */
/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

// FIX: Import `GenerateContentResponse` for proper typing.
import { GenerateContentResponse } from "@google/genai";
import { blobToDataUrl, downloadFile, parseAndFormatErrorMessage, setupDragAndDrop, withRetry } from "../utils/helpers.ts";
// FIX: Added missing imports that are now available in gemini.ts.
import { generateStyledImage, generateTextFromImage } from "../utils/gemini.ts";

type PosterProState = 'idle' | 'processing' | 'results' | 'error';
type PosterResult = {
    prompt: string;
    status: 'pending' | 'done' | 'error';
    imageUrl: string | null;
    errorMessage?: string;
};

export const PosterPro = {
    // DOM Elements
    view: document.querySelector('#poster-pro-view') as HTMLDivElement,
    inputStateEl: null as HTMLDivElement | null, resultsStateEl: null as HTMLDivElement | null,
    fileInput: null as HTMLInputElement | null, previewImage: null as HTMLImageElement | null,
    uploadLabel: null as HTMLSpanElement | null, 
    resultsGrid: null as HTMLDivElement | null, generateButton: null as HTMLButtonElement | null,
    changePhotoButton: null as HTMLButtonElement | null, startOverButton: null as HTMLButtonElement | null,
    toastContainer: null as HTMLDivElement | null,

    // Inputs
    headlineInput: null as HTMLInputElement | null, subheadlineInput: null as HTMLTextAreaElement | null,
    ctaInput: null as HTMLInputElement | null, categorySelect: null as HTMLSelectElement | null,
    styleSelect: null as HTMLSelectElement | null, aspectRatioGroup: null as HTMLDivElement | null,
    elementsGroup: null as HTMLDivElement | null, customPromptInput: null as HTMLTextAreaElement | null,

    // New Advanced Controls
    logoInput: null as HTMLInputElement | null,
    logoPreviewImage: null as HTMLImageElement | null,
    logoUploadLabel: null as HTMLSpanElement | null,
    fontStyleGroup: null as HTMLDivElement | null,
    fontWeightGroup: null as HTMLDivElement | null,
    textPositionGroup: null as HTMLDivElement | null,
    colorPaletteInput: null as HTMLInputElement | null,
    extractColorButton: null as HTMLButtonElement | null,
    removeBgContainer: null as HTMLDivElement | null,
    removeBgToggle: null as HTMLInputElement | null,

    // State
    state: 'idle' as PosterProState,
    sourceImage: null as { dataUrl: string; base64: string; } | null,
    originalSourceImage: null as { dataUrl: string; base64: string; } | null,
    logoImage: null as { dataUrl: string; base64: string; } | null,
    results: [] as PosterResult[], aspectRatio: '9:16', errorMessage: '',
    fontStyle: 'sans-serif font', fontWeight: 'regular', textPosition: 'centered',
    isBackgroundRemovalActive: false,
    isRemovingBackground: false,

    // Dependencies
    getApiKey: (() => '') as () => string,
    showPreviewModal: ((urls: (string | null)[], startIndex?: number) => {}) as (urls: (string | null)[], startIndex?: number) => void,

    init(dependencies: { getApiKey: () => string; showPreviewModal: (urls: (string | null)[], startIndex?: number) => void; }) {
        if (!this.view) return;

        this.getApiKey = dependencies.getApiKey;
        this.showPreviewModal = dependencies.showPreviewModal;

        this.queryDOMElements();
        if (!this.validateDOMElements()) return;

        this.addEventListeners();
        this.render();
    },

    queryDOMElements() {
        this.inputStateEl = this.view.querySelector('#poster-pro-input-state');
        this.resultsStateEl = this.view.querySelector('#poster-pro-results-state');
        this.fileInput = this.view.querySelector('#poster-pro-file-input');
        this.previewImage = this.view.querySelector('#poster-pro-preview-image');
        this.uploadLabel = this.view.querySelector('#poster-pro-upload-label');
        this.resultsGrid = this.view.querySelector('#poster-pro-results-grid');
        this.generateButton = this.view.querySelector('#poster-pro-generate-button');
        this.changePhotoButton = this.view.querySelector('#poster-pro-change-photo-button');
        this.startOverButton = this.view.querySelector('#poster-pro-start-over-button');
        this.toastContainer = document.querySelector('#toast-container');
        this.headlineInput = this.view.querySelector('#poster-pro-headline-input');
        this.subheadlineInput = this.view.querySelector('#poster-pro-subheadline-input');
        this.ctaInput = this.view.querySelector('#poster-pro-cta-input');
        this.categorySelect = this.view.querySelector('#poster-pro-category-select');
        this.styleSelect = this.view.querySelector('#poster-pro-style-select');
        this.aspectRatioGroup = this.view.querySelector('#poster-pro-aspect-ratio-group');
        this.elementsGroup = this.view.querySelector('#poster-pro-elements-group');
        this.customPromptInput = this.view.querySelector('#poster-pro-custom-prompt');
        // New elements
        this.logoInput = this.view.querySelector('#poster-pro-logo-input');
        this.logoPreviewImage = this.view.querySelector('#poster-pro-logo-preview-image');
        this.logoUploadLabel = this.view.querySelector('#poster-pro-logo-upload-label');
        this.fontStyleGroup = this.view.querySelector('#poster-pro-font-style-group');
        this.fontWeightGroup = this.view.querySelector('#poster-pro-font-weight-group');
        this.textPositionGroup = this.view.querySelector('#poster-pro-text-position-group');
        this.colorPaletteInput = this.view.querySelector('#poster-pro-color-palette-input');
        this.extractColorButton = this.view.querySelector('#poster-pro-extract-color-button');
        this.removeBgContainer = this.view.querySelector('#poster-pro-remove-bg-container');
        this.removeBgToggle = this.view.querySelector('#poster-pro-remove-bg-toggle');
    },

    validateDOMElements(): boolean {
        const requiredElements = [
            this.inputStateEl, this.resultsStateEl, this.fileInput, this.previewImage,
            this.uploadLabel, this.resultsGrid, this.generateButton,
            this.changePhotoButton, this.startOverButton, this.headlineInput, this.subheadlineInput,
            this.ctaInput, this.categorySelect, this.styleSelect, this.aspectRatioGroup,
            this.elementsGroup, this.customPromptInput, this.logoInput, this.logoPreviewImage,
            this.logoUploadLabel, this.fontStyleGroup, this.fontWeightGroup, this.textPositionGroup,
            this.colorPaletteInput, this.extractColorButton, this.removeBgContainer, this.removeBgToggle,
        ];
        if (requiredElements.some(el => !el)) {
            console.error("Poster Pro initialization failed: One or more required elements are missing from the DOM.");
            return false;
        }
        return true;
    },

    addEventListeners() {
        const dropZone = this.fileInput?.closest('.file-drop-zone');
        if (dropZone) setupDragAndDrop(dropZone as HTMLElement, this.fileInput!);
        
        this.fileInput?.addEventListener('change', this.handleUpload.bind(this));
        this.generateButton?.addEventListener('click', this.runGeneration.bind(this));
        this.changePhotoButton?.addEventListener('click', () => this.fileInput?.click());
        this.startOverButton?.addEventListener('click', this.handleStartOver.bind(this));
        
        const logoDropZone = this.logoInput?.closest('.file-drop-zone');
        if (logoDropZone) setupDragAndDrop(logoDropZone as HTMLElement, this.logoInput!);
        this.logoInput?.addEventListener('change', this.handleLogoUpload.bind(this));

        this.extractColorButton?.addEventListener('click', this.handleExtractColor.bind(this));
        // FIX: The `this` context was incorrect for this event listener.
        // It's now correctly bound to the `PosterPro` object.
        this.removeBgToggle?.addEventListener('change', this.handleRemoveBgToggle.bind(this));

        this.fontStyleGroup?.addEventListener('click', (e) => this.handleOptionClick(e, 'single', 'fontStyle'));
        this.fontWeightGroup?.addEventListener('click', (e) => this.handleOptionClick(e, 'single', 'fontWeight'));
        this.textPositionGroup?.addEventListener('click', (e) => this.handleOptionClick(e, 'single', 'textPosition'));
        this.elementsGroup?.addEventListener('click', (e) => this.handleOptionClick(e, 'multiple'));
        
        this.aspectRatioGroup?.addEventListener('click', this.handleAspectRatioClick.bind(this));
        this.resultsGrid?.addEventListener('click', this.handleGridClick.bind(this));
        this.headlineInput?.addEventListener('input', () => this.render());
    },
    
    handleOptionClick(e: MouseEvent, type: 'single' | 'multiple', stateKey?: 'fontStyle' | 'fontWeight' | 'textPosition') {
        const button = (e.target as HTMLElement).closest('.toggle-button');
        const group = (e.target as HTMLElement).closest('.button-group, #poster-pro-elements-group');
        if (button && group) {
            const value = (button as HTMLElement).dataset.value;
            if (type === 'single') {
                group.querySelectorAll('.toggle-button').forEach(btn => btn.classList.remove('active'));
                button.classList.add('active');
                if (stateKey && value) {
                    (this as any)[stateKey] = value;
                }
            } else {
                button.classList.toggle('active');
            }
        }
    },

    handleAspectRatioClick(e: MouseEvent) {
        const button = (e.target as HTMLElement).closest('.toggle-button');
        if (button && this.aspectRatioGroup) {
            this.aspectRatioGroup.querySelectorAll('.toggle-button').forEach(btn => btn.classList.remove('active'));
            button.classList.add('active');
            this.aspectRatio = (button as HTMLElement).dataset.value || '9:16';
        }
    },

    async handleUpload(e: Event) {
        const file = (e.target as HTMLInputElement).files?.[0];
        if (!file) return;

        try {
            const dataUrl = await blobToDataUrl(file);
            const base64 = dataUrl.substring(dataUrl.indexOf(',') + 1);
            this.sourceImage = { dataUrl, base64 };
            this.originalSourceImage = { dataUrl, base64 };
            this.state = 'idle';

            if (this.isBackgroundRemovalActive) {
                this.processBackgroundRemoval();
            } else {
                this.render();
            }

        } catch (error: any) {
            this.state = 'error';
            this.errorMessage = `Error processing file: ${error.message}`;
            this.showToast(this.errorMessage, 'error');
            this.render();
        }
    },

    async handleLogoUpload(e: Event) {
        const file = (e.target as HTMLInputElement).files?.[0];
        if (!file) return;

        try {
            const dataUrl = await blobToDataUrl(file);
            this.logoImage = { dataUrl, base64: dataUrl.substring(dataUrl.indexOf(',') + 1) };
            this.logoPreviewImage!.src = dataUrl;
            this.logoPreviewImage!.style.display = 'block';
            this.logoUploadLabel!.style.display = 'none';
        } catch (error) {
            this.showToast('Gagal memproses file logo.', 'error');
        }
    },

    async handleExtractColor() {
        if (!this.sourceImage) {
            this.showToast('Unggah gambar utama terlebih dahulu untuk mengekstrak warna.', 'info');
            return;
        }

        this.extractColorButton!.disabled = true;
        const originalButtonHTML = this.extractColorButton!.innerHTML;
        this.extractColorButton!.innerHTML = `<div class="loading-clock" style="width: 18px; height: 18px;"></div>`;

        try {
            const prompt = "Describe the main color palette of this image in a short, descriptive phrase for a designer (e.g., 'warm earth tones with a pop of orange', 'cool blues and silver', 'vibrant neon pinks and electric blue').";
            const colorDesc = await generateTextFromImage(prompt, this.sourceImage.base64, this.getApiKey());
            this.colorPaletteInput!.value = colorDesc;
        } catch(e) {
            this.showToast('Gagal mengekstrak warna dari gambar.', 'error');
            console.error("Color extraction failed:", e);
        } finally {
            this.extractColorButton!.disabled = false;
            this.extractColorButton!.innerHTML = originalButtonHTML;
        }
    },

    async handleRemoveBgToggle() {
        this.isBackgroundRemovalActive = this.removeBgToggle!.checked;
        if (this.isBackgroundRemovalActive) {
            if (this.originalSourceImage) {
                await this.processBackgroundRemoval();
            }
        } else {
            // Revert to original if toggle is turned off
            this.sourceImage = this.originalSourceImage;
        }
        this.render();
    },

    async processBackgroundRemoval() {
        if (!this.originalSourceImage) return;

        this.isRemovingBackground = true;
        this.render();
        try {
            const prompt = "Hapus latar belakang gambar ini, sisakan hanya subjek utama. Kembalikan sebagai PNG transparan.";
            const response: GenerateContentResponse = await generateStyledImage(this.originalSourceImage.base64, null, prompt, this.getApiKey());
            const imagePart = response.candidates?.[0]?.content?.parts.find(p => p.inlineData);
            if (imagePart?.inlineData) {
                const dataUrl = `data:${imagePart.inlineData.mimeType};base64,${imagePart.inlineData.data}`;
                this.sourceImage = {
                    dataUrl,
                    base64: imagePart.inlineData.data
                };
            } else {
                throw new Error("Gagal menghapus latar belakang.");
            }
        } catch(e) {
            this.showToast(parseAndFormatErrorMessage(e, 'Gagal menghapus latar belakang'), 'error');
            // Revert on failure
            this.sourceImage = this.originalSourceImage;
            this.removeBgToggle!.checked = false;
            this.isBackgroundRemovalActive = false;
        } finally {
            this.isRemovingBackground = false;
            this.render();
        }
    },

    buildPrompt(): string {
        const selectedElements = Array.from(this.elementsGroup?.querySelectorAll('.toggle-button.active') || [])
            .map(btn => (btn as HTMLElement).dataset.element)
            .join(', ');

        let prompt = `Buat poster iklan yang profesional dan menarik secara visual untuk kategori "${this.categorySelect?.value}" dengan gaya "${this.styleSelect?.value}".\n\n`;

        // Text Content
        prompt += `**Konten Teks:**\n`;
        prompt += `- Headline: "${this.headlineInput?.value || ''}"\n`;
        prompt += `- Sub-headline: "${this.subheadlineInput?.value || ''}"\n`;
        prompt += `- Tombol Call-to-Action (CTA): "${this.ctaInput?.value || ''}"\n`;

        // Visual Style
        prompt += `\n**Gaya Visual:**\n`;
        prompt += `- Tipografi: Gunakan ${this.fontStyle} dengan ketebalan ${this.fontWeight}.\n`;
        prompt += `- Posisi Teks: Atur teks ${this.textPosition} pada poster.\n`;
        if (this.colorPaletteInput?.value) {
            prompt += `- Palet Warna: ${this.colorPaletteInput.value}.\n`;
        }
        if (selectedElements) {
            prompt += `- Elemen Dekoratif: Sertakan ${selectedElements}.\n`;
        }
        if (this.customPromptInput?.value) {
            prompt += `- Instruksi Kustom: ${this.customPromptInput.value}.\n`;
        }

        // Final Instruction
        prompt += `\n**Instruksi Akhir:**\n`;
        prompt += `- Gunakan gambar utama yang disediakan sebagai fokus visual utama.\n`;
        if (this.logoImage) {
            prompt += `- Integrasikan logo yang disediakan secara halus ke dalam desain, biasanya di salah satu sudut.\n`;
        }
        prompt += `- Hasilnya harus berupa poster yang seimbang dan terlihat profesional dengan hierarki visual yang jelas.`;
        
        return prompt;
    },

    async runGeneration() {
        if (!this.sourceImage || !this.headlineInput?.value) return;

        this.state = 'processing';
        const basePrompt = this.buildPrompt();
        this.results = Array(2).fill(0).map(() => ({ prompt: basePrompt, status: 'pending', imageUrl: null }));
        this.render();
        
        const additionalImages = this.logoImage ? [{
            inlineData: { data: this.logoImage.base64, mimeType: 'image/png' }
        }] : [];

        const generationPromises = this.results.map(async (result, index) => {
            try {
                // Add a slight variation for each generation
                const variedPrompt = `${result.prompt} Buat variasi desain unik #${index + 1}.`;
                // FIX: Type the response to avoid property access errors.
                const response: GenerateContentResponse = await withRetry(() => 
                    generateStyledImage(this.sourceImage!.base64, null, variedPrompt, this.getApiKey(), additionalImages), {
                        retries: 2, delayMs: 1000,
                        onRetry: (attempt, err) => console.warn(`Poster generation attempt ${attempt} failed. Retrying...`, err)
                    }
                );

                const imagePart = response.candidates?.[0]?.content?.parts.find(p => p.inlineData);
                if (imagePart?.inlineData) {
                    const imageUrl = `data:${imagePart.inlineData.mimeType};base64,${imagePart.inlineData.data}`;
                    this.results[index] = { ...result, status: 'done', imageUrl };
                } else {
                    // FIX: Correctly access the text part from the response.
                    throw new Error(response.candidates?.[0]?.content?.parts.find(p => p.text)?.text || "Tidak ada data gambar dalam respons.");
                }

            } catch (e: any) {
                this.results[index] = { ...result, status: 'error', errorMessage: parseAndFormatErrorMessage(e, 'Pembuatan poster') };
            } finally {
                this.render();
            }
        });

        await Promise.all(generationPromises);
        this.state = 'results';
        this.render();
    },

    handleGridClick(e: MouseEvent) {
        const target = e.target as HTMLElement;
        const item = target.closest('.image-result-item');
        if (!item) return;

        const index = parseInt((item as HTMLElement).dataset.index!, 10);
        const result = this.results[index];
        if (!result || !result.imageUrl) return;

        const downloadButton = target.closest('.poster-download-button');
        const regenButton = target.closest('.poster-regen-button');

        if (downloadButton) {
            downloadFile(result.imageUrl, `poster-pro-${index + 1}.png`);
        } else if (regenButton) {
            this.regenerateSingle(index);
        } else {
            this.showPreviewModal([result.imageUrl], 0);
        }
    },

    async regenerateSingle(index: number) {
        if (!this.sourceImage) return;

        const resultToRegen = this.results[index];
        resultToRegen.status = 'pending';
        resultToRegen.imageUrl = null;
        this.render();

        try {
            const variedPrompt = `${resultToRegen.prompt} Buat variasi desain unik lainnya.`;
            const additionalImages = this.logoImage ? [{ inlineData: { data: this.logoImage.base64, mimeType: 'image/png' } }] : [];
            
            // FIX: Type the response to avoid property access errors.
            const response: GenerateContentResponse = await withRetry(() => 
                generateStyledImage(this.sourceImage!.base64, null, variedPrompt, this.getApiKey(), additionalImages), {
                    retries: 2, delayMs: 1000, onRetry: () => {}
                }
            );

            const imagePart = response.candidates?.[0]?.content?.parts.find(p => p.inlineData);
            if (imagePart?.inlineData) {
                this.results[index] = { ...resultToRegen, status: 'done', imageUrl: `data:${imagePart.inlineData.mimeType};base64,${imagePart.inlineData.data}` };
            } else {
                throw new Error("Gagal membuat ulang.");
            }
        } catch (e: any) {
            this.results[index] = { ...resultToRegen, status: 'error', errorMessage: parseAndFormatErrorMessage(e, 'Pembuatan ulang') };
        } finally {
            this.render();
        }
    },
    
    handleStartOver() {
        this.state = 'idle';
        this.sourceImage = null;
        this.originalSourceImage = null;
        this.logoImage = null;
        this.results = [];
        this.fileInput!.value = '';
        this.logoInput!.value = '';
        this.headlineInput!.value = '';
        this.subheadlineInput!.value = '';
        this.ctaInput!.value = '';
        this.customPromptInput!.value = '';
        this.colorPaletteInput!.value = '';
        this.removeBgToggle!.checked = false;
        this.isBackgroundRemovalActive = false;
        this.render();
    },

    render() {
        const hasImage = !!this.sourceImage;
        const hasHeadline = !!this.headlineInput?.value.trim();

        this.inputStateEl!.style.display = this.state === 'idle' ? 'block' : 'none';
        this.resultsStateEl!.style.display = this.state !== 'idle' ? 'block' : 'none';

        this.previewImage!.style.display = hasImage ? 'block' : 'none';
        this.uploadLabel!.style.display = hasImage ? 'none' : 'block';
        this.removeBgContainer!.style.display = hasImage ? 'flex' : 'none';

        if(this.isRemovingBackground) {
            (this.fileInput!.closest('.file-drop-zone') as HTMLElement).classList.add('processing');
        } else {
            (this.fileInput!.closest('.file-drop-zone') as HTMLElement).classList.remove('processing');
        }

        if (hasImage) {
            this.previewImage!.src = this.sourceImage!.dataUrl;
        }

        this.generateButton!.disabled = !hasImage || !hasHeadline || this.state === 'processing';

        if (this.state === 'processing' || this.state === 'results') {
            this.resultsGrid!.innerHTML = '';
            this.results.forEach((result, index) => {
                const item = document.createElement('div');
                item.className = 'image-result-item';
                item.dataset.index = String(index);

                let content = '';
                if (result.status === 'pending') {
                    content = '<div class="loading-clock"></div>';
                } else if (result.status === 'error') {
                    content = `<p class="pending-status-text" title="${result.errorMessage}">Gagal</p>`;
                } else if (result.imageUrl) {
                    content = `
                        <img src="${result.imageUrl}" alt="Generated Poster ${index + 1}">
                        <div class="affiliate-result-item-overlay poster-pro-result-actions">
                            <button class="secondary-button poster-download-button">Unduh</button>
                            <button class="secondary-button poster-regen-button">Buat Ulang</button>
                        </div>`;
                }
                item.innerHTML = content;
                this.resultsGrid!.appendChild(item);
            });
        }
    },

    showToast(message: string, type: 'success' | 'error' | 'info' = 'success') {
        if (!this.toastContainer) return;
        const toast = document.createElement('div');
        toast.className = `toast-notification ${type}`;
        toast.textContent = message;
        this.toastContainer.appendChild(toast);
        setTimeout(() => toast.remove(), 3000);
    },
};