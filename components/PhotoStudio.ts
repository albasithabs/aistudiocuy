/* tslint:disable */
/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { blobToDataUrl, downloadFile, setupDragAndDrop, delay, parseAndFormatErrorMessage, withRetry } from "../utils/helpers.ts";
import { generateStyledImage, generateStructuredTextFromImage } from "../utils/gemini.ts";
import { Type } from "@google/genai";


const MAX_SUBJECT_IMAGES = 10;
const MAX_FILE_SIZE_MB = 5;
const MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024;

export const PhotoStudio = {
    // === DOM Elements ===
    studioView: document.querySelector('#photo-studio-view') as HTMLDivElement,
    
    // Wizard Elements
    wizardContent: null as HTMLDivElement | null,
    wizardSteps: null as NodeListOf<HTMLDivElement> | null,
    backBtn: null as HTMLButtonElement | null, nextBtn: null as HTMLButtonElement | null,
    mainContent: null as HTMLDivElement | null,

    // Input Elements
    studioMultiImageInput: null as HTMLInputElement | null, studioMultiImagePreview: null as HTMLDivElement | null,
    studioWardrobeImageInput: null as HTMLInputElement | null, studioWardrobeImagePreview: null as HTMLImageElement | null,
    studioWardrobeClearButton: null as HTMLButtonElement | null,
    studioStyleImageInput: null as HTMLInputElement | null,
    studioStyleImagePreview: null as HTMLImageElement | null,
    studioStyleClearButton: null as HTMLButtonElement | null,
    studioPoseGroup: null as HTMLDivElement | null, studioShotTypeGroup: null as HTMLDivElement | null,
    studioExpressionGroup: null as HTMLDivElement | null, studioLightingSelect: null as HTMLSelectElement | null,
    studioCustomBgInput: null as HTMLTextAreaElement | null,
    studioPropsInput: null as HTMLInputElement | null, studioOutputFormatJpegButton: null as HTMLButtonElement | null,
    studioOutputFormatPngButton: null as HTMLButtonElement | null, studioConsistentSetToggle: null as HTMLInputElement | null,
    studioImageCountSelect: null as HTMLSelectElement | null,
    
    // Action Buttons
    studioGenerateButton: null as HTMLButtonElement | null, 
    studioInspirationButton: null as HTMLButtonElement | null,

    // Results & Status
    studioResultsState: null as HTMLDivElement | null, studioResultsGrid: null as HTMLDivElement | null,
    studioDownloadAllButton: null as HTMLButtonElement | null, studioStartOverButton: null as HTMLButtonElement | null,
    studioStatusContainer: null as HTMLDivElement | null, studioStatus: null as HTMLParagraphElement | null,
    studioProgressWrapper: null as HTMLDivElement | null, studioProgressBar: null as HTMLDivElement | null,
    
    // Inspiration Board
    inspirationContainer: null as HTMLDivElement | null,
    inspirationGrid: null as HTMLDivElement | null,
    closeInspirationBtn: null as HTMLButtonElement | null,

    // Refine Modal
    refineModal: null as HTMLDivElement | null,
    refineCloseBtn: null as HTMLButtonElement | null,
    refinePreviewImage: null as HTMLImageElement | null,
    refinePrompt: null as HTMLTextAreaElement | null,
    refineGenerateBtn: null as HTMLButtonElement | null,

    // === State ===
    studioState: 'idle' as 'idle' | 'processing' | 'results',
    studioCurrentStep: 1,
    isGeneratingInspiration: false,
    studioSubjectImages: [] as { id: string, file: File, base64: string }[],
    studioWardrobeImage: null as { file: File, base64: string } | null,
    studioStyleImage: null as { file: File, base64: string } | null,
    studioResults: [] as { prompt: string, status: 'pending' | 'done' | 'error', url?: string, errorMessage?: string }[],
    studioImageCount: 3,
    studioInspirationConcepts: [] as any[],
    refiningImageIndex: null as number | null,

    // === Dependencies ===
    getApiKey: (() => '') as () => string,
    showPreviewModal: ((urls: (string | null)[], startIndex?: number) => {}) as (urls: (string | null)[], startIndex?: number) => void,
    showNotification: ((message: string, type: 'info' | 'error' | 'success') => {}) as (message: string, type: 'info' | 'error' | 'success') => void,

    init(dependencies: { 
        getApiKey: () => string; 
        showPreviewModal: (urls: (string | null)[], startIndex?: number) => void;
        showNotification: (message: string, type: 'info' | 'error' | 'success') => void;
    }) {
        if (!this.studioView) return;

        this.getApiKey = dependencies.getApiKey;
        this.showPreviewModal = dependencies.showPreviewModal;
        this.showNotification = dependencies.showNotification;

        this.queryDOMElements();
        if (!this.validateDOMElements()) return;

        this.addEventListeners();
        this.renderStudio();
    },
    
    queryDOMElements() {
        this.wizardContent = this.studioView.querySelector('#studio-wizard-content');
        this.wizardSteps = this.studioView.querySelectorAll('.wizard-step');
        this.mainContent = this.studioView.querySelector('#studio-main-content');
        this.backBtn = this.studioView.querySelector('#studio-back-btn');
        this.nextBtn = this.studioView.querySelector('#studio-next-btn');
        this.studioMultiImageInput = this.studioView.querySelector('#studio-multi-image-input');
        this.studioMultiImagePreview = this.studioView.querySelector('#studio-multi-image-preview');
        this.studioWardrobeImageInput = this.studioView.querySelector('#studio-wardrobe-image');
        this.studioWardrobeImagePreview = this.studioView.querySelector('#studio-wardrobe-image-preview');
        this.studioWardrobeClearButton = this.studioView.querySelector('#studio-clear-wardrobe-image');
        this.studioStyleImageInput = this.studioView.querySelector('#studio-style-image');
        this.studioStyleImagePreview = this.studioView.querySelector('#studio-style-image-preview');
        this.studioStyleClearButton = this.studioView.querySelector('#studio-clear-style-image');
        this.studioPoseGroup = this.studioView.querySelector('#studio-pose-group');
        this.studioShotTypeGroup = this.studioView.querySelector('#studio-shot-type-group');
        this.studioExpressionGroup = this.studioView.querySelector('#studio-expression-group');
        this.studioLightingSelect = this.studioView.querySelector('#studio-lighting-select');
        this.studioCustomBgInput = this.studioView.querySelector('#studio-custom-bg-input');
        this.studioPropsInput = this.studioView.querySelector('#studio-props-input');
        this.studioOutputFormatJpegButton = this.studioView.querySelector('#studio-output-format-jpeg');
        this.studioOutputFormatPngButton = this.studioView.querySelector('#studio-output-format-png');
        this.studioConsistentSetToggle = this.studioView.querySelector('#studio-consistent-set-toggle');
        this.studioGenerateButton = this.studioView.querySelector('#studio-generate-button');
        this.studioInspirationButton = this.studioView.querySelector('#studio-inspiration-button');
        this.studioResultsState = this.studioView.querySelector('#studio-results-state');
        this.studioResultsGrid = this.studioView.querySelector('#studio-results-grid');
        this.studioDownloadAllButton = this.studioView.querySelector('#studio-download-all-button');
        this.studioStartOverButton = this.studioView.querySelector('#studio-start-over-button');
        this.studioStatusContainer = this.studioView.querySelector('#studio-status-container');
        this.studioStatus = this.studioView.querySelector('#studio-status');
        this.studioProgressWrapper = this.studioView.querySelector('#studio-progress-wrapper');
        this.studioProgressBar = this.studioView.querySelector('#studio-progress-bar');
        this.studioImageCountSelect = this.studioView.querySelector('#studio-image-count-select');
        this.inspirationContainer = this.studioView.querySelector('#studio-inspiration-board-container');
        this.inspirationGrid = this.studioView.querySelector('#studio-inspiration-grid');
        this.closeInspirationBtn = this.studioView.querySelector('#studio-close-inspiration-btn');
        this.refineModal = document.querySelector('#studio-refine-modal');
        this.refineCloseBtn = document.querySelector('#studio-refine-close-button');
        this.refinePreviewImage = document.querySelector('#studio-refine-preview-image');
        this.refinePrompt = document.querySelector('#studio-refine-prompt');
        this.refineGenerateBtn = document.querySelector('#studio-refine-generate-button');
    },

    validateDOMElements(): boolean {
        const required = [
            this.wizardContent, this.wizardSteps, this.mainContent,
            this.backBtn, this.nextBtn, this.studioMultiImageInput, this.studioMultiImagePreview,
            this.studioPoseGroup, this.studioShotTypeGroup, this.studioGenerateButton,
            this.studioInspirationButton, this.inspirationContainer, this.inspirationGrid, this.closeInspirationBtn,
            this.refineModal, this.refineCloseBtn, this.refinePreviewImage, this.refinePrompt, this.refineGenerateBtn,
            this.studioStartOverButton, this.studioResultsGrid, this.studioStatusContainer
        ];
        if (required.some(el => !el)) {
            console.error(`Photo Studio init failed: A critical wizard or modal element not found.`);
            return false;
        }
        return true;
    },

    addEventListeners() {
        setupDragAndDrop(this.studioMultiImageInput!.closest('.file-drop-zone')!, this.studioMultiImageInput!);
        setupDragAndDrop(this.studioWardrobeImageInput!.closest('.file-drop-zone')!, this.studioWardrobeImageInput!);
        setupDragAndDrop(this.studioStyleImageInput!.closest('.file-drop-zone')!, this.studioStyleImageInput!);

        this.nextBtn!.addEventListener('click', () => this.changeStep(1));
        this.backBtn!.addEventListener('click', () => this.changeStep(-1));

        this.studioMultiImageInput!.addEventListener('change', this.handleStudioMultiImageUpload.bind(this));
        this.studioMultiImagePreview!.addEventListener('click', this.handleRemoveImage.bind(this));
        this.studioWardrobeImageInput!.addEventListener('change', this.handleStudioWardrobeUpload.bind(this));
        this.studioWardrobeClearButton!.addEventListener('click', this.handleClearWardrobeImage.bind(this));
        this.studioStyleImageInput!.addEventListener('change', this.handleStudioStyleUpload.bind(this));
        this.studioStyleClearButton!.addEventListener('click', this.handleClearStyleImage.bind(this));
        
        this.studioGenerateButton!.addEventListener('click', this.handleStudioGenerate.bind(this));
        this.studioInspirationButton!.addEventListener('click', this.handleGenerateInspiration.bind(this));
        this.closeInspirationBtn!.addEventListener('click', () => {
            this.inspirationContainer!.style.display = 'none';
            this.wizardContent!.style.display = 'block';
        });
        this.inspirationGrid!.addEventListener('click', this.applyInspirationConcept.bind(this));

        this.studioStartOverButton!.addEventListener('click', this.handleStudioStartOver.bind(this));
        this.studioImageCountSelect!.addEventListener('change', () => {
            this.studioImageCount = parseInt(this.studioImageCountSelect!.value, 10);
        });

        [this.studioOutputFormatJpegButton, this.studioOutputFormatPngButton].forEach(btn => {
            btn!.addEventListener('click', (e) => this.handleOutputFormatClick(e));
        });

        this.refineCloseBtn!.addEventListener('click', () => {
            if (this.refineModal) this.refineModal.style.display = 'none';
        });

        this.refineGenerateBtn!.addEventListener('click', this.handleRefineGenerate.bind(this));
        this.studioResultsGrid!.addEventListener('click', this.handleStudioGridClick.bind(this));
    },

    handleOutputFormatClick(e: MouseEvent) {
        const target = e.currentTarget as HTMLButtonElement;
        this.studioOutputFormatJpegButton?.classList.remove('active');
        this.studioOutputFormatPngButton?.classList.remove('active');
        target.classList.add('active');
    },

    changeStep(delta: number) {
        const newStep = this.studioCurrentStep + delta;
        if (newStep < 1 || newStep > 4) return;
        this.studioCurrentStep = newStep;
        this.renderStudio();
    },

    async handleStudioMultiImageUpload(e: Event) {
        const files = (e.target as HTMLInputElement).files;
        if (!files) return;

        for (const file of Array.from(files)) {
            if (this.studioSubjectImages.length >= MAX_SUBJECT_IMAGES) {
                this.showNotification(`Maksimal ${MAX_SUBJECT_IMAGES} gambar subjek.`, 'info');
                break;
            }
            if (file.size > MAX_FILE_SIZE_BYTES) {
                this.showNotification(`File ${file.name} terlalu besar (maks ${MAX_FILE_SIZE_MB}MB).`, 'error');
                continue;
            }
            try {
                const dataUrl = await blobToDataUrl(file);
                const base64 = dataUrl.substring(dataUrl.indexOf(',') + 1);
                const id = `img-${Date.now()}-${Math.random()}`;
                this.studioSubjectImages.push({ id, file, base64 });
            } catch (error) {
                this.showNotification(`Gagal memproses ${file.name}.`, 'error');
            }
        }
        this.renderStudio();
    },

    handleRemoveImage(e: MouseEvent) {
        const target = e.target as HTMLElement;
        if (target.classList.contains('remove-image-btn')) {
            const id = target.dataset.id;
            this.studioSubjectImages = this.studioSubjectImages.filter(img => img.id !== id);
            this.renderStudio();
        }
    },
    
    async handleStudioWardrobeUpload(e: Event) {
        const file = (e.target as HTMLInputElement).files?.[0];
        if (!file) return;
        const dataUrl = await blobToDataUrl(file);
        this.studioWardrobeImage = { file, base64: dataUrl.substring(dataUrl.indexOf(',') + 1) };
        this.renderStudio();
    },

    handleClearWardrobeImage() {
        this.studioWardrobeImageInput!.value = '';
        this.studioWardrobeImage = null;
        this.renderStudio();
    },

    async handleStudioStyleUpload(e: Event) {
        const file = (e.target as HTMLInputElement).files?.[0];
        if (!file) return;
        const dataUrl = await blobToDataUrl(file);
        this.studioStyleImage = { file, base64: dataUrl.substring(dataUrl.indexOf(',') + 1) };
        this.renderStudio();
    },

    handleClearStyleImage() {
        this.studioStyleImageInput!.value = '';
        this.studioStyleImage = null;
        this.renderStudio();
    },

    async handleGenerateInspiration() {
        if (this.studioSubjectImages.length === 0) return;

        this.isGeneratingInspiration = true;
        this.studioInspirationButton!.disabled = true;
        this.studioInspirationButton!.innerHTML = `<div class="loading-clock" style="width: 18px; height: 18px; border-width: 2px;"></div> Mencari Inspirasi...`;
        
        try {
            const prompt = `Analisis gambar subjek yang disediakan. Hasilkan 3-4 konsep pemotretan yang berbeda secara kreatif. Untuk setiap konsep, berikan judul yang menarik, deskripsi singkat tentang gaya, dan kata kunci untuk properti, pencahayaan, dan latar belakang.`;
            const schema = {
                type: Type.ARRAY,
                items: {
                    type: Type.OBJECT,
                    properties: {
                        title: { type: Type.STRING, description: 'Judul yang menarik untuk konsep tersebut' },
                        description: { type: Type.STRING, description: 'Deskripsi singkat tentang gaya dan suasana hati' },
                        props: { type: Type.STRING, description: 'Saran kata kunci properti' },
                        lighting: { type: Type.STRING, description: 'Saran gaya pencahayaan' },
                        background: { type: Type.STRING, description: 'Saran latar belakang' },
                    },
                },
            };
            const jsonString = await generateStructuredTextFromImage(prompt, this.studioSubjectImages[0].base64, this.getApiKey(), schema);
            this.studioInspirationConcepts = JSON.parse(jsonString);
            this.wizardContent!.style.display = 'none';
            this.inspirationContainer!.style.display = 'block';
            this.renderStudio();
        } catch (e) {
            this.showNotification(parseAndFormatErrorMessage(e, 'Gagal membuat inspirasi'), 'error');
        } finally {
            this.isGeneratingInspiration = false;
            this.studioInspirationButton!.disabled = false;
            this.studioInspirationButton!.innerHTML = `Buat Papan Inspirasi`;
        }
    },

    applyInspirationConcept(e: MouseEvent) {
        const button = (e.target as HTMLElement).closest('.use-concept-btn');
        if (!button) return;
    
        const index = parseInt((button as HTMLElement).dataset.index!, 10);
        const concept = this.studioInspirationConcepts[index];
        // FIX: Add a safety check to prevent crashing if concept is undefined.
        if (concept) {
            this.studioPropsInput!.value = concept.props || '';
            this.studioCustomBgInput!.value = concept.background || '';
            
            const lightingString = concept.lighting;
            if (typeof lightingString === 'string') {
                // FIX: Added type casting to `opt` and `lightingOption` to prevent a TypeError.
                // The `find` method returns a generic `Element`, which doesn't have `.text` or `.value`.
                // Casting them to `HTMLOptionElement` ensures safe access to these properties.
                const lightingOption = Array.from(this.studioLightingSelect!.options).find(opt => (opt as HTMLOptionElement).text.toLowerCase().includes(lightingString.toLowerCase()));
                if (lightingOption) {
                    this.studioLightingSelect!.value = (lightingOption as HTMLOptionElement).value;
                }
            }
            
            this.showNotification(`Konsep "${concept.title}" diterapkan!`, 'success');
            this.inspirationContainer!.style.display = 'none';
            this.wizardContent!.style.display = 'block';
            this.studioCurrentStep = 2; // Move to styling step
            this.renderStudio();
        }
    },

    handleStudioGenerate() {
        this.studioState = 'processing';
        this.runStudioGeneration();
    },

    buildStudioPrompt(): string {
        const getSelectedValues = (group: HTMLDivElement | null) => 
            Array.from(group?.querySelectorAll('.toggle-button.active') || []).map(btn => (btn as HTMLElement).dataset.value).join(', ');

        const pose = getSelectedValues(this.studioPoseGroup);
        const shotType = getSelectedValues(this.studioShotTypeGroup);
        const expression = getSelectedValues(this.studioExpressionGroup);
        const lighting = this.studioLightingSelect!.options[this.studioLightingSelect!.selectedIndex].text;
        const background = this.studioCustomBgInput!.value.trim();
        const props = this.studioPropsInput!.value.trim();
        const isPng = this.studioOutputFormatPngButton?.classList.contains('active');

        let prompt = `Buat foto profesional dari subjek yang disediakan.`;
        if (this.studioWardrobeImage) {
            prompt += ` Subjek harus mengenakan pakaian yang disediakan dalam gambar pakaian.`;
        }
        if (this.studioStyleImage) {
            prompt += ` Gaya keseluruhan, warna, dan suasana hati harus sangat cocok dengan gambar referensi gaya.`;
        }

        prompt += ` Variasikan pose antara [${pose}], sudut pengambilan antara [${shotType}], dan ekspresi antara [${expression}].`;
        prompt += ` Gaya pencahayaan harus '${lighting}'.`;
        if (background) {
            prompt += ` Latar belakang harus '${background}'.`;
        }
        if (props) {
            prompt += ` Sertakan properti berikut dalam adegan: ${props}.`;
        }
        if (isPng) {
            prompt += ` Latar belakang harus putih solid atau transparan untuk memudahkan pemotongan (PNG).`;
        }

        if (this.studioConsistentSetToggle?.checked) {
            prompt += ` Sangat penting: pertahankan wajah, tubuh, dan gaya subjek yang konsisten di semua gambar yang dihasilkan.`;
        }

        return prompt;
    },

    async runStudioGeneration() {
        const basePrompt = this.buildStudioPrompt();
        this.studioResults = Array.from({ length: this.studioImageCount }, () => ({
            prompt: basePrompt,
            status: 'pending'
        }));
        this.renderStudio();

        const allImages = [...this.studioSubjectImages];
        if (this.studioWardrobeImage) allImages.push({ id: 'wardrobe', file: this.studioWardrobeImage.file, base64: this.studioWardrobeImage.base64 });
        if (this.studioStyleImage) allImages.push({ id: 'style', file: this.studioStyleImage.file, base64: this.studioStyleImage.base64 });

        const mainImage = allImages.shift()!;
        const additionalImages = allImages.map(img => ({
            inlineData: { data: img.base64, mimeType: img.file.type }
        }));

        let completedJobs = 0;
        const generationPromises = this.studioResults.map(async (result, index) => {
            try {
                // Add variation to each prompt
                const variedPrompt = `${result.prompt} Variasi foto #${index + 1}.`;
                const response = await withRetry(() => 
                    generateStyledImage(mainImage.base64, null, variedPrompt, this.getApiKey(), additionalImages),
                    { retries: 2, delayMs: 1000, onRetry: (attempt, err) => console.warn(`Attempt ${attempt} failed for Photo Studio. Retrying...`, err) }
                );

                const imagePart = response.candidates?.[0]?.content?.parts.find(p => p.inlineData);
                if (imagePart?.inlineData) {
                    this.studioResults[index] = { ...result, status: 'done', url: `data:${imagePart.inlineData.mimeType};base64,${imagePart.inlineData.data}` };
                } else {
                    throw new Error(response.candidates?.[0]?.content?.parts.find(p => p.text)?.text || "Tidak ada data gambar dalam respons.");
                }
            } catch (e: any) {
                this.studioResults[index] = { ...result, status: 'error', errorMessage: parseAndFormatErrorMessage(e, 'Pembuatan gambar') };
            } finally {
                completedJobs++;
                const progress = (completedJobs / this.studioImageCount) * 100;
                this.studioProgressBar!.style.width = `${progress}%`;
                this.renderStudio();
            }
        });

        await Promise.all(generationPromises);
        this.studioState = 'results';
        this.renderStudio();
    },

    handleStudioGridClick(e: MouseEvent) {
        const target = e.target as HTMLElement;
        const item = target.closest('.image-result-item');
        if (!item) return;

        const index = parseInt((item as HTMLElement).dataset.index!, 10);
        if (isNaN(index)) return;

        if (target.closest('.studio-refine-button')) {
            this.openRefineModal(index);
        } else {
            this.handleStudioPreview(index);
        }
    },

    openRefineModal(index: number) {
        const result = this.studioResults[index];
        if (!result || !result.url) return;
        this.refiningImageIndex = index;
        this.refinePreviewImage!.src = result.url;
        this.refinePrompt!.value = '';
        this.refineModal!.style.display = 'flex';
    },

    async handleRefineGenerate() {
        if (this.refiningImageIndex === null) return;
        const index = this.refiningImageIndex;
        const originalResult = this.studioResults[index];
        const instruction = this.refinePrompt?.value.trim();
        if (!instruction || !originalResult.url) return;

        const originalImageBase64 = originalResult.url.substring(originalResult.url.indexOf(',') + 1);
        const prompt = `Ambil gambar yang disediakan dan modifikasi sesuai dengan instruksi berikut: "${instruction}". Pertahankan subjek dan gaya asli semirip mungkin.`;
        
        this.refineGenerateBtn!.disabled = true;
        this.refineGenerateBtn!.innerHTML = `<div class="loading-clock" style="width: 18px; height: 18px; border-width: 2px;"></div>`;

        try {
            const response = await withRetry(() => generateStyledImage(originalImageBase64, null, prompt, this.getApiKey()), { retries: 2, delayMs: 1000, onRetry: (attempt, err) => console.warn(`Attempt ${attempt} failed for refine. Retrying...`, err) });
            const imagePart = response.candidates?.[0]?.content?.parts.find(p => p.inlineData);
            if (imagePart?.inlineData) {
                const newUrl = `data:${imagePart.inlineData.mimeType};base64,${imagePart.inlineData.data}`;
                this.studioResults[index].url = newUrl;
                this.showNotification('Gambar berhasil disempurnakan!', 'success');
                this.refineModal!.style.display = 'none';
                this.renderStudio();
            } else {
                throw new Error("Gagal menyempurnakan gambar.");
            }
        } catch(e) {
            this.showNotification(parseAndFormatErrorMessage(e, 'Penyempurnaan gagal'), 'error');
        } finally {
            this.refineGenerateBtn!.disabled = false;
            this.refineGenerateBtn!.innerHTML = `Buat Ulang`;
        }
    },

    handleStudioPreview(index: number) {
        const urls = this.studioResults.map(r => r.url).filter((url): url is string => !!url);
        const clickedUrl = this.studioResults[index]?.url;
        if (!clickedUrl) return;
        const startIndex = urls.indexOf(clickedUrl);
        if (startIndex > -1) {
            this.showPreviewModal(urls, startIndex);
        }
    },
    
    handleStudioStartOver() {
        this.studioState = 'idle';
        this.studioCurrentStep = 1;
        this.studioSubjectImages = [];
        this.studioWardrobeImage = null;
        this.studioStyleImage = null;
        this.studioResults = [];
        this.studioInspirationConcepts = [];
        this.studioMultiImageInput!.value = '';
        this.studioWardrobeImageInput!.value = '';
        this.studioStyleImageInput!.value = '';
        this.studioPropsInput!.value = '';
        this.studioCustomBgInput!.value = '';
        this.renderStudio();
    },

    renderStudio() {
        const isIdle = this.studioState === 'idle';
        this.mainContent!.style.display = isIdle ? 'block' : 'none';
        this.studioResultsState!.style.display = isIdle ? 'none' : 'block';
        this.studioStatusContainer!.style.display = this.studioState === 'processing' ? 'flex' : 'none';

        if (isIdle) {
            this.wizardSteps?.forEach((stepEl, index) => {
                stepEl.classList.toggle('active', (index + 1) === this.studioCurrentStep);
            });
            this.wizardContent?.querySelectorAll('.wizard-step-content').forEach(el => {
                (el as HTMLElement).style.display = 'none';
            });
            this.studioView.querySelector(`#studio-step-${this.studioCurrentStep}`)!.style.display = 'block';

            this.backBtn!.style.visibility = this.studioCurrentStep > 1 ? 'visible' : 'hidden';
            this.nextBtn!.style.display = this.studioCurrentStep < 4 ? 'inline-flex' : 'none';
            this.nextBtn!.disabled = this.studioCurrentStep === 1 && this.studioSubjectImages.length === 0;

            // Render subject images
            this.studioMultiImagePreview!.innerHTML = this.studioSubjectImages.map(img => `
                <div class="multi-image-preview-item">
                    <img src="${URL.createObjectURL(img.file)}" alt="${img.file.name}">
                    <button class="remove-image-btn" data-id="${img.id}">&times;</button>
                </div>
            `).join('');
            this.studioInspirationButton!.disabled = this.studioSubjectImages.length === 0 || this.isGeneratingInspiration;

            // Render wardrobe & style images
            this.studioWardrobeImagePreview!.src = this.studioWardrobeImage ? URL.createObjectURL(this.studioWardrobeImage.file) : '#';
            this.studioWardrobeImagePreview!.classList.toggle('image-preview-hidden', !this.studioWardrobeImage);
            this.studioWardrobeClearButton!.style.display = this.studioWardrobeImage ? 'inline-flex' : 'none';
            this.studioStyleImagePreview!.src = this.studioStyleImage ? URL.createObjectURL(this.studioStyleImage.file) : '#';
            this.studioStyleImagePreview!.classList.toggle('image-preview-hidden', !this.studioStyleImage);
            this.studioStyleClearButton!.style.display = this.studioStyleImage ? 'inline-flex' : 'none';
            
            // Render Inspiration
            this.inspirationGrid!.innerHTML = this.studioInspirationConcepts.map((c, i) => `
                <div class="inspiration-card">
                    <h4>${c.title}</h4>
                    <p>${c.description}</p>
                    <div class="inspiration-card-keywords">
                        <span>${c.props}</span>
                        <span>${c.lighting}</span>
                        <span>${c.background}</span>
                    </div>
                    <button class="secondary-button use-concept-btn" data-index="${i}">Gunakan Konsep Ini</button>
                </div>
            `).join('');
            this.studioGenerateButton!.disabled = this.studioSubjectImages.length === 0;

        } else {
            // Render results grid
            this.studioStatus!.textContent = `Membuat ${this.studioImageCount} gambar...`;
            this.studioDownloadAllButton!.disabled = this.studioState === 'processing';
            this.studioResultsGrid!.innerHTML = this.studioResults.map((result, index) => {
                const item = document.createElement('div');
                item.className = 'image-result-item';
                item.dataset.index = String(index);
                let content = '';
                switch (result.status) {
                    case 'pending': content = `<div class="loading-clock"></div>`; break;
                    case 'error': content = `<p class="pending-status-text" title="${result.errorMessage}">Gagal</p>`; break;
                    case 'done': content = `
                        <img src="${result.url}" alt="Hasil foto studio">
                        <div class="affiliate-result-item-overlay">
                            <button class="icon-button studio-refine-button" aria-label="Sempurnakan Gambar">
                                <svg xmlns="http://www.w3.org/2000/svg" height="20px" viewBox="0 0 24 24" width="20px" fill="currentColor"><g><rect fill="none" height="24" width="24"/></g><g><path d="M19,9l1.25-2.75L23,5l-2.75-1.25L19,1l-1.25,2.75L15,5l2.75,1.25L19,9z M11.5,9.5L9,4L6.5,9.5L1,12l5.5,2.5L9,20l2.5-5.5 L17,12L11.5,9.5z M19,15l-1.25,2.75L15,19l2.75,1.25L19,23l1.25-2.75L23,19l-2.75-1.25L19,15z"/></g></svg>
                            </button>
                        </div>
                    `; break;
                }
                item.innerHTML = content;
                return item.outerHTML;
            }).join('');
        }
    },
};