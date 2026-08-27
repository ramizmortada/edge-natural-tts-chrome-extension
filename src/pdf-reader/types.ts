/// <reference types="chrome" />
import * as pdfjsLib from 'pdfjs-dist';

export interface SentenceItem {
  id: string;
  pageNumber: number;
  text: string;
  element: HTMLElement | null;
  readerElement?: HTMLElement | null;
  startOffsetInEl: number;
  endOffsetInEl: number;
}

export interface PageData {
  pageNumber: number;
  pageProxy: pdfjsLib.PDFPageProxy | null;
  wrapper: HTMLElement;
  canvas: HTMLCanvasElement;
  textLayerDiv: HTMLElement;
  sentences: SentenceItem[];
  isRendered: boolean;
  isRendering: boolean;
  renderTask: any;
}

export interface StoredDoc {
  id: string;
  name: string;
  type: string;
  size: number;
  arrayBuffer: ArrayBuffer;
  lastOpened: number;
  lastScrollTop: number;
  lastPage: number;
  lastSentenceIndex: number;
  aiEdits?: Record<number, { cleaned: string[]; original: string[]; time: number }>;
}

export interface UndoAction {
  pageNum: number;
  previousParas: string[];
  newParas: string[];
}

export interface WordBoundary {
  audioOffsetMs: number;
  durationMs: number;
  charOffset: number;
  charLength: number;
}

export type ViewMode = 'reader' | 'pdf';
