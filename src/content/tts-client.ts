/// <reference types="chrome" />
import { state } from './state';
import { extractRawText, getNextValidElement, createRangeFromOffset } from './dom-scanner';
import { clearHighlight } from './highlighter';
import { playButton, PLAY_SVG, PAUSE_SVG, LOAD_SVG, startSession, stopSession, setPlaying, setLoading, syncPosition, isExtensionValid, setPlayButtonIdle, setPlayButtonPlaying, setPlayButtonLoading } from './floating-ui';

let currentSessionRate = 0;

export function applySpeedChangeDuringPlayback(newRate: number) {
  if (state.activePort && state.activeTarget) {
    const curMult = 1 + currentSessionRate / 100;
    const newMult = 1 + newRate / 100;
    const relativeRate = Math.max(0.25, Math.min(4.0, newMult / curMult));
    state.activePort.postMessage({ type: "SET_PLAYBACK_RATE", rate: relativeRate });

    // Clear background preload queue and cache so old rate is not used
    state.activePort.postMessage({ type: "CLEAR_PRELOAD" });
    const newRateString = newRate >= 0 ? `+${newRate}%` : `${newRate}%`;
    chrome.storage.local.get(["voice"], (vRes) => {
      const voice = (vRes.voice as string) || "en-US-AriaNeural";
      let nextPreloadEl = getNextValidElement(state.activeTarget!);
      for (let i = 0; i < 4; i++) {
        if (nextPreloadEl) {
          const nextText = extractRawText(nextPreloadEl);
          if (nextText.trim()) {
            state.activePort?.postMessage({ type: "PRELOAD", text: nextText, voice, rateString: newRateString });
          }
          nextPreloadEl = getNextValidElement(nextPreloadEl);
        } else {
          break;
        }
      }
    });
  }
}

let generationWatchdog: any = null;

function resetWatchdog() {
  if (generationWatchdog) {
    clearTimeout(generationWatchdog);
    generationWatchdog = null;
  }
}

export async function handlePlayAction(e: any, forceTarget?: HTMLElement, force = false, retryCount = 0) {
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
    if (targetToPlay === state.activeTarget && !force) {
      if (state.activePort) state.activePort.postMessage({ type: "PAUSE" });
      setPlaying(false);
      setPlayButtonIdle();
      return;
    } else {
      if (state.activePort) {
        state.activePort.postMessage({ type: "STOP" });
      }
      setPlaying(false);
      clearHighlight(true);
    }
  }

  if (!state.isPlaying && targetToPlay === state.activeTarget && state.activeTarget !== null && !force && !state.isLoading) {
    if (state.activePort) {
      state.activePort.postMessage({ type: "PLAY" });
    }
    setPlaying(true);
    setPlayButtonPlaying();
    return;
  }

  if (state.isLoading) {
    if (force) {
      // Force retry permitted
    } else if (targetToPlay && targetToPlay !== state.activeTarget) {
      // User clicked a different sentence while previous was loading:
      // Cancel previous request and switch immediately!
      if (state.activePort) {
        state.activePort.postMessage({ type: "STOP" });
      }
      resetWatchdog();
      setLoading(false);
      clearHighlight(true);
    } else {
      return;
    }
  }

  if (!targetToPlay) return;

  const fullTextToRead = extractRawText(targetToPlay);
  if (!fullTextToRead || !fullTextToRead.trim()) return;

  setLoading(true);
  state.activeTarget = targetToPlay;
  startSession();
  setPlayButtonLoading();
  clearHighlight();

  state.currentAudioTime = 0;

  resetWatchdog();
  generationWatchdog = setTimeout(() => {
    if (state.isLoading && state.activeTarget === targetToPlay) {
      console.warn("ReadFlow: TTS generation timed out.");
      resetWatchdog();
      stopSession();
    }
  }, 15000);

  try {
    chrome.storage.local.get(["voice", "rate"], async (result: Record<string, any>) => {
      try {
        const voice = (result.voice as string) || "en-US-AriaNeural";
        const rateArray = (result.rate as number[]) || [0];
        currentSessionRate = rateArray[0];
        const rateString = rateArray[0] >= 0 ? `+${rateArray[0]}%` : `${rateArray[0]}%`;

        let isFirstChunk = true;
        state.activeWordBoundaries = [];
        state.activeFullText = fullTextToRead;
        let lastCharOffset = 0;

        const handlePlaybackEnded = () => {
          resetWatchdog();
          setLoading(false);
          setPlaying(false);
          clearHighlight();
          setPlayButtonIdle();
          
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
            resetWatchdog();
            if (state.currentHighlightTick) {
              clearInterval(state.currentHighlightTick);
              state.currentHighlightTick = null;
            }
            if (state.isLoading || state.isPlaying) {
              stopSession();
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
              resetWatchdog();
              setLoading(false);
              setPlaying(true);
              setPlayButtonPlaying(); 
            }
          } else if (msg.type === "PLAYBACK_ENDED") {
            resetWatchdog();
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
          } else if (msg.type === "error" || msg.type === "PLAYBACK_ERROR") {
            resetWatchdog();
            state.activePort?.onMessage.removeListener(onMsg);
            const errStr = (msg.error || "").toLowerCase();
            const isHostError = errStr.includes("host not found") || 
                                errStr.includes("specified native messaging");

            if (isHostError) {
              console.error("Native Voice Host Error:", msg.error);
              alert("ReadFlow Setup Required:\n\nTo enable neural voices, please run install.bat in the 'native-host' folder of the ReadFlow directory.\n\nThen refresh this webpage to listen.");
              stopSession();
              return;
            }

            if (retryCount < 2) {
              console.warn(`TTS generation interrupted. Retrying (attempt ${retryCount + 1})...`);
              setTimeout(() => {
                handlePlayAction(null, targetToPlay, true, retryCount + 1);
              }, 300);
            } else {
              console.error("Stream error from background:", msg.error);
              alert("ReadFlow TTS Error: " + msg.error);
              stopSession();
            }
          }
        });

        state.activePort.postMessage({
          type: "START",
          text: fullTextToRead,
          voice,
          rateString,
          force: !!force
        });

        let nextPreloadEl = getNextValidElement(state.activeTarget!);
        for (let i = 0; i < 4; i++) {
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
