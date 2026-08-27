/// <reference types="chrome" />
import { dom } from '../dom';
import { state } from '../state';
import { StoredDoc } from '../types';
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

export function createPageHeader(pNum: number, title?: string): HTMLElement {
  const pageHeader = document.createElement('div');
  pageHeader.className = 'reader-page-header';

  const left = document.createElement('div');
  left.className = 'page-header-left';
  left.textContent = title ? `${title} (Page ${pNum})` : `Page ${pNum}`;

  const actions = document.createElement('div');
  actions.className = 'page-header-actions';

  const aiBtn = document.createElement('button');
  aiBtn.className = 'page-ai-btn';
  aiBtn.title = 'Clean OCR & formatting artifacts with Gemini AI (Model: 3.1 Flash Lite)';
  aiBtn.innerHTML = `<span class="ai-badge">✨ AI Clean</span>`;

  const revertBtn = document.createElement('button');
  revertBtn.className = 'page-revert-btn';
  revertBtn.title = 'Revert to original converted text';
  revertBtn.textContent = '↺ Revert';
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
    if (dom.sidebarPageList) dom.sidebarPageList.appendChild(sidebarItem);

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
