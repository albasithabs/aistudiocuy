/* tslint:disable */
/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

// --- FIX: Import withRetry ---
import { blobToDataUrl, downloadFile, setupDragAndDrop, delay, parseAndFormatErrorMessage, withRetry } from "../utils/helpers.ts";
import { generateStyledImage } from "../utils/gemini.ts";

export const PhotoStudio = {
    // === DOM Elements ===
    studioView: document.querySelector('#photo-studio-view') as HTMLDivElement,
    studioInputState: null as HTMLDivElement | null, studioResultsState: null as HTMLDivElement | null,
    studioMultiImageInput: null as HTMLInputElement | null, studioMultiImagePreview: null as HTMLDivElement | null,
    studioWardrobeImageInput: null as HTMLInputElement | null, studioWardrobeImagePreview: null as HTMLImageElement | null,
    studioExpressionGroup: null as HTMLDivElement | null, studioLightingSelect: null as HTMLSelectElement | null,
    studioBgPresetGroup: null as HTMLDivElement | null, studioCustomBgInput: null as HTMLTextAreaElement | null,
    studioPropsInput: null as HTMLInputElement | null, studioOutputFormatJpegButton: null as HTMLButtonElement | null,
    studioOutputFormatPngButton: null as HTMLButtonElement | null, studioConsistentSetToggle: null as HTMLInputElement | null,
    studioGenerateButton: null as HTMLButtonElement | null, studioSurpriseMeButton: null as HTMLButtonElement | null,
    studioResultsGrid: null as HTMLDivElement | null, studioResultsPlaceholder: null as HTMLDivElement | null,
    studioDownloadAllButton: null as HTMLButtonElement | null, studioStartOverButton: null as HTMLButtonElement | null,
    studioStatusContainer: null as HTMLDivElement | null, studioStatus: null as HTMLParagraphElement | null,
    studioProgressWrapper: null as HTMLDivElement | null, studioProgressBar: null as HTMLDivElement | null,
    studioImageCountSelect: null as HTMLSelectElement | null,

    // === State ===
    studioState: 'idle' as 'idle' | 'processing' | 'results',
    studioSubjectImages: [] as { id: string, file: File, base64: string }[],
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

        this.queryDOMElements();
        // --- FIX: Add validation after querying elements ---
        if (!this.validateDOMElements()) return;

        this.addEventListeners();
        this.renderStudio();
        this.updateStudioGenerateButtonText();
    },
    
    queryDOMElements() {
        // This pattern is safer than assigning directly at the top level
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
        this.studioSurpriseMeButton = document.querySelector('#studio-surprise-me-button'); // Assumes global
        this.studioResultsGrid = this.studioView.querySelector('#studio-results-grid');
        this.studioResultsPlaceholder = this.studioView.querySelector('#studio-results-placeholder');
        this.studioDownloadAllButton = this.studioView.querySelector('#studio-download-all-button');
        this.studioStartOverButton = this.studioView.querySelector('#studio-start-over-button');
        this.studioStatusContainer = this.studioView.querySelector('#studio-status-container');
        this.studioStatus = this.studioView.querySelector('#studio-status');
        this.studioProgressWrapper = this.studioView.querySelector('#studio-progress-wrapper');
        this.studioProgressBar = this.studioView.querySelector('#studio-progress-bar');
        this.studioImageCountSelect = this.studioView.querySelector('#studio-image-count-select');
    },

    // --- FIX: New validation method ---
    validateDOMElements(): boolean {
        const requiredElements = {
            studioInputState: this.studioInputState,
            studioResultsState: this.studioResultsState,
            studioMultiImageInput: this.studioMultiImageInput,
            studioMultiImagePreview: this.studioMultiImagePreview,
            studioWardrobeImageInput: this.studioWardrobeImageInput,
            studioWardrobeImagePreview: this.studioWardrobeImagePreview,
            studioExpressionGroup: this.studioExpressionGroup,
            studioLightingSelect: this.studioLightingSelect,
            studioBgPresetGroup: this.studioBgPresetGroup,
            studioCustomBgInput: this.studioCustomBgInput,
            studioPropsInput: this.studioPropsInput,
            studioOutputFormatJpegButton: this.studioOutputFormatJpegButton,
            studioOutputFormatPngButton: this.studioOutputFormatPngButton,
            studioConsistentSetToggle: this.studioConsistentSetToggle,
            studioGenerateButton: this.studioGenerateButton,
            studioSurpriseMeButton: this.studioSurpriseMeButton,
            studioResultsGrid: this.studioResultsGrid,
            studioResultsPlaceholder: this.studioResultsPlaceholder,
            studioDownloadAllButton: this.studioDownloadAllButton,
            studioStartOverButton: this.studioStartOverButton,
            studioStatusContainer: this.studioStatusContainer,
            studioStatus: this.studioStatus,
            studioProgressWrapper: this.studioProgressWrapper,
            studioProgressBar: this.studioProgressBar,
            studioImageCountSelect: this.studioImageCountSelect
        };

        for (const [key, element] of Object.entries(requiredElements)) {
            if (!element) {
                console.error(`Photo Studio init failed: Element for "${key}" not found.`);
                return false;
            }
        }
        return true;
    },

    addEventListeners() {
        setupDragAndDrop(this.studioMultiImageInput!.closest('.file-drop-zone')!, this.studioMultiImageInput!);
        setupDragAndDrop(this.studioWardrobeImageInput!.closest('.file-drop-zone')!, this.studioWardrobeImageInput!);

        this.studioMultiImageInput!.addEventListener('change', this.handleStudioMultiImageUpload.bind(this));
        this.studioWardrobeImageInput!.addEventListener('change', this.handleStudioWardrobeUpload.bind(this));
        this.studioGenerateButton!.addEventListener('click', this.handleStudioGenerate.bind(this));
        this.studioStartOverButton!.addEventListener('click', this.handleStudioStartOver.bind(this));
        this.studioDownloadAllButton!.addEventListener('click', this.handleDownloadAllStudio.bind(this));
        
        this.studioImageCountSelect!.addEventListener('change', () => {
            this.studioImageCount = parseInt(this.studioImageCountSelect!.value, 10);
            this.updateStudioGenerateButtonText();
        });

        this.studioMultiImagePreview!.addEventListener('click', this.handleRemoveImage.bind(this));

        // --- FIX: Use Event Delegation for results grid ---
        this.studioResultsGrid!.addEventListener('click', this.handleGridClick.bind(this));

        [this.studioBgPresetGroup!, this.studioExpressionGroup!].forEach(group => {
            group.addEventListener('click', e => {
                const button = (e.target as HTMLElement).closest('.toggle-button');
                if (!button) return;
                
                if (group === this.studioExpressionGroup) {
                    button.classList.toggle('active'); // Multi-select
                } else {
                    group.querySelectorAll('.toggle-button').forEach(btn => btn.classList.remove('active'));
                    button.classList.add('active'); // Single-select
                    if (group === this.studioBgPresetGroup) this.studioCustomBgInput!.value = '';
                }
            });
        });

        [this.studioOutputFormatJpegButton!, this.studioOutputFormatPngButton!].forEach(button => {
            button.addEventListener('click', () => {
                this.studioOutputFormatJpegButton!.classList.toggle('active');
                this.studioOutputFormatPngButton!.classList.toggle('active');
            });
        });

        this.studioCustomBgInput!.addEventListener('input', () => {
            if (this.studioCustomBgInput!.value.trim()) {
                this.studioBgPresetGroup!.querySelectorAll('.toggle-button').forEach(btn => btn.classList.remove('active'));
            }
        });
    },

    renderStudio() {
        if (!this.studioInputState || !this.studioResultsState) return;

        this.studioInputState.style.display = this.studioState === 'idle' ? 'block' : 'none';
        this.studioResultsState.style.display = ['processing', 'results'].includes(this.studioState) ? 'block' : 'none';
        this.studioStatusContainer!.style.display = (this.studioState !== 'idle') ? 'flex' : 'none';
        
        this.studioResultsPlaceholder!.style.display = this.studioState === 'processing' ? 'flex' : 'none';
        this.studioResultsGrid!.style.display = this.studioState === 'results' ? 'grid' : 'none';
        
        if (['processing', 'results'].includes(this.studioState)) {
            const doneCount = this.studioResults.filter(r => r.status !== 'pending').length;
            this.studioStatus!.textContent = this.studioState === 'processing' ? `Membuat... (${doneCount}/${this.studioResults.length})` : 'Selesai!';
            this.studioProgressBar!.style.width = `${(doneCount / this.studioResults.length) * 100}%`;

            this.studioResultsGrid!.innerHTML = this.studioResults.map((result, index) => {
                let content = '';
                if (result.status === 'pending') {
                    content = '<div class="loading-clock"></div>';
                } else if (result.status === 'error') {
                    content = `<p class="pending-status-text" title="${result.errorMessage || 'Unknown Error'}">Gagal</p>`;
                } else if (result.url) {
                    content = `<img src="${result.url}" alt="Hasil foto studio ${index + 1}">`;
                }
                return `<div class="image-result-item" data-index="${index}">${content}</div>`;
            }).join('');
        } else {
            this.studioStatus!.textContent = 'Siap untuk memulai sesi foto.';
        }
        this.studioGenerateButton!.disabled = this.studioSubjectImages.length === 0 || this.studioState === 'processing';
    },

    handleGridClick(e: MouseEvent) {
        const item = (e.target as HTMLElement).closest('.image-result-item');
        if (!item) return;

        const index = parseInt((item as HTMLElement).dataset.index!, 10);
        const result = this.studioResults[index];
        if (!result || !result.url) return;

        const urls = this.studioResults.map(r => r.url).filter((url): url is string => !!url);
        const startIndex = urls.indexOf(result.url);

        if (startIndex > -1) {
            this.showPreviewModal(urls, startIndex);
        }
    },

    updateStudioGenerateButtonText() {
        const span = this.studioGenerateButton!.querySelector('span');
        if (span) span.textContent = `Mulai Sesi Foto (${this.studioImageCount})`;
    },

    async handleStudioMultiImageUpload(e: Event) {
        const files = (e.target as HTMLInputElement).files;
        if (!files) return;
    
        for (const file of Array.from(files)) {
            try {
                const uniqueId = `${file.name}-${file.size}-${file.lastModified}`;
                
                // Prevent adding duplicate files
                if (this.studioSubjectImages.some(img => img.id === uniqueId)) {
                    continue;
                }
        
                const dataUrl = await blobToDataUrl(file);
                this.studioSubjectImages.push({ 
                    id: uniqueId,
                    file, 
                    base64: dataUrl.substring(dataUrl.indexOf(',') + 1) 
                });
                const item = document.createElement('div');
                item.className = 'multi-image-preview-item';
                item.innerHTML = `<img src="${dataUrl}" alt="Pratinjau subjek"><button class="remove-image-btn" data-id="${uniqueId}">&times;</button>`;
                this.studioMultiImagePreview!.appendChild(item);
            } catch (error) {
                console.error(`Gagal memproses file: ${file.name}`, error);
                // Optionally show a toast or alert for the specific file
            }
        }
    
        // Clear the input's value to allow re-selecting the same file after removing it
        (e.target as HTMLInputElement).value = '';
    
        this.renderStudio();
    },

    handleRemoveImage(e: MouseEvent) {
        const target = e.target as HTMLElement;
        if (target.classList.contains('remove-image-btn')) {
            const id = target.dataset.id;
            if (!id) return;
            this.studioSubjectImages = this.studioSubjectImages.filter(img => img.id !== id);
            target.parentElement?.remove();
            this.renderStudio();
        }
    },

    async handleStudioWardrobeUpload(e: Event) {
        const file = (e.target as HTMLInputElement).files?.[0];
        if (file) {
            const dataUrl = await blobToDataUrl(file);
            this.studioWardrobeImage = { file, base64: dataUrl.substring(dataUrl.indexOf(',') + 1) };
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
        // FIX: Explicitly cast the querySelector result to HTMLElement before accessing dataset to prevent type errors.
        const activeBgButton = this.studioBgPresetGroup!.querySelector('.toggle-button.active') as HTMLElement;
        const background = this.studioCustomBgInput!.value.trim() || 
            activeBgButton?.dataset.bg || 'studio background';
        const props = this.studioPropsInput!.value.trim();
        const isPng = this.studioOutputFormatPngButton!.classList.contains('active');
        const isConsistent = this.studioConsistentSetToggle!.checked;
        
        const baseSubjectImage = this.studioSubjectImages[0].base64;
        const additionalSubjectImages = this.studioSubjectImages.slice(1).map(img => ({
            inlineData: { data: img.base64, mimeType: img.file.type }
        }));
        
        const prompts = Array.from({ length: this.studioImageCount }, (_, i) => {
            const expression = selectedExpressions.length > 0 ? selectedExpressions[i % selectedExpressions.length] : 'a neutral expression';
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
                // --- FIX: Wrap API call in withRetry ---
                // FIX: Added missing options object to withRetry call.
                const response = await withRetry(() => generateStyledImage(
                    baseSubjectImage, 
                    this.studioWardrobeImage?.base64 || null, 
                    result.prompt, 
                    this.getApiKey,
                    additionalSubjectImages
                ), { retries: 2, delayMs: 1000, onRetry: () => {} });
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

        await Promise.allSettled(generationPromises);
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