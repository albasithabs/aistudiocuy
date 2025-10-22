/* tslint:disable */
/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { blobToDataUrl, delay, downloadFile, parseAndFormatErrorMessage, setupDragAndDrop, withRetry } from "../utils/helpers.ts";
// --- FIX: Use a consistent API function and import withRetry ---
import { generateStructuredTextFromImage, generateStyledImage } from '../utils/gemini.ts'; // Assuming generateStyledImage can handle this task

const THEME_PACKS = {
    'social-reactions': {
        expressions: ["tertawa terbahak-bahak", "mengedipkan mata dengan genit", "menangis tersedu-sedu", "wajah berpikir dengan tangan di dagu", "mengacungkan jempol", "menggelengkan kepala tidak setuju", "merayakan dengan confetti", "wajah kaget dengan mata lebar", "menguap karena bosan", "mengirim ciuman"],
        captions: ["LOL", "WINK", "HUHU", "HMMM", "OK!", "NOPE", "YAY!", "OMG", "...", "MUAH"]
    },
    'daily-feelings': {
        expressions: ["wajah tersenyum bahagia", "wajah sedih dan murung", "wajah marah dengan uap keluar dari telinga", "wajah mengantuk dengan Zzz", "wajah jatuh cinta dengan mata hati", "wajah percaya diri dengan kacamata hitam", "wajah sakit dengan termometer", "wajah bingung dengan tanda tanya", "wajah puas minum kopi", "wajah lapar memikirkan makanan"],
        captions: ["Happy!", "Sad...", "Grrr!", "Sleepy", "In Love", "Cool", "Sick", "Huh?", "Coffee Time", "Hungry"]
    },
    'mocking': {
        expressions: ["menjulurkan lidah", "memutar mata", "wajah menyeringai licik", "berbisik di belakang tangan", "meniru seseorang dengan wajah konyol", "tertawa mengejek", "membuat wajah 'terserah'", "menunjuk dan tertawa", "wajah sombong", "wajah tidak terkesan"],
        captions: ["Bleh!", "Oh, Please.", "Hehe...", "Psst...", "Duh!", "Ha Ha!", "Whatever", "Look!", "I Know.", "Meh."]
    },
    'angry': {
        expressions: ["wajah merah karena marah", "berteriak dengan mulut terbuka lebar", "wajah cemberut dengan tangan disilangkan", "kepala berasap", "menatap tajam", "menggertakkan gigi", "menunjuk dengan marah", "menghentakkan kaki", "wajah frustrasi", "mengepalkan tangan"],
        captions: ["SO MAD!", "ARGH!", "HMPH!", "FUMING", "...", "GRR", "YOU!", "STOMP", "UGH!", "ENOUGH!"]
    },
    'work-vibes': {
        expressions: ["fokus mengetik di laptop", "minum banyak kopi", "stres dengan tumpukan kertas", "presentasi dengan percaya diri", "tertidur di meja", "mendapat ide cemerlang dengan bola lampu", "melihat jam menunggu pulang", "bekerja sama dengan tim", "merayakan deadline selesai", "pusing karena rapat"],
        captions: ["In The Zone", "More Coffee", "Overload", "Nailed It!", "Done.", "Eureka!", "5 PM?", "Teamwork!", "Finished!", "Meetings..."]
    },
    'celebration': {
        expressions: ["meledakkan popper confetti", "mengenakan topi pesta", "menari dengan gembira", "membuka hadiah dengan gembira", "bersulang dengan minuman", "memegang balon", "membuat permintaan di atas kue", "memberi selamat dengan tepuk tangan", "tersenyum lebar", "melompat kegirangan"],
        captions: ["Hooray!", "Party Time!", "Dance!", "A Gift!", "Cheers!", "Celebrate!", "Wish Big!", "Congrats!", "So Happy!", "Yippee!"]
    }
};


type StickerrrState = 'idle' | 'processing' | 'results';
type StickerResult = {
    prompt: string;
    status: 'pending' | 'done' | 'error';
    imageUrl: string | null;
    errorMessage?: string;
};

export const Stickerrr = {
    // DOM Elements - Initialized to null for safe checking
    view: null as HTMLDivElement | null,
    inputStateEl: null as HTMLDivElement | null,
    resultsStateEl: null as HTMLDivElement | null,
    statusContainerEl: null as HTMLDivElement | null,
    statusTextEl: null as HTMLParagraphElement | null,
    progressWrapper: null as HTMLDivElement | null,
    progressBar: null as HTMLDivElement | null,
    fileInput: null as HTMLInputElement | null,
    uploadLabel: null as HTMLSpanElement | null,
    previewImage: null as HTMLImageElement | null,
    optionsPanel: null as HTMLDivElement | null,
    styleSelect: null as HTMLSelectElement | null,
    themeSelect: null as HTMLSelectElement | null,
    imageCountSelect: null as HTMLSelectElement | null,
    autofillButton: null as HTMLButtonElement | null,
    accessoryInput: null as HTMLInputElement | null,
    instructionsInput: null as HTMLTextAreaElement | null,
    captionInput: null as HTMLTextAreaElement | null,
    containerSelect: null as HTMLSelectElement | null,
    generateButton: null as HTMLButtonElement | null,
    changePhotoButton: null as HTMLButtonElement | null,
    resultsGrid: null as HTMLDivElement | null,
    downloadAllButton: null as HTMLButtonElement | null,
    startOverButton: null as HTMLButtonElement | null,
    toastContainer: null as HTMLDivElement | null,

    // State, Dependencies...
    state: 'idle' as StickerrrState,
    sourceImage: null as { file: File, dataUrl: string, base64: string } | null,
    results: [] as StickerResult[],
    imageCount: 3,
    getApiKey: (() => '') as () => string,
    showPreviewModal: ((urls: (string | null)[], startIndex?: number) => {}) as (urls: (string | null)[], startIndex?: number) => void,

    init(dependencies: { getApiKey: () => string; showPreviewModal: (urls: (string | null)[], startIndex?: number) => void; }) {
        if (!document.querySelector('#stickerrr-view')) return;
        
        this.getApiKey = dependencies.getApiKey;
        this.showPreviewModal = dependencies.showPreviewModal;

        this.queryDOMElements();
        if (!this.validateDOMElements()) return;

        this.addEventListeners();
        this.render();
    },

    queryDOMElements() {
        this.view = document.querySelector('#stickerrr-view');
        if (!this.view) return;
        this.inputStateEl = this.view.querySelector('#stickerrr-input-state');
        this.resultsStateEl = this.view.querySelector('#stickerrr-results-state');
        this.statusContainerEl = this.view.querySelector('#stickerrr-status-container');
        this.statusTextEl = this.view.querySelector('#stickerrr-status');
        this.progressWrapper = this.view.querySelector('#stickerrr-progress-wrapper');
        this.progressBar = this.view.querySelector('#stickerrr-progress-bar');
        this.fileInput = this.view.querySelector('#stickerrr-file-input');
        this.uploadLabel = this.view.querySelector('#stickerrr-upload-label');
        this.previewImage = this.view.querySelector('#stickerrr-preview-image');
        this.optionsPanel = this.view.querySelector('#stickerrr-options-panel');
        this.styleSelect = this.view.querySelector('#stickerrr-style-select');
        this.themeSelect = this.view.querySelector('#stickerrr-theme-select');
        this.imageCountSelect = this.view.querySelector('#stickerrr-image-count-select');
        this.autofillButton = this.view.querySelector('#stickerrr-autofill-button');
        this.accessoryInput = this.view.querySelector('#stickerrr-accessory-input');
        this.instructionsInput = this.view.querySelector('#stickerrr-instructions-input');
        this.captionInput = this.view.querySelector('#stickerrr-caption-input');
        this.containerSelect = this.view.querySelector('#stickerrr-container-select');
        this.generateButton = this.view.querySelector('#stickerrr-generate-button');
        this.changePhotoButton = this.view.querySelector('#stickerrr-change-photo-button');
        this.resultsGrid = this.view.querySelector('#stickerrr-results-grid');
        this.downloadAllButton = this.view.querySelector('#stickerrr-download-all-button');
        this.startOverButton = this.view.querySelector('#stickerrr-start-over-button');
        this.toastContainer = document.querySelector('#toast-container');
    },

    validateDOMElements(): boolean {
        const requiredElements = [
            this.view, this.inputStateEl, this.resultsStateEl, this.statusContainerEl,
            this.statusTextEl, this.progressWrapper, this.progressBar, this.fileInput,
            this.uploadLabel, this.previewImage, this.optionsPanel, this.styleSelect,
            this.themeSelect, this.imageCountSelect, this.autofillButton, this.accessoryInput,
            this.instructionsInput, this.captionInput, this.containerSelect, this.generateButton,
            this.changePhotoButton, this.resultsGrid, this.downloadAllButton, this.startOverButton
        ];
        // Note: toastContainer is global, checked separately in showToast
        if (requiredElements.some(el => !el)) {
            console.error("Stickerrr initialization failed: One or more required elements are missing from the DOM.");
            return false;
        }
        return true;
    },

    addEventListeners() {
        // Now we can safely use ! because validation passed
        const dropZone = this.fileInput!.closest('.file-drop-zone') as HTMLElement;
        setupDragAndDrop(dropZone, this.fileInput!);
        this.fileInput!.addEventListener('change', this.handleUpload.bind(this));
        this.changePhotoButton!.addEventListener('click', () => this.fileInput!.click());
        this.autofillButton!.addEventListener('click', this.handleAutofill.bind(this));
        this.generateButton!.addEventListener('click', this.handleGenerate.bind(this));
        this.downloadAllButton!.addEventListener('click', this.handleDownloadAll.bind(this));
        this.startOverButton!.addEventListener('click', this.handleStartOver.bind(this));
        this.resultsGrid!.addEventListener('click', this.handleGridClick.bind(this));
        this.imageCountSelect!.addEventListener('change', () => {
            this.imageCount = parseInt(this.imageCountSelect!.value, 10);
            this.updateGenerateButtonText();
        });
    },

    async handleUpload(e: Event) {
        const file = (e.target as HTMLInputElement).files?.[0];
        if (!file) return;

        try {
            const dataUrl = await blobToDataUrl(file);
            this.sourceImage = {
                file, dataUrl,
                base64: dataUrl.substring(dataUrl.indexOf(',') + 1), // More robust parsing
            };
            this.render();
        } catch (error) {
            console.error('Error processing sticker image:', error);
            this.showToast('Gagal memproses gambar.', 'error');
        }
    },

    async handleAutofill() {
        if (!this.sourceImage) return;

        this.autofillButton!.disabled = true;
        const originalButtonHTML = this.autofillButton!.innerHTML;
        this.autofillButton!.innerHTML = `<div class="loading-clock" style="width:18px; height:18px; margin: 0 auto;"></div>`;

        try {
            const prompt = `Analisis gambar ini dan berikan deskripsi singkat untuk digunakan dalam stiker. Fokus pada:
- Aksesori utama yang dikenakan oleh subjek (jika ada).
- Instruksi singkat untuk meningkatkan gaya (seperti "tambahkan sedikit kilau").
- Hasilkan 10 caption satu kata atau frasa pendek yang cocok dengan subjek dan gaya.`;
            const autofillSchema = {
                type: 'OBJECT',
                properties: {
                    accessory: { type: 'STRING', description: "Aksesori utama yang terlihat, jika ada (misal: kacamata hitam, topi)." },
                    instructions: { type: 'STRING', description: "Saran singkat untuk peningkatan gaya (misal: tambahkan efek percikan api)." },
                    captions: { type: 'ARRAY', items: { type: 'STRING' }, description: "Daftar 10 caption singkat dan relevan." }
                }
            };
            
            const jsonResponse = await withRetry(() =>
                generateStructuredTextFromImage(prompt, this.sourceImage!.base64, this.getApiKey, autofillSchema as any),
                { retries: 2, delayMs: 1000, onRetry: (attempt, err) => console.warn(`Attempt ${attempt} failed for autofill. Retrying...`, err) }
            );
            const data = JSON.parse(jsonResponse);

            if (data.accessory) this.accessoryInput!.value = data.accessory;
            if (data.instructions) this.instructionsInput!.value = data.instructions;
            if (data.captions && Array.isArray(data.captions)) {
                this.captionInput!.value = data.captions.join('\n');
            }
        } catch (e) {
            console.error('Autofill failed:', e);
            this.showToast('Gagal mengisi otomatis. Silakan coba lagi.', 'error');
        } finally {
            this.autofillButton!.disabled = false;
            this.autofillButton!.innerHTML = originalButtonHTML;
        }
    },

    buildPrompt(expression: string, caption: string): string {
        const style = this.styleSelect?.value || "Gaya Stiker Kartun 3D";
        const accessory = this.accessoryInput?.value.trim();
        const instructions = this.instructionsInput?.value.trim();
        const container = this.containerSelect?.value.trim();

        let prompt = `Buat stiker dari subjek dalam gambar. Gaya stiker: ${style}. Ekspresi subjek: ${expression}.`;
        if (accessory) prompt += ` Subjek harus memakai ${accessory}.`;
        if (instructions) prompt += ` Instruksi tambahan: ${instructions}.`;
        
        prompt += ` Stiker harus memiliki garis tepi putih tebal dan sedikit bayangan jatuh untuk efek terkelupas. Latar belakang harus transparan.`;

        if (caption) {
            if (container && container !== 'None') {
                prompt += ` Sertakan teks "${caption}" di dalam ${container}.`;
            } else {
                prompt += ` Sertakan teks "${caption}" dalam font yang tebal dan menyenangkan di bawah stiker.`;
            }
        }
        
        return prompt;
    },

    async handleGenerate() {
        if (!this.sourceImage) return;

        this.state = 'processing';
        
        const themeKey = this.themeSelect!.value as keyof typeof THEME_PACKS;
        const selectedTheme = THEME_PACKS[themeKey];
        const customCaptions = this.captionInput!.value.split('\n').map(c => c.trim()).filter(Boolean);

        const prompts: string[] = [];
        for (let i = 0; i < this.imageCount; i++) {
            const expression = selectedTheme.expressions[i % selectedTheme.expressions.length];
            const caption = customCaptions[i] || selectedTheme.captions[i % selectedTheme.captions.length];
            prompts.push(this.buildPrompt(expression, caption));
        }

        this.results = prompts.map(prompt => ({ prompt, status: 'pending', imageUrl: null }));
        this.progressBar!.style.width = '0%';
        this.render();

        let completedJobs = 0;
        const totalJobs = this.results.length;
        const updateProgress = () => {
            completedJobs++;
            const progress = (completedJobs / totalJobs) * 100;
            if (this.progressBar) this.progressBar.style.width = `${progress}%`;
            this.updateStatusText();
        };

        const generationPromises = this.results.map(async (result, index) => {
            try {
                const response = await withRetry(() => 
                    generateStyledImage(this.sourceImage!.base64, null, result.prompt, this.getApiKey),
                    {
                        retries: 2,
                        delayMs: 1000,
                        onRetry: (attempt, error) => console.warn(`Stickerrr generation attempt ${attempt} failed. Retrying...`, error)
                    }
                );

                const imagePart = response.candidates?.[0]?.content?.parts.find(p => p.inlineData);
                if (imagePart?.inlineData) {
                    const imageUrl = `data:${imagePart.inlineData.mimeType};base64,${imagePart.inlineData.data}`;
                    this.results[index] = { ...result, status: 'done', imageUrl };
                } else {
                    const textPart = response.candidates?.[0]?.content?.parts.find(p => p.text);
                    throw new Error(textPart?.text || "No image data in response.");
                }

            } catch (e: any) {
                console.error(`Error generating sticker ${index}:`, e);
                this.results[index] = { ...result, status: 'error', errorMessage: parseAndFormatErrorMessage(e, 'Pembuatan stiker') };
            } finally {
                updateProgress();
                this.render();
            }
        });

        await Promise.allSettled(generationPromises);
        this.state = 'results';
        this.render();
    },

    handleGridClick(e: MouseEvent) {
        const item = (e.target as HTMLElement).closest('.image-result-item');
        if (!item) return;
        const index = parseInt((item as HTMLElement).dataset.index!, 10);
        const result = this.results[index];
        if (result?.imageUrl) {
            const urls = this.results.map(r => r.imageUrl).filter((url): url is string => !!url);
            const startIndex = urls.indexOf(result.imageUrl);
            if (startIndex > -1) this.showPreviewModal(urls, startIndex);
        }
    },

    async handleDownloadAll() {
        for (const [i, result] of this.results.entries()) {
            if (result.imageUrl) {
                downloadFile(result.imageUrl, `sticker_${i + 1}.png`);
                await delay(200);
            }
        }
    },

    handleStartOver() {
        this.state = 'idle';
        this.sourceImage = null;
        this.results = [];
        this.fileInput!.value = '';
        this.accessoryInput!.value = '';
        this.instructionsInput!.value = '';
        this.captionInput!.value = '';
        this.render();
    },

    updateStatusText() {
        if (!this.statusTextEl) return;
        if (this.state === 'processing') {
            const doneCount = this.results.filter(r => r.status !== 'pending').length;
            this.statusTextEl.textContent = `Membuat Stiker... (${doneCount}/${this.results.length})`;
        } else if (this.state === 'results') {
            this.statusTextEl.textContent = 'Paket stiker Anda sudah siap!';
        }
    },

    updateGenerateButtonText() {
        if (this.generateButton) {
            this.generateButton.textContent = `Buat ${this.imageCount} Stiker`;
        }
    },

    showToast(message: string, type: 'success' | 'error' = 'success') {
        if (!this.toastContainer) return;
        const toast = document.createElement('div');
        toast.className = `toast-notification ${type}`;
        toast.textContent = message;
        this.toastContainer.appendChild(toast);
        setTimeout(() => toast.remove(), 3000);
    },
    
    render() {
        const hasImage = !!this.sourceImage;
        this.inputStateEl!.style.display = ['idle', 'processing'].includes(this.state) ? 'block' : 'none';
        this.resultsStateEl!.style.display = this.state === 'results' ? 'block' : 'none';
        this.statusContainerEl!.style.display = this.state === 'processing' ? 'flex' : 'none';
        
        this.previewImage!.style.display = hasImage ? 'block' : 'none';
        this.uploadLabel!.style.display = hasImage ? 'none' : 'block';
        this.optionsPanel!.style.display = hasImage ? 'block' : 'none';
        this.generateButton!.disabled = !hasImage || this.state === 'processing';
        
        if (hasImage) {
            this.previewImage!.src = this.sourceImage!.dataUrl;
        }

        if (this.state === 'processing' || this.state === 'results') {
            this.resultsGrid!.innerHTML = '';
            this.results.forEach((result, index) => {
                const item = document.createElement('div');
                item.className = 'image-result-item';
                item.dataset.index = String(index);
                if (result.status === 'pending') {
                    item.innerHTML = '<div class="loading-clock"></div>';
                } else if (result.status === 'error') {
                    item.innerHTML = `<p class="pending-status-text" title="${result.errorMessage}">Gagal</p>`;
                } else if (result.imageUrl) {
                    item.innerHTML = `<img src="${result.imageUrl}" alt="Generated Sticker ${index + 1}">`;
                }
                this.resultsGrid!.appendChild(item);
            });
        }
        this.updateStatusText();
        this.updateGenerateButtonText();
    }
};