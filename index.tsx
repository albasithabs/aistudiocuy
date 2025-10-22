/* tslint:disable */
/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { CreativeStudio } from './components/ProductShotPro.ts';
import { AdStudio } from './components/AdStudio.ts';
import { RetouchAndColorizer } from './components/RetouchAndColorizer.ts';
import { FoodStylist } from './components/FoodStylist.ts';
import { Stickerrr } from './components/Stickerrr.ts';
import { AIVoiceStudio } from './components/AIVoiceStudio.ts';
import { PhotoStudio } from './components/PhotoStudio.ts';
import { InteriorDesigner } from './components/InteriorDesigner.ts';
import { LogoLab } from './components/LogoLab.ts';
import { ModelCreative } from './components/ModelCreative.ts';
import { OutfitPro } from './components/OutfitPro.ts';
import { PosterPro } from './components/PosterX.ts';

import { delay, downloadFile, parseAndFormatErrorMessage } from './utils/helpers.ts';
import { validateApiKey } from './utils/gemini.ts';

// === DOM Elements ===
const appContainer = document.querySelector('.app-container') as HTMLDivElement;
// Image Preview Modal
const imagePreviewModal = document.querySelector('#image-preview-modal') as HTMLDivElement;
const modalImageContainer = document.querySelector('#modal-image-container') as HTMLDivElement;
const modalPreviewImage = document.querySelector('#modal-preview-image') as HTMLImageElement;
const modalPreviewVideo = document.querySelector('#modal-preview-video') as HTMLVideoElement;
const modalPreviewCloseButton = document.querySelector('#modal-preview-close-button') as HTMLButtonElement;
const modalPrevButton = document.querySelector('#modal-prev-button') as HTMLButtonElement;
const modalNextButton = document.querySelector('#modal-next-button') as HTMLButtonElement;
const modalZoomControls = document.querySelector('.modal-zoom-controls') as HTMLDivElement;
const modalZoomInButton = document.querySelector('#modal-zoom-in-button') as HTMLButtonElement;
const modalZoomOutButton = document.querySelector('#modal-zoom-out-button') as HTMLButtonElement;
const modalZoomResetButton = document.querySelector('#modal-zoom-reset-button') as HTMLButtonElement;
const modalImageCounter = document.querySelector('#modal-image-counter') as HTMLSpanElement;
const modalDownloadEditedButton = document.querySelector('#modal-download-edited-button') as HTMLButtonElement;
const modalFilterButtons = document.querySelector('#modal-filter-buttons') as HTMLDivElement;
// Sidebar
const sidebar = document.getElementById('sidebar') as HTMLElement;
const sidebarToggleButton = document.getElementById('sidebar-toggle') as HTMLButtonElement;
const sidebarOverlay = document.getElementById('sidebar-overlay') as HTMLDivElement;
const sidebarLinks = document.querySelectorAll('.sidebar-link');
// Header
const featureGuideButton = document.querySelector('#feature-guide-button') as HTMLButtonElement;
// API Key Modal
const premiumKeyButton = document.querySelector('#premium-key-button') as HTMLButtonElement;
const apiKeyStatusIndicator = document.querySelector('#api-key-status-indicator') as HTMLSpanElement;
const apiKeyModal = document.querySelector('#api-key-modal') as HTMLDivElement;
const apiKeyInput = document.querySelector('#api-key-input') as HTMLInputElement;
const apiKeySaveButton = document.querySelector('#api-key-save-button') as HTMLButtonElement;
const apiKeyClearButton = document.querySelector('#api-key-clear-button') as HTMLButtonElement;
const apiKeyCancelButton = document.querySelector('#api-key-cancel-button') as HTMLButtonElement;
const apiKeyModalCloseButton = document.querySelector('#api-key-modal-close-button') as HTMLButtonElement;
const apiKeyModalStatus = document.querySelector('#api-key-modal-status') as HTMLParagraphElement;
// Theme switcher
const themeToggle = document.querySelector('#theme-toggle') as HTMLInputElement;
const toastContainer = document.querySelector('#toast-container') as HTMLDivElement;

// === App State ===
let currentView = 'ad-studio-view';
let premiumApiKey = localStorage.getItem('gemini_api_key') || '';
let currentModalImages: (string | null)[] = [];
let currentModalIndex = 0;
let modalImageElement: HTMLImageElement | HTMLVideoElement;
let zoom = 1;
let panX = 0;
let panY = 0;
let isPanning = false;
let panStartX = 0;
let panStartY = 0;

// === Helper Functions ===
function getApiKey(): string {
    return premiumApiKey || (window as any).process.env.API_KEY;
}

function showToast(message: string, type: 'success' | 'error' | 'info' = 'success') {
    const toast = document.createElement('div');
    toast.className = `toast-notification ${type}`;
    if (type === 'error') {
        toast.classList.add('error');
    }
    toast.textContent = message;
    toastContainer.appendChild(toast);
    setTimeout(() => {
        toast.remove();
    }, 3000);
}

// === View Management ===
function switchView(viewId: string) {
    document.querySelectorAll('.view').forEach(view => {
        (view as HTMLElement).classList.remove('active');
    });
    document.getElementById(viewId)?.classList.add('active');
    
    sidebarLinks.forEach(link => {
        link.classList.toggle('active', (link as HTMLElement).dataset.view === viewId);
    });

    const activeLink = document.querySelector(`.sidebar-link[data-view="${viewId}"]`);
    if (activeLink) {
        const title = activeLink.querySelector('span')?.textContent || 'FLUXIO';
        document.title = `${title} - FLUXIO`;
    }

    currentView = viewId;
    document.body.classList.remove('sidebar-open');
}

// === Modal Management ===
function showPreviewModal(imageUrls: (string | null)[], startIndex = 0) {
    currentModalImages = imageUrls.filter((url): url is string => !!url);
    if (currentModalImages.length === 0) return;

    currentModalIndex = startIndex < currentModalImages.length ? startIndex : 0;
    
    updateModalContent();
    imagePreviewModal.style.display = 'flex';
}

function updateModalContent() {
    // BUG FIX: Pause the currently playing video before switching to the next item.
    // This prevents multiple audio tracks from playing simultaneously.
    if (modalImageElement instanceof HTMLVideoElement && !modalImageElement.paused) {
        modalImageElement.pause();
    }

    const url = currentModalImages[currentModalIndex];
    const isVideo = url.startsWith('blob:') || url.endsWith('.mp4');

    modalPreviewImage.style.display = isVideo ? 'none' : 'block';
    modalPreviewVideo.style.display = isVideo ? 'block' : 'none';
    modalImageElement = isVideo ? modalPreviewVideo : modalPreviewImage;
    
    modalImageContainer.innerHTML = '<div class="loading-clock"></div>';

    // FIX: Race condition. Set onload/onloadeddata BEFORE setting src.
    modalImageElement.onload = modalImageElement.onloadeddata = () => {
       modalImageContainer.innerHTML = '';
       modalImageContainer.appendChild(modalImageElement);
    };

    modalImageElement.src = url;
    if (isVideo) {
        (modalImageElement as HTMLVideoElement).play();
    }
    
    // Update controls
    modalPrevButton.style.display = currentModalImages.length > 1 ? 'block' : 'none';
    modalNextButton.style.display = currentModalImages.length > 1 ? 'block' : 'none';
    modalImageCounter.textContent = `${currentModalIndex + 1} / ${currentModalImages.length}`;
    modalImageCounter.style.display = currentModalImages.length > 1 ? 'block' : 'none';
    
    resetZoomAndPan();
}

function closeModal() {
    imagePreviewModal.style.display = 'none';
    if (modalImageElement instanceof HTMLVideoElement) {
        modalImageElement.pause();
    }
    currentModalImages = [];
    // Reset filters when closing
    modalImageElement.style.filter = 'none';
    modalFilterButtons.querySelectorAll('.toggle-button').forEach(btn => btn.classList.remove('active'));
    (modalFilterButtons.querySelector('[data-filter="none"]') as HTMLElement).classList.add('active');
}

function showNextImage() {
    currentModalIndex = (currentModalIndex + 1) % currentModalImages.length;
    updateModalContent();
}

function showPrevImage() {
    currentModalIndex = (currentModalIndex - 1 + currentModalImages.length) % currentModalImages.length;
    updateModalContent();
}

function applyZoomAndPan() {
    modalImageElement.style.transform = `scale(${zoom}) translate(${panX}px, ${panY}px)`;
}

function resetZoomAndPan() {
    zoom = 1;
    panX = 0;
    panY = 0;
    applyZoomAndPan();
}

// === Main App Initialization ===
document.addEventListener('DOMContentLoaded', () => {
    // --- Global Initializers ---
    // Sidebar navigation
    sidebarLinks.forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            const viewId = (e.currentTarget as HTMLElement).dataset.view;
            if (viewId) switchView(viewId);
        });
    });

    sidebarToggleButton.addEventListener('click', () => document.body.classList.toggle('sidebar-open'));
    sidebarOverlay.addEventListener('click', () => document.body.classList.remove('sidebar-open'));

    // Header Actions
    featureGuideButton.addEventListener('click', () => switchView('feature-guide-view'));

    // API Key Modal
    premiumKeyButton.addEventListener('click', () => apiKeyModal.style.display = 'flex');
    [apiKeyCancelButton, apiKeyModalCloseButton].forEach(btn => btn.addEventListener('click', () => apiKeyModal.style.display = 'none'));
    
    apiKeySaveButton.addEventListener('click', async () => {
        const key = apiKeyInput.value.trim();
        apiKeyModalStatus.textContent = 'Memvalidasi...';
        const isValid = await validateApiKey(key);
        if (isValid) {
            premiumApiKey = key;
            localStorage.setItem('gemini_api_key', key);
            apiKeyModalStatus.textContent = 'Kunci API valid dan disimpan!';
            apiKeyStatusIndicator.classList.add('active');
            await delay(1000);
            apiKeyModal.style.display = 'none';
        } else {
            apiKeyModalStatus.textContent = 'Kunci API tidak valid.';
            apiKeyStatusIndicator.classList.remove('active');
        }
    });

    apiKeyClearButton.addEventListener('click', () => {
        premiumApiKey = '';
        localStorage.removeItem('gemini_api_key');
        apiKeyInput.value = '';
        apiKeyStatusIndicator.classList.remove('active');
        apiKeyModalStatus.textContent = 'Kunci API dihapus.';
    });

    if (premiumApiKey) apiKeyStatusIndicator.classList.add('active');

    // Theme Switcher
    themeToggle.addEventListener('change', () => {
        document.body.classList.toggle('light-mode', themeToggle.checked);
        localStorage.setItem('theme', themeToggle.checked ? 'light' : 'dark');
    });
    if (localStorage.getItem('theme') === 'light') {
        themeToggle.checked = true;
        document.body.classList.add('light-mode');
    }

    // Modal listeners
    modalPreviewCloseButton.addEventListener('click', closeModal);
    modalNextButton.addEventListener('click', showNextImage);
    modalPrevButton.addEventListener('click', showPrevImage);
    modalZoomInButton.addEventListener('click', () => { zoom = Math.min(5, zoom + 0.2); applyZoomAndPan(); });
    modalZoomOutButton.addEventListener('click', () => { zoom = Math.max(0.5, zoom - 0.2); applyZoomAndPan(); });
    modalZoomResetButton.addEventListener('click', resetZoomAndPan);
    modalDownloadEditedButton.addEventListener('click', () => downloadFile(modalImageElement.src, 'edited_image.png'));
    
    // Panning logic for modal image
    modalImageContainer.addEventListener('mousedown', (e) => {
        if (zoom > 1) {
            isPanning = true;
            panStartX = e.clientX - panX * zoom;
            panStartY = e.clientY - panY * zoom;
            modalImageContainer.classList.add('panning');
        }
    });
    modalImageContainer.addEventListener('mouseup', () => {
        isPanning = false;
        modalImageContainer.classList.remove('panning');
    });
    modalImageContainer.addEventListener('mouseleave', () => {
        isPanning = false;
        modalImageContainer.classList.remove('panning');
    });
    modalImageContainer.addEventListener('mousemove', (e) => {
        if (isPanning) {
            e.preventDefault();
            panX = (e.clientX - panStartX) / zoom;
            panY = (e.clientY - panStartY) / zoom;
            applyZoomAndPan();
        }
    });
    
    // Filter logic for modal image
    modalFilterButtons.addEventListener('click', (e) => {
        const button = (e.target as HTMLElement).closest('.toggle-button');
        if (!button) return;

        modalFilterButtons.querySelectorAll('.toggle-button').forEach(btn => btn.classList.remove('active'));
        button.classList.add('active');

        const filter = (button as HTMLElement).dataset.filter;
        switch(filter) {
            case 'bw':
                modalImageElement.style.filter = 'grayscale(100%)';
                break;
            case 'vintage':
                modalImageElement.style.filter = 'sepia(70%)';
                break;
            case 'none':
            default:
                modalImageElement.style.filter = 'none';
                break;
        }
    });


    // --- Module Initializers ---
    const dependencies = { getApiKey, showPreviewModal, showNotification: showToast };
    
    // Initialize all feature modules
    CreativeStudio.init(dependencies);
    AdStudio.init(dependencies);
    RetouchAndColorizer.init(dependencies);
    FoodStylist.init(dependencies);
    Stickerrr.init(dependencies);
    AIVoiceStudio.init(dependencies);
    PhotoStudio.init(dependencies);
    InteriorDesigner.init(dependencies);
    LogoLab.init(dependencies);
    ModelCreative.init(dependencies);
    OutfitPro.init(dependencies);
    PosterPro.init(dependencies);

    // --- Final setup ---
    switchView('ad-studio-view');
});