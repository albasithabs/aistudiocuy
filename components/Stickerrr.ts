/* tslint:disable */
/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { GoogleGenAI, Modality, Type } from '@google/genai';
// IMPROVEMENT: Imported withRetry and parseAndFormatErrorMessage
import { blobToDataUrl, delay, downloadFile, parseAndFormatErrorMessage, setupDragAndDrop, withRetry } from "../utils/helpers.ts";
import { generateStructuredTextFromImage } from '../utils/gemini.ts';

type StickerrrState = 'idle' | 'processing' | 'results';

type StickerResult = {
    prompt: string;
    status: 'pending' | 'done' | 'error';
    imageUrl: string | null;
    errorMessage?: string;
};

const THEME_PACKS: { [key: string]: { expression: string, caption: string }[] } = {
    'social-reactions': [
        { expression: 'laughing hysterically', caption: 'LOL' },
        { expression: 'shocked with wide eyes', caption: 'OMG' },
        { expression: 'giving a thumbs up', caption: 'Suka' },
        { expression: 'facepalming in frustration', caption: 'Facepalm' },
        { expression: 'winking and smiling slyly', caption: 'Hehe' },
        { expression: 'crying with tears of joy', caption: 'Terharu' },
        { expression: 'shrugging shoulders cluelessly', caption: 'Gak Tau' },
        { expression: 'thinking with a finger on chin', caption: 'Hmm...' },
        { expression: 'nodding in agreement enthusiastically', caption: 'Setuju!' },
        { expression: 'rolling eyes in annoyance', caption: 'Ya Ampun' }
    ],
    'daily-feelings': [
        { expression: 'smiling happily', caption: 'Senang' },
        { expression: 'crying sadly', caption: 'Sedih' },
        { expression: 'furious with steam coming out of ears', caption: 'Marah!' },
        { expression: 'looking sleepy and yawning', caption: 'Ngantuk' },
        { expression: 'excited with sparkling eyes', caption: 'Semangat!' },
        { expression: 'feeling sick with a thermometer in mouth', caption: 'Sakit' },
        { expression: 'blushing and feeling shy', caption: 'Malu' },
        { expression: 'feeling loved with hearts floating around', caption: 'Sayang' },
        { expression: 'confused with question marks', caption: 'Bingung' },
        { expression: 'bored and sighing', caption: 'Bosan' }
    ],
    'mocking': [
        { expression: 'sticking tongue out and making a funny face', caption: 'Wleee' },
        { expression: 'rolling on the floor laughing at someone', caption: 'Ngakak' },
        { expression: 'slow clapping sarcastically', caption: 'Hebat...' },
        { expression: 'looking smug with a smirk', caption: 'Tuh Kan' },
        { expression: 'pointing and laughing', caption: 'Hahaha!' },
        { expression: 'shaking head in disbelief', caption: 'Payah' },
        { expression: 'whistling innocently', caption: 'Gak Liat' },
        { expression: 'making a "loser" sign on forehead', caption: 'Dasar!' },
        { expression: 'peeking from a corner mischievously', caption: 'Cieee' },
        { expression: 'looking unimpressed', caption: 'B Aja' }
    ],
    'angry': [
        { expression: 'furious with red face and smoke from ears', caption: 'MARAH!' },
        { expression: 'gritting teeth and clenching fists', caption: 'Grrr' },
        { expression: 'shouting angrily with mouth wide open', caption: 'WOY!' },
        { expression: 'pouting and looking sulky', caption: 'Kesel' },
        { expression: 'giving a death glare, eyes narrowed', caption: 'Awas Ya' },
        { expression: 'crossing arms and looking annoyed', caption: 'Huh!' },
        { expression: 'flipping a table in anger', caption: 'CUKUP!' },
        { expression: 'with a dark, stormy cloud overhead', caption: 'Bad Mood' },
        { expression: 'about to explode like a bomb', caption: 'Sabar...' },
        { expression: 'writing in a burn book furiously', caption: 'Catet!' }
    ],
    'work-vibes': [
        { expression: 'focused and typing on a keyboard', caption: 'Fokus' },
        { expression: 'celebrating a success with confetti', caption: 'Berhasil!' },
        { expression: 'drinking coffee with a tired smile', caption: 'Butuh Kopi' },
        { expression: 'overwhelmed with a pile of papers', caption: 'Deadline' },
        { expression: 'giving a presentation confidently', caption: 'Presentasi' },
        { expression: 'collaborating with a friendly look', caption: 'Kerja Tim' },
        { expression: 'on the way, looking determined', caption: 'OTW' },
        { expression: 'relaxing after work', caption: 'Pulang' },
        { expression: 'having a brilliant idea with a lightbulb', caption: 'Ide!' },
        { expression: 'saying "OK" with a professional nod', caption: 'Siap!' }
    ],
    'celebration': [
        { expression: 'blowing a party horn with confetti', caption: 'Hore!' },
        { expression: 'holding a birthday cake with candles', caption: 'HBD!' },
        { expression: 'cheering with a trophy', caption: 'Selamat!' },
        { expression: 'dancing joyfully', caption: 'Pesta!' },
        { expression: 'giving a gift with a happy smile', caption: 'Untukmu' },
        { expression: 'making a toast with a glass', caption: 'Cheers!' },
        { expression: 'surprised by a gift', caption: 'Kejutan!' },
        { expression: 'feeling festive with a party hat', caption: 'Rayakan' },
        { expression: 'sending a flying kiss', caption: 'Terima Kasih' },
        { expression: 'applauding enthusiastically', caption: 'Hebat!' }
    ]
};


export const Stickerrr = {
    // DOM Elements
    view: document.querySelector('#stickerrr-view') as HTMLDivElement,
    inputStateEl: document.querySelector('#stickerrr-input-state') as HTMLDivElement,
    resultsStateEl: document.querySelector('#stickerrr-results-state') as HTMLDivElement,
    statusContainerEl: document.querySelector('#stickerrr-status-container') as HTMLDivElement,
    statusTextEl: document.querySelector('#stickerrr-status') as HTMLParagraphElement,
    progressWrapper: document.querySelector('#stickerrr-progress-wrapper') as HTMLDivElement,
    progressBar: document.querySelector('#stickerrr-progress-bar') as HTMLDivElement,
    toastContainer: document.querySelector('#toast-container') as HTMLDivElement, // IMPROVEMENT: Added for notifications

    // Inputs
    fileInput: document.querySelector('#stickerrr-file-input') as HTMLInputElement,
    uploadLabel: document.querySelector('#stickerrr-upload-label') as HTMLSpanElement,
    previewImage: document.querySelector('#stickerrr-preview-image') as HTMLImageElement,
    optionsPanel: document.querySelector('#stickerrr-options-panel') as HTMLDivElement,
    
    styleSelect: document.querySelector('#stickerrr-style-select') as HTMLSelectElement,
    themeSelect: document.querySelector('#stickerrr-theme-select') as HTMLSelectElement,
    autofillButton: document.querySelector('#stickerrr-autofill-button') as HTMLButtonElement,
    accessoryInput: document.querySelector('#stickerrr-accessory-input') as HTMLInputElement,
    instructionsInput: document.querySelector('#stickerrr-instructions-input') as HTMLTextAreaElement,
    captionInput: document.querySelector('#stickerrr-caption-input') as HTMLTextAreaElement,
    containerSelect: document.querySelector('#stickerrr-container-select') as HTMLSelectElement,

    // Actions & Results
    generateButton: document.querySelector('#stickerrr-generate-button') as HTMLButtonElement,
    changePhotoButton: document.querySelector('#stickerrr-change-photo-button') as HTMLButtonElement,
    resultsGrid: document.querySelector('#stickerrr-results-grid') as HTMLDivElement,
    downloadAllButton: document.querySelector('#stickerrr-download-all-button') as HTMLButtonElement,
    startOverButton: document.querySelector('#stickerrr-start-over-button') as HTMLButtonElement,

    // State
    state: 'idle' as StickerrrState,
    sourceImage: null as { file: File, dataUrl: string, base64: string } | null,
    results: [] as StickerResult[],

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
        const dropZone = this.fileInput.closest('.file-drop-zone') as HTMLElement;
        setupDragAndDrop(dropZone, this.fileInput);
        this.fileInput.addEventListener('change', this.handleUpload.bind(this));
        this.changePhotoButton.addEventListener('click', () => this.fileInput.click());
        this.autofillButton.addEventListener('click', this.handleAutofill.bind(this));
        this.generateButton.addEventListener('click', this.handleGenerate.bind(this));
        this.downloadAllButton.addEventListener('click', this.handleDownloadAll.bind(this));
        this.startOverButton.addEventListener('click', this.handleStartOver.bind(this));
        this.resultsGrid.addEventListener('click', this.handleGridClick.bind(this));
    },

    async handleUpload(e: Event) {
        const file = (e.target as HTMLInputElement).files?.[0];
        if (!file) return;

        try {
            const dataUrl = await blobToDataUrl(file);
            this.sourceImage = {
                file,
                dataUrl,
                base64: dataUrl.split(',')[1],
            };
            this.render();
        } catch (error) {
            console.error('Error processing sticker image:', error);
            // IMPROVEMENT: Use non-blocking toast notification instead of alert.
            this.showToast('Gagal memproses gambar.', 'error');
        }
    },

    async handleAutofill() {
        if (!this.sourceImage) return;

        this.autofillButton.disabled = true;
        const originalButtonHTML = this.autofillButton.innerHTML;
        this.autofillButton.innerHTML = `<div class="loading-clock" style="width:18px; height:18px; margin: 0 auto;"></div>`;

        try {
            const prompt = `Analisis gambar ini. Berdasarkan orang, ekspresi, dan lingkungan di dalamnya, buat saran untuk stiker. Buat satu saran aksesori, satu instruksi kustom, dan daftar tepat 10 caption stiker yang singkat, jenaka, dan relevan dalam Bahasa Indonesia.`;
            
            const autofillSchema = {
                type: Type.OBJECT,
                properties: {
                    accessory: { 
                        type: Type.STRING,
                        description: 'Satu saran aksesori yang kreatif dan lucu berdasarkan konten gambar. Contoh: "memakai topi koki", "dengan kacamata hitam futuristik". Jaga agar tetap pendek.'
                    },
                    instructions: {
                        type: Type.STRING,
                        description: 'Satu instruksi kreatif untuk modifikasi gaya. Contoh: "ubah bajunya jadi piyama", "tambahkan efek api di sekelilingnya". Jaga agar tetap pendek.'
                    },
                    captions: {
                        type: Type.ARRAY,
                        items: { type: Type.STRING },
                        description: 'Sebuah array berisi tepat 10 caption stiker yang singkat, jenaka, dan relevan secara kontekstual dalam Bahasa Indonesia. Caption harus berhubungan dengan orang dan lingkungan di dalam foto.'
                    }
                }
            };
            
            // IMPROVEMENT: Wrap API call in withRetry for resilience.
            // FIX: Added missing options object for withRetry call.
            const jsonResponse = await withRetry(() =>
                generateStructuredTextFromImage(prompt, this.sourceImage!.base64, this.getApiKey, autofillSchema),
                {
                    retries: 2,
                    delayMs: 1000,
                    onRetry: (attempt, error) => console.warn(`Stickerrr autofill attempt ${attempt} failed. Retrying...`, error)
                }
            );
            const data = JSON.parse(jsonResponse);

            if (data.accessory) {
                this.accessoryInput.value = data.accessory;
            }
            if (data.instructions) {
                this.instructionsInput.value = data.instructions;
            }
            if (data.captions && Array.isArray(data.captions)) {
                this.captionInput.value = data.captions.join('\n');
            }

        } catch (e) {
            console.error('Autofill failed:', e);
            // IMPROVEMENT: Use non-blocking toast notification.
            this.showToast('Gagal mengisi otomatis. Silakan coba lagi.', 'error');
        } finally {
            this.autofillButton.disabled = false;
            this.autofillButton.innerHTML = originalButtonHTML;
        }
    },

    buildPrompt(expression: string, caption: string): string {
        const style = this.styleSelect.value;
        const accessory = this.accessoryInput.value.trim();
        const instructions = this.instructionsInput.value.trim();
        const container = this.containerSelect.value;

        let prompt = `Tugas: Ubah foto yang diberikan menjadi stiker digital.
Langkah-langkah:
1. **Isolasi Subjek**: Identifikasi dan isolasi subjek utama (orang) dari latar belakang foto.
2. **Gambar Ulang**: Gambar ulang subjek yang diisolasi dengan gaya **${style}**. Pertahankan kemiripan karakter dari foto asli.
3. **Ekspresi & Pose**: Ubah ekspresi dan pose subjek menjadi **${expression}**.`;

        if (accessory) {
            prompt += `\n4. **Aksesori**: ${accessory}.`;
        }

        if (instructions) {
            prompt += `\n5. **Instruksi Kustom**: ${instructions}.`;
        }

        if (caption && container !== 'None') {
            prompt += `\n6. **Teks**: Tambahkan teks "${caption}" di dalam sebuah **${container}** yang terintegrasi dengan baik dengan stiker.`;
        } else if (caption) {
             prompt += `\n6. **Teks**: Tambahkan teks "${caption}" dengan gaya yang sesuai dengan stiker, tanpa wadah.`;
        }
        
        prompt += `\n7. **Finishing**: Berikan stiker hasil akhir latar belakang transparan (penting!), dan tambahkan garis batas putih tebal di sekeliling subjek (efek die-cut).
Pastikan hasil akhirnya adalah gambar tunggal yang bersih dan terlihat seperti stiker digital profesional.`;
        
        return prompt;
    },

    async handleGenerate() {
        if (!this.sourceImage) return;

        this.state = 'processing';
        
        const theme = this.themeSelect.value;
        const themePack = THEME_PACKS[theme] || THEME_PACKS['social-reactions'];
        const customCaptions = this.captionInput.value.split(/[\n,]/).map(c => c.trim()).filter(Boolean);

        const prompts: string[] = [];
        for (let i = 0; i < 10; i++) {
            const packItem = themePack[i];
            const caption = customCaptions[i] || packItem.caption; // Use custom caption if available, otherwise use theme's default
            prompts.push(this.buildPrompt(packItem.expression, caption));
        }

        this.results = prompts.map(prompt => ({ prompt, status: 'pending', imageUrl: null }));
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
                // IMPROVEMENT: Wrap the core API call in withRetry.
                // FIX: Added missing options object for withRetry call.
                const response = await withRetry(async () => {
                    const ai = new GoogleGenAI({ apiKey: this.getApiKey() });
                    const parts = [
                        { inlineData: { data: this.sourceImage!.base64, mimeType: this.sourceImage!.file.type } },
                        { text: result.prompt }
                    ];
                    
                    return ai.models.generateContent({
                        model: 'gemini-2.5-flash-image-preview',
                        contents: { parts },
                        config: {
                            responseModalities: [Modality.IMAGE, Modality.TEXT],
                        },
                    });
                },
                {
                    retries: 2,
                    delayMs: 1000,
                    onRetry: (attempt, error) => console.warn(`Stickerrr generation attempt ${attempt} for index ${index} failed. Retrying...`, error)
                });

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

        await Promise.all(generationPromises);
        this.state = 'results';
        this.render();
    },

    handleGridClick(e: MouseEvent) {
        const target = e.target as HTMLElement;
        const item = target.closest('.image-result-item');
        if (!item) return;

        const index = parseInt((item as HTMLElement).dataset.index!, 10);
        
        const clickedResult = this.results[index];
        if (clickedResult.status !== 'done' || !clickedResult.imageUrl) return;

        const urls = this.results
            .filter(r => r.status === 'done' && r.imageUrl)
            .map(r => r.imageUrl!);
        
        const startIndex = urls.indexOf(clickedResult.imageUrl);

        if (startIndex > -1) {
            this.showPreviewModal(urls, startIndex);
        }
    },

    async handleDownloadAll() {
        for (let i = 0; i < this.results.length; i++) {
            const result = this.results[i];
            if (result.status === 'done' && result.imageUrl) {
                downloadFile(result.imageUrl, `sticker_${i + 1}.png`);
                await delay(300);
            }
        }
    },

    handleStartOver() {
        this.state = 'idle';
        this.sourceImage = null;
        this.results = [];
        this.fileInput.value = '';
        
        // Reset form fields
        this.styleSelect.selectedIndex = 0;
        this.themeSelect.selectedIndex = 0;
        this.accessoryInput.value = '';
        this.instructionsInput.value = '';
        this.captionInput.value = '';
        this.containerSelect.selectedIndex = 0;

        this.render();
    },

    updateStatusText() {
        switch (this.state) {
            case 'idle':
                this.statusTextEl.textContent = 'Unggah foto untuk memulai.';
                break;
            case 'processing':
                const doneCount = this.results.filter(r => r.status !== 'pending').length;
                this.statusTextEl.textContent = `Membuat stiker... (${doneCount}/${this.results.length})`;
                break;
            case 'results':
                this.statusTextEl.textContent = 'Pembuatan stiker selesai.';
                break;
        }
    },
    
    // IMPROVEMENT: Added a non-blocking notification system.
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

    render() {
        const hasImage = !!this.sourceImage;
        
        // Input state visibility
        this.inputStateEl.style.display = (this.state === 'idle' || this.state === 'processing') ? 'block' : 'none';
        this.optionsPanel.style.display = hasImage ? 'block' : 'none';
        this.uploadLabel.style.display = hasImage ? 'none' : 'block';
        this.previewImage.style.display = hasImage ? 'block' : 'none';
        if (hasImage) {
            this.previewImage.src = this.sourceImage!.dataUrl;
        }

        // Results state visibility
        this.resultsStateEl.style.display = (this.state === 'processing' || this.state === 'results') ? 'block' : 'none';
        
        // Status container visibility
        this.statusContainerEl.style.display = (this.state !== 'idle') ? 'flex' : 'none';
        this.progressWrapper.style.display = this.state === 'processing' ? 'block' : 'none';

        // Button states
        this.generateButton.disabled = !hasImage || this.state === 'processing';

        this.updateStatusText();

        if (this.state === 'processing' || this.state === 'results') {
            this.resultsGrid.innerHTML = ''; // Clear previous
            this.results.forEach((result, index) => {
                const wrapper = document.createElement('div');
                wrapper.className = 'image-result-wrapper';

                const item = document.createElement('div');
                item.className = 'image-result-item';
                item.dataset.index = String(index);
                item.style.backgroundColor = 'var(--color-surface-2)';

                let itemHTML = '';

                if (result.status === 'pending') {
                    itemHTML = `<div class="loading-clock"></div>`;
                } else if (result.status === 'error') {
                    itemHTML = `<span>Error</span>`;
                } else if (result.status === 'done' && result.imageUrl) {
                    itemHTML = `<img src="${result.imageUrl}" alt="Generated sticker ${index + 1}" style="object-fit: contain; padding: 5%;">`;
                }
                
                // Add overlay for preview
                if (result.imageUrl) {
                    itemHTML += `<div class="affiliate-result-item-overlay">
                        <button class="icon-button" aria-label="Preview">
                           <svg xmlns="http://www.w3.org/2000/svg" height="20px" viewBox="0 0 24 24" width="20px" fill="currentColor"><path d="M0 0h24v24H0V0z" fill="none"/><path d="M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5C21.27 7.61 17 4.5 12 4.5zm0 10c-2.48 0-4.5-2.02-4.5-4.5S9.52 5.5 12 5.5s4.5 2.02 4.5 4.5-2.02 4.5-4.5 4.5zm0-7C10.62 7.5 9.5 8.62 9.5 10s1.12 2.5 2.5 2.5 2.5-1.12 2.5-2.5S13.38 7.5 12 7.5z"/></svg>
                        </button>
                    </div>`;
                }

                item.innerHTML = itemHTML;
                wrapper.appendChild(item);
                this.resultsGrid.appendChild(wrapper);
            });
        }
    }
};