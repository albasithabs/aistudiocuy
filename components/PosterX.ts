/* tslint:disable */
/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { blobToDataUrl, downloadFile, parseAndFormatErrorMessage, setupDragAndDrop, withRetry } from "../utils/helpers.ts";
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
    ctaInput: null as HTMLInputElement | null, categoryGroup: null as HTMLDivElement | null,
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

    // State
    state: 'idle' as PosterProState,
    sourceImage: null as { dataUrl: string; base64: string; } | null,
    logoImage: null as { dataUrl: string; base64: string; } | null,
    results: [] as PosterResult[], aspectRatio: '9:16', errorMessage: '',
    fontStyle: 'sans-serif font', fontWeight: 'regular', textPosition: 'centered',

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
        this.categoryGroup = this.view.querySelector('#poster-pro-category-group');
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
    },

    validateDOMElements(): boolean {
        const requiredElements = [
            this.inputStateEl, this.resultsStateEl, this.fileInput, this.previewImage,
            this.uploadLabel, this.resultsGrid, this.generateButton,
            this.changePhotoButton, this.startOverButton, this.headlineInput, this.subheadlineInput,
            this.ctaInput, this.categoryGroup, this.styleSelect, this.aspectRatioGroup,
            this.elementsGroup, this.customPromptInput, this.logoInput, this.logoPreviewImage,
            this.logoUploadLabel, this.fontStyleGroup, this.fontWeightGroup, this.textPositionGroup,
            this.colorPaletteInput, this.extractColorButton
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

        this.categoryGroup?.addEventListener('click', (e) => this.handleOptionClick(e, 'single'));
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
            this.sourceImage = { dataUrl, base64: dataUrl.substring(dataUrl.indexOf(',') + 1) };
            this.state = 'idle';
            this.render();
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
            const colorDesc = await generateTextFromImage(prompt, this.sourceImage.base64, this.getApiKey);
            this.colorPaletteInput!.value = colorDesc;
        } catch(e) {
            this.showToast('Gagal mengekstrak warna dari gambar.', 'error');
            console.error("Color extraction failed:", e);
        } finally {
            this.extractColorButton!.disabled = false;
            this.extractColorButton!.innerHTML = originalButtonHTML;
        }
    },

    render() {
        if (!this.inputStateEl || !this.resultsStateEl || !this.generateButton || !this.resultsGrid) return;

        const hasImage = !!this.sourceImage;
        const hasHeadline = !!this.headlineInput?.value.trim();
        
        this.inputStateEl.style.display = (this.state === 'idle') ? 'block' : 'none';
        this.resultsStateEl.style.display = (this.state !== 'idle') ? 'block' : 'none';

        if (this.previewImage) this.previewImage.style.display = hasImage ? 'block' : 'none';
        if (this.uploadLabel) this.uploadLabel.style.display = hasImage ? 'none' : 'block';
        
        this.generateButton.disabled = !hasImage || !hasHeadline || this.state === 'processing';

        if (hasImage && this.previewImage) {
            this.previewImage.src = this.sourceImage.dataUrl;
        }

        if (['processing', 'results'].includes(this.state)) {
            this.resultsGrid.innerHTML = '';
            this.results.forEach((result, index) => {
                const itemWrapper = document.createElement('div');
                itemWrapper.className = 'image-result-item affiliate-result-item';
                itemWrapper.dataset.index = String(index);

                if (result.status === 'pending') {
                    itemWrapper.innerHTML = `<div class="loading-clock"></div>`;
                } else if (result.status === 'error') {
                    itemWrapper.innerHTML = `<p class="pending-status-text" title="${result.errorMessage}">Gagal</p>`;
                } else if (result.imageUrl) {
                    const previewSVG = `<svg xmlns="http://www.w3.org/2000/svg" height="20px" viewBox="0 0 24 24" width="20px" fill="currentColor"><path d="M0 0h24v24H0V0z" fill="none"/><path d="M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5C21.27 7.61 17 4.5 12 4.5zm0 10c-2.48 0-4.5-2.02-4.5-4.5S9.52 5.5 12 5.5s4.5 2.02 4.5 4.5-2.02 4.5-4.5 4.5zm0-7C10.62 7.5 9.5 8.62 9.5 10s1.12 2.5 2.5 2.5 2.5-1.12 2.5-2.5S13.38 7.5 12 7.5z"/></svg>`;
                    const downloadSVG = `<svg xmlns="http://www.w3.org/2000/svg" height="20px" viewBox="0 0 24 24" width="20px" fill="currentColor"><path d="M0 0h24v24H0V0z" fill="none"/><path d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z"/></svg>`;
                    const regenerateSVG = `<svg xmlns="http://www.w3.org/2000/svg" height="20px" viewBox="0 0 24 24" width="20px" fill="currentColor"><path d="M0 0h24v24H0V0z" fill="none"/><path d="M12.5 8c-2.65 0-5.05.99-6.9 2.6L2 7v9h9l-3.62-3.62c1.39-1.16 3.16-1.88 5.12-1.88 3.54 0 6.55 2.31 7.6 5.5l2.37-.78C21.08 11.03 17.15 8 12.5 8z"/></svg>`;
                    
                    itemWrapper.innerHTML = `
                        <img src="${result.imageUrl}" alt="Generated Poster ${index + 1}" />
                        <div class="affiliate-result-item-overlay">
                            <button class="icon-button poster-pro-preview" title="Pratinjau">${previewSVG}</button>
                            <button class="icon-button poster-pro-download" title="Unduh Poster">${downloadSVG}</button>
                            <button class="icon-button poster-pro-regenerate" title="Buat Ulang">${regenerateSVG}</button>
                        </div>
                    `;
                }
                this.resultsGrid.appendChild(itemWrapper);
            });
        }
    },

    buildPrompt(): string {
        const headline = this.headlineInput?.value.trim() || '';
        const subheadline = this.subheadlineInput?.value.trim() || '';
        const cta = this.ctaInput?.value.trim() || '';
        const category = this.categoryGroup?.querySelector('.toggle-button.active')?.dataset.value || 'Lifestyle';
        const style = this.styleSelect?.value || 'Fun & Colorful';
        const customPrompt = this.customPromptInput?.value.trim() || '';
        const selectedElements = Array.from(this.elementsGroup?.querySelectorAll('.toggle-button.active') || [])
            .map(btn => (btn as HTMLElement).dataset.element).filter(Boolean);
        const colorPalette = this.colorPaletteInput?.value.trim();

        let artDirection = `Poster iklan ${category} dengan gaya visual ${style}. Rasio aspek: ${this.aspectRatio}.`;
        
        let styleInstructions = `Terapkan hierarki tipografi yang jelas. Gunakan ${this.fontWeight} ${this.fontStyle} untuk headline, yang harus menjadi elemen paling menonjol. Posisikan blok teks utama ${this.textPosition}.`;
        
        if (colorPalette) {
            artDirection += `\n- Palet Warna: ${colorPalette}.`;
        }
        if (selectedElements.length > 0) {
            artDirection += `\n- Elemen Dekoratif: ${selectedElements.join(', ')}.`;
        }
        if (this.logoImage) {
            artDirection += `\n- Penempatan Logo: Gambar logo disediakan sebagai gambar tambahan. Tempatkan logo ini dengan baik di salah satu sudut (misalnya, kanan bawah) poster akhir. Pastikan logo terbaca tetapi tidak mengganggu.`;
        }
        if (customPrompt) {
            artDirection += `\n- Instruksi Kustom: ${customPrompt}.`;
        }

        return `**TUGAS POSTER PRO:** Buat poster iklan fotorealistis menggunakan gambar yang disediakan sebagai subjek utama.
        
        **Teks untuk Disertakan:**
        - **Headline:** "${headline}"
        - **Sub-headline/Promo:** "${subheadline}"
        - **Tombol Call-to-Action (CTA):** "${cta}"
        
        **Arahan Artistik:**
        - ${artDirection}
        - ${styleInstructions}
        - Lakukan komposisi ulang subjek utama dari gambar yang disediakan jika diperlukan agar sesuai dengan tata letak. Hapus latar belakang asli subjek.
        - Tempatkan teks secara strategis di sekitar subjek. JANGAN menutupi bagian penting dari subjek dengan teks.
        
        **Aturan Penting:**
        - Hasilnya HARUS berupa satu gambar poster yang lengkap.
        - JANGAN menghasilkan teks apa pun di luar konten gambar.
        - Pastikan semua teks yang diminta ada, terlihat jelas, dan dieja dengan benar.`;
    },

    async runGeneration() {
        if (!this.sourceImage || !this.headlineInput?.value.trim()) return;

        this.state = 'processing';
        const basePrompt = this.buildPrompt();

        this.results = [
            { prompt: basePrompt + "\n**Arahan Kreatif Tambahan:** Fokus pada komposisi yang minimalis, bersih, dan elegan dengan banyak ruang kosong.", status: 'pending', imageUrl: null },
            { prompt: basePrompt + "\n**Arahan Kreatif Tambahan:** Fokus pada komposisi yang dinamis, berani, dan energik dengan warna dan sudut yang kuat.", status: 'pending', imageUrl: null },
            { prompt: basePrompt + "\n**Arahan Kreatif Tambahan:** Fokus pada komposisi yang kaya dan bertekstur. Pertimbangkan latar belakang seperti kertas, kain, atau gradien halus.", status: 'pending', imageUrl: null }
        ];
        this.render();

        const additionalImages = this.logoImage ? [{ inlineData: { data: this.logoImage.base64, mimeType: 'image/png' } }] : [];

        const generationPromises = this.results.map(async (result, index) => {
            try {
                const response = await withRetry(() => generateStyledImage(this.sourceImage!.base64, null, result.prompt, this.getApiKey, additionalImages), { retries: 2, delayMs: 1000, onRetry: () => {} });
                const imagePart = response.candidates?.[0]?.content?.parts.find(p => p.inlineData);

                if (imagePart?.inlineData) {
                    this.results[index].imageUrl = `data:${imagePart.inlineData.mimeType};base64,${imagePart.inlineData.data}`;
                    this.results[index].status = 'done';
                } else {
                    throw new Error(response.candidates?.[0]?.content?.parts.find(p => p.text)?.text || "Tidak ada data gambar dalam respons.");
                }
            } catch (e: any) {
                console.error(`Error generating poster ${index}:`, e);
                this.results[index].status = 'error';
                this.results[index].errorMessage = parseAndFormatErrorMessage(e, 'Pembuatan poster');
            } finally {
                this.render();
            }
        });

        await Promise.allSettled(generationPromises);
        this.state = 'results';
        this.render();
    },

    async regenerateSingle(index: number) {
        if (!this.sourceImage || index < 0 || index >= this.results.length) return;

        const resultToRegen = this.results[index];
        resultToRegen.status = 'pending';
        resultToRegen.imageUrl = null;
        this.render();

        const additionalImages = this.logoImage ? [{ inlineData: { data: this.logoImage.base64, mimeType: 'image/png' } }] : [];

        try {
            const response = await withRetry(() => generateStyledImage(this.sourceImage!.base64, null, resultToRegen.prompt, this.getApiKey, additionalImages), { retries: 2, delayMs: 1000, onRetry: () => {} });
            const imagePart = response.candidates?.[0]?.content?.parts.find(p => p.inlineData);

            if (imagePart?.inlineData) {
                this.results[index].imageUrl = `data:${imagePart.inlineData.mimeType};base64,${imagePart.inlineData.data}`;
                this.results[index].status = 'done';
            } else {
                throw new Error(response.candidates?.[0]?.content?.parts.find(p => p.text)?.text || "Tidak ada data gambar dalam respons.");
            }
        } catch (e: any) {
            console.error(`Error regenerating poster ${index}:`, e);
            this.results[index].status = 'error';
            this.results[index].errorMessage = parseAndFormatErrorMessage(e, 'Pembuatan poster');
        } finally {
            this.render();
        }
    },

    handleGridClick(e: MouseEvent) {
        const target = e.target as HTMLElement;
        const item = target.closest('.image-result-item');
        if (!item) return;
        
        const index = parseInt((item as HTMLElement).dataset.index!, 10);
        const result = this.results[index];
        if (!result) return;

        if (target.closest('.poster-pro-download')) {
            if (result.imageUrl) downloadFile(result.imageUrl, `poster_pro_${index + 1}.png`);
            return;
        }
        if (target.closest('.poster-pro-regenerate')) {
            this.regenerateSingle(index);
            return;
        }
        if (result.imageUrl) {
            const urls = this.results.map(r => r.imageUrl).filter((url): url is string => !!url);
            const startIndex = urls.indexOf(result.imageUrl);
            if (startIndex > -1) this.showPreviewModal(urls, startIndex);
        }
    },

    handleStartOver() {
        this.state = 'idle';
        this.sourceImage = null;
        this.logoImage = null;
        this.results = [];
        
        if (this.fileInput) this.fileInput.value = '';
        if (this.logoInput) this.logoInput.value = '';

        if (this.previewImage) {
            this.previewImage.src = '#';
            this.previewImage.style.display = 'none';
        }
        if (this.uploadLabel) this.uploadLabel.style.display = 'block';

        if (this.logoPreviewImage) {
            this.logoPreviewImage.src = '#';
            this.logoPreviewImage.style.display = 'none';
        }
        if (this.logoUploadLabel) this.logoUploadLabel.style.display = 'block';

        if (this.headlineInput) this.headlineInput.value = '';
        if (this.subheadlineInput) this.subheadlineInput.value = '';
        if (this.ctaInput) this.ctaInput.value = '';
        if (this.customPromptInput) this.customPromptInput.value = '';
        if (this.colorPaletteInput) this.colorPaletteInput.value = '';

        this.aspectRatio = '9:16';
        this.fontStyle = 'sans-serif font';
        this.fontWeight = 'regular';
        this.textPosition = 'centered';

        const resetGroup = (group: HTMLElement | null, defaultValue: string) => {
            if (!group) return;
            group.querySelectorAll('.toggle-button').forEach(btn => {
                const htmlBtn = btn as HTMLElement;
                htmlBtn.classList.toggle('active', htmlBtn.dataset.value === defaultValue);
            });
        };
        
        resetGroup(this.aspectRatioGroup, this.aspectRatio);
        resetGroup(this.fontStyleGroup, this.fontStyle);
        resetGroup(this.fontWeightGroup, this.fontWeight);
        resetGroup(this.textPositionGroup, this.textPosition);

        this.render();
    },
    
    showToast(message: string, type: 'success' | 'error' | 'info' = 'success') {
        if (!this.toastContainer) return;
        const toast = document.createElement('div');
        toast.className = `toast-notification ${type}`;
        toast.textContent = message;
        this.toastContainer.appendChild(toast);
        setTimeout(() => toast.remove(), 3000);
    }
};