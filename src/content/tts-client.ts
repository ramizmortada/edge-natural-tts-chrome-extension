/// <reference types="chrome" />
import { state } from './state';
import { extractRawText, getNextValidElement, createRangeFromOffset } from './dom-scanner';
import { clearHighlight } from './highlighter';
import { playButton, PLAY_SVG, PAUSE_SVG, LOAD_SVG, startSession, stopSession, setPlaying, syncPosition, isExtensionValid } from './floating-ui';

export async function handlePlayAction(e: any, forceTarget?: HTMLElement) {
  if (!isExtensionValid()) {
    alert("Edge Natural TTS: The extension was updated or reloaded. Please refresh the page to continue.");
    return;
  }

  if (e) {
    if (e.stopPropagation) e.stopPropagation();
    if (e.preventDefault) e.preventDefault();
  }

  const targetToPlay = forceTarget || state.currentTarget;

  if (state.isPlaying) {
    if (targetToPlay === state.activeTarget) {
      if (state.activePort) state.activePort.postMessage({ type: "PAUSE" });
      setPlaying(false);
      clearHighlight(false);
      playButton.innerHTML = PLAY_SVG;
      playButton.style.background = "#2563eb";
      return;
    } else {
      if (state.activePort) {
        state.activePort.postMessage({ type: "STOP" });
        state.activePort.disconnect();
        state.activePort = null;
      }
      setPlaying(false);
      clearHighlight(true);
    }
  }

  if (!state.isPlaying && targetToPlay === state.activeTarget && state.activeTarget !== null) {
    if (state.activePort) {
      state.activePort.postMessage({ type: "PLAY" });
    }
    setPlaying(true);
    playButton.innerHTML = PAUSE_SVG;
    playButton.style.background = "#ef4444";
    return;
  }

  if (state.isLoading || !targetToPlay) return;

  const fullTextToRead = extractRawText(targetToPlay);
  if (!fullTextToRead || !fullTextToRead.trim()) return;

  state.isLoading = true;
  state.activeTarget = targetToPlay;
  startSession();
  playButton.innerHTML = LOAD_SVG;
  if (playButton.children[0]) {
    playButton.children[0].animate([{transform: 'rotate(0deg)'}, {transform: 'rotate(360deg)'}], {duration: 1000, iterations: Infinity});
  }
  playButton.style.background = "#475569"; 
  clearHighlight();

  state.currentAudioTime = 0;

  try {
    chrome.storage.local.get(["voice", "rate"], async (result: Record<string, any>) => {
      try {
        const voice = (result.voice as string) || "en-US-AriaNeural";
        const rateArray = (result.rate as number[]) || [0];
        const rateString = rateArray[0] >= 0 ? `+${rateArray[0]}%` : `${rateArray[0]}%`;

        let isFirstChunk = true;
        state.activeWordBoundaries = [];
        state.activeFullText = fullTextToRead;
        let lastCharOffset = 0;

        const handlePlaybackEnded = () => {
          state.isLoading = false;
          setPlaying(false);
          clearHighlight();
          playButton.innerHTML = PLAY_SVG;
          playButton.style.background = "#2563eb";
          
          const nextEl = getNextValidElement(state.activeTarget!);
          if (nextEl) {
            state.currentTarget = nextEl;
            state.currentTextNode = null;
            const walker = document.createTreeWalker(state.currentTarget, NodeFilter.SHOW_TEXT, null);
            let node: Node | null;
            while ((node = walker.nextNode())) {
              if (node.textContent && node.textContent.trim().length > 0) {
                state.currentTextNode = node;
                break;
              }
            }
            syncPosition();
            setTimeout(() => {
              handlePlayAction(null, nextEl);
            }, 100);
          } else {
            stopSession();
          }
        };

        let lastHighlightedWord: any = null;

        if (state.currentHighlightTick) clearInterval(state.currentHighlightTick);
        state.currentHighlightTick = setInterval(() => {
          if (!state.isPlaying) return;
          const currentTimeMs = state.currentAudioTime * 1000;
          
          const currentWord = state.activeWordBoundaries.find(w => 
            currentTimeMs >= w.audioOffsetMs && 
            currentTimeMs <= (w.audioOffsetMs + w.durationMs)
          );

          if (currentWord && state.activeTarget && 'highlights' in CSS) {
            if (currentWord !== lastHighlightedWord) {
              lastHighlightedWord = currentWord;
              const range = createRangeFromOffset(state.activeTarget, currentWord.charOffset, currentWord.charLength);
              if (range) {
                const highlight = new (window as any).Highlight(range);
                (CSS as any).highlights.set(state.activeHighlightName, highlight);
              }
            }
          } else if (!currentWord && lastHighlightedWord && 'highlights' in CSS) {
            lastHighlightedWord = null;
            (CSS as any).highlights.delete(state.activeHighlightName);
          }
        }, 50);

        if (!isExtensionValid()) {
          stopSession();
          alert("Edge Natural TTS: The extension was updated or reloaded. Please refresh the page.");
          return;
        }

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

        state.activePort.onMessage.addListener(function onMsg(msg) {
          if (state.activeTarget !== targetToPlay) {
            state.activePort?.onMessage.removeListener(onMsg);
            return;
          }

          if (msg.type === "TIME_UPDATE") {
            state.currentAudioTime = msg.currentTime;
            if (isFirstChunk) {
              isFirstChunk = false;
              state.isLoading = false;
              setPlaying(true);
              playButton.innerHTML = PAUSE_SVG;
              playButton.style.background = "#ef4444"; 
            }
          } else if (msg.type === "PLAYBACK_ENDED") {
            state.activePort?.onMessage.removeListener(onMsg);
            handlePlaybackEnded();
          } else if (msg.type === "WordBoundary") {
            if (msg.offset !== undefined) {
              const audioOffsetMs = msg.offset / 10000;
              const durationMs = msg.duration / 10000;
              const wordStr = msg.textObj || "";
              if (wordStr.length > 0) {
                const charOffset = fullTextToRead.indexOf(wordStr, lastCharOffset);
                if (charOffset !== -1) {
                  const charLength = wordStr.length;
                  lastCharOffset = charOffset + charLength;
                  state.activeWordBoundaries.push({ audioOffsetMs, durationMs, charOffset, charLength });
                  
                  if (state.pendingSeekCharOffset !== null && charOffset >= state.pendingSeekCharOffset) {
                    state.activePort?.postMessage({ type: "SEEK", offset: audioOffsetMs / 1000 });
                    state.pendingSeekCharOffset = null;
                  }
                }
              }
            }
          } else if (msg.type === "WordBoundaryArray") {
            for (const wb of msg.data) {
              const audioOffsetMs = wb.offset / 10000;
              const durationMs = wb.duration / 10000;
              const wordStr = wb.textObj || "";
              if (wordStr.length > 0) {
                const charOffset = fullTextToRead.indexOf(wordStr, lastCharOffset);
                if (charOffset !== -1) {
                  const charLength = wordStr.length;
                  lastCharOffset = charOffset + charLength;
                  state.activeWordBoundaries.push({ audioOffsetMs, durationMs, charOffset, charLength });
                  
                  if (state.pendingSeekCharOffset !== null && charOffset >= state.pendingSeekCharOffset) {
                    state.activePort?.postMessage({ type: "SEEK", offset: audioOffsetMs / 1000 });
                    state.pendingSeekCharOffset = null;
                  }
                }
              }
            }
          } else if (msg.type === "error") {
            console.error("Stream error from background:", msg.error);
            alert("Edge Natural TTS Error: " + msg.error);
            stopSession();
          }
        });

        state.activePort.postMessage({
          type: "START",
          text: fullTextToRead,
          voice,
          rateString
        });

        let nextPreloadEl = getNextValidElement(state.activeTarget!);
        for (let i = 0; i < 2; i++) {
          if (nextPreloadEl) {
            const nextText = extractRawText(nextPreloadEl);
            if (nextText.trim()) {
              state.activePort.postMessage({ type: "PRELOAD", text: nextText, voice, rateString });
            }
            nextPreloadEl = getNextValidElement(nextPreloadEl);
          } else {
            break;
          }
        }

      } catch (innerError) {
        console.error("TTS generation failed (inner):", innerError);
        stopSession();
      }
    });
  } catch (error) {
    console.error("TTS generation failed:", error);
    stopSession();
  }
}
