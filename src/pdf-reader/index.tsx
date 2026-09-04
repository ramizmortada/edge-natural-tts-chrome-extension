/// <reference types="chrome" />
import React from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';

import { dom, hoverPlayButton, PLAY_SVG, PAUSE_SVG } from './dom';
import { state } from './state';
import { readerDB } from './db';
import { playSentenceAtIndex, pausePlayback, stopPlayback, createRangeForSentence, clearSentenceHover } from './tts';
import { highlightActiveSidebarPage } from './ui';

// Mount React Root
const container = document.getElementById('root');
if (container) {
  const root = createRoot(container);
  root.render(<App />);
}

// Global Scroll & Interaction Handlers
let scrollSaveTimer: any = null;

// Reader Mode Scroll Tracking
document.addEventListener('scroll', (e) => {
  const target = e.target as HTMLElement;
  if (!target || target.id !== 'reader-mode-view') return;
  if (state.isRestoringState) return;

  const pageBlocks = Array.from(dom.readerContent ? dom.readerContent.querySelectorAll('.reader-page-block') : []) as HTMLElement[];
  if (pageBlocks.length === 0) return;

  const viewRect = target.getBoundingClientRect();
  let closestPage = 1;
  let minDiff = Infinity;

  for (const block of pageBlocks) {
    const rect = block.getBoundingClientRect();
    const diff = Math.abs(rect.top - viewRect.top);
    if (diff < minDiff) {
      minDiff = diff;
      closestPage = parseInt(block.dataset.pageNumber || '1', 10);
    }
  }

  window.dispatchEvent(new CustomEvent('page-change', { detail: { page: closestPage } }));
  highlightActiveSidebarPage(closestPage);

  if (state.currentDocTitle) {
    clearTimeout(scrollSaveTimer);
    scrollSaveTimer = setTimeout(async () => {
      if (state.isRestoringState) return;
      const doc = await readerDB.getDoc(state.currentDocTitle);
      if (doc) {
        doc.lastScrollTop = target.scrollTop;
        doc.lastPage = closestPage;
        await readerDB.saveDoc(doc);
      }
    }, 300);
  }
}, true);

// PDF Viewer Scroll Tracking
document.addEventListener('scroll', (e) => {
  const target = e.target as HTMLElement;
  if (!target || target.id !== 'pdf-viewer') return;
  if (state.pagesData.length === 0) return;

  let closestPage = 1;
  let minDiff = Infinity;
  const viewerRect = target.getBoundingClientRect();

  for (const pData of state.pagesData) {
    const pageRect = pData.wrapper.getBoundingClientRect();
    const diff = Math.abs(pageRect.top - viewerRect.top);
    if (diff < minDiff) {
      minDiff = diff;
      closestPage = pData.pageNumber;
    }
  }

  window.dispatchEvent(new CustomEvent('page-change', { detail: { page: closestPage } }));
  highlightActiveSidebarPage(closestPage);
}, true);

// Mousemove Hover Play in PDF textLayer
document.addEventListener('mousemove', (e) => {
  if (state.isLoadingTTS) return;
  const target = e.target as HTMLElement;
  const textSpan = target.closest('.textLayer span') as HTMLElement | null;

  if (target === hoverPlayButton || (hoverPlayButton && hoverPlayButton.contains(target))) return;

  if (textSpan) {
    const matched = state.allSentences.find(s => s.element === textSpan);
    if (matched) {
      if (matched !== state.lastHoveredSentence) {
        state.lastHoveredSentence = matched;
        state.hoveredSentence = matched;

        const range = createRangeForSentence(matched);
        if (range && 'highlights' in CSS) {
          const highlight = new (window as any).Highlight(range);
          (CSS as any).highlights.set('aura-sentence-hover', highlight);
        }

        const rect = textSpan.getBoundingClientRect();
        if (hoverPlayButton) {
          hoverPlayButton.style.top = `${rect.top + window.scrollY}px`;
          hoverPlayButton.style.left = `${rect.left + window.scrollX - 28}px`;
          hoverPlayButton.style.opacity = '1';
          hoverPlayButton.style.pointerEvents = 'auto';
          hoverPlayButton.innerHTML = (state.isPlaying && state.activeSentenceIndex === state.allSentences.indexOf(matched)) ? PAUSE_SVG : PLAY_SVG;
        }
      }
      return;
    }
  }

  clearSentenceHover();
});

// Hover Play Button Click
if (hoverPlayButton) {
  hoverPlayButton.addEventListener('click', (e) => {
    e.stopPropagation();
    if (state.hoveredSentence) {
      const idx = state.allSentences.indexOf(state.hoveredSentence);
      if (idx !== -1) {
        if (state.isPlaying && state.activeSentenceIndex === idx) {
          pausePlayback();
        } else {
          playSentenceAtIndex(idx);
        }
      }
    }
  });
}
