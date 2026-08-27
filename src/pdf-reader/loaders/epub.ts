/// <reference types="chrome" />
import JSZip from 'jszip';
import { showLoading } from '../ui';
import { renderGenericDocumentToReader } from './index';

export async function loadEpubFromBuffer(fileName: string, arrayBuffer: ArrayBuffer) {
  showLoading(`Unpacking EPUB book (${fileName})...`);
  const zip = await JSZip.loadAsync(arrayBuffer);

  let opfPath = 'OEBPS/content.opf';
  const containerFile = zip.file('META-INF/container.xml');
  if (containerFile) {
    const containerXml = await containerFile.async('text');
    const match = containerXml.match(/full-path="([^"]+)"/);
    if (match && match[1]) opfPath = match[1];
  }

  let opfFile = zip.file(opfPath);
  if (!opfFile) {
    const matchingFiles = zip.file(/\.opf$/i);
    if (matchingFiles.length > 0) {
      opfFile = matchingFiles[0];
    }
  }

  if (!opfFile) {
    throw new Error('Invalid EPUB file: content.opf not found.');
  }

  const opfDir = opfFile.name.includes('/') ? opfFile.name.substring(0, opfFile.name.lastIndexOf('/') + 1) : '';
  const opfXml = await opfFile.async('text');

  const parser = new DOMParser();
  const opfDoc = parser.parseFromString(opfXml, 'application/xml');

  const manifestItems = new Map<string, string>();
  const itemEls = Array.from(opfDoc.querySelectorAll('manifest > item'));
  for (const it of itemEls) {
    const id = it.getAttribute('id') || '';
    const href = it.getAttribute('href') || '';
    if (id && href) manifestItems.set(id, opfDir + href);
  }

  const itemRefs = Array.from(opfDoc.querySelectorAll('spine > itemref'));
  const chapterPaths: string[] = [];
  for (const ref of itemRefs) {
    const idref = ref.getAttribute('idref') || '';
    const path = manifestItems.get(idref);
    if (path) chapterPaths.push(path);
  }

  if (chapterPaths.length === 0) {
    for (const [, path] of manifestItems) {
      if (/\.(html|xhtml|htm)$/i.test(path)) chapterPaths.push(path);
    }
  }

  const sections: { pageNum: number; title: string; paragraphs: string[] }[] = [];
  let pageCounter = 1;

  for (const chPath of chapterPaths) {
    const chFile = zip.file(chPath) || zip.file(decodeURIComponent(chPath));
    if (!chFile) continue;

    const chContent = await chFile.async('text');
    const chDoc = parser.parseFromString(chContent, 'text/html');

    const titleEl = chDoc.querySelector('h1, h2, h3, title');
    const chTitle = titleEl?.textContent?.trim() || `Chapter ${pageCounter}`;

    const paragraphs: string[] = [];
    const pEls = Array.from(chDoc.querySelectorAll('p, blockquote, li, h1, h2, h3, h4'));
    for (const p of pEls) {
      const t = p.textContent?.trim();
      if (t && t.length > 0) paragraphs.push(t);
    }

    if (paragraphs.length > 0) {
      sections.push({
        pageNum: pageCounter++,
        title: chTitle,
        paragraphs
      });
    }
  }

  await renderGenericDocumentToReader(fileName, sections.length > 0 ? sections : [{ pageNum: 1, title: fileName, paragraphs: ['No chapters found in EPUB.'] }]);
}
