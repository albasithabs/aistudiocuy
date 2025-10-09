/* tslint:disable */
/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { blobToDataUrl, delay, downloadFile, parseAndFormatErrorMessage, setupDragAndDrop, withRetry } from "../utils/helpers.ts";
import { generateImage, generateStyledImage, generateStructuredTextFromImage, nutritionSchema } from "../utils/gemini.ts";

type FoodStylistState = 'idle' | 'processing' | 'results' | 'error';

const PROMPT_PACK = [
    'Di atas meja kayu pedesaan dengan cahaya pagi alami, dihiasi dengan bumbu segar.',
    'Disajikan secara profesional di atas piring keramik putih bersih, gaya fine dining minimalis, dengan sedikit saus.',
    'Sebagai bagian dari flat lay yang cerah dan berwarna-warni dengan bahan-bahan segar yang saling melengkapi tersebar di sekitarnya.',
    'Dalam suasana kafe yang nyaman, di sebelah secangkir kopi di atas meja marmer kecil.',
    'Dengan pengaturan pencahayaan yang dramatis, gelap dan murung di atas permukaan batu tulis, menonjolkan tekstur.',
    'Disajikan dalam suasana rumahan yang santai, terlihat nyaman dan lezat.',
];

export const FoodStylist = {
    // DOM Elements
    view: null as HTMLDivElement | null,
    inputStateEl: null as HTMLDivElement | null,
    resultsStateEl: null as HTMLDivElement | null,
    dishDescInput: null as HTMLTextAreaElement | null,
    fileInput: null as HTMLInputElement | null,
    previewImage: null as HTMLImageElement | null,
    clearInspirationButton: null as HTMLButtonElement | null,
    generateButton: null as HTMLButtonElement | null,
    resultsGrid: null as HTMLDivElement | null,
    downloadAllButton: null as HTMLButtonElement | null,
    startOverButton: null as HTMLButtonElement | null,
    statusContainer: null as HTMLDivElement | null,
    statusText: null as HTMLParagraphElement | null,
    progressWrapper: null as HTMLDivElement | null,
    progressBar: null as HTMLDivElement | null,
    nutritionModal: null as HTMLDivElement | null,
    nutritionContent: null as HTMLDivElement | null,
    nutritionCloseButton: null as HTMLButtonElement | null,
    toastContainer: null as HTMLDivElement | null,
    imageCountSelect: null as HTMLSelectElement | null,

    // Option Groups
    shotModeGroup: null as HTMLDivElement | null, categoryGroup: null as HTMLDivElement | null,
    platingGroup: null as HTMLDivElement | null, angleGroup: null as HTMLDivElement | null,
    moodGroup: null as HTMLDivElement | null,

    // Tabs & Views
    generatorTab: null as HTMLButtonElement | null, collectionTab: null as HTMLButtonElement | null,
    generatorView: null as HTMLDivElement | null, collectionView: null as HTMLDivElement | null,

    // State
    state: 'idle' as FoodStylistState,
    sourceImage: null as { dataUrl: string; base64: string; } | null,
    nutritionInfo: null as any | null,
    results: [] as { status: 'pending' | 'done' | 'error', url?: string, prompt: string, errorMessage?: string }[],
    shotMode: 'dramatic', category: 'main-course', plating: 'fine-dining',
    angle: '45-degree', mood: 'luxury', activeView: 'generator', imageCount: 3,

    // Dependencies
    getApiKey: (() => '') as () => string,
    showPreviewModal: ((urls: (string | null)[], startIndex?: number) => {}) as (urls: (string | null)[], startIndex?: number) => void,

    init(dependencies: { getApiKey: () => string; showPreviewModal: (urls: (string | null)[], startIndex?: number) => void; }) {
        this.view = document.querySelector('#food-stylist-view');
        if (!this.view) return;

        // Assign DOM elements
        const selectors = {
            inputStateEl: '#food-stylist-input-state', resultsStateEl: '#food-stylist-results-state',
            dishDescInput: '#food-stylist-dish-desc', fileInput: '#food-stylist-inspiration-image',
            previewImage: '#food-stylist-inspiration-preview', clearInspirationButton: '#food-stylist-clear-inspiration',
            generateButton: '#food-stylist-generate-button', resultsGrid: '#food-stylist-results-grid',
            downloadAllButton: '#food-stylist-download-all-button', startOverButton: '#food-stylist-start-over-button',
            statusContainer: '#food-stylist-status-container', statusText: '#food-stylist-status',
            progressWrapper: '#food-stylist-progress-wrapper', progressBar: '#food-stylist-progress-bar',
            imageCountSelect: '#food-stylist-image-count-select', shotModeGroup: '#food-stylist-shot-mode-group',
            categoryGroup: '#food-stylist-category-group', platingGroup: '#food-stylist-plating-group',
            angleGroup: '#food-stylist-angle-group', moodGroup: '#food-stylist-mood-group',
            generatorTab: '#food-lens-generator-tab', collectionTab: '#food-lens-collection-tab',
            generatorView: '#food-lens-generator-view', collectionView: '#food-lens-collection-view',
        };

        for (const [key, selector] of Object.entries(selectors)) {
            (this as any)[key] = this.view.querySelector(selector);
        }

        // Query global elements separately
        this.nutritionModal = document.querySelector('#food-lens-nutrition-modal');
        this.nutritionContent = document.querySelector('#food-lens-nutrition-content');
        this.nutritionCloseButton = document.querySelector('#food-lens-nutrition-close-button');
        this.toastContainer = document.querySelector('#toast-container');

        // --- FIX: Validate that all critical elements were found ---
        if (Object.values(selectors).some(selector => !this.view!.querySelector(selector)) || !this.nutritionModal) {
            console.error("Food Stylist initialization failed: One or more required elements are missing from the DOM.");
            return;
        }

        this.getApiKey = dependencies.getApiKey;
        this.showPreviewModal = dependencies.showPreviewModal;
        this.addEventListeners();
        this.updateGenerateButton();
        this.render();
    },

    addEventListeners() {
        // Optional chaining is kept as a fallback, but the init check is the primary guard.
        const dropZone = this.view?.querySelector('label[for="food-stylist-inspiration-image"]');
        if (dropZone && this.fileInput) {
            setupDragAndDrop(dropZone as HTMLElement, this.fileInput);
        }
        
        this.dishDescInput?.addEventListener('input', this.updateGenerateButton.bind(this));
        this.fileInput?.addEventListener('change', this.handleUpload.bind(this));
        this.clearInspirationButton?.addEventListener('click', this.handleClearInspiration.bind(this));
        this.generateButton?.addEventListener('click', this.runGeneration.bind(this));
        this.startOverButton?.addEventListener('click', this.handleStartOver.bind(this));
        this.downloadAllButton?.addEventListener('click', this.handleDownloadAll.bind(this));
        this.resultsGrid?.addEventListener('click', this.handleGridClick.bind(this));
        this.imageCountSelect?.addEventListener('change', () => {
            if (this.imageCountSelect) {
                this.imageCount = parseInt(this.imageCountSelect.value, 10);
                this.updateGenerateButton();
            }
        });
        
        this.shotModeGroup?.addEventListener('click', (e) => this.handleOptionClick('shotMode', e));
        this.categoryGroup?.addEventListener('click', (e) => this.handleOptionClick('category', e));
        this.platingGroup?.addEventListener('click', (e) => this.handleOptionClick('plating', e));
        this.angleGroup?.addEventListener('click', (e) => this.handleOptionClick('angle', e));
        this.moodGroup?.addEventListener('click', (e) => this.handleOptionClick('mood', e));

        this.generatorTab?.addEventListener('click', () => this.switchView('generator'));
        this.collectionTab?.addEventListener('click', () => this.switchView('collection'));

        this.nutritionCloseButton?.addEventListener('click', () => {
            if (this.nutritionModal) this.nutritionModal.style.display = 'none';
        });
    },

    handleOptionClick(stateKey: 'shotMode' | 'category' | 'plating' | 'angle' | 'mood', e: MouseEvent) {
        const button = (e.target as HTMLElement).closest('.toggle-button');
        if (button) {
            const value = (button as HTMLElement).dataset.value!;
            (this as any)[stateKey] = value;
            
            const groupMap = {
                shotMode: this.shotModeGroup, category: this.categoryGroup, plating: this.platingGroup,
                angle: this.angleGroup, mood: this.moodGroup,
            };
            const groupEl = groupMap[stateKey];

            if (groupEl) {
                groupEl.querySelectorAll('.toggle-button').forEach(btn => btn.classList.remove('active'));
                button.classList.add('active');
            }
        }
    },
    
    switchView(viewName: 'generator' | 'collection') {
        this.activeView = viewName;
        if (this.generatorView) this.generatorView.style.display = viewName === 'generator' ? 'block' : 'none';
        if (this.collectionView) this.collectionView.style.display = viewName === 'collection' ? 'block' : 'none';
        if (this.generatorTab) this.generatorTab.classList.toggle('active', viewName === 'generator');
        if (this.collectionTab) this.collectionTab.classList.toggle('active', viewName === 'collection');
    },
    
    updateGenerateButton() {
        if (!this.generateButton || !this.dishDescInput) return;
        const hasText = this.dishDescInput.value.trim().length > 0;
        const hasImage = !!this.sourceImage;
        this.generateButton.disabled = !hasText && !hasImage;

        const span = this.generateButton.querySelector('span');
        if (span) {
            span.textContent = `Buat ${this.imageCount} Foto Makanan`;
        }
    },

    render() {
        if (!this.inputStateEl || !this.resultsStateEl || !this.statusContainer || !this.progressWrapper) return;
        
        this.inputStateEl.style.display = this.state === 'idle' ? 'block' : 'none';
        this.resultsStateEl.style.display = (this.state === 'processing' || this.state === 'results') ? 'block' : 'none';
        this.statusContainer.style.display = (this.state === 'processing' || this.state === 'error') ? 'flex' : 'none';
        this.progressWrapper.style.display = this.state === 'processing' ? 'block' : 'none';
        
        if (this.nutritionInfo && this.nutritionContent && this.nutritionModal) {
            this.nutritionContent.innerHTML = `
                <ul>
                    <li><strong>Kalori:</strong> ${this.nutritionInfo.estimasiKalori || 'N/A'}</li>
                    <li><strong>Protein:</strong> ${this.nutritionInfo.proteinGr || 'N/A'} g</li>
                    <li><strong>Karbohidrat:</strong> ${this.nutritionInfo.karbohidratGr || 'N/A'} g</li>
                    <li><strong>Lemak:</strong> ${this.nutritionInfo.lemakGr || 'N/A'} g</li>
                    <li><strong>Potensi Alergen:</strong> ${this.nutritionInfo.potensiAlergen?.join(', ') || 'Tidak diketahui'}</li>
                </ul>`;
            if (this.state === 'results') {
                this.nutritionModal.style.display = 'flex';
            }
        }

        if ((this.state === 'processing' || this.state === 'results') && this.resultsGrid) {
            this.resultsGrid.innerHTML = '';
            this.results.forEach((result, index) => {
                const item = document.createElement('div');
                item.className = 'image-result-item';
                item.dataset.index = String(index);

                if (result.status === 'pending') {
                    item.innerHTML = `<div class="loading-clock"></div>`;
                } else if (result.status === 'error') {
                    // --- FIX: Display the actual error message on hover ---
                    item.innerHTML = `<span class="error-indicator" title="${result.errorMessage || 'Unknown error'}">Error</span>`;
                } else if (result.status === 'done' && result.url) {
                    item.innerHTML = `<img src="${result.url}" alt="Styled food photo ${index + 1}">
                    <div class="affiliate-result-item-overlay">
                        <button class="icon-button" aria-label="Preview image">
                            <svg xmlns="http://www.w3.org/2000/svg" height="20px" viewBox="0 0 24 24" width="20px" fill="currentColor"><path d="M0 0h24v24H0V0z" fill="none"/><path d="M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5C21.27 7.61 17 4.5 12 4.5zm0 10c-2.48 0-4.5-2.02-4.5-4.5S9.52 5.5 12 5.5s4.5 2.02 4.5 4.5-2.02 4.5-4.5 4.5zm0-7C10.62 7.5 9.5 8.62 9.5 10s1.12 2.5 2.5 2.5 2.5-1.12 2.5-2.5S13.38 7.5 12 7.5z"/></svg>
                        </button>
                    </div>`;
                }
                this.resultsGrid.appendChild(item);
            });
        }
    },

    async handleUpload(e: Event) {
        if (!this.previewImage || !this.dishDescInput || !this.statusText || !this.clearInspirationButton) return;
        const file = (e.target as HTMLInputElement).files?.[0];
        if (!file) return;

        try {
            const dataUrl = await blobToDataUrl(file);
            this.sourceImage = {
                dataUrl,
                // --- FIX: More robust Base64 parsing ---
                base64: dataUrl.substring(dataUrl.indexOf(',') + 1),
            };
            this.previewImage.src = dataUrl;
            this.previewImage.classList.remove('image-preview-hidden');
            this.dishDescInput.value = '';
            this.dishDescInput.disabled = true;
            this.clearInspirationButton.style.display = 'inline-flex';
            this.updateGenerateButton();
        } catch (error: any) {
            this.state = 'error';
            this.statusText.textContent = `Kesalahan memproses file: ${error.message}`;
            this.render();
        }
    },

    handleClearInspiration() {
        if (!this.previewImage || !this.dishDescInput || !this.fileInput || !this.clearInspirationButton) return;
        this.sourceImage = null;
        this.fileInput.value = '';
        this.previewImage.src = '#';
        this.previewImage.classList.add('image-preview-hidden');
        this.dishDescInput.disabled = false;
        this.clearInspirationButton.style.display = 'none';
        this.updateGenerateButton();
    },

    async runGeneration() {
        if (!this.dishDescInput || !this.progressBar || !this.statusText) return;
        const hasText = this.dishDescInput.value.trim().length > 0;
        if (!hasText && !this.sourceImage) return;

        this.state = 'processing';
        this.nutritionInfo = null;
        this.results = Array.from({ length: this.imageCount }, (_, i) => ({ 
            prompt: PROMPT_PACK[i % PROMPT_PACK.length], // Use modulo to prevent out-of-bounds
            status: 'pending', 
        }));
        this.progressBar.style.width = '0%';
        this.render();

        const nutritionPromise = this.sourceImage ? this.analyzeNutrition() : Promise.resolve();
        this.statusText.textContent = 'Membuat gambar bergaya...';

        let completedJobs = 0;
        const totalJobs = this.results.length;
        const updateProgress = () => {
            completedJobs++;
            const progress = (completedJobs / totalJobs) * 100;
            if (this.progressBar) this.progressBar.style.width = `${progress}%`;
        };
        
        const baseSubject = this.sourceImage ? 'foto makanan ini' : `sebuah hidangan dari: "${this.dishDescInput.value.trim()}"`;

        const generationPromises = this.results.map(async (result, index) => {
            try {
                const fullPrompt = `Buat ulang ${baseSubject}. Foto baru harus fotorealistis, resolusi tinggi, dan ditata sebagai berikut:\n- **Gaya Dasar**: ${result.prompt}\n- **Mode**: ${this.shotMode}\n- **Kategori Makanan**: ${this.category}\n- **Gaya Plating**: ${this.plating}\n- **Sudut Pengambilan Gambar**: ${this.angle}\n- **Suasana Merek**: ${this.mood}`;
                
                const imageBase64 = this.sourceImage ? this.sourceImage.base64 : null;
                let imageUrl = '';
                
                if (imageBase64) {
                    const response = await withRetry(() =>
                        generateStyledImage(imageBase64, null, fullPrompt, this.getApiKey), {
                            retries: 2, delayMs: 1000,
                            onRetry: (attempt, error) => console.warn(`FoodStylist generation attempt ${attempt} failed. Retrying...`, error)
                        }
                    );
                    const imagePart = response.candidates?.[0]?.content?.parts.find(p => p.inlineData);
                    if (imagePart?.inlineData) {
                        imageUrl = `data:${imagePart.inlineData.mimeType};base64,${imagePart.inlineData.data}`;
                    } else {
                        throw new Error("Tidak ada data gambar dalam respons.");
                    }
                } else {
                    imageUrl = await withRetry(() =>
                        generateImage(fullPrompt, this.getApiKey), {
                            retries: 2, delayMs: 1000,
                            onRetry: (attempt, error) => console.warn(`FoodStylist text-to-image attempt ${attempt} failed. Retrying...`, error)
                        }
                    );
                }

                if (imageUrl) {
                    this.results[index] = { ...result, status: 'done', url: imageUrl };
                } else {
                    throw new Error("Gagal membuat URL gambar.");
                }

            } catch (e: any) {
                console.error(`Error generating image ${index}:`, e);
                this.results[index] = { ...result, status: 'error', errorMessage: parseAndFormatErrorMessage(e, 'Pembuatan gambar') };
            } finally {
                updateProgress();
                this.render();
            }
        });

        await Promise.allSettled([...generationPromises, nutritionPromise]);

        this.state = 'results';
        this.render();
    },

    async analyzeNutrition() {
        if (!this.sourceImage) return;
        try {
            const prompt = "Analisis gambar makanan ini dan berikan perkiraan nutrisi. Jika bukan makanan, nyatakan demikian.";
            
            const jsonString = await withRetry(() =>
                generateStructuredTextFromImage(prompt, this.sourceImage!.base64, this.getApiKey, nutritionSchema), {
                    retries: 2, delayMs: 1000,
                    onRetry: (attempt, error) => console.warn(`Nutrition analysis attempt ${attempt} failed. Retrying...`, error)
                }
            );
            
            this.nutritionInfo = JSON.parse(jsonString);
        } catch (e: any) {
            console.error("Nutrition analysis failed:", e);
            this.nutritionInfo = null;
            this.showToast('Gagal menganalisis nutrisi.', 'error');
        }
    },
    
    async handleDownloadAll() {
        const successfulResults = this.results.filter(r => r.status === 'done' && r.url);
        if (successfulResults.length === 0) return;

        for (let i = 0; i < successfulResults.length; i++) {
            const result = successfulResults[i];
            downloadFile(result.url!, `food-style-${i + 1}.png`);
            await delay(300);
        }
    },

    handleGridClick(e: MouseEvent) {
        e.preventDefault();
        e.stopPropagation();
        
        const item = (e.target as HTMLElement).closest('.image-result-item');
        if (!item) return;

        const index = parseInt((item as HTMLElement).dataset.index!, 10);
        const clickedResult = this.results[index];
        if (clickedResult.status !== 'done' || !clickedResult.url) return;

        const urls = this.results.filter(r => r.status === 'done' && r.url).map(r => r.url!);
        const startIndex = urls.indexOf(clickedResult.url);
        
        if (startIndex > -1) {
            this.showPreviewModal(urls, startIndex);
        }
    },

    handleStartOver() {
        this.state = 'idle';
        this.handleClearInspiration();
        this.nutritionInfo = null;
        this.results = [];
        if (this.nutritionModal) this.nutritionModal.style.display = 'none';
        
        this.imageCount = 3;
        if(this.imageCountSelect) {
            this.imageCountSelect.value = '3';
        }

        this.updateGenerateButton();
        this.render();
    },

    showToast(message: string, type: 'success' | 'error' = 'success') {
        if (!this.toastContainer) {
            console.warn('Toast container not found. Cannot show notification.');
            return;
        }
        const toast = document.createElement('div');
        toast.className = `toast-notification ${type}`;
        toast.textContent = message;
        this.toastContainer.appendChild(toast);
        setTimeout(() => {
            toast.remove();
        }, 3000);
    },
};