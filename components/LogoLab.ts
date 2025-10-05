/* tslint:disable */
/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import {
    downloadFile,
    parseAndFormatErrorMessage
} from "../utils/helpers.ts";
import {
    generateImage,
    generateText
} from "../utils/gemini.ts";

type LogoLabState = 'step1' | 'generating-brief' | 'step2' | 'generating-logos' | 'results';

export const LogoLab = {
    // DOM Elements
    view: document.querySelector('#logo-lab-view') as HTMLDivElement,
    formContainer: null as HTMLDivElement | null,
    step1El: null as HTMLDivElement | null,
    step2El: null as HTMLDivElement | null,
    resultsStateEl: null as HTMLDivElement | null,
    statusContainer: null as HTMLDivElement | null,
    statusText: null as HTMLParagraphElement | null,

    // Step 1
    businessNameInput: null as HTMLInputElement | null,
    sloganInput: null as HTMLInputElement | null,
    descriptionInput: null as HTMLTextAreaElement | null,
    keywordsInput: null as HTMLInputElement | null,
    nextStep1Button: null as HTMLButtonElement | null,

    // Step 2
    briefTextarea: null as HTMLTextAreaElement | null,
    typeGroup: null as HTMLDivElement | null,
    styleGroup: null as HTMLDivElement | null,
    dimensionalityGroup: null as HTMLDivElement | null,
    colorsInput: null as HTMLInputElement | null,
    backStep2Button: null as HTMLButtonElement | null,
    generateButton: null as HTMLButtonElement | null,

    // Results
    resultsGrid: null as HTMLDivElement | null,
    startOverButton: null as HTMLButtonElement | null,

    // State
    state: 'step1' as LogoLabState,
    results: [] as {
        prompt: string,
        status: 'pending' | 'done' | 'error',
        url ? : string,
        errorMessage ? : string
    } [],

    // Dependencies
    getApiKey: (() => '') as () => string,
    showPreviewModal: ((urls: (string | null) [], startIndex ? : number) => {}) as (urls: (string | null) [], startIndex ? : number) => void,

    init(dependencies: {
        getApiKey: () => string;showPreviewModal: (urls: (string | null) [], startIndex ? : number) => void;
    }) {
        if (!this.view) return;
        this.getApiKey = dependencies.getApiKey;
        this.showPreviewModal = dependencies.showPreviewModal;

        this.queryDOMElements();
        this.addEventListeners();
        this.render();
    },

    queryDOMElements() {
        this.formContainer = this.view.querySelector('#logo-lab-form-container');
        this.step1El = this.view.querySelector('#logo-lab-step-1');
        this.step2El = this.view.querySelector('#logo-lab-step-2');
        this.resultsStateEl = this.view.querySelector('#logo-lab-results-state');
        this.statusContainer = this.view.querySelector('#logo-lab-status-container');
        this.statusText = this.view.querySelector('#logo-lab-status');
        this.businessNameInput = this.view.querySelector('#logo-lab-business-name');
        this.sloganInput = this.view.querySelector('#logo-lab-slogan');
        this.descriptionInput = this.view.querySelector('#logo-lab-description');
        this.keywordsInput = this.view.querySelector('#logo-lab-keywords');
        this.nextStep1Button = this.view.querySelector('#logo-lab-next-step-1');
        this.briefTextarea = this.view.querySelector('#logo-lab-brief');
        this.typeGroup = this.view.querySelector('#logo-lab-type-group');
        this.styleGroup = this.view.querySelector('#logo-lab-style-group');
        this.dimensionalityGroup = this.view.querySelector('#logo-lab-dimensionality-group');
        this.colorsInput = this.view.querySelector('#logo-lab-colors');
        this.backStep2Button = this.view.querySelector('#logo-lab-back-step-2');
        this.generateButton = this.view.querySelector('#logo-lab-generate-button');
        this.resultsGrid = this.view.querySelector('#logo-lab-results-grid');
        this.startOverButton = this.view.querySelector('#logo-lab-start-over-button');
    },

    addEventListeners() {
        this.nextStep1Button?.addEventListener('click', this.handleNextStep.bind(this));
        this.backStep2Button?.addEventListener('click', () => {
            this.state = 'step1';
            this.render();
        });
        this.generateButton?.addEventListener('click', this.handleGenerate.bind(this));
        this.startOverButton?.addEventListener('click', this.handleStartOver.bind(this));
        this.resultsGrid?.addEventListener('click', this.handleGridClick.bind(this));
        [this.typeGroup, this.styleGroup, this.dimensionalityGroup].forEach(group => {
            group?.addEventListener('click', this.handleOptionClick.bind(this));
        });
    },

    handleOptionClick(e: MouseEvent) {
        const target = e.target as HTMLElement;
        const button = target.closest('.toggle-button');
        const group = target.closest('.button-group');
        if (button && group) {
            group.querySelectorAll('.toggle-button').forEach(btn => btn.classList.remove('active'));
            button.classList.add('active');
        }
    },

    render() {
        if (!this.formContainer || !this.resultsStateEl || !this.statusContainer || !this.step1El || !this.step2El) return;
        const isFormVisible = this.state === 'step1' || this.state === 'step2' || this.state === 'generating-brief';
        this.formContainer.style.display = isFormVisible ? 'block' : 'none';
        this.resultsStateEl.style.display = (this.state === 'generating-logos' || this.state === 'results') ? 'block' : 'none';
        this.statusContainer.style.display = (this.state === 'generating-brief' || this.state === 'generating-logos') ? 'flex' : 'none';
        this.step1El.style.display = this.state === 'step1' ? 'block' : 'none';
        this.step2El.style.display = (this.state === 'step2' || this.state === 'generating-brief') ? 'block' : 'none';

        if (this.state === 'generating-brief' && this.statusText) {
            this.statusText.textContent = 'Menganalisis info bisnis Anda...';
            this.nextStep1Button!.disabled = true;
        } else if (this.state === 'generating-logos' && this.statusText) {
            this.statusText.textContent = 'Membuat konsep logo...';
            this.generateButton!.disabled = true;
        } else {
            this.nextStep1Button!.disabled = false;
            this.generateButton!.disabled = false;
        }

        if ((this.state === 'generating-logos' || this.state === 'results') && this.resultsGrid) {
            this.resultsGrid.innerHTML = '';
            this.results.forEach((result, index) => {
                const item = document.createElement('div');
                item.className = 'image-result-item';
                item.dataset.index = String(index);
                if (result.status === 'pending') {
                    item.innerHTML = '<div class="loading-clock"></div>';
                } else if (result.status === 'error') {
                    item.innerHTML = `<p class="pending-status-text">${result.errorMessage}</p>`;
                } else if (result.url) {
                    item.innerHTML = `<img src="${result.url}" alt="Logo concept ${index + 1}">`;
                }
                this.resultsGrid.appendChild(item);
            });
        }
    },

    async handleNextStep() {
        if (!this.businessNameInput?.value.trim() || !this.descriptionInput?.value.trim()) {
            alert('Silakan isi Nama Bisnis dan Deskripsi.');
            return;
        }
        this.state = 'generating-brief';
        this.render();

        try {
            const prompt = `Berdasarkan informasi bisnis berikut, tulis ringkasan merek yang ringkas dan kreatif (maksimal 2-3 kalimat) untuk seorang desainer logo. Fokus pada getaran, nilai, dan audiens.
- Nama Bisnis: ${this.businessNameInput.value}
- Slogan: ${this.sloganInput?.value || 'N/A'}
- Deskripsi: ${this.descriptionInput.value}
- Kata Kunci: ${this.keywordsInput?.value || 'N/A'}`;
            const brief = await generateText(prompt, this.getApiKey);
            this.briefTextarea!.value = brief;
            this.state = 'step2';
        } catch (e) {
            console.error(e);
            this.statusText!.textContent = 'Gagal membuat ringkasan. Silakan coba lagi.';
            this.state = 'step1';
        } finally {
            this.render();
        }
    },

    buildLogoPrompt(): string {
        const getSelectedValue = (group: HTMLDivElement | null) => (group?.querySelector('.toggle-button.active') as HTMLElement)?.dataset.value || '';

        const brief = this.briefTextarea!.value;
        const type = getSelectedValue(this.typeGroup);
        const style = getSelectedValue(this.styleGroup);
        const dimensionality = getSelectedValue(this.dimensionalityGroup);
        const colors = this.colorsInput!.value.trim();

        let prompt = `Buat konsep logo ${dimensionality} profesional. Ini harus berupa ${type} dengan gaya ${style}.`;
        if (this.businessNameInput?.value) {
            prompt += ` Nama bisnis "${this.businessNameInput.value}" harus terintegrasi jika sesuai untuk jenis ${type}.`;
        }
        if (colors) {
            prompt += ` Gunakan palet warna yang terinspirasi oleh: ${colors}.`;
        }
        prompt += ` Ringkasan merek adalah: "${brief}". Logo harus berada pada latar belakang putih bersih, gaya vektor datar, cocok untuk penggunaan perusahaan.`;
        return prompt;
    },

    async handleGenerate() {
        this.state = 'generating-logos';
        const basePrompt = this.buildLogoPrompt();
        this.results = Array(4).fill(0).map(() => ({
            prompt: basePrompt,
            status: 'pending'
        }));
        this.render();

        const generationPromises = this.results.map(async (result, index) => {
            try {
                const imageUrl = await generateImage(result.prompt, this.getApiKey);
                this.results[index] = { ...result,
                    status: 'done',
                    url: imageUrl
                };
            } catch (e: any) {
                this.results[index] = { ...result,
                    status: 'error',
                    errorMessage: parseAndFormatErrorMessage(e, 'Pembuatan logo')
                };
            } finally {
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
        const result = this.results[index];
        if (result?.url) {
            this.showPreviewModal([result.url], 0);
        }
    },

    handleStartOver() {
        this.state = 'step1';
        this.results = [];
        this.businessNameInput!.value = '';
        this.sloganInput!.value = '';
        this.descriptionInput!.value = '';
        this.keywordsInput!.value = '';
        this.briefTextarea!.value = '';
        this.colorsInput!.value = '';
        this.render();
    }
};