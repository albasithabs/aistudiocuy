/* tslint:disable */
/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { blobToDataUrl, delay, downloadFile, parseAndFormatErrorMessage, setupDragAndDrop, withGenericRetry } from "../utils/helpers.js";
// FIX: Corrected import path and added missing functions to gemini.ts
import { generateStyledImage, generateVideoContent, generateOutdoorThemesForProduct, generateTextFromImage } from "../utils/gemini.ts";

const productShotLoadingMessages = [
    'Menyiapkan studio virtual...',
    'Memilih lensa terbaik...',
    'Menyesuaikan pencahayaan...',
    'Menyusun bidikan...',
    'Menerapkan efek pasca-pemrosesan...',
    'Merender detail akhir...',
];

const LOOKBOOK_SCENE_PROMPTS: { [key: string]: string } = {
    'studio': 'sebuah studio foto yang bersih dan profesional dengan latar belakang abu-abu muda yang mulus',
    'street': 'pengaturan gaya jalanan perkotaan yang hidup, dengan elemen kota yang realistis seperti dinding grafiti atau penyeberangan jalan',
    'office': 'lingkungan kantor atau perusahaan yang modern dan cerah',
    'home': 'interior rumah yang kasual dan nyaman dengan pencahayaan alami yang lembut',
    'party': 'suasana pesta atau acara yang meriah dengan pencahayaan dinamis dan latar belakang buram',
    'catwalk': 'pengaturan catwalk atau runway mode tinggi dengan pencahayaan dramatis'
};

const LOOKBOOK_POSE_PROMPTS: { [key: string]: string } = {
    'neutral': 'dalam pose berdiri netral, bidikan seluruh tubuh, menghadap kamera secara langsung, memancarkan kepercayaan diri',
    'walk': 'pose berjalan yang dinamis, ditangkap di tengah langkah, menampilkan gerakan pakaian',
    'lean': 'bersandar santai di dinding atau permukaan sederhana, menciptakan getaran yang santai dan keren',
    'sit': 'duduk di tepi bangku, balok, atau kursi sederhana, menyoroti kesesuaian produk dalam posisi duduk',
    'closeup': 'bidikan close-up detail dari pinggang ke atas, berfokus pada tekstur, kesesuaian, dan detail produk',
    'spin': 'pose berputar atau berbalik editorial, menangkap aliran dan siluet pakaian'
};


const CATEGORY_PROMPTS = {
    skincare: {
        themes: [
            'di atas lempengan marmer minimalis dengan latar belakang merah muda lembut',
            'dengan percikan air elegan dan daun monstera tunggal',
            'di atas hamparan kain sutra berwarna pastel',
            'di samping kotak produk yang dirancang dengan indah dengan pencahayaan studio yang lembut',
            'dengan latar belakang laboratorium yang bersih dan klinis',
            'tercermin dalam genangan air jernih',
        ],
        angles: [
            'bidikan close-up dramatis', 'bidikan setinggi mata profesional', 'bidikan sudut tinggi yang elegan', 'bidikan makro detail yang berfokus pada tekstur', 'bidikan tampilan samping yang kreatif', 'bidikan produk melayang',
        ]
    },
    food: {
        themes: [
            'dalam suasana dapur pedesaan yang nyaman dengan tepung ditaburkan di atas meja kayu',
            'di atas selimut piknik yang cerah di taman yang cerah',
            'di atas meja kafe modern yang ramping di sebelah secangkir kopi',
            'sebagai bagian dari flat lay yang indah dengan bahan-bahan segar tersebar di sekitarnya',
            'disajikan di piring restoran kelas atas',
            'dengan latar belakang gelap dan murung dengan pencahayaan dramatis',
        ],
        angles: [
            'bidikan close-up yang menggiurkan', 'bidikan sudut 45 derajat yang menggugah selera', 'bidikan flat lay dari atas ke bawah', 'bidikan aksi dinamis (misalnya, menuangkan sirup)', 'bidikan sudut rendah membuat makanan terlihat megah', 'bidikan yang menunjukkan tangan berinteraksi dengan makanan',
        ]
    },
    gadget: {
        themes: [
            'di atas latar belakang grid neon futuristik yang bersinar',
            'di studio berteknologi tinggi dengan permukaan logam yang ramping',
            'dibongkar dalam tampilan meledak artistik (knolling)',
            'dalam suasana gelap dan murung dengan pencahayaan sumber tunggal yang dramatis',
            'digunakan oleh seseorang di lingkungan kantor modern',
            'di atas tumpuan seolah-olah di museum atau galeri',
        ],
        angles: [
            'bidikan tampilan tiga perempat yang ramping', 'bidikan sudut rendah yang dramatis agar terlihat kuat', 'bidikan bersih dari atas ke bawah dengan latar belakang minimalis', 'bidikan makro detail dari fitur tertentu (misalnya, port, tombol)', 'bidikan gaya hidup dalam konteks', 'bidikan produk melayang yang kreatif',
        ]
    },
    lifestyle: {
        themes: [
            'di ruang tamu yang nyaman dan diterangi matahari di atas meja kopi',
            'di atas tempat tidur yang tertata rapi di kamar tidur apartemen modern',
            'di rak buku yang dikelilingi oleh buku dan tanaman',
            'di ruangan gaya Skandinavia yang elegan dan minimalis',
            'di atas meja kayu pedesaan di dapur rumah pertanian',
            'dalam penataan kantor rumah yang apik',
        ],
        angles: [
            'bidikan lebar yang menunjukkan produk dalam konteks ruangan', 'bidikan setinggi mata seolah-olah Anda menggunakannya', 'bidikan close-up bergaya di permukaan bertekstur (misalnya, karpet, selimut)', 'bidikan gaya hidup dengan seseorang yang berinteraksi dengan produk (latar belakang buram)', 'bidikan dari ambang pintu melihat ke dalam ruangan', 'bidikan sudut tinggi melihat ke bawah pada adegan yang ditata',
        ]
    }
};

type AffiliateProState = 'idle' | 'image-uploaded' | 'generating' | 'results-shown';
type AffiliateProMode = 'ProductStyle' | 'LookBook' | 'MixStyle';
type LookbookScene = 'studio' | 'street' | 'office' | 'home' | 'party' | 'catwalk';
type ProductCategory = 'skincare' | 'food' | 'gadget' | 'fashion' | 'lifestyle';
type ImageResult = {
    prompt: string;
    status: 'pending' | 'done' | 'error' | 'video-generating' | 'video-done' | 'video-error';
    imageUrl: string | null;
    videoUrl?: string | null;
    errorMessage?: string;
    videoStatusText?: string;
};

export const CreativeStudio = {
    // DOM Elements
    cardContainer: document.querySelector('#affiliate-pro-card .card-container') as HTMLDivElement,
    subtitleEl: document.querySelector('#affiliate-subtitle') as HTMLParagraphElement,
    idleState: document.querySelector('#affiliate-idle-state') as HTMLDivElement,
    uploadedState: document.querySelector('#affiliate-uploaded-state') as HTMLDivElement,
    resultsState: document.querySelector('#affiliate-results-state') as HTMLDivElement,
    fileInput: document.querySelector('#affiliate-file-input') as HTMLInputElement,
    previewImage: document.querySelector('#affiliate-preview-image') as HTMLImageElement,
    customPromptInput: document.querySelector('#affiliate-custom-prompt-input') as HTMLTextAreaElement,
    generateButton: document.querySelector('#affiliate-generate-button') as HTMLButtonElement,
    changePhotoButton: document.querySelector('#affiliate-change-photo-button') as HTMLButtonElement,
    resultsGrid: document.querySelector('#affiliate-results-grid') as HTMLDivElement,
    albumActions: document.querySelector('#affiliate-album-actions') as HTMLDivElement,
    regenerateAllButton: document.querySelector('#affiliate-regenerate-all-button') as HTMLButtonElement,
    startOverButton: document.querySelector('#affiliate-start-over-button') as HTMLButtonElement,
    statusEl: document.querySelector('#affiliate-status') as HTMLParagraphElement,
    progressWrapper: document.querySelector('#affiliate-progress-wrapper') as HTMLDivElement,
    progressBar: document.querySelector('#affiliate-progress-bar') as HTMLDivElement,
    modeButtons: document.querySelectorAll('#affiliate-mode-productstyle, #affiliate-mode-lookbook, #affiliate-mode-mixstyle'),
    
    // LookBook V2 Elements
    lookbookSettings: document.querySelector('#affiliate-lookbook-settings') as HTMLDivElement,
    modelImageInput: document.querySelector('#affiliate-model-image-input') as HTMLInputElement,
    modelPreviewImage: document.querySelector('#affiliate-model-preview-image') as HTMLImageElement,
    diversityPackGroup: document.querySelector('#affiliate-diversity-pack-group') as HTMLDivElement,
    diversityPackToggle: document.querySelector('#affiliate-diversity-pack-toggle') as HTMLInputElement,
    consistencyToggle: document.querySelector('#affiliate-consistency-toggle') as HTMLInputElement,
    sceneSelectorGroup: document.querySelector('#affiliate-scene-selector-group') as HTMLDivElement,
    poseControlGroup: document.querySelector('#affiliate-pose-control-group') as HTMLDivElement,
    
    // Category Elements
    categorySettings: document.querySelector('#affiliate-category-settings') as HTMLDivElement,
    categoryButtons: document.querySelectorAll('#affiliate-category-settings .toggle-button'),
    fashionInfoMessage: document.querySelector('#affiliate-fashion-info') as HTMLDivElement,

    // MixStyle Elements
    mixstyleSettings: document.querySelector('#affiliate-mixstyle-settings') as HTMLDivElement,
    mixstyleAspectRatioGroup: document.querySelector('#affiliate-mixstyle-aspect-ratio-group') as HTMLDivElement,

    // State
    state: 'idle' as AffiliateProState,
    mode: 'ProductStyle' as AffiliateProMode,
    lookbookScene: 'studio' as LookbookScene,
    selectedPoses: new Set<string>(['neutral', 'walk', 'lean', 'sit', 'closeup', 'spin']),
    isDiversityPackActive: false,
    isConsistentSet: true,
    productCategory: 'skincare' as ProductCategory,
    sourceImage: null as string | null, // Base64 string
    modelImage: null as { file: File, dataUrl: string, base64: string } | null,
    sourceImageAspectRatio: null as string | null,
    mixstyleAspectRatio: '9:16',
    customPrompt: '',
    imageResults: [] as ImageResult[],
    
    // Dependencies
    getApiKey: (() => '') as () => string,
    showPreviewModal: ((urls: (string | null)[], startIndex?: number) => {}) as (urls: (string | null)[], startIndex?: number) => void,
    // IMPROVEMENT: Added a function for user notifications to avoid using alert()
    showNotification: ((message: string, type: 'info' | 'error') => {}) as (message: string, type: 'info' | 'error') => void,

    init(dependencies: { 
        getApiKey: () => string; 
        showPreviewModal: (urls: (string | null)[], startIndex?: number) => void; 
        showNotification: (message: string, type: 'info' | 'error') => void;
    }) {
        this.getApiKey = dependencies.getApiKey;
        this.showPreviewModal = dependencies.showPreviewModal;
        this.showNotification = dependencies.showNotification; // IMPROVEMENT
        
        // Listeners
        this.fileInput.addEventListener('change', (e) => this.handleUpload(e));
        this.customPromptInput.addEventListener('input', () => {
            this.customPrompt = this.customPromptInput.value.trim();
        });
        setupDragAndDrop(document.querySelector('.affiliate-uploader[for="affiliate-file-input"]'), this.fileInput);
        this.changePhotoButton.addEventListener('click', () => this.fileInput.click());
        this.generateButton.addEventListener('click', () => this.runGeneration());
        this.resultsGrid.addEventListener('click', (e) => this.handleGridClick(e));
        this.regenerateAllButton.addEventListener('click', () => this.runGeneration());
        this.startOverButton.addEventListener('click', () => this.handleStartOver());
        
        // Mode switcher
        this.modeButtons.forEach(button => {
            button.addEventListener('click', () => {
                this.modeButtons.forEach(btn => btn.classList.remove('active'));
                button.classList.add('active');
                const buttonId = button.id;
                if (buttonId.includes('lookbook')) this.mode = 'LookBook';
                else if (buttonId.includes('mixstyle')) this.mode = 'MixStyle';
                else this.mode = 'ProductStyle';
                
                this.render();
                this.updateGenerateButton();
            });
        });

        // LookBook V2 Listeners
        setupDragAndDrop(this.modelImageInput.closest('.file-drop-zone'), this.modelImageInput);
        this.modelImageInput.addEventListener('change', this.handleModelImageUpload.bind(this));
        this.diversityPackToggle.addEventListener('change', () => {
            this.isDiversityPackActive = this.diversityPackToggle.checked;
        });
        this.consistencyToggle.addEventListener('change', () => {
            this.isConsistentSet = this.consistencyToggle.checked;
        });
        this.sceneSelectorGroup.addEventListener('click', this.handleSceneSelection.bind(this));
        this.poseControlGroup.addEventListener('click', this.handlePoseSelection.bind(this));


        // Category switcher
        this.categoryButtons.forEach(button => {
            button.addEventListener('click', () => {
                this.categoryButtons.forEach(btn => btn.classList.remove('active'));
                button.classList.add('active');
                this.productCategory = (button as HTMLElement).dataset.category as ProductCategory;
                this.render();
                this.updateGenerateButton();
            });
        });

        this.render();
        this.updateGenerateButton();
    },

    render() {
        // State-based visibility
        this.idleState.style.display = this.state === 'idle' ? 'block' : 'none';
        this.uploadedState.style.display = this.state === 'image-uploaded' ? 'block' : 'none';
        this.resultsState.style.display = (this.state === 'generating' || this.state === 'results-shown') ? 'block' : 'none';
        this.albumActions.style.display = this.state === 'results-shown' ? 'flex' : 'none';
        
        // Mode-specific UI updates
        if (this.cardContainer) {
            const isLookBook = this.mode === 'LookBook';
            const isMixStyle = this.mode === 'MixStyle';
            this.lookbookSettings.style.display = (isLookBook && this.state === 'image-uploaded') ? 'block' : 'none';
            this.categorySettings.style.display = (this.mode === 'ProductStyle' && this.state === 'image-uploaded') ? 'block' : 'none';
            this.mixstyleSettings.style.display = (isMixStyle && this.state === 'image-uploaded') ? 'block' : 'none';

            switch (this.mode) {
                case 'ProductStyle':
                    this.subtitleEl.textContent = 'Buat foto produk profesional dengan berbagai latar belakang.';
                    this.fashionInfoMessage.style.display = (this.state === 'image-uploaded' && this.productCategory === 'fashion') ? 'block' : 'none';
                    this.resultsGrid.style.setProperty('--product-shot-aspect-ratio', '9 / 16');
                    break;
                case 'LookBook':
                    this.subtitleEl.textContent = 'Hasilkan serangkaian bidikan gaya fesyen dari gambar Anda.';
                    this.fashionInfoMessage.style.display = 'none';
                    this.resultsGrid.style.setProperty('--product-shot-aspect-ratio', '9 / 16');
                    // Disable diversity pack if a custom model is uploaded
                    this.diversityPackToggle.disabled = !!this.modelImage;
                    this.diversityPackGroup.style.opacity = this.modelImage ? '0.5' : '1';
                    break;
                case 'MixStyle':
                    this.subtitleEl.textContent = 'Hasilkan foto gaya hidup & interaksi langsung untuk produk Anda.';
                    this.fashionInfoMessage.style.display = 'none';
                    this.resultsGrid.style.setProperty('--product-shot-aspect-ratio', '9 / 16');
                    break;
            }
        }
        
        this.progressWrapper.style.display = this.state === 'generating' ? 'block' : 'none';

        if (this.state === 'image-uploaded' && this.sourceImage) {
            this.previewImage.src = `data:image/png;base64,${this.sourceImage}`;
        }

        if (this.state === 'generating' || this.state === 'results-shown') {
            this.resultsGrid.className = 'affiliate-results-grid';
            if (this.mode === 'LookBook') this.resultsGrid.classList.add('lookbook-mode');
            else if (this.mode === 'MixStyle') this.resultsGrid.classList.add('mixstyle-mode');

            this.resultsGrid.innerHTML = ''; // Clear previous results
            this.imageResults.forEach((result, index) => {
                const wrapper = document.createElement('div');
                wrapper.className = 'affiliate-result-wrapper';
                wrapper.id = `affiliate-result-wrapper-${index}`;

                const item = document.createElement('div');
                item.className = 'affiliate-result-item';

                const previewSVG = `<svg xmlns="http://www.w3.org/2000/svg" height="20px" viewBox="0 0 24 24" width="20px" fill="currentColor"><path d="M0 0h24v24H0V0z" fill="none"/><path d="M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5C21.27 7.61 17 4.5 12 4.5zm0 10c-2.48 0-4.5-2.02-4.5-4.5S9.52 5.5 12 5.5s4.5 2.02 4.5 4.5-2.02 4.5-4.5 4.5zm0-7C10.62 7.5 9.5 8.62 9.5 10s1.12 2.5 2.5 2.5 2.5-1.12 2.5-2.5S13.38 7.5 12 7.5z"/></svg>`;
                const downloadSVG = `<svg xmlns="http://www.w3.org/2000/svg" height="20px" viewBox="0 0 24 24" width="20px" fill="currentColor"><path d="M0 0h24v24H0V0z" fill="none"/><path d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z"/></svg>`;
                const regenerateSVG = `<svg xmlns="http://www.w3.org/2000/svg" height="20px" viewBox="0 0 24 24" width="20px" fill="currentColor"><path d="M0 0h24v24H0V0z" fill="none"/><path d="M12.5 8c-2.65 0-5.05.99-6.9 2.6L2 7v9h9l-3.62-3.62c1.39-1.16 3.16-1.88 5.12-1.88 3.54 0 6.55 2.31 7.6 5.5l2.37-.78C21.08 11.03 17.15 8 12.5 8z"/></svg>`;

                let itemContentHTML = '';

                if (result.status === 'pending') {
                    item.classList.add('affiliate-result-item-text-state');
                    itemContentHTML = `<div class="loading-clock"></div><span class="pending-status-text">Menunggu...</span>`;
                } else if (result.status === 'error') {
                    item.classList.add('affiliate-result-item-text-state');
                    itemContentHTML = `<span>Error</span><p class="affiliate-item-subtitle pending-status-text">${result.errorMessage || 'Gagal'}</p>`;
                } else if (result.status === 'video-done' && result.videoUrl) {
                    itemContentHTML = `<video src="${result.videoUrl}" autoplay loop muted controls></video>
                        <div class="affiliate-result-item-overlay">
                            <button class="icon-button affiliate-preview-single" aria-label="Pratinjau video">${previewSVG}</button>
                            <button class="icon-button affiliate-download-single" aria-label="Unduh video">${downloadSVG}</button>
                        </div>`;
                } else if (result.imageUrl) {
                    itemContentHTML = `<img src="${result.imageUrl}" alt="Generated image for ${result.prompt}">
                        <div class="affiliate-result-item-overlay">
                            <button class="icon-button affiliate-preview-single" aria-label="Pratinjau gambar">${previewSVG}</button>
                            <button class="icon-button affiliate-download-single" aria-label="Unduh gambar">${downloadSVG}</button>
                            <button class="icon-button affiliate-regenerate-single" aria-label="Buat ulang gambar">${regenerateSVG}</button>
                        </div>`;
                    if (result.status === 'video-generating') {
                        itemContentHTML += `<div class="video-generation-status">${result.videoStatusText || 'Membuat video...'}</div>`;
                    }
                    if (result.status === 'video-error') {
                        itemContentHTML += `<div class="video-generation-status" style="background-color: #dc3545; color: white;">Video Gagal. Klik di bawah untuk mencoba lagi.</div>`;
                    }
                }
                item.innerHTML = itemContentHTML;
                wrapper.appendChild(item);

                if (this.mode === 'LookBook' && (result.status === 'done' || result.status === 'video-error')) {
                    const videoSVG = `<svg xmlns="http://www.w3.org/2000/svg" height="20px" viewBox="0 0 24 24" width="20px" fill="currentColor"><path d="M0 0h24v24H0V0z" fill="none"/><path d="M17 10.5V7c0-.55-.45-1-1-1H4c-.55 0-1 .45-1 1v10c0 .55.45 1 1 1h12c.55 0 1-.45 1-1v-3.5l4 4v-11l-4 4z"/></svg>`;
                    const actionsContainer = document.createElement('div');
                    actionsContainer.className = 'lookbook-video-actions';
                    const button = document.createElement('button');
                    button.className = 'affiliate-create-video-single';
                    button.dataset.index = index.toString();
                    button.innerHTML = `${videoSVG} <span>Buat Video</span>`;
                    actionsContainer.appendChild(button);
                    wrapper.appendChild(actionsContainer);
                }
                this.resultsGrid.appendChild(wrapper);
            });
        }
        this.updateStatusText();
    },

    updateStatusText() {
        switch (this.state) {
            case 'idle': this.statusEl.innerText = 'Unggah gambar produk untuk memulai.'; break;
            case 'image-uploaded': this.statusEl.innerText = `Siap untuk membuat dengan mode ${this.mode}.`; break;
            case 'generating':
                const doneCount = this.imageResults.filter(r => r.status !== 'pending' && r.status !== 'video-generating').length;
                this.statusEl.innerText = `Membuat... (${doneCount}/${this.imageResults.length})`;
                break;
            case 'results-shown':
                const errorCount = this.imageResults.filter(r => r.status === 'error').length;
                const videoGeneratingCount = this.imageResults.filter(r => r.status === 'video-generating').length;
                if (videoGeneratingCount > 0) {
                    this.statusEl.innerText = `Membuat ${videoGeneratingCount} video...`;
                } else {
                    this.statusEl.innerText = `Pembuatan selesai. ${errorCount > 0 ? `${errorCount} gagal.` : ''}`;
                }
                break;
        }
    },

    async handleUpload(e: Event) {
        const file = (e.target as HTMLInputElement).files?.[0];
        if (!file) return;
        try {
            const dataUrl = await blobToDataUrl(file);
            this.sourceImage = dataUrl.split(',')[1];
            
            const img = new Image();
            // FIX: The onload handler MUST be set BEFORE setting the src.
            // Otherwise, the image might load from cache before the handler is attached,
            // and the onload event will never fire.
            img.onload = () => {
                if (img.naturalWidth > 0 && img.naturalHeight > 0) {
                    this.sourceImageAspectRatio = `${img.naturalWidth} / ${img.naturalHeight}`;
                }
                // Now that we have all image info, update the state and render
                this.state = 'image-uploaded';
                this.updateGenerateButton();
                this.render();
            };
            img.onerror = () => {
                console.error('Error loading image for aspect ratio calculation.');
                // Even if it fails, proceed without the aspect ratio
                this.state = 'image-uploaded';
                this.updateGenerateButton();
                this.render();
            };
            img.src = dataUrl;
        } catch (error) {
            console.error('Error processing product shot image:', error);
            this.statusEl.innerText = 'Error processing image file.';
        }
    },
    
    async handleModelImageUpload(e: Event) {
        const file = (e.target as HTMLInputElement).files?.[0];
        if (file) {
            const dataUrl = await blobToDataUrl(file);
            this.modelImage = {
                file,
                dataUrl,
                base64: dataUrl.split(',')[1]
            };
            this.modelPreviewImage.src = dataUrl;
            this.modelPreviewImage.classList.remove('image-preview-hidden');
        } else {
            this.modelImage = null;
            this.modelPreviewImage.src = '#';
            this.modelPreviewImage.classList.add('image-preview-hidden');
        }
        this.render(); // Re-render to disable diversity pack
    },
    
    handleSceneSelection(e: MouseEvent) {
        const target = e.target as HTMLElement;
        const button = target.closest('.toggle-button');
        if (button) {
            this.sceneSelectorGroup.querySelectorAll('.toggle-button').forEach(btn => btn.classList.remove('active'));
            button.classList.add('active');
            this.lookbookScene = (button as HTMLElement).dataset.scene as LookbookScene;
        }
    },

    handlePoseSelection(e: MouseEvent) {
        const target = e.target as HTMLElement;
        const button = target.closest('.toggle-button');
        if (button) {
            const pose = (button as HTMLElement).dataset.pose as string;
            if (this.selectedPoses.has(pose)) {
                this.selectedPoses.delete(pose);
                button.classList.remove('active');
            } else {
                this.selectedPoses.add(pose);
                button.classList.add('active');
            }
        }
        // IMPROVEMENT: Update button state immediately after pose selection
        this.updateGenerateButton();
    },

    buildLookBookPrompt(poseKey: string, sessionID: string | null = null): string {
        let prompt = "Hasilkan foto fesyen profesional seluruh tubuh. Gambar akhir harus ultra-realistis, berkualitas 4K, dan dalam rasio aspek vertikal 9:16.";

        // Model specification
        if (this.modelImage) {
            prompt += " Model dalam foto HARUS orang dari gambar referensi yang diberikan (gambar kedua). Pertahankan fitur wajah, rambut, dan tipe tubuh mereka yang persis. Kenakan model spesifik ini dengan pakaian dari gambar produk (gambar pertama).";
        } else if (this.isDiversityPackActive) {
            prompt += " Model harus unik dan berbeda dari gambar lain dalam set ini, menampilkan keragaman dalam etnis, jenis kelamin, dan tipe tubuh. Penampilan produk harus tetap identik.";
        } else {
            prompt += " Model harus seorang model fesyen profesional yang cocok untuk produk tersebut.";
        }

        // Pose and Scene specification
        const posePrompt = LOOKBOOK_POSE_PROMPTS[poseKey] || '';
        const scenePrompt = LOOKBOOK_SCENE_PROMPTS[this.lookbookScene] || '';
        prompt += ` Pose model harus: ${posePrompt}.`;
        prompt += ` Pengaturannya adalah: ${scenePrompt}.`;

        // Add user's custom prompt at the end for refinement
        if (this.customPrompt) {
            prompt += ` ${this.customPrompt}`;
        }
        
        if (this.isConsistentSet && sessionID) {
            prompt += ` CRITICAL CONSISTENCY INSTRUCTIONS (Session ID: ${sessionID}): This is part of a consistent photo set.
            1.  **Identity Preservation**: If there is a person in the original image or model reference, you MUST maintain their exact identity, including face, hair, and body features. It is extremely important to preserve their precise likeness without any changes. Do not generate a different person.
            2.  **No Alterations**: Pertahankan kemiripan dan identitas persis dari orang di gambar asli tanpa perubahan apa pun.
            3.  **Core Elements**: The lighting, color grading, and overall mood must be identical across all images in this session. Do not vary these core elements.
            The most important rule is to maintain the exact identity and appearance of any person in the original photo.`;
        }

        return prompt.trim().replace(/\s+/g, ' ');
    },

    async runGeneration(indexToRegen?: number) {
        if (typeof indexToRegen === 'number') {
            await this.regenerateSingle(indexToRegen);
            return;
        }
        switch (this.mode) {
            case 'ProductStyle':
                this.runProductStyleGeneration();
                break;
            case 'LookBook':
                this.runLookBookGeneration();
                break;
            case 'MixStyle':
                this.runMixStyleGeneration();
                break;
        }
    },

    async runLookBookGeneration() {
        if (!this.sourceImage) return;
        if (this.selectedPoses.size === 0) {
            // IMPROVEMENT: Use the injected notification system instead of a blocking alert.
            this.showNotification("Silakan pilih setidaknya satu pose untuk dibuat.", 'info');
            return;
        }

        const sessionID = this.isConsistentSet ? `SESSION-${Math.random().toString(36).substring(2, 10)}` : null;
        const prompts = Array.from(this.selectedPoses).map(poseKey => this.buildLookBookPrompt(poseKey, sessionID));
        this.state = 'generating';
        this.imageResults = prompts.map(prompt => ({ prompt, status: 'pending', imageUrl: null }));
        this.progressBar.style.width = '0%';
        this.render();

        let completedJobs = 0;
        const totalJobs = this.imageResults.length;
        const updateProgress = () => {
            completedJobs++;
            const progress = (completedJobs / totalJobs) * 100;
            this.progressBar.style.width = `${progress}%`;
            this.updateStatusText();
        };

        const generationPromises = this.imageResults.map(async (result, index) => {
            try {
                const response = await generateStyledImage(this.sourceImage!, this.modelImage?.base64 || null, result.prompt, this.getApiKey);
                const imagePart = response.candidates?.[0]?.content?.parts.find(p => p.inlineData);

                if (imagePart?.inlineData) {
                    const imageUrl = `data:${imagePart.inlineData.mimeType};base64,${imagePart.inlineData.data}`;
                    this.imageResults[index] = { ...result, status: 'done', imageUrl };
                } else {
                    const textPart = response.candidates?.[0]?.content?.parts.find(p => p.text);
                    throw new Error(textPart?.text || "Tidak ada data gambar dalam respons.");
                }
            } catch (e: any) {
                console.error(`Error generating for prompt "${result.prompt}":`, e);
                this.imageResults[index] = { ...result, status: 'error', errorMessage: e.message };
            } finally {
                updateProgress();
                this.render();
            }
        });

        await Promise.all(generationPromises);
        this.state = 'results-shown';
        this.render();
    },

    async runMixStyleGeneration() {
        if (!this.sourceImage) return;

        this.state = 'generating';
        this.imageResults = Array(6).fill(null).map(() => ({ prompt: '', status: 'pending', imageUrl: null }));
        this.progressBar.style.width = '0%';
        this.render();
        this.statusEl.innerText = 'Menganalisis produk...';

        let productDescription = '';
        try {
            const analysisPrompt = `Analisis gambar dan berikan deskripsi singkat dan ringkas dari produk utama. Contoh: 'sebotol serum perawatan kulit berwarna putih', 'sepotong pizza pepperoni', 'ponsel pintar dengan casing biru'. Balas hanya dengan deskripsi produknya.`;
            productDescription = await generateTextFromImage(analysisPrompt, this.sourceImage, this.getApiKey);
        } catch (e: any) {
            console.error("Product analysis failed:", e);
            this.state = 'results-shown';
            this.imageResults = this.imageResults.map(r => ({ ...r, status: 'error', errorMessage: 'Analisis produk gagal.' }));
            this.render();
            return;
        }
        
        this.statusEl.innerText = 'Membuat prompt...';

        const lifestylePrompts = [
            `Gambar gaya hidup fotorealistik. Sebuah ${productDescription} ditempatkan secara alami di atas meja modern yang bersih yang relevan dengan produk. Latar belakang sedikit kabur (bokeh) untuk menjaga fokus pada produk. Pencahayaannya lembut dan alami. Gambar akhir harus memiliki rasio aspek 9:16. Tampilan, logo, dan warna produk harus sama persis dengan gambar referensi yang diberikan.`,
            `Bidikan gaya hidup editorial kelas atas. ${productDescription} adalah pusat perhatian dalam adegan bergaya yang membangkitkan perasaan mewah/nyaman/efisiensi (sesuai untuk produk). Gunakan alat peraga pelengkap tetapi jaga agar komposisinya minimalis. Gambar akhir harus memiliki rasio aspek 9:16. Produk harus cocok identik dengan gambar referensi.`,
            `Buat foto 'in-situ' yang realistis dari ${productDescription} dalam lingkungan penggunaan alaminya (misalnya, di meja rias untuk perawatan kulit, di meja dapur untuk makanan). Adegan harus terlihat otentik dan tidak berpose. Gambar akhir harus memiliki rasio aspek 9:16. Pastikan produk adalah replika sempurna dari yang ada di gambar referensi.`
        ];

        const handsOnPrompts = [
            `Gambar langsung fotorealistik. Sepasang tangan yang terawat baik berinteraksi dengan ${productDescription} (misalnya, membuka, menggunakan, memegangnya). Tangan harus dalam pose alami dan memiliki proporsi yang realistis. Produk adalah fokus yang jelas. Gambar akhir harus memiliki rasio aspek 9:16. Produk yang ditampilkan harus merupakan salinan persis dari gambar referensi.`,
            `Bidikan close-up dan dinamis dari tangan yang menggunakan ${productDescription}. Aksi harus dibekukan dalam waktu (misalnya, setetes jatuh dari pipet, tombol ditekan). Pencahayaan harus dramatis, menyoroti interaksi. Gambar akhir harus memiliki rasio aspek 9:16. Produk harus identik dengan gambar referensi yang diberikan.`,
            `Buat gambar Point-of-View (POV) yang realistis di mana pemirsa memegang atau menggunakan ${productDescription}. Produk harus tajam dan detail di latar depan. Gambar akhir harus memiliki rasio aspek 9:16. Tiru produk dari gambar referensi dengan sempurna.`
        ];

        const allPrompts = [...lifestylePrompts, ...handsOnPrompts];
        
        await this.runPromptBasedGeneration(allPrompts);
    },

    async runProductStyleGeneration() {
        if (!this.sourceImage || this.productCategory === 'fashion') return;

        if (this.customPrompt) {
            const prompts = Array(6).fill(this.customPrompt);
            await this.runPromptBasedGeneration(prompts);
            return;
        }
        
        const categoryData = CATEGORY_PROMPTS[this.productCategory as keyof typeof CATEGORY_PROMPTS];
        if (!categoryData) {
            console.error(`No prompts defined for category: ${this.productCategory}`);
            return;
        }

        // Create 6 unique prompts by combining themes and angles
        const prompts = Array(6).fill('').map((_, i) => {
            const theme = categoryData.themes[i % categoryData.themes.length];
            const angle = categoryData.angles[i % categoryData.angles.length];
            return `Bayangkan kembali foto produk ini sebagai ${angle} dengan penempatan objek ${theme}, menciptakan iklan yang dinamis dan profesional. Gambar akhir harus dalam rasio aspek vertikal 9:16.`;
        });

        await this.runPromptBasedGeneration(prompts);
    },

    async runPromptBasedGeneration(prompts: string[]) {
        if (!this.sourceImage) return;

        const finalPrompts = this.customPrompt
            ? prompts.map(p => `${p}. ${this.customPrompt}`)
            : prompts;

        this.state = 'generating';
        this.imageResults = finalPrompts.map(prompt => ({ prompt, status: 'pending', imageUrl: null }));
        this.progressBar.style.width = '0%';
        this.render();
        
        let messageIndex = 0;
        const statusInterval = setInterval(() => {
            if (this.state !== 'generating') {
                clearInterval(statusInterval);
                return;
            }
            
            this.imageResults.forEach((result, index) => {
                if (result.status === 'pending') {
                    const wrapper = this.resultsGrid.children[index];
                    if (wrapper) {
                        const statusSpan = wrapper.querySelector('.pending-status-text');
                        if (statusSpan) {
                            statusSpan.textContent = productShotLoadingMessages[messageIndex % productShotLoadingMessages.length];
                        }
                    }
                }
            });
            messageIndex++;
        }, 1500);

        let completedJobs = 0;
        const totalJobs = this.imageResults.length;

        const updateProgress = () => {
            completedJobs++;
            const progress = (completedJobs / totalJobs) * 100;
            this.progressBar.style.width = `${progress}%`;
            this.updateStatusText();
        };

        const generationPromises = this.imageResults.map(async (result, index) => {
            try {
                const response = await generateStyledImage(this.sourceImage!, this.modelImage?.base64 || null, result.prompt, this.getApiKey);
                const imagePart = response.candidates?.[0]?.content?.parts.find(p => p.inlineData);

                if (imagePart?.inlineData) {
                    const imageUrl = `data:${imagePart.inlineData.mimeType};base64,${imagePart.inlineData.data}`;
                    this.imageResults[index] = { ...result, status: 'done', imageUrl };
                } else {
                    const textPart = response.candidates?.[0]?.content?.parts.find(p => p.text);
                    throw new Error(textPart?.text || "Tidak ada data gambar dalam respons.");
                }
            } catch (e: any) {
                console.error(`Error generating for prompt "${result.prompt}":`, e);
                this.imageResults[index] = { ...result, status: 'error', errorMessage: e.message };
            } finally {
                updateProgress();
                this.render();
            }
        });

        await Promise.all(generationPromises);
        clearInterval(statusInterval);
        this.state = 'results-shown';
        this.render();
    },

    handleGridClick(e: MouseEvent) {
        const target = e.target as HTMLElement;
        const wrapper = target.closest('.affiliate-result-wrapper');
        if (!wrapper) return;

        const index = parseInt(wrapper.id.replace('affiliate-result-wrapper-', ''), 10);
        if (isNaN(index)) return;

        const result = this.imageResults[index];
        if (!result) return;
        
        const isPreviewAction = target.closest('.affiliate-preview-single') || target.closest('.affiliate-result-item');
        const isDownloadAction = target.closest('.affiliate-download-single');
        const isRegenerateAction = target.closest('.affiliate-regenerate-single');
        const isCreateVideoAction = target.closest('.affiliate-create-video-single');

        if (isPreviewAction) {
            const clickedUrl = result.videoUrl || result.imageUrl;
            if (!clickedUrl) return;

            let urls: string[];
            // FIX: If the clicked item is now a video, show only that video.
            // Otherwise, create a gallery of *only* the images.
            if (result.videoUrl && clickedUrl === result.videoUrl) {
                urls = [result.videoUrl];
            } else {
                urls = this.imageResults
                    .map(r => r.imageUrl) // Only collect image URLs for the gallery
                    .filter((url): url is string => !!url);
            }
            
            const startIndex = urls.indexOf(clickedUrl);
            
            if (startIndex > -1) {
                this.showPreviewModal(urls, startIndex);
            }
        } else if (isDownloadAction) {
            if (result?.videoUrl) {
                downloadFile(result.videoUrl, `affiliate_video_${index + 1}.mp4`);
            } else if (result?.imageUrl) {
                downloadFile(result.imageUrl, `affiliate_image_${index + 1}.png`);
            }
        } else if (isRegenerateAction) {
            this.runGeneration(index);
        } else if (isCreateVideoAction) {
            this.generateSingleLookBookVideo(index);
        }
    },

    async regenerateSingle(index: number) {
        if (!this.sourceImage || index < 0 || index >= this.imageResults.length) return;
        
        const resultToRegen = this.imageResults[index];
        if (!resultToRegen) return;

        resultToRegen.status = 'pending';
        resultToRegen.imageUrl = null;
        this.render();

        const placeholder = this.resultsGrid.children[index];
        const statusSpan = placeholder?.querySelector('.pending-status-text');

        let messageIndex = 0;
        const statusInterval = setInterval(() => {
            if (resultToRegen.status !== 'pending' || !statusSpan) {
                clearInterval(statusInterval);
                return;
            }
            statusSpan.textContent = productShotLoadingMessages[messageIndex % productShotLoadingMessages.length];
            messageIndex++;
        }, 1500);

        try {
            const response = await generateStyledImage(this.sourceImage, this.modelImage?.base64 || null, resultToRegen.prompt, this.getApiKey);
            const imagePart = response.candidates?.[0]?.content?.parts.find(p => p.inlineData);

            if (imagePart?.inlineData) {
                const imageUrl = `data:${imagePart.inlineData.mimeType};base64,${imagePart.inlineData.data}`;
                this.imageResults[index] = { ...resultToRegen, status: 'done', imageUrl };
            } else {
                throw new Error("Tidak ada data gambar dalam respons.");
            }
        } catch (e: any) {
            console.error(`Error regenerating for prompt "${resultToRegen.prompt}":`, e);
            this.imageResults[index] = { ...resultToRegen, status: 'error', errorMessage: e.message };
        } finally {
            clearInterval(statusInterval);
            this.render();
        }
    },
    
    async generateSingleLookBookVideo(index: number) {
        const result = this.imageResults[index];
        if (!result || !result.imageUrl || (result.status !== 'done' && result.status !== 'video-error')) return;

        this.resultsGrid.querySelectorAll('video').forEach(videoEl => {
            if (!videoEl.paused) videoEl.pause();
        });

        result.status = 'video-generating';
        result.videoStatusText = 'Memulai...';
        this.render();

        const imageBytes = result.imageUrl.split(',')[1];
        const prompt = "Buat animasi pendek yang halus dari gambar ini. Model harus bergoyang lembut, rambut dan pakaian bergerak sedikit, dengan pergeseran kamera sinematik yang lembut.";

        try {
            const videoUrl = await generateVideoContent(
                prompt, imageBytes, 'veo-2.0-generate-001', this.getApiKey,
                (message: string, step?: number) => {
                    result.videoStatusText = message;
                    const wrapper = this.resultsGrid.querySelector(`#affiliate-result-wrapper-${index}`);
                    if (wrapper) {
                        const statusOverlay = wrapper.querySelector('.video-generation-status');
                        if (statusOverlay) statusOverlay.textContent = message;
                    }
                },
                '9:16'
            );
            result.status = 'video-done';
            result.videoUrl = videoUrl;
        } catch (e: any) {
            console.error('Error generating LookBook video:', e);
            result.status = 'video-error';
        } finally {
            this.render();
        }
    },

    handleStartOver() {
        // Reset general state
        this.state = 'idle';
        this.sourceImage = null;
        this.sourceImageAspectRatio = null;
        this.resultsGrid.style.removeProperty('--product-shot-aspect-ratio');
        this.imageResults = [];
        this.fileInput.value = '';
        this.customPromptInput.value = '';
        this.customPrompt = '';
        
        // Reset LookBook V2 state
        this.modelImage = null;
        this.modelImageInput.value = '';
        this.modelPreviewImage.src = '#';
        this.modelPreviewImage.classList.add('image-preview-hidden');
        this.isDiversityPackActive = false;
        this.diversityPackToggle.checked = false;
        this.isConsistentSet = true;
        this.consistencyToggle.checked = true;
        this.lookbookScene = 'studio';
        this.sceneSelectorGroup.querySelectorAll('.toggle-button').forEach(btn => btn.classList.toggle('active', (btn as HTMLElement).dataset.scene === 'studio'));
        this.selectedPoses = new Set<string>(['neutral', 'walk', 'lean', 'sit', 'closeup', 'spin']);
        this.poseControlGroup.querySelectorAll('.toggle-button').forEach(btn => btn.classList.add('active'));

        // Reset MixStyle state
        this.mixstyleAspectRatio = '9:16';
        this.mixstyleAspectRatioGroup.querySelectorAll('.toggle-button').forEach(btn => btn.classList.toggle('active', (btn as HTMLElement).dataset.ratio === '4:5'));

        // Reset ProductStyle state
        this.productCategory = 'skincare';
        this.categoryButtons.forEach(btn => {
            btn.classList.remove('active');
            if((btn as HTMLElement).dataset.category === 'skincare') {
                btn.classList.add('active');
            }
        });

        this.updateGenerateButton();
        this.render();
    },

    updateGenerateButton() {
        const hasImage = !!this.sourceImage;
        const isFashionModeConflict = this.mode === 'ProductStyle' && this.productCategory === 'fashion';
        const hasPoses = this.mode !== 'LookBook' || this.selectedPoses.size > 0;
        this.generateButton.disabled = !hasImage || isFashionModeConflict || !hasPoses;
    },
};