/* tslint:disable */
/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import {GenerateContentResponse, GenerateVideosParameters, GoogleGenAI, Modality, Type} from '@google/genai';
// Pastikan pcmToWavUrl dan blobToDataUrl ada di file helpers.js Anda
import { delay, pcmToWavUrl } from './helpers.ts';

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

export async function generateVideoContent(
    prompt: string,
    imageBytes: string,
    model: string,
    getApiKey: () => string,
    updateStatus: (message: string, step?: number) => void,
    resolution?: '720p' | '1080p'
): Promise<string> {
  const ai = new GoogleGenAI({apiKey: getApiKey()});
  const videoGenConfig: any = { numberOfVideos: 1 };
  const config: GenerateVideosParameters = { model, prompt, config: videoGenConfig };
  if (imageBytes) { config.image = { imageBytes, mimeType: 'image/png' }; }
  let operation = await ai.models.generateVideos(config);
  while (!operation.done) {
    await delay(2000);
    operation = await ai.operations.getVideosOperation({operation});
    const progress = (operation as any).metadata?.progress;
    if (progress) {
        const percentage = progress.percentage || 0;
        const message = progress.statusMessage || `Processing... ${Math.round(percentage)}%`;
        updateStatus(message, percentage);
    } else {
        updateStatus('Checking generation status...');
    }
  }
  const videos = operation.response?.generatedVideos;
  if (videos === undefined || videos.length === 0) { throw new Error('No videos were generated. The prompt may have been blocked.'); }
  const videoData = videos[0];
  const url = decodeURIComponent(videoData.video.uri);
  const res = await fetch(`${url}&key=${getApiKey()}`);
  if (!res.ok) { throw new Error(`Failed to fetch video: ${res.status} ${res.statusText}`); }
  const blob = await res.blob();
  return URL.createObjectURL(blob);
}

export async function generateStyledImage(
    sourceImageBytes: string,
    modelImageBytes: string | null,
    prompt: string,
    getApiKey: () => string,
    additionalImages?: { inlineData: { data: string; mimeType: string; } }[]
): Promise<GenerateContentResponse> {
    const ai = new GoogleGenAI({ apiKey: getApiKey() });
    const parts: any[] = [{ inlineData: { data: sourceImageBytes, mimeType: 'image/png' } }];

    if (modelImageBytes) {
        parts.push({ inlineData: { data: modelImageBytes, mimeType: 'image/png' } });
    }

    if (additionalImages && additionalImages.length > 0) {
        parts.push(...additionalImages);
    }
    
    parts.push({ text: prompt });

    return ai.models.generateContent({
        model: 'gemini-2.5-flash-image-preview',
        contents: { parts },
        config: { responseModalities: [Modality.IMAGE, Modality.TEXT] },
    });
}

export async function generateImage(
    prompt: string,
    getApiKey: () => string,
    consistencyImageBytes: string | null = null
): Promise<string> {
    const ai = new GoogleGenAI({ apiKey: getApiKey() });

    if (consistencyImageBytes) {
        // This is an image-to-image task for consistency
        const parts = [
            { inlineData: { data: consistencyImageBytes, mimeType: 'image/png' } },
            { text: prompt }
        ];
        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash-image-preview',
            contents: { parts },
            config: {
                responseModalities: [Modality.IMAGE, Modality.TEXT],
            },
        });
        const imagePart = response.candidates?.[0]?.content?.parts.find(p => p.inlineData);
        if (imagePart?.inlineData) {
            return `data:${imagePart.inlineData.mimeType};base64,${imagePart.inlineData.data}`;
        } else {
            const textPart = response.candidates?.[0]?.content?.parts.find(p => p.text);
            throw new Error(textPart?.text || "No image data in response.");
        }
    } else {
        // This is a text-to-image task, use Imagen
        const response = await ai.models.generateImages({
            model: 'imagen-4.0-generate-001',
            prompt: prompt,
            config: {
                numberOfImages: 1,
                outputMimeType: 'image/png',
            },
        });
        // IMPROVEMENT: Added a check to prevent crashing if no images are returned.
        if (response.generatedImages && response.generatedImages.length > 0) {
            const base64ImageBytes: string = response.generatedImages[0].image.imageBytes;
            return `data:image/png;base64,${base64ImageBytes}`;
        } else {
            throw new Error("The image generation request was blocked or failed to return an image.");
        }
    }
}

export async function generateText(prompt: string, getApiKey: () => string, schema?: any): Promise<string> {
    const ai = new GoogleGenAI({ apiKey: getApiKey() });
    const config: any = {};
    if (schema) {
        config.responseMimeType = "application/json";
        config.responseSchema = schema;
    }

    const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: prompt,
        config: Object.keys(config).length > 0 ? config : undefined,
    });
    return response.text;
}

export async function generateTextFromImage(prompt: string, imageBase64: string, getApiKey: () => string): Promise<string> {
    const ai = new GoogleGenAI({ apiKey: getApiKey() });
    const parts = [
        { inlineData: { data: imageBase64, mimeType: 'image/png' } },
        { text: prompt }
    ];
    const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: { parts },
    });
    return response.text;
}

export async function generateStructuredTextFromImage(prompt: string, imageBase64: string, getApiKey: () => string, schema: any): Promise<string> {
    const ai = new GoogleGenAI({ apiKey: getApiKey() });
    const parts = [
        { inlineData: { data: imageBase64, mimeType: 'image/png' } },
        { text: prompt }
    ];
    const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: { parts },
        config: {
            responseMimeType: "application/json",
            responseSchema: schema,
        },
    });
    return response.text.trim();
}


export async function generateOutdoorThemesForProduct(productDescription: string, getApiKey: () => string): Promise<string[]> {
    const ai = new GoogleGenAI({ apiKey: getApiKey() });
    const prompt = `Berikan 6 tema latar belakang luar ruangan yang sangat berbeda dan kreatif untuk foto produk dari "${productDescription}". Setiap tema harus berupa frasa deskriptif singkat. Contoh: "di atas batu yang tertutup lumut di hutan", "di pantai berpasir dengan ombak yang lembut". Hanya kembalikan daftar tema yang dipisahkan koma, tanpa penomoran atau format tambahan.`;
    const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: prompt,
    });
    const text = response.text;
    return text.split(',').map(theme => theme.trim());
}

export async function generateStoryboard(prompt: string, imageBase64: string | null, getApiKey: () => string): Promise<any> {
    const ai = new GoogleGenAI({ apiKey: getApiKey() });
    
    const sceneSchema = {
        type: Type.OBJECT,
        properties: {
            id: { type: Type.INTEGER },
            title: { type: Type.STRING },
            durationSec: { type: Type.INTEGER },
            shotType: { type: Type.STRING },
            visualDescription: { type: Type.STRING },
            voiceOver: { type: Type.STRING },
            onScreenText: { type: Type.STRING },
            sfxMusic: { type: Type.STRING },
            imagePrompt: { type: Type.STRING },
            safetyNotes: { type: Type.STRING },
        },
    };

    const hookSchema = {
        type: Type.OBJECT,
        properties: {
            text: { type: Type.STRING },
            score: { type: Type.NUMBER },
            reason: { type: Type.STRING },
        },
    };

    const storyboardSchema = {
        type: Type.OBJECT,
        properties: {
            product: {
                type: Type.OBJECT,
                properties: {
                    title: { type: Type.STRING },
                    summary: { type: Type.STRING },
                }
            },
            style: {
                type: Type.OBJECT,
                properties: {
                    vibe: { type: Type.STRING },
                    lighting: { type: Type.STRING },
                    contentType: { type: Type.STRING },
                    aspectRatio: { type: Type.STRING },
                }
            },
            brandTone: { type: Type.STRING },
            durationTotalSec: { type: Type.INTEGER },
            scenes: {
                type: Type.ARRAY,
                items: sceneSchema,
            },
            callToAction: { type: Type.STRING },
            suggestedHooks: {
                type: Type.ARRAY,
                items: hookSchema,
            }
        }
    };

    const parts: any[] = [{ text: prompt }];
    if (imageBase64) {
        parts.unshift({ inlineData: { data: imageBase64, mimeType: 'image/png' } });
    }

    const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: { parts },
        config: {
            responseMimeType: "application/json",
            responseSchema: storyboardSchema,
        }
    });

    const jsonText = response.text.trim();
    return JSON.parse(jsonText);
}

// IMPROVEMENT: Updated the TTS function to match the latest API spec and improve clarity.
export async function generateTTS(textToSpeak: string, voiceName: string, getApiKey: () => string): Promise<string> {
    const ai = new GoogleGenAI({ apiKey: getApiKey() });

    // FIX: The 'generationConfig' parameter is deprecated. TTS configurations are now placed directly within the 'config' object.
    const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash-preview-tts',
        contents: [{ parts: [{ text: textToSpeak }] }],
        config: {
            responseModalities: ["AUDIO"],
            speechConfig: {
                voiceConfig: {
                    prebuiltVoiceConfig: { voiceName: voiceName }
                }
            }
        },
    });

    const audioPart = response.candidates?.[0]?.content?.parts.find(p => p.inlineData);

    if (audioPart?.inlineData?.data) {
        const base64Pcm = audioPart.inlineData.data;
        const mimeType = audioPart.inlineData.mimeType;
        
        // Ensure the response is audio and convert it to a playable WAV format.
        // Assumes pcmToWavUrl helper exists and works correctly.
        if (mimeType.startsWith('audio/')) {
            // The API returns raw PCM data which needs a WAV header to be playable.
            // We assume a 24000 sample rate as that's standard for this model.
            return pcmToWavUrl(base64Pcm, 24000);
        } else {
             throw new Error(`Unexpected MIME type received for audio: ${mimeType}`);
        }
    } else {
        const textPart = response.candidates?.[0]?.content?.parts.find(p => p.text);
        throw new Error(textPart?.text || 'Model did not return any audio data.');
    }
}


export const nutritionSchema = {
    type: Type.OBJECT,
    properties: {
        estimasiKalori: { type: Type.STRING },
        proteinGr: { type: Type.STRING },
        karbohidratGr: { type: Type.STRING },
        lemakGr: { type: Type.STRING },
        potensiAlergen: {
            type: Type.ARRAY,
            items: { type: Type.STRING }
        },
    }
};