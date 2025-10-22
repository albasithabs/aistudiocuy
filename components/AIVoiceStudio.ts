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
        { name: 'Gacrux', gender: 'Pria' },
        { name: 'Orus', gender: 'Pria' },
        { name: 'Kore', gender: 'Wanita' },
        { name: 'Leda', gender: 'Wanita' },
        { name: 'Aoede', gender: 'Wanita' },
        { name: 'Callirrhoe', gender: 'Wanita' },
        { name: 'Despina', gender: 'Wanita' },
        { name: 'Erinome', gender: 'Wanita' },
    ],
    selectedActor: null as string | null,
    currentVoiceAudio: null as HTMLAudioElement | null,
    actorSampleCache: {} as { [key: string]: string },
    currentSampleAudio: null as HTMLAudioElement | null,
    currentlyPlayingActor: null as string | null,
    playIconSVG: `<svg xmlns="http://www.w3.org/2000/svg" height="20px" viewBox="0 0 24 24" width="20px" fill="currentColor"><path d="M0 0h24v24H0V0z" fill="none"/><path d="M10 16.5l6-4.5-6-4.5v9zM12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8z"/></svg>`,
    stopIconSVG: `<svg xmlns="http://www.w3.org/2000/svg" height="20px" viewBox="0 0 24 24" width="20px" fill="currentColor"><path d="M0 0h24v24H0V0z" fill="none"/><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8zM9 9h6v6H9V9z"/></svg>`,

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
            const playButton = target.closest('.actor-play-button');
            const card = target.closest('.actor-card');

            if (playButton) {
                e.stopPropagation();
                const actorName = (playButton as HTMLElement).dataset.actorName;
                if (actorName) {
                    this.handlePreviewVoice(actorName, playButton as HTMLButtonElement);
                }
                return;
            }
            
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
        
        // BUG FIX: If the selected actor is filtered out, clear the selection state.
        if (this.selectedActor && !filteredActors.some(actor => actor.name === this.selectedActor)) {
            this.selectedActor = null;
            this.updateVoiceGenerateButton();
        }

        filteredActors.forEach(actor => {
            const card = document.createElement('div');
            card.className = 'actor-card';
            card.dataset.name = actor.name;

            const isSelected = this.selectedActor === actor.name;
            if (isSelected) {
                card.classList.add('active');
            }

            const isPlaying = this.currentlyPlayingActor === actor.name;

            card.innerHTML = `
                <div class="actor-card-header">
                    <h4>${actor.name}</h4>
                    <div class="actor-card-actions">
                         <button class="icon-button actor-play-button" data-actor-name="${actor.name}" title="Pratinjau Suara">
                            ${isPlaying ? this.stopIconSVG : this.playIconSVG}
                        </button>
                    </div>
                </div>
                <div class="actor-card-meta">
                     <span class="actor-gender-tag">${actor.gender}</span>
                </div>
            `;
            this.aiVoiceActorList.appendChild(card);
        });
    },

    async handlePreviewVoice(actorName: string, buttonEl: HTMLButtonElement) {
        // Stop any currently playing sample and reset its button
        if (this.currentSampleAudio) {
            this.currentSampleAudio.pause();
            this.currentSampleAudio = null;
            const oldButton = this.aiVoiceActorList.querySelector(`[data-actor-name="${this.currentlyPlayingActor}"]`);
            if (oldButton) {
                oldButton.innerHTML = this.playIconSVG;
            }
        }
    
        // If the clicked actor was the one playing, we just stop it and we're done.
        if (this.currentlyPlayingActor === actorName) {
            this.currentlyPlayingActor = null;
            return;
        }
    
        // --- Start playing the new one ---
        this.currentlyPlayingActor = actorName;
        buttonEl.disabled = true;
        buttonEl.innerHTML = `<div class="loading-clock"></div>`;
    
        try {
            let sampleUrl = this.actorSampleCache[actorName];
            if (!sampleUrl) {
                const sampleText = "Halo, ini adalah contoh suara saya. Anda dapat memilih saya untuk proyek Anda.";
                sampleUrl = await generateTTS(sampleText, actorName, this.getApiKey);
                this.actorSampleCache[actorName] = sampleUrl;
            }
    
            buttonEl.innerHTML = this.stopIconSVG;
            this.currentSampleAudio = new Audio(sampleUrl);
            this.currentSampleAudio.play();
            this.currentSampleAudio.addEventListener('ended', () => {
                buttonEl.innerHTML = this.playIconSVG;
                this.currentlyPlayingActor = null;
                this.currentSampleAudio = null;
            }, { once: true });
    
        } catch (e) {
            console.error(`Failed to play voice sample for ${actorName}:`, e);
            buttonEl.innerHTML = this.playIconSVG;
            this.currentlyPlayingActor = null;
        } finally {
            buttonEl.disabled = false;
        }
    },

    updateVoiceGenerateButton() {
        const hasText = this.aiVoiceScriptInput.value.trim().length > 0;
        this.aiVoiceGenerateButton.disabled = !hasText || !this.selectedActor;
    },

    async handleGenerateVoiceOver() {
        if (this.aiVoiceGenerateButton.disabled) return;

        const script = this.aiVoiceScriptInput.value.trim();
        const actor = this.selectedActor;
        
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
            
            // Adjust playback speed
            this.currentVoiceAudio.playbackRate = parseFloat(this.aiVoiceSpeedSlider.value);

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