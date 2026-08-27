/// <reference types="chrome" />
import { WordBoundary } from './types';

export const state = {
  isPlaying: false,
  isLoading: false,
  currentAudioTime: 0,
  currentTarget: null as HTMLElement | null,
  activeTarget: null as HTMLElement | null,
  activePort: null as chrome.runtime.Port | null,
  currentTextNode: null as Node | null,
  hoverTimer: null as any,
  syncInterval: null as any,
  currentHighlightTick: null as any,
  activeHighlightName: "edge-tts-highlight",
  sentenceHighlightName: "aura-sentence-hover",
  isSiteIgnored: false,
  activeFullText: "",
  activeWordBoundaries: [] as WordBoundary[],
  hoveredAudioOffset: null as number | null,
  lastSentenceStart: -1,
  hoveredValidEl: null as HTMLElement | null,
  hoveredSentenceStart: 0,
  pendingSeekCharOffset: null as number | null
};
