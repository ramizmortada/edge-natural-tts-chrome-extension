/// <reference types="chrome" />
import { getDocument, GlobalWorkerOptions, TextLayer } from 'pdfjs-dist';
import { dom } from '../dom';
import { state } from '../state';
import { PageData, SentenceItem } from '../types';
import { showLoading, hideLoading, setViewMode, highlightActiveSidebarPage, jumpToPage } from '../ui';
import { getSavedCleanedDoc } from '../db';
import { playSentenceAtIndex, stopPlayback } from '../tts';
import { createPageHeader } from './index';

try {
  GlobalWorkerOptions.workerSrc = chrome.runtime.getURL('pdf.worker.min.mjs');
} catch (e) {
  console.warn('Could not set workerSrc:', e);
}

export function setupObserver() {
  if (state.pageObserver) {
    state.pageObserver.disconnect();
  }

  state.pageObserver = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      const wrapper = entry.target as HTMLElement;
      const pageNum = parseInt(wrapper.dataset.pageNumber || '1', 10);
      const pData = state.pagesData[pageNum - 1];
      if (!pData) continue;

      if (entry.isIntersecting) {
        renderPage(pData);
      }
    }
  }, {
    rootMargin: '800px 0px 800px 0px'
  });
}

export async function loadPDFFromBuffer(fileName: string, rawBuffer: ArrayBuffer) {
  stopPlayback();
  showLoading(`Loading ${fileName}...`);
  state.currentDocTitle = fileName;
  const cleanDocName = fileName.replace(/\.pdf$/i, '');
  if (dom.docTitle) dom.docTitle.textContent = fileName;
  if (dom.readerBookTitle) dom.readerBookTitle.textContent = cleanDocName;
  if (dom.docInfo) dom.docInfo.style.display = 'flex';
  if (dom.dropZone) dom.dropZone.style.display = 'none';
  if (dom.navControls) dom.navControls.style.display = 'flex';
  setViewMode(state.currentViewMode);

  try {
    const uint8Data = new Uint8Array(rawBuffer);
    const loadingTask = getDocument({
      data: uint8Data,
      wasmUrl: chrome.runtime.getURL('wasm/'),
      cMapUrl: chrome.runtime.getURL('cmaps/'),
      cMapPacked: true,
      standardFontDataUrl: chrome.runtime.getURL('standard_fonts/'),
      iccUrl: chrome.runtime.getURL('iccs/'),
      useWasm: true
    });

    loadingTask.onPassword = (updatePassword: any, reason: any) => {
      const pwd = prompt('This PDF is password protected. Please enter password:');
      if (pwd) {
        updatePassword(pwd);
      } else {
        hideLoading();
        alert('Password required to open this PDF.');
      }
    };

    loadingTask.onProgress = (progressData: any) => {
      if (progressData.total > 0) {
        const pct = Math.round((progressData.loaded / progressData.total) * 100);
        showLoading(`Loading PDF: ${pct}%`);
      }
    };

    state.pdfDoc = await loadingTask.promise;
    if (dom.pageNumInput) dom.pageNumInput.max = state.pdfDoc.numPages.toString();
    if (dom.pageCountSpan) dom.pageCountSpan.textContent = state.pdfDoc.numPages.toString();
    if (dom.pageNumInput) dom.pageNumInput.value = '1';
    if (dom.readerPageInfo) dom.readerPageInfo.textContent = `${state.pdfDoc.numPages} pages`;

    if (dom.pagesContainer) dom.pagesContainer.innerHTML = '';
    if (dom.readerContent) dom.readerContent.innerHTML = '';
    state.pagesData = [];
    state.allSentences = [];
    state.activeSentenceIndex = -1;

    setupObserver();

    const samplePage = await state.pdfDoc.getPage(1);
    const sampleViewport = samplePage.getViewport({ scale: state.currentScale });
    const defaultWidth = Math.floor(sampleViewport.width);
    const defaultHeight = Math.floor(sampleViewport.height);

    for (let i = 1; i <= state.pdfDoc.numPages; i++) {
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

      if (dom.pagesContainer) dom.pagesContainer.appendChild(wrapper);

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

      state.pagesData.push(pageData);
      if (state.pageObserver) {
        state.pageObserver.observe(wrapper);
      }
    }

    hideLoading();
    renderPage(state.pagesData[0]);
    if (state.pagesData[1]) renderPage(state.pagesData[1]);

    await buildReaderMode(state.pdfDoc);

  } catch (err: any) {
    console.error('Error loading PDF:', err);
    hideLoading();
    if (dom.dropZone) dom.dropZone.style.display = 'flex';
    if (dom.pdfViewer) dom.pdfViewer.style.display = 'none';
    if (dom.readerModeView) dom.readerModeView.style.display = 'none';
    if (dom.navControls) dom.navControls.style.display = 'none';
    if (dom.docInfo) dom.docInfo.style.display = 'none';
    alert('Failed to load PDF: ' + (err.message || err.toString()));
  }
}

export async function renderPage(pData: PageData) {
  if (pData.isRendering || pData.isRendered) return;
  pData.isRendering = true;

  try {
    if (!pData.pageProxy && state.pdfDoc) {
      pData.pageProxy = await state.pdfDoc.getPage(pData.pageNumber);
    }
    if (!pData.pageProxy) return;

    const outputScale = window.devicePixelRatio || 1;
    const renderViewport = pData.pageProxy.getViewport({ scale: state.currentScale * outputScale });
    const textViewport = pData.pageProxy.getViewport({ scale: state.currentScale });

    pData.wrapper.style.width = `${Math.floor(textViewport.width)}px`;
    pData.wrapper.style.height = `${Math.floor(textViewport.height)}px`;

    pData.canvas.width = Math.floor(renderViewport.width);
    pData.canvas.height = Math.floor(renderViewport.height);
    pData.canvas.style.width = `${Math.floor(textViewport.width)}px`;
    pData.canvas.style.height = `${Math.floor(textViewport.height)}px`;

    const ctx = pData.canvas.getContext('2d')!;
    if (pData.renderTask) {
      try { pData.renderTask.cancel(); } catch (_) {}
    }

    pData.renderTask = pData.pageProxy.render({
      canvasContext: ctx,
      viewport: renderViewport,
      canvas: pData.canvas
    } as any);

    await pData.renderTask.promise;
    pData.renderTask = null;

    try {
      pData.textLayerDiv.innerHTML = '';
      const textContent = await pData.pageProxy.getTextContent();
      if (textContent && textContent.items && textContent.items.length > 0) {
        const textLayer = new TextLayer({
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

export async function buildReaderMode(doc: any) {
  if (dom.readerContent) dom.readerContent.innerHTML = '';
  if (dom.sidebarPageList) dom.sidebarPageList.innerHTML = '';
  state.allSentences = [];

  let totalWordCount = 0;
  let sentenceCounter = 0;
  const savedCleanedPages = await getSavedCleanedDoc(state.currentDocTitle);

  for (let pNum = 1; pNum <= doc.numPages; pNum++) {
    if (state.pdfDoc !== doc) break;

    try {
      const page = await doc.getPage(pNum);
      const textContent = await page.getTextContent();
      if (!textContent || !textContent.items || textContent.items.length === 0) {
        continue;
      }

      const paragraphs: string[] = [];
      let currentPara = '';
      let lastY: number | null = null;

      for (const rawItem of textContent.items) {
        const item = rawItem as { str: string; transform: number[] };
        const str = item.str || '';
        if (!str.trim() && !str.includes(' ')) continue;

        const y = item.transform ? item.transform[5] : null;

        if (lastY !== null && y !== null) {
          const dy = Math.abs(y - lastY);
          if (dy > 18) {
            if (currentPara.trim()) {
              paragraphs.push(currentPara.trim());
              currentPara = '';
            }
          } else if (dy > 3) {
            if (currentPara && !currentPara.endsWith(' ') && !currentPara.endsWith('-')) {
              currentPara += ' ';
            } else if (currentPara.endsWith('-')) {
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
        <div class="spi-snippet">${escapeHtmlText(previewSnippet)}</div>
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

          sentenceSpan.addEventListener('click', (e) => {
            e.stopPropagation();
            const curIdx = state.allSentences.findIndex(s => s.readerElement === sentenceSpan || s.id === sentenceItem.id);
            if (curIdx !== -1) {
              playSentenceAtIndex(curIdx, true);
            }
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

      if (pNum % 10 === 0 || pNum === doc.numPages) {
        if (dom.readerWordCount) dom.readerWordCount.textContent = `~${totalWordCount.toLocaleString()} words`;
        await new Promise(r => setTimeout(r, 0));
      }

    } catch (pageErr) {
      console.warn(`Error reading page ${pNum} text:`, pageErr);
    }
  }

  if (dom.readerWordCount) dom.readerWordCount.textContent = `~${totalWordCount.toLocaleString()} words`;
  highlightActiveSidebarPage(1);
}

function escapeHtmlText(str: string): string {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
