/// <reference types="chrome" />
import { state } from './state';
import { getClosestValidElement, checkIgnoredSites } from './dom-scanner';
import { injectHighlightStyles, handleSentenceHover, clearSentenceHover } from './highlighter';
import { playButton, floatingBar, globalPlayPauseButton, syncPosition, updatePlayButtonAppearance, applyFloatingTheme, updateFloatingSpeed, setOnSpeedChangeCallback } from './floating-ui';
import { handlePlayAction, applySpeedChangeDuringPlayback } from './tts-client';

// 1. Inject styling for CSS Custom Highlights
injectHighlightStyles();

// 2. Connect floating UI speed adjustment to active playback
setOnSpeedChangeCallback((newRate) => {
  applySpeedChangeDuringPlayback(newRate);
});

// 3. Load and listen for ignored sites, theme preference, and speed rate
try {
  chrome.storage.local.get(["ignoredSites", "pdfTheme", "theme", "rate"], (result: Record<string, any>) => {
    checkIgnoredSites(Array.isArray(result.ignoredSites) ? result.ignoredSites : []);
    const themeVal = result.theme || result.pdfTheme;
    if (themeVal === 'light') {
      applyFloatingTheme('light');
    } else {
      applyFloatingTheme('dark');
    }
    if (result.rate && Array.isArray(result.rate) && result.rate.length > 0) {
      updateFloatingSpeed(result.rate[0]);
    }
  });

  chrome.storage.onChanged.addListener((changes, namespace) => {
    if (namespace === 'local') {
      if (changes.ignoredSites) {
        checkIgnoredSites(Array.isArray(changes.ignoredSites.newValue) ? changes.ignoredSites.newValue : []);
      }
      if (changes.theme || changes.pdfTheme) {
        const next = changes.theme ? changes.theme.newValue : changes.pdfTheme?.newValue;
        applyFloatingTheme(next === 'light' ? 'light' : 'dark');
      }
      if (changes.rate && Array.isArray(changes.rate.newValue) && changes.rate.newValue.length > 0) {
        updateFloatingSpeed(changes.rate.newValue[0]);
      }
    }
  });
} catch (e) {}

// 3. Connect play button action
playButton.onclick = (e) => handlePlayAction(e);

// 4. Click event listener (Sentence seek & Play)
document.addEventListener("click", (e) => {
  if (state.isSiteIgnored) return;
  const target = e.target as HTMLElement;
  if (target === playButton || playButton.contains(target) || floatingBar.contains(target) || globalPlayPauseButton.contains(target)) return;

  const selection = window.getSelection();
  if (selection && selection.toString().trim().length > 0) {
    return;
  }

  const clickedValidEl = getClosestValidElement(target);
  if (clickedValidEl && state.activeTarget !== null) {
    e.preventDefault();
    e.stopPropagation();

    if (clickedValidEl === state.activeTarget && state.isPlaying && state.hoveredAudioOffset !== null && state.activePort) {
      state.activePort.postMessage({ type: "SEEK", offset: state.hoveredAudioOffset / 1000 });
    } else {
      state.pendingSeekCharOffset = (clickedValidEl === state.hoveredValidEl) ? state.hoveredSentenceStart : null;
      state.currentTarget = clickedValidEl;
      handlePlayAction(null, clickedValidEl);
    }
  }
}, true);

// 5. Mousemove event listener (Hover sentence detection & Play button placement)
document.addEventListener("mousemove", (e) => {
  if (state.isSiteIgnored) return;

  const target = e.target as HTMLElement;
  const validEl = getClosestValidElement(target);
  
  if (target === playButton || playButton.contains(target)) {
    if (state.hoverTimer) {
      clearTimeout(state.hoverTimer);
      state.hoverTimer = null;
    }
    clearSentenceHover();
    return;
  }

  if (validEl) {
    if (state.hoverTimer) {
      clearTimeout(state.hoverTimer);
      state.hoverTimer = null;
    }
    
    // Only activate sentence hover highlighting when a playback session is active (floating bar is open)
    if (state.activeTarget !== null) {
      handleSentenceHover(e, validEl);
    } else {
      clearSentenceHover();
    }
    
    if (state.currentTarget !== validEl) {
      if (state.currentTarget && validEl.contains(state.currentTarget)) {
        // Keep current target locked inside nested containers
      } else {
        state.currentTarget = validEl;
        
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
        
        if (!state.syncInterval) {
          state.syncInterval = setInterval(syncPosition, 50); 
        }
        updatePlayButtonAppearance();
      }
    }
    
    playButton.style.opacity = "1";
    playButton.style.pointerEvents = "auto";
  } else {
    clearSentenceHover();
    if (!state.hoverTimer) {
      state.hoverTimer = setTimeout(() => {
        if (!state.isPlaying && !state.isLoading) {
          playButton.style.opacity = "0";
          playButton.style.pointerEvents = "none";
          state.currentTarget = null;
          if (state.syncInterval) {
            clearInterval(state.syncInterval);
            state.syncInterval = null;
          }
        }
        state.hoverTimer = null;
      }, 400); 
    }
  }
});
