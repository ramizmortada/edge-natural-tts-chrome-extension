/// <reference types="chrome" />
import { showLoading } from '../ui';
import { renderGenericDocumentToReader } from './index';

export async function loadTextFromBuffer(fileName: string, text: string) {
  showLoading(`Reading ${fileName}...`);
  const rawParas = text.split(/\r?\n\s*\r?\n+/).map(p => p.trim()).filter(p => p.length > 0);

  const sections: { pageNum: number; title: string; paragraphs: string[] }[] = [];
  let curParas: string[] = [];
  let curWords = 0;
  let pageCounter = 1;

  for (const p of rawParas) {
    const words = p.split(/\s+/).length;
    if (curWords + words > 350 && curParas.length > 0) {
      sections.push({ pageNum: pageCounter++, title: `Section ${sections.length + 1}`, paragraphs: curParas });
      curParas = [];
      curWords = 0;
    }
    curParas.push(p);
    curWords += words;
  }

  if (curParas.length > 0) {
    sections.push({ pageNum: pageCounter++, title: `Section ${sections.length + 1}`, paragraphs: curParas });
  }

  await renderGenericDocumentToReader(fileName, sections.length > 0 ? sections : [{ pageNum: 1, title: fileName, paragraphs: [text || 'Empty file.'] }]);
}

export async function loadMarkdownFromBuffer(fileName: string, rawMd: string) {
  showLoading(`Rendering Markdown (${fileName})...`);
  const lines = rawMd.split(/\r?\n/);

  const sections: { pageNum: number; title: string; paragraphs: string[] }[] = [];
  let curTitle = 'Introduction';
  let curPara = '';
  let curParas: string[] = [];
  let pageCounter = 1;

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith('#')) {
      if (curPara.trim()) {
        curParas.push(curPara.trim());
        curPara = '';
      }
      if (curParas.length > 0) {
        sections.push({ pageNum: pageCounter++, title: curTitle, paragraphs: curParas });
        curParas = [];
      }
      curTitle = trimmed.replace(/^#+\s*/, '');
    } else if (!trimmed) {
      if (curPara.trim()) {
        curParas.push(curPara.trim());
        curPara = '';
      }
    } else {
      if (curPara) curPara += ' ';
      curPara += trimmed;
    }
  }

  if (curPara.trim()) curParas.push(curPara.trim());
  if (curParas.length > 0) {
    sections.push({ pageNum: pageCounter++, title: curTitle, paragraphs: curParas });
  }

  await renderGenericDocumentToReader(fileName, sections.length > 0 ? sections : [{ pageNum: 1, title: fileName, paragraphs: [rawMd || 'Empty markdown file.'] }]);
}

export async function loadHtmlFromBuffer(fileName: string, htmlText: string) {
  showLoading(`Parsing HTML (${fileName})...`);
  const parser = new DOMParser();
  const doc = parser.parseFromString(htmlText, 'text/html');
  const title = doc.querySelector('title, h1')?.textContent?.trim() || fileName;

  const pEls = Array.from(doc.querySelectorAll('p, blockquote, li, h1, h2, h3'));
  const paragraphs = pEls.map(p => p.textContent?.trim() || '').filter(p => p.length > 0);

  const sections: { pageNum: number; title: string; paragraphs: string[] }[] = [];
  let curParas: string[] = [];
  let curWords = 0;
  let pageCounter = 1;

  for (const p of paragraphs) {
    const words = p.split(/\s+/).length;
    if (curWords + words > 400 && curParas.length > 0) {
      sections.push({ pageNum: pageCounter++, title: `Page ${sections.length + 1}`, paragraphs: curParas });
      curParas = [];
      curWords = 0;
    }
    curParas.push(p);
    curWords += words;
  }

  if (curParas.length > 0) {
    sections.push({ pageNum: pageCounter++, title: `Page ${sections.length + 1}`, paragraphs: curParas });
  }

  await renderGenericDocumentToReader(fileName, sections.length > 0 ? sections : [{ pageNum: 1, title, paragraphs: ['No readable text found in HTML.'] }]);
}
