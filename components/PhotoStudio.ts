/* tslint:disable */
/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { blobToDataUrl, downloadFile, setupDragAndDrop, delay, parseAndFormatErrorMessage } from "../utils/helpers.ts";
import { generateStyledImage } from "../utils/gemini.ts";

export const PhotoStudio = {
    // === DOM Elements ===
    studioView: document.querySelector('#photo-studio-view') as HTMLDivElement,
    studioInputState: null as HTMLDivElement | null,
    studioResultsState: null as HTMLDivElement | null,
    studioMultiImageInput: null as HTMLInputElement | null,
    studioMultiImagePreview: null as HTMLDivElement | null,
    studioWardrobeImageInput: null as HTMLInputElement | null,
    studioWardrobeImagePreview: null as HTMLImageElement | null,
    studioExpressionGroup: null as HTMLDivElement | null,
    studioLightingSelect: null as HTMLSelectElement | null,
    studioBgPresetGroup: null as HTMLDivElement | null,
    studioCustomBgInput: null as HTMLTextAreaElement | null,
    studioPropsInput: null as HTMLInputElement | null,
    studioOutputFormatJpegButton: null as HTMLButtonElement | null,
    studioOutputFormatPngButton: null as HTMLButtonElement | null,
    studioConsistentSetToggle: null as HTMLInputElement | null,
    studioGenerateButton: null as HTMLButtonElement | null,
    studioSurpriseMeButton: null as HTMLButtonElement | null,
    studioResultsGrid: null as HTMLDivElement | null,
    studioResultsPlaceholder: null as HTMLDivElement | null,
    studioDownloadAllButton: null as HTMLButtonElement | null,
    studioStartOverButton: null as HTMLButtonElement | null,
    studioStatusContainer: null as HTMLDivElement | null,
    studioStatus: null as HTMLParagraphElement | null,
    studioProgressWrapper: null as HTMLDivElement | null,
    studioProgressBar: null as HTMLDivElement | null,
    studioImageCountSelect: null as HTMLSelectElement | null,

    // === State ===
    studioState: 'idle' as 'idle' | 'processing' | 'results',
    studioSubjectImages: [] as { file: File, base64: string }[],
    studioWardrobeImage: null as { file: File, base64: string } | null,
    studioResults: [] as { prompt: string, status: 'pending' | 'done' | 'error', url?: string, errorMessage?: string }[],
    studioImageCount: 3,

    // === Dependencies ===
    getApiKey: (() => '') as () => string,
    showPreviewModal: ((urls: (string | null)[], startIndex?: number) => {}) as (urls: (string | null)[], startIndex?: number) => void,

    init(dependencies: { getApiKey: () => string; showPreviewModal: (urls: (string | null)[], startIndex?: number) => void; }) {
        if (!this.studioView) return;

        this.getApiKey = dependencies.getApiKey;
        this.showPreviewModal = dependencies.showPreviewModal;

        // Assign DOM elements inside init
        this.studioInputState = this.studioView.querySelector('#studio-input-state');
        this.studioResultsState = this.studioView.querySelector('#studio-results-state');
        this.studioMultiImageInput = this.studioView.querySelector('#studio-multi-image-input');
        this.studioMultiImagePreview = this.studioView.querySelector('#studio-multi-image-preview');
        this.studioWardrobeImageInput = this.studioView.querySelector('#studio-wardrobe-image');
        this.studioWardrobeImagePreview = this.studioView.querySelector('#studio-wardrobe-image-preview');
        this.studioExpressionGroup = this.studioView.querySelector('#studio-expression-group');
        this.studioLightingSelect = this.studioView.querySelector('#studio-lighting-select');
        this.studioBgPresetGroup = this.studioView.querySelector('#studio-bg-preset-group');
        this.studioCustomBgInput = this.studioView.querySelector('#studio-custom-bg-input');
        this.studioPropsInput = this.studioView.querySelector('#studio-props-input');
        this.studioOutputFormatJpegButton = this.studioView.querySelector('#studio-output-format-jpeg');
        this.studioOutputFormatPngButton = this.studioView.querySelector('#studio-output-format-png');
        this.studioConsistentSetToggle = this.studioView.querySelector('#studio-consistent-set-toggle');
        this.studioGenerateButton = this.studioView.querySelector('#studio-generate-button');
        this.studioSurpriseMeButton = document.querySelector('#studio-surprise-me-button');
        this.studioResultsGrid = this.studioView.querySelector('#studio-results-grid');
        this.studioResultsPlaceholder = this.studioView.querySelector('#studio-results-placeholder');
        this.studioDownloadAllButton = this.studioView.querySelector('#studio-download-all-button');
        this.studioStartOverButton = this.studioView.querySelector('#studio-start-over-button');
        this.studioStatusContainer = this.studioView.querySelector('#studio-status-container');
        this.studioStatus = this.studioView.querySelector('#studio-status');
        this.studioProgressWrapper = this.studioView.querySelector('#studio-progress-wrapper');
        this.studioProgressBar = this.studioView.querySelector('#studio-progress-bar');
        this.studioImageCountSelect = this.studioView.querySelector('#studio-image-count-select');

        this.addEventListeners();
        this.renderStudio();
        this.updateStudioGenerateButtonText();
    },

    addEventListeners() {
        if (!this.studioMultiImageInput || !this.studioWardrobeImageInput || !this.studioGenerateButton || !this.studioStartOverButton || !this.studioDownloadAllButton || !this.studioImageCountSelect || !this.studioMultiImagePreview || !this.studioBgPresetGroup || !this.studioExpressionGroup || !this.studioOutputFormatJpegButton || !this.studioOutputFormatPngButton || !this.studioCustomBgInput) {
            return;
        }

        setupDragAndDrop(this.studioMultiImageInput.closest('.file-drop-zone'), this.studioMultiImageInput);
        setupDragAndDrop(this.studioWardrobeImageInput.closest('.file-drop-zone'), this.studioWardrobeImageInput);
        this.studioMultiImageInput.addEventListener('change', this.handleStudioMultiImageUpload.bind(this));
        this.studioWardrobeImageInput.addEventListener('change', this.handleStudioWardrobeUpload.bind(this));
        this.studioGenerateButton.addEventListener('click', this.handleStudioGenerate.bind(this));
        this.studioStartOverButton.addEventListener('click', this.handleStudioStartOver.bind(this));
        this.studioDownloadAllButton.addEventListener('click', this.handleDownloadAllStudio.bind(this));
        this.studioImageCountSelect.addEventListener('change', () => {
            this.studioImageCount = parseInt(this.studioImageCountSelect!.value, 10);
            this.updateStudioGenerateButtonText();
        });
        this.studioMultiImagePreview.addEventListener('click', e => {
            const target = e.target as HTMLElement;
            if (target.classList.contains('remove-image-btn')) {
                const filename = target.dataset.filename;
                this.studioSubjectImages = this.studioSubjectImages.filter(img => img.file.name !== filename);
                target.parentElement?.remove();
                this.renderStudio();
            }
        });

        [this.studioBgPresetGroup, this.studioExpressionGroup].forEach(group => {
            group.addEventListener('click', e => {
                const button = (e.target as HTMLElement).closest('.toggle-button');
                if (!button) return;
                
                if (group === this.studioExpressionGroup) {
                     button.classList.toggle('active'); // Multi-select for expressions
                } else {
                     group.querySelectorAll('.toggle-button').forEach(btn => btn.classList.remove('active'));
                     button.classList.add('active'); // Single-select for others
                     if(group === this.studioBgPresetGroup) this.studioCustomBgInput!.value = '';
                }
            });
        });

        [this.studioOutputFormatJpegButton, this.studioOutputFormatPngButton].forEach(button => {
            button.addEventListener('click', () => {
                this.studioOutputFormatJpegButton!.classList.toggle('active');
                this.studioOutputFormatPngButton!.classList.toggle('active');
            });
        });

        this.studioCustomBgInput.addEventListener('input', () => {
            if(this.studioCustomBgInput!.value.trim()){
                this.studioBgPresetGroup!.querySelectorAll('.toggle-button').forEach(btn => btn.classList.remove('active'));
            }
        });
    },

    renderStudio() {
        if (!this.studioInputState || !this.studioResultsState || !this.studioStatusContainer || !this.studioResultsPlaceholder || !this.studioResultsGrid || !this.studioStatus || !this.studioProgressBar || !this.studioGenerateButton) {
            return;
        }

        this.studioInputState.style.display = this.studioState === 'idle' ? 'block' : 'none';
        this.studioResultsState.style.display = (this.studioState === 'processing' || this.studioState === 'results') ? 'block' : 'none';
        this.studioStatusContainer.style.display = (this.studioState !== 'idle') ? 'flex' : 'none';
        
        this.studioResultsPlaceholder.style.display = this.studioState === 'processing' ? 'flex' : 'none';
        this.studioResultsGrid.style.display = this.studioState === 'results' ? 'grid' : 'none';
        
        if (this.studioState === 'processing' || this.studioState === 'results') {
            const doneCount = this.studioResults.filter(r => r.status !== 'pending').length;
            this.studioStatus.textContent = this.studioState === 'processing' ? `Membuat... (${doneCount}/${this.studioResults.length})` : 'Selesai!';
            this.studioProgressBar.style.width = `${(doneCount / this.studioResults.length) * 100}%`;

            this.studioResultsGrid.innerHTML = '';
            this.studioResults.forEach((result, index) => {
                const item = document.createElement('div');
                item.className = 'image-result-item';
                if (result.status === 'pending') {
                    item.innerHTML = '<div class="loading-clock"></div>';
                } else if (result.status === 'error') {
                    item.innerHTML = `<p class="pending-status-text">${result.errorMessage || 'Gagal'}</p>`;
                } else if (result.url) {
                    item.innerHTML = `<img src="${result.url}" alt="Hasil foto studio ${index + 1}">`;
                }
                item.addEventListener('click', () => {
                     const urls = this.studioResults.map(r => r.url).filter((url): url is string => !!url);
                     const startIndex = urls.indexOf(result.url!);
                     if (startIndex > -1) this.showPreviewModal(urls, startIndex);
                });
                this.studioResultsGrid.appendChild(item);
            });
        } else {
            this.studioStatus.textContent = 'Siap untuk memulai sesi foto.';
        }
        this.studioGenerateButton.disabled = this.studioSubjectImages.length === 0 || this.studioState === 'processing';
    },

    updateStudioGenerateButtonText() {
        if (this.studioGenerateButton) {
            this.studioGenerateButton.querySelector('span')!.textContent = `Mulai Sesi Foto (${this.studioImageCount})`;
        }
    },

    async handleStudioMultiImageUpload(e: Event) {
        const files = (e.target as HTMLInputElement).files;
        if (!files) return;

        this.studioSubjectImages = [];
        this.studioMultiImagePreview!.innerHTML = '';

        for (const file of Array.from(files)) {
            const dataUrl = await blobToDataUrl(file);
            this.studioSubjectImages.push({ file, base64: dataUrl.split(',')[1] });
            const item = document.createElement('div');
            item.className = 'multi-image-preview-item';
            item.innerHTML = `<img src="${dataUrl}" alt="Pratinjau subjek"><button class="remove-image-btn" data-filename="${file.name}">&times;</button>`;
            this.studioMultiImagePreview!.appendChild(item);
        }
        this.renderStudio();
    },

    async handleStudioWardrobeUpload(e: Event) {
        const file = (e.target as HTMLInputElement).files?.[0];
        if (file) {
            const dataUrl = await blobToDataUrl(file);
            this.studioWardrobeImage = { file, base64: dataUrl.split(',')[1] };
            this.studioWardrobeImagePreview!.src = dataUrl;
            this.studioWardrobeImagePreview!.classList.remove('image-preview-hidden');
        } else {
            this.studioWardrobeImage = null;
            this.studioWardrobeImagePreview!.src = '#';
            this.studioWardrobeImagePreview!.classList.add('image-preview-hidden');
        }
    },

    async handleStudioGenerate() {
        if (this.studioSubjectImages.length === 0) return;

        this.studioState = 'processing';
        
        const selectedExpressions = Array.from(this.studioExpressionGroup!.querySelectorAll('.toggle-button.active'))
            .map(btn => (btn as HTMLElement).dataset.value || '');
        
        const lighting = this.studioLightingSelect!.value;
        const background = this.studioCustomBgInput!.value.trim() || 
            (this.studioBgPresetGroup!.querySelector('.toggle-button.active') as HTMLElement).dataset.bg;
        const props = this.studioPropsInput!.value.trim();
        const isPng = this.studioOutputFormatPngButton!.classList.contains('active');
        const isConsistent = this.studioConsistentSetToggle!.checked;
        
        const baseSubjectImage = this.studioSubjectImages[0].base64;
        const additionalSubjectImages = this.studioSubjectImages.slice(1).map(img => ({
            inlineData: { data: img.base64, mimeType: img.file.type }
        }));
        
        const prompts = Array.from({ length: this.studioImageCount }, (_, i) => {
            const expression = selectedExpressions[i % selectedExpressions.length] || 'a neutral expression';
            let prompt = `Buat foto profesional, bidikan seluruh tubuh atau setengah badan dari subjek. Subjek harus memiliki ${expression}. Pencahayaannya harus ${lighting}. Latar belakangnya harus ${background}.`;
            if (props) prompt += ` Subjek mungkin berinteraksi dengan properti seperti: ${props}.`;
            if (isPng) prompt += ` Latar belakang HARUS transparan.`;
            if (isConsistent) prompt += ` Sangat penting untuk menjaga konsistensi wajah, pencahayaan, dan tone di seluruh set foto.`;
            if (this.studioWardrobeImage) prompt += ` Subjek HARUS mengenakan pakaian dari gambar pakaian yang diberikan.`;
            return prompt;
        });

        this.studioResults = prompts.map(prompt => ({ prompt, status: 'pending' }));
        this.renderStudio();
        
        const generationPromises = this.studioResults.map(async (result, index) => {
            try {
                const response = await generateStyledImage(
                    baseSubjectImage, 
                    this.studioWardrobeImage?.base64 || null, 
                    result.prompt, 
                    this.getApiKey,
                    additionalSubjectImages
                );
                const imagePart = response.candidates?.[0]?.content?.parts.find(p => p.inlineData);
                if (imagePart?.inlineData) {
                    this.studioResults[index] = { ...result, status: 'done', url: `data:${imagePart.inlineData.mimeType};base64,${imagePart.inlineData.data}` };
                } else {
                    throw new Error("Tidak ada data gambar dalam respons.");
                }
            } catch (e: any) {
                this.studioResults[index] = { ...result, status: 'error', errorMessage: parseAndFormatErrorMessage(e, 'Pembuatan') };
            } finally {
                this.renderStudio();
            }
        });

        await Promise.all(generationPromises);
        this.studioState = 'results';
        this.renderStudio();
    },

    handleStudioStartOver() {
        this.studioState = 'idle';
        this.studioSubjectImages = [];
        this.studioWardrobeImage = null;
        this.studioResults = [];
        this.studioMultiImageInput!.value = '';
        this.studioWardrobeImageInput!.value = '';
        this.studioMultiImagePreview!.innerHTML = '';
        this.studioWardrobeImagePreview!.src = '#';
        this.studioWardrobeImagePreview!.classList.add('image-preview-hidden');
        this.studioImageCount = 3;
        this.studioImageCountSelect!.value = '3';
        this.updateStudioGenerateButtonText();
        this.renderStudio();
    },

    async handleDownloadAllStudio() {
        for (const [i, result] of this.studioResults.entries()) {
            if(result.url) {
                downloadFile(result.url, `studio_photo_${i+1}.png`);
                await delay(200);
            }
        }
    }
};