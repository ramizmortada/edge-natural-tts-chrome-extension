/// <reference types="chrome" />
import { dom, hoverPlayButton, PLAY_SVG, PAUSE_SVG } from './dom';
import { state } from './state';
import { readerDB, exportCleanedDocument } from './db';
import { openAiModal, closeAiModal, revertPageText } from './ai';
import { playSentenceAtIndex, pausePlayback, stopPlayback, createRangeForSentence, clearSentenceHover } from './tts';
import {
  showLoading,
  hideLoading,
  updateSpeedLabel,
  setViewMode,
  updateReaderTypography,
  toggleSidebar,
  highlightActiveSidebarPage,
  jumpToPage,
  applyScaleChange,
  closeAllPopovers,
  renderRecentFilesUI
} from './ui';
import { loadDocumentFile, loadStoredDocument } from './loaders';

// Popover Handlers
if (dom.libraryMenuBtn && dom.libraryMenu) {
  dom.libraryMenuBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    const isVisible = dom.libraryMenu.style.display === 'flex';
    closeAllPopovers();
    dom.libraryMenu.style.display = isVisible ? 'none' : 'flex';
  });
}

if (dom.appearanceMenuBtn && dom.appearanceMenu) {
  dom.appearanceMenuBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    const isVisible = dom.appearanceMenu.style.display === 'flex';
    closeAllPopovers();
    dom.appearanceMenu.style.display = isVisible ? 'none' : 'flex';
  });
}

window.addEventListener('click', (e) => {
  const target = e.target as Node;
  if (dom.libraryMenu && !dom.libraryMenu.contains(target) && target !== dom.libraryMenuBtn && !dom.libraryMenuBtn?.contains(target)) {
    dom.libraryMenu.style.display = 'none';
  }
  if (dom.appearanceMenu && !dom.appearanceMenu.contains(target) && target !== dom.appearanceMenuBtn && !dom.appearanceMenuBtn?.contains(target)) {
    dom.appearanceMenu.style.display = 'none';
  }
});

// Theme Option Buttons
document.querySelectorAll('.theme-option-btn').forEach(btn => {
  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    const theme = (btn as HTMLElement).dataset.theme || 'dark-sepia';
    state.currentTheme = theme;
    updateReaderTypography();
    chrome.storage.local.set({ pdfTheme: state.currentTheme });
  });
});

if (dom.clearRecentsBtn) {
  dom.clearRecentsBtn.addEventListener('click', async (e) => {
    e.stopPropagation();
    if (confirm('Clear all recent documents history?')) {
      await readerDB.clearAll();
      chrome.storage.local.remove(['last_active_doc_id']);
      renderRecentFilesUI();
    }
  });
}

// Undo Button Handler
if (dom.undoEditBtn) {
  dom.undoEditBtn.addEventListener('click', () => {
    closeAllPopovers();
    if (state.currentUndoStack.length > 0) {
      const action = state.currentUndoStack.pop();
      if (action) {
        revertPageText(action.pageNum);
      }
      if (state.currentUndoStack.length === 0 && dom.undoEditBtn) {
        dom.undoEditBtn.style.display = 'none';
      }
    }
  });
}

// Auto-Scroll Toggle Handler
if (dom.autoScrollBtn) {
  dom.autoScrollBtn.addEventListener('click', () => {
    state.isAutoScrollEnabled = !state.isAutoScrollEnabled;
    dom.autoScrollBtn.classList.toggle('active', state.isAutoScrollEnabled);
    chrome.storage.local.set({ isAutoScrollEnabled: state.isAutoScrollEnabled });
  });
}

// Export Document Handler
if (dom.exportDocBtn) {
  dom.exportDocBtn.addEventListener('click', () => {
    closeAllPopovers();
    exportCleanedDocument();
  });
}

// AI Modal Event Listeners
if (dom.aiSettingsBtn) dom.aiSettingsBtn.addEventListener('click', openAiModal);
if (dom.aiModalClose) dom.aiModalClose.addEventListener('click', closeAiModal);
if (dom.aiModalCancel) dom.aiModalCancel.addEventListener('click', closeAiModal);

if (dom.toggleKeyVisibility) {
  dom.toggleKeyVisibility.addEventListener('click', () => {
    if (dom.geminiApiKeyInput) {
      if (dom.geminiApiKeyInput.type === 'password') {
        dom.geminiApiKeyInput.type = 'text';
        dom.toggleKeyVisibility.textContent = '🔒';
      } else {
        dom.geminiApiKeyInput.type = 'password';
        dom.toggleKeyVisibility.textContent = '👁️';
      }
    }
  });
}

if (dom.aiModalSave) {
  dom.aiModalSave.addEventListener('click', () => {
    if (dom.geminiApiKeyInput) state.geminiApiKey = dom.geminiApiKeyInput.value.trim();
    if (dom.geminiModelInput) state.geminiModel = dom.geminiModelInput.value.trim() || 'gemini-3.1-flash-lite';
    chrome.storage.local.set({ geminiApiKey: state.geminiApiKey, geminiModel: state.geminiModel });
    closeAiModal();
  });
}

// Sidebar Buttons
if (dom.sidebarToggleBtn) dom.sidebarToggleBtn.addEventListener('click', () => toggleSidebar());
if (dom.sidebarCloseBtn) dom.sidebarCloseBtn.addEventListener('click', () => toggleSidebar(false));

if (dom.sidebarSearchInput) {
  dom.sidebarSearchInput.addEventListener('input', () => {
    const query = dom.sidebarSearchInput.value.toLowerCase().trim();
    const items = Array.from(dom.sidebarPageList ? dom.sidebarPageList.querySelectorAll('.sidebar-page-item') : []) as HTMLElement[];
    for (const item of items) {
      const pageNum = item.dataset.pageNumber || '';
      const text = item.textContent?.toLowerCase() || '';
      if (!query || pageNum === query || text.includes(query)) {
        item.style.display = 'block';
      } else {
        item.style.display = 'none';
      }
    }
  });
}

// Mode Buttons
if (dom.modeReaderBtn) dom.modeReaderBtn.addEventListener('click', () => setViewMode('reader'));
if (dom.modePdfBtn) dom.modePdfBtn.addEventListener('click', () => setViewMode('pdf'));

// Typography Buttons
if (dom.fontDecreaseBtn) {
  dom.fontDecreaseBtn.addEventListener('click', () => {
    if (state.currentFontSize > 14) {
      state.currentFontSize -= 2;
      updateReaderTypography();
      chrome.storage.local.set({ pdfFontSize: state.currentFontSize });
    }
  });
}

if (dom.fontIncreaseBtn) {
  dom.fontIncreaseBtn.addEventListener('click', () => {
    if (state.currentFontSize < 32) {
      state.currentFontSize += 2;
      updateReaderTypography();
      chrome.storage.local.set({ pdfFontSize: state.currentFontSize });
    }
  });
}

if (dom.fontFamilySelect) {
  dom.fontFamilySelect.addEventListener('change', () => {
    state.currentFontFamily = dom.fontFamilySelect.value;
    updateReaderTypography();
    chrome.storage.local.set({ pdfFontFamily: state.currentFontFamily });
  });
}

// Zoom & Navigation
if (dom.zoomInBtn) {
  dom.zoomInBtn.addEventListener('click', () => {
    state.currentScale = Math.min(state.currentScale + 0.25, 3.0);
    applyScaleChange();
  });
}

if (dom.zoomOutBtn) {
  dom.zoomOutBtn.addEventListener('click', () => {
    state.currentScale = Math.max(state.currentScale - 0.25, 0.5);
    applyScaleChange();
  });
}

if (dom.fitWidthBtn) {
  dom.fitWidthBtn.addEventListener('click', async () => {
    if (state.pagesData.length === 0 || !state.pdfDoc) return;
    const firstPageData = state.pagesData[0];
    if (!firstPageData.pageProxy) {
      firstPageData.pageProxy = await state.pdfDoc.getPage(1);
    }
    const unscaledViewport = firstPageData.pageProxy.getViewport({ scale: 1.0 });
    const containerWidth = dom.pdfViewer ? dom.pdfViewer.clientWidth - 48 : 600;
    if (containerWidth > 200) {
      state.currentScale = containerWidth / unscaledViewport.width;
      applyScaleChange();
    }
  });
}

if (dom.prevPageBtn) {
  dom.prevPageBtn.addEventListener('click', () => {
    if (!dom.pageNumInput) return;
    const cur = parseInt(dom.pageNumInput.value, 10);
    if (cur > 1) jumpToPage(cur - 1);
  });
}

if (dom.nextPageBtn) {
  dom.nextPageBtn.addEventListener('click', () => {
    if (!state.pdfDoc || !dom.pageNumInput) return;
    const cur = parseInt(dom.pageNumInput.value, 10);
    if (cur < state.pdfDoc.numPages) jumpToPage(cur + 1);
  });
}

if (dom.pageNumInput) {
  dom.pageNumInput.addEventListener('change', () => {
    if (!state.pdfDoc) return;
    let target = parseInt(dom.pageNumInput.value, 10);
    if (isNaN(target) || target < 1) target = 1;
    if (target > state.pdfDoc.numPages) target = state.pdfDoc.numPages;
    jumpToPage(target);
  });
}

// PDF Viewer & Reader Scroll Listeners
if (dom.pdfViewer) {
  dom.pdfViewer.addEventListener('scroll', () => {
    if (state.pagesData.length === 0) return;
    let closestPage = 1;
    let minDiff = Infinity;
    const viewerRect = dom.pdfViewer.getBoundingClientRect();

    for (const pData of state.pagesData) {
      const pageRect = pData.wrapper.getBoundingClientRect();
      const diff = Math.abs(pageRect.top - viewerRect.top);
      if (diff < minDiff) {
        minDiff = diff;
        closestPage = pData.pageNumber;
      }
    }

    if (dom.pageNumInput && parseInt(dom.pageNumInput.value, 10) !== closestPage) {
      dom.pageNumInput.value = closestPage.toString();
      highlightActiveSidebarPage(closestPage);
    }
  });

  dom.pdfViewer.addEventListener('mousemove', (e) => {
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
}

let scrollSaveTimer: any = null;
if (dom.readerModeView) {
  dom.readerModeView.addEventListener('scroll', () => {
    if (state.isRestoringState) return;

    const pageBlocks = Array.from(dom.readerContent ? dom.readerContent.querySelectorAll('.reader-page-block') : []) as HTMLElement[];
    if (pageBlocks.length === 0) return;

    const viewRect = dom.readerModeView.getBoundingClientRect();
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

    if (dom.pageNumInput && parseInt(dom.pageNumInput.value, 10) !== closestPage) {
      dom.pageNumInput.value = closestPage.toString();
      highlightActiveSidebarPage(closestPage);
    }

    if (state.currentDocTitle) {
      clearTimeout(scrollSaveTimer);
      scrollSaveTimer = setTimeout(async () => {
        if (state.isRestoringState) return;
        const doc = await readerDB.getDoc(state.currentDocTitle);
        if (doc) {
          doc.lastScrollTop = dom.readerModeView.scrollTop;
          doc.lastPage = closestPage;
          await readerDB.saveDoc(doc);
        }
      }, 300);
    }
  });
}

// Hover Play Button
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

// Main Player Controls
if (dom.ttsPlayBtn) {
  dom.ttsPlayBtn.addEventListener('click', () => {
    if (state.isPlaying) {
      pausePlayback();
    } else if (state.isPaused && state.activeSentenceIndex >= 0) {
      if (state.activePort) {
        try {
          state.activePort.postMessage({ type: "PLAY" });
        } catch (_) {}
      }
      chrome.runtime.sendMessage({ target: "offscreen", type: "PLAY" }).catch(()=>{});
      state.isPaused = false;
      state.isPlaying = true;
      if (dom.ttsPlayBtn) dom.ttsPlayBtn.classList.add('playing');
      if (dom.ttsPlayIcon) dom.ttsPlayIcon.innerHTML = `<rect x="6" y="4" width="4" height="16"></rect><rect x="14" y="4" width="4" height="16"></rect>`;
    } else {
      if (state.activeSentenceIndex >= 0 && state.activeSentenceIndex < state.allSentences.length) {
        playSentenceAtIndex(state.activeSentenceIndex);
      } else {
        const curPage = dom.pageNumInput ? (parseInt(dom.pageNumInput.value, 10) || 1) : 1;
        let targetSentenceIdx = state.allSentences.findIndex(s => s.pageNumber >= curPage);
        if (targetSentenceIdx === -1 && state.allSentences.length > 0) {
          targetSentenceIdx = 0;
        }
        if (targetSentenceIdx !== -1) {
          playSentenceAtIndex(targetSentenceIdx);
        } else {
          alert('No readable text found. Please open a document from Library.');
        }
      }
    }
  });
}

if (dom.ttsStopBtn) {
  dom.ttsStopBtn.addEventListener('click', () => {
    stopPlayback();
  });
}

if (dom.ttsPrevBtn) {
  dom.ttsPrevBtn.addEventListener('click', () => {
    if (state.activeSentenceIndex > 0) {
      playSentenceAtIndex(state.activeSentenceIndex - 1);
    }
  });
}

if (dom.ttsNextBtn) {
  dom.ttsNextBtn.addEventListener('click', () => {
    if (state.activeSentenceIndex + 1 < state.allSentences.length) {
      playSentenceAtIndex(state.activeSentenceIndex + 1);
    }
  });
}

// Voice & Speed
if (dom.voiceSelect) {
  dom.voiceSelect.addEventListener('change', () => {
    state.currentVoice = dom.voiceSelect.value;
    chrome.storage.local.set({ voice: state.currentVoice });
  });
}

if (dom.rateSlider) {
  dom.rateSlider.addEventListener('input', () => {
    const val = parseInt(dom.rateSlider.value, 10);
    state.currentRate = [val];
    updateSpeedLabel(val);
    chrome.storage.local.set({ rate: [val] });
  });
}

// File Inputs & Drag-and-Drop
if (dom.fileInput) {
  dom.fileInput.addEventListener('change', () => {
    if (dom.fileInput.files && dom.fileInput.files[0]) {
      loadDocumentFile(dom.fileInput.files[0]);
    }
  });
}

if (dom.dropFileInput) {
  dom.dropFileInput.addEventListener('change', () => {
    if (dom.dropFileInput.files && dom.dropFileInput.files[0]) {
      loadDocumentFile(dom.dropFileInput.files[0]);
    }
  });
}

let dragCounter = 0;
window.addEventListener('dragenter', (e) => {
  e.preventDefault();
  e.stopPropagation();
  dragCounter++;
  if (dom.dragOverlay) dom.dragOverlay.style.display = 'flex';
});

window.addEventListener('dragleave', (e) => {
  e.preventDefault();
  e.stopPropagation();
  dragCounter--;
  if (dragCounter <= 0) {
    dragCounter = 0;
    if (dom.dragOverlay) dom.dragOverlay.style.display = 'none';
  }
});

window.addEventListener('dragover', (e) => {
  e.preventDefault();
  e.stopPropagation();
});

window.addEventListener('drop', (e) => {
  e.preventDefault();
  e.stopPropagation();
  dragCounter = 0;
  if (dom.dragOverlay) dom.dragOverlay.style.display = 'none';

  if (e.dataTransfer?.files && e.dataTransfer.files.length > 0) {
    const file = e.dataTransfer.files[0];
    loadDocumentFile(file);
  }
});

// Startup Preferences & Auto-Reopen
chrome.storage.local.get(["voice", "rate", "pdfTheme", "pdfFontFamily", "pdfFontSize", "geminiApiKey", "geminiModel", "isAutoScrollEnabled", "last_active_doc_id"], async (result: Record<string, any>) => {
  if (result.voice) {
    state.currentVoice = result.voice;
    if (dom.voiceSelect) dom.voiceSelect.value = result.voice;
  }
  if (result.rate && Array.isArray(result.rate)) {
    state.currentRate = result.rate;
    const val = result.rate[0];
    if (dom.rateSlider) dom.rateSlider.value = val.toString();
    updateSpeedLabel(val);
  }
  if (result.pdfTheme) {
    state.currentTheme = result.pdfTheme;
  } else {
    state.currentTheme = 'dark-sepia';
  }
  if (result.pdfFontFamily) {
    state.currentFontFamily = result.pdfFontFamily;
    if (dom.fontFamilySelect) dom.fontFamilySelect.value = result.pdfFontFamily;
  }
  if (result.pdfFontSize) {
    state.currentFontSize = Number(result.pdfFontSize) || 18;
  }
  if (result.geminiApiKey) {
    state.geminiApiKey = String(result.geminiApiKey);
  }
  if (result.geminiModel) {
    state.geminiModel = String(result.geminiModel);
  }
  if (result.isAutoScrollEnabled !== undefined) {
    state.isAutoScrollEnabled = Boolean(result.isAutoScrollEnabled);
    if (dom.autoScrollBtn) dom.autoScrollBtn.classList.toggle('active', state.isAutoScrollEnabled);
  }
  updateReaderTypography();

  await renderRecentFilesUI();

  try {
    let targetDocId = result.last_active_doc_id;
    if (!targetDocId) {
      const allDocs = await readerDB.getAllDocs();
      if (allDocs.length > 0) {
        targetDocId = allDocs[0].id;
      }
    }
    if (targetDocId && typeof targetDocId === 'string') {
      const lastDoc = await readerDB.getDoc(targetDocId);
      if (lastDoc && lastDoc.arrayBuffer && lastDoc.arrayBuffer.byteLength > 0) {
        await loadStoredDocument(lastDoc);
      }
    }
  } catch (err) {
    console.error("Error auto-reopening last document:", err);
  }
});
