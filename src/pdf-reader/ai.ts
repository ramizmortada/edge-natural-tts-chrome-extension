/// <reference types="chrome" />
import { dom } from './dom';
import { state } from './state';
import { saveCleanedPageToStorage, removeCleanedPageFromStorage } from './db';
import { playSentenceAtIndex, stopPlayback, sendPreloads } from './tts';

export async function cleanPageWithGemini(pageText: string): Promise<string> {
  if (!state.geminiApiKey) {
    throw new Error('Gemini API key not found. Please click the ✨ icon to configure your key.');
  }

  const chosenModel = state.geminiModel || 'gemini-3.1-flash-lite';
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${chosenModel}:generateContent?key=${encodeURIComponent(state.geminiApiKey)}`;

  const systemInstruction = "You are a professional book reader document cleaning assistant. Your task is to clean conversion artifacts, broken words, hyphenated word wraps, repeated headers/footers, and punctuation errors. DO NOT summarize, DO NOT rephrase, DO NOT change vocabulary, and DO NOT add commentary. Return the original cleaned text formatted in clean natural paragraphs.";

  const prompt = `Clean the following page text without changing its meaning or any actual words. Return only the cleaned text:\n\n${pageText}`;

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{
        role: "user",
        parts: [{ text: `${systemInstruction}\n\n${prompt}` }]
      }],
      generationConfig: {
        temperature: 0.1,
        maxOutputTokens: 8192
      }
    })
  });

  if (!response.ok) {
    const errData = await response.json().catch(() => ({}));
    const errMsg = errData.error?.message || `HTTP ${response.status}: ${response.statusText}`;
    throw new Error(`Gemini API error: ${errMsg}`);
  }

  const data = await response.json();
  const candidate = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!candidate) {
    throw new Error('Received empty response from Gemini.');
  }

  return candidate.trim();
}

export async function handlePageAiCleanup(pageNum: number, btn: HTMLElement) {
  const pageBlock = document.getElementById(`reader-page-block-${pageNum}`);
  if (!pageBlock) return;

  const pEls = Array.from(pageBlock.querySelectorAll('p.reader-paragraph')) as HTMLElement[];
  if (pEls.length === 0) return;

  const originalParas = pEls.map(p => p.textContent?.trim() || '').filter(Boolean);
  const pageText = originalParas.join('\n\n');

  btn.innerHTML = `<span class="ai-cleaning-spinner">⏳</span> Cleaning...`;
  btn.style.pointerEvents = 'none';

  try {
    const cleanedText = await cleanPageWithGemini(pageText);
    const cleanedParas = cleanedText.split(/\r?\n\s*\r?\n+/).map(p => p.trim()).filter(Boolean);

    if (cleanedParas.length === 0) {
      throw new Error('Cleaned text was empty.');
    }

    state.currentUndoStack.push({ pageNum, previousParas: originalParas, newParas: cleanedParas });
    if (dom.undoEditBtn) dom.undoEditBtn.style.display = 'inline-flex';

    pageBlock.dataset.originalParagraphs = JSON.stringify(originalParas);
    saveCleanedPageToStorage(state.currentDocTitle, pageNum, cleanedParas, originalParas);

    updatePageBlockParagraphs(pageBlock, pageNum, cleanedParas);

    btn.innerHTML = `<span class="ai-badge">✨ AI Cleaned</span>`;
    btn.style.pointerEvents = 'auto';

    const revertBtn = pageBlock.querySelector('.page-revert-btn') as HTMLElement;
    if (revertBtn) revertBtn.style.display = 'inline-flex';

  } catch (err: any) {
    console.error('Error cleaning page text:', err);
    alert(`AI Cleaning failed: ${err.message || err.toString()}`);
    btn.innerHTML = `<span class="ai-badge">✨ AI Clean</span>`;
    btn.style.pointerEvents = 'auto';
  }
}

export function revertPageText(pageNum: number) {
  const pageBlock = document.getElementById(`reader-page-block-${pageNum}`);
  if (!pageBlock) return;

  const origJson = pageBlock.dataset.originalParagraphs;
  if (!origJson) return;

  try {
    const originalParas: string[] = JSON.parse(origJson);
    updatePageBlockParagraphs(pageBlock, pageNum, originalParas);
    removeCleanedPageFromStorage(state.currentDocTitle, pageNum);

    const aiBtn = pageBlock.querySelector('.page-ai-btn');
    const revertBtn = pageBlock.querySelector('.page-revert-btn') as HTMLElement;
    if (aiBtn) aiBtn.innerHTML = `<span class="ai-badge">✨ AI Clean</span>`;
    if (revertBtn) revertBtn.style.display = 'none';
  } catch (e) {
    console.error('Error reverting text:', e);
  }
}

export function updatePageBlockParagraphs(pageBlock: HTMLElement, pageNum: number, paras: string[]) {
  const isCurrentSentenceOnThisPage = state.activeSentenceIndex >= 0 &&
    state.allSentences[state.activeSentenceIndex]?.pageNumber === pageNum;

  const currentActiveSentence = (state.activeSentenceIndex >= 0 && state.activeSentenceIndex < state.allSentences.length)
    ? state.allSentences[state.activeSentenceIndex]
    : null;

  // Clear stale preloads for old text from background cache
  const oldSentencesOfPage = state.allSentences.filter(s => s.pageNumber === pageNum);
  if (state.activePort && oldSentencesOfPage.length > 0) {
    try {
      state.activePort.postMessage({
        type: "CLEAR_PRELOAD",
        texts: oldSentencesOfPage.map(s => s.text)
      });
    } catch (_) {}
  }

  const oldParas = pageBlock.querySelectorAll('p.reader-paragraph');
  oldParas.forEach(p => p.remove());

  // Only stop playback if the sentence CURRENTLY BEING READ is on the page that was modified
  if (isCurrentSentenceOnThisPage) {
    stopPlayback();
  }

  state.allSentences = state.allSentences.filter(s => s.pageNumber !== pageNum);

  const sentenceRegex = /[^.!?]+[.!?]+(?:\s+|$)|[^.!?]+$/g;
  let newSentences: any[] = [];

  for (const paraText of paras) {
    const pEl = document.createElement('p');
    pEl.className = 'reader-paragraph';

    let match;
    while ((match = sentenceRegex.exec(paraText)) !== null) {
      const sText = match[0].trim();
      if (sText.length === 0) continue;

      const sentenceSpan = document.createElement('span');
      sentenceSpan.className = 'reader-sentence';
      sentenceSpan.dataset.pageNumber = pageNum.toString();
      sentenceSpan.textContent = sText + ' ';

      const sObj = {
        id: `s_dyn_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
        pageNumber: pageNum,
        text: sText,
        element: null,
        readerElement: sentenceSpan,
        startOffsetInEl: 0,
        endOffsetInEl: sText.length
      };

      sentenceSpan.addEventListener('click', (e) => {
        e.stopPropagation();
        const curIdx = state.allSentences.findIndex(s => s.readerElement === sentenceSpan || s.id === sObj.id);
        if (curIdx !== -1) playSentenceAtIndex(curIdx, true);
      });

      pEl.appendChild(sentenceSpan);
      newSentences.push(sObj);
    }

    if (pEl.children.length > 0) {
      pageBlock.appendChild(pEl);
    }
  }

  const beforeSentences = state.allSentences.filter(s => s.pageNumber < pageNum);
  const afterSentences = state.allSentences.filter(s => s.pageNumber > pageNum);
  state.allSentences = [...beforeSentences, ...newSentences, ...afterSentences];

  // If audio is playing another page, restore the activeSentenceIndex and refresh preloads for the new cleaned text!
  if (currentActiveSentence && !isCurrentSentenceOnThisPage) {
    state.activeSentenceIndex = state.allSentences.indexOf(currentActiveSentence);
    const rateString = state.currentRate[0] >= 0 ? `+${state.currentRate[0]}%` : `${state.currentRate[0]}%`;
    sendPreloads(state.activeSentenceIndex, state.currentVoice, rateString);
  }
}

export function openAiModal() {
  if (dom.geminiApiKeyInput) dom.geminiApiKeyInput.value = state.geminiApiKey;
  if (dom.geminiModelInput) dom.geminiModelInput.value = state.geminiModel || 'gemini-3.1-flash-lite';
  if (dom.aiModal) dom.aiModal.style.display = 'flex';
}

export function closeAiModal() {
  if (dom.aiModal) dom.aiModal.style.display = 'none';
}
