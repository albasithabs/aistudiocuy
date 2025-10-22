/* tslint:disable */
/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { blobToDataUrl, downloadFile, parseAndFormatErrorMessage } from "../utils/helpers.ts";
import { generateStyledImage } from "../utils/gemini.ts";

type RetouchState = 'idle' | 'processing' | 'results' | 'error';

export const RetouchAndColorizer = {
    // DOM Elements
    idleStateEl: document.querySelector('#retouch-idle-state') as HTMLDivElement,
    activeStateEl: document.querySelector('#retouch-active-state') as HTMLDivElement,
    fileInput: document.querySelector('#retouch-file-input') as HTMLInputElement,
    originalImage: document.querySelector('#retouch-original-image') as HTMLImageElement,
    originalImageBox: document.querySelector('#retouch-original-image')?.closest('.retouch-image-box') as HTMLDivElement,
    resultBox: document.querySelector('#retouch-result-box') as HTMLDivElement,
    downloadButton: document.querySelector('#retouch-download-button') as HTMLButtonElement,
    startOverButton: document.querySelector('#retouch-start-over-button') as HTMLButtonElement,

    // State
    state: 'idle' as RetouchState,
    sourceImage: null as { dataUrl: string; base64: string; } | null,
    resultImageUrl: null as string | null,
    errorMessage: '',

    // Dependencies
    getApiKey: (() => '') as () => string,
    showPreviewModal: ((urls: (string | null)[], startIndex?: number) => {}) as (urls: (string | null)[], startIndex?: number) => void,

    init(dependencies: { getApiKey: () => string; showPreviewModal: (urls: (string | null)[], startIndex?: number) => void; }) {
        this.getApiKey = dependencies.getApiKey;
        this.showPreviewModal = dependencies.showPreviewModal;
        this.addEventListeners();
        this.render();
    },

    addEventListeners() {
        this.fileInput.addEventListener('change', this.handleUpload.bind(this));
        // The label's `for` attribute handles the click, so no JS listener is needed here.
        // This fixes the "double-click" bug.
        this.downloadButton.addEventListener('click', this.handleDownload.bind(this));
        this.startOverButton.addEventListener('click', this.handleStartOver.bind(this));
        
        // Add click listeners for image preview modal
        if (this.originalImageBox) {
            this.originalImageBox.addEventListener('click', () => this.handleImageClick(0));
        }
        this.resultBox.addEventListener('click', () => this.handleImageClick(1));
    },

    render() {
        this.idleStateEl.style.display = this.state === 'idle' ? 'flex' : 'none';
        this.activeStateEl.style.display = this.state !== 'idle' ? 'block' : 'none';
        
        if (this.state !== 'idle' && this.sourceImage) {
            this.originalImage.src = this.sourceImage.dataUrl;
        }

        switch(this.state) {
            case 'processing':
                this.resultBox.innerHTML = '<div class="loading-clock"></div>';
                this.downloadButton.disabled = true;
                break;
            case 'results':
                if (this.resultImageUrl) {
                    this.resultBox.innerHTML = `<img src="${this.resultImageUrl}" alt="Retouched and colorized image" />`;
                    this.downloadButton.disabled = false;
                }
                break;
            case 'error':
                this.resultBox.innerHTML = `<p class="pending-status-text" style="padding: 1rem;">${this.errorMessage}</p>`;
                this.downloadButton.disabled = true;
                break;
        }
    },

    async handleUpload(e: Event) {
        const file = (e.target as HTMLInputElement).files?.[0];
        if (!file) return;

        try {
            const dataUrl = await blobToDataUrl(file);
            this.sourceImage = {
                dataUrl,
                base64: dataUrl.split(',')[1],
            };
            this.state = 'processing';
            this.render();
            await this.runGeneration();
        } catch (error: any) {
            this.state = 'error';
            this.errorMessage = `Kesalahan memproses file: ${error.message}`;
            this.render();
        }
    },

    async runGeneration() {
        if (!this.sourceImage) return;

        const prompt = "Tolong pulihkan, tingkatkan, dan warnai foto ini secara realistis. Perbaiki kerusakan apa pun seperti goresan, sobekan, atau pudar. Tingkatkan kejernihan, ketajaman, dan rentang dinamis secara keseluruhan. Jika hitam putih, tambahkan warna yang alami dan sesuai secara historis.";

        try {
            const response = await generateStyledImage(this.sourceImage.base64, null, prompt, this.getApiKey);
            const imagePart = response.candidates?.[0]?.content?.parts.find(p => p.inlineData);

            if (imagePart?.inlineData) {
                this.resultImageUrl = `data:${imagePart.inlineData.mimeType};base64,${imagePart.inlineData.data}`;
                this.state = 'results';
            } else {
                const textPart = response.candidates?.[0]?.content?.parts.find(p => p.text);
                throw new Error(textPart?.text || "Tidak ada data gambar dalam respons. Gambar mungkin diblokir karena alasan keamanan.");
            }
        } catch (e: any) {
            console.error("Error during image retouching:", e);
            this.state = 'error';
            this.errorMessage = parseAndFormatErrorMessage(e, 'Pembuatan gambar');
        } finally {
            this.render();
        }
    },

    handleImageClick(startIndex: number) {
        if (!this.sourceImage) return;
    
        if (this.state === 'results' && this.resultImageUrl) {
            // If results are ready, show both images in the modal
            const urls = [this.sourceImage.dataUrl, this.resultImageUrl];
            this.showPreviewModal(urls, startIndex);
        } else {
            // If results are not ready (or failed), only show the original image
            // and ignore clicks on the empty/loading result box
            if (startIndex === 0) {
                this.showPreviewModal([this.sourceImage.dataUrl], 0);
            }
        }
    },

    handleDownload() {
        if (this.resultImageUrl) {
            downloadFile(this.resultImageUrl, 'retouched_image.png');
        }
    },

    handleStartOver() {
        this.state = 'idle';
        this.sourceImage = null;
        this.resultImageUrl = null;
        this.errorMessage = '';
        this.fileInput.value = ''; // Reset file input
        this.render();
    },
};