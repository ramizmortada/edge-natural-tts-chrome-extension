/// <reference types="chrome" />
import * as pdfjsLib from 'pdfjs-dist';
import { PageData, SentenceItem, UndoAction, ViewMode, WordBoundary } from './types';

export const state = {
  pdfDoc: null as pdfjsLib.PDFDocumentProxy | null,
  currentScale: 1.25,
  currentFontSize: 18,
  currentFontFamily: 'sans',
  currentTheme: 'dark-sepia',
  currentViewMode: 'reader' as ViewMode,
  pagesData: [] as PageData[],
  isPlaying: false,
  isPaused: false,
  isLoadingTTS: false,
  activePort: null as chrome.runtime.Port | null,
  currentAudioTime: 0,
  activeWordBoundaries: [] as WordBoundary[],
  activeSentenceIndex: -1,
  allSentences: [] as SentenceItem[],
  currentHighlightTick: null as any,
  hoveredSentence: null as SentenceItem | null,
  lastHoveredSentence: null as SentenceItem | null,
  currentVoice: "en-US-AriaNeural",
  currentRate: [0],
  pageObserver: null as IntersectionObserver | null,
  geminiApiKey: '',
  geminiModel: 'gemini-3.1-flash-lite',
  isAutoScrollEnabled: true,
  currentDocTitle: '',
  currentUndoStack: [] as UndoAction[],
  isRestoringState: false,
  isSidebarOpen: false
};
