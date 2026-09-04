/// <reference types="chrome" />
import { dom } from '../dom';
import { state } from '../state';
import { StoredDoc, SentenceItem } from '../types';
import { readerDB, getSavedCleanedDoc } from '../db';
import { showLoading, hideLoading, setViewMode, highlightActiveSidebarPage, jumpToPage, escapeHtml, renderRecentFilesUI } from '../ui';
import { handlePageAiCleanup, revertPageText } from '../ai';
import { playSentenceAtIndex, stopPlayback } from '../tts';
import { loadPDFFromBuffer } from './pdf';
import { loadDocxFromBuffer } from './docx';
import { loadEpubFromBuffer } from './epub';
import { loadTextFromBuffer, loadMarkdownFromBuffer, loadHtmlFromBuffer } from './text';

export async function loadDocumentFile(file: File) {
  stopPlayback();
  showLoading(`Loading ${file.name}...`);
  const name = file.name;
  const ext = name.split('.').pop()?.toLowerCase() || '';

  try {
    const arrayBuffer = await file.arrayBuffer();

    const storedDoc: StoredDoc = {
      id: file.name,
      name: file.name,
      type: ext,
      size: file.size,
      arrayBuffer: arrayBuffer.slice(0),
      lastOpened: Date.now(),
      lastScrollTop: 0,
      lastPage: 1,
      lastSentenceIndex: 0,
      aiEdits: {}
    };

    await readerDB.saveDoc(storedDoc);
    chrome.storage.local.set({ last_active_doc_id: file.name });
    await renderRecentFilesUI();

    await loadDocumentFromBuffer(file.name, ext, arrayBuffer.slice(0));
  } catch (err: any) {
    console.error(`Error loading document (${file.name}):`, err);
    hideLoading();
    alert(`Failed to load ${file.name}: ` + (err.message || err.toString()));
  }
}

export async function loadDocumentFromBuffer(name: string, ext: string, buffer: ArrayBuffer) {
  stopPlayback();
  const cleanExt = ext.toLowerCase().replace(/^\./, '');

  if (cleanExt === 'pdf') {
    await loadPDFFromBuffer(name, buffer);
  } else if (cleanExt === 'docx') {
    await loadDocxFromBuffer(name, buffer);
  } else if (cleanExt === 'epub') {
    await loadEpubFromBuffer(name, buffer);
  } else if (cleanExt === 'txt') {
    const text = new TextDecoder('utf-8').decode(buffer);
    await loadTextFromBuffer(name, text);
  } else if (cleanExt === 'md' || cleanExt === 'markdown') {
    const text = new TextDecoder('utf-8').decode(buffer);
    await loadMarkdownFromBuffer(name, text);
  } else if (cleanExt === 'html' || cleanExt === 'htm') {
    const text = new TextDecoder('utf-8').decode(buffer);
    await loadHtmlFromBuffer(name, text);
  } else {
    const text = new TextDecoder('utf-8').decode(buffer);
    await loadTextFromBuffer(name, text);
  }
}

export async function loadStoredDocument(doc: StoredDoc) {
  try {
    state.isRestoringState = true;
    showLoading(`Reopening ${doc.name}...`);
    doc.lastOpened = Date.now();
    await readerDB.saveDoc(doc);
    chrome.storage.local.set({ last_active_doc_id: doc.id });
    renderRecentFilesUI();

    const bufferCopy = doc.arrayBuffer.slice(0);
    await loadDocumentFromBuffer(doc.name, doc.type, bufferCopy);

    if (doc.lastScrollTop && doc.lastScrollTop > 0) {
      setTimeout(() => {
        if (dom.readerModeView) dom.readerModeView.scrollTop = doc.lastScrollTop;
        if (doc.lastPage && dom.pageNumInput) {
          dom.pageNumInput.value = doc.lastPage.toString();
          highlightActiveSidebarPage(doc.lastPage);
        }
        setTimeout(() => { state.isRestoringState = false; }, 300);
      }, 100);
    } else if (doc.lastPage && doc.lastPage > 1) {
      setTimeout(() => {
        jumpToPage(doc.lastPage);
        setTimeout(() => { state.isRestoringState = false; }, 300);
      }, 100);
    } else {
      setTimeout(() => { state.isRestoringState = false; }, 300);
    }
  } catch (err: any) {
    state.isRestoringState = false;
    console.error('Error reopening document:', err);
    hideLoading();
    alert(`Could not reopen ${doc.name}: ${err.message || err.toString()}`);
  }
}

export function calculateDuration(wordCount: number, ratePercent: number = 0): { text: string; seconds: number } {
  if (!wordCount || wordCount <= 0) return { text: '0s', seconds: 0 };
  const baseWpm = 160;
  const multiplier = Math.max(0.2, 1 + ratePercent / 100);
  const effectiveWpm = baseWpm * multiplier;
  const totalSeconds = Math.max(1, Math.round((wordCount / effectiveWpm) * 60));

  if (totalSeconds < 60) {
    return { text: `${totalSeconds}s`, seconds: totalSeconds };
  }
  const mins = Math.floor(totalSeconds / 60);
  const secs = totalSeconds % 60;
  if (secs === 0) {
    return { text: `${mins}m`, seconds: totalSeconds };
  }
  return { text: `${mins}m ${secs}s`, seconds: totalSeconds };
}

export function updateAllPageDurations(ratePercent: number) {
  const blocks = document.querySelectorAll('.reader-page-block');
  blocks.forEach((block) => {
    const el = block as HTMLElement;
    const count = parseInt(el.dataset.wordCount || '0', 10);
    const durationBadge = el.querySelector('.page-duration-badge') as HTMLElement | null;
    if (durationBadge && count > 0) {
      const { text } = calculateDuration(count, ratePercent);
      const sign = ratePercent >= 0 ? `+${ratePercent}%` : `${ratePercent}%`;
      durationBadge.style.display = 'inline-flex';
      durationBadge.innerHTML = `<svg class="size-3 inline shrink-0" xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg><span>${text}</span>`;
      durationBadge.title = `Estimated reading duration at current speed (${sign})`;
    }
  });
}

export const AI_CLEAN_HTML = `<span class="ai-badge flex items-center gap-1.5"><svg class="size-3.5 inline shrink-0" xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z"/></svg><span>AI Clean</span></span>`;

export const AI_CLEANED_HTML = `<span class="ai-badge flex items-center gap-1.5"><svg class="size-3.5 inline shrink-0 text-emerald-400" xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg><span>AI Cleaned</span></span>`;

export const REVERT_HTML = `<span class="flex items-center gap-1"><svg class="size-3 inline shrink-0" xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/></svg><span>Revert</span></span>`;

export function createPageHeader(pNum: number, title?: string, wordCount: number = 0): HTMLElement {
  const pageHeader = document.createElement('div');
  pageHeader.className = 'reader-page-header';

  const left = document.createElement('div');
  left.className = 'page-header-left';

  const titleSpan = document.createElement('span');
  titleSpan.className = 'page-header-title';
  titleSpan.textContent = title ? `${title} (Page ${pNum})` : `Page ${pNum}`;
  left.appendChild(titleSpan);

  const durationBadge = document.createElement('span');
  durationBadge.className = 'page-duration-badge';
  durationBadge.dataset.pageNumber = pNum.toString();
  if (wordCount > 0) {
    const curRate = (state.currentRate && state.currentRate[0] !== undefined) ? state.currentRate[0] : 0;
    const { text } = calculateDuration(wordCount, curRate);
    const sign = curRate >= 0 ? `+${curRate}%` : `${curRate}%`;
    durationBadge.innerHTML = `<svg class="size-3 inline shrink-0" xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg><span>${text}</span>`;
    durationBadge.title = `Estimated reading duration at current speed (${sign})`;
  } else {
    durationBadge.style.display = 'none';
  }
  left.appendChild(durationBadge);

  const actions = document.createElement('div');
  actions.className = 'page-header-actions';

  const aiBtn = document.createElement('button');
  aiBtn.className = 'page-ai-btn';
  aiBtn.title = 'Clean OCR & formatting artifacts with Gemini AI (Model: 3.1 Flash Lite)';
  aiBtn.innerHTML = AI_CLEAN_HTML;

  const revertBtn = document.createElement('button');
  revertBtn.className = 'page-revert-btn';
  revertBtn.title = 'Revert to original converted text';
  revertBtn.innerHTML = REVERT_HTML;
  revertBtn.style.display = 'none';

  actions.appendChild(aiBtn);
  actions.appendChild(revertBtn);

  pageHeader.appendChild(left);
  pageHeader.appendChild(actions);

  aiBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    handlePageAiCleanup(pNum, aiBtn);
  });

  revertBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    revertPageText(pNum);
  });

  return pageHeader;
}

export async function renderGenericDocumentToReader(title: string, sections: { pageNum: number; title: string; paragraphs: string[] }[]) {
  if (dom.readerContent) dom.readerContent.innerHTML = '';
  if (dom.sidebarPageList) dom.sidebarPageList.innerHTML = '';
  if (dom.pagesContainer) dom.pagesContainer.innerHTML = '';
  state.pagesData = [];
  state.allSentences = [];
  state.activeSentenceIndex = -1;
  state.currentDocTitle = title;

  if (dom.pageNumInput) {
    dom.pageNumInput.max = sections.length.toString();
    dom.pageNumInput.value = '1';
  }
  if (dom.pageCountSpan) dom.pageCountSpan.textContent = sections.length.toString();
  if (dom.readerPageInfo) dom.readerPageInfo.textContent = `${sections.length} pages / sections`;

  const cleanDocName = title.replace(/\.[a-zA-Z0-9]+$/i, '');
  if (dom.docTitle) dom.docTitle.textContent = title;
  if (dom.readerBookTitle) dom.readerBookTitle.textContent = cleanDocName;
  if (dom.docInfo) dom.docInfo.style.display = 'flex';
  if (dom.dropZone) dom.dropZone.style.display = 'none';
  if (dom.navControls) dom.navControls.style.display = 'flex';
  setViewMode('reader');
  window.dispatchEvent(new CustomEvent('doc-loaded', { detail: { title, totalPages: sections.length } }));

  const savedCleanedPages = await getSavedCleanedDoc(state.currentDocTitle);

  let totalWordCount = 0;
  let sentenceCounter = 0;

  for (const sec of sections) {
    const pNum = sec.pageNum;
    const hasSavedCleaned = !!savedCleanedPages[pNum];
    const parasToRender = hasSavedCleaned ? savedCleanedPages[pNum].cleaned : sec.paragraphs;

    const sidebarItem = document.createElement('div');
    sidebarItem.className = 'sidebar-page-item';
    sidebarItem.id = `spi-${pNum}`;
    sidebarItem.dataset.pageNumber = pNum.toString();

    const previewSnippet = parasToRender[0]?.slice(0, 70) || sec.title;
    const pageWords = parasToRender.reduce((sum, p) => sum + p.split(/\s+/).filter(Boolean).length, 0);

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
    if (dom.sidebarPageList) dom.sidebarPageList.appendChild(sidebarItem);

    const pageBlock = document.createElement('div');
    pageBlock.className = 'reader-page-block';
    pageBlock.id = `reader-page-block-${pNum}`;
    pageBlock.dataset.pageNumber = pNum.toString();
    pageBlock.dataset.wordCount = pageWords.toString();

    if (hasSavedCleaned) {
      pageBlock.dataset.originalParagraphs = JSON.stringify(savedCleanedPages[pNum].original);
    }

    const pageHeader = createPageHeader(pNum, sec.title, pageWords);
    if (hasSavedCleaned) {
      const aiBtn = pageHeader.querySelector('.page-ai-btn');
      const revertBtn = pageHeader.querySelector('.page-revert-btn') as HTMLElement;
      if (aiBtn) aiBtn.innerHTML = AI_CLEANED_HTML;
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

        const sentenceItem: SentenceItem = {
          id: `s_${sIndex}`,
          pageNumber: pNum,
          text: sText,
          element: null,
          readerElement: sentenceSpan,
          startOffsetInEl: 0,
          endOffsetInEl: sText.length
        };

        sentenceSpan.addEventListener('click', (e) => {
          e.stopPropagation();
          const curIdx = state.allSentences.findIndex(s => s.readerElement === sentenceSpan || s.id === sentenceItem.id);
          if (curIdx !== -1) {
            playSentenceAtIndex(curIdx, true);
          }
        });

        pEl.appendChild(sentenceSpan);
        state.allSentences.push(sentenceItem);

        totalWordCount += sText.split(/\s+/).length;
      }

      if (pEl.children.length > 0) {
        pageBlock.appendChild(pEl);
      }
    }

    if (pageBlock.children.length > 1) {
      if (dom.readerContent) dom.readerContent.appendChild(pageBlock);
    }
  }

  if (dom.readerWordCount) dom.readerWordCount.textContent = `~${totalWordCount.toLocaleString()} words`;
  highlightActiveSidebarPage(1);
  hideLoading();
}
