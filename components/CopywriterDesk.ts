/* tslint:disable */
/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { blobToDataUrl, parseAndFormatErrorMessage, setupDragAndDrop, withRetry } from "../utils/helpers.ts";
import { generateText, generateStructuredTextFromImage } from "../utils/gemini.ts";
import { Type } from "@google/genai";

type CopywriterState = 'idle' | 'processing' | 'results' | 'error';
type CopyResult = {
    copy: string;
};

export const CopywriterDesk = {
    // DOM Elements
    view: null as HTMLDivElement | null,
    inputStateEl: null as HTMLDivElement | null,
    resultsStateEl: null as HTMLDivElement | null,
    statusContainer: null as HTMLDivElement | null,
    statusText: null as HTMLParagraphElement | null,
    
    // Inputs
    fileInput: null as HTMLInputElement | null,
    previewImage: null as HTMLImageElement | null,
    uploadLabel: null as HTMLSpanElement | null,
    clearImageButton: null as HTMLButtonElement | null,
    suggestButton: null as HTMLButtonElement | null,
    formatGroup: null as HTMLDivElement | null,
    productNameInput: null as HTMLInputElement | null,
    productDescInput: null as HTMLTextAreaElement | null,
    audienceInput: null as HTMLInputElement | null,
    painPointInput: null as HTMLTextAreaElement | null,
    frameworkSelect: null as HTMLSelectElement | null,
    toneGroup: null as HTMLDivElement | null,
    keywordsInput: null as HTMLInputElement | null,
    generateButton: null as HTMLButtonElement | null,
    startOverButton: null as HTMLButtonElement | null,

    // Results
    resultsGrid: null as HTMLDivElement | null,

    // State
    state: 'idle' as CopywriterState,
    sourceImage: null as { dataUrl: string; base64: string; } | null,
    results: [] as CopyResult[],
    
    // Dependencies
    getApiKey: (() => '') as () => string,
    showNotification: ((message: string, type: 'success' | 'error' | 'info') => {}) as (message: string, type: 'success' | 'error' | 'info') => void,

    init(dependencies: { 
        getApiKey: () => string; 
        showNotification: (message: string, type: 'success' | 'error' | 'info') => void;
    }) {
        this.view = document.querySelector('#copywriter-desk-view');
        if (!this.view) return;

        this.getApiKey = dependencies.getApiKey;
        this.showNotification = dependencies.showNotification;
        
        this.queryDOMElements();
        if (!this.validateDOMElements()) return;
        
        this.addEventListeners();
        this.render();
    },

    queryDOMElements() {
        if (!this.view) return;
        this.inputStateEl = this.view.querySelector('#copywriter-input-state');
        this.resultsStateEl = this.view.querySelector('#copywriter-results-state');
        this.statusContainer = this.view.querySelector('#copywriter-status-container');
        this.statusText = this.view.querySelector('#copywriter-status');
        this.fileInput = this.view.querySelector('#copywriter-file-input');
        this.previewImage = this.view.querySelector('#copywriter-preview-image');
        this.uploadLabel = this.view.querySelector('#copywriter-upload-label');
        this.clearImageButton = this.view.querySelector('#copywriter-clear-image-button');
        this.suggestButton = this.view.querySelector('#copywriter-suggest-button');
        this.formatGroup = this.view.querySelector('#copywriter-format-group');
        this.productNameInput = this.view.querySelector('#copywriter-product-name');
        this.productDescInput = this.view.querySelector('#copywriter-product-desc');
        this.audienceInput = this.view.querySelector('#copywriter-audience');
        this.painPointInput = this.view.querySelector('#copywriter-pain-point');
        this.frameworkSelect = this.view.querySelector('#copywriter-framework');
        this.toneGroup = this.view.querySelector('#copywriter-tone-group');
        this.keywordsInput = this.view.querySelector('#copywriter-keywords');
        this.generateButton = this.view.querySelector('#copywriter-generate-button');
        this.startOverButton = this.view.querySelector('#copywriter-start-over-button');
        this.resultsGrid = this.view.querySelector('#copywriter-results-grid');
    },

    validateDOMElements(): boolean {
        const elements = [
            this.inputStateEl, this.resultsStateEl, this.statusContainer, this.statusText,
            this.fileInput, this.previewImage, this.uploadLabel, this.clearImageButton, this.suggestButton,
            this.formatGroup, this.productNameInput, this.productDescInput, this.audienceInput,
            this.painPointInput, this.frameworkSelect, this.toneGroup, this.keywordsInput, 
            this.generateButton, this.startOverButton, this.resultsGrid
        ];
        if (elements.some(el => !el)) {
            console.error("Copywriter's Desk initialization failed: One or more DOM elements are missing.");
            return false;
        }
        return true;
    },

    addEventListeners() {
        const dropZone = this.fileInput!.closest('.file-drop-zone') as HTMLElement;
        setupDragAndDrop(dropZone, this.fileInput!);

        this.fileInput!.addEventListener('change', this.handleUpload.bind(this));
        this.clearImageButton!.addEventListener('click', this.handleClearImage.bind(this));
        this.suggestButton!.addEventListener('click', this.handleAiSuggestions.bind(this));
        this.generateButton!.addEventListener('click', this.runGeneration.bind(this));
        this.startOverButton!.addEventListener('click', this.handleStartOver.bind(this));
        
        [this.formatGroup, this.toneGroup].forEach(group => {
            group!.addEventListener('click', e => {
                const button = (e.target as HTMLElement).closest('.toggle-button');
                if (button) {
                    group!.querySelectorAll('.toggle-button').forEach(btn => btn.classList.remove('active'));
                    button.classList.add('active');
                }
            });
        });
        
        this.resultsGrid!.addEventListener('click', e => {
            const button = (e.target as HTMLElement).closest('.copy-hook-button');
            if (button) {
                const text = decodeURIComponent(button.getAttribute('data-text')!);
                navigator.clipboard.writeText(text)
                    .then(() => this.showNotification('Teks berhasil disalin!', 'success'))
                    .catch(() => this.showNotification('Gagal menyalin teks.', 'error'));
            }
        });

        // Enable/disable button based on input
        [this.productNameInput, this.productDescInput].forEach(input => {
            input!.addEventListener('input', () => this.updateGenerateButtonState());
        });
    },

    updateGenerateButtonState() {
        const hasName = this.productNameInput!.value.trim().length > 0;
        const hasDesc = this.productDescInput!.value.trim().length > 0;
        this.generateButton!.disabled = !hasName || !hasDesc;
    },

    render() {
        this.inputStateEl!.style.display = this.state === 'idle' ? 'block' : 'none';
        this.resultsStateEl!.style.display = this.state === 'results' ? 'block' : 'none';
        this.statusContainer!.style.display = this.state === 'processing' ? 'flex' : 'none';

        const hasImage = !!this.sourceImage;
        this.uploadLabel!.style.display = hasImage ? 'none' : 'block';
        this.clearImageButton!.style.display = hasImage ? 'inline-flex' : 'none';
        this.suggestButton!.disabled = !hasImage;

        if (this.state === 'processing') {
            this.statusText!.textContent = 'AI sedang merangkai kata...';
        }

        if (this.state === 'results') {
            this.resultsGrid!.innerHTML = this.results.map(result => `
                <div class="hook-item">
                    <p>${result.copy.replace(/\n/g, '<br>')}</p>
                    <div class="hook-item-meta">
                        <button class="icon-button copy-hook-button" data-text="${encodeURIComponent(result.copy)}" aria-label="Copy text" title="Salin Teks">
                            <svg xmlns="http://www.w3.org/2000/svg" height="20px" viewBox="0 0 24 24" width="20px" fill="currentColor"><path d="M0 0h24v24H0z" fill="none"/><path d="M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0 -1.1-.9-2-2-2zm0 16H8V7h11v14z"/></svg>
                        </button>
                    </div>
                </div>
            `).join('');
        }
        this.updateGenerateButtonState();
    },

    async handleUpload(e: Event) {
        const file = (e.target as HTMLInputElement).files?.[0];
        if (!file) return;

        try {
            const dataUrl = await blobToDataUrl(file);
            this.sourceImage = {
                dataUrl,
                base64: dataUrl.substring(dataUrl.indexOf(',') + 1),
            };
            this.previewImage!.src = dataUrl;
            this.previewImage!.classList.remove('image-preview-hidden');
            this.render();
        } catch (error: any) {
            this.showNotification(`Kesalahan memproses file: ${error.message}`, 'error');
        }
    },

    handleClearImage() {
        this.sourceImage = null;
        this.fileInput!.value = '';
        this.previewImage!.src = '#';
        this.previewImage!.classList.add('image-preview-hidden');
        this.render();
    },

    async handleAiSuggestions() {
        if (!this.sourceImage) return;

        this.suggestButton!.disabled = true;
        const originalButtonHTML = this.suggestButton!.innerHTML;
        this.suggestButton!.innerHTML = `<div class="loading-clock" style="width:18px; height:18px; margin: 0 auto;"></div>`;

        try {
            const prompt = `Analisis gambar produk ini. Sarankan nama produk yang menarik, deskripsi singkat yang menarik (1-2 kalimat), dan kemungkinan target audiens. Jawab dalam Bahasa Indonesia.`;
            
            const schema = {
                type: Type.OBJECT,
                properties: {
                    productName: { type: Type.STRING },
                    shortDescription: { type: Type.STRING },
                    targetAudience: { type: Type.STRING }
                },
                required: ["productName", "shortDescription", "targetAudience"],
            };
            
            const jsonString = await withRetry(
                () => generateStructuredTextFromImage(prompt, this.sourceImage!.base64, this.getApiKey(), schema),
                {
                    retries: 2,
                    delayMs: 1000,
                    onRetry: () => this.showNotification('Terjadi masalah. Mencoba lagi...', 'info')
                }
            );
            
            const suggestions = JSON.parse(jsonString);
            this.productNameInput!.value = suggestions.productName || '';
            this.productDescInput!.value = suggestions.shortDescription || '';
            this.audienceInput!.value = suggestions.targetAudience || '';
            this.showNotification('Saran berhasil dibuat!', 'success');
            this.updateGenerateButtonState();

        } catch (e: any) {
            console.error('AI suggestion failed:', e);
            this.showNotification(parseAndFormatErrorMessage(e, 'Gagal memberikan saran'), 'error');
        } finally {
            this.suggestButton!.disabled = false;
            this.suggestButton!.innerHTML = originalButtonHTML;
            this.render();
        }
    },

    buildPrompt(): string {
        const getSelectedValue = (group: HTMLDivElement) => 
            (group.querySelector('.toggle-button.active') as HTMLElement)?.dataset.value || '';
        
        const format = getSelectedValue(this.formatGroup!);
        const name = this.productNameInput!.value.trim();
        const desc = this.productDescInput!.value.trim();
        const audience = this.audienceInput!.value.trim();
        const painPoint = this.painPointInput!.value.trim();
        const framework = this.frameworkSelect!.value;
        const tone = getSelectedValue(this.toneGroup!);
        const keywords = this.keywordsInput!.value.trim();

        let prompt = `Anda adalah seorang copywriter pemasaran ahli. Hasilkan 3 variasi teks iklan untuk format: "${format}".\n\n`;
        prompt += `**Detail Produk & Konteks:**\n`;
        prompt += `- Nama: ${name}\n`;
        prompt += `- Deskripsi: ${desc}\n`;
        prompt += `- Target Audiens: ${audience}\n`;

        if (painPoint) {
            prompt += `- Masalah Pelanggan (Pain Point): ${painPoint}\n`;
        }
        if (keywords) {
            prompt += `- Kata Kunci untuk Disertakan: ${keywords}\n`;
        }

        prompt += `\n**Instruksi Penulisan:**\n`;
        
        if (framework && framework !== 'Standard') {
            const frameworkInstructions: { [key: string]: string } = {
                'AIDA': 'Terapkan prinsip kerangka AIDA (Attention, Interest, Desire, Action). Mulailah dengan menarik perhatian, lalu bangun minat, ciptakan keinginan, dan diakhiri dengan ajakan bertindak yang jelas. PENTING: Jangan tuliskan kata "Attention", "Interest", "Desire", atau "Action" di dalam teks yang dihasilkan.',
                'PAS': 'Terapkan prinsip kerangka PAS (Problem, Agitate, Solution). Identifikasi masalah yang dihadapi audiens, buat mereka merasakannya lebih dalam, lalu tawarkan produk Anda sebagai solusinya. PENTING: Jangan tuliskan kata "Problem", "Agitate", atau "Solution" di dalam teks yang dihasilkan.',
                'BAB': 'Terapkan prinsip kerangka Before-After-Bridge. Gambarkan dunia audiens "Sebelum" menggunakan produk Anda (masalah mereka), lalu gambarkan dunia "Setelah" (manfaat yang mereka dapat), dan posisikan produk Anda sebagai jembatan di antara keduanya. PENTING: Jangan tuliskan kata "Before", "After", atau "Bridge" di dalam teks yang dihasilkan.'
            };
            prompt += `- Wajib gunakan kerangka penulisan berikut: ${frameworkInstructions[framework]}.\n`;
        }


        prompt += `- Nada suara harus: ${tone}.\n`;
        prompt += `- Tulis dalam Bahasa Indonesia.\n`;
        
        if (painPoint) {
            prompt += `- Jika relevan, mulai tulisan dengan menyentuh "Masalah Pelanggan" untuk menarik perhatian.\n`;
        }

        prompt += `- Buatlah teks yang menarik, singkat, dan persuasif.\n`;
        prompt += `- Setiap variasi harus unik.\n`;

        return prompt;
    },

    async runGeneration() {
        if (this.generateButton!.disabled) return;

        this.state = 'processing';
        this.render();

        try {
            const prompt = this.buildPrompt();
            const schema = {
                type: Type.ARRAY,
                items: {
                    type: Type.OBJECT,
                    properties: {
                        copy: {
                            type: Type.STRING,
                            description: "The generated marketing copy text."
                        }
                    },
                    required: ["copy"]
                }
            };

            const jsonString = await withRetry(
                () => generateText(prompt, this.getApiKey(), schema),
                {
                    retries: 2,
                    delayMs: 1000,
                    onRetry: (attempt, err) => {
                        this.statusText!.textContent = `Terjadi masalah. Mencoba lagi... (Percobaan ${attempt})`;
                        console.warn(`Copywriter generation attempt ${attempt} failed. Retrying...`, err);
                    }
                }
            );

            this.results = JSON.parse(jsonString);
            this.state = 'results';

        } catch (e: any) {
            console.error("Error generating copy:", e);
            const errorMessage = parseAndFormatErrorMessage(e, 'Pembuatan teks');
            this.showNotification(errorMessage, 'error');
            this.state = 'idle'; // Go back to idle on error
        } finally {
            this.render();
        }
    },

    handleStartOver() {
        this.state = 'idle';
        this.results = [];
        this.handleClearImage();
        this.productNameInput!.value = '';
        this.productDescInput!.value = '';
        this.audienceInput!.value = '';
        this.keywordsInput!.value = '';
        this.painPointInput!.value = '';
        this.frameworkSelect!.selectedIndex = 0;
        this.render();
    }
};