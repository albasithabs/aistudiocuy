/* tslint:disable */
/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { blobToDataUrl, downloadFile, parseAndFormatErrorMessage, setupDragAndDrop } from "../utils/helpers.ts";
import { generateStyledImage } from "../utils/gemini.ts";

type InteriorDesignerState = 'idle' | 'processing' | 'results' | 'error';

export const InteriorDesigner = {
    // DOM Elements
    view: document.querySelector('#interior-designer-view') as HTMLDivElement,
    inputStateEl: null as HTMLDivElement | null,
    resultsStateEl: null as HTMLDivElement | null,
    fileInput: null as HTMLInputElement | null,
    previewImage: null as HTMLImageElement | null,
    uploadLabel: null as HTMLSpanElement | null,
    optionsPanel: null as HTMLDivElement | null,
    originalImage: null as HTMLImageElement | null,
    resultBox: null as HTMLDivElement | null,
    generateButton: null as HTMLButtonElement | null,
    changePhotoButton: null as HTMLButtonElement | null,
    downloadButton: null as HTMLButtonElement | null,
    startOverButton: null as HTMLButtonElement | null,
    
    // Option Groups
    roomTypeGroup: null as HTMLDivElement | null,
    styleGroup: null as HTMLDivElement | null,
    colorGroup: null as HTMLDivElement | null,
    lightingGroup: null as HTMLDivElement | null,

    // State
    state: 'idle' as InteriorDesignerState,
    sourceImage: null as { dataUrl: string; base64: string; } | null,
    resultImageUrl: null as string | null,
    errorMessage: '',

    // Dependencies
    getApiKey: (() => '') as () => string,
    showPreviewModal: ((urls: (string | null)[], startIndex?: number) => {}) as (urls: (string | null)[], startIndex?: number) => void,

    init(dependencies: { getApiKey: () => string; showPreviewModal: (urls: (string | null)[], startIndex?: number) => void; }) {
        if (!this.view) return;

        this.getApiKey = dependencies.getApiKey;
        this.showPreviewModal = dependencies.showPreviewModal;

        // Query elements
        this.inputStateEl = this.view.querySelector('#interior-designer-input-state');
        this.resultsStateEl = this.view.querySelector('#interior-designer-results-state');
        this.fileInput = this.view.querySelector('#interior-designer-input');
        this.previewImage = this.view.querySelector('#interior-designer-preview');
        this.uploadLabel = this.view.querySelector('#interior-designer-upload-label');
        this.optionsPanel = this.view.querySelector('#interior-designer-options-panel');
        this.originalImage = this.view.querySelector('#interior-designer-original-image');
        this.resultBox = this.view.querySelector('#interior-designer-result-box');
        this.generateButton = this.view.querySelector('#interior-designer-generate-button');
        this.changePhotoButton = this.view.querySelector('#interior-designer-change-photo-button');
        this.downloadButton = this.view.querySelector('#interior-designer-download-button');
        this.startOverButton = this.view.querySelector('#interior-designer-start-over-button');

        // Option groups
        this.roomTypeGroup = this.view.querySelector('#interior-designer-room-type-group');
        this.styleGroup = this.view.querySelector('#interior-designer-style-group');
        this.colorGroup = this.view.querySelector('#interior-designer-color-group');
        this.lightingGroup = this.view.querySelector('#interior-designer-lighting-group');

        this.addEventListeners();
        this.render();
    },

    addEventListeners() {
        if (!this.fileInput || !this.generateButton || !this.startOverButton || !this.changePhotoButton || !this.downloadButton) return;
        
        const dropZone = this.fileInput.closest('.file-drop-zone') as HTMLElement;
        setupDragAndDrop(dropZone, this.fileInput);
        
        this.fileInput.addEventListener('change', this.handleUpload.bind(this));
        this.generateButton.addEventListener('click', this.runGeneration.bind(this));
        this.changePhotoButton.addEventListener('click', () => this.fileInput?.click());
        this.startOverButton.addEventListener('click', this.handleStartOver.bind(this));
        this.downloadButton.addEventListener('click', this.handleDownload.bind(this));
        
        const optionGroups = [this.roomTypeGroup, this.styleGroup, this.colorGroup, this.lightingGroup];
        optionGroups.forEach(group => {
            group?.addEventListener('click', this.handleOptionClick.bind(this));
        });

        // Add click listeners for image preview modal
        this.originalImage?.closest('.retouch-image-box')?.addEventListener('click', () => this.handleImageClick(0));
        this.resultBox?.addEventListener('click', () => this.handleImageClick(1));
    },
    
    handleImageClick(startIndex: number) {
        if (!this.sourceImage) return;
    
        if (this.state === 'results' && this.resultImageUrl) {
            const urls = [this.sourceImage.dataUrl, this.resultImageUrl];
            this.showPreviewModal(urls, startIndex);
        } else {
            if (startIndex === 0) {
                this.showPreviewModal([this.sourceImage.dataUrl], 0);
            }
        }
    },

    handleOptionClick(e: MouseEvent) {
        const target = e.target as HTMLElement;
        const button = target.closest('.toggle-button');
        const group = target.closest('.button-group');
        if (button && group) {
            group.querySelectorAll('.toggle-button').forEach(btn => btn.classList.remove('active'));
            button.classList.add('active');
        }
    },

    render() {
        if (!this.inputStateEl || !this.resultsStateEl || !this.optionsPanel || !this.previewImage || !this.uploadLabel) return;
        
        const hasImage = !!this.sourceImage;
        
        // Show/hide main sections based on state
        this.inputStateEl.style.display = (this.state === 'idle') ? 'block' : 'none';
        this.resultsStateEl.style.display = (this.state !== 'idle') ? 'block' : 'none';

        // Configure input state
        this.optionsPanel.style.display = hasImage ? 'block' : 'none';
        this.previewImage.style.display = hasImage ? 'block' : 'none';
        this.uploadLabel.style.display = hasImage ? 'none' : 'block';
        if (this.generateButton) this.generateButton.disabled = !hasImage;

        if (hasImage) {
            this.previewImage.src = this.sourceImage!.dataUrl;
        }

        // Configure results state
        switch(this.state) {
            case 'processing':
                if(this.resultBox) this.resultBox.innerHTML = '<div class="loading-clock"></div><p style="margin-top: 1rem; color: var(--color-text-muted);">AI sedang mendesain ulang ruangan Anda...</p>';
                if(this.originalImage) this.originalImage.src = this.sourceImage!.dataUrl;
                if(this.downloadButton) this.downloadButton.disabled = true;
                break;
            case 'results':
                if(this.originalImage) this.originalImage.src = this.sourceImage!.dataUrl;
                if (this.resultImageUrl && this.resultBox) {
                    this.resultBox.innerHTML = `<img src="${this.resultImageUrl}" alt="Redesigned room" />`;
                    if(this.downloadButton) this.downloadButton.disabled = false;
                }
                break;
            case 'error':
                 if(this.resultBox) this.resultBox.innerHTML = `<p class="pending-status-text" style="padding: 1rem;">${this.errorMessage}</p>`;
                 if(this.downloadButton) this.downloadButton.disabled = true;
                 if(this.originalImage) this.originalImage.src = this.sourceImage!.dataUrl;
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
                base64: dataUrl.split(',')[1],
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
        
        const roomType = getSelectedValue(this.roomTypeGroup);
        const designStyle = getSelectedValue(this.styleGroup);
        const customInstructions = (this.view.querySelector('#interior-designer-prompt') as HTMLTextAreaElement).value.trim();
        const autoLayout = (this.view.querySelector('#interior-designer-autolayout-toggle') as HTMLInputElement).checked;
        const colorPalette = getSelectedValue(this.colorGroup);
        const lighting = getSelectedValue(this.lightingGroup);

        let prompt = `Tugas: Desain ulang interior ruangan yang disediakan dalam gambar.
- Jenis Ruangan: ${roomType}.
- Gaya Desain yang Diinginkan: ${designStyle}.`;

        if (customInstructions) {
            prompt += `\n- Instruksi Kustom: ${customInstructions}.`;
        }

        if (autoLayout) {
            prompt += `\n- Tata Letak: Atur ulang perabotan secara cerdas untuk aliran dan fungsionalitas yang lebih baik.`;
        }

        if (colorPalette !== 'Original') {
            prompt += `\n- Palet Warna: Terapkan palet warna ${colorPalette} secara dominan ke seluruh ruangan.`;
        }
        
        if (lighting !== 'Original') {
            prompt += `\n- Pencahayaan: Ubah pencahayaan untuk mensimulasikan ${lighting}.`;
        }

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
            const response = await generateStyledImage(this.sourceImage.base64, null, prompt, this.getApiKey);
            const imagePart = response.candidates?.[0]?.content?.parts.find(p => p.inlineData);

            if (imagePart?.inlineData) {
                this.resultImageUrl = `data:${imagePart.inlineData.mimeType};base64,${imagePart.inlineData.data}`;
                this.state = 'results';
            } else {
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
        // Reset custom prompt
        const promptInput = this.view.querySelector('#interior-designer-prompt') as HTMLTextAreaElement;
        if(promptInput) promptInput.value = '';
        
        this.render();
    },
};