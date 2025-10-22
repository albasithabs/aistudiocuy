/* tslint:disable */
/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { blobToDataUrl, delay, downloadFile, parseAndFormatErrorMessage, setupDragAndDrop, withRetry } from "../utils/helpers.ts";
import { generateStoryboard, generateImage, generateTTS, generateVideoContent } from "../utils/gemini.ts";

type AdStudioState = 'idle' | 'generating' | 'results';

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
    videoErrorMessage?: string;
}

interface AdConceptData {
    product: { title: string; summary: string; };
    style: { vibe: string; lighting: string; contentType: string; aspectRatio: string; };
    brandTone: string;
    durationTotalSec: number;
    scenes: Scene[];
    callToAction: string;
    suggestedHooks: Hook[];
}

interface AdStudioCampaign {
    audience: string;
    data: AdConceptData | null; // Allow null for failed concepts
}

export const AdStudio = {
    // DOM Elements
    view: document.querySelector('#ad-studio-view') as HTMLDivElement,
    inputStateEl: document.querySelector('#ad-studio-input-state') as HTMLDivElement,
    resultsStateEl: document.querySelector('#ad-studio-results-state') as HTMLDivElement,
    statusContainerEl: document.querySelector('#ad-studio-status-container') as HTMLDivElement,
    statusEl: document.querySelector('#ad-studio-status') as HTMLParagraphElement,
    generateButton: document.querySelector('#ad-studio-generate-button') as HTMLButtonElement,
    startOverButton: document.querySelector('#ad-studio-start-over-button') as HTMLButtonElement,
    toastContainer: document.querySelector('#toast-container') as HTMLDivElement,

    // Input Form Elements
    productImageInput: document.querySelector('#ad-studio-product-image') as HTMLInputElement,
    productImagePreview: document.querySelector('#ad-studio-product-image-preview') as HTMLImageElement,
    productImageLabel: document.querySelector('#ad-studio-product-image-label') as HTMLSpanElement,
    clearProductImageButton: document.querySelector('#ad-studio-clear-product-image') as HTMLButtonElement,
    productDescInput: document.querySelector('#ad-studio-product-desc') as HTMLTextAreaElement,
    brandNameInput: document.querySelector('#ad-studio-brand-name') as HTMLInputElement,
    targetAudienceInput: document.querySelector('#ad-studio-target-audience') as HTMLInputElement,
    ctaInput: document.querySelector('#ad-studio-cta-input') as HTMLInputElement,

    // Character Lock Elements
    characterLockContainer: document.querySelector('#ad-studio-character-lock-container') as HTMLDivElement,
    characterLockToggle: document.querySelector('#ad-studio-character-lock-toggle') as HTMLInputElement,

    // Creative Option Groups
    sceneCountGroup: document.querySelector('#ad-studio-scene-count-group') as HTMLDivElement,
    narrativeStyleGroup: document.querySelector('#ad-studio-narrative-style-group') as HTMLDivElement,
    voiceStyleGroup: document.querySelector('#ad-studio-voice-style-group') as HTMLDivElement,
    aspectRatioGroup: document.querySelector('#ad-studio-aspect-ratio-group') as HTMLDivElement,
    videoModelGroup: document.querySelector('#ad-studio-video-model-group') as HTMLDivElement,

    // Results Elements
    campaignTabsContainer: document.querySelector('#ad-studio-campaign-tabs') as HTMLDivElement,
    hookSuggestionsContainer: document.querySelector('#ad-studio-hook-suggestions-container') as HTMLDivElement,
    sceneGridEl: document.querySelector('#ad-studio-scene-grid') as HTMLDivElement,
    resultsPlaceholder: document.querySelector('#ad-studio-results-placeholder') as HTMLDivElement,
    exportJsonButton: document.querySelector('#ad-studio-export-json') as HTMLButtonElement,
    exportTxtButton: document.querySelector('#ad-studio-export-txt') as HTMLButtonElement,
    exportSrtButton: document.querySelector('#ad-studio-export-srt') as HTMLButtonElement,
    copyPromptsButton: document.querySelector('#ad-studio-copy-prompts') as HTMLButtonElement,
    downloadAllVideosButton: document.querySelector('#ad-studio-download-all-videos') as HTMLButtonElement,

    // State
    state: 'idle' as AdStudioState,
    productImageBase64: null as string | null,
    isCharacterLocked: false,
    adStudioCampaigns: null as AdStudioCampaign[] | null,
    activeAudienceIndex: 0,
    currentAudio: null as HTMLAudioElement | null,
    // Creative options state
    cta: '',
    sceneCount: '6',
    narrativeStyle: 'Dramatic',
    voiceStyle: 'natural',
    aspectRatio: '16:9',
// FIX: Updated deprecated video model name to align with current API guidelines.
    videoModel: 'veo-3.1-fast-generate-preview',
    voiceNameMap: { natural: 'Kore', formal: 'Zephyr', friendly: 'Kore', energetic: 'Puck' } as { [key: string]: string },

    // Dependencies
    getApiKey: (() => '') as () => string,
    showPreviewModal: ((urls: (string | null)[], startIndex?: number) => {}) as (urls: (string | null)[], startIndex?: number) => void,

    init(dependencies: { getApiKey: () => string; showPreviewModal: (urls: (string | null)[], startIndex?: number) => void; }) {
        // --- FIX: Robustly check for all critical elements on initialization ---
        const requiredElements = [
            this.view, this.inputStateEl, this.resultsStateEl, this.statusContainerEl,
            this.statusEl, this.generateButton, this.startOverButton, this.toastContainer,
            this.productImageInput, this.productImagePreview, this.productImageLabel,
            this.clearProductImageButton, this.productDescInput, this.brandNameInput,
            this.targetAudienceInput, this.ctaInput, this.characterLockContainer,
            this.characterLockToggle, this.sceneCountGroup, this.narrativeStyleGroup,
            this.voiceStyleGroup, this.aspectRatioGroup, this.videoModelGroup,
            this.campaignTabsContainer, this.hookSuggestionsContainer, this.sceneGridEl,
            this.resultsPlaceholder, this.exportJsonButton, this.exportTxtButton,
            this.exportSrtButton, this.copyPromptsButton, this.downloadAllVideosButton,
        ];

        if (requiredElements.some(el => !el)) {
            console.error("Ad Studio initialization failed: One or more required elements are missing from the DOM.");
            return;
        }

        this.getApiKey = dependencies.getApiKey;
        this.showPreviewModal = dependencies.showPreviewModal;

        this.addEventListeners();
        this.updateCreativeOptionsUI();
        this.render();
    },

    addEventListeners() {
        const dropZone = this.productImageInput.closest('.file-drop-zone') as HTMLElement;
        setupDragAndDrop(dropZone, this.productImageInput);

        this.productImageInput.addEventListener('change', this.handleProductImageUpload.bind(this));
        this.clearProductImageButton.addEventListener('click', this.clearProductImage.bind(this));
        this.productDescInput.addEventListener('input', () => this.render());
        this.ctaInput.addEventListener('input', () => this.cta = this.ctaInput.value.trim());

        this.characterLockToggle.addEventListener('change', () => {
            this.isCharacterLocked = this.characterLockToggle.checked;
        });

        this.generateButton.addEventListener('click', this.handleGenerateAdConcept.bind(this));
        this.startOverButton.addEventListener('click', this.handleStartOver.bind(this));

        const optionGroups = [this.sceneCountGroup, this.narrativeStyleGroup, this.voiceStyleGroup, this.aspectRatioGroup, this.videoModelGroup];
        optionGroups.forEach(group => {
            group.addEventListener('click', (e) => this.handleCreativeOptionClick(e, group.id));
        });

        this.resultsStateEl.addEventListener('click', this.handleResultsStateClick.bind(this));
        this.sceneGridEl.addEventListener('input', this.handleInlineEdit.bind(this));
        this.campaignTabsContainer.addEventListener('click', this.handleTabClick.bind(this));

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

        switch (groupId) {
            case 'ad-studio-scene-count-group': this.sceneCount = value; break;
            case 'ad-studio-narrative-style-group': this.narrativeStyle = value; break;
            case 'ad-studio-voice-style-group': this.voiceStyle = value; break;
            case 'ad-studio-aspect-ratio-group': this.aspectRatio = value; break;
            case 'ad-studio-video-model-group': this.videoModel = value; break;
        }
        this.updateCreativeOptionsUI();
    },

    async handleProductImageUpload(e: Event) {
        const file = (e.target as HTMLInputElement).files?.[0];
        if (!file) return;

        try {
            const dataUrl = await blobToDataUrl(file);
            this.productImageBase64 = dataUrl.substring(dataUrl.indexOf(',') + 1);
            this.productImagePreview.src = dataUrl;
            this.render();
        } catch (error) {
            this.showToast('Gagal memproses gambar.', 'error');
        }
    },

    clearProductImage() {
        this.productImageBase64 = null;
        this.productImageInput.value = '';
        this.render();
    },

    async handleGenerateAdConcept() {
        if (this.generateButton.disabled) return;

        this.state = 'generating';
        this.stopAllAudioPlaybackUI(); // Stop any lingering audio
        this.currentAudio = null;

        const audiences = this.targetAudienceInput.value.trim().split(',').map(a => a.trim()).filter(Boolean);
        if (audiences.length === 0) {
            audiences.push('Umum'); // Default audience
        }
        this.adStudioCampaigns = audiences.map(audience => ({ audience, data: null }));

        this.render();
        
        const generationPromises = this.adStudioCampaigns.map((campaign, index) => 
            this.generateSingleCampaign(campaign.audience, index)
        );

        await Promise.all(generationPromises);

        this.state = 'results';
        this.render();
    },
    
    async generateSingleCampaign(audience: string, index: number) {
        let prompt = `Anda adalah seorang ahli strategi periklanan. Buat storyboard iklan video untuk produk yang dijelaskan di bawah ini, yang ditargetkan untuk audiens "${audience}".\n`;
        prompt += `Produk: ${this.productDescInput.value.trim()}\n`;
        if (this.brandNameInput.value.trim()) {
            prompt += `Merek: ${this.brandNameInput.value.trim()}\n`;
        }
        prompt += `Buat ${this.sceneCount} adegan. Gaya naratif harus ${this.narrativeStyle}. Nada suara harus ${this.voiceStyle}. Rasio aspek video adalah ${this.aspectRatio}.`;
        if(this.cta) {
            prompt += `\nSertakan Call To Action (CTA) di adegan terakhir: "${this.cta}"`;
        }

        try {
            const data = await withRetry(() => generateStoryboard(prompt, this.productImageBase64, this.getApiKey()), { retries: 2, delayMs: 1000, onRetry: () => {} });
            if (this.adStudioCampaigns && this.adStudioCampaigns[index]) {
                this.adStudioCampaigns[index].data = data;
            }
        } catch (e: any) {
            console.error(`Failed to generate concept for audience "${audience}":`, e);
            this.showToast(`Gagal membuat konsep untuk audiens "${audience}"`, 'error');
        } finally {
            if (index === this.activeAudienceIndex) {
                this.render(); // Re-render if the currently active tab is the one that finished
            }
        }
    },

    handleStartOver() {
        this.state = 'idle';
        this.clearProductImage();
        this.productDescInput.value = '';
        this.brandNameInput.value = '';
        this.targetAudienceInput.value = '';
        this.ctaInput.value = '';
        this.adStudioCampaigns = null;
        this.activeAudienceIndex = 0;
        this.stopAllAudioPlaybackUI();
        this.currentAudio = null;
        this.render();
    },

    async handleResultsStateClick(e: MouseEvent) {
        const target = e.target as HTMLElement;

        const generateImageButton = (target.closest('.generate-scene-image-button'));
        if (generateImageButton) {
            e.stopPropagation();
            const sceneId = parseInt((generateImageButton as HTMLElement).dataset.sceneId!, 10);
            this.generateSceneImage(sceneId);
            return;
        }

        const generateVideoButton = target.closest('.storyboard-create-video-button');
        if (generateVideoButton) {
            e.stopPropagation();
            const sceneId = parseInt((generateVideoButton as HTMLElement).dataset.sceneId!, 10);
            this.generateSingleSceneVideo(sceneId);
            return;
        }

        const playButton = target.closest('.scene-audio-play-button');
        if (playButton) {
            e.stopPropagation();
            const sceneId = parseInt((playButton as HTMLElement).dataset.sceneId!, 10);
            const scene = this.getActiveScene(sceneId);
            if (!scene) return;

            if (this.currentAudio && !this.currentAudio.paused) {
                this.currentAudio.pause();
                this.stopAllAudioPlaybackUI();
                if (this.currentAudio.src === scene.ttsAudioUrl) {
                    return;
                }
            }

            if (scene.ttsAudioUrl) {
                this.playAudio(scene.ttsAudioUrl, playButton as HTMLButtonElement);
            } else {
                const audioUrl = await this.generateSceneTTS(sceneId);
                if (audioUrl) {
                    this.playAudio(audioUrl, playButton as HTMLButtonElement);
                }
            }
            return;
        }

        const imageContainer = target.closest('.scene-image-container');
        if (imageContainer) {
            const sceneId = parseInt((imageContainer as HTMLElement).dataset.sceneId!, 10);
            const scene = this.getActiveScene(sceneId);
            if (scene && (scene.generatedImageUrl || scene.videoUrl)) {
                this.showPreviewModal([scene.videoUrl || scene.generatedImageUrl!], 0);
            }
        }
    },

    handleInlineEdit(e: Event) {
        const target = e.target as HTMLElement;
        const sceneId = parseInt(target.dataset.sceneId!, 10);
        const field = target.dataset.field as keyof Scene;
        if (!sceneId || !field) return;

        const scene = this.getActiveScene(sceneId);
        if (scene) {
            (scene[field] as any) = target.textContent || '';
            
            if (field === 'imagePrompt') {
                scene.generatedImageUrl = undefined;
            }
            if (field === 'voiceOver') {
                if (scene.ttsAudioUrl && scene.ttsAudioUrl.startsWith('blob:')) {
                    URL.revokeObjectURL(scene.ttsAudioUrl);
                }
                scene.ttsAudioUrl = undefined;
            }
            this.renderScene(sceneId);
        }
    },

    async generateSceneImage(sceneId: number) {
        const scene = this.getActiveScene(sceneId);
        if (!scene || scene.isGeneratingImage) return;

        scene.isGeneratingImage = true;
        this.renderScene(sceneId);

        try {
            let prompt = scene.imagePrompt;
            if (this.productImageBase64 && this.isCharacterLocked) {
                prompt += ` Karakter dalam gambar harus sangat mirip dengan subjek dalam gambar referensi.`;
            }
            
            const imageUrl = await withRetry(() => generateImage(prompt, this.getApiKey(), this.aspectRatio), { retries: 2, delayMs: 1000, onRetry: () => {} });
            scene.generatedImageUrl = imageUrl;
            scene.imageGenerationError = false;
        } catch (e) {
            scene.imageGenerationError = true;
            this.showToast(parseAndFormatErrorMessage(e, 'Gagal membuat gambar'), 'error');
        } finally {
            scene.isGeneratingImage = false;
            this.renderScene(sceneId);
        }
    },
    
    async generateSingleSceneVideo(sceneId: number) {
        const scene = this.getActiveScene(sceneId);
        if (!scene || scene.isVideoGenerating) return;

        scene.isVideoGenerating = true;
        scene.videoGenerationError = false;
        scene.videoErrorMessage = undefined;
        this.renderScene(sceneId);

        try {
            const imageBytes = scene.generatedImageUrl ? scene.generatedImageUrl.substring(scene.generatedImageUrl.indexOf(',') + 1) : '';
            const prompt = scene.imagePrompt;
            
            const videoUrl = await generateVideoContent(
                prompt, imageBytes, this.videoModel, this.getApiKey(),
                (message: string) => {
                    scene.videoStatusText = message;
                    this.renderScene(sceneId);
                },
                this.aspectRatio
            );

            scene.videoUrl = videoUrl;
        } catch (e: any) {
            scene.videoGenerationError = true;
            scene.videoErrorMessage = parseAndFormatErrorMessage(e, 'Gagal membuat video');
            this.showToast(scene.videoErrorMessage, 'error');
        } finally {
            scene.isVideoGenerating = false;
            this.renderScene(sceneId);
            this.updateDownloadAllButtonState();
        }
    },

    async generateSceneTTS(sceneId: number): Promise<string | null> {
        const scene = this.getActiveScene(sceneId);
        if (!scene || !scene.voiceOver || scene.isGeneratingTTS) return null;

        scene.isGeneratingTTS = true;
        this.renderScene(sceneId);

        try {
            const textToSpeak = scene.voiceOver;
            const voiceName = this.voiceNameMap[this.voiceStyle] || 'Kore';
            
            const audioUrl = await withRetry(
                () => generateTTS({ text: textToSpeak, voiceName }), {
                    retries: 2,
                    delayMs: 1000,
                    onRetry: (attempt) => this.showToast(`Pembuatan audio gagal, mencoba lagi... (${attempt})`, 'info')
                }
            );
            
            scene.ttsAudioUrl = audioUrl;
            return audioUrl;
        } catch (e: any) {
            this.showToast(parseAndFormatErrorMessage(e, 'Gagal membuat audio'), 'error');
            return null;
        } finally {
            scene.isGeneratingTTS = false;
            this.renderScene(sceneId);
        }
    },

    playAudio(url: string, buttonEl: HTMLButtonElement) {
        this.currentAudio = new Audio(url);
        
        const playIcon = buttonEl.querySelector('.play-icon');
        const stopIcon = buttonEl.querySelector('.stop-icon');
        
        this.currentAudio.addEventListener('play', () => {
            playIcon?.classList.add('hidden');
            stopIcon?.classList.remove('hidden');
        });

        const onEnd = () => {
            playIcon?.classList.remove('hidden');
            stopIcon?.classList.add('hidden');
            this.currentAudio = null;
        };

        this.currentAudio.addEventListener('ended', onEnd);
        this.currentAudio.addEventListener('pause', onEnd);

        this.currentAudio.play();
    },

    handleTabClick(e: MouseEvent) {
        const button = (e.target as HTMLElement).closest('.campaign-tab');
        if (button) {
            const index = parseInt((button as HTMLElement).dataset.index!, 10);
            if (!isNaN(index) && index !== this.activeAudienceIndex) {
                this.activeAudienceIndex = index;
                this.render();
            }
        }
    },

    getActiveCampaignData(): AdConceptData | null | undefined {
        return this.adStudioCampaigns?.[this.activeAudienceIndex]?.data;
    },

    getActiveScene(sceneId: number): Scene | undefined {
        return this.getActiveCampaignData()?.scenes.find(s => s.id === sceneId);
    },

    // UI Rendering and Management
    render() {
        // ... (omitted for brevity, assume it renders based on `this.state` and other properties)
        this.renderTabs();
        this.renderStoryboard();
        this.updateDownloadAllButtonState();
    },

    renderTabs() {
        // ... (omitted for brevity)
    },
    
    renderStoryboard() {
        // ... (omitted for brevity)
    },

    renderScene(sceneId: number) {
        // ... (omitted for brevity)
    },

    stopAllAudioPlaybackUI() {
        if (this.currentAudio) this.currentAudio.pause();
        this.sceneGridEl.querySelectorAll('.scene-audio-play-button').forEach(btn => {
            btn.querySelector('.play-icon')?.classList.remove('hidden');
            btn.querySelector('.stop-icon')?.classList.add('hidden');
        });
    },

    updateDownloadAllButtonState() {
        const scenes = this.getActiveCampaignData()?.scenes;
        if (!scenes || scenes.length === 0) {
            this.downloadAllVideosButton.style.display = 'none';
            return;
        }
        const allVideosDone = scenes.every(s => s.videoUrl);
        this.downloadAllVideosButton.style.display = allVideosDone ? 'inline-flex' : 'none';
    },

    async handleDownloadAllVideos() {
        const scenes = this.getActiveCampaignData()?.scenes;
        if (!scenes) return;

        for (const [index, scene] of scenes.entries()) {
            if (scene.videoUrl) {
                downloadFile(scene.videoUrl, `ad_studio_scene_${index + 1}.mp4`);
                await delay(300);
            }
        }
    },

    // Data Exporting
    exportData(format: 'json' | 'txt' | 'srt') {
        const data = this.getActiveCampaignData();
        if (!data) return;

        let content = '';
        let filename = `ad-concept-${this.adStudioCampaigns![this.activeAudienceIndex].audience}`;
        let mimeType = 'text/plain';

        switch (format) {
            case 'json':
                content = JSON.stringify(data, null, 2);
                filename += '.json';
                mimeType = 'application/json';
                break;
            case 'txt':
                content = this.generateTxtContent(data);
                filename += '.txt';
                break;
            case 'srt':
                content = this.generateSrtContent(data.scenes);
                filename += '.srt';
                break;
        }

        const blob = new Blob([content], { type: mimeType });
        downloadFile(URL.createObjectURL(blob), filename);
    },
    
    generateTxtContent(data: AdConceptData): string {
        let txt = `Konsep Iklan: ${data.product.title}\nRingkasan: ${data.product.summary}\n\n`;
        data.scenes.forEach(scene => {
            txt += `--- ADEGAN ${scene.id} ---\n`;
            txt += `Visual: ${scene.visualDescription}\n`;
            txt += `Voice Over: ${scene.voiceOver}\n\n`;
        });
        return txt;
    },

    generateSrtContent(scenes: Scene[]): string {
        let srt = '';
        let currentTime = 0;

        scenes.forEach((scene, index) => {
            const startTime = currentTime;
            const endTime = currentTime + scene.durationSec;

            const formatTime = (seconds: number) => {
                const h = Math.floor(seconds / 3600).toString().padStart(2, '0');
                const m = Math.floor((seconds % 3600) / 60).toString().padStart(2, '0');
                const s = Math.floor(seconds % 60).toString().padStart(2, '0');
                return `${h}:${m}:${s},000`;
            };

            srt += `${index + 1}\n`;
            srt += `${formatTime(startTime)} --> ${formatTime(endTime)}\n`;
            srt += `${scene.voiceOver}\n\n`;

            currentTime = endTime;
        });
        return srt;
    },
    
    copyAllPrompts() {
        const scenes = this.getActiveCampaignData()?.scenes;
        if (!scenes) return;

        const allPrompts = scenes.map((scene, i) => `PROMPT ADEGAN ${i+1}:\n${scene.imagePrompt}`).join('\n\n---\n\n');
        navigator.clipboard.writeText(allPrompts)
            .then(() => this.showToast('Semua prompt gambar berhasil disalin!', 'success'))
            .catch(() => this.showToast('Gagal menyalin prompt.', 'error'));
    },
    
    showToast(message: string, type: 'success' | 'error' | 'info' = 'success') {
        const toast = document.createElement('div');
        toast.className = `toast-notification ${type}`;
        toast.textContent = message;
        this.toastContainer.appendChild(toast);
        setTimeout(() => toast.remove(), 3000);
    }
};