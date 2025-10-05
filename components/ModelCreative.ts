/* tslint:disable */
/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { downloadFile, parseAndFormatErrorMessage } from "../utils/helpers.ts";
import { generateImage } from "../utils/gemini.ts";

type ModelCreativeState = 'idle' | 'processing' | 'results' | 'error';

export const ModelCreative = {
    // DOM Elements
    view: document.querySelector('#model-creative-view') as HTMLDivElement,
    inputStateEl: null as HTMLDivElement | null,
    resultsStateEl: null as HTMLDivElement | null,
    resultBox: null as HTMLDivElement | null,
    generateButton: null as HTMLButtonElement | null,
    downloadButton: null as HTMLButtonElement | null,
    startOverButton: null as HTMLButtonElement | null,

    // Inputs
    genderSelect: null as HTMLSelectElement | null,
    raceSelect: null as HTMLSelectElement | null,
    ageSelect: null as HTMLSelectElement | null,
    skinInput: null as HTMLInputElement | null,
    hairInput: null as HTMLInputElement | null,
    bodyInput: null as HTMLInputElement | null,
    
    // State
    state: 'idle' as ModelCreativeState,
    resultImageUrl: null as string | null,
    errorMessage: '',

    // Dependencies
    getApiKey: (() => '') as () => string,
    showPreviewModal: ((urls: (string | null)[], startIndex?: number) => {}) as (urls: (string | null)[], startIndex?: number) => void,

    init(dependencies: { getApiKey: () => string; showPreviewModal: (urls: (string | null)[], startIndex?: number) => void; }) {
        if (!this.view) return;

        this.getApiKey = dependencies.getApiKey;
        this.showPreviewModal = dependencies.showPreviewModal;

        // Query elements
        this.inputStateEl = this.view.querySelector('#model-creative-input-state');
        this.resultsStateEl = this.view.querySelector('#model-creative-results-state');
        this.resultBox = this.view.querySelector('#model-creative-result-box');
        this.generateButton = this.view.querySelector('#model-creative-generate-button');
        this.downloadButton = this.view.querySelector('#model-creative-download-button');
        this.startOverButton = this.view.querySelector('#model-creative-start-over-button');
        
        this.genderSelect = this.view.querySelector('#model-creative-gender');
        this.raceSelect = this.view.querySelector('#model-creative-race');
        this.ageSelect = this.view.querySelector('#model-creative-age');
        this.skinInput = this.view.querySelector('#model-creative-skin');
        this.hairInput = this.view.querySelector('#model-creative-hair');
        this.bodyInput = this.view.querySelector('#model-creative-body');

        this.addEventListeners();
        this.render();
    },

    addEventListeners() {
        this.generateButton?.addEventListener('click', this.runGeneration.bind(this));
        this.startOverButton?.addEventListener('click', this.handleStartOver.bind(this));
        this.downloadButton?.addEventListener('click', this.handleDownload.bind(this));
        this.resultBox?.addEventListener('click', this.handlePreview.bind(this));
    },

    render() {
        if (!this.inputStateEl || !this.resultsStateEl || !this.resultBox || !this.generateButton || !this.downloadButton) return;
        
        this.inputStateEl.style.display = this.state === 'idle' ? 'block' : 'none';
        this.resultsStateEl.style.display = (this.state !== 'idle') ? 'block' : 'none';
        
        this.generateButton.disabled = this.state === 'processing';
        this.downloadButton.disabled = this.state !== 'results';

        switch(this.state) {
            case 'processing':
                this.resultBox.innerHTML = '<div class="loading-clock"></div><p style="margin-top: 1rem; color: var(--color-text-muted);">Membuat model Anda...</p>';
                break;
            case 'results':
                if (this.resultImageUrl) {
                    this.resultBox.innerHTML = `<img src="${this.resultImageUrl}" alt="Generated fashion model" style="width:100%; height:100%; object-fit: cover; cursor: pointer;" />`;
                }
                break;
            case 'error':
                this.resultBox.innerHTML = `<p class="pending-status-text" style="padding: 1rem;">${this.errorMessage}</p>`;
                break;
        }
    },
    
    buildPrompt(): string {
        const gender = this.genderSelect?.value;
        const race = this.raceSelect?.value;
        const age = this.ageSelect?.value;
        const skin = this.skinInput?.value.trim();
        const hair = this.hairInput?.value.trim();
        const body = this.bodyInput?.value.trim();
        
        let prompt = `Foto fesyen profesional seluruh tubuh dari model ${gender}, etnis ${race}, dalam kelompok usia ${age}.`;
        if (skin) prompt += ` Mereka memiliki kulit ${skin}.`;
        if (hair) prompt += ` Gaya rambut mereka adalah ${hair}.`;
        if (body) prompt += ` Fisik mereka ${body}.`;
        
        prompt += ` Model berpose dengan percaya diri dengan pakaian netral. Latar belakang studio polos. Pencahayaan lembut dan profesional. Tampilan ultra-realistis, 4K, sangat detail.`;
        
        return prompt;
    },

    async runGeneration() {
        this.state = 'processing';
        this.resultImageUrl = null;
        this.render();

        const prompt = this.buildPrompt();

        try {
            const imageUrl = await generateImage(prompt, this.getApiKey);
            if (!imageUrl) throw new Error("API tidak mengembalikan gambar.");
            
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

    handlePreview() {
        if (this.resultImageUrl && this.state === 'results') {
            this.showPreviewModal([this.resultImageUrl], 0);
        }
    },



    handleDownload() {
        if (this.resultImageUrl) {
            downloadFile(this.resultImageUrl, 'ai_model.png');
        }
    },

    handleStartOver() {
        this.state = 'idle';
        this.resultImageUrl = null;
        this.errorMessage = '';
        
        // Reset form fields
        if(this.genderSelect) this.genderSelect.selectedIndex = 0;
        if(this.raceSelect) this.raceSelect.selectedIndex = 0;
        if(this.ageSelect) this.ageSelect.selectedIndex = 0;
        if(this.skinInput) this.skinInput.value = '';
        if(this.hairInput) this.hairInput.value = '';
        if(this.bodyInput) this.bodyInput.value = '';

        this.render();
    },
};