/* tslint:disable */
/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { GoogleGenAI, Modality } from '@google/genai';
import { CreativeStudio } from './components/ProductShotPro.ts';
import { Storyboard } from './components/Storyboard.ts';
import { RetouchAndColorizer } from './components/RetouchAndColorizer.ts';
import { FoodStylist } from './components/FoodStylist.ts';
import { Stickerrr } from './components/Stickerrr.ts';
// IMPROVEMENT: Imported withRetry to add resilience to modal editor.
import { blobToDataUrl, downloadFile, setupDragAndDrop, delay, parseAndFormatErrorMessage, withRetry } from './utils/helpers.ts';
// FIX: Removed generateImageWithImagen and added generateImage and generateText.
import { validateApiKey, generateImage, generateVideoContent, generateStyledImage, generateText, generateTTS } from './utils/gemini.ts';

// === DOM Elements ===
const appContainer = document.querySelector('.app-container') as HTMLDivElement;
const appTitle = document.querySelector('.app-header h1') as HTMLHeadingElement;
// Image Preview Modal
const imagePreviewModal = document.querySelector('#image-preview-modal') as HTMLDivElement;
const modalImageContainer = document.querySelector('#modal-image-container') as HTMLDivElement;
const modalPreviewImage = document.querySelector('#modal-preview-image') as HTMLImageElement;
const modalPreviewVideo = document.querySelector('#modal-preview-video') as HTMLVideoElement;
const modalPreviewCloseButton = document.querySelector('#modal-preview-close-button') as HTMLButtonElement;
const modalPrevButton = document.querySelector('#modal-prev-button') as HTMLButtonElement;
const modalNextButton = document.querySelector('#modal-next-button') as HTMLButtonElement;
const modalZoomControls = document.querySelector('.modal-zoom-controls') as HTMLDivElement;
const modalZoomInButton = document.querySelector('#modal-zoom-in-button') as HTMLButtonElement;
const modalZoomOutButton = document.querySelector('#modal-zoom-out-button') as HTMLButtonElement;
const modalZoomResetButton = document.querySelector('#modal-zoom-reset-button') as HTMLButtonElement;
const modalImageCounter = document.querySelector('#modal-image-counter') as HTMLSpanElement;
// Modal Editor
const modalFilterButtons = document.querySelector('#modal-filter-buttons') as HTMLDivElement;
const modalDownloadEditedButton = document.querySelector('#modal-download-edited-button') as HTMLButtonElement;

// Modal "Magic Garnish" (Food Lens) Editor
const modalEditImageButton = document.querySelector('#modal-edit-image-button') as HTMLButtonElement;
const modalMagicGarnishPanel = document.querySelector('#modal-magic-garnish-panel') as HTMLDivElement;
const modalMagicGarnishPrompt = document.querySelector('#modal-magic-garnish-prompt') as HTMLTextAreaElement;
const modalMagicGarnishGenerateButton = document.querySelector('#modal-magic-garnish-generate') as HTMLButtonElement;
const modalMagicGarnishUndoButton = document.querySelector('#modal-magic-garnish-undo') as HTMLButtonElement;

// API Key Modal
const apiKeyModal = document.querySelector('#api-key-modal') as HTMLDivElement;
const premiumKeyButton = document.querySelector('#premium-key-button') as HTMLButtonElement;
const apiKeyStatusIndicator = document.querySelector('#api-key-status-indicator') as HTMLSpanElement;
const apiKeyInput = document.querySelector('#api-key-input') as HTMLInputElement;
const apiKeySaveButton = document.querySelector('#api-key-save-button') as HTMLButtonElement;
const apiKeyCancelButton = document.querySelector('#api-key-cancel-button') as HTMLButtonElement;
const apiKeyClearButton = document.querySelector('#api-key-clear-button') as HTMLButtonElement;
const apiKeyModalCloseButton = document.querySelector('#api-key-modal-close-button') as HTMLButtonElement;
const apiKeyModalStatus = document.querySelector('#api-key-modal-status') as HTMLParagraphElement;

// Theme Switcher
const themeToggleButton = document.querySelector('#theme-toggle') as HTMLInputElement;

// Sidebar Navigation
const sidebarMenu = document.querySelector('.sidebar-menu') as HTMLUListElement;
const sidebarLinks = document.querySelectorAll('.sidebar-link');
const views = document.querySelectorAll('.view');

// === State ===
// premiumApiKey can now be:
// null: No premium key has ever been set. Use default.
// string (valid): A valid premium key is set. Use this.
// '' (empty string): A premium key was attempted but was invalid or cleared. Block usage, forcing user to fix or clear.
let premiumApiKey: string | null = null;

// === Image Preview Modal State ===
let modalImageUrls: string[] = [];
let modalCurrentIndex = 0;
let modalZoomLevel = 1;
let modalIsPanning = false;
let modalStartPan = { x: 0, y: 0 };
let modalImageOffset = { x: 0, y: 0 };
const MIN_ZOOM = 1;
const MAX_ZOOM = 8;
const ZOOM_STEP = 1.5;
let modalActiveFilter = 'none';
// New state for Magic Garnish
let isModalEditing = false;
let originalModalImageUrl: string | null = null;
let isGeneratingEdit = false;


// === AI Voice Studio ===
const AiVoiceStudio = {
    // DOM Elements
    view: document.querySelector('#ai-voice-studio-view') as HTMLDivElement,
    scriptInput: document.querySelector('#ai-voice-script-input') as HTMLTextAreaElement,
    charCount: document.querySelector('#ai-voice-char-count') as HTMLSpanElement,
    resultContainer: document.querySelector('#ai-voice-result-container') as HTMLDivElement,
    genderFilterGroup: document.querySelector('#ai-voice-gender-filter') as HTMLDivElement,
    actorList: document.querySelector('#ai-voice-actor-list') as HTMLDivElement,
    vibeGroup: document.querySelector('#ai-voice-vibe-group') as HTMLDivElement,
    speedSlider: document.querySelector('#ai-voice-speed-slider') as HTMLInputElement,
    speedLabel: document.querySelector('#ai-voice-speed-label') as HTMLSpanElement,
    generateButton: document.querySelector('#ai-voice-generate-button') as HTMLButtonElement,
    
    // State
    script: '',
    selectedActor: 'Puck', // Default actor
    genderFilter: 'Pria' as 'Semua' | 'Pria' | 'Wanita',
    selectedVibe: 'Promosi',
    speechRate: 1.0,
    audioUrl: null as string | null,
    isLoading: false,
    currentAudioPlayer: null as HTMLAudioElement | null,

    // Data
    actors: [
        { name: 'Sadachbia', apiName: 'Puck', gender: 'Pria', sample: 'Halo, ini adalah contoh suara saya.' },
        { name: 'Rasalgethi', apiName: 'Charon', gender: 'Pria', sample: 'Halo, ini adalah contoh suara saya.' },
        { name: 'Sadaltager', apiName: 'Fenrir', gender: 'Pria', sample: 'Halo, ini adalah contoh suara saya.' },
        { name: 'Zubenelgenubi', apiName: 'Zephyr', gender: 'Pria', sample: 'Halo, ini adalah contoh suara saya.' },
        { name: 'Lyra', apiName: 'Kore', gender: 'Wanita', sample: 'Halo, ini adalah contoh suara saya.' },
        { name: 'Pulcherrima', apiName: 'Kore', gender: 'Wanita', sample: 'Halo, ini adalah contoh suara saya.' },
        { name: 'Schedar', apiName: 'Kore', gender: 'Wanita', sample: 'Halo, ini adalah contoh suara saya.' },
        { name: 'Sulafat', apiName: 'Kore', gender: 'Wanita', sample: 'Halo, ini adalah contoh suara saya.' },
        { name: 'Vindemiatrix', apiName: 'Kore', gender: 'Wanita', sample: 'Halo, ini adalah contoh suara saya.' },
        { name: 'Zephyr', apiName: 'Kore', gender: 'Wanita', sample: 'Halo, ini adalah contoh suara saya.' },
    ],

    // Dependencies
    getApiKey: (() => '') as () => string,
    showNotification: ((message: string, type?: 'info' | 'error') => {}) as (message: string, type?: 'info' | 'error') => void,

    init(dependencies: { getApiKey: () => string; showNotification: (message: string, type?: 'info' | 'error') => void; }) {
        if (!this.view) return;
        this.getApiKey = dependencies.getApiKey;
        this.showNotification = dependencies.showNotification;
        this.renderActors();
        this.addEventListeners();
    },

    addEventListeners() {
        this.scriptInput.addEventListener('input', () => {
            this.script = this.scriptInput.value;
            this.charCount.textContent = this.script.length.toString();
            this.generateButton.disabled = this.script.trim().length === 0;
        });

        this.genderFilterGroup.addEventListener('click', (e) => {
            const button = (e.target as HTMLElement).closest('.toggle-button');
            if (!button) return;
            
            this.genderFilter = button.getAttribute('data-filter') as 'Semua' | 'Pria' | 'Wanita';
            this.genderFilterGroup.querySelectorAll('.toggle-button').forEach(btn => btn.classList.remove('active'));
            button.classList.add('active');
            this.renderActors();
        });
        
        this.actorList.addEventListener('click', (e) => {
            const card = (e.target as HTMLElement).closest('.actor-card');
            if (card) {
                this.selectedActor = card.getAttribute('data-name')!;
                this.actorList.querySelectorAll('.actor-card').forEach(c => c.classList.remove('active'));
                card.classList.add('active');
            }
        });

        this.vibeGroup.addEventListener('click', (e) => {
             const button = (e.target as HTMLElement).closest('.toggle-button');
             if (!button) return;

             this.selectedVibe = button.getAttribute('data-vibe')!;
             this.vibeGroup.querySelectorAll('.toggle-button').forEach(btn => btn.classList.remove('active'));
             button.classList.add('active');
        });

        this.speedSlider.addEventListener('input', () => {
            this.speechRate = parseFloat(this.speedSlider.value);
            this.speedLabel.textContent = `${this.speechRate.toFixed(2)}x`;
            if (this.currentAudioPlayer) {
                this.currentAudioPlayer.playbackRate = this.speechRate;
            }
        });

        this.generateButton.addEventListener('click', this.handleGenerate.bind(this));
    },
    
    renderActors() {
        this.actorList.innerHTML = '';
        const filteredActors = this.actors.filter(actor => 
            this.genderFilter === 'Semua' || actor.gender === this.genderFilter
        );

        filteredActors.forEach(actor => {
            const card = document.createElement('div');
            card.className = 'actor-card';
            card.dataset.name = actor.apiName;
            if (actor.apiName === this.selectedActor) {
                card.classList.add('active');
            }
            card.innerHTML = `
                <div class="actor-card-header">
                    <h4>${actor.name}</h4>
                    <span class="actor-gender-tag">${actor.gender}</span>
                </div>
                <button class="secondary-button sample-button" data-sample-text="${actor.sample}" data-voice-name="${actor.apiName}">
                    <svg xmlns="http://www.w3.org/2000/svg" height="18px" viewBox="0 0 24 24" width="18px" fill="currentColor"><path d="M0 0h24v24H0V0z" fill="none"/><path d="M10 16.5l6-4.5-6-4.5v9zM12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8z"/></svg>
                    <span>Contoh</span>
                </button>
            `;
            this.actorList.appendChild(card);
        });

        // Add event listeners for new sample buttons
        this.actorList.querySelectorAll('.sample-button').forEach(button => {
            button.addEventListener('click', async (e) => {
                e.stopPropagation(); // Prevent card selection when clicking sample
                const btn = e.currentTarget as HTMLButtonElement;
                const text = btn.dataset.sampleText!;
                const voiceName = btn.dataset.voiceName!;
                btn.disabled = true;
                btn.innerHTML = `<div class="loading-clock" style="width:16px; height:16px; margin: 0 auto;"></div>`;

                try {
                    const url = await generateTTS(text, voiceName, this.getApiKey);
                    const audio = new Audio(url);
                    audio.play();
                    audio.onended = () => {
                         btn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" height="18px" viewBox="0 0 24 24" width="18px" fill="currentColor"><path d="M0 0h24v24H0V0z" fill="none"/><path d="M10 16.5l6-4.5-6-4.5v9zM12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8z"/></svg> <span>Contoh</span>`;
                         btn.disabled = false;
                    };
                } catch (error) {
                    this.showNotification('Gagal memutar sampel.', 'error');
                    console.error('Sample playback failed:', error);
                    btn.innerHTML = `<span>Gagal</span>`;
                    setTimeout(() => {
                        btn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" height="18px" viewBox="0 0 24 24" width="18px" fill="currentColor"><path d="M0 0h24v24H0V0z" fill="none"/><path d="M10 16.5l6-4.5-6-4.5v9zM12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8z"/></svg> <span>Contoh</span>`;
                        btn.disabled = false;
                    }, 2000);
                }
            });
        });
    },

    async handleGenerate() {
        if (this.isLoading) return;

        this.isLoading = true;
        this.audioUrl = null;
        this.renderResult();

        try {
            // Apply a simple prompt modification based on vibe
            const finalScript = `Dengan nada ${this.selectedVibe.toLowerCase()}, katakan: "${this.script}"`;
            const url = await generateTTS(finalScript, this.selectedActor, this.getApiKey);
            this.audioUrl = url;
        } catch (error: any) {
            console.error('TTS Generation failed:', error);
            this.showNotification(parseAndFormatErrorMessage(error, 'Pembuatan suara'), 'error');
            this.audioUrl = null;
        } finally {
            this.isLoading = false;
            this.renderResult();
        }
    },

    renderResult() {
        if (this.isLoading) {
            this.resultContainer.innerHTML = `<div class="loading-clock"></div><p>AI sedang menghasilkan audio...</p>`;
            this.generateButton.disabled = true;
        } else if (this.audioUrl) {
            this.resultContainer.innerHTML = `<audio id="ai-voice-result-player" controls></audio>`;
            this.currentAudioPlayer = this.resultContainer.querySelector('audio');
            if (this.currentAudioPlayer) {
                this.currentAudioPlayer.src = this.audioUrl;
                this.currentAudioPlayer.playbackRate = this.speechRate;
            }
            this.generateButton.disabled = this.script.trim().length === 0;
        } else {
            this.resultContainer.innerHTML = `
                <svg xmlns="http://www.w3.org/2000/svg" height="48px" viewBox="0 0 24 24" width="48px" fill="currentColor"><path d="M0 0h24v24H0V0z" fill="none"/><path d="M12 14c1.66 0 2.99-1.34 2.99-3L15 5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3zm-1.2-9.1c0-.66.54-1.2 1.2-1.2.66 0 1.2.54 1.2 1.2l-.01 6.2c0 .66-.53 1.2-1.19 1.2s-1.2-.54-1.2-1.2V4.9zm6.5 6.1c0 3-2.54 5.1-5.3 5.1S6.7 14 6.7 11H5c0 3.41 2.72 6.23 6 6.72V21h2v-3.28c3.28-.48 6-3.3 6-6.72h-1.7z"/></svg>
                <p>Hasil audio Anda akan muncul di sini.</p>
            `;
            this.generateButton.disabled = this.script.trim().length === 0;
        }
    }
};

// === AI Photo Studio ===
const PhotoStudio = {
    // Constants
    POSE_PACK: [
        'full body shot of a person standing in a neutral, confident pose',
        'person sitting casually on a simple stool or block',
        'captured mid-stride in a natural walking motion',
        'standing with arms crossed, looking assertive',
        'looking over their shoulder back towards the camera',
        'a dynamic pose, leaning against a wall',
        'a three-quarter body shot with a relaxed stance',
        'full body shot, person walking towards the camera',
        'a candid sitting pose on the floor'
    ],
    ANGLE_FRAMING_PACK: [
        'full body shot',
        'three-quarter body shot',
        'medium shot from the waist up',
        'close-up detail shot',
        'candid side profile shot',
        'eye-level shot',
        'low-angle shot making the subject look powerful',
        'high-angle shot',
        'wide shot showing subject in environment'
    ],

    // DOM Elements
    view: document.querySelector('#photo-studio-view') as HTMLDivElement,
    inputStateEl: document.querySelector('#studio-input-state') as HTMLDivElement,
    resultsStateEl: document.querySelector('#studio-results-state') as HTMLDivElement,
    resultsPlaceholder: document.querySelector('#studio-results-placeholder') as HTMLDivElement,
    resultsGrid: document.querySelector('#studio-results-grid') as HTMLDivElement,
    generateButton: document.querySelector('#studio-generate-button') as HTMLButtonElement,
    surpriseMeButton: document.querySelector('#studio-surprise-me-button') as HTMLButtonElement,
    startOverButton: document.querySelector('#studio-start-over-button') as HTMLButtonElement,
    downloadAllButton: document.querySelector('#studio-download-all-button') as HTMLButtonElement,
    statusContainer: document.querySelector('#studio-status-container') as HTMLDivElement,
    statusText: document.querySelector('#studio-status') as HTMLParagraphElement,
    progressWrapper: document.querySelector('#studio-progress-wrapper') as HTMLDivElement,
    progressBar: document.querySelector('#studio-progress-bar') as HTMLDivElement,

    // Inputs
    multiImageInput: document.querySelector('#studio-multi-image-input') as HTMLInputElement,
    multiImagePreviewContainer: document.querySelector('#studio-multi-image-preview') as HTMLDivElement,
    bgPresetGroup: document.querySelector('#studio-bg-preset-group') as HTMLDivElement,
    bgPresetButtons: document.querySelectorAll('#studio-bg-preset-group .toggle-button'),
    customBgInput: document.querySelector('#studio-custom-bg-input') as HTMLTextAreaElement,
    wardrobeImageInput: document.querySelector('#studio-wardrobe-image') as HTMLInputElement,
    wardrobeImagePreview: document.querySelector('#studio-wardrobe-image-preview') as HTMLImageElement,

    // New Controls
    expressionGroup: document.querySelector('#studio-expression-group') as HTMLDivElement,
    propsInput: document.querySelector('#studio-props-input') as HTMLInputElement,
    lightingSelect: document.querySelector('#studio-lighting-select') as HTMLSelectElement,
    consistentSetToggle: document.querySelector('#studio-consistent-set-toggle') as HTMLInputElement,
    outputFormatJpegButton: document.querySelector('#studio-output-format-jpeg') as HTMLButtonElement,
    outputFormatPngButton: document.querySelector('#studio-output-format-png') as HTMLButtonElement,

    // State
    state: 'idle' as 'idle' | 'generating' | 'results',
    sourceImages: [] as { file: File, dataUrl: string, base64: string }[],
    wardrobeImage: null as { file: File, dataUrl: string, base64: string } | null,
    backgroundValue: '',
    results: [] as { status: 'pending' | 'done' | 'error', url?: string, prompt: string }[],
    
    // New State
    selectedExpressions: ['a neutral expression'] as string[],
    props: '',
    selectedLighting: '',
    isConsistentSet: false,
    outputFormat: 'jpeg',

    // Dependencies
    getApiKey: (() => '') as () => string,
    showPreviewModal: ((urls: (string | null)[], startIndex?: number) => {}) as (urls: (string | null)[], startIndex?: number) => void,

    init(dependencies: { getApiKey: () => string; showPreviewModal: (urls: (string | null)[], startIndex?: number) => void; }) {
        if (!this.view) return; // Don't run if the view doesn't exist
        this.getApiKey = dependencies.getApiKey;
        this.showPreviewModal = dependencies.showPreviewModal;
        
        // Set initial state from default UI values
        this.backgroundValue = (this.bgPresetGroup.querySelector('.active') as HTMLElement)?.dataset.bg || 'a seamless, plain white backdrop';
        this.selectedExpressions = Array.from(this.expressionGroup.querySelectorAll('.toggle-button.active')).map(btn => (btn as HTMLElement).dataset.value!);
        this.selectedLighting = this.lightingSelect.value;
        this.isConsistentSet = this.consistentSetToggle.checked;
        this.outputFormat = 'jpeg';

        this.addEventListeners();
    },

    addEventListeners() {
        // Multi-image uploader
        const multiUploadDropZone = this.multiImageInput.closest('.file-drop-zone') as HTMLElement;
        setupDragAndDrop(multiUploadDropZone, this.multiImageInput);
        // Add click listener to the entire drop zone to trigger the file input, fixing the bug.
        multiUploadDropZone.addEventListener('click', (e: MouseEvent) => {
            // Prevent triggering if the remove button is clicked, letting its own handler work.
            if ((e.target as HTMLElement).closest('.remove-image-btn')) {
                return;
            }
            this.multiImageInput.click();
        });
        this.multiImageInput.addEventListener('change', this.handleMultiImageUpload.bind(this));
        this.multiImagePreviewContainer.addEventListener('click', this.handleRemoveImage.bind(this));

        // Wardrobe uploader
        const wardrobeDropZone = this.wardrobeImageInput.closest('.file-drop-zone') as HTMLElement;
        setupDragAndDrop(wardrobeDropZone, this.wardrobeImageInput);
        this.wardrobeImageInput.addEventListener('change', this.handleWardrobeUpload.bind(this));
        
        this.propsInput.addEventListener('input', () => { this.props = this.propsInput.value.trim(); });
        this.consistentSetToggle.addEventListener('change', () => { this.isConsistentSet = this.consistentSetToggle.checked; });
        
        this.expressionGroup.addEventListener('click', (e: MouseEvent) => {
            const target = e.target as HTMLElement;
            const button = target.closest('.toggle-button');
            if (button) {
                button.classList.toggle('active');
                this.selectedExpressions = Array.from(this.expressionGroup.querySelectorAll('.toggle-button.active'))
                    .map(btn => (btn as HTMLElement).dataset.value!);
                // Ensure at least one is selected, default to neutral
                if (this.selectedExpressions.length === 0) {
                    this.selectedExpressions = ['a neutral expression'];
                    const neutralBtn = this.expressionGroup.querySelector('[data-value="a neutral expression"]');
                    neutralBtn?.classList.add('active');
                }
            }
        });

        this.bgPresetButtons.forEach(button => {
            button.addEventListener('click', () => {
                this.bgPresetButtons.forEach(btn => btn.classList.remove('active'));
                button.classList.add('active');
                this.backgroundValue = (button as HTMLElement).dataset.bg || '';
                this.customBgInput.value = ''; // Clear custom input when preset is clicked
            });
        });

        this.lightingSelect.addEventListener('change', (e) => {
            this.selectedLighting = (e.target as HTMLSelectElement).value;
        });

        this.outputFormatJpegButton.addEventListener('click', () => {
            this.outputFormat = 'jpeg';
            this.outputFormatJpegButton.classList.add('active');
            this.outputFormatPngButton.classList.remove('active');
        });
        this.outputFormatPngButton.addEventListener('click', () => {
            this.outputFormat = 'png';
            this.outputFormatPngButton.classList.add('active');
            this.outputFormatJpegButton.classList.remove('active');
        });

        this.customBgInput.addEventListener('input', () => {
            this.backgroundValue = this.customBgInput.value.trim();
            if (this.backgroundValue) {
                this.bgPresetButtons.forEach(btn => btn.classList.remove('active'));
            }
        });

        this.generateButton.addEventListener('click', this.handleGenerate.bind(this));
        this.surpriseMeButton.addEventListener('click', this.handleSurpriseMe.bind(this));
        this.resultsGrid.addEventListener('click', this.handleGridClick.bind(this));
        this.startOverButton.addEventListener('click', this.handleStartOver.bind(this));
        this.downloadAllButton.addEventListener('click', this.handleDownloadAll.bind(this));
    },
    
    updateGenerateButton() {
        this.generateButton.disabled = this.sourceImages.length === 0;
    },

    async handleMultiImageUpload(e: Event) {
        const files = (e.target as HTMLInputElement).files;
        if (!files) return;

        for (const file of Array.from(files)) {
            if (this.sourceImages.some(img => img.file.name === file.name && img.file.size === file.size)) {
                continue; // Skip duplicates
            }
            const dataUrl = await blobToDataUrl(file);
            const base64 = dataUrl.split(',')[1];
            this.sourceImages.push({ file, dataUrl, base64 });
        }
        this.renderImagePreviews();
        this.updateGenerateButton();
    },

    renderImagePreviews() {
        this.multiImagePreviewContainer.innerHTML = '';
        this.sourceImages.forEach((image, index) => {
            const item = document.createElement('div');
            item.className = 'multi-image-preview-item';
            item.innerHTML = `
                <img src="${image.dataUrl}" alt="${image.file.name}">
                <button class="remove-image-btn" data-index="${index}" aria-label="Remove image">
                    <svg xmlns="http://www.w3.org/2000/svg" height="14px" viewBox="0 0 24 24" width="14px" fill="currentColor"><path d="M0 0h24v24H0V0z" fill="none"></path><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12 19 6.41z"></path></svg>
                </button>
            `;
            this.multiImagePreviewContainer.appendChild(item);
        });
    },
    
    handleRemoveImage(e: MouseEvent) {
        const target = e.target as HTMLElement;
        const removeBtn = target.closest('.remove-image-btn');
        if (removeBtn) {
            const index = parseInt(removeBtn.getAttribute('data-index')!, 10);
            this.sourceImages.splice(index, 1);
            this.renderImagePreviews();
            this.updateGenerateButton();
        }
    },

    async handleWardrobeUpload(e: Event) {
        const file = (e.target as HTMLInputElement).files?.[0];
        if (file) {
            const dataUrl = await blobToDataUrl(file);
            const base64 = dataUrl.split(',')[1];
            this.wardrobeImage = { file, dataUrl, base64 };
            this.wardrobeImagePreview.src = dataUrl;
            this.wardrobeImagePreview.classList.remove('image-preview-hidden');
        } else {
            this.wardrobeImage = null;
            this.wardrobeImagePreview.src = '#';
            this.wardrobeImagePreview.classList.add('image-preview-hidden');
        }
    },
    
    handleSurpriseMe() {
        // Random Expressions (select 2)
        this.expressionGroup.querySelectorAll('.toggle-button').forEach(btn => btn.classList.remove('active'));
        const expressionButtons = Array.from(this.expressionGroup.querySelectorAll('.toggle-button')) as HTMLElement[];
        const randomExpr1 = expressionButtons[Math.floor(Math.random() * expressionButtons.length)];
        let randomExpr2 = expressionButtons[Math.floor(Math.random() * expressionButtons.length)];
        while (randomExpr2 === randomExpr1) { // ensure they are different
             randomExpr2 = expressionButtons[Math.floor(Math.random() * expressionButtons.length)];
        }
        randomExpr1.classList.add('active');
        randomExpr2.classList.add('active');
        this.selectedExpressions = [randomExpr1.dataset.value!, randomExpr2.dataset.value!];

        // Random Prop
        const randomProps = ['a coffee cup', 'a book', 'sunglasses', 'a backpack', 'headphones'];
        this.propsInput.value = randomProps[Math.floor(Math.random() * randomProps.length)];
        this.props = this.propsInput.value;

        // Random Lighting from dropdown
        const options = this.lightingSelect.options;
        const randomIndex = Math.floor(Math.random() * options.length);
        this.lightingSelect.selectedIndex = randomIndex;
        this.selectedLighting = options[randomIndex].value;

        // Random BG
        this.customBgInput.value = '';
        const presetButtons = Array.from(this.bgPresetButtons) as HTMLElement[];
        presetButtons.forEach(btn => btn.classList.remove('active'));
        const randomPreset = presetButtons[Math.floor(Math.random() * presetButtons.length)];
        randomPreset.classList.add('active');
        this.backgroundValue = (randomPreset as HTMLElement).dataset.bg || '';
    },

    buildMasterPrompt(pose: string, angle: string, expression: string, sessionID: string | null = null): string {
        let prompt = "Generate a high-quality, ultra-realistic, photorealistic image with sharp focus and high-resolution details. The final image should look like a professional 4K photograph. ";

        if (this.sourceImages.length > 1) {
            prompt += "Combine the concepts, subjects, and styles from all the provided images. ";
        } else if (this.sourceImages.length === 1) {
            prompt += "Use the provided image as the main subject and style reference. ";
        }

        prompt += `The subject should have ${expression}. `;
        prompt += `This is a ${angle}. `;
        prompt += `The lighting should be ${this.selectedLighting}. `;
        prompt += `The subject's pose is a "${pose}". `;
        prompt += `The background should be ${this.backgroundValue}. `;

        if (this.props) {
            prompt += `The subject may be holding or interacting with: ${this.props}. `;
        }

        if (this.wardrobeImage) {
            prompt += "The subject should be wearing the clothing shown in the final reference image (the wardrobe image).";
        }
        
        if (this.outputFormat === 'png') {
            prompt += " The final image MUST have a clean, perfectly transparent background.";
        }
        
        if (this.isConsistentSet && sessionID) {
            prompt += ` CRITICAL CONSISTENCY INSTRUCTIONS (Session ID: ${sessionID}): This is part of a consistent photo set.
            1.  **Identity Preservation**: If there is a person in the original image, you MUST maintain their exact identity, including face, hair, and body features. It is extremely important to preserve their precise likeness without any changes. Do not generate a different person.
            2.  **No Alterations**: Pertahankan kemiripan dan identitas persis dari orang di gambar asli tanpa perubahan apa pun.
            3.  **Core Elements**: The lighting, color grading, and overall mood must be identical across all images in this session. Do not vary these core elements.
            The most important rule is to maintain the exact identity and appearance of any person in the original photo.`;
        }
        
        return prompt.trim().replace(/\s+/g, ' ');
    },
    
    async handleGenerate() {
        if (this.sourceImages.length === 0) return;

        this.state = 'generating';
        const sessionID = this.isConsistentSet ? `SESSION-${Math.random().toString(36).substring(2, 10)}` : null;
        
        this.results = Array(9).fill(null).map((_, index) => {
            // Cycle through poses and angles to create variety
            const pose = this.POSE_PACK[index % this.POSE_PACK.length];
            const angle = this.ANGLE_FRAMING_PACK[index % this.ANGLE_FRAMING_PACK.length];
            
            // Randomly select one of the user-chosen expressions for each image
            const expression = this.selectedExpressions[Math.floor(Math.random() * this.selectedExpressions.length)];

            return {
                status: 'pending',
                prompt: this.buildMasterPrompt(pose, angle, expression, sessionID),
            };
        });

        this.progressBar.style.width = '0%';
        this.render();

        let completedJobs = 0;
        const totalJobs = this.results.length;
        const updateProgress = () => {
            completedJobs++;
            const progress = (completedJobs / totalJobs) * 100;
            this.progressBar.style.width = `${progress}%`;
            this.updateStatusText();
        };

        const generationPromises = this.results.map(async (result, index) => {
            try {
                const response = await generateStyledImage(
                    this.sourceImages[0].base64,
                    this.wardrobeImage?.base64 || null,
                    result.prompt,
                    this.getApiKey,
                    this.sourceImages.slice(1).map(img => ({ inlineData: { data: img.base64, mimeType: 'image/png' } }))
                );

                const imagePart = response.candidates?.[0]?.content?.parts.find(p => p.inlineData);

                if (imagePart?.inlineData) {
                    const imageUrl = `data:${imagePart.inlineData.mimeType};base64,${imagePart.inlineData.data}`;
                    this.results[index] = { ...result, status: 'done', url: imageUrl };
                } else {
                    const textPart = response.candidates?.[0]?.content?.parts.find(p => p.text);
                    throw new Error(textPart?.text || "No image data in response.");
                }
            } catch (e: any) {
                console.error(`Error generating image ${index}:`, e);
                this.results[index] = { ...result, status: 'error' };
            } finally {
                updateProgress();
                this.render();
            }
        });

        await Promise.all(generationPromises);
        this.state = 'results';
        this.render();
    },

    async handleDownloadAll() {
        const successfulResults = this.results.filter(r => r.status === 'done' && r.url);
        if (successfulResults.length === 0) return;

        for (let i = 0; i < successfulResults.length; i++) {
            const result = successfulResults[i];
            downloadFile(result.url!, `studio-foto-${i + 1}.png`);
            await delay(300); // Small delay to prevent browser blocking popups
        }
    },

    handleStartOver() {
        this.state = 'idle';
        this.sourceImages = [];
        this.wardrobeImage = null;
        this.results = [];

        // Clear inputs
        this.multiImageInput.value = '';
        this.wardrobeImageInput.value = '';
        this.customBgInput.value = '';
        this.propsInput.value = '';
        this.props = '';
        this.wardrobeImagePreview.src = '#';
        this.wardrobeImagePreview.classList.add('image-preview-hidden');
        
        // Reset expressions to default (Neutral active)
        this.expressionGroup.querySelectorAll('.toggle-button').forEach(btn => {
            btn.classList.remove('active');
            if ((btn as HTMLElement).dataset.value === 'a neutral expression') {
                btn.classList.add('active');
            }
        });
        this.selectedExpressions = ['a neutral expression'];

        this.consistentSetToggle.checked = true;
        this.isConsistentSet = true;
        
        // Reset lighting dropdown to the first option
        this.lightingSelect.selectedIndex = 0;
        this.selectedLighting = this.lightingSelect.options[0].value;
        
        this.outputFormat = 'jpeg';
        this.outputFormatJpegButton.classList.add('active');
        this.outputFormatPngButton.classList.remove('active');
        
        this.bgPresetButtons.forEach(btn => {
            btn.classList.remove('active');
            if ((btn as HTMLElement).dataset.bg === 'a seamless, plain white backdrop') {
                btn.classList.add('active');
            }
        });
        this.backgroundValue = (this.bgPresetGroup.querySelector('.active') as HTMLElement)?.dataset.bg || '';
        
        this.renderImagePreviews();
        this.updateGenerateButton();
        this.render();
    },
    
    updateStatusText() {
        switch (this.state) {
            case 'idle':
                this.statusText.textContent = 'Unggah foto untuk memulai.';
                break;
            case 'generating':
                const doneCount = this.results.filter(r => r.status !== 'pending').length;
                this.statusText.textContent = `Membuat... (${doneCount}/${this.results.length})`;
                break;
            case 'results':
                this.statusText.textContent = 'Pembuatan selesai. Klik gambar untuk pratinjau.';
                break;
        }
    },

    render() {
        this.inputStateEl.style.display = this.state === 'idle' ? 'block' : 'none';
        this.resultsStateEl.style.display = (this.state === 'generating' || this.state === 'results') ? 'block' : 'none';
        this.statusContainer.style.display = (this.state === 'idle' || this.state === 'generating' || this.state === 'results') ? 'flex' : 'none';
        this.progressWrapper.style.display = this.state === 'generating' ? 'block' : 'none';
        
        this.updateStatusText();
        
        if (this.state === 'generating' || this.state === 'results') {
            const hasResults = this.results.some(r => r.status !== 'pending');
            this.resultsPlaceholder.style.display = hasResults ? 'none' : 'flex';
            this.resultsGrid.style.display = hasResults ? 'grid' : 'none';

            this.resultsGrid.innerHTML = '';
            this.results.forEach((result, index) => {
                const item = document.createElement('div');
                item.className = 'image-result-item';
                item.dataset.index = String(index);

                if (result.status === 'pending') {
                    item.innerHTML = `<div class="loading-clock"></div>`;
                } else if (result.status === 'error') {
                    item.innerHTML = `<span>Error</span>`;
                } else if (result.status === 'done' && result.url) {
                    item.innerHTML = `<img src="${result.url}" alt="Generated studio photo ${index + 1}">
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
    
    handleGridClick(e: MouseEvent) {
        const target = e.target as HTMLElement;
        const item = target.closest('.image-result-item');
        if (!item) return;

        const index = parseInt((item as HTMLElement).dataset.index!, 10);
        const clickedResult = this.results[index];
        if (clickedResult.status !== 'done' || !clickedResult.url) return;

        const urls = this.results
            .filter(r => r.status === 'done' && r.url)
            .map(r => r.url!);
        
        const startIndex = urls.indexOf(clickedResult.url);
        
        if (startIndex > -1) {
            this.showPreviewModal(urls, startIndex);
        }
    },
};

// === Outfit Pro ===
const OutfitPro = {
    // DOM Elements
    view: document.querySelector('#outfit-pro-view') as HTMLDivElement,
    inputStateEl: document.querySelector('#outfit-pro-input-state') as HTMLDivElement,
    resultsStateEl: document.querySelector('#outfit-pro-results-state') as HTMLDivElement,
    statusContainerEl: document.querySelector('#outfit-pro-status-container') as HTMLDivElement,
    statusTextEl: document.querySelector('#outfit-pro-status') as HTMLParagraphElement,
    
    fileInput: document.querySelector('#outfit-pro-input') as HTMLInputElement,
    previewContainer: document.querySelector('#outfit-pro-preview-container') as HTMLDivElement,
    generateButton: document.querySelector('#outfit-pro-generate-button') as HTMLButtonElement,
    startOverButton: document.querySelector('#outfit-pro-start-over-button') as HTMLButtonElement,

    // Results
    flatLayBox: document.querySelector('#outfit-pro-flatlay-box') as HTMLDivElement,
    modelBox: document.querySelector('#outfit-pro-model-box') as HTMLDivElement,
    downloadFlatLayButton: document.querySelector('#outfit-pro-download-flatlay-button') as HTMLButtonElement,
    downloadModelButton: document.querySelector('#outfit-pro-download-model-button') as HTMLButtonElement,

    // State
    state: 'idle' as 'idle' | 'generating' | 'results',
    outfitImages: [] as { file: File, dataUrl: string, base64: string }[],
    // FIX: Initialize results with a valid object value and use a type assertion.
    results: {
        flatLay: { status: 'pending' },
        modelTryOn: { status: 'pending' },
    } as {
        flatLay: { status: 'pending' | 'done' | 'error', url?: string, errorMessage?: string },
        modelTryOn: { status: 'pending' | 'done' | 'error', url?: string, errorMessage?: string },
    },

    // Dependencies
    getApiKey: (() => '') as () => string,
    showPreviewModal: ((urls: (string | null)[], startIndex?: number) => {}) as (urls: (string | null)[], startIndex?: number) => void,

    init(dependencies: { getApiKey: () => string; showPreviewModal: (urls: (string | null)[], startIndex?: number) => void; }) {
        if (!this.view) return;
        this.getApiKey = dependencies.getApiKey;
        this.showPreviewModal = dependencies.showPreviewModal;
        this.addEventListeners();
    },

    addEventListeners() {
        const dropZone = this.fileInput.closest('.file-drop-zone') as HTMLElement;
        setupDragAndDrop(dropZone, this.fileInput);
        // FIX: Add a click listener to the entire drop zone to trigger the file input,
        // which fixes the issue of only the center text being clickable. This also ensures
        // the upload handler is correctly triggered, making the images appear.
        dropZone.addEventListener('click', (e: MouseEvent) => {
            // Prevent triggering if a remove button inside the preview is clicked.
            if ((e.target as HTMLElement).closest('.remove-image-btn')) {
                return;
            }
            this.fileInput.click();
        });
        this.fileInput.addEventListener('change', this.handleImageUpload.bind(this));
        this.previewContainer.addEventListener('click', this.handleRemoveImage.bind(this));
        this.generateButton.addEventListener('click', this.handleGenerate.bind(this));
        this.startOverButton.addEventListener('click', this.handleStartOver.bind(this));
        this.downloadFlatLayButton.addEventListener('click', () => this.handleDownload('flatLay'));
        this.downloadModelButton.addEventListener('click', () => this.handleDownload('modelTryOn'));
        this.flatLayBox.addEventListener('click', () => this.handleResultClick('flatLay'));
        this.modelBox.addEventListener('click', () => this.handleResultClick('modelTryOn'));
    },

    handleResultClick(type: 'flatLay' | 'modelTryOn') {
        const clickedResult = this.results[type];
        // Only proceed if the clicked item is successfully generated
        if (clickedResult.status !== 'done' || !clickedResult.url) {
            return;
        }
    
        // Build an array of all available result URLs to pass to the modal
        const availableUrls = [this.results.flatLay.url, this.results.modelTryOn.url]
            .filter((url): url is string => !!url);
        
        // Find the index of the clicked image within the array of available URLs
        const startIndex = availableUrls.indexOf(clickedResult.url);
    
        if (startIndex > -1) {
            this.showPreviewModal(availableUrls, startIndex);
        }
    },

    updateGenerateButton() {
        this.generateButton.disabled = this.outfitImages.length === 0;
    },

    async handleImageUpload(e: Event) {
        const files = (e.target as HTMLInputElement).files;
        if (!files) return;

        const filesToProcess = Array.from(files);
        if (this.outfitImages.length + filesToProcess.length > 10) {
            alert('Anda hanya dapat mengunggah maksimal 10 gambar.'); // Simple feedback for now
            return;
        }

        for (const file of filesToProcess) {
            if (this.outfitImages.some(img => img.file.name === file.name && img.file.size === file.size)) continue;
            const dataUrl = await blobToDataUrl(file);
            const base64 = dataUrl.split(',')[1];
            this.outfitImages.push({ file, dataUrl, base64 });
        }
        this.renderImagePreviews();
        this.updateGenerateButton();
    },

    renderImagePreviews() {
        this.previewContainer.innerHTML = this.outfitImages.map((image, index) => `
            <div class="multi-image-preview-item">
                <img src="${image.dataUrl}" alt="${image.file.name}">
                <button class="remove-image-btn" data-index="${index}" aria-label="Hapus gambar">
                    <svg xmlns="http://www.w3.org/2000/svg" height="14px" viewBox="0 0 24 24" width="14px" fill="currentColor"><path d="M0 0h24v24H0V0z" fill="none"></path><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12 19 6.41z"></path></svg>
                </button>
            </div>
        `).join('');
    },

    handleRemoveImage(e: MouseEvent) {
        const target = e.target as HTMLElement;
        const removeBtn = target.closest('.remove-image-btn');
        if (removeBtn) {
            const index = parseInt(removeBtn.getAttribute('data-index')!, 10);
            this.outfitImages.splice(index, 1);
            this.renderImagePreviews();
            this.updateGenerateButton();
        }
    },

    async handleGenerate() {
        if (this.outfitImages.length === 0) return;

        this.state = 'generating';
        this.results = {
            flatLay: { status: 'pending' },
            modelTryOn: { status: 'pending' },
        };
        this.render();

        const imageParts = this.outfitImages.map(img => ({
            inlineData: { data: img.base64, mimeType: img.file.type || 'image/png' }
        }));

        const flatLayPrompt = "Create a photorealistic flat lay composition using all the provided fashion items. Arrange them neatly and artistically on a clean, neutral surface like light wood or marble. The final image must be in a 9:16 vertical aspect ratio.";
        const modelTryOnPrompt = "Create a photorealistic image of a faceless mannequin or gender-neutral model wearing all the provided fashion items to form a complete outfit. The model should be standing in a confident, full-body pose against a simple light gray studio background. The focus should be on how the clothes fit and drape together. The final image must be in a 9:16 vertical aspect ratio.";
        
        const generateMockup = async (prompt: string, type: 'flatLay' | 'modelTryOn') => {
            try {
                const response = await generateStyledImage(
                    this.outfitImages[0].base64,
                    null,
                    prompt,
                    this.getApiKey,
                    this.outfitImages.slice(1).map(img => ({ inlineData: { data: img.base64, mimeType: img.file.type || 'image/png' } }))
                );

                const imagePart = response.candidates?.[0]?.content?.parts.find(p => p.inlineData);
                if (imagePart?.inlineData) {
                    const imageUrl = `data:${imagePart.inlineData.mimeType};base64,${imagePart.inlineData.data}`;
                    this.results[type] = { status: 'done', url: imageUrl };
                } else {
                    const textPart = response.candidates?.[0]?.content?.parts.find(p => p.text);
                    throw new Error(textPart?.text || "No image data in response.");
                }
            } catch (e: any) {
                console.error(`Error generating ${type} mockup:`, e);
                this.results[type] = { status: 'error', errorMessage: 'Pembuatan gagal.' };
            } finally {
                this.render();
            }
        };

        // Run both generations concurrently
        await Promise.all([
            generateMockup(flatLayPrompt, 'flatLay'),
            generateMockup(modelTryOnPrompt, 'modelTryOn')
        ]);

        this.state = 'results';
        this.render();
    },
    
    handleDownload(type: 'flatLay' | 'modelTryOn') {
        const url = this.results[type].url;
        if (url) {
            downloadFile(url, `outfit_pro_${type}.png`);
        }
    },

    handleStartOver() {
        this.state = 'idle';
        this.outfitImages = [];
        this.results = {
            flatLay: { status: 'pending' },
            modelTryOn: { status: 'pending' },
        };
        this.fileInput.value = '';
        this.renderImagePreviews();
        this.updateGenerateButton();
        this.render();
    },

    render() {
        this.inputStateEl.style.display = this.state === 'idle' ? 'block' : 'none';
        this.resultsStateEl.style.display = (this.state === 'generating' || this.state === 'results') ? 'block' : 'none';
        this.statusContainerEl.style.display = (this.state === 'generating') ? 'flex' : 'none';

        if (this.state === 'generating') {
            this.statusTextEl.textContent = 'AI sedang membuat mockup Anda...';
        }

        const renderResultBox = (element: HTMLDivElement, result: typeof this.results.flatLay, downloadButton: HTMLButtonElement) => {
            downloadButton.disabled = true;
            switch(result.status) {
                case 'pending':
                    element.innerHTML = '<div class="loading-clock"></div>';
                    break;
                case 'done':
                    if (result.url) {
                        element.innerHTML = `<img src="${result.url}" alt="Generated mockup" />`;
                        downloadButton.disabled = false;
                    }
                    break;
                case 'error':
                    element.innerHTML = `<p class="pending-status-text">${result.errorMessage || 'Terjadi kesalahan.'}</p>`;
                    break;
            }
        };
        
        if (this.state === 'generating' || this.state === 'results') {
            renderResultBox(this.flatLayBox, this.results.flatLay, this.downloadFlatLayButton);
            renderResultBox(this.modelBox, this.results.modelTryOn, this.downloadModelButton);
        }
    },
};

// === Model Creative ===
const ModelCreative = {
    // DOM Elements
    view: document.querySelector('#model-creative-view') as HTMLDivElement,
    inputStateEl: document.querySelector('#model-creative-input-state') as HTMLDivElement,
    resultsStateEl: document.querySelector('#model-creative-results-state') as HTMLDivElement,
    
    // Inputs
    genderSelect: document.querySelector('#model-creative-gender') as HTMLSelectElement,
    raceSelect: document.querySelector('#model-creative-race') as HTMLSelectElement,
    ageSelect: document.querySelector('#model-creative-age') as HTMLSelectElement,
    skinInput: document.querySelector('#model-creative-skin') as HTMLInputElement,
    hairInput: document.querySelector('#model-creative-hair') as HTMLInputElement,
    bodyInput: document.querySelector('#model-creative-body') as HTMLInputElement,
    
    // Actions & Results
    generateButton: document.querySelector('#model-creative-generate-button') as HTMLButtonElement,
    resultBox: document.querySelector('#model-creative-result-box') as HTMLDivElement,
    downloadButton: document.querySelector('#model-creative-download-button') as HTMLButtonElement,
    startOverButton: document.querySelector('#model-creative-start-over-button') as HTMLButtonElement,

    // State
    state: 'idle' as 'idle' | 'generating' | 'results' | 'error',
    resultImageUrl: null as string | null,
    errorMessage: '',

    // Dependencies
    getApiKey: (() => '') as () => string,
    showPreviewModal: ((urls: (string | null)[], startIndex?: number) => {}) as (urls: (string | null)[], startIndex?: number) => void,

    init(dependencies: { getApiKey: () => string; showPreviewModal: (urls: (string | null)[], startIndex?: number) => void; }) {
        if (!this.view) return;
        this.getApiKey = dependencies.getApiKey;
        this.showPreviewModal = dependencies.showPreviewModal;
        this.addEventListeners();
        this.render();
    },

    addEventListeners() {
        this.generateButton.addEventListener('click', this.handleGenerate.bind(this));
        this.downloadButton.addEventListener('click', this.handleDownload.bind(this));
        this.startOverButton.addEventListener('click', this.handleStartOver.bind(this));
        this.resultBox.addEventListener('click', this.handleResultClick.bind(this));
    },

    buildPrompt(): string {
        const gender = this.genderSelect.value;
        const race = this.raceSelect.value;
        const ageGroup = this.ageSelect.value;
        const skinTone = this.skinInput.value.trim() || 'natural';
        const hairStyle = this.hairInput.value.trim() || 'stylish';
        const bodyShape = this.bodyInput.value.trim() || 'average';

        return `Create a single, ultra-realistic, full-body studio photograph of a fashion model. The background must be a neutral light gray. The model's characteristics are: Gender: ${gender}, Race/Nationality: ${race}, Age group: ${ageGroup}, Skin tone: ${skinTone}, Hair style: ${hairStyle}, Body shape: ${bodyShape}. The lighting should be professional and soft. The image must have sharp focus and high-resolution details, resembling a 4K photograph.`;
    },

    async handleGenerate() {
        this.state = 'generating';
        this.render();

        const prompt = this.buildPrompt();

        try {
            // FIX: Replaced generateImageWithImagen with generateImage
            const imageUrl = await generateImage(prompt, this.getApiKey);
            this.resultImageUrl = imageUrl;
            this.state = 'results';
        } catch (e: any) {
            console.error("Error during model generation:", e);
            this.state = 'error';
            this.errorMessage = parseAndFormatErrorMessage(e, 'Pembuatan model');
        } finally {
            this.render();
        }
    },

    handleDownload() {
        if (this.resultImageUrl) {
            downloadFile(this.resultImageUrl, 'generated_model.png');
        }
    },
    
    handleResultClick() {
        if (this.resultImageUrl) {
            this.showPreviewModal([this.resultImageUrl], 0);
        }
    },

    handleStartOver() {
        this.state = 'idle';
        this.resultImageUrl = null;
        this.errorMessage = '';
        
        // Reset form fields
        this.skinInput.value = '';
        this.hairInput.value = '';
        this.bodyInput.value = '';
        this.genderSelect.selectedIndex = 0;
        this.raceSelect.selectedIndex = 0;
        this.ageSelect.selectedIndex = 0;

        this.render();
    },

    render() {
        this.inputStateEl.style.display = this.state === 'idle' ? 'block' : 'none';
        this.resultsStateEl.style.display = this.state !== 'idle' ? 'block' : 'none';

        switch (this.state) {
            case 'generating':
                this.resultBox.innerHTML = '<div class="loading-clock"></div>';
                this.downloadButton.disabled = true;
                break;
            case 'results':
                if (this.resultImageUrl) {
                    this.resultBox.innerHTML = `<img src="${this.resultImageUrl}" alt="Generated creative model" />`;
                    this.downloadButton.disabled = false;
                }
                break;
            case 'error':
                this.resultBox.innerHTML = `<p class="pending-status-text" style="padding: 1rem;">${this.errorMessage}</p>`;
                this.downloadButton.disabled = true;
                break;
            case 'idle':
                 this.resultBox.innerHTML = ''; // Clear box when starting over
                 break;
        }
    }
};

// === Logo Lab ===
const LogoLab = {
    // DOM Elements
    view: document.querySelector('#logo-lab-view') as HTMLDivElement,
    formContainer: document.querySelector('#logo-lab-form-container') as HTMLDivElement,
    step1: document.querySelector('#logo-lab-step-1') as HTMLDivElement,
    step2: document.querySelector('#logo-lab-step-2') as HTMLDivElement,
    resultsState: document.querySelector('#logo-lab-results-state') as HTMLDivElement,
    statusContainer: document.querySelector('#logo-lab-status-container') as HTMLDivElement,
    statusText: document.querySelector('#logo-lab-status') as HTMLParagraphElement,
    
    // Inputs
    businessNameInput: document.querySelector('#logo-lab-business-name') as HTMLInputElement,
    sloganInput: document.querySelector('#logo-lab-slogan') as HTMLInputElement,
    descriptionInput: document.querySelector('#logo-lab-description') as HTMLTextAreaElement,
    keywordsInput: document.querySelector('#logo-lab-keywords') as HTMLInputElement,
    briefInput: document.querySelector('#logo-lab-brief') as HTMLTextAreaElement,
    typeGroup: document.querySelector('#logo-lab-type-group') as HTMLDivElement,
    styleGroup: document.querySelector('#logo-lab-style-group') as HTMLDivElement,
    colorsInput: document.querySelector('#logo-lab-colors') as HTMLInputElement,

    // Actions & Results
    nextStep1Button: document.querySelector('#logo-lab-next-step-1') as HTMLButtonElement,
    backStep2Button: document.querySelector('#logo-lab-back-step-2') as HTMLButtonElement,
    generateButton: document.querySelector('#logo-lab-generate-button') as HTMLButtonElement,
    startOverButton: document.querySelector('#logo-lab-start-over-button') as HTMLButtonElement,
    resultsGrid: document.querySelector('#logo-lab-results-grid') as HTMLDivElement,
    refinementPanel: document.querySelector('#logo-lab-refinement-panel') as HTMLDivElement,
    refinePreview: document.querySelector('#logo-lab-refine-preview') as HTMLDivElement,
    refinePromptInput: document.querySelector('#logo-lab-refine-prompt') as HTMLTextAreaElement,
    refineGenerateButton: document.querySelector('#logo-lab-refine-generate') as HTMLButtonElement,
    refineCancelButton: document.querySelector('#logo-lab-refine-cancel') as HTMLButtonElement,
    refinementResultsGrid: document.querySelector('#logo-lab-refinement-results') as HTMLDivElement,
    

    // State
    state: 'step1' as 'step1' | 'step2' | 'generating-brief' | 'generating-logos' | 'results',
    brandBrief: '',
    logoType: 'Icon',
    logoStyle: 'Minimalist',
    results: [] as { status: 'pending' | 'done' | 'error', url?: string, base64?: string }[],
    selectedLogoForRefinement: null as { url: string, base64: string } | null,

    // Dependencies
    getApiKey: (() => '') as () => string,
    showPreviewModal: ((urls: (string | null)[], startIndex?: number) => {}) as (urls: (string | null)[], startIndex?: number) => void,

    init(dependencies: { getApiKey: () => string; showPreviewModal: (urls: (string | null)[], startIndex?: number) => void; }) {
        if (!this.view) return;
        this.getApiKey = dependencies.getApiKey;
        this.showPreviewModal = dependencies.showPreviewModal;
        this.addEventListeners();
        this.render();
    },

    addEventListeners() {
        this.nextStep1Button.addEventListener('click', this.handleNextStep1.bind(this));
        this.backStep2Button.addEventListener('click', () => {
            this.state = 'step1';
            this.render();
        });
        this.generateButton.addEventListener('click', this.handleGenerateLogos.bind(this));
        this.startOverButton.addEventListener('click', this.handleStartOver.bind(this));

        this.typeGroup.addEventListener('click', this.handleOptionClick.bind(this, 'logoType'));
        this.styleGroup.addEventListener('click', this.handleOptionClick.bind(this, 'logoStyle'));
        
        this.resultsGrid.addEventListener('click', this.handleGridClick.bind(this));
        this.refinementResultsGrid.addEventListener('click', this.handleGridClick.bind(this)); // Also handle clicks on refined logos
        this.refineGenerateButton.addEventListener('click', this.handleGenerateRefinement.bind(this));
        this.refineCancelButton.addEventListener('click', () => {
            this.refinementPanel.style.display = 'none';
            this.selectedLogoForRefinement = null;
        });
    },

    handleOptionClick(stateKey: 'logoType' | 'logoStyle', e: MouseEvent) {
        const target = e.target as HTMLElement;
        const button = target.closest('.toggle-button');
        if (button) {
            const value = (button as HTMLElement).dataset.value!;
            (this as any)[stateKey] = value;
            
            const group = stateKey === 'logoType' ? this.typeGroup : this.styleGroup;
            group.querySelectorAll('.toggle-button').forEach(btn => btn.classList.remove('active'));
            button.classList.add('active');
        }
    },

    async handleNextStep1() {
        const name = this.businessNameInput.value.trim();
        const desc = this.descriptionInput.value.trim();
        if (!name || !desc) {
            alert('Nama Bisnis dan Deskripsi harus diisi.');
            return;
        }

        this.state = 'generating-brief';
        this.render();

        try {
            const prompt = `Buat ringkasan merek kreatif (brand brief) dalam satu paragraf singkat untuk sebuah perusahaan. Berikut detailnya:
            - Nama: ${name}
            - Slogan: ${this.sloganInput.value.trim()}
            - Deskripsi: ${desc}
            - Kata Kunci: ${this.keywordsInput.value.trim()}
            Fokus pada esensi visual dan emosional dari merek tersebut untuk memandu seorang desainer logo.`;

            // FIX: This error is fixed by adding generateText to utils/gemini.ts
            this.brandBrief = await generateText(prompt, this.getApiKey);
            this.briefInput.value = this.brandBrief;
            this.state = 'step2';
        } catch (e) {
            console.error('Error generating brand brief:', e);
            this.statusText.textContent = parseAndFormatErrorMessage(e, 'Pembuatan brief');
            this.state = 'step1';
        } finally {
            this.render();
        }
    },

    async handleGenerateLogos() {
        this.state = 'generating-logos';
        this.brandBrief = this.briefInput.value.trim(); // Get latest edits
        this.results = Array(4).fill({ status: 'pending' });
        this.render();

        const generationPromises = this.results.map(async (_, index) => {
            try {
                const prompt = `Buat konsep logo berdasarkan brief berikut: "${this.brandBrief}".
                - Jenis Logo: ${this.logoType}
                - Gaya Desain: ${this.logoStyle}
                - Palet Warna: ${this.colorsInput.value.trim() || 'ditentukan desainer'}
                - **PENTING**: Hasilnya harus berupa logo bergaya vektor yang bersih, pada latar belakang putih polos. Hindari detail yang rumit. Ini untuk identitas merek.`;
                
                // FIX: Replaced generateImageWithImagen with generateImage
                const imageUrl = await generateImage(prompt, this.getApiKey);
                this.results[index] = { 
                    status: 'done', 
                    url: imageUrl,
                    base64: imageUrl.split(',')[1] 
                };
            } catch (e: any) {
                console.error(`Error generating logo ${index}:`, e);
                this.results[index] = { status: 'error' };
            } finally {
                this.render();
            }
        });
        
        await Promise.all(generationPromises);
        this.state = 'results';
        this.render();
    },

    async handleGenerateRefinement() {
        if (!this.selectedLogoForRefinement) return;

        const prompt = this.refinePromptInput.value.trim();
        if (!prompt) return;

        this.refineGenerateButton.disabled = true;
        this.refinementResultsGrid.innerHTML = Array(2).fill('<div class="image-result-item"><div class="loading-clock"></div></div>').join('');

        const generationPromises = Array(2).fill(null).map(async () => {
            try {
                // FIX: The error on this line should be resolved by fixing the other import errors.
                const response = await generateStyledImage(this.selectedLogoForRefinement!.base64, null, prompt, this.getApiKey);
                const imagePart = response.candidates?.[0]?.content?.parts.find(p => p.inlineData);
                if (imagePart?.inlineData) {
                    return `data:${imagePart.inlineData.mimeType};base64,${imagePart.inlineData.data}`;
                }
                return null;
            } catch {
                return null;
            }
        });

        const newUrls = (await Promise.all(generationPromises)).filter(Boolean) as string[];

        this.refinementResultsGrid.innerHTML = '';
        newUrls.forEach(url => {
            const newBase64 = url.split(',')[1];
            this.renderLogoItem(this.refinementResultsGrid, { status: 'done', url, base64: newBase64 });
        });
        
        this.refineGenerateButton.disabled = false;
    },

    handleGridClick(e: MouseEvent) {
        const target = e.target as HTMLElement;
        const wrapper = target.closest('.image-result-wrapper');
        if (!wrapper) return;

        const url = (wrapper.querySelector('img') as HTMLImageElement)?.src;
        if (!url) return;
        const base64 = url.split(',')[1];
        
        if (target.closest('.refine-btn')) {
            this.selectedLogoForRefinement = { url, base64 };
            this.refinementPanel.style.display = 'block';
            // FIX: Fixed template literal syntax error
            this.refinePreview.innerHTML = `<img src="${url}" alt="Logo terpilih untuk penyempurnaan">`;
            this.refinePromptInput.value = '';
            this.refinementResultsGrid.innerHTML = '';
            this.refinePromptInput.focus();
        } else if (target.closest('.download-btn')) {
            downloadFile(url, 'logo.png');
        } else if (target.closest('.image-result-item')) {
            this.showPreviewModal([url], 0);
        }
    },

    handleStartOver() {
        this.state = 'step1';
        this.brandBrief = '';
        this.logoType = 'Icon';
        this.logoStyle = 'Minimalist';
        this.results = [];
        this.selectedLogoForRefinement = null;
        
        // Reset form fields
        this.businessNameInput.value = '';
        this.sloganInput.value = '';
        this.descriptionInput.value = '';
        this.keywordsInput.value = '';
        this.briefInput.value = '';
        this.colorsInput.value = '';
        this.refinementPanel.style.display = 'none';

        this.render();
    },

    render() {
        this.formContainer.style.display = (this.state === 'step1' || this.state === 'step2' || this.state === 'generating-brief') ? 'block' : 'none';
        this.resultsState.style.display = (this.state === 'generating-logos' || this.state === 'results') ? 'block' : 'none';
        this.statusContainer.style.display = (this.state === 'generating-brief' || this.state === 'generating-logos') ? 'flex' : 'none';

        this.step1.style.display = (this.state === 'step1' || this.state === 'generating-brief') ? 'block' : 'none';
        this.step2.style.display = this.state === 'step2' ? 'block' : 'none';
        
        // Update status text
        if (this.state === 'generating-brief') {
            this.statusText.textContent = 'AI sedang membuat ringkasan merek...';
        } else if (this.state === 'generating-logos') {
            this.statusText.textContent = 'AI sedang membuat konsep logo Anda...';
        }
        
        // Render results grid
        if (this.state === 'generating-logos' || this.state === 'results') {
            this.resultsGrid.innerHTML = ''; // Clear previous
            this.results.forEach(result => {
                this.renderLogoItem(this.resultsGrid, result);
            });
        }
    },
    
    renderLogoItem(grid: HTMLElement, result: { status: 'pending' | 'done' | 'error', url?: string, base64?: string }) {
        const wrapper = document.createElement('div');
        wrapper.className = 'image-result-wrapper';

        const item = document.createElement('div');
        item.className = 'image-result-item';

        let itemHTML = '';
        if (result.status === 'pending') {
            itemHTML = `<div class="loading-clock"></div>`;
        } else if (result.status === 'error') {
            itemHTML = `<span>Error</span>`;
        } else if (result.status === 'done' && result.url) {
            itemHTML = `<img src="${result.url}" alt="Generated logo concept">
            <div class="affiliate-result-item-overlay">
                <button class="icon-button refine-btn" aria-label="Sempurnakan logo ini">
                    <svg xmlns="http://www.w3.org/2000/svg" height="20px" viewBox="0 0 24 24" width="20px" fill="currentColor"><g><rect fill="none" height="24" width="24"/></g><g><path d="M19,9l1.25-2.75L23,5l-2.75-1.25L19,1l-1.25,2.75L15,5l2.75,1.25L19,9z M11.5,9.5L9,4L6.5,9.5L1,12l5.5,2.5L9,20l2.5-5.5 L17,12L11.5,9.5z M19,15l-1.25,2.75L15,19l2.75,1.25L19,23l1.25-2.75L23,19l-2.75-1.25L19,15z"/></g></svg>
                </button>
                <button class="icon-button download-btn" aria-label="Unduh logo ini">
                    <svg xmlns="http://www.w3.org/2000/svg" height="20px" viewBox="0 0 24 24" width="20px" fill="currentColor"><path d="M0 0h24v24H0V0z" fill="none"/><path d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z"/></svg>
                </button>
            </div>`;
        }
        item.innerHTML = itemHTML;
        wrapper.appendChild(item);
        grid.appendChild(wrapper);
    }
};

// === Initialization ===
function showToast(message: string, type: 'info' | 'error' = 'info') {
    const container = document.getElementById('toast-container');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = `toast-notification${type === 'error' ? ' error' : ''}`;
    toast.textContent = message;
    
    container.appendChild(toast);

    setTimeout(() => {
        toast.remove();
    }, 3000);
}

document.addEventListener('DOMContentLoaded', () => {
    // === App State & Dependencies ===
    const dependencies = {
        getApiKey: () => premiumApiKey || (window as any).process.env.API_KEY,
        showPreviewModal: (urls: (string|null)[], startIndex = 0) => {
            if (!urls.length || urls.every(url => url === null)) return;
            // Filter out any null URLs which might come from errored generations
            const validUrls = urls.filter((url): url is string => url !== null);
            if (validUrls.length === 0) return;

            modalImageUrls = validUrls;
            modalCurrentIndex = startIndex;
            
            // Reset state
            isModalEditing = false;
            originalModalImageUrl = null;
            
            updateModalContent();
            imagePreviewModal.style.display = 'flex';
        },
        showNotification: showToast,
    };

    // === Module Initialization ===
    // IMPROVEMENT: The app now checks for the existence of the view before
    // initializing the corresponding module. This makes the code more robust and
    // prevents errors if a view is removed from the HTML.
    if (document.querySelector('#affiliate-pro-view')) {
        CreativeStudio.init(dependencies);
    }
    if (document.querySelector('#storyboard-view')) {
        Storyboard.init(dependencies);
    }
    if (document.querySelector('#retouch-view')) {
        RetouchAndColorizer.init(dependencies);
    }
    if (document.querySelector('#food-stylist-view')) {
        FoodStylist.init(dependencies);
    }
    if (document.querySelector('#stickerrr-view')) {
        Stickerrr.init(dependencies);
    }
    if (document.querySelector('#photo-studio-view')) {
        PhotoStudio.init(dependencies);
    }
     if (document.querySelector('#model-creative-view')) {
        ModelCreative.init(dependencies);
    }
    if (document.querySelector('#logo-lab-view')) {
        LogoLab.init(dependencies);
    }
    if (document.querySelector('#outfit-pro-view')) {
        OutfitPro.init(dependencies);
    }
    if (document.querySelector('#ai-voice-studio-view')) {
        AiVoiceStudio.init(dependencies);
    }


    // === Event Listeners ===

    // Sidebar navigation
    sidebarLinks.forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            const viewId = (e.currentTarget as HTMLElement).dataset.view;
            if (!viewId) return;

            sidebarLinks.forEach(l => l.classList.remove('active'));
            link.classList.add('active');

            views.forEach(view => {
                view.classList.toggle('active', view.id === viewId);
            });
            
            const viewTitle = (link.querySelector('span') as HTMLSpanElement).textContent || 'AI Studio';
            appTitle.textContent = viewTitle;
        });
    });

    // Theme switcher
    themeToggleButton.addEventListener('change', () => {
        document.body.classList.toggle('light-mode', themeToggleButton.checked);
    });
    
    // --- Image Preview Modal ---
    function updateModalContent() {
        const url = modalImageUrls[modalCurrentIndex];
        if (!url) return;
        
        const isVideo = url.startsWith('blob:') || url.includes('.mp4');
        modalPreviewImage.style.display = isVideo ? 'none' : 'block';
        modalPreviewVideo.style.display = isVideo ? 'block' : 'video';
        modalZoomControls.style.display = isVideo ? 'none' : 'flex';
        
        if (isVideo) {
            modalPreviewVideo.src = url;
            modalPreviewVideo.play();
        } else {
            modalPreviewImage.src = url;
            // Check if current view is food stylist to enable editing
            modalEditImageButton.style.display = document.querySelector('#food-stylist-view.active') ? 'inline-flex' : 'none';
        }

        modalPrevButton.style.display = modalImageUrls.length > 1 ? 'flex' : 'none';
        modalNextButton.style.display = modalImageUrls.length > 1 ? 'flex' : 'none';
        modalImageCounter.textContent = `${modalCurrentIndex + 1} / ${modalImageUrls.length}`;
        modalImageCounter.style.display = modalImageUrls.length > 1 ? 'inline' : 'none';

        // Reset zoom and pan for new image
        resetModalZoomAndPan();
        
        // Reset editor
        modalMagicGarnishPanel.style.display = 'none';
        modalEditImageButton.style.display = document.querySelector('#food-stylist-view.active') ? 'inline-flex' : 'none';
        modalMagicGarnishUndoButton.disabled = true;
    }
    
    function showNextModalImage() {
        modalCurrentIndex = (modalCurrentIndex + 1) % modalImageUrls.length;
        updateModalContent();
    }
    
    function showPrevModalImage() {
        modalCurrentIndex = (modalCurrentIndex - 1 + modalImageUrls.length) % modalImageUrls.length;
        updateModalContent();
    }
    
    function resetModalZoomAndPan() {
        modalZoomLevel = 1;
        modalImageOffset = { x: 0, y: 0 };
        applyModalTransform();
    }

    function applyModalTransform() {
        modalPreviewImage.style.transform = `scale(${modalZoomLevel}) translate(${modalImageOffset.x}px, ${modalImageOffset.y}px)`;
    }

    modalPrevButton.addEventListener('click', showPrevModalImage);
    modalNextButton.addEventListener('click', showNextModalImage);
    modalPreviewCloseButton.addEventListener('click', () => {
        imagePreviewModal.style.display = 'none';
        modalPreviewVideo.pause();
    });

    // Modal Zoom & Pan
    modalZoomInButton.addEventListener('click', () => {
        modalZoomLevel = Math.min(MAX_ZOOM, modalZoomLevel * ZOOM_STEP);
        applyModalTransform();
    });
    modalZoomOutButton.addEventListener('click', () => {
        modalZoomLevel = Math.max(MIN_ZOOM, modalZoomLevel / ZOOM_STEP);
        if (modalZoomLevel === MIN_ZOOM) {
            resetModalZoomAndPan();
        }
        applyModalTransform();
    });
    modalZoomResetButton.addEventListener('click', resetModalZoomAndPan);

    modalImageContainer.addEventListener('mousedown', (e) => {
        if (modalZoomLevel > 1) {
            modalIsPanning = true;
            modalStartPan = { x: e.clientX - modalImageOffset.x * modalZoomLevel, y: e.clientY - modalImageOffset.y * modalZoomLevel };
            modalImageContainer.classList.add('panning');
        }
    });

    modalImageContainer.addEventListener('mouseup', () => {
        modalIsPanning = false;
        modalImageContainer.classList.remove('panning');
    });

    modalImageContainer.addEventListener('mouseleave', () => {
        modalIsPanning = false;
        modalImageContainer.classList.remove('panning');
    });

    modalImageContainer.addEventListener('mousemove', (e) => {
        if (modalIsPanning) {
            e.preventDefault();
            modalImageOffset.x = (e.clientX - modalStartPan.x) / modalZoomLevel;
            modalImageOffset.y = (e.clientY - modalStartPan.y) / modalZoomLevel;
            applyModalTransform();
        }
    });

    // Modal Image Filtering
    modalFilterButtons.addEventListener('click', (e) => {
        const button = (e.target as HTMLElement).closest('.toggle-button');
        if (!button) return;
        
        modalFilterButtons.querySelectorAll('.toggle-button').forEach(btn => btn.classList.remove('active'));
        button.classList.add('active');
        
        modalActiveFilter = button.getAttribute('data-filter') || 'none';
        modalPreviewImage.style.filter = modalActiveFilter === 'bw' ? 'grayscale(100%)' :
                                         modalActiveFilter === 'vintage' ? 'sepia(70%)' : 'none';
    });

    // --- Magic Garnish Editor (in Modal) ---
    modalEditImageButton.addEventListener('click', () => {
        isModalEditing = !isModalEditing;
        modalEditImageButton.style.display = isModalEditing ? 'none' : 'inline-flex';
        modalMagicGarnishPanel.style.display = isModalEditing ? 'flex' : 'none';
        if (isModalEditing && !originalModalImageUrl) {
            originalModalImageUrl = modalPreviewImage.src; // Save original state
        }
    });

    modalMagicGarnishUndoButton.addEventListener('click', () => {
        if (originalModalImageUrl) {
            modalPreviewImage.src = originalModalImageUrl;
            // Update the main modal array so downloading works correctly
            modalImageUrls[modalCurrentIndex] = originalModalImageUrl;
            modalMagicGarnishUndoButton.disabled = true;
        }
    });

    modalMagicGarnishGenerateButton.addEventListener('click', async () => {
        const prompt = modalMagicGarnishPrompt.value.trim();
        if (!prompt || isGeneratingEdit) return;

        isGeneratingEdit = true;
        modalMagicGarnishGenerateButton.disabled = true;
        modalImageContainer.insertAdjacentHTML('beforeend', '<div class="loading-clock"></div>');

        try {
            const currentImage = modalImageUrls[modalCurrentIndex];
            const base64 = currentImage.split(',')[1];

            // IMPROVEMENT: Wrapped the API call in withRetry for better resilience against transient errors.
            const response = await withRetry(
                () => generateStyledImage(base64, null, prompt, dependencies.getApiKey),
                {
                    retries: 2,
                    delayMs: 1000,
                    onRetry: (attempt, error) => {
                        console.warn(`Magic Garnish attempt ${attempt} failed. Retrying...`, error);
                    }
                }
            );

            const imagePart = response.candidates?.[0]?.content?.parts.find(p => p.inlineData);
            if (imagePart?.inlineData) {
                const newImageUrl = `data:${imagePart.inlineData.mimeType};base64,${imagePart.inlineData.data}`;
                modalPreviewImage.src = newImageUrl;
                modalImageUrls[modalCurrentIndex] = newImageUrl; // Update the array
                modalMagicGarnishUndoButton.disabled = false;
            } else {
                throw new Error("Tidak ada gambar yang dikembalikan dari API.");
            }
        } catch (error) {
            console.error('Magic Garnish error:', error);
            showToast('Gagal membuat hiasan.', 'error');
        } finally {
            isGeneratingEdit = false;
            modalMagicGarnishGenerateButton.disabled = false;
            modalImageContainer.querySelector('.loading-clock')?.remove();
        }
    });

    // Modal Download Button (handles both original and filtered images)
    modalDownloadEditedButton.addEventListener('click', async () => {
        const url = modalImageUrls[modalCurrentIndex];
        if (!url) return;

        // If a filter is active, we need to apply it via canvas
        if (modalActiveFilter !== 'none' && !url.startsWith('blob:')) {
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');
            const img = new Image();
            img.crossOrigin = "anonymous";
            img.onload = () => {
                canvas.width = img.width;
                canvas.height = img.height;
                if (ctx) {
                    ctx.filter = modalPreviewImage.style.filter;
                    ctx.drawImage(img, 0, 0);
                    const filteredUrl = canvas.toDataURL('image/png');
                    downloadFile(filteredUrl, `edited_image_${Date.now()}.png`);
                }
            };
            img.src = url;
        } else {
            // No filter, just download the current URL
            const fileExtension = url.startsWith('blob:') ? 'mp4' : 'png';
            downloadFile(url, `creative_studio_${Date.now()}.${fileExtension}`);
        }
    });


    // --- API Key Management ---
    premiumApiKey = localStorage.getItem('geminiApiKey');
    apiKeyStatusIndicator.classList.toggle('active', !!premiumApiKey);

    premiumKeyButton.addEventListener('click', () => {
        apiKeyInput.value = premiumApiKey || '';
        apiKeyModalStatus.textContent = '';
        apiKeyModal.style.display = 'flex';
    });
    
    apiKeyModalCloseButton.addEventListener('click', () => apiKeyModal.style.display = 'none');
    apiKeyCancelButton.addEventListener('click', () => apiKeyModal.style.display = 'none');
    
    apiKeyClearButton.addEventListener('click', () => {
        localStorage.removeItem('geminiApiKey');
        premiumApiKey = null;
        apiKeyStatusIndicator.classList.remove('active');
        apiKeyModal.style.display = 'none';
        showToast('Kunci API premium dihapus.', 'info');
    });

    apiKeySaveButton.addEventListener('click', async () => {
        const key = apiKeyInput.value.trim();
        if (!key) {
            apiKeyModalStatus.textContent = 'Kunci API tidak boleh kosong.';
            return;
        }

        apiKeySaveButton.disabled = true;
        apiKeyModalStatus.textContent = 'Memvalidasi kunci...';

        const isValid = await validateApiKey(key);

        if (isValid) {
            localStorage.setItem('geminiApiKey', key);
            premiumApiKey = key;
            apiKeyStatusIndicator.classList.add('active');
            apiKeyModalStatus.textContent = 'Kunci API valid disimpan!';
            showToast('Kunci API Premium disimpan.');
            setTimeout(() => {
                apiKeyModal.style.display = 'none';
            }, 1000);
        } else {
            apiKeyModalStatus.textContent = 'Kunci API tidak valid atau terjadi kesalahan jaringan.';
            premiumApiKey = ''; // Set to empty to indicate invalid attempt
            apiKeyStatusIndicator.classList.remove('active');
        }
        apiKeySaveButton.disabled = false;
    });

    // Initialize the correct view on load
    const initialView = document.querySelector('.sidebar-link.active')?.getAttribute('data-view');
    if (initialView) {
        document.getElementById(initialView)?.classList.add('active');
        appTitle.textContent = document.querySelector('.sidebar-link.active span')?.textContent || 'Creative Studio';
    } else {
        // Fallback if no active link is set
        document.querySelector('.sidebar-link')?.classList.add('active');
        document.querySelector('.view')?.classList.add('active');
    }

});