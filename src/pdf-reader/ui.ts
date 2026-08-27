/// <reference types="chrome" />
import { dom } from './dom';
import { state } from './state';
import { readerDB } from './db';
import { loadStoredDocument } from './loaders';

export function showLoading(text: string) {
  if (dom.loadingText) dom.loadingText.textContent = text;
  if (dom.loadingIndicator) dom.loadingIndicator.style.display = 'flex';
}

export function hideLoading() {
  if (dom.loadingIndicator) dom.loadingIndicator.style.display = 'none';
}

export function updateSpeedLabel(val: number) {
  if (dom.speedLabel) dom.speedLabel.textContent = val >= 0 ? `+${val}%` : `${val}%`;
}

export function setViewMode(mode: 'reader' | 'pdf') {
  state.currentViewMode = mode;
  if (mode === 'reader') {
    if (dom.modeReaderBtn) dom.modeReaderBtn.classList.add('active');
    if (dom.modePdfBtn) dom.modePdfBtn.classList.remove('active');
    if (dom.readerModeView) dom.readerModeView.style.display = 'flex';
    if (dom.pdfViewer) dom.pdfViewer.style.display = 'none';
    if (dom.pdfCanvasControls) dom.pdfCanvasControls.style.display = 'none';
  } else {
    if (dom.modePdfBtn) dom.modePdfBtn.classList.add('active');
    if (dom.modeReaderBtn) dom.modeReaderBtn.classList.remove('active');
    if (dom.pdfViewer) dom.pdfViewer.style.display = 'flex';
    if (dom.pdfCanvasControls) dom.pdfCanvasControls.style.display = 'flex';
    if (dom.readerModeView) dom.readerModeView.style.display = 'none';
  }
}

export function updateReaderTypography() {
  if (dom.readerContent) {
    dom.readerContent.style.fontSize = `${state.currentFontSize}px`;
    dom.readerContent.className = `reader-content font-${state.currentFontFamily}`;
  }
  document.body.className = `theme-${state.currentTheme}`;
  if (dom.fontSizePreview) {
    dom.fontSizePreview.textContent = `${state.currentFontSize}px`;
  }

  document.querySelectorAll('.theme-option-btn').forEach(btn => {
    const btnTheme = (btn as HTMLElement).dataset.theme;
    btn.classList.toggle('active', btnTheme === state.currentTheme);
  });
}

export function toggleSidebar(open?: boolean) {
  state.isSidebarOpen = open !== undefined ? open : !state.isSidebarOpen;
  if (state.isSidebarOpen) {
    if (dom.readerSidebar) dom.readerSidebar.classList.remove('collapsed');
    if (dom.sidebarToggleBtn) dom.sidebarToggleBtn.classList.add('active');
  } else {
    if (dom.readerSidebar) dom.readerSidebar.classList.add('collapsed');
    if (dom.sidebarToggleBtn) dom.sidebarToggleBtn.classList.remove('active');
  }
}

export function highlightActiveSidebarPage(pageNum: number) {
  if (!dom.sidebarPageList) return;
  const prev = dom.sidebarPageList.querySelector('.sidebar-page-item.active');
  if (prev) prev.classList.remove('active');

  const cur = document.getElementById(`spi-${pageNum}`);
  if (cur) {
    cur.classList.add('active');
    cur.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }
}

export async function jumpToPage(num: number) {
  if (dom.pageNumInput) dom.pageNumInput.value = num.toString();
  highlightActiveSidebarPage(num);
  if (state.currentViewMode === 'reader') {
    const pageBlock = document.getElementById(`reader-page-block-${num}`);
    if (pageBlock) {
      pageBlock.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  } else {
    const pData = state.pagesData[num - 1];
    if (pData) {
      pData.wrapper.scrollIntoView({ behavior: 'smooth', block: 'start' });
      if (!pData.isRendered) {
        const { renderPage } = await import('./loaders/pdf');
        await renderPage(pData);
      }
    }
  }
}

export function applyScaleChange() {
  if (!state.pdfDoc) return;
  if (dom.zoomLevelSpan) dom.zoomLevelSpan.textContent = `${Math.round(state.currentScale * 100)}%`;
  for (const pData of state.pagesData) {
    pData.isRendered = false;
    if (pData.pageProxy) {
      const vp = pData.pageProxy.getViewport({ scale: state.currentScale });
      pData.wrapper.style.width = `${Math.floor(vp.width)}px`;
      pData.wrapper.style.height = `${Math.floor(vp.height)}px`;
    }
  }

  if (dom.pdfViewer) {
    const viewerRect = dom.pdfViewer.getBoundingClientRect();
    for (const pData of state.pagesData) {
      const rect = pData.wrapper.getBoundingClientRect();
      if (rect.bottom >= viewerRect.top - 300 && rect.top <= viewerRect.bottom + 300) {
        import('./loaders/pdf').then(m => m.renderPage(pData));
      }
    }
  }
}

export function closeAllPopovers() {
  if (dom.libraryMenu) dom.libraryMenu.style.display = 'none';
  if (dom.appearanceMenu) dom.appearanceMenu.style.display = 'none';
}

export async function renderRecentFilesUI() {
  const docs = await readerDB.getAllDocs();

  if (dom.recentFilesList) {
    dom.recentFilesList.innerHTML = '';
    if (docs.length === 0) {
      dom.recentFilesList.innerHTML = `<div class="recent-empty-hint">No recent documents</div>`;
    } else {
      docs.slice(0, 8).forEach(doc => {
        const item = document.createElement('div');
        item.className = 'recent-file-item';
        const formattedDate = new Date(doc.lastOpened).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
        const iconSymbol = doc.type === 'pdf' ? '📄' : (doc.type === 'docx' ? '📝' : (doc.type === 'epub' ? '📚' : '📄'));
        item.innerHTML = `
          <div class="recent-file-left" title="${escapeHtml(doc.name)}">
            <span class="recent-icon">${iconSymbol}</span>
            <div class="recent-meta">
              <span class="recent-name">${escapeHtml(doc.name)}</span>
              <span class="recent-sub">${(doc.size / 1024).toFixed(0)} KB • Page ${doc.lastPage || 1} • ${formattedDate}</span>
            </div>
          </div>
          <button class="recent-file-delete icon-btn" title="Remove from list">×</button>
        `;

        item.querySelector('.recent-file-left')?.addEventListener('click', () => {
          closeAllPopovers();
          loadStoredDocument(doc);
        });

        item.querySelector('.recent-file-delete')?.addEventListener('click', async (e) => {
          e.stopPropagation();
          await readerDB.deleteDoc(doc.id);
          renderRecentFilesUI();
        });

        dom.recentFilesList.appendChild(item);
      });
    }
  }

  if (dom.dropRecentSection && dom.dropRecentList) {
    if (docs.length === 0) {
      dom.dropRecentSection.style.display = 'none';
    } else {
      dom.dropRecentSection.style.display = 'block';
      dom.dropRecentList.innerHTML = '';
      docs.slice(0, 6).forEach(doc => {
        const card = document.createElement('div');
        card.className = 'recent-drop-card';
        const iconSymbol = doc.type === 'pdf' ? '📄' : (doc.type === 'docx' ? '📝' : (doc.type === 'epub' ? '📚' : '📄'));
        const timeAgo = formatTimeAgo(doc.lastOpened);

        card.innerHTML = `
          <span class="recent-card-icon">${iconSymbol}</span>
          <div class="recent-card-info">
            <div class="recent-card-name" title="${escapeHtml(doc.name)}">${escapeHtml(doc.name)}</div>
            <div class="recent-card-details">Page ${doc.lastPage || 1} • ${timeAgo}</div>
          </div>
        `;

        card.addEventListener('click', () => {
          loadStoredDocument(doc);
        });

        dom.dropRecentList.appendChild(card);
      });
    }
  }
}

export function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

export function formatTimeAgo(time: number): string {
  if (!time) return 'recently';
  const diff = Date.now() - time;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}
