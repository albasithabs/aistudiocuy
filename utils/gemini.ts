/* tslint:disable */
/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import {GenerateContentResponse, GenerateVideosParameters, GoogleGenAI, Modality, Type} from '@google/genai';
// Pastikan pcmToWavUrl dan blobToDataUrl ada di file helpers.js Anda
import { delay, pcmToWavUrl } from './helpers.ts';

// Helper to initialize the API
function getGoogleGenAI(apiKey: string): GoogleGenAI {
    return new GoogleGenAI({ apiKey });
}

export async function validateApiKey(apiKey: string): Promise<boolean> {
    if (!apiKey) return false;
    
    // Menggunakan panggilan REST API langsung untuk validasi yang lebih ketat.
    // Ini mencegah SDK melakukan fallback ke kunci lingkungan secara diam-diam.
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;
    
    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                contents: [{ parts: [{ text: "hello" }] }]
            }),
        });
        // Kunci yang valid akan mengembalikan status 200.
        // Kunci yang tidak valid akan mengembalikan 400 atau 403.
        return response.ok;
    } catch (error) {
        // Kesalahan jaringan atau lainnya juga berarti validasi gagal.
        console.error("API Key validation fetch error:", error);
        return false;
    }
}

export async function generateText(prompt: string, apiKey: string, responseSchema?: any): Promise<string> {
    const ai = getGoogleGenAI(apiKey);
    const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: prompt,
        config: {
            responseMimeType: responseSchema ? "application/json" : undefined,
            responseSchema: responseSchema,
        },
    });
    return response.text;
}

export async function generateTextFromImage(prompt: string, imageBase64: string, apiKey: string): Promise<string> {
    const ai = getGoogleGenAI(apiKey);
    const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: {
            parts: [
                { inlineData: { mimeType: 'image/png', data: imageBase64 } },
                { text: prompt }
            ]
        }
    });
    return response.text;
}

export async function generateStructuredTextFromImage(prompt: string, imageBase64: string, apiKey: string, responseSchema: any): Promise<string> {
    const ai = getGoogleGenAI(apiKey);
    const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: {
            parts: [
                { inlineData: { mimeType: 'image/png', data: imageBase64 } },
                { text: prompt }
            ]
        },
        config: {
            responseMimeType: 'application/json',
            responseSchema: responseSchema,
        },
    });
    return response.text;
}

export async function generateImage(prompt: string, apiKey: string, aspectRatio: string = "1:1"): Promise<string> {
    const ai = getGoogleGenAI(apiKey);
    const response = await ai.models.generateImages({
        model: 'imagen-4.0-generate-001',
        prompt: prompt,
        config: {
            numberOfImages: 1,
            outputMimeType: 'image/png',
            aspectRatio: aspectRatio as any,
        },
    });
    const base64ImageBytes = response.generatedImages[0].image.imageBytes;
    return `data:image/png;base64,${base64ImageBytes}`;
}

export async function generateStyledImage(mainImageBase64: string, modelImageBase64: string | null, prompt: string, apiKey: string, additionalImages?: any[]): Promise<GenerateContentResponse> {
    const ai = getGoogleGenAI(apiKey);
    const parts: any[] = [
        { inlineData: { mimeType: 'image/png', data: mainImageBase64 } },
        { text: prompt }
    ];

    if (modelImageBase64) {
        parts.unshift({ inlineData: { mimeType: 'image/png', data: modelImageBase64 } });
    }
    if (additionalImages) {
        parts.push(...additionalImages);
    }
    
    return await ai.models.generateContent({
        model: 'gemini-2.5-flash-image',
        contents: { parts },
        config: {
            responseModalities: [Modality.IMAGE],
        },
    });
}

// FIX: Removed apiKey from options and use new GoogleGenAI({}) for TTS model.
export async function generateTTS(options: { text: string, voiceName: string, speakingRate?: number }): Promise<string> {
    const { text, voiceName, speakingRate } = options;
    const ai = new GoogleGenAI({});
    const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash-preview-tts',
        contents: [{ parts: [{ text }] }],
        config: {
            responseModalities: [Modality.AUDIO],
            speechConfig: {
                voiceConfig: {
                    prebuiltVoiceConfig: {
                        voiceName,
                    },
                },
                // FIX: `speakingRate` should be at speechConfig level, not inside voiceConfig.
                speakingRate: speakingRate,
            },
        },
    });
    const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
    if (!base64Audio) {
        throw new Error("No audio data returned from TTS API.");
    }
    return pcmToWavUrl(base64Audio);
}

// FIX: Removed apiKey from options and use new GoogleGenAI({}) for TTS model.
export async function generateMultiSpeakerTTS(options: { text: string, speaker_1_name: string, speaker_1_voice: string, speaker_2_name: string, speaker_2_voice: string }): Promise<string> {
    const { text, speaker_1_name, speaker_1_voice, speaker_2_name, speaker_2_voice } = options;
    const ai = new GoogleGenAI({});
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash-preview-tts",
      contents: [{ parts: [{ text: text }] }],
      config: {
        responseModalities: [Modality.AUDIO],
        speechConfig: {
            multiSpeakerVoiceConfig: {
              speakerVoiceConfigs: [
                    {
                        speaker: speaker_1_name,
                        voiceConfig: {
                          prebuiltVoiceConfig: { voiceName: speaker_1_voice }
                        }
                    },
                    {
                        speaker: speaker_2_name,
                        voiceConfig: {
                          prebuiltVoiceConfig: { voiceName: speaker_2_voice }
                        }
                    }
              ]
            }
        }
      }
    });
    const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
    if (!base64Audio) {
        throw new Error("No audio data returned from TTS API.");
    }
    return pcmToWavUrl(base64Audio);
}


export const nutritionSchema = {
    type: Type.OBJECT,
    properties: {
        estimasiKalori: { type: Type.NUMBER },
        proteinGr: { type: Type.NUMBER },
        karbohidratGr: { type: Type.NUMBER },
        lemakGr: { type: Type.NUMBER },
        potensiAlergen: { type: Type.ARRAY, items: { type: Type.STRING } }
    }
};

export async function generateStoryboard(prompt: string, imageBase64: string | null, apiKey: string): Promise<any> {
    const ai = getGoogleGenAI(apiKey);
    const parts: any[] = [{ text: prompt }];
    if (imageBase64) {
        parts.unshift({ inlineData: { mimeType: 'image/png', data: imageBase64 } });
    }
    const storyboardSchema = {
        type: Type.OBJECT,
        properties: {
            product: {
                type: Type.OBJECT,
                properties: {
                    title: { type: Type.STRING },
                    summary: { type: Type.STRING },
                },
            },
            style: {
                type: Type.OBJECT,
                properties: {
                    vibe: { type: Type.STRING },
                    lighting: { type: Type.STRING },
                    contentType: { type: Type.STRING },
                    aspectRatio: { type: Type.STRING },
                },
            },
            brandTone: { type: Type.STRING },
            durationTotalSec: { type: Type.NUMBER },
            scenes: {
                type: Type.ARRAY,
                items: {
                    type: Type.OBJECT,
                    properties: {
                        id: { type: Type.NUMBER },
                        title: { type: Type.STRING },
                        durationSec: { type: Type.NUMBER },
                        shotType: { type: Type.STRING },
                        visualDescription: { type: Type.STRING },
                        voiceOver: { type: Type.STRING },
                        onScreenText: { type: Type.STRING },
                        sfxMusic: { type: Type.STRING },
                        imagePrompt: { type: Type.STRING },
                        safetyNotes: { type: Type.STRING },
                    },
                },
            },
            callToAction: { type: Type.STRING },
            suggestedHooks: {
                type: Type.ARRAY,
                items: {
                    type: Type.OBJECT,
                    properties: {
                        text: { type: Type.STRING },
                        score: { type: Type.NUMBER },
                        reason: { type: Type.STRING },
                    },
                },
            },
        },
    };
    
    const response = await ai.models.generateContent({
        model: 'gemini-2.5-pro', // Complex task, use Pro
        contents: { parts },
        config: {
            responseMimeType: "application/json",
            responseSchema: storyboardSchema,
        },
    });
    
    return JSON.parse(response.text);
}


export async function generateVideoContent(
    prompt: string,
    imageBytes: string,
    model: string,
    apiKey: string,
    onStatusUpdate: (message: string) => void,
    aspectRatio: string = '16:9'
): Promise<string> {
    const ai = getGoogleGenAI(apiKey);
    const request: GenerateVideosParameters = {
        model,
        prompt,
        config: {
            numberOfVideos: 1,
            resolution: '720p',
            aspectRatio: aspectRatio as any,
        },
    };
    if (imageBytes) {
        request.image = {
            imageBytes,
            mimeType: 'image/png',
        };
    }
    
    onStatusUpdate('Mengirim permintaan video...');
    let operation = await ai.models.generateVideos(request);
    
    onStatusUpdate('Video sedang diproses...');
    while (!operation.done) {
        await delay(5000); // Poll every 5 seconds
        try {
            operation = await ai.operations.getVideosOperation({ operation });
            const progress = operation.metadata?.progressPercent;
// FIX: The 'progress' variable is of type 'unknown'. Add a 'typeof' check to ensure it's a number before calling 'toFixed'.
            if (typeof progress === 'number') {
                onStatusUpdate(`Memproses... ${progress.toFixed(0)}%`);
            } else {
                onStatusUpdate('Memproses...');
            }
        } catch(e) {
            console.error("Error polling video operation:", e);
            // Don't rethrow, let it try again on the next loop
        }
    }
    
    onStatusUpdate('Mengambil video...');
    const downloadLink = operation.response?.generatedVideos?.[0]?.video?.uri;
    if (!downloadLink) {
        throw new Error('Video generation finished, but no download link was provided.');
    }

    const response = await fetch(`${downloadLink}&key=${apiKey}`);
    if (!response.ok) {
        throw new Error(`Failed to download video: ${response.statusText}`);
    }
    
    const videoBlob = await response.blob();
    return URL.createObjectURL(videoBlob);
}