import { state } from './state';
import { clearHighlight, clearSentenceHover } from './highlighter';
import { createElement, Play, Pause, Square, Loader2 } from 'lucide';

export const PLAY_BTN_BG_IDLE = "rgba(16, 185, 129, 0.2)";
export const PLAY_BTN_BORDER_IDLE = "rgba(16, 185, 129, 0.4)";
export const PLAY_BTN_COLOR_IDLE = "#10b981";

export const PLAY_BTN_BG_HOVER = "rgba(16, 185, 129, 0.35)";
export const PLAY_BTN_BORDER_HOVER = "rgba(16, 185, 129, 0.65)";

export const PLAY_BTN_BG_PLAYING = "rgba(239, 68, 68, 0.2)";
export const PLAY_BTN_BORDER_PLAYING = "rgba(239, 68, 68, 0.4)";
export const PLAY_BTN_COLOR_PLAYING = "#ef4444";

export const PLAY_BTN_BG_PLAYING_HOVER = "rgba(239, 68, 68, 0.35)";
export const PLAY_BTN_BORDER_PLAYING_HOVER = "rgba(239, 68, 68, 0.65)";

export const PLAY_SVG = createElement(Play, {
  width: 10,
  height: 10,
  fill: 'currentColor',
  stroke: 'currentColor',
  'stroke-width': 2,
  'stroke-linecap': 'round',
  'stroke-linejoin': 'round',
  style: 'display: block; flex-shrink: 0;'
}).outerHTML;

export const PAUSE_SVG = createElement(Pause, {
  width: 9.5,
  height: 9.5,
  fill: 'currentColor',
  stroke: 'currentColor',
  'stroke-width': 2,
  'stroke-linecap': 'round',
  'stroke-linejoin': 'round',
  style: 'display: block; flex-shrink: 0;'
}).outerHTML;

export const LOAD_SVG = createElement(Loader2, {
  width: 10.5,
  height: 10.5,
  stroke: 'currentColor',
  'stroke-width': 2.5,
  style: 'display: block; flex-shrink: 0;'
}).outerHTML;

export const GLOBAL_PLAY_SVG = createElement(Play, {
  width: 15,
  height: 15,
  fill: 'currentColor',
  stroke: 'currentColor',
  'stroke-width': 2,
  'stroke-linecap': 'round',
  'stroke-linejoin': 'round',
  style: 'display: block; flex-shrink: 0;'
}).outerHTML;

export const GLOBAL_PAUSE_SVG = createElement(Pause, {
  width: 14,
  height: 14,
  fill: 'currentColor',
  stroke: 'currentColor',
  'stroke-width': 2,
  'stroke-linecap': 'round',
  'stroke-linejoin': 'round',
  style: 'display: block; flex-shrink: 0;'
}).outerHTML;

export const GLOBAL_STOP_SVG = createElement(Square, {
  width: 13,
  height: 13,
  fill: 'currentColor',
  stroke: 'currentColor',
  'stroke-width': 2,
  'stroke-linecap': 'round',
  'stroke-linejoin': 'round',
  style: 'display: block; flex-shrink: 0;'
}).outerHTML;

export const playButton = document.createElement("button");
playButton.id = "edge-tts-hover-play";
playButton.innerHTML = PLAY_SVG;
Object.assign(playButton.style, {
  position: "absolute",
  zIndex: "2147483647",
  background: PLAY_BTN_BG_IDLE,
  color: PLAY_BTN_COLOR_IDLE,
  border: `1px solid ${PLAY_BTN_BORDER_IDLE}`,
  borderRadius: "5px",
  backdropFilter: "blur(4px)",
  width: "20px",
  height: "20px",
  minWidth: "20px",
  minHeight: "20px",
  maxWidth: "20px",
  maxHeight: "20px",
  padding: "0",
  margin: "0",
  boxSizing: "border-box",
  lineHeight: "0",
  fontSize: "0",
  outline: "none",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  cursor: "pointer",
  boxShadow: "none",
  opacity: "0",
  pointerEvents: "none",
  transition: "opacity 0.15s ease, background 0.15s ease, border-color 0.15s ease, transform 0.1s ease"
});
playButton.onmouseenter = () => {
  if (state.isPlaying && state.currentTarget === state.activeTarget) {
    playButton.style.background = PLAY_BTN_BG_PLAYING_HOVER;
    playButton.style.borderColor = PLAY_BTN_BORDER_PLAYING_HOVER;
  } else {
    playButton.style.background = PLAY_BTN_BG_HOVER;
    playButton.style.borderColor = PLAY_BTN_BORDER_HOVER;
  }
};
playButton.onmouseleave = () => {
  if (state.isPlaying && state.currentTarget === state.activeTarget) {
    playButton.style.background = PLAY_BTN_BG_PLAYING;
    playButton.style.borderColor = PLAY_BTN_BORDER_PLAYING;
  } else {
    playButton.style.background = PLAY_BTN_BG_IDLE;
    playButton.style.borderColor = PLAY_BTN_BORDER_IDLE;
  }
};
document.body.appendChild(playButton);

export function setPlayButtonIdle() {
  playButton.innerHTML = PLAY_SVG;
  playButton.style.background = PLAY_BTN_BG_IDLE;
  playButton.style.borderColor = PLAY_BTN_BORDER_IDLE;
  playButton.style.color = PLAY_BTN_COLOR_IDLE;
}

export function setPlayButtonPlaying() {
  playButton.innerHTML = PAUSE_SVG;
  playButton.style.background = PLAY_BTN_BG_PLAYING;
  playButton.style.borderColor = PLAY_BTN_BORDER_PLAYING;
  playButton.style.color = PLAY_BTN_COLOR_PLAYING;
}

export function setPlayButtonLoading() {
  playButton.innerHTML = LOAD_SVG;
  playButton.style.background = "rgba(71, 85, 105, 0.25)";
  playButton.style.borderColor = "rgba(71, 85, 105, 0.45)";
  playButton.style.color = "#94a3b8";
  if (playButton.children[0]) {
    playButton.children[0].animate([{transform: 'rotate(0deg)'}, {transform: 'rotate(360deg)'}], {duration: 1000, iterations: Infinity});
  }
}

export const floatingBar = document.createElement("div");
floatingBar.id = "edge-tts-floating-bar";
Object.assign(floatingBar.style, {
  position: "fixed",
  top: "50%",
  right: "20px",
  transform: "translateY(-50%) translateX(100px)",
  backgroundColor: "rgba(9, 14, 12, 0.95)",
  backdropFilter: "blur(12px)",
  border: "1px solid rgba(16, 185, 129, 0.25)",
  borderRadius: "10px",
  padding: "5px",
  display: "flex",
  flexDirection: "column",
  gap: "6px",
  zIndex: "2147483647",
  transition: "transform 0.3s cubic-bezier(0.16, 1, 0.3, 1), opacity 0.3s",
  opacity: "0",
  pointerEvents: "none",
  boxShadow: "none"
});

export const globalPlayPauseButton = document.createElement("button");
Object.assign(globalPlayPauseButton.style, {
  width: "30px",
  height: "30px",
  minWidth: "30px",
  minHeight: "30px",
  maxWidth: "30px",
  maxHeight: "30px",
  padding: "0",
  margin: "0",
  boxSizing: "border-box",
  lineHeight: "0",
  fontSize: "0",
  outline: "none",
  borderRadius: "6px",
  border: "1px solid rgba(16, 185, 129, 0.3)",
  backgroundColor: "rgba(16, 185, 129, 0.15)",
  color: "#10b981",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  cursor: "pointer",
  transition: "background-color 0.15s ease, border-color 0.15s ease"
});
globalPlayPauseButton.onmouseenter = () => {
  globalPlayPauseButton.style.backgroundColor = "rgba(16, 185, 129, 0.25)";
  globalPlayPauseButton.style.borderColor = "rgba(16, 185, 129, 0.5)";
};
globalPlayPauseButton.onmouseleave = () => {
  globalPlayPauseButton.style.backgroundColor = "rgba(16, 185, 129, 0.15)";
  globalPlayPauseButton.style.borderColor = "rgba(16, 185, 129, 0.3)";
};

export function updateGlobalPlayPauseIcon() {
  if (state.isPlaying) {
    globalPlayPauseButton.innerHTML = GLOBAL_PAUSE_SVG;
  } else {
    globalPlayPauseButton.innerHTML = GLOBAL_PLAY_SVG;
  }
}
updateGlobalPlayPauseIcon();

export function setPlaying(val: boolean) {
  state.isPlaying = val;
  updateGlobalPlayPauseIcon();
}

globalPlayPauseButton.onclick = () => {
  if (state.isPlaying && state.activePort) {
    state.activePort.postMessage({ type: "PAUSE" });
    setPlaying(false);
    clearHighlight(false);
    if (state.currentTarget === state.activeTarget) {
      playButton.innerHTML = PLAY_SVG;
      playButton.style.background = "#10b981";
    }
  } else if (!state.isPlaying && state.activePort && state.activeTarget !== null) {
    state.activePort.postMessage({ type: "PLAY" });
    setPlaying(true);
    if (state.currentTarget === state.activeTarget) {
      playButton.innerHTML = PAUSE_SVG;
      playButton.style.background = "#ef4444";
    }
  }
};
floatingBar.appendChild(globalPlayPauseButton);

export const stopButton = document.createElement("button");
stopButton.innerHTML = GLOBAL_STOP_SVG;
Object.assign(stopButton.style, {
  width: "30px",
  height: "30px",
  minWidth: "30px",
  minHeight: "30px",
  maxWidth: "30px",
  maxHeight: "30px",
  padding: "0",
  margin: "0",
  boxSizing: "border-box",
  lineHeight: "0",
  fontSize: "0",
  outline: "none",
  borderRadius: "6px",
  border: "1px solid rgba(239, 68, 68, 0.3)",
  backgroundColor: "rgba(239, 68, 68, 0.15)",
  color: "#ef4444",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  cursor: "pointer",
  transition: "background-color 0.15s ease, border-color 0.15s ease"
});
stopButton.onmouseenter = () => {
  stopButton.style.backgroundColor = "rgba(239, 68, 68, 0.25)";
  stopButton.style.borderColor = "rgba(239, 68, 68, 0.5)";
};
stopButton.onmouseleave = () => {
  stopButton.style.backgroundColor = "rgba(239, 68, 68, 0.15)";
  stopButton.style.borderColor = "rgba(239, 68, 68, 0.3)";
};

stopButton.onclick = () => {
  stopSession();
};

floatingBar.appendChild(stopButton);
document.body.appendChild(floatingBar);

export function stopSession() {
  if (state.activePort) {
    state.activePort.postMessage({ type: "STOP" });
    state.activePort.disconnect();
    state.activePort = null;
  }
  setPlaying(false);
  state.isLoading = false;
  state.activeTarget = null;
  clearHighlight(true);
  clearSentenceHover();
  
  floatingBar.style.transform = "translateY(-50%) translateX(100px)";
  floatingBar.style.opacity = "0";
  floatingBar.style.pointerEvents = "none";
  
  if (state.currentTarget) {
    updatePlayButtonAppearance();
  } else {
    playButton.style.opacity = "0";
    playButton.style.pointerEvents = "none";
  }
}

export function startSession() {
  floatingBar.style.transform = "translateY(-50%) translateX(0)";
  floatingBar.style.opacity = "1";
  floatingBar.style.pointerEvents = "auto";
}

export function syncPosition() {
  if (!state.currentTarget) return;
  
  const targetRect = state.currentTarget.getBoundingClientRect();
  let firstLineRect: DOMRect | null = null;

  if (state.currentTextNode && state.currentTextNode.isConnected) {
    try {
      const range = document.createRange();
      const text = state.currentTextNode.textContent || '';
      let startOffset = 0;
      while (startOffset < text.length && /\s/.test(text[startOffset])) {
        startOffset++;
      }
      const endOffset = Math.min(text.length, startOffset + Math.min(6, text.length - startOffset));
      if (endOffset > startOffset) {
        range.setStart(state.currentTextNode, startOffset);
        range.setEnd(state.currentTextNode, endOffset);
      } else {
        range.selectNodeContents(state.currentTextNode);
      }
      const rects = range.getClientRects();
      if (rects.length > 0) {
        firstLineRect = rects[0];
      }
    } catch {
      // fallback
    }
  }

  if (!firstLineRect) {
    const targetClientRects = state.currentTarget.getClientRects();
    if (targetClientRects.length > 0) {
      firstLineRect = targetClientRects[0];
    }
  }

  const line = firstLineRect || targetRect;
  // Vertically align with the first line of the paragraph
  const lineOffset = Math.max(0, Math.floor((line.height - 20) / 2));
  const top = line.top + window.scrollY + lineOffset;
  const left = Math.max(4, targetRect.left + window.scrollX - 25);
  
  playButton.style.top = `${top}px`;
  playButton.style.left = `${left}px`;
}

export function updatePlayButtonAppearance() {
  if (state.isLoading) return;
  if (state.isPlaying && state.currentTarget === state.activeTarget && state.activeTarget !== null) {
    setPlayButtonPlaying();
  } else {
    setPlayButtonIdle();
  }
}

export function isExtensionValid(): boolean {
  try {
    return !!(typeof chrome !== "undefined" && chrome.runtime && chrome.runtime.id);
  } catch {
    return false;
  }
}
