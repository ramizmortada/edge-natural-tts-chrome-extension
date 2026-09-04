/// <reference types="chrome" />
import { state } from './state';
import { extractRawText, createRangeFromOffset } from './dom-scanner';

export function injectHighlightStyles() {
  const style = document.createElement("style");
  style.textContent = `
    ::highlight(${state.activeHighlightName}) {
      background-color: rgba(16, 185, 129, 0.28);
      color: inherit;
      border-radius: 3px;
    }
    ::highlight(${state.sentenceHighlightName}) {
      background-color: rgba(16, 185, 129, 0.16);
      cursor: pointer;
    }
  `;
  document.head.appendChild(style);
}

export function clearHighlight(stopTimer = true) {
  if (stopTimer && state.currentHighlightTick) {
    clearInterval(state.currentHighlightTick);
    state.currentHighlightTick = null;
  }
  if ('highlights' in CSS) {
    (CSS as any).highlights.delete(state.activeHighlightName);
  }
}

export function clearSentenceHover() {
  if ('highlights' in CSS) (CSS as any).highlights.delete(state.sentenceHighlightName);
  state.hoveredAudioOffset = null;
  state.lastSentenceStart = -1;
  if (state.hoveredValidEl) {
    state.hoveredValidEl.style.cursor = "";
    state.hoveredValidEl = null;
  }
}

export function handleSentenceHover(e: MouseEvent, validEl: HTMLElement) {
  const range = (document as any).caretRangeFromPoint ? (document as any).caretRangeFromPoint(e.clientX, e.clientY) : null;
  if (!range) return;

  const textNode = range.startContainer;
  const offsetInNode = range.startOffset;
  if (textNode.nodeType !== Node.TEXT_NODE) return;

  let absoluteOffset = 0;
  let found = false;

  function traverse(node: Node) {
    if (found) return;
    if (node === textNode) {
      absoluteOffset += offsetInNode;
      found = true;
      return;
    }
    if (node.nodeType === Node.TEXT_NODE) {
      absoluteOffset += node.textContent?.length || 0;
    } else {
      for (const child of Array.from(node.childNodes)) {
        traverse(child);
      }
    }
  }
  traverse(validEl);
  if (!found) return;

  const text = (validEl === state.activeTarget) ? state.activeFullText : extractRawText(validEl);
  let sentenceStart = 0;
  let sentenceEnd = text.length;

  for (let i = absoluteOffset; i >= 0; i--) {
    if (i === 0) { sentenceStart = 0; break; }
    if ((text[i] === '.' || text[i] === '?' || text[i] === '!') && (text[i+1] === ' ' || text[i+1] === '\n')) {
      sentenceStart = i + 2;
      break;
    }
    if (text[i] === '\n') {
      sentenceStart = i + 1;
      break;
    }
  }

  for (let i = absoluteOffset; i < text.length; i++) {
    if ((text[i] === '.' || text[i] === '?' || text[i] === '!') && (i === text.length - 1 || text[i+1] === ' ' || text[i+1] === '\n')) {
      sentenceEnd = i + 1;
      break;
    }
    if (text[i] === '\n') {
      sentenceEnd = i;
      break;
    }
  }

  if (sentenceStart === state.lastSentenceStart && state.hoveredValidEl === validEl) return;
  state.lastSentenceStart = sentenceStart;
  
  if (state.hoveredValidEl && state.hoveredValidEl !== validEl) {
    state.hoveredValidEl.style.cursor = "";
  }
  state.hoveredValidEl = validEl;

  if (sentenceEnd > sentenceStart) {
    const highlightRange = createRangeFromOffset(validEl, sentenceStart, sentenceEnd - sentenceStart);
    if (highlightRange && 'highlights' in CSS) {
      const highlight = new (window as any).Highlight(highlightRange);
      (CSS as any).highlights.set(state.sentenceHighlightName, highlight);
      validEl.style.cursor = "pointer";
    }
    
    state.hoveredSentenceStart = sentenceStart;
    if (validEl === state.activeTarget && state.isPlaying) {
      const firstWord = state.activeWordBoundaries.find(w => w.charOffset >= sentenceStart);
      if (firstWord) {
        state.hoveredAudioOffset = firstWord.audioOffsetMs;
      } else {
        state.hoveredAudioOffset = null;
      }
    } else {
      state.hoveredAudioOffset = null;
    }
  }
}
