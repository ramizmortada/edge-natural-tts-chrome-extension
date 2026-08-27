/// <reference types="chrome" />

export interface WordBoundary {
  audioOffsetMs: number;
  durationMs: number;
  charOffset: number;
  charLength: number;
}

export interface ChatSiteConfig {
  domain: string;
  messageSelector: string;
}
