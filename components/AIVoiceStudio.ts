/* tslint:disable */
/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { withRetry, parseAndFormatErrorMessage } from "../utils/helpers.ts";
import { generateTTS } from "../utils/gemini.ts";

export const AIVoiceStudio = {
    // === DOM Elements ===
    aiVoiceScriptInput: document.querySelector('#ai-voice-script-input') as HTMLTextAreaElement,
    aiVoiceCharCount: document.querySelector('#ai-voice-char-count') as HTMLSpanElement,
    aiVoiceResultContainer: document.querySelector('#ai-voice-result-container') as HTMLDivElement,
    aiVoiceGenderFilter: document.querySelector('#ai-voice-gender-filter') as HTMLDivElement,
    aiVoiceActorList: document.querySelector('#ai-voice-actor-list') as HTMLDivElement,
    aiVoiceVibeGroup: document.querySelector('#ai-voice-vibe-group') as HTMLDivElement,
    aiVoiceSpeedSlider: document.querySelector('#ai-voice-speed-slider') as HTMLInputElement,
    aiVoiceSpeedLabel: document.querySelector('#ai-voice-speed-label') as HTMLSpanElement,
    aiVoiceGenerateButton: document.querySelector('#ai-voice-generate-button') as HTMLButtonElement,

    // === State ===
    voiceActors: [
        { name: 'Zephyr', gender: 'Pria' },
        { name: 'Puck', gender: 'Pria' },
        { name: 'Charon', gender: 'Pria' },
        { name: 'Fenrir', gender: 'Pria' },
        { name: 'Kore', gender: 'Wanita' },
        { name: 'Lyra', gender: 'Wanita' },
        { name: 'Talon', gender: 'Wanita' },
        { name: 'Polly', gender: 'Wanita' },
    ],
    selectedActor: null as string | null,
    currentVoiceAudio: null as HTMLAudioElement | null,

    // === Dependencies ===
    getApiKey: (() => '') as () => string,

    init(dependencies: { getApiKey: () => string }) {
        this.getApiKey = dependencies.getApiKey;
        this.addEventListeners();
        this.renderVoiceActors();
        this.updateVoiceGenerateButton();
    },

    addEventListeners() {
        this.aiVoiceScriptInput.addEventListener('input', () => {
            this.aiVoiceCharCount.textContent = this.aiVoiceScriptInput.value.length.toString();
            this.updateVoiceGenerateButton();
        });

        this.aiVoiceGenderFilter.addEventListener('click', (e) => {
            const target = e.target as HTMLElement;
            const button = target.closest('.toggle-button');
            if (button) {
                this.aiVoiceGenderFilter.querySelectorAll('.toggle-button').forEach(btn => btn.classList.remove('active'));
                button.classList.add('active');
                this.renderVoiceActors((button as HTMLElement).dataset.filter as any);
            }
        });

        this.aiVoiceActorList.addEventListener('click', (e) => {
            const target = e.target as HTMLElement;
            const card = target.closest('.actor-card');
            if (card) {
                this.aiVoiceActorList.querySelectorAll('.actor-card').forEach(c => c.classList.remove('active'));
                card.classList.add('active');
                this.selectedActor = (card as HTMLElement).dataset.name || null;
                this.updateVoiceGenerateButton();
            }
        });

        this.aiVoiceVibeGroup.addEventListener('click', (e) => {
            const target = e.target as HTMLElement;
            const button = target.closest('.toggle-button');
            if (button) {
                this.aiVoiceVibeGroup.querySelectorAll('.toggle-button').forEach(btn => btn.classList.remove('active'));
                button.classList.add('active');
            }
        });

        this.aiVoiceSpeedSlider.addEventListener('input', () => {
            this.aiVoiceSpeedLabel.textContent = `${parseFloat(this.aiVoiceSpeedSlider.value).toFixed(2)}x`;
        });

        this.aiVoiceGenerateButton.addEventListener('click', this.handleGenerateVoiceOver.bind(this));
    },

    renderVoiceActors(filter: 'Semua' | 'Pria' | 'Wanita' = 'Pria') {
        this.aiVoiceActorList.innerHTML = '';
        const filteredActors = filter === 'Semua' ? this.voiceActors : this.voiceActors.filter(actor => actor.gender === filter);
        
        filteredActors.forEach(actor => {
            const card = document.createElement('div');
            card.className = 'actor-card';
            card.dataset.name = actor.name;
            card.innerHTML = `
                <div class="actor-card-header">
                    <h4>${actor.name}</h4>
                    <span class="actor-gender-tag">${actor.gender}</span>
                </div>
                <p style="font-size: 0.8rem; color: var(--color-text-muted);">Pilih aktor ini</p>
            `;
            if (actor.name === this.selectedActor) {
                card.classList.add('active');
            }
            this.aiVoiceActorList.appendChild(card);
        });
    },

    updateVoiceGenerateButton() {
        const hasText = this.aiVoiceScriptInput.value.trim().length > 0;
        this.aiVoiceGenerateButton.disabled = !hasText || !this.selectedActor;
    },

    async handleGenerateVoiceOver() {
        if (this.aiVoiceGenerateButton.disabled) return;

        const script = this.aiVoiceScriptInput.value.trim();
        const actor = this.selectedActor;
        const vibe = (this.aiVoiceVibeGroup.querySelector('.toggle-button.active') as HTMLElement)?.dataset.vibe || 'Promosi';
        const speed = parseFloat(this.aiVoiceSpeedSlider.value);

        this.aiVoiceGenerateButton.disabled = true;
        this.aiVoiceGenerateButton.innerHTML = `<div class="loading-clock" style="width: 20px; height: 20px; margin-right: 0.5rem;"></div> <span>Membuat...</span>`;
        this.aiVoiceResultContainer.innerHTML = `<div class="loading-clock"></div><p>AI sedang merekam suara...</p>`;

        try {
            if (!actor) throw new Error("Aktor suara belum dipilih.");
            
            const audioUrl = await withRetry(
                () => generateTTS(script, actor, this.getApiKey),
                {
                    retries: 2,
                    delayMs: 1000,
                    onRetry: (attempt, err) => console.warn(`TTS generation attempt ${attempt} failed. Retrying...`, err)
                }
            );
            
            if (this.currentVoiceAudio) {
                this.currentVoiceAudio.pause();
                URL.revokeObjectURL(this.currentVoiceAudio.src);
            }

            this.currentVoiceAudio = new Audio(audioUrl);
            this.currentVoiceAudio.controls = true;
            this.aiVoiceResultContainer.innerHTML = '';
            this.aiVoiceResultContainer.appendChild(this.currentVoiceAudio);
            this.currentVoiceAudio.play();

        } catch (e: any) {
            console.error("Error generating TTS:", e);
            const errorMessage = parseAndFormatErrorMessage(e, 'Pembuatan suara');
            this.aiVoiceResultContainer.innerHTML = `<p class="pending-status-text" style="color: #dc3545;">${errorMessage}</p>`;
        } finally {
            this.aiVoiceGenerateButton.disabled = false;
            this.aiVoiceGenerateButton.innerHTML = 'Generate Voice Over';
            this.updateVoiceGenerateButton();
        }
    }
};