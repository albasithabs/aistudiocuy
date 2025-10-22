/* tslint:disable */
/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { withRetry, parseAndFormatErrorMessage, downloadFile } from "../utils/helpers.ts";
import { generateTTS, generateMultiSpeakerTTS } from "../utils/gemini.ts";

export const AIVoiceStudio = {
    // === DOM Elements ===
    aiVoiceScriptInput: document.querySelector('#ai-voice-script-input') as HTMLTextAreaElement,
    aiVoiceCharCount: document.querySelector('#ai-voice-char-count') as HTMLSpanElement,
    aiVoiceResultContainer: document.querySelector('#ai-voice-result-container') as HTMLDivElement,
    
    // Mode
    aiVoiceModeFilter: document.querySelector('#ai-voice-mode-filter') as HTMLDivElement,
    singleSpeakerControls: document.querySelector('#ai-voice-single-speaker-controls') as HTMLDivElement,
    multiSpeakerControls: document.querySelector('#ai-voice-multi-speaker-controls') as HTMLDivElement,
    
    // Single Speaker
    aiVoiceGenderFilter: document.querySelector('#ai-voice-gender-filter') as HTMLDivElement,
    aiVoiceActorList: document.querySelector('#ai-voice-actor-list') as HTMLDivElement,
    aiVoiceVibeGroup: document.querySelector('#ai-voice-vibe-group') as HTMLDivElement,
    aiVoiceSpeedSlider: document.querySelector('#ai-voice-speed-slider') as HTMLInputElement,
    aiVoiceSpeedLabel: document.querySelector('#ai-voice-speed-label') as HTMLSpanElement,

    // Multi Speaker
    speaker1NameInput: document.querySelector('#ai-voice-speaker-1-name') as HTMLInputElement,
    speaker1VoiceSelect: document.querySelector('#ai-voice-speaker-1-voice') as HTMLSelectElement,
    speaker2NameInput: document.querySelector('#ai-voice-speaker-2-name') as HTMLInputElement,
    speaker2VoiceSelect: document.querySelector('#ai-voice-speaker-2-voice') as HTMLSelectElement,

    aiVoiceGenerateButton: document.querySelector('#ai-voice-generate-button') as HTMLButtonElement,

    // === State ===
    voiceActors: [
        { name: 'Zephyr', gender: 'Pria' }, { name: 'Puck', gender: 'Pria' },
        { name: 'Charon', gender: 'Pria' }, { name: 'Fenrir', gender: 'Pria' },
        { name: 'Gacrux', gender: 'Pria' }, { name: 'Orus', gender: 'Pria' },
        { name: 'Kore', gender: 'Wanita' }, { name: 'Leda', gender: 'Wanita' },
        { name: 'Aoede', gender: 'Wanita' }, { name: 'Callirrhoe', gender: 'Wanita' },
        { name: 'Despina', gender: 'Wanita' }, { name: 'Erinome', gender: 'Wanita' },
    ],
    mode: 'single' as 'single' | 'multi',
    selectedActor: null as string | null,
    currentVoiceAudio: null as HTMLAudioElement | null,
    currentSampleAudio: null as HTMLAudioElement | null,
    currentlyPlayingActor: null as string | null,
    playIconSVG: `<svg xmlns="http://www.w3.org/2000/svg" height="20px" viewBox="0 0 24 24" width="20px" fill="currentColor"><path d="M0 0h24v24H0V0z" fill="none"/><path d="M10 16.5l6-4.5-6-4.5v9zM12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8z"/></svg>`,
    stopIconSVG: `<svg xmlns="http://www.w3.org/2000/svg" height="20px" viewBox="0 0 24 24" width="20px" fill="currentColor"><path d="M0 0h24v24H0V0z" fill="none"/><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8zM9 9h6v6H9V9z"/></svg>`,

    // === Dependencies ===
    getApiKey: (() => '') as () => string,

    init(dependencies: { getApiKey: () => string }) {
        const requiredElements = [
            this.aiVoiceScriptInput, this.aiVoiceCharCount, this.aiVoiceResultContainer,
            this.aiVoiceModeFilter, this.singleSpeakerControls, this.multiSpeakerControls,
            this.aiVoiceGenderFilter, this.aiVoiceActorList, this.aiVoiceVibeGroup,
            this.aiVoiceSpeedSlider, this.aiVoiceSpeedLabel, this.aiVoiceGenerateButton,
            this.speaker1NameInput, this.speaker1VoiceSelect, this.speaker2NameInput, this.speaker2VoiceSelect,
        ];

        if (requiredElements.some(el => !el)) {
            console.error("AI Voice Studio initialization failed: One or more required elements are missing from the DOM.");
            return;
        }

        this.getApiKey = dependencies.getApiKey;
        this.addEventListeners();
        this.populateSpeakerSelects();
        this.renderVoiceActors();
        this.updateVoiceGenerateButton();
    },

    addEventListeners() {
        this.aiVoiceScriptInput.addEventListener('input', () => {
            const length = this.aiVoiceScriptInput.value.length;
            this.aiVoiceCharCount.textContent = length.toString();
            
            const charCountWrapper = document.getElementById('ai-voice-char-count-wrapper');
            if(charCountWrapper) {
                if (length > 3000) {
                    charCountWrapper.style.color = '#dc3545'; // Red
                    charCountWrapper.title = 'Naskah terlalu panjang, bisa lambat atau gagal';
                } else if (length > 2000) {
                    charCountWrapper.style.color = '#ffc107'; // Yellow
                    charCountWrapper.title = 'Naskah agak panjang';
                } else {
                    charCountWrapper.style.color = 'var(--color-text-muted)';
                    charCountWrapper.title = '';
                }
            }
            this.updateVoiceGenerateButton();
        });

        this.aiVoiceModeFilter.addEventListener('click', (e) => {
            const button = (e.target as HTMLElement).closest('.toggle-button');
            if (button) {
                this.aiVoiceModeFilter.querySelectorAll('.toggle-button').forEach(btn => btn.classList.remove('active'));
                button.classList.add('active');
                this.mode = (button as HTMLElement).dataset.mode as 'single' | 'multi';
                this.renderMode();
                this.updateVoiceGenerateButton();
            }
        });

        this.aiVoiceGenderFilter.addEventListener('click', (e) => {
            const button = (e.target as HTMLElement).closest('.toggle-button');
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
                this.aiVoiceActorList.querySelectorAll('.actor-card').forEach(c => {
                    c.classList.remove('active');
                    c.setAttribute('aria-selected', 'false');
                });
                card.classList.add('active');
                card.setAttribute('aria-selected', 'true');
                this.selectedActor = (card as HTMLElement).dataset.name || null;
                this.updateVoiceGenerateButton();
            }
        });

        this.aiVoiceVibeGroup.addEventListener('click', (e) => {
            const button = (e.target as HTMLElement).closest('.toggle-button');
            if (button) {
                this.aiVoiceVibeGroup.querySelectorAll('.toggle-button').forEach(btn => btn.classList.remove('active'));
                button.classList.add('active');
            }
        });
        
        this.aiVoiceSpeedSlider.setAttribute('aria-label', 'Kontrol kecepatan suara');
        this.aiVoiceSpeedSlider.setAttribute('aria-valuemin', '0.5');
        this.aiVoiceSpeedSlider.setAttribute('aria-valuemax', '2.0');
        this.aiVoiceSpeedSlider.setAttribute('aria-valuenow', '1.0');

        this.aiVoiceSpeedSlider.addEventListener('input', () => {
            const speed = parseFloat(this.aiVoiceSpeedSlider.value);
            this.aiVoiceSpeedLabel.textContent = `${speed.toFixed(2)}x`;
            this.aiVoiceSpeedSlider.setAttribute('aria-valuenow', speed.toString());
            if (this.currentVoiceAudio) {
                this.currentVoiceAudio.playbackRate = speed;
            }
        });

        [this.speaker1NameInput, this.speaker2NameInput].forEach(input => {
            input.addEventListener('input', () => this.updateVoiceGenerateButton());
        });

        this.aiVoiceGenerateButton.addEventListener('click', this.handleGenerateVoiceOver.bind(this));
    },

    renderMode() {
        const isSingle = this.mode === 'single';
        this.singleSpeakerControls.style.display = isSingle ? 'block' : 'none';
        this.multiSpeakerControls.style.display = isSingle ? 'none' : 'block';

        const scriptPlaceholder = isSingle
            ? "Ketik atau tempel naskah voice over Anda di sini..."
            : "Format naskah percakapan Anda di sini.\nContoh:\nJoe: Halo Jane, apa kabar?\nJane: Baik, Joe! Bagaimana denganmu?";
        this.aiVoiceScriptInput.placeholder = scriptPlaceholder;
    },

    populateSpeakerSelects() {
        [this.speaker1VoiceSelect, this.speaker2VoiceSelect].forEach(select => {
            select.innerHTML = '';
            this.voiceActors.forEach(actor => {
                const option = document.createElement('option');
                option.value = actor.name;
                option.textContent = `${actor.name} (${actor.gender})`;
                select.appendChild(option);
            });
        });
        // Set defaults
        this.speaker1VoiceSelect.value = 'Zephyr';
        this.speaker2VoiceSelect.value = 'Kore';
    },

    renderVoiceActors(filter: 'Semua' | 'Pria' | 'Wanita' = 'Pria') {
        this.aiVoiceActorList.innerHTML = '';
        const filteredActors = filter === 'Semua' ? this.voiceActors : this.voiceActors.filter(actor => actor.gender === filter);
        
        if (this.selectedActor && !filteredActors.some(actor => actor.name === this.selectedActor)) {
            this.selectedActor = null;
            this.updateVoiceGenerateButton();
        }

        filteredActors.forEach(actor => {
            const card = document.createElement('div');
            card.className = 'actor-card';
            card.dataset.name = actor.name;
            card.setAttribute('role', 'option');
            card.setAttribute('aria-selected', 'false');

            if (this.selectedActor === actor.name) {
                card.classList.add('active');
                card.setAttribute('aria-selected', 'true');
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
        if (this.currentSampleAudio) {
            this.currentSampleAudio.pause();
            if (this.currentSampleAudio.src.startsWith('blob:')) {
                URL.revokeObjectURL(this.currentSampleAudio.src);
            }
            const oldButton = this.aiVoiceActorList.querySelector(`[data-actor-name="${this.currentlyPlayingActor}"]`);
            if (oldButton) {
                oldButton.innerHTML = this.playIconSVG;
            }
        }
    
        if (this.currentlyPlayingActor === actorName) {
            this.currentSampleAudio = null;
            this.currentlyPlayingActor = null;
            buttonEl.innerHTML = this.playIconSVG;
            return;
        }
    
        this.currentlyPlayingActor = actorName;
        buttonEl.disabled = true;
        buttonEl.innerHTML = `<div class="loading-clock"></div>`;
    
        try {
            const sampleText = "Halo, ini adalah contoh suara saya. Anda dapat memilih saya untuk proyek Anda.";
            const speed = parseFloat(this.aiVoiceSpeedSlider.value);
            
            const audioUrl = await generateTTS({
                text: sampleText,
                voiceName: actorName,
                speakingRate: speed,
            });
            
            buttonEl.innerHTML = this.stopIconSVG;
            buttonEl.disabled = false;

            this.currentSampleAudio = new Audio(audioUrl);
            this.currentSampleAudio.play();
            
            this.currentSampleAudio.addEventListener('ended', () => {
                buttonEl.innerHTML = this.playIconSVG;
                if (this.currentlyPlayingActor === actorName) {
                    this.currentlyPlayingActor = null;
                    if (this.currentSampleAudio && this.currentSampleAudio.src.startsWith('blob:')) {
                        URL.revokeObjectURL(this.currentSampleAudio.src);
                    }
                    this.currentSampleAudio = null;
                }
            }, { once: true });
    
        } catch (e) {
            console.error(`Failed to play voice sample for ${actorName}:`, e);
            buttonEl.innerHTML = this.playIconSVG;
            this.currentlyPlayingActor = null;
            buttonEl.disabled = false;
        }
    },

    updateVoiceGenerateButton() {
        const hasText = this.aiVoiceScriptInput.value.trim().length > 0;
        let isReady = false;
        if (this.mode === 'single') {
            isReady = hasText && !!this.selectedActor;
        } else {
            const hasSpeaker1 = this.speaker1NameInput.value.trim().length > 0;
            const hasSpeaker2 = this.speaker2NameInput.value.trim().length > 0;
            isReady = hasText && hasSpeaker1 && hasSpeaker2;
        }
        this.aiVoiceGenerateButton.disabled = !isReady;
    },

    async handleGenerateVoiceOver() {
        if (this.aiVoiceGenerateButton.disabled) return;

        this.aiVoiceGenerateButton.disabled = true;
        this.aiVoiceGenerateButton.innerHTML = `<div class="loading-clock" style="width: 20px; height: 20px; margin-right: 0.5rem;"></div> <span>Membuat...</span>`;
        this.aiVoiceResultContainer.innerHTML = `<div class="loading-clock"></div><p>AI sedang merekam suara...</p>`;

        try {
            const audioUrl = this.mode === 'single' 
                ? await this.generateSingleVoice() 
                : await this.generateMultiVoice();
            
            if (this.currentVoiceAudio) {
                this.currentVoiceAudio.pause();
                if (this.currentVoiceAudio.src.startsWith('blob:')) {
                    URL.revokeObjectURL(this.currentVoiceAudio.src);
                }
                this.currentVoiceAudio = null;
            }

            this.currentVoiceAudio = new Audio(audioUrl);
            this.currentVoiceAudio.controls = true;
            this.currentVoiceAudio.playbackRate = this.mode === 'single' ? parseFloat(this.aiVoiceSpeedSlider.value) : 1.0;
            
            const downloadButton = document.createElement('button');
            downloadButton.className = 'icon-button';
            downloadButton.title = 'Unduh Audio';
            downloadButton.setAttribute('aria-label', 'Unduh audio yang dihasilkan');
            downloadButton.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" height="24px" viewBox="0 0 24 24" width="24px" fill="currentColor"><path d="M0 0h24v24H0V0z" fill="none"/><path d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z"/></svg>`;
            downloadButton.addEventListener('click', () => downloadFile(audioUrl, 'voice-over.wav'));

            this.aiVoiceResultContainer.innerHTML = '';
            const wrapper = document.createElement('div');
            wrapper.style.display = 'flex';
            wrapper.style.alignItems = 'center';
            wrapper.style.gap = '1rem';
            wrapper.style.width = '100%';
            
            wrapper.appendChild(this.currentVoiceAudio);
            wrapper.appendChild(downloadButton);
            this.aiVoiceResultContainer.appendChild(wrapper);

            this.currentVoiceAudio.play();

        } catch (e: any) {
            console.error("Error generating TTS:", e);
            const errorMessage = parseAndFormatErrorMessage(e, 'Pembuatan suara');
            this.aiVoiceResultContainer.innerHTML = `<p class="pending-status-text" style="color: #dc3545;">${errorMessage}</p>`;
        } finally {
            this.aiVoiceGenerateButton.innerHTML = 'Generate Voice Over';
            this.updateVoiceGenerateButton();
        }
    },

    async generateSingleVoice(): Promise<string> {
        const script = this.aiVoiceScriptInput.value.trim();
        const actor = this.selectedActor;
        const selectedVibeBtn = this.aiVoiceVibeGroup.querySelector('.toggle-button.active');
        const vibe = (selectedVibeBtn as HTMLElement)?.dataset.vibe || 'Promosi';
        
        let modifiedScript = script;
        const vibePrompts: { [key: string]: string } = {
            'Ceria': 'Katakan dengan nada ceria dan bersemangat:',
            'Tegas': 'Katakan dengan nada tegas dan berwibawa:',
            'Tenang': 'Katakan dengan nada tenang dan menenangkan:',
            'Sedih': 'Katakan dengan nada sedih dan melankolis:',
            'Pencerita': 'Katakan dengan nada bercerita yang menarik:',
            'Profesional': 'Katakan dengan nada profesional dan jelas:',
            'Bisikan': 'Katakan dengan nada berbisik dan lembut:',
            'Energik': 'Katakan dengan nada yang sangat energik dan antusias:',
            'Berwibawa': 'Katakan dengan nada yang dalam dan berwibawa:',
        };

        if (vibePrompts[vibe]) {
            modifiedScript = `${vibePrompts[vibe]} ${script}`;
        }
        
        if (!actor) throw new Error("Aktor suara belum dipilih.");
        
        const speed = parseFloat(this.aiVoiceSpeedSlider.value);

        return await withRetry(
            () => generateTTS({
                text: modifiedScript,
                voiceName: actor,
                speakingRate: speed,
            }),
            {
                retries: 2,
                delayMs: 1000,
                onRetry: (attempt, err) => console.warn(`TTS generation attempt ${attempt} failed. Retrying...`, err)
            }
        );
    },

    async generateMultiVoice(): Promise<string> {
        const script = this.aiVoiceScriptInput.value.trim();
        const speaker1Name = this.speaker1NameInput.value.trim();
        const speaker2Name = this.speaker2NameInput.value.trim();

        if (!script.includes(`${speaker1Name}:`) || !script.includes(`${speaker2Name}:`)) {
            throw new Error(`Naskah harus berisi nama pembicara yang cocok ("${speaker1Name}:" dan "${speaker2Name}:").`);
        }
        
        return await withRetry(
            () => generateMultiSpeakerTTS({
                text: `TTS percakapan berikut antara ${speaker1Name} dan ${speaker2Name}:\n${script}`,
                speaker_1_name: speaker1Name,
                speaker_1_voice: this.speaker1VoiceSelect.value,
                speaker_2_name: speaker2Name,
                speaker_2_voice: this.speaker2VoiceSelect.value,
            }),
            {
                retries: 2,
                delayMs: 1000,
                onRetry: (attempt, err) => console.warn(`Multi-TTS generation attempt ${attempt} failed. Retrying...`, err)
            }
        );
    }
};