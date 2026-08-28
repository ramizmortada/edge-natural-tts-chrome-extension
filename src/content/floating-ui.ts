/// <reference types="chrome" />
import { state } from './state';
import { clearHighlight, clearSentenceHover } from './highlighter';

export const PLAY_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="1" stroke-linecap="round" stroke-linejoin="round"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>`;
export const PAUSE_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="1" stroke-linecap="round" stroke-linejoin="round"><rect x="6" y="4" width="4" height="16"></rect><rect x="14" y="4" width="4" height="16"></rect></svg>`;
export const LOAD_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 1 1-6.219-8.56"></path></svg>`;

export const playButton = document.createElement("button");
playButton.id = "edge-tts-hover-play";
playButton.innerHTML = PLAY_SVG;
Object.assign(playButton.style, {
  position: "absolute",
  zIndex: "2147483647",
  background: "#2563eb",
  color: "white",
  border: "none",
  borderRadius: "50%",
  width: "20px",
  height: "20px",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  cursor: "pointer",
  boxShadow: "0 4px 12px rgba(37, 99, 235, 0.4)",
  opacity: "0",
  pointerEvents: "none",
  transition: "opacity 0.15s ease, background 0.2s"
});
document.body.appendChild(playButton);

export const floatingBar = document.createElement("div");
floatingBar.id = "edge-tts-floating-bar";
Object.assign(floatingBar.style, {
  position: "fixed",
  top: "50%",
  right: "20px",
  transform: "translateY(-50%) translateX(100px)",
  backgroundColor: "rgba(15, 23, 42, 0.8)",
  backdropFilter: "blur(8px)",
  border: "1px solid rgba(255, 255, 255, 0.1)",
  borderRadius: "12px",
  padding: "8px",
  display: "flex",
  flexDirection: "column",
  gap: "12px",
  zIndex: "2147483647",
  transition: "transform 0.3s cubic-bezier(0.16, 1, 0.3, 1), opacity 0.3s",
  opacity: "0",
  pointerEvents: "none",
  boxShadow: "0 10px 25px rgba(0, 0, 0, 0.3)"
});

export const globalPlayPauseButton = document.createElement("button");
Object.assign(globalPlayPauseButton.style, {
  width: "36px",
  height: "36px",
  borderRadius: "8px",
  border: "none",
  backgroundColor: "rgba(37, 99, 235, 0.2)",
  color: "#3b82f6",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  cursor: "pointer",
  transition: "background-color 0.2s"
});
globalPlayPauseButton.onmouseenter = () => globalPlayPauseButton.style.backgroundColor = "rgba(37, 99, 235, 0.4)";
globalPlayPauseButton.onmouseleave = () => globalPlayPauseButton.style.backgroundColor = "rgba(37, 99, 235, 0.2)";

export function updateGlobalPlayPauseIcon() {
  if (state.isPlaying) {
    globalPlayPauseButton.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16"></rect><rect x="14" y="4" width="4" height="16"></rect></svg>`;
  } else {
    globalPlayPauseButton.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>`;
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
      playButton.style.background = "#2563eb";
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
stopButton.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="6" width="12" height="12" rx="2" ry="2"></rect></svg>`;
Object.assign(stopButton.style, {
  width: "36px",
  height: "36px",
  borderRadius: "8px",
  border: "none",
  backgroundColor: "rgba(239, 68, 68, 0.2)",
  color: "#ef4444",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  cursor: "pointer",
  transition: "background-color 0.2s"
});
stopButton.onmouseenter = () => stopButton.style.backgroundColor = "rgba(239, 68, 68, 0.4)";
stopButton.onmouseleave = () => stopButton.style.backgroundColor = "rgba(239, 68, 68, 0.2)";

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
  
  let rect: DOMRect;
  if (state.currentTextNode && state.currentTextNode.isConnected) {
    try {
      const range = document.createRange();
      range.selectNodeContents(state.currentTextNode);
      rect = range.getBoundingClientRect();
    } catch {
      rect = state.currentTarget.getBoundingClientRect();
    }
  } else {
    rect = state.currentTarget.getBoundingClientRect();
  }

  const top = rect.top + window.scrollY;
  const left = Math.max(4, rect.left + window.scrollX - 24);
  
  playButton.style.top = `${top}px`;
  playButton.style.left = `${left}px`;
}

export function updatePlayButtonAppearance() {
  if (state.isLoading) return;
  if (state.isPlaying && state.currentTarget === state.activeTarget && state.activeTarget !== null) {
    playButton.innerHTML = PAUSE_SVG;
    playButton.style.background = "#ef4444";
  } else {
    playButton.innerHTML = PLAY_SVG;
    playButton.style.background = "#2563eb";
  }
}

export function isExtensionValid(): boolean {
  try {
    return !!(typeof chrome !== "undefined" && chrome.runtime && chrome.runtime.id);
  } catch {
    return false;
  }
}
