/// <reference types="chrome" />
import { dom, PLAY_SVG, PAUSE_SVG, hoverPlayButton } from './dom';
import { state } from './state';
import { SentenceItem } from './types';
import { renderPage } from './loaders/pdf';

export function setPlayState(playing: boolean) {
  state.isPlaying = playing;
  if (playing) {
    if (dom.ttsPlayBtn) dom.ttsPlayBtn.classList.add('playing');
    if (dom.ttsPlayIcon) dom.ttsPlayIcon.innerHTML = `<rect x="6" y="4" width="4" height="16"></rect><rect x="14" y="4" width="4" height="16"></rect>`;
  } else {
    if (dom.ttsPlayBtn) dom.ttsPlayBtn.classList.remove('playing');
    if (dom.ttsPlayIcon) dom.ttsPlayIcon.innerHTML = `<polygon points="5 3 19 12 5 21 5 3"></polygon>`;
  }
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
  if (state.currentHighlightTick) clearInterval(state.currentHighlightTick);
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
  if (state.currentHighlightTick) clearInterval(state.currentHighlightTick);
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
    (CSS as any).highlights.delete('aura-sentence-active');
  }
  if (dom.readerContent) {
    const prevActive = dom.readerContent.querySelectorAll('.reader-sentence.active-tts');
    prevActive.forEach(el => el.classList.remove('active-tts'));
  }
}

function sendPreloads(currentIndex: number, voice: string, rateString: string) {
  if (!state.activePort) return;
  for (let i = 1; i <= 2; i++) {
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

export async function playSentenceAtIndex(idx: number) {
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
              state.activeWordBoundaries.push({ audioOffsetMs, durationMs, charOffset, charLength });
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
              state.activeWordBoundaries.push({ audioOffsetMs, durationMs, charOffset, charLength });
            }
          }
        }
      } else if (msg.type === "error") {
        console.error("TTS Stream Error:", msg.error);
        alert("Edge Natural TTS Error: " + msg.error);
        stopPlayback();
      }
    });

    state.activePort.postMessage({
      type: "START",
      text: sentence.text,
      voice: state.currentVoice,
      rateString
    });

    sendPreloads(idx, state.currentVoice, rateString);

    let lastHighlightedWord: any = null;
    if (state.currentHighlightTick) clearInterval(state.currentHighlightTick);

    state.currentHighlightTick = setInterval(() => {
      if (!state.isPlaying) return;
      const currentTimeMs = state.currentAudioTime * 1000;

      const activeBoundary = state.activeWordBoundaries.find(wb =>
        currentTimeMs >= wb.audioOffsetMs && currentTimeMs <= (wb.audioOffsetMs + wb.durationMs + 80)
      );

      if (activeBoundary && activeBoundary !== lastHighlightedWord) {
        lastHighlightedWord = activeBoundary;
        const targetEl = state.currentViewMode === 'reader' ? sentence.readerElement : (sentence.element || sentence.readerElement);
        if (!targetEl) return;

        const textNode = targetEl.firstChild;
        if (!textNode || textNode.nodeType !== Node.TEXT_NODE) return;

        try {
          const wRange = document.createRange();
          const baseOffset = (state.currentViewMode === 'reader') ? 0 : sentence.startOffsetInEl;
          const start = baseOffset + activeBoundary.charOffset;
          const end = Math.min(start + activeBoundary.charLength, textNode.textContent?.length || 0);

          if (start <= end && end <= (textNode.textContent?.length || 0)) {
            wRange.setStart(textNode, start);
            wRange.setEnd(textNode, end);
            if ('highlights' in CSS) {
              const highlight = new (window as any).Highlight(wRange);
              (CSS as any).highlights.set('edge-tts-highlight', highlight);
            }
          }
        } catch (_) {}
      }
    }, 25);

  } catch (err: any) {
    console.error("Error establishing TTS stream:", err);
    stopPlayback();
  }
}
