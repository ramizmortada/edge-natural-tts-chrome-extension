/// <reference types="chrome" />
import { StoredDoc } from './types';
import { dom } from './dom';
import { state } from './state';

export class ReaderDB {
  private dbName = 'AuraTTS_ReaderDB';
  private version = 1;
  private db: IDBDatabase | null = null;

  async open(): Promise<IDBDatabase> {
    if (this.db) return this.db;
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(this.dbName, this.version);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains('documents')) {
          const store = db.createObjectStore('documents', { keyPath: 'id' });
          store.createIndex('lastOpened', 'lastOpened', { unique: false });
        }
      };
      req.onsuccess = () => {
        this.db = req.result;
        resolve(this.db);
      };
      req.onerror = () => reject(req.error);
    });
  }

  async saveDoc(doc: StoredDoc): Promise<void> {
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('documents', 'readwrite');
      const store = tx.objectStore('documents');
      const req = store.put(doc);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  }

  async getDoc(id: string): Promise<StoredDoc | null> {
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('documents', 'readonly');
      const store = tx.objectStore('documents');
      const req = store.get(id);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error);
    });
  }

  async getAllDocs(): Promise<StoredDoc[]> {
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('documents', 'readonly');
      const store = tx.objectStore('documents');
      const req = store.getAll();
      req.onsuccess = () => {
        const docs = (req.result as StoredDoc[]) || [];
        docs.sort((a, b) => (b.lastOpened || 0) - (a.lastOpened || 0));
        resolve(docs);
      };
      req.onerror = () => reject(req.error);
    });
  }

  async deleteDoc(id: string): Promise<void> {
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('documents', 'readwrite');
      const store = tx.objectStore('documents');
      const req = store.delete(id);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  }

  async clearAll(): Promise<void> {
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('documents', 'readwrite');
      const store = tx.objectStore('documents');
      const req = store.clear();
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  }
}

export const readerDB = new ReaderDB();

export function saveCleanedPageToStorage(docName: string, pNum: number, cleaned: string[], original: string[]) {
  if (!docName) return;
  const key = `cleaned_doc_${encodeURIComponent(docName)}`;
  chrome.storage.local.get([key], (res: Record<string, any>) => {
    const data: Record<number, { cleaned: string[]; original: string[]; time: number }> = res[key] || {};
    data[pNum] = { cleaned, original, time: Date.now() };
    chrome.storage.local.set({ [key]: data });
  });
}

export function removeCleanedPageFromStorage(docName: string, pNum: number) {
  if (!docName) return;
  const key = `cleaned_doc_${encodeURIComponent(docName)}`;
  chrome.storage.local.get([key], (res: Record<string, any>) => {
    const data: Record<number, { cleaned: string[]; original: string[]; time?: number }> = res[key] || {};
    delete data[pNum];
    chrome.storage.local.set({ [key]: data });
  });
}

export function getSavedCleanedDoc(docName: string): Promise<Record<number, { cleaned: string[]; original: string[] }>> {
  return new Promise((resolve) => {
    if (!docName) return resolve({});
    const key = `cleaned_doc_${encodeURIComponent(docName)}`;
    chrome.storage.local.get([key], (res: Record<string, any>) => {
      resolve(res[key] || {});
    });
  });
}

export function exportCleanedDocument() {
  if (state.allSentences.length === 0) {
    alert('No document loaded to export.');
    return;
  }

  const pageBlocks = Array.from(dom.readerContent ? dom.readerContent.querySelectorAll('.reader-page-block') : []) as HTMLElement[];
  let fullText = '';

  for (const block of pageBlocks) {
    const headerLeft = block.querySelector('.page-header-left');
    const headerText = headerLeft?.textContent?.trim() || `Page ${block.dataset.pageNumber}`;
    const paragraphs = Array.from(block.querySelectorAll('p.reader-paragraph'))
      .map(p => p.textContent?.trim())
      .filter(Boolean);

    fullText += `## ${headerText}\n\n`;
    fullText += paragraphs.join('\n\n') + '\n\n';
  }

  const cleanName = (state.currentDocTitle || 'document').replace(/\.[^/.]+$/, "");
  const blob = new Blob([fullText], { type: 'text/markdown;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${cleanName}_cleaned.md`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
