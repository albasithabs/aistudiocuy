/* tslint:disable */
/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

// FIX: Import `GenerateContentResponse` for proper typing.
import { GenerateContentResponse } from "@google/genai";
// --- FIX: Imported withRetry ---
import { blobToDataUrl, downloadFile, parseAndFormatErrorMessage, setupDragAndDrop, withRetry } from "../utils/helpers.ts";
// FIX: Import `generateStyledImage` which is now available.
import { generateStyledImage } from "../utils/gemini.ts";

type InteriorDesignerState = 'idle' | 'processing' | 'results' | 'error';

export const InteriorDesigner = {
    // DOM Elements
    view: document.querySelector('#interior-designer-view') as HTMLDivElement,
    inputStateEl: null as HTMLDivElement | null, resultsStateEl: null as HTMLDivElement | null,
    fileInput: null as HTMLInputElement | null, previewImage: null as HTMLImageElement | null,
    uploadLabel: null as HTMLSpanElement | null, optionsPanel: null as HTMLDivElement | null,
    originalImage: null as HTMLImageElement | null, resultBox: null as HTMLDivElement | null,
    generateButton: null as HTMLButtonElement | null, changePhotoButton: null as HTMLButtonElement | null,
    downloadButton: null as HTMLButtonElement | null, startOverButton: null as HTMLButtonElement | null,
    // --- FIX: Add missing element properties ---
    promptInput: null as HTMLTextAreaElement | null,
    autoLayoutToggle: null as HTMLInputElement | null,
    
    // Option Groups
    roomTypeGroup: null as HTMLDivElement | null, styleGroup: null as HTMLDivElement | null,
    colorGroup: null as HTMLDivElement | null, lightingGroup: null as HTMLDivElement | null,

    // State
    state: 'idle' as InteriorDesignerState,
    sourceImage: null as { dataUrl: string; base64: string; } | null,
    resultImageUrl: null as string | null, errorMessage: '',

    // Dependencies
    getApiKey: (() => '') as () => string,
    showPreviewModal: ((urls: (string | null)[], startIndex?: number) => {}) as (urls: (string | null)[], startIndex?: number) => void,

    init(dependencies: { getApiKey: () => string; showPreviewModal: (urls: (string | null)[], startIndex?: number) => void; }) {
        if (!this.view) return;

        this.getApiKey = dependencies.getApiKey;
        this.showPreviewModal = dependencies.showPreviewModal;

        const selectors = {
            inputStateEl: '#interior-designer-input-state', resultsStateEl: '#interior-designer-results-state',
            fileInput: '#interior-designer-input', previewImage: '#interior-designer-preview',
            uploadLabel: '#interior-designer-upload-label', optionsPanel: '#interior-designer-options-panel',
            originalImage: '#interior-designer-original-image', resultBox: '#interior-designer-result-box',
            generateButton: '#interior-designer-generate-button', changePhotoButton: '#interior-designer-change-photo-button',
            downloadButton: '#interior-designer-download-button', startOverButton: '#interior-designer-start-over-button',
            promptInput: '#interior-designer-prompt', autoLayoutToggle: '#interior-designer-autolayout-toggle',
            roomTypeGroup: '#interior-designer-room-type-group', styleGroup: '#interior-designer-style-group',
            colorGroup: '#interior-designer-color-group', lightingGroup: '#interior-designer-lighting-group',
        };

        let allElementsFound = true;
        for (const [key, selector] of Object.entries(selectors)) {
            const element = this.view.querySelector(selector);
            if (!element) {
                console.error(`Interior Designer init failed: Element with selector "${selector}" not found.`);
                allElementsFound = false;
            }
            (this as any)[key] = element;
        }

        // --- FIX: Comprehensive validation for all elements ---
        if (!allElementsFound) return;

        this.addEventListeners();
        this.render();
    },

    addEventListeners() {
        const dropZone = this.fileInput!.closest('.file-drop-zone') as HTMLElement;
        setupDragAndDrop(dropZone, this.fileInput!);
        
        this.fileInput!.addEventListener('change', this.handleUpload.bind(this));
        this.generateButton!.addEventListener('click', this.runGeneration.bind(this));
        this.changePhotoButton!.addEventListener('click', () => this.fileInput?.click());
        this.startOverButton!.addEventListener('click', this.handleStartOver.bind(this));
        this.downloadButton!.addEventListener('click', this.handleDownload.bind(this));
        
        [this.roomTypeGroup, this.styleGroup, this.colorGroup, this.lightingGroup].forEach(group => {
            group?.addEventListener('click', this.handleOptionClick.bind(this));
        });

        this.originalImage?.closest('.retouch-image-box')?.addEventListener('click', () => this.handleImageClick(0));
        this.resultBox?.addEventListener('click', () => this.handleImageClick(1));
    },
    
    handleImageClick(startIndex: number) {
        if (!this.sourceImage) return;
        const urls = [this.sourceImage.dataUrl];
        if (this.state === 'results' && this.resultImageUrl) {
            urls.push(this.resultImageUrl);
        }
        this.showPreviewModal(urls, startIndex);
    },

    handleOptionClick(e: MouseEvent) {
        const button = (e.target as HTMLElement).closest('.toggle-button');
        const group = (e.target as HTMLElement).closest('.button-group');
        if (button && group) {
            group.querySelectorAll('.toggle-button').forEach(btn => btn.classList.remove('active'));
            button.classList.add('active');
        }
    },

    render() {
        if (!this.inputStateEl || !this.resultsStateEl || !this.optionsPanel || !this.previewImage || !this.uploadLabel || !this.generateButton || !this.originalImage || !this.resultBox || !this.downloadButton) return;
        
        const hasImage = !!this.sourceImage;
        
        this.inputStateEl.style.display = (this.state === 'idle') ? 'block' : 'none';
        this.resultsStateEl.style.display = (this.state !== 'idle') ? 'block' : 'none';

        this.optionsPanel.style.display = hasImage ? 'block' : 'none';
        this.previewImage.style.display = hasImage ? 'block' : 'none';
        this.uploadLabel.style.display = hasImage ? 'none' : 'block';
        this.generateButton.disabled = !hasImage;

        if (hasImage) {
            this.previewImage.src = this.sourceImage!.dataUrl;
            this.originalImage.src = this.sourceImage!.dataUrl;
        }

        // --- SUGGESTION: Refactored to reduce redundancy ---
        switch(this.state) {
            case 'processing':
                this.resultBox.innerHTML = '<div class="loading-clock"></div><p style="margin-top: 1rem; color: var(--color-text-muted);">AI sedang mendesain ulang ruangan Anda...</p>';
                this.downloadButton.disabled = true;
                break;
            case 'results':
                if (this.resultImageUrl) {
                    this.resultBox.innerHTML = `<img src="${this.resultImageUrl}" alt="Redesigned room" />`;
                    this.downloadButton.disabled = false;
                }
                break;
            case 'error':
                 this.resultBox.innerHTML = `<p class="pending-status-text" style="padding: 1rem;">${this.errorMessage}</p>`;
                 this.downloadButton.disabled = true;
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
                // --- FIX: More robust Base64 parsing ---
                base64: dataUrl.substring(dataUrl.indexOf(',') + 1),
            };
            this.state = 'idle';
            this.render();
        } catch (error: any) {
            this.state = 'error';
            this.errorMessage = `Kesalahan memproses file: ${error.message}`;
            this.render();
        }
    },
    
    buildPrompt(): string {
        const getSelectedValue = (group: HTMLDivElement | null) => 
            (group?.querySelector('.toggle-button.active') as HTMLElement)?.dataset.value || 'Original';
        
        // --- FIX: Use properties instead of querying DOM ---
        const roomType = getSelectedValue(this.roomTypeGroup);
        const designStyle = getSelectedValue(this.styleGroup);
        const customInstructions = this.promptInput!.value.trim();
        const autoLayout = this.autoLayoutToggle!.checked;
        const colorPalette = getSelectedValue(this.colorGroup);
        const lighting = getSelectedValue(this.lightingGroup);

        let prompt = `Tugas: Desain ulang interior ruangan yang disediakan dalam gambar.\n- Jenis Ruangan: ${roomType}.\n- Gaya Desain yang Diinginkan: ${designStyle}.`;
        if (customInstructions) prompt += `\n- Instruksi Kustom: ${customInstructions}.`;
        if (autoLayout) prompt += `\n- Tata Letak: Atur ulang perabotan secara cerdas untuk aliran dan fungsionalitas yang lebih baik.`;
        if (colorPalette !== 'Original') prompt += `\n- Palet Warna: Terapkan palet warna ${colorPalette} secara dominan ke seluruh ruangan.`;
        if (lighting !== 'Original') prompt += `\n- Pencahayaan: Ubah pencahayaan untuk mensimulasikan ${lighting}.`;
        prompt += `\nAturan Penting: Pertahankan arsitektur dasar (jendela, pintu, dinding) ruangan tetapi ganti semua perabotan, dekorasi, warna, dan pencahayaan agar sesuai dengan gaya dan instruksi yang diminta. Hasilnya harus berupa rendering fotorealistik berkualitas tinggi.`;
        prompt += `\n\nINSTRUCTION: Generate ONLY the redesigned image. Do not include any text, commentary, or explanation in your response. The output must be the image file alone.`;

        return prompt;
    },

    async runGeneration() {
        if (!this.sourceImage) return;

        this.state = 'processing';
        this.render();

        const prompt = this.buildPrompt();

        try {
            // --- FIX: Wrap API call in withRetry for resilience ---
            // FIX: Type the response to avoid property access errors.
            const response: GenerateContentResponse = await withRetry(() =>
                generateStyledImage(this.sourceImage!.base64, null, prompt, this.getApiKey), {
                    retries: 2, delayMs: 1000,
                    onRetry: (attempt, error) => console.warn(`Interior Designer generation attempt ${attempt} failed. Retrying...`, error)
                }
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
            console.error("Error during interior design generation:", e);
            this.state = 'error';
            this.errorMessage = parseAndFormatErrorMessage(e, 'Pembuatan gambar');
        } finally {
            this.render();
        }
    },

    handleDownload() {
        if (this.resultImageUrl) {
            downloadFile(this.resultImageUrl, 'redesigned_room.png');
        }
    },

    handleStartOver() {
        this.state = 'idle';
        this.sourceImage = null;
        this.resultImageUrl = null;
        this.errorMessage = '';
        if (this.fileInput) this.fileInput.value = '';
        // --- FIX: Use property to reset custom prompt ---
        if (this.promptInput) this.promptInput.value = '';
        
        this.render();
    },
};
