/* tslint:disable */
/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { blobToDataUrl, delay, downloadFile, setupDragAndDrop, withRetry } from "../utils/helpers.ts";
// FIX: The missing functions are now implemented and exported from gemini.ts.
import { generateStoryboard, generateImage, generateTTS, generateVideoContent } from "../utils/gemini.ts";

type StoryboardState = 'idle' | 'generating' | 'results';

// Interfaces for the new, richer data structure
interface Hook {
    text: string;
    score: number;
    reason: string;
}

interface Scene {
    id: number;
    title: string;
    durationSec: number;
    shotType: string;
    visualDescription: string;
    voiceOver: string;
    onScreenText?: string | null;
    sfxMusic: string;
    imagePrompt: string;
    safetyNotes?: string | null;
    // UI state properties
    generatedImageUrl?: string;
    isGeneratingImage?: boolean;
    imageGenerationError?: boolean;
    isGeneratingTTS?: boolean;
    ttsAudioUrl?: string;
    isVideoGenerating?: boolean;
    videoUrl?: string;
    videoGenerationError?: boolean;
    videoStatusText?: string;
}

interface StoryboardData {
    product: { title: string; summary: string; };
    style: { vibe: string; lighting: string; contentType: string; aspectRatio: string; };
    brandTone: string;
    durationTotalSec: number;
    scenes: Scene[];
    callToAction: string;
    suggestedHooks: Hook[];
}

interface StoryboardCampaign {
    audience: string;
    data: StoryboardData;
}

export const Storyboard = {
    // DOM Elements
    view: document.querySelector('#storyboard-view') as HTMLDivElement,
    inputStateEl: document.querySelector('#storyboard-input-state') as HTMLDivElement,
    resultsStateEl: document.querySelector('#storyboard-results-state') as HTMLDivElement,
    statusContainerEl: document.querySelector('#storyboard-status-container') as HTMLDivElement,
    statusEl: document.querySelector('#storyboard-status') as HTMLParagraphElement,
    generateButton: document.querySelector('#storyboard-generate-button') as HTMLButtonElement,
    startOverButton: document.querySelector('#storyboard-start-over-button') as HTMLButtonElement,
    toastContainer: document.querySelector('#toast-container') as HTMLDivElement,
    
    // Input Form Elements
    productImageInput: document.querySelector('#storyboard-product-image') as HTMLInputElement,
    productImagePreview: document.querySelector('#storyboard-product-image-preview') as HTMLImageElement,
    productImageLabel: document.querySelector('#storyboard-product-image-label') as HTMLSpanElement,
    clearProductImageButton: document.querySelector('#storyboard-clear-product-image') as HTMLButtonElement,
    productDescInput: document.querySelector('#storyboard-product-desc') as HTMLTextAreaElement,
    brandNameInput: document.querySelector('#storyboard-brand-name') as HTMLInputElement,
    targetAudienceInput: document.querySelector('#storyboard-target-audience') as HTMLInputElement,
    ctaInput: document.querySelector('#storyboard-cta-input') as HTMLInputElement,
    
    // Character Lock Elements
    characterLockContainer: document.querySelector('#storyboard-character-lock-container') as HTMLDivElement,
    characterLockToggle: document.querySelector('#storyboard-character-lock-toggle') as HTMLInputElement,
    
    // Creative Option Groups
    sceneCountGroup: document.querySelector('#storyboard-scene-count-group') as HTMLDivElement,
    narrativeStyleGroup: document.querySelector('#storyboard-narrative-style-group') as HTMLDivElement,
    voiceStyleGroup: document.querySelector('#storyboard-voice-style-group') as HTMLDivElement,
    aspectRatioGroup: document.querySelector('#storyboard-aspect-ratio-group') as HTMLDivElement,
    videoModelGroup: document.querySelector('#storyboard-video-model-group') as HTMLDivElement,

    // Results Elements
    campaignTabsContainer: document.querySelector('#storyboard-campaign-tabs') as HTMLDivElement,
    hookSuggestionsContainer: document.querySelector('#storyboard-hook-suggestions-container') as HTMLDivElement,
    sceneGridEl: document.querySelector('#storyboard-scene-grid') as HTMLDivElement,
    resultsPlaceholder: document.querySelector('#storyboard-results-placeholder') as HTMLDivElement,
    exportJsonButton: document.querySelector('#storyboard-export-json') as HTMLButtonElement,
    exportTxtButton: document.querySelector('#storyboard-export-txt') as HTMLButtonElement,
    exportSrtButton: document.querySelector('#storyboard-export-srt') as HTMLButtonElement,
    copyPromptsButton: document.querySelector('#storyboard-copy-prompts') as HTMLButtonElement,
    downloadAllVideosButton: document.querySelector('#storyboard-download-all-videos') as HTMLButtonElement,

    // State
    state: 'idle' as StoryboardState,
    productImageBase64: null as string | null,
    isCharacterLocked: false,
    storyboardCampaign: null as StoryboardCampaign[] | null,
    activeAudienceIndex: 0,
    currentAudio: null as HTMLAudioElement | null,
    // Creative options state
    cta: '',
    sceneCount: '6',
    narrativeStyle: 'Dramatic',
    voiceStyle: 'natural',
    aspectRatio: '16:9',
    videoModel: 'veo-2.0-generate-001',
    voiceNameMap: { natural: 'Kore', formal: 'Zephyr', friendly: 'Kore', energetic: 'Puck' } as { [key: string]: string },

    // Dependencies
    getApiKey: (() => '') as () => string,
    showPreviewModal: ((urls: (string | null)[], startIndex?: number) => {}) as (urls: (string | null)[], startIndex?: number) => void,

    init(dependencies: { getApiKey: () => string; showPreviewModal: (urls: (string | null)[], startIndex?: number) => void; }) {
        if (!this.view) return;
        this.getApiKey = dependencies.getApiKey;
        this.showPreviewModal = dependencies.showPreviewModal;

        this.addEventListeners();
        this.updateCreativeOptionsUI();
        this.render();
    },

    addEventListeners() {
        // Setup Drag and Drop
        const dropZone = this.productImageInput.closest('.file-drop-zone') as HTMLElement;
        setupDragAndDrop(dropZone, this.productImageInput);

        this.productImageInput.addEventListener('change', this.handleProductImageUpload.bind(this));
        this.clearProductImageButton.addEventListener('click', this.clearProductImage.bind(this));
        this.productDescInput.addEventListener('input', () => this.render());
        this.ctaInput.addEventListener('input', () => this.cta = this.ctaInput.value.trim());
        
        // Character Lock Listener
        this.characterLockToggle.addEventListener('change', () => {
            this.isCharacterLocked = this.characterLockToggle.checked;
        });

        this.generateButton.addEventListener('click', this.handleGenerateStoryboard.bind(this));
        this.startOverButton.addEventListener('click', this.handleStartOver.bind(this));
        
        // Creative option buttons
        const optionGroups = [this.sceneCountGroup, this.narrativeStyleGroup, this.voiceStyleGroup, this.aspectRatioGroup, this.videoModelGroup];
        optionGroups.forEach(group => {
            group.addEventListener('click', (e) => this.handleCreativeOptionClick(e, group.id));
        });

        // Results view event delegation
        this.resultsStateEl.addEventListener('click', this.handleResultsStateClick.bind(this));
        this.sceneGridEl.addEventListener('input', this.handleInlineEdit.bind(this));
        this.campaignTabsContainer.addEventListener('click', this.handleTabClick.bind(this));

        // Export listeners
        this.exportSrtButton.addEventListener('click', () => this.exportData('srt'));
        this.exportJsonButton.addEventListener('click', () => this.exportData('json'));
        this.exportTxtButton.addEventListener('click', () => this.exportData('txt'));
        this.copyPromptsButton.addEventListener('click', this.copyAllPrompts.bind(this));
        this.downloadAllVideosButton.addEventListener('click', this.handleDownloadAllVideos.bind(this));
    },

    updateCreativeOptionsUI() {
        const updateGroup = (group: HTMLElement, selectedValue: string) => {
            group.querySelectorAll('.creative-option-button').forEach(btn => {
                (btn as HTMLButtonElement).classList.toggle('active', (btn as HTMLElement).dataset.value === selectedValue);
            });
        };
        updateGroup(this.sceneCountGroup, this.sceneCount);
        updateGroup(this.narrativeStyleGroup, this.narrativeStyle);
        updateGroup(this.voiceStyleGroup, this.voiceStyle);
        updateGroup(this.aspectRatioGroup, this.aspectRatio);
        updateGroup(this.videoModelGroup, this.videoModel);
    },

    handleCreativeOptionClick(e: MouseEvent, groupId: string) {
        const button = (e.target as HTMLElement).closest('.creative-option-button');
        if (!button) return;
        const value = (button as HTMLElement).dataset.value;
        if (!value) return;

        switch(groupId) {
            case 'storyboard-scene-count-group': this.sceneCount = value; break;
            case 'storyboard-narrative-style-group': this.narrativeStyle = value; break;
            case 'storyboard-voice-style-group': this.voiceStyle = value; break;
            case 'storyboard-aspect-ratio-group': this.aspectRatio = value; break;
            case 'storyboard-video-model-group': this.videoModel = value; break;
        }
        this.updateCreativeOptionsUI();
    },

    async handleProductImageUpload(e: Event) {
        const file = (e.target as HTMLInputElement).files?.[0];
        if (!file) return;

        const dataUrl = await blobToDataUrl(file);
        this.productImageBase64 = dataUrl.split(',')[1];
        this.productImagePreview.src = dataUrl;
        this.productImagePreview.classList.remove('image-preview-hidden');
        this.clearProductImageButton.style.display = 'flex';
        this.productImageLabel.style.display = 'none';
        this.characterLockContainer.style.display = 'flex';
    },

    clearProductImage() {
        this.productImageInput.value = '';
        this.productImageBase64 = null;
        this.productImagePreview.src = '#';
        this.productImagePreview.classList.add('image-preview-hidden');
        this.clearProductImageButton.style.display = 'none';
        this.productImageLabel.style.display = 'block';
        this.characterLockContainer.style.display = 'none';
        this.characterLockToggle.checked = false;
        this.isCharacterLocked = false;
    },
    
    render() {
        this.inputStateEl.style.display = this.state === 'idle' ? 'block' : 'none';
        this.resultsStateEl.style.display = (this.state === 'generating' || this.state === 'results') ? 'block' : 'none';
        this.statusContainerEl.style.display = (this.state === 'idle') ? 'none' : 'flex';
        
        this.generateButton.disabled = this.state === 'generating' || this.productDescInput.value.trim() === '';
        
        if (this.state === 'generating') {
            this.statusEl.textContent = 'Mempersiapkan kampanye...';
            this.resultsPlaceholder.style.display = 'flex';
            this.campaignTabsContainer.innerHTML = '';
            this.hookSuggestionsContainer.style.display = 'none';
            this.sceneGridEl.innerHTML = '';
        } else if (this.state === 'results' && this.storyboardCampaign) {
            this.resultsPlaceholder.style.display = 'none';
            this.populateResults();
        } else {
            this.statusEl.textContent = '';
        }
    },

    buildStoryboardPrompt(targetAudience: string): string {
        const { sceneCount, cta, narrativeStyle, voiceStyle, aspectRatio } = this;
        const productDesc = this.productDescInput.value.trim();
        const brandName = this.brandNameInput.value.trim();

        let prompt = `Buat storyboard iklan ${sceneCount} adegan yang sangat menarik untuk produk: "${productDesc}".\n`;
        if (brandName) prompt += `Mereknya adalah "${brandName}".\n`;
        prompt += `Target audiens spesifik untuk versi ini adalah: "${targetAudience}". Sesuaikan naskah, visual, dan nada agar sangat beresonansi dengan grup ini.\n`;
        
        prompt += `Gaya narasi utamanya adalah "${narrativeStyle}".\n`;
        prompt += `Naskah sulih suara harus cocok dengan gaya suara yang ${voiceStyle} dan menggunakan Bahasa Indonesia.\n`;
        prompt += `Rasio aspek untuk visual video harus ${aspectRatio}.\n`;

        // Shot Variety Pack Instructions
        prompt += `Strukturkan adegan menggunakan variasi bidikan sinematik. Aturan umum: Adegan pertama harus berupa 'establishing shot', adegan tengah harus mencakup 'hero shot' produk dan 'close-up detail', dan adegan lainnya harus berupa 'lifestyle usage shots' yang menunjukkan produk sedang digunakan oleh target audiens.\n`;

        // AI Sync Check Instructions
        prompt += `PENTING (AI Sync Check): Pastikan ada sinkronisasi sempurna antara 'visualDescription', 'voiceOver', dan 'imagePrompt' untuk setiap adegan. 'imagePrompt' HARUS menjadi terjemahan visual yang harfiah dan sangat deskriptif dari apa yang terjadi dalam 'visualDescription' dan 'voiceOver'. Contoh: jika naskah mengatakan "serum menetes dari pipet", prompt gambar HARUS menggambarkan itu dengan tepat, bukan hanya botol yang tertutup.\n`;

        if (cta) {
            prompt += `Untuk adegan terakhir, sertakan ajakan bertindak (call to action) berikut: "${cta}".\n`;
        } else {
            prompt += `Di adegan terakhir, sertakan ajakan bertindak (call to action) yang relevan.\n`;
        }
        
        // Hook Generator Instructions
        prompt += `Juga, berikan 3-5 'hook' (judul) yang menarik yang disesuaikan untuk audiens ini. Untuk setiap hook, berikan skor keterlibatan dari 1-10 dan alasan singkat untuk skor tersebut.`;
        
        return prompt;
    },

    async handleGenerateStoryboard() {
        if (this.productDescInput.value.trim() === '') return;

        this.state = 'generating';
        this.activeAudienceIndex = 0;
        this.storyboardCampaign = [];
        this.render();

        const audiences = this.targetAudienceInput.value.split(',')
            .map(a => a.trim())
            .filter(Boolean);
        if (audiences.length === 0) audiences.push('Umum');

        for (let i = 0; i < audiences.length; i++) {
            const audience = audiences[i];
            try {
                this.statusEl.textContent = `Membuat storyboard untuk audiens: ${audience} (${i + 1}/${audiences.length})...`;
                const prompt = this.buildStoryboardPrompt(audience);
                
                const result = await withRetry(
                    () => generateStoryboard(prompt, this.productImageBase64, this.getApiKey),
                    {
                        retries: 2,
                        delayMs: 1000,
                        onRetry: (attempt, err) => {
                            console.warn(`Attempt ${attempt}: Storyboard generation failed. Retrying...`, err);
                            this.statusEl.textContent = `Terjadi masalah. Mencoba lagi... (Percobaan ${attempt})`;
                        }
                    }
                );
                
                this.storyboardCampaign.push({ audience, data: result });

            } catch(e: any) {
                console.error(`Error generating storyboard for ${audience}:`, e);
                this.showToast(`Gagal membuat storyboard untuk ${audience}.`, 'error');
                // Create a dummy entry to show the failure
                this.storyboardCampaign.push({ audience, data: null as any });
            }
        }

        this.state = 'results';
        this.render(); 
        
        // Start generating images for the first active storyboard
        const activeData = this.storyboardCampaign[this.activeAudienceIndex]?.data;
        if (activeData) {
            activeData.scenes.forEach(scene => {
                scene.isGeneratingImage = true;
                scene.generatedImageUrl = undefined;
                scene.imageGenerationError = false;
            });
            this.populateResults();
            this.generateAllSceneImages();
        }
    },

    async generateAllSceneImages() {
        const campaign = this.storyboardCampaign?.[this.activeAudienceIndex];
        if (!campaign?.data) return;
    
        this.statusEl.textContent = `Membuat gambar adegan (0/${campaign.data.scenes.length})...`;
        let completedCount = 0;
    
        const imagePromises = campaign.data.scenes.map(async (scene, index) => {
            await this.handleGenerateSceneImage(index);
            completedCount++;
            this.statusEl.textContent = `Membuat gambar adegan (${completedCount}/${campaign.data.scenes.length})...`;
        });
    
        await Promise.all(imagePromises);
        this.statusEl.textContent = `Semua gambar adegan untuk "${campaign.audience}" berhasil dibuat.`;
        this.showToast('Semua gambar adegan berhasil dibuat!');
    },
    
    populateResults() {
        if (!this.storyboardCampaign) return;

        // Populate campaign tabs
        this.campaignTabsContainer.innerHTML = this.storyboardCampaign.map((campaign, index) =>
            `<button class="campaign-tab ${index === this.activeAudienceIndex ? 'active' : ''}" data-index="${index}">${campaign.audience}</button>`
        ).join('');
        this.campaignTabsContainer.style.display = this.storyboardCampaign.length > 1 ? 'flex' : 'none';
        
        const activeCampaign = this.storyboardCampaign[this.activeAudienceIndex];
        const storyboardData = activeCampaign?.data;

        if (!storyboardData) {
            this.hookSuggestionsContainer.style.display = 'none';
            this.sceneGridEl.innerHTML = `<p class="pending-status-text" style="text-align:center; padding: 2rem;">Gagal membuat storyboard untuk audiens ini.</p>`;
            return;
        }

        // Populate hooks
        const sortedHooks = [...storyboardData.suggestedHooks].sort((a, b) => b.score - a.score);
        this.hookSuggestionsContainer.innerHTML = `<h3>Saran Judul / Hook</h3>` +
            sortedHooks.map((hook, index) => {
                const isBest = index === 0;
                return `
                <div class="hook-item ${isBest ? 'best-hook' : ''}">
                    <p>${hook.text}</p>
                    <div class="hook-item-meta">
                        ${isBest ? '<span class="best-hook-badge">Terbaik</span>' : ''}
                        <span class="hook-score" title="${hook.reason}">Skor: ${hook.score}/10</span>
                        <button class="icon-button copy-hook-button" data-text="${encodeURIComponent(hook.text)}" aria-label="Copy hook" title="Salin Hook">
                            <svg xmlns="http://www.w3.org/2000/svg" height="20px" viewBox="0 0 24 24" width="20px" fill="currentColor"><path d="M0 0h24v24H0z" fill="none"/><path d="M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0 -1.1-.9-2-2-2zm0 16H8V7h11v14z"/></svg>
                        </button>
                    </div>
                </div>`;
            }).join('');
        this.hookSuggestionsContainer.style.display = 'block';
        
        // IMPROVEMENT: Instead of re-rendering the whole grid, create the initial structure.
        // Subsequent updates will be targeted to individual cards.
        this.sceneGridEl.innerHTML = storyboardData.scenes.map((s, i) => this.getSceneCardHTML(s, i)).join('');
        
        const hasVideos = storyboardData.scenes.some(s => s.videoUrl);
        this.downloadAllVideosButton.style.display = hasVideos ? 'inline-flex' : 'none';
    },
    
    // IMPROVEMENT: This function updates a single scene card instead of the whole grid.
    // This is more performant and prevents UI issues like losing input focus.
    updateSceneCard(index: number) {
        const campaign = this.storyboardCampaign?.[this.activeAudienceIndex];
        const scene = campaign?.data?.scenes[index];
        if (!scene) return;

        const card = this.sceneGridEl.querySelector(`#scene-card-${index}`);
        if (card) {
            card.outerHTML = this.getSceneCardHTML(scene, index);
        }

        const hasVideos = campaign.data.scenes.some(s => s.videoUrl);
        this.downloadAllVideosButton.style.display = hasVideos ? 'inline-flex' : 'none';
    },

    getSceneCardHTML(scene: Scene, index: number): string {
        // --- Image Container Content ---
        const previewSVG = `<svg xmlns="http://www.w3.org/2000/svg" height="20px" viewBox="0 0 24 24" width="20px" fill="currentColor"><path d="M0 0h24v24H0V0z" fill="none"/><path d="M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5C21.27 7.61 17 4.5 12 4.5zm0 10c-2.48 0-4.5-2.02-4.5-4.5S9.52 5.5 12 5.5s4.5 2.02 4.5 4.5-2.02 4.5-4.5 4.5zm0-7C10.62 7.5 9.5 8.62 9.5 10s1.12 2.5 2.5 2.5 2.5-1.12 2.5-2.5S13.38 7.5 12 7.5z"/></svg>`;
        const regenerateSVG = `<svg xmlns="http://www.w3.org/2000/svg" height="20px" viewBox="0 0 24 24" width="20px" fill="currentColor"><path d="M0 0h24v24H0V0z" fill="none"/><path d="M12.5 8c-2.65 0-5.05.99-6.9 2.6L2 7v9h9l-3.62-3.62c1.39-1.16 3.16-1.88 5.12-1.88 3.54 0 6.55 2.31 7.6 5.5l2.37-.78C21.08 11.03 17.15 8 12.5 8z"/></svg>`;
        const videoSVG = `<svg xmlns="http://www.w3.org/2000/svg" height="20px" viewBox="0 0 24 24" width="20px" fill="currentColor"><path d="M0 0h24v24H0V0z" fill="none"/><path d="M17 10.5V7c0-.55-.45-1-1-1H4c-.55 0-1 .45-1 1v10c0 .55.45 1 1 1h12c.55 0 1-.45 1-1v-3.5l4 4v-11l-4 4z"/></svg>`;
        const playSVG = `<svg xmlns="http://www.w3.org/2000/svg" height="20px" viewBox="0 0 24 24" width="20px" fill="currentColor"><path d="M0 0h24v24H0V0z" fill="none"/><path d="M10 16.5l6-4.5-6-4.5v9zM12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8z"/></svg>`;
        const downloadSVG = `<svg xmlns="http://www.w3.org/2000/svg" height="20px" viewBox="0 0 24 24" width="20px" fill="currentColor"><path d="M0 0h24v24H0V0z" fill="none"/><path d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z"/></svg>`;

        let imageContainerContent = '';
        if (scene.videoUrl) {
            imageContainerContent = `<video src="${scene.videoUrl}" autoplay loop muted></video>`;
        } else if (scene.generatedImageUrl) {
            imageContainerContent = `<img src="${scene.generatedImageUrl}" alt="${scene.visualDescription}">`;
        } else if (scene.isGeneratingImage) {
            imageContainerContent = '<div class="loading-clock"></div>';
        } else if (scene.imageGenerationError) {
            imageContainerContent = `<div style="text-align: center; color: var(--color-text-muted); font-size: 0.9rem; padding: 0.5rem;">Gagal</div>`;
        } else {
             imageContainerContent = `<button class="secondary-button generate-scene-image-button" data-index="${index}">Buat Gambar</button>`;
        }
        
        let imageOverlay = '';
        if (scene.videoUrl) {
            imageOverlay = `
            <div class="storyboard-image-overlay">
                <button class="icon-button preview-scene-media-button" data-index="${index}" aria-label="Pratinjau video">${previewSVG}</button>
                <button class="icon-button download-scene-video-button" data-index="${index}" aria-label="Unduh video">${downloadSVG}</button>
            </div>`;
        } else if (scene.generatedImageUrl) {
            imageOverlay = `
            <div class="storyboard-image-overlay">
                <button class="icon-button preview-scene-media-button" data-index="${index}" aria-label="Pratinjau gambar">${previewSVG}</button>
                <button class="icon-button regenerate-scene-image-button" data-index="${index}" aria-label="Buat ulang gambar">${regenerateSVG}</button>
            </div>`;
        } else if (scene.imageGenerationError) {
            imageOverlay = `
            <div class="storyboard-image-overlay" style="opacity: 1; background-color: rgba(0,0,0,0.5);">
                <button class="icon-button regenerate-scene-image-button" data-index="${index}" aria-label="Coba lagi">${regenerateSVG}</button>
            </div>`;
        }
        
        let videoStatusOverlay = '';
        if (scene.isVideoGenerating) videoStatusOverlay = `<div class="video-generation-status">${scene.videoStatusText || 'Membuat video...'}</div>`;
        if (scene.videoGenerationError) videoStatusOverlay = `<div class="video-generation-status" style="background-color: #dc3545; color: white;">Video Gagal. Coba lagi.</div>`;
        
        // --- Audio Actions Content ---
        let audioActionsContent = '';
        if (scene.isGeneratingTTS) {
            audioActionsContent = '<div class="loading-clock"></div>';
        } else {
            audioActionsContent = `
                <button class="icon-button play-tts-button" data-index="${index}" aria-label="Putar Audio" ${scene.ttsAudioUrl ? '' : 'disabled'}>${playSVG}</button>
                <button class="icon-button generate-tts-button" data-index="${index}" aria-label="Buat Audio">${regenerateSVG}</button>
                <button class="icon-button download-tts-button" data-index="${index}" aria-label="Unduh Audio" ${scene.ttsAudioUrl ? '' : 'disabled'}>${downloadSVG}</button>
            `;
        }
        
        // --- Video Actions Content ---
        let videoActionsContent = '';
        if ((scene.generatedImageUrl && !scene.isVideoGenerating && !scene.videoUrl) || scene.videoGenerationError) {
             videoActionsContent = `
             <div class="scene-video-actions">
                 <button class="secondary-button storyboard-create-video-button" data-index="${index}">
                     ${videoSVG}
                     <span>${scene.videoGenerationError ? 'Coba Lagi Video' : 'Buat Video'}</span>
                 </button>
             </div>`;
        }

        return `
        <div class="storyboard-scene-card" id="scene-card-${index}">
            <div class="scene-header">
                <h4 contenteditable="true" data-field="title" data-index="${index}">${scene.title} (${scene.durationSec}s)</h4>
                <span class="scene-shot-type">${scene.shotType}</span>
            </div>
            <div class="scene-main-content">
                <div class="scene-image-container">
                    ${imageContainerContent}
                    ${imageOverlay}
                    ${videoStatusOverlay}
                </div>
                <div class="scene-details">
                    <div class="scene-field">
                        <label>Deskripsi Visual</label>
                        <p contenteditable="true" data-field="visualDescription" data-index="${index}">${scene.visualDescription}</p>
                    </div>
                    <div class="scene-field">
                        <label>Naskah VO</label>
                        <textarea contenteditable="true" rows="3" data-field="voiceOver" data-index="${index}" style="width: 100%; border-radius: 4px;">${scene.voiceOver}</textarea>
                        <div class="scene-audio-actions">
                            ${audioActionsContent}
                        </div>
                    </div>
                </div>
            </div>
            ${videoActionsContent}
        </div>
        `;
    },

    handleTabClick(e: MouseEvent) {
        const target = e.target as HTMLElement;
        const button = target.closest('.campaign-tab');
        if (!button) return;

        const index = parseInt((button as HTMLElement).dataset.index!, 10);
        if (index === this.activeAudienceIndex) return;

        this.activeAudienceIndex = index;
        this.populateResults();

        // Check if images need to be generated for this newly selected tab
        const activeData = this.storyboardCampaign?.[this.activeAudienceIndex]?.data;
        if (activeData && !activeData.scenes[0].generatedImageUrl && !activeData.scenes[0].isGeneratingImage) {
            activeData.scenes.forEach(scene => {
                scene.isGeneratingImage = true;
                scene.generatedImageUrl = undefined;
            });
            this.populateResults();
            this.generateAllSceneImages();
        }
    },

    async handleResultsStateClick(e: MouseEvent) {
        const target = e.target as HTMLElement;
        const indexAttr = target.closest('[data-index]')?.getAttribute('data-index');
        if (indexAttr === null || indexAttr === undefined) return;
        const index = parseInt(indexAttr, 10);
        
        const regenerateBtn = target.closest('.regenerate-scene-image-button');
        const previewBtn = target.closest('.preview-scene-media-button');
        const createVideoBtn = target.closest('.storyboard-create-video-button');
        const playTtsBtn = target.closest('.play-tts-button');
        const generateTtsBtn = target.closest('.generate-tts-button');
        const downloadTtsBtn = target.closest('.download-tts-button');
        const downloadVideoBtn = target.closest('.download-scene-video-button');
        const copyHookBtn = target.closest('.copy-hook-button');

        if (regenerateBtn) this.handleGenerateSceneImage(index);
        else if (previewBtn) this.handlePreviewSceneMedia(index);
        else if (createVideoBtn) this.handleGenerateSceneVideo(index);
        else if (playTtsBtn) this.handlePlayTTS(index);
        else if (generateTtsBtn) this.handleGenerateTTS(index);
        else if (downloadTtsBtn) this.handleDownloadTTS(index);
        else if (downloadVideoBtn) {
            const scene = this.storyboardCampaign?.[this.activeAudienceIndex]?.data?.scenes[index];
            if (scene?.videoUrl) {
                downloadFile(scene.videoUrl, `scene_${scene.id}_video.mp4`);
            }
        }
        else if (copyHookBtn) {
            const text = decodeURIComponent(copyHookBtn.getAttribute('data-text')!);
            navigator.clipboard.writeText(text).then(() => {
                this.showToast('Hook disalin!');
            });
        }
    },

    handlePreviewSceneMedia(index: number) {
        const scene = this.storyboardCampaign?.[this.activeAudienceIndex]?.data?.scenes[index];
        const urlToPreview = scene?.videoUrl || scene?.generatedImageUrl;
        if (urlToPreview) {
            this.showPreviewModal([urlToPreview], 0);
        }
    },

    async handleGenerateSceneImage(index: number) {
        const campaign = this.storyboardCampaign?.[this.activeAudienceIndex];
        if (!campaign?.data) return;

        const scene = campaign.data.scenes[index];
        scene.isGeneratingImage = true;
        scene.imageGenerationError = false;
        this.updateSceneCard(index);

        try {
            const prompt = scene.imagePrompt;
            // Use product image for consistency if character is locked
            const consistencyImage = this.isCharacterLocked ? this.productImageBase64 : null;
            
            const imageUrl = await withRetry(
                () => generateImage(prompt, this.getApiKey, consistencyImage),
                {
                    retries: 2,
                    delayMs: 1000,
                    onRetry: (attempt, err) => {
                        console.warn(`Attempt ${attempt}: Scene image generation failed for scene ${index}. Retrying...`, err);
                    }
                }
            );
            
            scene.generatedImageUrl = imageUrl;
        } catch(e) {
            console.error(`Error generating image for scene ${index}:`, e);
            scene.imageGenerationError = true;
        } finally {
            scene.isGeneratingImage = false;
            this.updateSceneCard(index);
        }
    },

    async handleGenerateTTS(index: number) {
        const campaign = this.storyboardCampaign?.[this.activeAudienceIndex];
        if (!campaign?.data) return;

        const scene = campaign.data.scenes[index];
        scene.isGeneratingTTS = true;
        this.updateSceneCard(index);

        try {
            const voiceName = this.voiceNameMap[this.voiceStyle] || 'Kore';

            const audioDataUrl = await withRetry(
                () => generateTTS(scene.voiceOver, voiceName, this.getApiKey),
                {
                    retries: 2,
                    delayMs: 1000,
                    onRetry: (attempt, err) => {
                        console.warn(`Attempt ${attempt}: TTS generation failed for scene ${index}. Retrying...`, err);
                    }
                }
            );

            scene.ttsAudioUrl = audioDataUrl;
        } catch(e) {
            console.error(`Error generating TTS for scene ${index}:`, e);
            this.showToast(`Gagal membuat audio untuk Adegan ${index+1}`, 'error');
        } finally {
            scene.isGeneratingTTS = false;
            this.updateSceneCard(index);
        }
    },
    
    handlePlayTTS(index: number) {
        const scene = this.storyboardCampaign?.[this.activeAudienceIndex]?.data?.scenes[index];
        if (scene?.ttsAudioUrl) {
            if (this.currentAudio) {
                this.currentAudio.pause();
                this.currentAudio.currentTime = 0;
            }
            this.currentAudio = new Audio(scene.ttsAudioUrl);
            this.currentAudio.play();
        }
    },

    handleDownloadTTS(index: number) {
        const scene = this.storyboardCampaign?.[this.activeAudienceIndex]?.data?.scenes[index];
        if (scene?.ttsAudioUrl) {
            downloadFile(scene.ttsAudioUrl, `scene_${index + 1}_audio.wav`);
        }
    },

    async handleGenerateSceneVideo(index: number) {
        const campaign = this.storyboardCampaign?.[this.activeAudienceIndex];
        if (!campaign?.data) return;

        const scene = campaign.data.scenes[index];
        if (!scene.generatedImageUrl) return;

        scene.isVideoGenerating = true;
        scene.videoGenerationError = false;
        scene.videoStatusText = "Memulai...";
        this.updateSceneCard(index);

        try {
            const imageBytes = scene.generatedImageUrl.split(',')[1];
            
            const videoUrl = await withRetry(
                () => generateVideoContent(
                    scene.imagePrompt, 
                    imageBytes, 
                    this.videoModel,
                    this.getApiKey, 
                    (message, step) => {
                        scene.videoStatusText = message;
                        this.updateSceneCard(index);
                    },
                    this.aspectRatio
                ),
                {
                    retries: 2,
                    delayMs: 1000,
                    onRetry: (attempt, err) => {
                        console.warn(`Attempt ${attempt}: Video generation failed for scene ${index}. Retrying...`, err);
                        scene.videoStatusText = `Mencoba lagi... (${attempt})`;
                        this.updateSceneCard(index);
                    }
                }
            );
            scene.videoUrl = videoUrl;
        } catch(e) {
            console.error(`Error generating video for scene ${index}:`, e);
            scene.videoGenerationError = true;
        } finally {
            scene.isVideoGenerating = false;
            this.updateSceneCard(index);
        }
    },
    
    async handleDownloadAllVideos() {
        const scenesWithVideos = this.storyboardCampaign?.[this.activeAudienceIndex]?.data?.scenes.filter(s => s.videoUrl);
        if (!scenesWithVideos) return;

        for (const scene of scenesWithVideos) {
            downloadFile(scene.videoUrl!, `scene_${scene.id}_video.mp4`);
            await delay(300); // Small delay between downloads
        }
    },

    handleInlineEdit(e: Event) {
        const target = e.target as HTMLElement;
        const field = target.dataset.field as keyof Scene;
        const index = parseInt(target.dataset.index!, 10);
        const campaign = this.storyboardCampaign?.[this.activeAudienceIndex];

        if (campaign?.data && field && !isNaN(index)) {
            const scene = campaign.data.scenes[index];
            if (scene) {
                // Type assertion to allow writing to the property
                (scene[field] as any) = target.textContent || (target as HTMLTextAreaElement).value;
                // If script changes, invalidate old audio
                if (field === 'voiceOver') {
                    scene.ttsAudioUrl = undefined;
                    this.updateSceneCard(index);
                }
            }
        }
    },

    exportData(format: 'json' | 'txt' | 'srt') {
        const storyboardData = this.storyboardCampaign?.[this.activeAudienceIndex]?.data;
        if (!storyboardData) return;

        let content = '';
        let filename = '';
        let mimeType = 'text/plain';

        if (format === 'json') {
            content = JSON.stringify(storyboardData, null, 2);
            filename = 'storyboard.json';
            mimeType = 'application/json';
        } else if (format === 'txt') {
            filename = 'storyboard_script.txt';
            content += `${storyboardData.product.title}\n`;
            content += `=========================\n\n`;
            storyboardData.scenes.forEach(scene => {
                content += `SCENE ${scene.id}: ${scene.title}\n`;
                content += `VISUAL: ${scene.visualDescription}\n`;
                content += `VOICEOVER: ${scene.voiceOver}\n\n`;
            });
        } else if (format === 'srt') {
            this.exportSrt(storyboardData);
            return;
        }
        
        const blob = new Blob([content], { type: mimeType });
        const url = URL.createObjectURL(blob);
        downloadFile(url, filename);
        URL.revokeObjectURL(url);
    },

    exportSrt(storyboardData: StoryboardData) {
        let srtContent = '';
        let currentTime = 0;

        const toSrtTime = (sec: number) => {
            const hours = Math.floor(sec / 3600).toString().padStart(2, '0');
            const minutes = Math.floor((sec % 3600) / 60).toString().padStart(2, '0');
            const seconds = Math.floor(sec % 60).toString().padStart(2, '0');
            const milliseconds = ((sec % 1) * 1000).toFixed(0).toString().padStart(3, '0');
            return `${hours}:${minutes}:${seconds},${milliseconds}`;
        };

        storyboardData.scenes.forEach((scene, index) => {
            const startTime = currentTime;
            const endTime = currentTime + scene.durationSec;
            
            srtContent += `${index + 1}\n`;
            srtContent += `${toSrtTime(startTime)} --> ${toSrtTime(endTime)}\n`;
            srtContent += `${scene.voiceOver}\n\n`;

            currentTime = endTime;
        });

        const blob = new Blob([srtContent], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        downloadFile(url, `storyboard_subtitles.srt`);
        URL.revokeObjectURL(url);
    },

    copyAllPrompts() {
        const storyboardData = this.storyboardCampaign?.[this.activeAudienceIndex]?.data;
        if (!storyboardData) return;

        const allPrompts = storyboardData.scenes.map((scene, i) => `--- SCENE ${i+1} ---\n${scene.imagePrompt}`).join('\n\n');
        navigator.clipboard.writeText(allPrompts).then(() => {
            this.showToast('Semua prompt gambar disalin!');
        });
    },

    handleStartOver() {
        this.state = 'idle';
        this.storyboardCampaign = null;
        this.activeAudienceIndex = 0;
        this.productDescInput.value = '';
        this.brandNameInput.value = '';
        this.targetAudienceInput.value = '';
        this.ctaInput.value = '';
        this.cta = '';
        this.clearProductImage();
        this.render();
    },

    showToast(message: string, type: 'success' | 'error' = 'success') {
        const toast = document.createElement('div');
        toast.className = `toast-notification ${type}`;
        toast.textContent = message;
        this.toastContainer.appendChild(toast);
        setTimeout(() => {
            toast.remove();
        }, 3000);
    }
};