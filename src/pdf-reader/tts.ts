/// <reference types="chrome" />
import { dom, PLAY_SVG, PAUSE_SVG, hoverPlayButton } from './dom';
import { state } from './state';
import { SentenceItem } from './types';
import { renderPage } from './loaders/pdf';

export function openHostSetupModal() {
  window.dispatchEvent(new CustomEvent('open-host-setup'));
  if (dom.hostSetupModal) {
    dom.hostSetupModal.style.display = 'flex';
  }
}

export function closeHostSetupModal() {
  if (dom.hostSetupModal) {
    dom.hostSetupModal.style.display = 'none';
  }
}

export function setPlayState(playing: boolean) {
  state.isPlaying = playing;
  window.dispatchEvent(new CustomEvent('tts-state-change', { detail: { isPlaying: playing, isPaused: state.isPaused, activeSentenceIndex: state.activeSentenceIndex } }));
  if (playing) {
    if (dom.ttsPlayBtn) dom.ttsPlayBtn.classList.add('playing');
    if (dom.ttsPlayIcon) dom.ttsPlayIcon.innerHTML = `<rect x="6" y="4" width="4" height="16"></rect><rect x="14" y="4" width="4" height="16"></rect>`;
  } else {
    if (dom.ttsPlayBtn) dom.ttsPlayBtn.classList.remove('playing');
    if (dom.ttsPlayIcon) dom.ttsPlayIcon.innerHTML = `<polygon points="5 3 19 12 5 21 5 3"></polygon>`;
  }
}

let lastHighlightedWord: any = null;

export function startWordHighlightTick() {
  if (state.currentHighlightTick) {
    clearInterval(state.currentHighlightTick);
    state.currentHighlightTick = null;
  }

  state.currentHighlightTick = setInterval(() => {
    if (!state.isPlaying || state.isPaused) return;
    if (state.activeSentenceIndex < 0 || state.activeSentenceIndex >= state.allSentences.length) return;

    const sentence = state.allSentences[state.activeSentenceIndex];
    const currentTimeMs = state.currentAudioTime * 1000;

    const activeBoundary = state.activeWordBoundaries.find(wb =>
      currentTimeMs >= wb.audioOffsetMs && currentTimeMs <= (wb.audioOffsetMs + wb.durationMs + 60)
    );

    if (activeBoundary && activeBoundary !== lastHighlightedWord) {
      lastHighlightedWord = activeBoundary;
      const targetEl = state.currentViewMode === 'reader' ? sentence.readerElement : (sentence.element || sentence.readerElement);
      if (!targetEl) return;

      try {
        const baseOffset = (state.currentViewMode === 'reader') ? 0 : sentence.startOffsetInEl;
        const start = baseOffset + activeBoundary.charOffset;
        const wRange = createWordRange(targetEl, start, activeBoundary.charLength);

        if (wRange && 'highlights' in CSS) {
          const highlight = new (window as any).Highlight(wRange);
          (CSS as any).highlights.set('edge-tts-highlight', highlight);
          (CSS as any).highlights.set('aura-word-active', highlight);
        }
      } catch (_) {}
    }
  }, 25);
}

export function resumePlayback() {
  if (state.activeSentenceIndex < 0 || state.activeSentenceIndex >= state.allSentences.length) {
    return;
  }

  if (!state.activePort) {
    playSentenceAtIndex(state.activeSentenceIndex);
    return;
  }

  try {
    state.activePort.postMessage({ type: "PLAY" });
  } catch (_) {
    playSentenceAtIndex(state.activeSentenceIndex);
    return;
  }

  chrome.runtime.sendMessage({ target: "offscreen", type: "PLAY" }).catch(() => {});
  state.isPaused = false;
  state.isPlaying = true;
  setPlayState(true);

  startWordHighlightTick();
}

export function pausePlayback() {
  if (state.activePort) {
    try {
      state.activePort.postMessage({ type: "PAUSE" });
    } catch (_) {}
  }
  chrome.runtime.sendMessage({ target: "offscreen", type: "PAUSE" }).catch(()=>{});
  state.isPaused = true;
  state.isPlaying = false;
  setPlayState(false);
  if (state.currentHighlightTick) {
    clearInterval(state.currentHighlightTick);
    state.currentHighlightTick = null;
  }
}

export function stopPlayback() {
  if (state.activePort) {
    try {
      state.activePort.postMessage({ type: "STOP" });
      state.activePort.disconnect();
    } catch (_) {}
    state.activePort = null;
  }
  chrome.runtime.sendMessage({ target: "offscreen", type: "STOP" }).catch(()=>{});
  state.isPlaying = false;
  state.isPaused = false;
  state.isLoadingTTS = false;
  state.activeSentenceIndex = -1;
  setPlayState(false);
  clearActiveHighlights();
  clearSentenceHover();
  lastHighlightedWord = null;
  if (state.currentHighlightTick) {
    clearInterval(state.currentHighlightTick);
    state.currentHighlightTick = null;
  }
}

export function createRangeForSentence(sentence: SentenceItem): Range | null {
  const targetEl = state.currentViewMode === 'reader' ? sentence.readerElement : (sentence.element || sentence.readerElement);
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

export function createWordRange(el: HTMLElement, charOffset: number, charLength: number): Range | null {
  try {
    let currentOffset = 0;
    let startNode: Node | null = null;
    let startNodeOffset = 0;
    let endNode: Node | null = null;
    let endNodeOffset = 0;

    function traverse(node: Node) {
      if (endNode) return;
      if (node.nodeType === Node.TEXT_NODE) {
        const nodeLen = node.textContent?.length || 0;
        if (!startNode && currentOffset + nodeLen > charOffset) {
          startNode = node;
          startNodeOffset = Math.max(0, charOffset - currentOffset);
        }
        if (startNode && currentOffset + nodeLen >= charOffset + charLength) {
          endNode = node;
          endNodeOffset = Math.min(nodeLen, charOffset + charLength - currentOffset);
        }
        currentOffset += nodeLen;
      } else {
        for (const child of Array.from(node.childNodes)) {
          traverse(child);
        }
      }
    }

    traverse(el);

    if (startNode && endNode) {
      const range = document.createRange();
      range.setStart(startNode, startNodeOffset);
      range.setEnd(endNode, endNodeOffset);
      return range;
    }
  } catch (_) {}
  return null;
}

export function clearSentenceHover() {
  if ('highlights' in CSS) {
    (CSS as any).highlights.delete('aura-sentence-hover');
  }
  state.hoveredSentence = null;
  state.lastHoveredSentence = null;
  if (hoverPlayButton) {
    hoverPlayButton.style.opacity = '0';
    hoverPlayButton.style.pointerEvents = 'none';
  }
}

export function clearActiveHighlights() {
  if ('highlights' in CSS) {
    (CSS as any).highlights.delete('edge-tts-highlight');
    (CSS as any).highlights.delete('aura-word-active');
    (CSS as any).highlights.delete('aura-sentence-active');
  }
  if (dom.readerContent) {
    const prevActive = dom.readerContent.querySelectorAll('.reader-sentence.active-tts');
    prevActive.forEach(el => el.classList.remove('active-tts'));
  }
}

export function sendPreloads(currentIndex: number, voice: string, rateString: string) {
  if (!state.activePort) return;
  for (let i = 1; i <= 4; i++) {
    const nextIdx = currentIndex + i;
    if (nextIdx < state.allSentences.length) {
      const nextSentence = state.allSentences[nextIdx];
      if (nextSentence && nextSentence.text.trim()) {
        try {
          state.activePort.postMessage({
            type: "PRELOAD",
            text: nextSentence.text,
            voice,
            rateString
          });
        } catch (_) {}
      }
    }
  }
}

export async function playSentenceAtIndex(idx: number, force = false, retryCount = 0) {
  if (idx < 0 || idx >= state.allSentences.length) {
    stopPlayback();
    return;
  }

  const sentence = state.allSentences[idx];
  
  // Clear previous sentence highlights & tick without disconnecting activePort
  clearActiveHighlights();
  if (state.currentHighlightTick) clearInterval(state.currentHighlightTick);

  state.activeSentenceIndex = idx;
  state.isLoadingTTS = true;
  state.isPaused = false;
  state.isPlaying = true;
  setPlayState(true);
  state.currentAudioTime = 0;
  state.activeWordBoundaries = [];

  const rateString = state.currentRate[0] >= 0 ? `+${state.currentRate[0]}%` : `${state.currentRate[0]}%`;

  if (sentence.readerElement) {
    sentence.readerElement.classList.add('active-tts');
    if (state.isAutoScrollEnabled) {
      sentence.readerElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  } else if (state.currentViewMode === 'pdf') {
    const pData = state.pagesData[sentence.pageNumber - 1];
    if (pData && !pData.isRendered) {
      await renderPage(pData);
    }
    if (pData && state.isAutoScrollEnabled) {
      pData.wrapper.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }

  const sRange = createRangeForSentence(sentence);
  if (sRange && 'highlights' in CSS) {
    const sHighlight = new (window as any).Highlight(sRange);
    (CSS as any).highlights.set('aura-sentence-active', sHighlight);
  }

  try {
    if (!state.activePort) {
      state.activePort = chrome.runtime.connect({ name: "tts-stream" });

      state.activePort.onDisconnect.addListener(() => {
        state.activePort = null;
        if (state.currentHighlightTick) {
          clearInterval(state.currentHighlightTick);
          state.currentHighlightTick = null;
        }
      });
    }

    let lastCharOffset = 0;
    let isFirstChunk = true;

    state.activePort.onMessage.addListener(function onMsg(msg) {
      if (state.activeSentenceIndex !== idx) {
        state.activePort?.onMessage.removeListener(onMsg);
        return;
      }

      if (msg.type === "TIME_UPDATE") {
        state.currentAudioTime = msg.currentTime;
        if (isFirstChunk) {
          isFirstChunk = false;
          state.isLoadingTTS = false;
          if (!state.isPaused && state.activeSentenceIndex === idx) {
            setPlayState(true);
          }
        }
      } else if (msg.type === "PLAYBACK_ENDED") {
        state.activePort?.onMessage.removeListener(onMsg);
        if (!state.isPaused && state.activeSentenceIndex === idx) {
          if (state.activeSentenceIndex + 1 < state.allSentences.length) {
            playSentenceAtIndex(state.activeSentenceIndex + 1);
          } else {
            stopPlayback();
          }
        }
      } else if (msg.type === "WordBoundary" || msg.type === "WordBoundaryArray") {
        const boundaries = msg.type === "WordBoundaryArray" ? msg.data : [msg];
        for (const wb of boundaries) {
          if (wb && wb.offset !== undefined) {
            const audioOffsetMs = wb.offset / 10000;
            const durationMs = wb.duration / 10000;
            const wordStr = (wb.textObj || "").trim();
            if (wordStr.length > 0) {
              let charOffset = sentence.text.indexOf(wordStr, lastCharOffset);
              if (charOffset === -1) {
                charOffset = sentence.text.toLowerCase().indexOf(wordStr.toLowerCase(), lastCharOffset);
              }
              if (charOffset === -1) {
                charOffset = sentence.text.indexOf(wordStr);
              }
              if (charOffset === -1) {
                charOffset = sentence.text.toLowerCase().indexOf(wordStr.toLowerCase());
              }
              if (charOffset !== -1) {
                const charLength = wordStr.length;
                lastCharOffset = charOffset + charLength;
                state.activeWordBoundaries.push({ audioOffsetMs, durationMs, charOffset, charLength });
              }
            }
          }
        }
      } else if (msg.type === "error") {
        state.activePort?.onMessage.removeListener(onMsg);
        const errStr = (msg.error || "").toLowerCase();
        const isHostError = errStr.includes("host not found") || 
                            errStr.includes("specified native messaging");

        if (isHostError) {
          console.error("Native Voice Host Error:", msg.error);
          openHostSetupModal();
          stopPlayback();
          return;
        }

        if (retryCount < 2) {
          console.warn(`TTS generation interrupted for sentence ${idx}. Retrying (attempt ${retryCount + 1})...`);
          setTimeout(() => {
            playSentenceAtIndex(idx, true, retryCount + 1);
          }, 300);
        } else {
          console.error("TTS Stream Error:", msg.error);
          alert("ReadFlow TTS Error: " + msg.error);
          stopPlayback();
        }
      }
    });

    state.activePort.postMessage({
      type: "START",
      text: sentence.text,
      voice: state.currentVoice,
      rateString,
      force: !!force
    });

    sendPreloads(idx, state.currentVoice, rateString);

    lastHighlightedWord = null;
    startWordHighlightTick();

  } catch (err: any) {
    console.error("Error establishing TTS stream:", err);
    stopPlayback();
  }
}
