/* tslint:disable */
/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { blobToDataUrl, downloadFile, parseAndFormatErrorMessage, setupDragAndDrop } from "../utils/helpers.ts";
import { generateStyledImage } from "../utils/gemini.ts";

type PosterProState = 'idle' | 'processing' | 'results' | 'error';
type PosterResult = {
    prompt: string;
    status: 'pending' | 'done' | 'error';
    imageUrl: string | null;
    errorMessage?: string;
};

export const PosterPro = {
    // DOM Elements
    view: document.querySelector('#poster-pro-view') as HTMLDivElement,
    inputStateEl: null as HTMLDivElement | null,
    resultsStateEl: null as HTMLDivElement | null,
    fileInput: null as HTMLInputElement | null,
    previewImage: null as HTMLImageElement | null,
    uploadLabel: null as HTMLSpanElement | null,
    optionsPanel: null as HTMLDivElement | null,
    resultsGrid: null as HTMLDivElement | null,
    generateButton: null as HTMLButtonElement | null,
    changePhotoButton: null as HTMLButtonElement | null,
    startOverButton: null as HTMLButtonElement | null,
    toastContainer: null as HTMLDivElement | null,

    // Inputs
    headlineInput: null as HTMLInputElement | null,
    subheadlineInput: null as HTMLTextAreaElement | null,
    ctaInput: null as HTMLInputElement | null,
    categoryGroup: null as HTMLDivElement | null,
    styleSelect: null as HTMLSelectElement | null,
    aspectRatioGroup: null as HTMLDivElement | null,
    elementsGroup: null as HTMLDivElement | null,
    customPromptInput: null as HTMLTextAreaElement | null,

    // State
    state: 'idle' as PosterProState,
    sourceImage: null as { dataUrl: string; base64: string; } | null,
    results: [] as PosterResult[],
    aspectRatio: '9:16',
    errorMessage: '',

    // Dependencies
    getApiKey: (() => '') as () => string,
    showPreviewModal: ((urls: (string | null)[], startIndex?: number) => {}) as (urls: (string | null)[], startIndex?: number) => void,

    init(dependencies: { getApiKey: () => string; showPreviewModal: (urls: (string | null)[], startIndex?: number) => void; }) {
        if (!this.view) return;

        this.getApiKey = dependencies.getApiKey;
        this.showPreviewModal = dependencies.showPreviewModal;

        this.queryDOMElements();
        this.addEventListeners();
        this.render();
    },

    queryDOMElements() {
        this.inputStateEl = this.view.querySelector('#poster-pro-input-state');
        this.resultsStateEl = this.view.querySelector('#poster-pro-results-state');
        this.fileInput = this.view.querySelector('#poster-pro-file-input');
        this.previewImage = this.view.querySelector('#poster-pro-preview-image');
        this.uploadLabel = this.view.querySelector('#poster-pro-upload-label');
        this.optionsPanel = this.view.querySelector('#poster-pro-options-panel');
        this.resultsGrid = this.view.querySelector('#poster-pro-results-grid');
        this.generateButton = this.view.querySelector('#poster-pro-generate-button');
        this.changePhotoButton = this.view.querySelector('#poster-pro-change-photo-button');
        this.startOverButton = this.view.querySelector('#poster-pro-start-over-button');
        this.toastContainer = document.querySelector('#toast-container');
        
        this.headlineInput = this.view.querySelector('#poster-pro-headline-input');
        this.subheadlineInput = this.view.querySelector('#poster-pro-subheadline-input');
        this.ctaInput = this.view.querySelector('#poster-pro-cta-input');
        this.categoryGroup = this.view.querySelector('#poster-pro-category-group');
        this.styleSelect = this.view.querySelector('#poster-pro-style-select');
        this.aspectRatioGroup = this.view.querySelector('#poster-pro-aspect-ratio-group');
        this.elementsGroup = this.view.querySelector('#poster-pro-elements-group');
        this.customPromptInput = this.view.querySelector('#poster-pro-custom-prompt');
    },

    addEventListeners() {
        const dropZone = this.fileInput?.closest('.file-drop-zone') as HTMLElement;
        if(dropZone) setupDragAndDrop(dropZone, this.fileInput);
        
        this.fileInput?.addEventListener('change', this.handleUpload.bind(this));
        this.generateButton?.addEventListener('click', this.runGeneration.bind(this));
        this.changePhotoButton?.addEventListener('click', () => this.fileInput?.click());
        this.startOverButton?.addEventListener('click', this.handleStartOver.bind(this));
        
        this.categoryGroup?.addEventListener('click', (e) => this.handleOptionClick(e, 'single'));
        this.elementsGroup?.addEventListener('click', (e) => this.handleOptionClick(e, 'multiple'));
        this.aspectRatioGroup?.addEventListener('click', this.handleAspectRatioClick.bind(this));

        this.resultsGrid?.addEventListener('click', this.handleGridClick.bind(this));
        this.headlineInput?.addEventListener('input', () => this.render());
    },
    
    handleOptionClick(e: MouseEvent, type: 'single' | 'multiple') {
        const target = e.target as HTMLElement;
        const button = target.closest('.toggle-button');
        const group = target.closest('.button-group, #poster-pro-elements-group');
        if (button && group) {
            if (type === 'single') {
                group.querySelectorAll('.toggle-button').forEach(btn => btn.classList.remove('active'));
                button.classList.add('active');
            } else {
                button.classList.toggle('active');
            }
        }
    },

    handleAspectRatioClick(e: MouseEvent) {
        const target = e.target as HTMLElement;
        const button = target.closest('.toggle-button');
        if (button && this.aspectRatioGroup) {
            this.aspectRatioGroup.querySelectorAll('.toggle-button').forEach(btn => btn.classList.remove('active'));
            button.classList.add('active');
            this.aspectRatio = (button as HTMLElement).dataset.value || '9:16';
        }
    },

    async handleUpload(e: Event) {
        const file = (e.target as HTMLInputElement).files?.[0];
        if (!file) return;

        try {
            const dataUrl = await blobToDataUrl(file);
            this.sourceImage = { dataUrl, base64: dataUrl.split(',')[1] };
            this.state = 'idle';
            this.render();
        } catch (error: any) {
            this.state = 'error';
            this.errorMessage = `Error processing file: ${error.message}`;
            this.showToast(this.errorMessage, 'error');
            this.render();
        }
    },

    render() {
        if (!this.inputStateEl || !this.resultsStateEl || !this.generateButton) return;

        const hasImage = !!this.sourceImage;
        const hasHeadline = this.headlineInput?.value.trim() !== '';
        
        this.inputStateEl.style.display = (this.state === 'idle') ? 'block' : 'none';
        this.resultsStateEl.style.display = (this.state !== 'idle') ? 'block' : 'none';

        if(this.optionsPanel) this.optionsPanel.style.display = hasImage ? 'block' : 'none';
        if(this.previewImage) this.previewImage.style.display = hasImage ? 'block' : 'none';
        if(this.uploadLabel) this.uploadLabel.style.display = hasImage ? 'none' : 'block';
        
        this.generateButton.disabled = !hasImage || !hasHeadline || this.state === 'processing';

        if (hasImage && this.previewImage) {
            this.previewImage.src = this.sourceImage!.dataUrl;
        }

        if (this.state === 'processing' || this.state === 'results') {
            this.resultsGrid!.innerHTML = '';
            this.results.forEach((result, index) => {
                const itemWrapper = document.createElement('div');
                // Gunakan kelas affiliate-result-item untuk mewarisi gaya overlay
                itemWrapper.className = 'image-result-item affiliate-result-item';
                itemWrapper.dataset.index = String(index);

                if (result.status === 'pending') {
                    itemWrapper.innerHTML = `<div class="loading-clock"></div>`;
                } else if (result.status === 'error') {
                    itemWrapper.innerHTML = `<p class="pending-status-text">${result.errorMessage}</p>`;
                } else if (result.imageUrl) {
                    const previewSVG = `<svg xmlns="http://www.w3.org/2000/svg" height="20px" viewBox="0 0 24 24" width="20px" fill="currentColor"><path d="M0 0h24v24H0V0z" fill="none"/><path d="M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5C21.27 7.61 17 4.5 12 4.5zm0 10c-2.48 0-4.5-2.02-4.5-4.5S9.52 5.5 12 5.5s4.5 2.02 4.5 4.5-2.02 4.5-4.5 4.5zm0-7C10.62 7.5 9.5 8.62 9.5 10s1.12 2.5 2.5 2.5 2.5-1.12 2.5-2.5S13.38 7.5 12 7.5z"/></svg>`;
                    const downloadSVG = `<svg xmlns="http://www.w3.org/2000/svg" height="20px" viewBox="0 0 24 24" width="20px" fill="currentColor"><path d="M0 0h24v24H0V0z" fill="none"/><path d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z"/></svg>`;
                    const regenerateSVG = `<svg xmlns="http://www.w3.org/2000/svg" height="20px" viewBox="0 0 24 24" width="20px" fill="currentColor"><path d="M0 0h24v24H0V0z" fill="none"/><path d="M12.5 8c-2.65 0-5.05.99-6.9 2.6L2 7v9h9l-3.62-3.62c1.39-1.16 3.16-1.88 5.12-1.88 3.54 0 6.55 2.31 7.6 5.5l2.37-.78C21.08 11.03 17.15 8 12.5 8z"/></svg>`;
                    
                    itemWrapper.innerHTML = `
                        <img src="${result.imageUrl}" alt="Generated Poster ${index + 1}" />
                        <div class="affiliate-result-item-overlay">
                            <button class="icon-button poster-pro-preview" title="Pratinjau">${previewSVG}</button>
                            <button class="icon-button poster-pro-download" title="Unduh Poster">${downloadSVG}</button>
                            <button class="icon-button poster-pro-regenerate" title="Buat Ulang">${regenerateSVG}</button>
                        </div>
                    `;
                }
                this.resultsGrid?.appendChild(itemWrapper);
            });
        }
    },

    buildPrompt(): string {
        const headline = this.headlineInput?.value.trim();
        const subheadline = this.subheadlineInput?.value.trim();
        const cta = this.ctaInput?.value.trim();
        const category = this.categoryGroup?.querySelector('.toggle-button.active')?.dataset.value || 'Lifestyle';
        const style = this.styleSelect?.value;
        const customPrompt = this.customPromptInput?.value.trim();
        const selectedElements = Array.from(this.elementsGroup?.querySelectorAll('.toggle-button.active') || [])
            .map(btn => (btn as HTMLElement).dataset.element)
            .filter(Boolean);

        let artDirection = '';
        switch(category) {
            case 'Makanan & Minuman':
                artDirection = "Ciptakan adegan yang dinamis dan menggugah selera. Gunakan pencahayaan yang cerah dan fokus makro untuk menonjolkan tekstur.";
                break;
            case 'Fashion':
                artDirection = "Hasilkan poster gaya editorial mode tinggi. Gunakan pencahayaan dinamis seperti neon lembut atau sorotan dramatis.";
                break;
            case 'Rental':
                artDirection = "Rancang iklan yang bersih dan modern. Latar belakang harus cerah dan aspiratif, menunjukkan manfaat dari penyewaan.";
                break;
            case 'Lifestyle':
                artDirection = "Ciptakan adegan yang hangat dan otentik. Latar belakang harus berupa lingkungan yang nyaman dengan pencahayaan alami dan lembut.";
                break;
        }

        let styleInstructions = '';
        switch(style) {
            case 'Minimalist':
                styleInstructions = 'Gaya desain harus sangat minimalis. Gunakan tipografi sans-serif yang bersih dan tipis. Ciptakan tata letak dengan banyak ruang kosong (negative space) untuk menekankan subjek. Batasi palet warna menjadi monokromatik atau hanya dengan satu warna aksen yang halus. Latar belakang harus berupa warna solid yang bersih atau gradien yang sangat lembut.';
                break;
            case 'Luxury':
                styleInstructions = 'Gaya desain harus mewah dan elegan. Gunakan tipografi serif yang canggih, mungkin dengan efek metalik emas atau perak pada teks utama. Palet warna harus terdiri dari warna-warna kaya seperti hitam, biru tua, atau hijau zamrud, yang dipadukan dengan aksen krem atau emas. Latar belakang harus memiliki tekstur halus seperti marmer atau sutra, dengan pencahayaan studio yang lembut.';
                break;
            case 'Dramatic':
                styleInstructions = 'Gaya desain harus dramatis dan sinematik. Gunakan pencahayaan kontras tinggi (chiaroscuro) dengan bayangan yang kuat. Tipografi harus tebal, berani, dan berdampak. Komposisinya harus dinamis, mungkin menggunakan sudut yang tidak biasa. Tambahkan elemen atmosfer seperti asap halus, kabut, atau efek partikel untuk meningkatkan suasana hati.';
                break;
            case 'Fun & Colorful':
            default:
                styleInstructions = 'Gaya desain harus menyenangkan, bersemangat, dan penuh warna. Gunakan palet warna yang cerah dan jenuh. Tipografi harus ceria dan mudah dibaca, mungkin dengan gaya bulat atau sedikit informal. Komposisinya harus dinamis dan menarik perhatian, cocok untuk media sosial.';
                break;
        }


        return `**TUGAS POSTER PRO:** Buat poster iklan fotorealistis dan sangat dinamis dalam rasio aspek **${this.aspectRatio}**.
        
**Langkah Eksekusi Inti:**
1.  **Isolasi Subjek:** Isolasi subjek utama (orang/produk) dari gambar yang disediakan dengan sempurna.
2.  **Pembuatan Adegan Sinematik:** Buat latar belakang baru yang hiper-realistis berdasarkan Arahan Seni di bawah. Latar belakang harus memiliki pencahayaan, perspektif, dan bayangan yang cocok dengan subjek.
3.  **Pengomposisian & Integrasi:** Tempatkan subjek yang telah diisolasi ke dalam adegan baru, padukan pencahayaan dan warna agar terlihat menyatu.
4.  **Tipografi Ahli & Integrasi Teks:**
    *   **Headline Utama:** "${headline}". Render ini dengan tipografi 3D yang tebal dan menarik.
    *   **Sub-Headline/Promo:** "${subheadline}". Ini harus lebih kecil tetapi jelas.
    *   **Tombol CTA:** ${cta ? `Buat tombol yang terlihat bisa diklik dengan teks "${cta}".` : 'Tidak ada tombol CTA.'}
5.  **Arahan Seni:**
    *   **Kategori:** ${category}
    *   **Instruksi Gaya Rinci:** ${styleInstructions}
    *   **Instruksi Umum Kategori:** ${artDirection}
    *   **Elemen Dekoratif:** ${selectedElements.length > 0 ? `Gabungkan elemen-elemen ini secara kreatif: ${selectedElements.join(', ')}.` : 'Tidak ada elemen dekoratif tambahan.'}
6.  **Instruksi Tambahan:** ${customPrompt || 'Tidak ada instruksi tambahan.'}
7.  **Polesan Akhir:** Terapkan gradasi warna profesional di seluruh gambar untuk menyatukan semua elemen. Tingkatkan pencahayaan agar sinematik dan dramatis. Pastikan gambar tajam dan cerah.

**Mandat Output:** Output HARUS berupa satu file gambar poster yang sudah jadi.`;
    },

    async runGeneration() {
        if (!this.sourceImage || !this.headlineInput?.value.trim()) return;

        this.state = 'processing';
        this.results = Array(3).fill(null).map((_, i) => ({
            prompt: this.buildPrompt() + `\n**Variasi #${i + 1}:** Berikan komposisi dan tata letak yang berbeda dari versi sebelumnya.`,
            status: 'pending',
            imageUrl: null
        }));
        this.render();

        const generationPromises = this.results.map(async (result, index) => {
            try {
                const response = await generateStyledImage(this.sourceImage!.base64, null, result.prompt, this.getApiKey);
                const imagePart = response.candidates?.[0]?.content?.parts.find(p => p.inlineData);

                if (imagePart?.inlineData) {
                    this.results[index].imageUrl = `data:${imagePart.inlineData.mimeType};base64,${imagePart.inlineData.data}`;
                    this.results[index].status = 'done';
                } else {
                    throw new Error(response.candidates?.[0]?.content?.parts.find(p => p.text)?.text || "Tidak ada data gambar dalam respons.");
                }
            } catch (e: any) {
                console.error(`Error generating poster ${index}:`, e);
                this.results[index].status = 'error';
                this.results[index].errorMessage = parseAndFormatErrorMessage(e, 'Pembuatan poster');
            } finally {
                this.render(); // Re-render the grid after each image is processed
            }
        });

        await Promise.all(generationPromises);
        this.state = 'results';
        this.render();
    },

    async regenerateSingle(index: number) {
        if (!this.sourceImage || index < 0 || index >= this.results.length) return;

        const resultToRegen = this.results[index];
        if (!resultToRegen) return;

        resultToRegen.status = 'pending';
        resultToRegen.imageUrl = null;
        this.render();

        try {
            const response = await generateStyledImage(this.sourceImage.base64, null, resultToRegen.prompt, this.getApiKey);
            const imagePart = response.candidates?.[0]?.content?.parts.find(p => p.inlineData);

            if (imagePart?.inlineData) {
                this.results[index].imageUrl = `data:${imagePart.inlineData.mimeType};base64,${imagePart.inlineData.data}`;
                this.results[index].status = 'done';
            } else {
                throw new Error(response.candidates?.[0]?.content?.parts.find(p => p.text)?.text || "Tidak ada data gambar dalam respons.");
            }
        } catch (e: any) {
            console.error(`Error regenerating poster ${index}:`, e);
            this.results[index].status = 'error';
            this.results[index].errorMessage = parseAndFormatErrorMessage(e, 'Pembuatan poster');
        } finally {
            this.render();
        }
    },

    handleGridClick(e: MouseEvent) {
        const target = e.target as HTMLElement;
        const item = target.closest('.image-result-item');
        if (!item) return;
        
        const index = parseInt((item as HTMLElement).dataset.index!, 10);
        const result = this.results[index];
        if (!result) return;

        // Tindakan tombol spesifik terlebih dahulu
        if (target.closest('.poster-pro-download')) {
            if (result.imageUrl) downloadFile(result.imageUrl, `poster_pro_${index + 1}.png`);
            return;
        }

        if (target.closest('.poster-pro-regenerate')) {
            this.regenerateSingle(index);
            return;
        }

        // Tindakan default adalah pratinjau
        if (result.imageUrl) {
            const urls = this.results
                .map(r => r.imageUrl)
                .filter((url): url is string => !!url);
            const startIndex = urls.indexOf(result.imageUrl);
            if (startIndex > -1) {
                this.showPreviewModal(urls, startIndex);
            }
        }
    },

    handleStartOver() {
        this.state = 'idle';
        this.sourceImage = null;
        this.results = [];
        if (this.fileInput) this.fileInput.value = '';
        if (this.headlineInput) this.headlineInput.value = '';
        if (this.subheadlineInput) this.subheadlineInput.value = '';
        if (this.ctaInput) this.ctaInput.value = '';
        if (this.customPromptInput) this.customPromptInput.value = '';

        this.aspectRatio = '9:16';
        if (this.aspectRatioGroup) {
            this.aspectRatioGroup.querySelectorAll('.toggle-button').forEach(btn => {
                btn.classList.toggle('active', (btn as HTMLElement).dataset.value === '9:16');
            });
        }
        
        this.render();
    },
    
    showToast(message: string, type: 'success' | 'error' | 'info' = 'success') {
        const toast = document.createElement('div');
        toast.className = `toast-notification ${type}`;
        toast.textContent = message;
        this.toastContainer?.appendChild(toast);
        setTimeout(() => {
            toast.remove();
        }, 3000);
    }
};