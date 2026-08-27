import * as pdfjsLib from 'pdfjs-dist';
import mammoth from 'mammoth';
import JSZip from 'jszip';

// Configure worker URL
try {
  pdfjsLib.GlobalWorkerOptions.workerSrc = chrome.runtime.getURL('pdf.worker.min.mjs');
} catch (e) {
  console.warn('Could not set workerSrc:', e);
}

// Icons
const PLAY_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>`;
const PAUSE_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16"></rect><rect x="14" y="4" width="4" height="16"></rect></svg>`;

interface SentenceItem {
  id: string;
  pageNumber: number;
  text: string;
  element: HTMLElement | null;
  readerElement: HTMLElement | null;
  startOffsetInEl: number;
  endOffsetInEl: number;
}

interface PageData {
  pageNumber: number;
  pageProxy: pdfjsLib.PDFPageProxy | null;
  wrapper: HTMLElement;
  canvas: HTMLCanvasElement;
  textLayerDiv: HTMLElement;
  sentences: SentenceItem[];
  isRendered: boolean;
  isRendering: boolean;
  renderTask: any | null;
}

// State
let currentViewMode: 'reader' | 'pdf' = 'reader';
let pdfDoc: pdfjsLib.PDFDocumentProxy | null = null;
let currentScale = 1.25;
let currentFontSize = 18;
let currentFontFamily = 'sans';
let currentTheme = 'dark';
let pagesData: PageData[] = [];
let isPlaying = false;
let isLoadingTTS = false;
let activePort: chrome.runtime.Port | null = null;
let currentAudioTime = 0;
let activeWordBoundaries: any[] = [];
let activeSentenceIndex = -1;
let allSentences: SentenceItem[] = [];
let currentHighlightTick: any = null;
let hoveredSentence: SentenceItem | null = null;
let lastHoveredSentence: SentenceItem | null = null;
let currentVoice = "en-US-AriaNeural";
let currentRate = [0];
let pageObserver: IntersectionObserver | null = null;

// DOM Elements
const dropZone = document.getElementById('drop-zone') as HTMLElement;
const dragOverlay = document.getElementById('drag-overlay') as HTMLElement;
const loadingIndicator = document.getElementById('loading-indicator') as HTMLElement;
const loadingText = document.getElementById('loading-text') as HTMLElement;
const readerModeView = document.getElementById('reader-mode-view') as HTMLElement;
const readerContent = document.getElementById('reader-content') as HTMLElement;
const readerBookTitle = document.getElementById('reader-book-title') as HTMLElement;
const readerPageInfo = document.getElementById('reader-page-info') as HTMLElement;
const readerWordCount = document.getElementById('reader-word-count') as HTMLElement;
const pdfViewer = document.getElementById('pdf-viewer') as HTMLElement;
const pagesContainer = document.getElementById('pages-container') as HTMLElement;
const fileInput = document.getElementById('file-input') as HTMLInputElement;
const dropFileInput = document.getElementById('drop-file-input') as HTMLInputElement;
const docInfo = document.getElementById('doc-info') as HTMLElement;
const docTitle = document.getElementById('doc-title') as HTMLElement;
const navControls = document.getElementById('nav-controls') as HTMLElement;
const sidebarToggleBtn = document.getElementById('sidebar-toggle-btn') as HTMLButtonElement;
const readerSidebar = document.getElementById('reader-sidebar') as HTMLElement;
const sidebarCloseBtn = document.getElementById('sidebar-close-btn') as HTMLButtonElement;
const sidebarSearchInput = document.getElementById('sidebar-search-input') as HTMLInputElement;
const sidebarPageList = document.getElementById('sidebar-page-list') as HTMLElement;
const modeReaderBtn = document.getElementById('mode-reader-btn') as HTMLButtonElement;
const modePdfBtn = document.getElementById('mode-pdf-btn') as HTMLButtonElement;
const readerAppearanceControls = document.getElementById('reader-appearance-controls') as HTMLElement;
const pdfCanvasControls = document.getElementById('pdf-canvas-controls') as HTMLElement;
const fontDecreaseBtn = document.getElementById('font-decrease-btn') as HTMLButtonElement;
const fontIncreaseBtn = document.getElementById('font-increase-btn') as HTMLButtonElement;
const fontFamilySelect = document.getElementById('font-family-select') as HTMLSelectElement;
const themeSelect = document.getElementById('theme-select') as HTMLSelectElement;
const pageNumInput = document.getElementById('page-num-input') as HTMLInputElement;
const pageCountSpan = document.getElementById('page-count') as HTMLElement;
const prevPageBtn = document.getElementById('prev-page-btn') as HTMLButtonElement;
const nextPageBtn = document.getElementById('next-page-btn') as HTMLButtonElement;
const zoomOutBtn = document.getElementById('zoom-out-btn') as HTMLButtonElement;
const zoomInBtn = document.getElementById('zoom-in-btn') as HTMLButtonElement;
const zoomLevelSpan = document.getElementById('zoom-level') as HTMLElement;
const fitWidthBtn = document.getElementById('fit-width-btn') as HTMLButtonElement;
const voiceSelect = document.getElementById('voice-select') as HTMLSelectElement;
const rateSlider = document.getElementById('rate-slider') as HTMLInputElement;
const speedLabel = document.getElementById('speed-label') as HTMLElement;
const ttsPlayBtn = document.getElementById('tts-play-btn') as HTMLButtonElement;
const ttsPlayIcon = document.getElementById('tts-play-icon') as HTMLElement;
const ttsStopBtn = document.getElementById('tts-stop-btn') as HTMLButtonElement;
const ttsPrevBtn = document.getElementById('tts-prev-btn') as HTMLButtonElement;
const ttsNextBtn = document.getElementById('tts-next-btn') as HTMLButtonElement;

const autoScrollBtn = document.getElementById('auto-scroll-btn') as HTMLButtonElement;
const exportDocBtn = document.getElementById('export-doc-btn') as HTMLButtonElement;
const aiSettingsBtn = document.getElementById('ai-settings-btn') as HTMLButtonElement;
const aiModal = document.getElementById('ai-modal') as HTMLElement;
const aiModalClose = document.getElementById('ai-modal-close') as HTMLButtonElement;
const aiModalCancel = document.getElementById('ai-modal-cancel') as HTMLButtonElement;
const aiModalSave = document.getElementById('ai-modal-save') as HTMLButtonElement;
const geminiApiKeyInput = document.getElementById('gemini-api-key-input') as HTMLInputElement;
const geminiModelInput = document.getElementById('gemini-model-input') as HTMLInputElement;
const toggleKeyVisibility = document.getElementById('toggle-key-visibility') as HTMLButtonElement;

let geminiApiKey = '';
let geminiModel = 'gemini-3.1-flash-lite';
let isAutoScrollEnabled = true;
let currentDocTitle = '';

// Auto-Scroll Toggle Handler
if (autoScrollBtn) {
  autoScrollBtn.addEventListener('click', () => {
    isAutoScrollEnabled = !isAutoScrollEnabled;
    autoScrollBtn.classList.toggle('active', isAutoScrollEnabled);
    chrome.storage.local.set({ isAutoScrollEnabled });
  });
}

// Export Document Handler
if (exportDocBtn) {
  exportDocBtn.addEventListener('click', () => exportCleanedDocument());
}

function exportCleanedDocument() {
  if (allSentences.length === 0) {
    alert('No document loaded to export.');
    return;
  }

  const pageBlocks = Array.from(readerContent.querySelectorAll('.reader-page-block')) as HTMLElement[];
  let fullText = '';

  for (const block of pageBlocks) {
    const headerLeft = block.querySelector('.page-header-left');
    const headerText = headerLeft?.textContent?.trim() || `Page ${block.dataset.pageNumber}`;
    const paragraphs = Array.from(block.querySelectorAll('p.reader-paragraph'))
      .map(p => p.textContent?.trim())
      .filter(Boolean);

    fullText += `## ${headerText}\n\n`;
    fullText += paragraphs.join('\n\n') + '\n\n';
  }

  const cleanName = (currentDocTitle || 'document').replace(/\.[^/.]+$/, "");
  const blob = new Blob([fullText], { type: 'text/markdown;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${cleanName}_cleaned.md`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// Persistent Storage for Cleaned AI Edits
function saveCleanedPageToStorage(docName: string, pNum: number, cleaned: string[], original: string[]) {
  if (!docName) return;
  const key = `cleaned_doc_${encodeURIComponent(docName)}`;
  chrome.storage.local.get([key], (res) => {
    const data = res[key] || {};
    data[pNum] = { cleaned, original, time: Date.now() };
    chrome.storage.local.set({ [key]: data });
  });
}

function removeCleanedPageFromStorage(docName: string, pNum: number) {
  if (!docName) return;
  const key = `cleaned_doc_${encodeURIComponent(docName)}`;
  chrome.storage.local.get([key], (res) => {
    const data = res[key] || {};
    delete data[pNum];
    chrome.storage.local.set({ [key]: data });
  });
}

function getSavedCleanedDoc(docName: string): Promise<Record<number, { cleaned: string[]; original: string[] }>> {
  return new Promise((resolve) => {
    if (!docName) return resolve({});
    const key = `cleaned_doc_${encodeURIComponent(docName)}`;
    chrome.storage.local.get([key], (res) => {
      resolve(res[key] || {});
    });
  });
}

// AI Modal Handlers
function openAiModal() {
  geminiApiKeyInput.value = geminiApiKey;
  geminiModelInput.value = geminiModel || 'gemini-3.1-flash-lite';
  aiModal.style.display = 'flex';
}

function closeAiModal() {
  aiModal.style.display = 'none';
}

aiSettingsBtn.addEventListener('click', openAiModal);
aiModalClose.addEventListener('click', closeAiModal);
aiModalCancel.addEventListener('click', closeAiModal);

toggleKeyVisibility.addEventListener('click', () => {
  if (geminiApiKeyInput.type === 'password') {
    geminiApiKeyInput.type = 'text';
    toggleKeyVisibility.textContent = '🔒';
  } else {
    geminiApiKeyInput.type = 'password';
    toggleKeyVisibility.textContent = '👁️';
  }
});

aiModalSave.addEventListener('click', () => {
  geminiApiKey = geminiApiKeyInput.value.trim();
  geminiModel = geminiModelInput.value.trim() || 'gemini-3.1-flash-lite';
  chrome.storage.local.set({ geminiApiKey, geminiModel });
  closeAiModal();
});

// Sidebar State & Management
let isSidebarOpen = false;

function toggleSidebar(open?: boolean) {
  isSidebarOpen = open !== undefined ? open : !isSidebarOpen;
  if (isSidebarOpen) {
    readerSidebar.classList.remove('collapsed');
    sidebarToggleBtn.classList.add('active');
  } else {
    readerSidebar.classList.add('collapsed');
    sidebarToggleBtn.classList.remove('active');
  }
}

sidebarToggleBtn.addEventListener('click', () => toggleSidebar());
sidebarCloseBtn.addEventListener('click', () => toggleSidebar(false));

// Sidebar Search Filter
sidebarSearchInput.addEventListener('input', () => {
  const query = sidebarSearchInput.value.toLowerCase().trim();
  const items = Array.from(sidebarPageList.querySelectorAll('.sidebar-page-item')) as HTMLElement[];
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

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// Hover play button
const hoverPlayButton = document.createElement('button');
hoverPlayButton.id = 'edge-tts-hover-play';
hoverPlayButton.innerHTML = PLAY_SVG;
document.body.appendChild(hoverPlayButton);

function updateSpeedLabel(val: number) {
  speedLabel.textContent = val >= 0 ? `+${val}%` : `${val}%`;
}

function showLoading(text: string) {
  loadingText.textContent = text;
  loadingIndicator.style.display = 'flex';
}

function hideLoading() {
  loadingIndicator.style.display = 'none';
}

// View Mode Management
function setViewMode(mode: 'reader' | 'pdf') {
  currentViewMode = mode;
  if (mode === 'reader') {
    modeReaderBtn.classList.add('active');
    modePdfBtn.classList.remove('active');
    readerModeView.style.display = 'flex';
    readerAppearanceControls.style.display = 'flex';
    pdfViewer.style.display = 'none';
    pdfCanvasControls.style.display = 'none';
  } else {
    modePdfBtn.classList.add('active');
    modeReaderBtn.classList.remove('active');
    pdfViewer.style.display = 'flex';
    pdfCanvasControls.style.display = 'flex';
    readerModeView.style.display = 'none';
    readerAppearanceControls.style.display = 'none';
  }
}

modeReaderBtn.addEventListener('click', () => setViewMode('reader'));
modePdfBtn.addEventListener('click', () => setViewMode('pdf'));

// Typography & Theme Handlers
function updateReaderTypography() {
  readerContent.style.fontSize = `${currentFontSize}px`;
  readerContent.className = `reader-content font-${currentFontFamily}`;
  document.body.className = `theme-${currentTheme}`;
}

fontDecreaseBtn.addEventListener('click', () => {
  if (currentFontSize > 14) {
    currentFontSize -= 2;
    updateReaderTypography();
  }
});

fontIncreaseBtn.addEventListener('click', () => {
  if (currentFontSize < 32) {
    currentFontSize += 2;
    updateReaderTypography();
  }
});

fontFamilySelect.addEventListener('change', () => {
  currentFontFamily = fontFamilySelect.value;
  updateReaderTypography();
});

themeSelect.addEventListener('change', () => {
  currentTheme = themeSelect.value;
  updateReaderTypography();
  chrome.storage.local.set({ pdfTheme: currentTheme });
});

// Load storage settings
chrome.storage.local.get(["voice", "rate", "pdfTheme", "pdfFontFamily", "pdfFontSize", "geminiApiKey", "geminiModel", "isAutoScrollEnabled"], (result) => {
  if (result.voice) {
    currentVoice = result.voice;
    voiceSelect.value = result.voice;
  }
  if (result.rate) {
    currentRate = result.rate;
    const val = result.rate[0];
    rateSlider.value = val.toString();
    updateSpeedLabel(val);
  }
  if (result.pdfTheme) {
    currentTheme = result.pdfTheme;
    themeSelect.value = result.pdfTheme;
  }
  if (result.pdfFontFamily) {
    currentFontFamily = result.pdfFontFamily;
    fontFamilySelect.value = result.pdfFontFamily;
  }
  if (result.pdfFontSize) {
    currentFontSize = result.pdfFontSize;
  }
  if (result.geminiApiKey) {
    geminiApiKey = result.geminiApiKey;
  }
  if (result.geminiModel) {
    geminiModel = result.geminiModel;
  }
  if (result.isAutoScrollEnabled !== undefined) {
    isAutoScrollEnabled = result.isAutoScrollEnabled;
    if (autoScrollBtn) autoScrollBtn.classList.toggle('active', isAutoScrollEnabled);
  }
  updateReaderTypography();
});

voiceSelect.addEventListener('change', () => {
  currentVoice = voiceSelect.value;
  chrome.storage.local.set({ voice: currentVoice });
});

rateSlider.addEventListener('input', () => {
  const val = parseInt(rateSlider.value, 10);
  currentRate = [val];
  updateSpeedLabel(val);
  chrome.storage.local.set({ rate: [val] });
});

// Initialize IntersectionObserver for lazy page rendering
function setupObserver() {
  if (pageObserver) {
    pageObserver.disconnect();
  }

  pageObserver = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      const wrapper = entry.target as HTMLElement;
      const pageNum = parseInt(wrapper.dataset.pageNumber || '1', 10);
      const pData = pagesData[pageNum - 1];
      if (!pData) continue;

      if (entry.isIntersecting) {
        renderPage(pData);
      }
    }
  }, {
    rootMargin: '800px 0px 800px 0px'
  });
}

// Load storage settings
chrome.storage.local.get(["voice", "rate"], (result) => {
  if (result.voice) {
    currentVoice = result.voice;
    voiceSelect.value = result.voice;
  }
  if (result.rate) {
    currentRate = result.rate;
    const val = result.rate[0];
    rateSlider.value = val.toString();
    updateSpeedLabel(val);
  }
});

voiceSelect.addEventListener('change', () => {
  currentVoice = voiceSelect.value;
  chrome.storage.local.set({ voice: currentVoice });
});

rateSlider.addEventListener('input', () => {
  const val = parseInt(rateSlider.value, 10);
  currentRate = [val];
  updateSpeedLabel(val);
  chrome.storage.local.set({ rate: [val] });
});

// Drag & Drop Management
let dragCounter = 0;

window.addEventListener('dragenter', (e) => {
  e.preventDefault();
  e.stopPropagation();
  dragCounter++;
  dragOverlay.style.display = 'flex';
});

window.addEventListener('dragleave', (e) => {
  e.preventDefault();
  e.stopPropagation();
  dragCounter--;
  if (dragCounter <= 0) {
    dragCounter = 0;
    dragOverlay.style.display = 'none';
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
  dragOverlay.style.display = 'none';

  if (e.dataTransfer?.files && e.dataTransfer.files.length > 0) {
    const file = e.dataTransfer.files[0];
    loadDocumentFile(file);
  }
});

fileInput.addEventListener('change', () => {
  if (fileInput.files && fileInput.files[0]) {
    loadDocumentFile(fileInput.files[0]);
  }
});

dropFileInput.addEventListener('change', () => {
  if (dropFileInput.files && dropFileInput.files[0]) {
    loadDocumentFile(dropFileInput.files[0]);
  }
});

// Master Document Loader (supports PDF, DOCX, EPUB, TXT, MD, HTML)
async function loadDocumentFile(file: File) {
  stopPlayback();
  const name = file.name.toLowerCase();
  const ext = name.split('.').pop() || '';

  try {
    if (ext === 'pdf' || file.type === 'application/pdf') {
      await loadPDFFile(file);
    } else if (ext === 'docx' || file.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
      await loadDocxFile(file);
    } else if (ext === 'epub' || file.type === 'application/epub+zip') {
      await loadEpubFile(file);
    } else if (ext === 'txt' || file.type === 'text/plain') {
      await loadTextFile(file);
    } else if (ext === 'md' || ext === 'markdown') {
      await loadMarkdownFile(file);
    } else if (ext === 'html' || ext === 'htm' || file.type === 'text/html') {
      await loadHtmlFile(file);
    } else {
      // Default fallback: attempt text reading
      await loadTextFile(file);
    }
  } catch (err: any) {
    console.error(`Error loading document (${file.name}):`, err);
    hideLoading();
    alert(`Failed to load ${file.name}: ` + (err.message || err.toString()));
  }
}

// Create Header with AI Action Buttons for Each Page
function createPageHeader(pNum: number, title?: string): HTMLElement {
  const pageHeader = document.createElement('div');
  pageHeader.className = 'reader-page-header';

  const left = document.createElement('div');
  left.className = 'page-header-left';
  left.textContent = title ? `${title} (Page ${pNum})` : `Page ${pNum}`;

  const actions = document.createElement('div');
  actions.className = 'page-header-actions';

  const aiBtn = document.createElement('button');
  aiBtn.className = 'page-ai-btn';
  aiBtn.dataset.page = pNum.toString();
  aiBtn.title = 'Clean conversion artifacts & broken words using Gemini AI';
  aiBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z"/></svg><span>Clean with AI</span>`;

  const revertBtn = document.createElement('button');
  revertBtn.className = 'page-revert-btn';
  revertBtn.dataset.page = pNum.toString();
  revertBtn.title = 'Revert to original text';
  revertBtn.style.display = 'none';
  revertBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><polyline points="3 3 3 8 8 8"/></svg><span>Revert</span>`;

  aiBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    cleanPageWithGemini(pNum);
  });

  revertBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    revertPageText(pNum);
  });

  actions.appendChild(aiBtn);
  actions.appendChild(revertBtn);

  pageHeader.appendChild(left);
  pageHeader.appendChild(actions);

  return pageHeader;
}

// Clean Page Text with Gemini AI
async function cleanPageWithGemini(pNum: number) {
  if (!geminiApiKey) {
    alert('Please enter your Gemini API key in the settings to use AI text cleanup.');
    openAiModal();
    return;
  }

  const pageBlock = document.getElementById(`reader-page-block-${pNum}`);
  if (!pageBlock) return;

  const aiBtn = pageBlock.querySelector('.page-ai-btn') as HTMLButtonElement | null;
  const revertBtn = pageBlock.querySelector('.page-revert-btn') as HTMLButtonElement | null;
  const pEls = Array.from(pageBlock.querySelectorAll('p.reader-paragraph')) as HTMLParagraphElement[];
  if (pEls.length === 0) return;

  // Extract raw text
  const originalParagraphs = pEls.map(p => p.textContent?.trim() || '').filter(t => t.length > 0);
  const rawText = originalParagraphs.join('\n\n');

  // Save original paragraphs for reverting
  if (!pageBlock.dataset.originalParagraphs) {
    pageBlock.dataset.originalParagraphs = JSON.stringify(originalParagraphs);
  }

  if (aiBtn) {
    aiBtn.classList.add('loading');
    aiBtn.innerHTML = `<div class="mini-spinner"></div><span>Cleaning...</span>`;
  }

  try {
    const prompt = `You are a professional text repair tool for document and OCR conversions.
Your task is to repair conversion artifacts, broken hyphenated words across lines (e.g. "re- leased" -> "released"), erratic spacing, and punctuation glitches without altering the meaning.

STRICT INSTRUCTIONS:
1. PRESERVE EVERY WORD, MEANING, TONE, AND CONTEXT EXACTLY.
2. DO NOT summarize, paraphrase, omit, or add any new sentences.
3. DO NOT output conversational text, markdown code blocks, backticks, or notes.
4. Maintain paragraph separation with double newlines (\\n\\n).

Text to clean:
${rawText}`;

    const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(geminiModel)}:generateContent?key=${encodeURIComponent(geminiApiKey)}`;
    
    const resp = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.1, maxOutputTokens: 8192 }
      })
    });

    if (!resp.ok) {
      const errData = await resp.json().catch(() => ({}));
      throw new Error(errData?.error?.message || `API error ${resp.status}`);
    }

    const data = await resp.json();
    let cleanedText = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!cleanedText) {
      throw new Error('No text returned from Gemini API.');
    }

    // Clean any accidental markdown codeblock wrapper
    cleanedText = cleanedText.replace(/^```[a-zA-Z]*\n?/, '').replace(/\n?```$/, '').trim();

    const cleanedParas = cleanedText.split(/\r?\n\s*\r?\n+/).map((p: string) => p.trim()).filter((p: string) => p.length > 0);

    // Replace paragraphs in the pageBlock
    const existingParas = Array.from(pageBlock.querySelectorAll('p.reader-paragraph'));
    existingParas.forEach(p => p.remove());

    for (const paraText of cleanedParas) {
      const pEl = document.createElement('p');
      pEl.className = 'reader-paragraph';

      const sentenceRegex = /[^.!?]+[.!?]+(?:\s+|$)|[^.!?]+$/g;
      let match;

      while ((match = sentenceRegex.exec(paraText)) !== null) {
        const sText = match[0].trim();
        if (sText.length === 0) continue;

        const sentenceSpan = document.createElement('span');
        sentenceSpan.className = 'reader-sentence';
        sentenceSpan.dataset.pageNumber = pNum.toString();
        sentenceSpan.textContent = sText + ' ';

        pEl.appendChild(sentenceSpan);
      }

      if (pEl.children.length > 0) {
        pageBlock.appendChild(pEl);
      }
    }

    // Save cleaned page edits persistently to storage
    saveCleanedPageToStorage(currentDocTitle, pNum, cleanedParas, originalParagraphs);

    // Re-index all sentences in global array
    rebuildAllReaderSentences();

    // Update UI state
    if (aiBtn) {
      aiBtn.classList.remove('loading');
      aiBtn.innerHTML = `<span class="ai-badge">✨ AI Cleaned</span>`;
    }
    if (revertBtn) {
      revertBtn.style.display = 'inline-flex';
    }

  } catch (err: any) {
    console.error('Gemini cleaning error:', err);
    alert(`Gemini AI Cleaning Error: ${err.message || err.toString()}`);
    if (aiBtn) {
      aiBtn.classList.remove('loading');
      aiBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z"/></svg><span>Clean with AI</span>`;
    }
  }
}

// Revert Page to Original Text
function revertPageText(pNum: number) {
  const pageBlock = document.getElementById(`reader-page-block-${pNum}`);
  if (!pageBlock || !pageBlock.dataset.originalParagraphs) return;

  const originalParagraphs: string[] = JSON.parse(pageBlock.dataset.originalParagraphs);
  const existingParas = Array.from(pageBlock.querySelectorAll('p.reader-paragraph'));
  existingParas.forEach(p => p.remove());

  for (const paraText of originalParagraphs) {
    const pEl = document.createElement('p');
    pEl.className = 'reader-paragraph';

    const sentenceRegex = /[^.!?]+[.!?]+(?:\s+|$)|[^.!?]+$/g;
    let match;

    while ((match = sentenceRegex.exec(paraText)) !== null) {
      const sText = match[0].trim();
      if (sText.length === 0) continue;

      const sentenceSpan = document.createElement('span');
      sentenceSpan.className = 'reader-sentence';
      sentenceSpan.dataset.pageNumber = pNum.toString();
      sentenceSpan.textContent = sText + ' ';

      pEl.appendChild(sentenceSpan);
    }

    if (pEl.children.length > 0) {
      pageBlock.appendChild(pEl);
    }
  }

  // Remove from storage
  removeCleanedPageFromStorage(currentDocTitle, pNum);

  rebuildAllReaderSentences();

  const aiBtn = pageBlock.querySelector('.page-ai-btn') as HTMLButtonElement | null;
  const revertBtn = pageBlock.querySelector('.page-revert-btn') as HTMLButtonElement | null;

  if (aiBtn) {
    aiBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z"/></svg><span>Clean with AI</span>`;
  }
  if (revertBtn) {
    revertBtn.style.display = 'none';
  }
}

// Rebuild All Sentences for Seamless TTS
function rebuildAllReaderSentences() {
  allSentences = [];
  const spans = Array.from(readerContent.querySelectorAll('.reader-sentence')) as HTMLElement[];
  let counter = 0;
  for (const span of spans) {
    const sIndex = counter++;
    span.id = `rs-${sIndex}`;
    span.dataset.sentenceIndex = sIndex.toString();
    const pageNum = parseInt(span.dataset.pageNumber || '1', 10);
    const sText = (span.textContent || '').trim();

    span.onclick = (e) => {
      e.stopPropagation();
      playSentenceAtIndex(sIndex);
    };

    allSentences.push({
      id: `s_${sIndex}`,
      pageNumber: pageNum,
      text: sText,
      element: null,
      readerElement: span,
      startOffsetInEl: 0,
      endOffsetInEl: sText.length
    });
  }
}

// Render Generic Structured Document to Reader Mode
async function renderGenericDocumentToReader(title: string, sections: { pageNum: number; title: string; paragraphs: string[] }[]) {
  readerContent.innerHTML = '';
  sidebarPageList.innerHTML = '';
  pagesContainer.innerHTML = '';
  pagesData = [];
  allSentences = [];
  activeSentenceIndex = -1;
  currentDocTitle = title;

  pageNumInput.max = sections.length.toString();
  pageCountSpan.textContent = sections.length.toString();
  pageNumInput.value = '1';
  readerPageInfo.textContent = `${sections.length} pages / sections`;

  const cleanDocName = title.replace(/\.[a-zA-Z0-9]+$/i, '');
  docTitle.textContent = title;
  readerBookTitle.textContent = cleanDocName;
  docInfo.style.display = 'flex';
  dropZone.style.display = 'none';
  navControls.style.display = 'flex';
  setViewMode('reader');

  // Load any previously saved AI cleaned edits for this document
  const savedCleanedPages = await getSavedCleanedDoc(currentDocTitle);

  let totalWordCount = 0;
  let sentenceCounter = 0;

  for (const sec of sections) {
    const pNum = sec.pageNum;
    const hasSavedCleaned = !!savedCleanedPages[pNum];
    const parasToRender = hasSavedCleaned ? savedCleanedPages[pNum].cleaned : sec.paragraphs;

    // Sidebar item
    const sidebarItem = document.createElement('div');
    sidebarItem.className = 'sidebar-page-item';
    sidebarItem.id = `spi-${pNum}`;
    sidebarItem.dataset.pageNumber = pNum.toString();

    const previewSnippet = parasToRender[0]?.slice(0, 70) || sec.title;
    const pageWords = parasToRender.reduce((sum, p) => sum + p.split(/\s+/).length, 0);

    sidebarItem.innerHTML = `
      <div class="spi-header">
        <span class="spi-badge">P.${pNum}</span>
        <span class="spi-words">${pageWords} words</span>
      </div>
      <div class="spi-snippet">${escapeHtml(sec.title || previewSnippet)}</div>
    `;

    sidebarItem.addEventListener('click', () => {
      jumpToPage(pNum);
    });
    sidebarPageList.appendChild(sidebarItem);

    // Page Block in Reader Content
    const pageBlock = document.createElement('div');
    pageBlock.className = 'reader-page-block';
    pageBlock.id = `reader-page-block-${pNum}`;
    pageBlock.dataset.pageNumber = pNum.toString();

    if (hasSavedCleaned) {
      pageBlock.dataset.originalParagraphs = JSON.stringify(savedCleanedPages[pNum].original);
    }

    const pageHeader = createPageHeader(pNum, sec.title);
    if (hasSavedCleaned) {
      const aiBtn = pageHeader.querySelector('.page-ai-btn');
      const revertBtn = pageHeader.querySelector('.page-revert-btn') as HTMLElement;
      if (aiBtn) aiBtn.innerHTML = `<span class="ai-badge">✨ AI Cleaned</span>`;
      if (revertBtn) revertBtn.style.display = 'inline-flex';
    }
    pageBlock.appendChild(pageHeader);

    for (const paraText of parasToRender) {
      const pEl = document.createElement('p');
      pEl.className = 'reader-paragraph';

      const sentenceRegex = /[^.!?]+[.!?]+(?:\s+|$)|[^.!?]+$/g;
      let match;

      while ((match = sentenceRegex.exec(paraText)) !== null) {
        const sText = match[0].trim();
        if (sText.length === 0) continue;

        const sIndex = sentenceCounter++;
        const sentenceSpan = document.createElement('span');
        sentenceSpan.className = 'reader-sentence';
        sentenceSpan.id = `rs-${sIndex}`;
        sentenceSpan.dataset.sentenceIndex = sIndex.toString();
        sentenceSpan.dataset.pageNumber = pNum.toString();
        sentenceSpan.textContent = sText + ' ';

        sentenceSpan.addEventListener('click', (e) => {
          e.stopPropagation();
          playSentenceAtIndex(sIndex);
        });

        pEl.appendChild(sentenceSpan);

        allSentences.push({
          id: `s_${sIndex}`,
          pageNumber: pNum,
          text: sText,
          element: null,
          readerElement: sentenceSpan,
          startOffsetInEl: 0,
          endOffsetInEl: sText.length
        });

        totalWordCount += sText.split(/\s+/).length;
      }

      if (pEl.children.length > 0) {
        pageBlock.appendChild(pEl);
      }
    }

    if (pageBlock.children.length > 1) {
      readerContent.appendChild(pageBlock);
    }
  }

  readerWordCount.textContent = `~${totalWordCount.toLocaleString()} words`;
  highlightActiveSidebarPage(1);
  hideLoading();
}

// 1. Plain Text Loader (.txt)
async function loadTextFile(file: File) {
  showLoading(`Reading ${file.name}...`);
  const text = await file.text();
  const rawParas = text.split(/\r?\n\s*\r?\n+/).map(p => p.trim()).filter(p => p.length > 0);

  const sections: { pageNum: number; title: string; paragraphs: string[] }[] = [];
  let curParas: string[] = [];
  let curWords = 0;
  let pageCounter = 1;

  for (const p of rawParas) {
    const words = p.split(/\s+/).length;
    if (curWords + words > 350 && curParas.length > 0) {
      sections.push({ pageNum: pageCounter++, title: `Section ${sections.length + 1}`, paragraphs: curParas });
      curParas = [];
      curWords = 0;
    }
    curParas.push(p);
    curWords += words;
  }
  if (curParas.length > 0) {
    sections.push({ pageNum: pageCounter++, title: `Section ${sections.length + 1}`, paragraphs: curParas });
  }

  renderGenericDocumentToReader(file.name, sections.length > 0 ? sections : [{ pageNum: 1, title: file.name, paragraphs: [text || 'Empty file.'] }]);
}

// 2. Microsoft Word Document Loader (.docx)
async function loadDocxFile(file: File) {
  showLoading(`Converting Word document (${file.name})...`);
  const arrayBuffer = await file.arrayBuffer();
  const result = await mammoth.convertToHtml({ arrayBuffer });
  const html = result.value;

  const parser = new DOMParser();
  const doc = parser.parseFromString(`<div>${html}</div>`, 'text/html');
  const elements = Array.from(doc.body.firstElementChild?.children || []);

  const sections: { pageNum: number; title: string; paragraphs: string[] }[] = [];
  let curTitle = 'Beginning';
  let curParas: string[] = [];
  let curWords = 0;
  let pageCounter = 1;

  for (const el of elements) {
    const tag = el.tagName.toLowerCase();
    const text = el.textContent?.trim() || '';
    if (!text) continue;

    if (tag === 'h1' || tag === 'h2' || tag === 'h3') {
      if (curParas.length > 0) {
        sections.push({ pageNum: pageCounter++, title: curTitle, paragraphs: curParas });
        curParas = [];
        curWords = 0;
      }
      curTitle = text;
    } else {
      const words = text.split(/\s+/).length;
      if (curWords + words > 400 && curParas.length > 0) {
        sections.push({ pageNum: pageCounter++, title: curTitle, paragraphs: curParas });
        curParas = [];
        curWords = 0;
      }
      curParas.push(text);
      curWords += words;
    }
  }
  if (curParas.length > 0) {
    sections.push({ pageNum: pageCounter++, title: curTitle, paragraphs: curParas });
  }

  renderGenericDocumentToReader(file.name, sections.length > 0 ? sections : [{ pageNum: 1, title: file.name, paragraphs: ['No text found in Word document.'] }]);
}

// 3. Markdown Document Loader (.md, .markdown)
async function loadMarkdownFile(file: File) {
  showLoading(`Rendering Markdown (${file.name})...`);
  const rawMd = await file.text();
  const lines = rawMd.split(/\r?\n/);

  const sections: { pageNum: number; title: string; paragraphs: string[] }[] = [];
  let curTitle = 'Introduction';
  let curPara = '';
  let curParas: string[] = [];
  let pageCounter = 1;

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith('#')) {
      if (curPara.trim()) {
        curParas.push(curPara.trim());
        curPara = '';
      }
      if (curParas.length > 0) {
        sections.push({ pageNum: pageCounter++, title: curTitle, paragraphs: curParas });
        curParas = [];
      }
      curTitle = trimmed.replace(/^#+\s*/, '');
    } else if (!trimmed) {
      if (curPara.trim()) {
        curParas.push(curPara.trim());
        curPara = '';
      }
    } else {
      if (curPara) curPara += ' ';
      curPara += trimmed;
    }
  }
  if (curPara.trim()) curParas.push(curPara.trim());
  if (curParas.length > 0) {
    sections.push({ pageNum: pageCounter++, title: curTitle, paragraphs: curParas });
  }

  renderGenericDocumentToReader(file.name, sections.length > 0 ? sections : [{ pageNum: 1, title: file.name, paragraphs: [rawMd || 'Empty markdown file.'] }]);
}

// 4. EPUB E-Book Loader (.epub)
async function loadEpubFile(file: File) {
  showLoading(`Unpacking EPUB book (${file.name})...`);
  const arrayBuffer = await file.arrayBuffer();
  const zip = await JSZip.loadAsync(arrayBuffer);

  let opfPath = 'OEBPS/content.opf';
  const containerFile = zip.file('META-INF/container.xml');
  if (containerFile) {
    const containerXml = await containerFile.async('text');
    const match = containerXml.match(/full-path="([^"]+)"/);
    if (match && match[1]) opfPath = match[1];
  }

  let opfFile = zip.file(opfPath);
  if (!opfFile) {
    const matchingFiles = zip.file(/\.opf$/i);
    if (matchingFiles.length > 0) {
      opfFile = matchingFiles[0];
    }
  }

  if (!opfFile) {
    throw new Error('Invalid EPUB file: content.opf not found.');
  }

  const opfDir = opfFile.name.includes('/') ? opfFile.name.substring(0, opfFile.name.lastIndexOf('/') + 1) : '';
  const opfXml = await opfFile.async('text');
  const parser = new DOMParser();
  const opfDoc = parser.parseFromString(opfXml, 'application/xml');

  const manifestItems = new Map<string, string>();
  const itemEls = Array.from(opfDoc.querySelectorAll('manifest > item'));
  for (const it of itemEls) {
    const id = it.getAttribute('id') || '';
    const href = it.getAttribute('href') || '';
    if (id && href) manifestItems.set(id, opfDir + href);
  }

  const itemRefs = Array.from(opfDoc.querySelectorAll('spine > itemref'));
  const chapterPaths: string[] = [];
  for (const ref of itemRefs) {
    const idref = ref.getAttribute('idref') || '';
    const path = manifestItems.get(idref);
    if (path) chapterPaths.push(path);
  }

  if (chapterPaths.length === 0) {
    for (const [, path] of manifestItems) {
      if (/\.(html|xhtml|htm)$/i.test(path)) chapterPaths.push(path);
    }
  }

  const sections: { pageNum: number; title: string; paragraphs: string[] }[] = [];
  let pageCounter = 1;

  for (const chPath of chapterPaths) {
    const chFile = zip.file(chPath) || zip.file(decodeURIComponent(chPath));
    if (!chFile) continue;

    const chContent = await chFile.async('text');
    const chDoc = parser.parseFromString(chContent, 'text/html');

    const titleEl = chDoc.querySelector('h1, h2, h3, title');
    const chTitle = titleEl?.textContent?.trim() || `Chapter ${pageCounter}`;

    const paragraphs: string[] = [];
    const pEls = Array.from(chDoc.querySelectorAll('p, blockquote, li, h1, h2, h3, h4'));
    for (const p of pEls) {
      const t = p.textContent?.trim();
      if (t && t.length > 0) paragraphs.push(t);
    }

    if (paragraphs.length > 0) {
      sections.push({
        pageNum: pageCounter++,
        title: chTitle,
        paragraphs
      });
    }
  }

  renderGenericDocumentToReader(file.name, sections.length > 0 ? sections : [{ pageNum: 1, title: file.name, paragraphs: ['No chapters found in EPUB.'] }]);
}

// 5. HTML Document Loader (.html, .htm)
async function loadHtmlFile(file: File) {
  showLoading(`Parsing HTML (${file.name})...`);
  const htmlText = await file.text();
  const parser = new DOMParser();
  const doc = parser.parseFromString(htmlText, 'text/html');

  const title = doc.querySelector('title, h1')?.textContent?.trim() || file.name;
  const pEls = Array.from(doc.querySelectorAll('p, blockquote, li, h1, h2, h3'));
  const paragraphs = pEls.map(p => p.textContent?.trim() || '').filter(p => p.length > 0);

  const sections: { pageNum: number; title: string; paragraphs: string[] }[] = [];
  let curParas: string[] = [];
  let curWords = 0;
  let pageCounter = 1;

  for (const p of paragraphs) {
    const words = p.split(/\s+/).length;
    if (curWords + words > 400 && curParas.length > 0) {
      sections.push({ pageNum: pageCounter++, title: `Page ${sections.length + 1}`, paragraphs: curParas });
      curParas = [];
      curWords = 0;
    }
    curParas.push(p);
    curWords += words;
  }
  if (curParas.length > 0) {
    sections.push({ pageNum: pageCounter++, title: `Page ${sections.length + 1}`, paragraphs: curParas });
  }

  renderGenericDocumentToReader(file.name, sections.length > 0 ? sections : [{ pageNum: 1, title, paragraphs: ['No readable text found in HTML.'] }]);
}

// Load PDF from File
async function loadPDFFile(file: File) {
  stopPlayback();
  showLoading(`Loading ${file.name}...`);
  currentDocTitle = file.name;

  const cleanDocName = file.name.replace(/\.pdf$/i, '');
  docTitle.textContent = file.name;
  readerBookTitle.textContent = cleanDocName;
  docInfo.style.display = 'flex';
  dropZone.style.display = 'none';
  navControls.style.display = 'flex';

  // Set reader mode active by default
  setViewMode(currentViewMode);

  try {
    const rawBuffer = await file.arrayBuffer();
    const uint8Data = new Uint8Array(rawBuffer);

    const loadingTask = pdfjsLib.getDocument({
      data: uint8Data,
      wasmUrl: chrome.runtime.getURL('wasm/'),
      cMapUrl: chrome.runtime.getURL('cmaps/'),
      cMapPacked: true,
      standardFontDataUrl: chrome.runtime.getURL('standard_fonts/'),
      iccUrl: chrome.runtime.getURL('iccs/'),
      isEvalSupported: false,
      useWasm: true
    });

    loadingTask.onPassword = (updatePassword: (pwd: string) => void, reason: number) => {
      const pwd = prompt('This PDF is password protected. Please enter password:');
      if (pwd) {
        updatePassword(pwd);
      } else {
        hideLoading();
        alert('Password required to open this PDF.');
      }
    };

    loadingTask.onProgress = (progressData: { loaded: number, total: number }) => {
      if (progressData.total > 0) {
        const pct = Math.round((progressData.loaded / progressData.total) * 100);
        showLoading(`Loading PDF: ${pct}%`);
      }
    };

    pdfDoc = await loadingTask.promise;

    pageNumInput.max = pdfDoc.numPages.toString();
    pageCountSpan.textContent = pdfDoc.numPages.toString();
    pageNumInput.value = '1';
    readerPageInfo.textContent = `${pdfDoc.numPages} pages`;

    pagesContainer.innerHTML = '';
    readerContent.innerHTML = '';
    pagesData = [];
    allSentences = [];
    activeSentenceIndex = -1;

    setupObserver();

    // Fast initial page dimensions calculation from first page
    const samplePage = await pdfDoc.getPage(1);
    const sampleViewport = samplePage.getViewport({ scale: currentScale });
    const defaultWidth = Math.floor(sampleViewport.width);
    const defaultHeight = Math.floor(sampleViewport.height);

    // Create page shells for canvas view
    for (let i = 1; i <= pdfDoc.numPages; i++) {
      const wrapper = document.createElement('div');
      wrapper.className = 'pdf-page-wrapper';
      wrapper.id = `pdf-page-${i}`;
      wrapper.dataset.pageNumber = i.toString();
      wrapper.style.width = `${defaultWidth}px`;
      wrapper.style.height = `${defaultHeight}px`;

      const canvas = document.createElement('canvas');
      canvas.className = 'pdf-page-canvas';
      wrapper.appendChild(canvas);

      const textLayerDiv = document.createElement('div');
      textLayerDiv.className = 'pdf-text-layer textLayer';
      wrapper.appendChild(textLayerDiv);

      pagesContainer.appendChild(wrapper);

      const pageData: PageData = {
        pageNumber: i,
        pageProxy: i === 1 ? samplePage : null,
        wrapper,
        canvas,
        textLayerDiv,
        sentences: [],
        isRendered: false,
        isRendering: false,
        renderTask: null
      };

      pagesData.push(pageData);
      if (pageObserver) {
        pageObserver.observe(wrapper);
      }
    }

    hideLoading();

    // Immediately render initial pages for canvas view in background
    renderPage(pagesData[0]);
    if (pagesData[1]) renderPage(pagesData[1]);

    // Build Reader Mode with clean formatted text
    await buildReaderMode(pdfDoc);

  } catch (err: any) {
    console.error('Error loading PDF:', err);
    hideLoading();
    dropZone.style.display = 'flex';
    pdfViewer.style.display = 'none';
    readerModeView.style.display = 'none';
    navControls.style.display = 'none';
    docInfo.style.display = 'none';
    alert('Failed to load PDF: ' + (err.message || err.toString()));
  }
}

// Build Distraction-Free Reader Mode
async function buildReaderMode(doc: pdfjsLib.PDFDocumentProxy) {
  readerContent.innerHTML = '';
  sidebarPageList.innerHTML = '';
  allSentences = [];
  let totalWordCount = 0;
  let sentenceCounter = 0;

  // Load previously saved AI cleaned edits for this PDF
  const savedCleanedPages = await getSavedCleanedDoc(currentDocTitle);

  for (let pNum = 1; pNum <= doc.numPages; pNum++) {
    if (pdfDoc !== doc) break;

    try {
      const page = await doc.getPage(pNum);
      const textContent = await page.getTextContent();
      if (!textContent || !textContent.items || textContent.items.length === 0) {
        continue;
      }

      // Group text items into paragraphs
      const paragraphs: string[] = [];
      let currentPara = '';
      let lastY: number | null = null;

      for (const rawItem of textContent.items) {
        const item = rawItem as any;
        const str = item.str || '';
        if (!str.trim() && !str.includes(' ')) continue;

        const y = item.transform ? item.transform[5] : null;
        if (lastY !== null && y !== null) {
          const dy = Math.abs(y - lastY);
          if (dy > 18) {
            // Paragraph break
            if (currentPara.trim()) {
              paragraphs.push(currentPara.trim());
              currentPara = '';
            }
          } else if (dy > 3) {
            // Line break within paragraph
            if (currentPara && !currentPara.endsWith(' ') && !currentPara.endsWith('-')) {
              currentPara += ' ';
            } else if (currentPara.endsWith('-')) {
              // De-hyphenate line break
              currentPara = currentPara.slice(0, -1);
            }
          } else {
            if (currentPara && !currentPara.endsWith(' ')) {
              currentPara += ' ';
            }
          }
        }
        currentPara += str;
        lastY = y;
      }

      if (currentPara.trim()) {
        paragraphs.push(currentPara.trim());
      }

      if (paragraphs.length === 0) continue;

      const hasSavedCleaned = !!savedCleanedPages[pNum];
      const parasToRender = hasSavedCleaned ? savedCleanedPages[pNum].cleaned : paragraphs;

      // Create Sidebar Item for this page
      const sidebarItem = document.createElement('div');
      sidebarItem.className = 'sidebar-page-item';
      sidebarItem.id = `spi-${pNum}`;
      sidebarItem.dataset.pageNumber = pNum.toString();

      const previewSnippet = parasToRender[0]?.slice(0, 70) || `Page ${pNum}`;
      const pageWords = parasToRender.reduce((sum, p) => sum + p.split(/\s+/).length, 0);

      sidebarItem.innerHTML = `
        <div class="spi-header">
          <span class="spi-badge">Page ${pNum}</span>
          <span class="spi-words">${pageWords} words</span>
        </div>
        <div class="spi-snippet">${escapeHtml(previewSnippet)}</div>
      `;

      sidebarItem.addEventListener('click', () => {
        jumpToPage(pNum);
      });

      sidebarPageList.appendChild(sidebarItem);

      // Create Page Block in Reader View
      const pageBlock = document.createElement('div');
      pageBlock.className = 'reader-page-block';
      pageBlock.id = `reader-page-block-${pNum}`;
      pageBlock.dataset.pageNumber = pNum.toString();

      if (hasSavedCleaned) {
        pageBlock.dataset.originalParagraphs = JSON.stringify(savedCleanedPages[pNum].original);
      }

      const pageHeader = createPageHeader(pNum);
      if (hasSavedCleaned) {
        const aiBtn = pageHeader.querySelector('.page-ai-btn');
        const revertBtn = pageHeader.querySelector('.page-revert-btn') as HTMLElement;
        if (aiBtn) aiBtn.innerHTML = `<span class="ai-badge">✨ AI Cleaned</span>`;
        if (revertBtn) revertBtn.style.display = 'inline-flex';
      }
      pageBlock.appendChild(pageHeader);

      for (const paraText of parasToRender) {
        const pEl = document.createElement('p');
        pEl.className = 'reader-paragraph';

        const sentenceRegex = /[^.!?]+[.!?]+(?:\s+|$)|[^.!?]+$/g;
        let match;

        while ((match = sentenceRegex.exec(paraText)) !== null) {
          const sText = match[0].trim();
          if (sText.length === 0) continue;

          const sIndex = sentenceCounter++;
          const sentenceSpan = document.createElement('span');
          sentenceSpan.className = 'reader-sentence';
          sentenceSpan.id = `rs-${sIndex}`;
          sentenceSpan.dataset.sentenceIndex = sIndex.toString();
          sentenceSpan.dataset.pageNumber = pNum.toString();
          sentenceSpan.textContent = sText + ' ';

          // Click on sentence to play immediately
          sentenceSpan.addEventListener('click', (e) => {
            e.stopPropagation();
            playSentenceAtIndex(sIndex);
          });

          pEl.appendChild(sentenceSpan);

          const sentenceItem: SentenceItem = {
            id: `s_${sIndex}`,
            pageNumber: pNum,
            text: sText,
            element: null,
            readerElement: sentenceSpan,
            startOffsetInEl: 0,
            endOffsetInEl: sText.length
          };

          allSentences.push(sentenceItem);

          // Word count approximation
          totalWordCount += sText.split(/\s+/).length;
        }

        if (pEl.children.length > 0) {
          pageBlock.appendChild(pEl);
        }
      }

      if (pageBlock.children.length > 1) {
        readerContent.appendChild(pageBlock);
      }

      // Update word count display progressively
      if (pNum % 10 === 0 || pNum === doc.numPages) {
        readerWordCount.textContent = `~${totalWordCount.toLocaleString()} words`;
        await new Promise(r => setTimeout(r, 0));
      }

    } catch (pageErr) {
      console.warn(`Error reading page ${pNum} text:`, pageErr);
    }
  }

  readerWordCount.textContent = `~${totalWordCount.toLocaleString()} words`;
  highlightActiveSidebarPage(1);
}

// Render Page for Canvas View (lazy loaded via IntersectionObserver or on-demand)
async function renderPage(pData: PageData): Promise<void> {
  if (pData.isRendering || pData.isRendered) return;
  pData.isRendering = true;

  try {
    if (!pData.pageProxy && pdfDoc) {
      pData.pageProxy = await pdfDoc.getPage(pData.pageNumber);
    }
    if (!pData.pageProxy) return;

    const outputScale = window.devicePixelRatio || 1;
    const renderViewport = pData.pageProxy.getViewport({ scale: currentScale * outputScale });
    const textViewport = pData.pageProxy.getViewport({ scale: currentScale });

    pData.wrapper.style.width = `${Math.floor(textViewport.width)}px`;
    pData.wrapper.style.height = `${Math.floor(textViewport.height)}px`;

    pData.canvas.width = Math.floor(renderViewport.width);
    pData.canvas.height = Math.floor(renderViewport.height);
    pData.canvas.style.width = `${Math.floor(textViewport.width)}px`;
    pData.canvas.style.height = `${Math.floor(textViewport.height)}px`;

    const ctx = pData.canvas.getContext('2d')!;

    if (pData.renderTask) {
      try {
        pData.renderTask.cancel();
      } catch (_) {}
    }

    pData.renderTask = pData.pageProxy.render({
      canvasContext: ctx,
      viewport: renderViewport
    });

    await pData.renderTask.promise;
    pData.renderTask = null;

    // Render Text Layer
    try {
      pData.textLayerDiv.innerHTML = '';
      const textContent = await pData.pageProxy.getTextContent();
      if (textContent && textContent.items && textContent.items.length > 0) {
        const textLayer = new pdfjsLib.TextLayer({
          textContentSource: textContent,
          container: pData.textLayerDiv,
          viewport: textViewport
        });
        await textLayer.render();
      }
    } catch (textErr) {
      console.warn(`Text layer warning on page ${pData.pageNumber}:`, textErr);
    }

    pData.isRendered = true;

  } catch (renderErr: any) {
    if (renderErr?.name !== 'RenderingCancelledException') {
      console.error(`Error rendering page ${pData.pageNumber}:`, renderErr);
    }
  } finally {
    pData.isRendering = false;
  }
}

// Apply zoom scale changes efficiently for Canvas Mode
function applyScaleChange() {
  if (!pdfDoc) return;
  zoomLevelSpan.textContent = `${Math.round(currentScale * 100)}%`;

  for (const pData of pagesData) {
    pData.isRendered = false;
    if (pData.pageProxy) {
      const vp = pData.pageProxy.getViewport({ scale: currentScale });
      pData.wrapper.style.width = `${Math.floor(vp.width)}px`;
      pData.wrapper.style.height = `${Math.floor(vp.height)}px`;
    }
  }

  // Render visible pages in new scale
  const viewerRect = pdfViewer.getBoundingClientRect();
  for (const pData of pagesData) {
    const rect = pData.wrapper.getBoundingClientRect();
    if (rect.bottom >= viewerRect.top - 300 && rect.top <= viewerRect.bottom + 300) {
      renderPage(pData);
    }
  }
}

// Zoom Controls
zoomInBtn.addEventListener('click', () => {
  currentScale = Math.min(currentScale + 0.25, 3.0);
  applyScaleChange();
});

zoomOutBtn.addEventListener('click', () => {
  currentScale = Math.max(currentScale - 0.25, 0.5);
  applyScaleChange();
});

fitWidthBtn.addEventListener('click', async () => {
  if (pagesData.length === 0 || !pdfDoc) return;
  const firstPageData = pagesData[0];
  if (!firstPageData.pageProxy) {
    firstPageData.pageProxy = await pdfDoc.getPage(1);
  }
  const unscaledViewport = firstPageData.pageProxy.getViewport({ scale: 1.0 });
  const containerWidth = pdfViewer.clientWidth - 48;
  if (containerWidth > 200) {
    currentScale = containerWidth / unscaledViewport.width;
    applyScaleChange();
  }
});

// Page Navigation
prevPageBtn.addEventListener('click', () => {
  const cur = parseInt(pageNumInput.value, 10);
  if (cur > 1) jumpToPage(cur - 1);
});

nextPageBtn.addEventListener('click', () => {
  if (!pdfDoc) return;
  const cur = parseInt(pageNumInput.value, 10);
  if (cur < pdfDoc.numPages) jumpToPage(cur + 1);
});

pageNumInput.addEventListener('change', () => {
  if (!pdfDoc) return;
  let target = parseInt(pageNumInput.value, 10);
  if (isNaN(target) || target < 1) target = 1;
  if (target > pdfDoc.numPages) target = pdfDoc.numPages;
  jumpToPage(target);
});

function highlightActiveSidebarPage(pageNum: number) {
  const prev = sidebarPageList.querySelector('.sidebar-page-item.active');
  if (prev) prev.classList.remove('active');

  const cur = document.getElementById(`spi-${pageNum}`);
  if (cur) {
    cur.classList.add('active');
    cur.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }
}

async function jumpToPage(num: number) {
  pageNumInput.value = num.toString();
  highlightActiveSidebarPage(num);
  if (currentViewMode === 'reader') {
    const pageBlock = document.getElementById(`reader-page-block-${num}`);
    if (pageBlock) {
      pageBlock.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  } else {
    const pData = pagesData[num - 1];
    if (pData) {
      pData.wrapper.scrollIntoView({ behavior: 'smooth', block: 'start' });
      if (!pData.isRendered) {
        await renderPage(pData);
      }
    }
  }
}

// Track visible page on scroll in PDF mode
pdfViewer.addEventListener('scroll', () => {
  if (pagesData.length === 0) return;
  let closestPage = 1;
  let minDiff = Infinity;
  const viewerRect = pdfViewer.getBoundingClientRect();

  for (const pData of pagesData) {
    const pageRect = pData.wrapper.getBoundingClientRect();
    const diff = Math.abs(pageRect.top - viewerRect.top);
    if (diff < minDiff) {
      minDiff = diff;
      closestPage = pData.pageNumber;
    }
  }

  if (parseInt(pageNumInput.value, 10) !== closestPage) {
    pageNumInput.value = closestPage.toString();
    highlightActiveSidebarPage(closestPage);
  }
});

// Track visible page on scroll in Reader mode
readerModeView.addEventListener('scroll', () => {
  const pageBlocks = Array.from(readerContent.querySelectorAll('.reader-page-block')) as HTMLElement[];
  if (pageBlocks.length === 0) return;

  const viewRect = readerModeView.getBoundingClientRect();
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

  if (parseInt(pageNumInput.value, 10) !== closestPage) {
    pageNumInput.value = closestPage.toString();
    highlightActiveSidebarPage(closestPage);
  }
});

// Sentence Range for Highlight
function createRangeForSentence(sentence: SentenceItem): Range | null {
  const targetEl = currentViewMode === 'reader' ? sentence.readerElement : (sentence.element || sentence.readerElement);
  if (!targetEl) return null;

  const range = document.createRange();
  const textNode = targetEl.firstChild;
  if (!textNode || textNode.nodeType !== Node.TEXT_NODE) {
    try {
      range.selectNodeContents(targetEl);
      return range;
    } catch (e) {
      return null;
    }
  }

  try {
    const maxLen = textNode.textContent?.length || 0;
    const start = Math.min(sentence.startOffsetInEl, maxLen);
    const end = Math.min(sentence.endOffsetInEl, maxLen);
    range.setStart(textNode, start);
    range.setEnd(textNode, end);
    return range;
  } catch (e) {
    try {
      range.selectNodeContents(targetEl);
      return range;
    } catch (_) {
      return null;
    }
  }
}

function clearSentenceHover() {
  if ('highlights' in CSS) {
    (CSS as any).highlights.delete('aura-sentence-hover');
  }
  hoveredSentence = null;
  lastHoveredSentence = null;
  hoverPlayButton.style.opacity = '0';
  hoverPlayButton.style.pointerEvents = 'none';
}

function clearActiveHighlights() {
  if ('highlights' in CSS) {
    (CSS as any).highlights.delete('edge-tts-highlight');
    (CSS as any).highlights.delete('aura-sentence-active');
  }
  const prevActive = readerContent.querySelectorAll('.reader-sentence.active-tts');
  prevActive.forEach(el => el.classList.remove('active-tts'));
}

// Mousemove for Sentence Hover & Play button in Canvas Mode
pdfViewer.addEventListener('mousemove', (e) => {
  if (isLoadingTTS) return;
  const target = e.target as HTMLElement;
  const textSpan = target.closest('.textLayer span') as HTMLElement | null;

  if (target === hoverPlayButton || hoverPlayButton.contains(target)) return;

  if (textSpan) {
    const matched = allSentences.find(s => s.element === textSpan);
    if (matched) {
      if (matched !== lastHoveredSentence) {
        lastHoveredSentence = matched;
        hoveredSentence = matched;

        const range = createRangeForSentence(matched);
        if (range && 'highlights' in CSS) {
          const highlight = new (window as any).Highlight(range);
          (CSS as any).highlights.set('aura-sentence-hover', highlight);
        }

        const rect = textSpan.getBoundingClientRect();
        hoverPlayButton.style.top = `${rect.top + window.scrollY}px`;
        hoverPlayButton.style.left = `${rect.left + window.scrollX - 28}px`;
        hoverPlayButton.style.opacity = '1';
        hoverPlayButton.style.pointerEvents = 'auto';
        hoverPlayButton.innerHTML = (isPlaying && activeSentenceIndex === allSentences.indexOf(matched)) ? PAUSE_SVG : PLAY_SVG;
      }
      return;
    }
  }

  clearSentenceHover();
});

// Click to play sentence from hover button
hoverPlayButton.addEventListener('click', (e) => {
  e.stopPropagation();
  if (hoveredSentence) {
    const idx = allSentences.indexOf(hoveredSentence);
    if (idx !== -1) {
      if (isPlaying && activeSentenceIndex === idx) {
        pausePlayback();
      } else {
        playSentenceAtIndex(idx);
      }
    }
  }
});

// Main Toolbar Play Controls
ttsPlayBtn.addEventListener('click', () => {
  if (isPlaying) {
    pausePlayback();
  } else {
    if (activeSentenceIndex >= 0 && activeSentenceIndex < allSentences.length) {
      playSentenceAtIndex(activeSentenceIndex);
    } else {
      const curPage = parseInt(pageNumInput.value, 10);
      let targetSentenceIdx = allSentences.findIndex(s => s.pageNumber >= curPage);
      if (targetSentenceIdx === -1 && allSentences.length > 0) {
        targetSentenceIdx = 0;
      }
      if (targetSentenceIdx !== -1) {
        playSentenceAtIndex(targetSentenceIdx);
      } else {
        alert('No readable text found. Please upload a valid document.');
      }
    }
  }
});

ttsStopBtn.addEventListener('click', () => {
  stopPlayback();
});

ttsPrevBtn.addEventListener('click', () => {
  if (activeSentenceIndex > 0) {
    playSentenceAtIndex(activeSentenceIndex - 1);
  }
});

ttsNextBtn.addEventListener('click', () => {
  if (activeSentenceIndex + 1 < allSentences.length) {
    playSentenceAtIndex(activeSentenceIndex + 1);
  }
});

function setPlayState(playing: boolean) {
  isPlaying = playing;
  if (playing) {
    ttsPlayBtn.classList.add('playing');
    ttsPlayIcon.innerHTML = `<rect x="6" y="4" width="4" height="16"></rect><rect x="14" y="4" width="4" height="16"></rect>`;
  } else {
    ttsPlayBtn.classList.remove('playing');
    ttsPlayIcon.innerHTML = `<polygon points="5 3 19 12 5 21 5 3"></polygon>`;
  }
}

function pausePlayback() {
  if (activePort) {
    activePort.postMessage({ type: "PAUSE" });
  }
  setPlayState(false);
  if (currentHighlightTick) clearInterval(currentHighlightTick);
}

function stopPlayback() {
  if (activePort) {
    activePort.postMessage({ type: "STOP" });
    activePort.disconnect();
    activePort = null;
  }
  setPlayState(false);
  isLoadingTTS = false;
  activeSentenceIndex = -1;
  clearActiveHighlights();
  clearSentenceHover();
  if (currentHighlightTick) clearInterval(currentHighlightTick);
}

// Universal Playback Function for Reader & Canvas Views
async function playSentenceAtIndex(idx: number) {
  if (idx < 0 || idx >= allSentences.length) {
    stopPlayback();
    return;
  }

  const sentence = allSentences[idx];
  stopPlayback();
  activeSentenceIndex = idx;
  isLoadingTTS = true;
  currentAudioTime = 0;
  activeWordBoundaries = [];

  const rateString = currentRate[0] >= 0 ? `+${currentRate[0]}%` : `${currentRate[0]}%`;

  // Reader Mode Active Element
  if (sentence.readerElement) {
    sentence.readerElement.classList.add('active-tts');
    if (isAutoScrollEnabled) {
      sentence.readerElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  } else if (currentViewMode === 'pdf') {
    const pData = pagesData[sentence.pageNumber - 1];
    if (pData && !pData.isRendered) {
      await renderPage(pData);
    }
    if (pData && isAutoScrollEnabled) {
      pData.wrapper.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }

  // Highlight active sentence background
  const sRange = createRangeForSentence(sentence);
  if (sRange && 'highlights' in CSS) {
    const sHighlight = new (window as any).Highlight(sRange);
    (CSS as any).highlights.set('aura-sentence-active', sHighlight);
  }

  try {
    activePort = chrome.runtime.connect({ name: "tts-stream" });
    activePort.postMessage({
      type: "START",
      text: sentence.text,
      voice: currentVoice,
      rateString
    });

    let lastCharOffset = 0;
    let isFirstChunk = true;

    activePort.onMessage.addListener((msg) => {
      if (msg.type === "TIME_UPDATE") {
        currentAudioTime = msg.currentTime;
        if (isFirstChunk) {
          isFirstChunk = false;
          isLoadingTTS = false;
          setPlayState(true);
        }
      } else if (msg.type === "PLAYBACK_ENDED") {
        if (activeSentenceIndex + 1 < allSentences.length) {
          playSentenceAtIndex(activeSentenceIndex + 1);
        } else {
          stopPlayback();
        }
      } else if (msg.type === "WordBoundary") {
        if (msg.offset !== undefined) {
          const audioOffsetMs = msg.offset / 10000;
          const durationMs = msg.duration / 10000;
          const wordStr = msg.textObj || "";
          if (wordStr.length > 0) {
            const charOffset = sentence.text.indexOf(wordStr, lastCharOffset);
            if (charOffset !== -1) {
              const charLength = wordStr.length;
              lastCharOffset = charOffset + charLength;
              activeWordBoundaries.push({ audioOffsetMs, durationMs, charOffset, charLength });
            }
          }
        }
      } else if (msg.type === "WordBoundaryArray") {
        for (const wb of msg.data) {
          const audioOffsetMs = wb.offset / 10000;
          const durationMs = wb.duration / 10000;
          const wordStr = wb.textObj || "";
          if (wordStr.length > 0) {
            const charOffset = sentence.text.indexOf(wordStr, lastCharOffset);
            if (charOffset !== -1) {
              const charLength = wordStr.length;
              lastCharOffset = charOffset + charLength;
              activeWordBoundaries.push({ audioOffsetMs, durationMs, charOffset, charLength });
            }
          }
        }
      } else if (msg.type === "error") {
        console.error("TTS Stream Error:", msg.error);
        alert("Edge Natural TTS Error: " + msg.error);
        stopPlayback();
      }
    });

    // Real-time word highlight tick
    let lastHighlightedWord: any = null;
    if (currentHighlightTick) clearInterval(currentHighlightTick);

    currentHighlightTick = setInterval(() => {
      if (!isPlaying) return;
      const currentTimeMs = currentAudioTime * 1000;

      const currentWord = activeWordBoundaries.find(w =>
        currentTimeMs >= w.audioOffsetMs &&
        currentTimeMs <= (w.audioOffsetMs + w.durationMs)
      );

      const targetEl = currentViewMode === 'reader' ? sentence.readerElement : (sentence.element || sentence.readerElement);

      if (currentWord && targetEl && 'highlights' in CSS) {
        if (currentWord !== lastHighlightedWord) {
          lastHighlightedWord = currentWord;
          const textNode = targetEl.firstChild;
          if (textNode && textNode.nodeType === Node.TEXT_NODE) {
            const range = document.createRange();
            const start = Math.min(sentence.startOffsetInEl + currentWord.charOffset, textNode.textContent?.length || 0);
            const end = Math.min(start + currentWord.charLength, textNode.textContent?.length || 0);
            try {
              range.setStart(textNode, start);
              range.setEnd(textNode, end);
              const highlight = new (window as any).Highlight(range);
              (CSS as any).highlights.set('edge-tts-highlight', highlight);
            } catch (e) {}
          }
        }
      } else if (!currentWord && lastHighlightedWord && 'highlights' in CSS) {
        lastHighlightedWord = null;
        (CSS as any).highlights.delete('edge-tts-highlight');
      }
    }, 40);

    // Preload next sentence
    if (idx + 1 < allSentences.length) {
      const nextSentence = allSentences[idx + 1];
      activePort.postMessage({
        type: "PRELOAD",
        text: nextSentence.text,
        voice: currentVoice,
        rateString
      });
    }

  } catch (err: any) {
    console.error("Failed to start TTS stream:", err);
    stopPlayback();
  }
}
