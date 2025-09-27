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
import { validateApiKey, generateImage, generateVideoContent, generateStyledImage, generateText } from './utils/gemini.ts';

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
            this.refinePreview.innerHTML = `<img src="${url}" alt="Logo to refine">`;
            this.refinementResultsGrid.innerHTML = '';
            this.refinePromptInput.value = '';
            this.refinePromptInput.focus();
        } else if (target.closest('.download-btn')) {
            downloadFile(url, 'logo.png');
        } else if (target.closest('.preview-btn') || target.closest('.image-result-item')) {
            this.showPreviewModal([url], 0);
        }
    },
    
    handleStartOver() {
        this.state = 'step1';
        this.results = [];
        this.brandBrief = '';
        this.selectedLogoForRefinement = null;
        
        // Clear inputs
        this.businessNameInput.value = '';
        this.sloganInput.value = '';
        this.descriptionInput.value = '';
        this.keywordsInput.value = '';
        this.colorsInput.value = '';

        this.render();
    },

    renderLogoItem(grid: HTMLElement, result: (typeof this.results)[number]) {
        const wrapper = document.createElement('div');
        wrapper.className = 'image-result-wrapper';

        const item = document.createElement('div');
        item.className = 'image-result-item';

        if (result.status === 'pending') {
            item.innerHTML = `<div class="loading-clock"></div>`;
        } else if (result.status === 'error') {
            item.innerHTML = `<span>Error</span>`;
        } else if (result.status === 'done' && result.url) {
            item.innerHTML = `<img src="${result.url}" alt="Generated logo concept">
            <div class="affiliate-result-item-overlay">
                <button class="icon-button preview-btn" aria-label="Preview"><svg xmlns="http://www.w3.org/2000/svg" height="18px" viewBox="0 0 24 24" width="18px" fill="currentColor"><path d="M0 0h24v24H0V0z" fill="none"/><path d="M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5C21.27 7.61 17 4.5 12 4.5zm0 10c-2.48 0-4.5-2.02-4.5-4.5S9.52 5.5 12 5.5s4.5 2.02 4.5 4.5-2.02 4.5-4.5 4.5zm0-7C10.62 7.5 9.5 8.62 9.5 10s1.12 2.5 2.5 2.5 2.5-1.12 2.5-2.5S13.38 7.5 12 7.5z"/></svg></button>
                <button class="icon-button download-btn" aria-label="Download"><svg xmlns="http://www.w3.org/2000/svg" height="18px" viewBox="0 0 24 24" width="18px" fill="currentColor"><path d="M0 0h24v24H0V0z" fill="none"/><path d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z"/></svg></button>
                <button class="icon-button refine-btn" aria-label="Refine"><svg xmlns="http://www.w3.org/2000/svg" height="18px" viewBox="0 0 24 24" width="18px" fill="currentColor"><g><rect fill="none" height="24" width="24"/></g><g><path d="M19,9l1.25-2.75L23,5l-2.75-1.25L19,1l-1.25,2.75L15,5l2.75,1.25L19,9z M11.5,9.5L9,4L6.5,9.5L1,12l5.5,2.5L9,20l2.5-5.5 L17,12L11.5,9.5z M19,15l-1.25,2.75L15,19l2.75,1.25L19,23l1.25-2.75L23,19l-2.75-1.25L19,15z"/></g></svg></button>
            </div>`;
        }
        wrapper.appendChild(item);
        grid.appendChild(wrapper);
    },

    render() {
        // Manage visibility of sections
        this.formContainer.style.display = (this.state === 'step1' || this.state === 'step2' || this.state === 'generating-brief') ? 'block' : 'none';
        this.resultsState.style.display = (this.state === 'generating-logos' || this.state === 'results') ? 'block' : 'none';
        this.statusContainer.style.display = (this.state === 'generating-brief' || this.state === 'generating-logos') ? 'flex' : 'none';

        this.step1.style.display = this.state === 'step1' ? 'block' : 'none';
        this.step2.style.display = this.state === 'step2' ? 'block' : 'none';

        // Update status text
        if (this.state === 'generating-brief') {
            this.statusText.textContent = 'AI sedang membuat ringkasan merek...';
        } else if (this.state === 'generating-logos') {
            this.statusText.textContent = 'AI sedang membuat konsep logo...';
        } else {
            this.statusText.textContent = '';
        }

        // Render results grid
        if (this.state === 'generating-logos' || this.state === 'results') {
            this.resultsGrid.innerHTML = '';
            this.results.forEach(result => this.renderLogoItem(this.resultsGrid, result));
        }
        
        if (this.state !== 'results') {
            this.refinementPanel.style.display = 'none';
        }
    }
};


// === API Key Management ===
function getPremiumApiKey(): string | null {
    return localStorage.getItem('premiumApiKey');
}

function updateApiKeyStatusIndicator() {
    const key = premiumApiKey;
    if (key && key.length > 0) {
        apiKeyStatusIndicator.classList.add('active');
    } else {
        apiKeyStatusIndicator.classList.remove('active');
    }
}

function loadAndApplyApiKey() {
    premiumApiKey = getPremiumApiKey();
    updateApiKeyStatusIndicator();
}

function showApiKeyModal() {
    apiKeyModalStatus.textContent = '';
    apiKeyInput.value = premiumApiKey || '';
    apiKeyModal.style.display = 'flex';
}

function hideApiKeyModal() {
    apiKeyModal.style.display = 'none';
}

async function handleSaveApiKey() {
    const key = apiKeyInput.value.trim();
    if (!key) {
        handleClearApiKey();
        return;
    }

    apiKeyModalStatus.textContent = 'Memvalidasi kunci...';
    apiKeySaveButton.disabled = true;

    const isValid = await validateApiKey(key);

    if (isValid) {
        localStorage.setItem('premiumApiKey', key);
        premiumApiKey = key;
        updateApiKeyStatusIndicator();
        apiKeyModalStatus.textContent = 'Kunci API valid dan disimpan!';
        apiKeyModalStatus.style.color = 'var(--color-secondary)';
        await delay(1500);
        hideApiKeyModal();
    } else {
        localStorage.setItem('premiumApiKey', ''); // Store empty string to indicate invalid attempt
        premiumApiKey = '';
        updateApiKeyStatusIndicator();
        apiKeyModalStatus.textContent = 'Kunci API tidak valid. Silakan periksa dan coba lagi.';
        apiKeyModalStatus.style.color = '#f44336';
    }
    apiKeySaveButton.disabled = false;
}

function handleClearApiKey() {
    localStorage.removeItem('premiumApiKey');
    premiumApiKey = null;
    updateApiKeyStatusIndicator();
    apiKeyModalStatus.textContent = 'Kunci premium dihapus. Menggunakan kunci default.';
    apiKeyModalStatus.style.color = 'var(--color-text-muted)';
    apiKeyInput.value = '';
    setTimeout(hideApiKeyModal, 1500);
}

function getApiKey(): string {
    // Use the premium key from memory if it's a valid, non-empty string
    if (premiumApiKey && premiumApiKey.length > 0) {
        return premiumApiKey;
    }
    // BUG: `process.env` is a Node.js concept and will be undefined in the browser.
    // This will cause API calls to fail if no premium key is set.
    return process.env.API_KEY as string;
}

// === Image Preview Modal Logic ===
function applyModalTransform() {
    if (!modalPreviewImage) return;
    const { x, y } = modalImageOffset;
    modalPreviewImage.style.transform = `translate(${x}px, ${y}px) scale(${modalZoomLevel})`;
}

function resetModalTransform() {
    modalZoomLevel = 1;
    modalImageOffset = { x: 0, y: 0 };
    if (modalImageContainer) modalImageContainer.classList.remove('panning');
    applyModalTransform();
}

function updateModalMedia() {
    if (modalImageUrls.length === 0 || !modalImageContainer) return;
    
    resetModalTransform(); // Reset pan/zoom when changing media

    const currentUrl = modalImageUrls[modalCurrentIndex];
    const isVideo = currentUrl.startsWith('blob:');

    // Hide everything first
    modalPreviewImage.style.display = 'none';
    modalPreviewVideo.style.display = 'none';
    modalPreviewVideo.pause();
    modalPreviewVideo.src = '';

    if (isVideo) {
        modalPreviewVideo.src = currentUrl;
        modalPreviewVideo.style.display = 'block';
        modalPreviewVideo.play().catch(e => console.error("Error playing video:", e));
        modalZoomControls.style.display = 'none';
        modalFilterButtons.style.display = 'none';
        modalEditImageButton.style.display = 'none';
    } else {
        modalPreviewImage.style.visibility = 'hidden';
        modalPreviewImage.style.width = 'auto';
        modalPreviewImage.style.height = 'auto';

        modalPreviewImage.onload = () => {
            const img = modalPreviewImage;
            const container = modalImageContainer;

            const containerRatio = container.clientWidth / container.clientHeight;
            const imgRatio = img.naturalWidth / img.naturalHeight;

            if (imgRatio > containerRatio) {
                img.style.width = '100%';
                img.style.height = 'auto';
            } else {
                img.style.width = 'auto';
                img.style.height = '100%';
            }
            
            img.style.visibility = 'visible';
            img.onload = null;
        };
        
        modalPreviewImage.src = currentUrl;
        modalPreviewImage.style.display = 'block';
        modalZoomControls.style.display = 'flex';
        modalFilterButtons.style.display = 'flex';
        // Only show edit button if the current view is Food Lens
        const isFoodLensActive = document.querySelector('#food-stylist-view')?.classList.contains('active');
        modalEditImageButton.style.display = isFoodLensActive ? 'flex' : 'none';
        applyModalFilter(modalActiveFilter); // Reapply filter
    }
    
    const isMultiImage = modalImageUrls.length > 1;
    modalPrevButton.style.display = isMultiImage ? 'flex' : 'none';
    modalNextButton.style.display = isMultiImage ? 'flex' : 'none';
    modalImageCounter.style.display = isMultiImage ? 'block' : 'none';
    modalImageCounter.innerText = `${modalCurrentIndex + 1} / ${modalImageUrls.length}`;
}

function changeModalMedia(direction: 1 | -1) {
    const newIndex = modalCurrentIndex + direction;
    if (newIndex >= 0 && newIndex < modalImageUrls.length) {
        modalCurrentIndex = newIndex;
        resetModalTransform();
        applyModalFilter('none'); // Reset filter on image change
        setModalEditMode(false); // Exit edit mode when changing image
        updateModalMedia();
    }
}

function zoomModal(direction: 1 | -1) {
    const newZoom = direction > 0 ? modalZoomLevel * ZOOM_STEP : modalZoomLevel / ZOOM_STEP;
    modalZoomLevel = Math.max(MIN_ZOOM, Math.min(newZoom, MAX_ZOOM));
    
    if (modalZoomLevel <= MIN_ZOOM) {
        resetModalTransform();
    } else {
        applyModalTransform();
    }
}

function startPan(e: MouseEvent) {
    if (modalZoomLevel <= MIN_ZOOM) return;
    e.preventDefault();
    modalIsPanning = true;
    modalStartPan.x = e.clientX - modalImageOffset.x;
    modalStartPan.y = e.clientY - modalImageOffset.y;
    modalImageContainer.classList.add('panning');
}

function panImage(e: MouseEvent) {
    if (!modalIsPanning) return;
    e.preventDefault();
    const dx = e.clientX - modalStartPan.x;
    const dy = e.clientY - modalStartPan.y;
    modalImageOffset.x = dx;
    modalImageOffset.y = dy;
    applyModalTransform();
}

function endPan() {
    modalIsPanning = false;
    modalImageContainer.classList.remove('panning');
}

function applyModalFilter(filterName: string) {
    modalActiveFilter = filterName;
    const buttons = modalFilterButtons.querySelectorAll('.toggle-button');
    buttons.forEach(btn => {
        if ((btn as HTMLElement).dataset.filter === filterName) {
            btn.classList.add('active');
        } else {
            btn.classList.remove('active');
        }
    });

    switch (filterName) {
        case 'bw':
            modalPreviewImage.style.filter = 'grayscale(100%)';
            break;
        case 'vintage':
            modalPreviewImage.style.filter = 'sepia(80%) contrast(90%) brightness(110%)';
            break;
        case 'none':
        default:
            modalPreviewImage.style.filter = 'none';
            break;
    }
}

function handleModalDownload() {
    if (modalImageUrls.length === 0) return;
    const currentUrl = modalImageUrls[modalCurrentIndex];
    const isVideo = currentUrl.startsWith('blob:');

    if (isVideo) {
        downloadFile(currentUrl, `video-${Date.now()}.mp4`);
        return;
    }

    if (!modalPreviewImage || !modalPreviewImage.src || modalPreviewImage.src.endsWith('#')) return;

    const img = modalPreviewImage;
    const canvas = document.createElement('canvas');
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.filter = img.style.filter || 'none';
    ctx.drawImage(img, 0, 0);

    const dataUrl = canvas.toDataURL('image/png');
    downloadFile(dataUrl, `edited-image-${Date.now()}.png`);
}

function showPreviewModal(imageUrls: (string | null)[], startIndex = 0) {
    if (!imageUrls || imageUrls.length === 0 || !imagePreviewModal) return;

    modalImageUrls = imageUrls.filter((url): url is string => !!url);
    if (modalImageUrls.length === 0) return;

    modalCurrentIndex = Math.max(0, Math.min(startIndex, modalImageUrls.length - 1));
    
    resetModalTransform();
    applyModalFilter('none');
    setModalEditMode(false);
    updateModalMedia();
    
    imagePreviewModal.style.display = 'flex';
}

function hidePreviewModal() {
    if (imagePreviewModal) {
        imagePreviewModal.style.display = 'none';
        modalPreviewImage.src = '#';
        modalPreviewVideo.pause();
        modalPreviewVideo.src = '';
        modalImageUrls = [];
        modalCurrentIndex = 0;
        resetModalTransform();
        applyModalFilter('none');
        setModalEditMode(false); // Ensure edit mode is off when hiding
    }
}

// === New Functions for Magic Garnish ===
function setModalEditMode(isEditing: boolean) {
    isModalEditing = isEditing;
    if (isEditing) {
        originalModalImageUrl = modalPreviewImage.src;
        modalFilterButtons.style.display = 'none';
        modalMagicGarnishPanel.style.display = 'flex';
        modalMagicGarnishUndoButton.disabled = true; // Can't undo until an edit is made
    } else {
        originalModalImageUrl = null;
        modalFilterButtons.style.display = 'flex';
        modalMagicGarnishPanel.style.display = 'none';
        modalMagicGarnishPrompt.value = '';
    }
}

async function handleMagicGarnishGenerate() {
    const prompt = modalMagicGarnishPrompt.value.trim();
    if (!prompt || isGeneratingEdit) return;

    isGeneratingEdit = true;
    const loader = document.createElement('div');
    loader.className = 'loading-clock';
    modalImageContainer.appendChild(loader);
    modalMagicGarnishGenerateButton.disabled = true;
    
    try {
        const sourceImageBase64 = modalPreviewImage.src.split(',')[1];
        // IMPROVEMENT: Wrap API call in withRetry and use a non-blocking notification for errors.
        // FIX: Added missing options object for withRetry call.
        const response = await withRetry(() =>
            generateStyledImage(sourceImageBase64, null, prompt, getApiKey),
            {
                retries: 2,
                delayMs: 1000,
                onRetry: (attempt, error) => console.warn(`Magic Garnish attempt ${attempt} failed. Retrying...`, error)
            }
        );
        const imagePart = response.candidates?.[0]?.content?.parts.find(p => p.inlineData);

        if (imagePart?.inlineData) {
            const newImageUrl = `data:${imagePart.inlineData.mimeType};base64,${imagePart.inlineData.data}`;
            modalPreviewImage.src = newImageUrl;
            // Update the URL in the main array so next/prev works correctly with the new image
            modalImageUrls[modalCurrentIndex] = newImageUrl;
            modalMagicGarnishUndoButton.disabled = false;
        } else {
            throw new Error("No image data returned from edit.");
        }
    } catch (e: any) {
        console.error("Magic Garnish failed:", e);
        // IMPROVEMENT: Use the showNotification function instead of a blocking alert.
        const showNotification = (window as any).showNotification;
        if (showNotification) {
            showNotification(`Gagal mengedit gambar: ${e.message}`, 'error');
        } else {
            alert(`Gagal mengedit gambar: ${e.message}`);
        }
    } finally {
        isGeneratingEdit = false;
        modalImageContainer.removeChild(loader);
        modalMagicGarnishGenerateButton.disabled = false;
    }
}


// === View Switching Logic ===
function handleViewSwitch(e: Event) {
    e.preventDefault();
    const link = (e.target as HTMLElement).closest('.sidebar-link');
    if (!link || link.classList.contains('active')) return;

    const viewName = link.getAttribute('data-view');
    if (!viewName) return;

    sidebarLinks.forEach(l => l.classList.remove('active'));
    link.classList.add('active');

    views.forEach(view => {
        if (view.id === viewName) {
            view.classList.add('active');
        } else {
            view.classList.remove('active');
        }
    });

    const titleText = link.querySelector('span')?.textContent;
    if (appTitle && titleText) {
        appTitle.textContent = titleText;
    }
}


// === Initial Setup ===
document.addEventListener('DOMContentLoaded', () => {
  loadAndApplyApiKey();

  const initialActiveLink = document.querySelector('.sidebar-link.active');
  if (initialActiveLink) {
    const initialTitle = initialActiveLink.querySelector('span')?.textContent;
    if (appTitle && initialTitle) {
      appTitle.textContent = initialTitle;
    }
  }

  const applyTheme = (theme: 'light' | 'dark') => {
      if (theme === 'light') {
          document.body.classList.add('light-mode');
          if (themeToggleButton) themeToggleButton.checked = true;
      } else {
          document.body.classList.remove('light-mode');
          if (themeToggleButton) themeToggleButton.checked = false;
      }
  };

  const savedTheme = localStorage.getItem('theme') as 'light' | 'dark' | null;
  if (savedTheme) {
      applyTheme(savedTheme);
  } else {
      applyTheme('dark');
  }

  themeToggleButton?.addEventListener('change', () => {
      const newTheme = themeToggleButton.checked ? 'light' : 'dark';
      applyTheme(newTheme);
      localStorage.setItem('theme', newTheme);
  });

  // FIX: Added a showNotification function and passed it to the CreativeStudio init call to resolve the type error.
  const toastContainer = document.querySelector('#toast-container');
  const showNotification = (message: string, type: 'info' | 'error' = 'info') => {
    if (!toastContainer) return;
    const toast = document.createElement('div');
    toast.className = `toast-notification ${type === 'error' ? 'error' : 'success'}`;
    toast.textContent = message;
    toastContainer.appendChild(toast);
    setTimeout(() => {
        toast.remove();
    }, 3000);
  };
  // IMPROVEMENT: Make the notification function globally accessible for the modal logic.
  (window as any).showNotification = showNotification;

  CreativeStudio.init({ getApiKey, showPreviewModal, showNotification });
  Storyboard.init({ getApiKey, showPreviewModal });
  RetouchAndColorizer.init({ getApiKey, showPreviewModal });
  FoodStylist.init({ getApiKey, showPreviewModal });
  PhotoStudio.init({ getApiKey, showPreviewModal });
  OutfitPro.init({ getApiKey, showPreviewModal });
  ModelCreative.init({ getApiKey, showPreviewModal });
  Stickerrr.init({ getApiKey, showPreviewModal });
  LogoLab.init({ getApiKey, showPreviewModal });
  
  // API Key Modal Listeners
  premiumKeyButton?.addEventListener('click', showApiKeyModal);
  apiKeyCancelButton?.addEventListener('click', hideApiKeyModal);
  apiKeyModalCloseButton?.addEventListener('click', hideApiKeyModal);
  apiKeySaveButton?.addEventListener('click', handleSaveApiKey);
  apiKeyClearButton?.addEventListener('click', handleClearApiKey);
  apiKeyModal?.addEventListener('click', (e) => {
    if (e.target === apiKeyModal) {
      hideApiKeyModal();
    }
  });

  // Modal Listeners
  modalPreviewCloseButton?.addEventListener('click', hidePreviewModal);
  imagePreviewModal?.addEventListener('click', (e) => {
    if (e.target === imagePreviewModal) {
      hidePreviewModal();
    }
  });
  modalPrevButton?.addEventListener('click', () => changeModalMedia(-1));
  modalNextButton?.addEventListener('click', () => changeModalMedia(1));

  // Pan & Zoom Listeners
  modalImageContainer?.addEventListener('mousedown', startPan);
  modalImageContainer?.addEventListener('mousemove', panImage);
  modalImageContainer?.addEventListener('mouseup', endPan);
  modalImageContainer?.addEventListener('mouseleave', endPan);
  modalZoomInButton?.addEventListener('click', () => zoomModal(1));
  modalZoomOutButton?.addEventListener('click', () => zoomModal(-1));
  modalZoomResetButton?.addEventListener('click', resetModalTransform);

  // Filter and Download
  modalFilterButtons?.addEventListener('click', (e) => {
    const button = (e.target as HTMLElement).closest('.toggle-button');
    if (button) {
      applyModalFilter((button as HTMLElement).dataset.filter || 'none');
    }
  });
  modalDownloadEditedButton?.addEventListener('click', handleModalDownload);

  // Magic Garnish (Food Lens specific)
  modalEditImageButton?.addEventListener('click', () => setModalEditMode(true));
  modalMagicGarnishGenerateButton?.addEventListener('click', handleMagicGarnishGenerate);
  modalMagicGarnishUndoButton?.addEventListener('click', () => {
    if (originalModalImageUrl) {
      modalPreviewImage.src = originalModalImageUrl;
      // Update the URL in the main array so next/prev works correctly with the new image
      modalImageUrls[modalCurrentIndex] = originalModalImageUrl;
      modalMagicGarnishUndoButton.disabled = true;
    }
  });
  
  // View switching
  sidebarMenu?.addEventListener('click', handleViewSwitch);
});

// BUG: This line will cause a runtime error in the browser because 'process' is not defined.
// It needs to be replaced with a browser-compatible way to handle default/fallback API keys.
declare const process: any;