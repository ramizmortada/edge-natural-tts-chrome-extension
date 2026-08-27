/// <reference types="chrome" />
import mammoth from 'mammoth';
import { showLoading } from '../ui';
import { renderGenericDocumentToReader } from './index';

export async function loadDocxFromBuffer(fileName: string, arrayBuffer: ArrayBuffer) {
  showLoading(`Converting Word document (${fileName})...`);
  const result = await mammoth.convertToHtml({ arrayBuffer });
  const html = result.value;

  const parser = new DOMParser();
  const doc = parser.parseFromString(`<div>${html}</div>`, 'text/html');
  const elements = Array.from(doc.body.firstElementChild?.children || []);

  const sections: { pageNum: number; title: string; paragraphs: string[] }[] = [];
  let curTitle = 'Beginning';
  let curParas: string[] = [];
  let curWords = 0;
  let pageCounter = 1;

  for (const el of elements) {
    const tag = el.tagName.toLowerCase();
    const text = el.textContent?.trim() || '';
    if (!text) continue;

    if (tag === 'h1' || tag === 'h2' || tag === 'h3') {
      if (curParas.length > 0) {
        sections.push({ pageNum: pageCounter++, title: curTitle, paragraphs: curParas });
        curParas = [];
        curWords = 0;
      }
      curTitle = text;
    } else {
      const words = text.split(/\s+/).length;
      if (curWords + words > 400 && curParas.length > 0) {
        sections.push({ pageNum: pageCounter++, title: curTitle, paragraphs: curParas });
        curParas = [];
        curWords = 0;
      }
      curParas.push(text);
      curWords += words;
    }
  }

  if (curParas.length > 0) {
    sections.push({ pageNum: pageCounter++, title: curTitle, paragraphs: curParas });
  }

  await renderGenericDocumentToReader(fileName, sections.length > 0 ? sections : [{ pageNum: 1, title: fileName, paragraphs: ['No text found in Word document.'] }]);
}
