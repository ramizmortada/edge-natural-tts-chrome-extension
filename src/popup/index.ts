import { createElement, Check, ChevronDown, Minus, Plus } from 'lucide';

interface VoiceOption {
  id: string;
  name: string;
  gender: 'Female' | 'Male';
  region: string;
}

const VOICES: VoiceOption[] = [
  { id: 'en-US-AriaNeural', name: 'Aria', gender: 'Female', region: 'US' },
  { id: 'en-US-GuyNeural', name: 'Guy', gender: 'Male', region: 'US' },
  { id: 'en-GB-SoniaNeural', name: 'Sonia', gender: 'Female', region: 'UK' },
  { id: 'en-GB-RyanNeural', name: 'Ryan', gender: 'Male', region: 'UK' },
  { id: 'en-AU-NatashaNeural', name: 'Natasha', gender: 'Female', region: 'AU' },
  { id: 'en-AU-WilliamNeural', name: 'William', gender: 'Male', region: 'AU' },
  { id: 'kokoro:af_heart', name: 'Kokoro Heart', gender: 'Female', region: 'Local AI' },
  { id: 'kokoro:am_adam', name: 'Kokoro Adam', gender: 'Male', region: 'Local AI' },
  { id: 'kokoro:bf_emma', name: 'Kokoro Emma', gender: 'Female', region: 'Local AI' },
];

interface SpeedPreset {
  rate: number;
  label: string;
}

const SPEED_PRESETS: SpeedPreset[] = [
  { rate: -50, label: '0.5x' },
  { rate: -25, label: '0.75x' },
  { rate: 0, label: '1.0x (Normal)' },
  { rate: 25, label: '1.25x' },
  { rate: 50, label: '1.5x' },
  { rate: 75, label: '1.75x' },
  { rate: 100, label: '2.0x' },
];

document.addEventListener('DOMContentLoaded', () => {
  // Voice DOM elements
  const voiceDropdownContainer = document.getElementById('voice-dropdown-container');
  const voiceSelectBtn = document.getElementById('voice-select-btn') as HTMLButtonElement | null;
  const selectedVoiceName = document.getElementById('selected-voice-name');
  const selectedVoiceRegion = document.getElementById('selected-voice-region');
  const voiceMenu = document.getElementById('voice-menu');
  const voiceOptionsList = document.getElementById('voice-options-list');

  // Speed DOM elements
  const speedClusterContainer = document.getElementById('speed-cluster-container');
  const speedMinusBtn = document.getElementById('speed-minus-btn') as HTMLButtonElement | null;
  const speedPlusBtn = document.getElementById('speed-plus-btn') as HTMLButtonElement | null;
  const speedDropdownBtn = document.getElementById('speed-dropdown-btn') as HTMLButtonElement | null;
  const speedLabel = document.getElementById('speed-label');
  const speedMenu = document.getElementById('speed-menu');
  const speedOptionsList = document.getElementById('speed-options-list');

  const toggleSiteBtn = document.getElementById('toggle-site-btn') as HTMLButtonElement;

  // Replace static popup icons with official Lucide SVGs
  const voiceChevron = document.getElementById('voice-chevron');
  if (voiceChevron) {
    voiceChevron.replaceWith(createElement(ChevronDown, { id: 'voice-chevron', class: 'dropdown-chevron', width: 12, height: 12 }));
  }
  const speedChevron = document.getElementById('speed-chevron');
  if (speedChevron) {
    speedChevron.replaceWith(createElement(ChevronDown, { id: 'speed-chevron', class: 'dropdown-chevron', width: 10, height: 10 }));
  }
  if (speedMinusBtn) {
    speedMinusBtn.innerHTML = createElement(Minus, { width: 13, height: 13 }).outerHTML;
  }
  if (speedPlusBtn) {
    speedPlusBtn.innerHTML = createElement(Plus, { width: 13, height: 13 }).outerHTML;
  }

  let currentVoice = 'en-US-AriaNeural';
  let currentRate = 0;

  function formatSpeed(ratePercent: number): string {
    const mult = 1 + ratePercent / 100;
    const rounded = Math.round(mult * 100) / 100;
    const str = (Math.abs(rounded * 10 - Math.round(rounded * 10)) < 0.001) ? rounded.toFixed(1) : rounded.toFixed(2);
    return `${str}x`;
  }

  const checkIconSvg = createElement(Check, { width: 13, height: 13, 'stroke-width': 2.5, color: '#10b981', style: 'flex-shrink:0;' }).outerHTML;

  function renderVoiceUI() {
    const vObj = VOICES.find(v => v.id === currentVoice) || VOICES[0];
    if (selectedVoiceName) selectedVoiceName.textContent = vObj.name;
    if (selectedVoiceRegion) selectedVoiceRegion.textContent = vObj.region;

    if (!voiceOptionsList) return;
    voiceOptionsList.innerHTML = '';
    VOICES.forEach(v => {
      const isSelected = v.id === currentVoice;
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = `dropdown-item ${isSelected ? 'selected' : ''}`;
      btn.innerHTML = `
        <div class="voice-item-left">
          <span class="voice-region-badge">${v.region}</span>
          <div class="voice-item-info">
            <span class="voice-item-title">${v.name}</span>
            <span class="voice-item-sub">${v.gender} &bull; ${v.region}</span>
          </div>
        </div>
        ${isSelected ? checkIconSvg : ''}
      `;
      btn.addEventListener('click', () => {
        currentVoice = v.id;
        renderVoiceUI();
        closeVoiceMenu();
        chrome.storage.local.set({ voice: v.id });
      });
      voiceOptionsList.appendChild(btn);
    });
  }

  function renderSpeedUI() {
    if (speedLabel) speedLabel.textContent = formatSpeed(currentRate);

    if (!speedOptionsList) return;
    speedOptionsList.innerHTML = '';
    SPEED_PRESETS.forEach(p => {
      const isSelected = p.rate === currentRate;
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = `dropdown-item ${isSelected ? 'selected' : ''}`;
      btn.innerHTML = `
        <span style="font-family: monospace; font-variant-numeric: tabular-nums;">${p.label}</span>
        ${isSelected ? checkIconSvg : ''}
      `;
      btn.addEventListener('click', () => {
        setRate(p.rate);
        closeSpeedMenu();
      });
      speedOptionsList.appendChild(btn);
    });
  }

  function setRate(rateVal: number) {
    const clamped = Math.max(-50, Math.min(100, rateVal));
    currentRate = clamped;
    renderSpeedUI();
    chrome.storage.local.set({ rate: [currentRate] });
  }

  function stepSpeed(delta: number) {
    setRate(currentRate + delta);
  }

  function closeVoiceMenu() {
    if (voiceMenu) voiceMenu.style.display = 'none';
    if (voiceSelectBtn) voiceSelectBtn.classList.remove('open');
  }

  function closeSpeedMenu() {
    if (speedMenu) speedMenu.style.display = 'none';
    if (speedDropdownBtn) speedDropdownBtn.classList.remove('open');
  }

  if (voiceSelectBtn && voiceMenu) {
    voiceSelectBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      const isOpen = voiceMenu.style.display === 'flex';
      if (isOpen) {
        closeVoiceMenu();
      } else {
        closeSpeedMenu();
        voiceMenu.style.display = 'flex';
        voiceSelectBtn.classList.add('open');
      }
    });
  }

  if (speedDropdownBtn && speedMenu) {
    speedDropdownBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      const isOpen = speedMenu.style.display === 'flex';
      if (isOpen) {
        closeSpeedMenu();
      } else {
        closeVoiceMenu();
        speedMenu.style.display = 'flex';
        speedDropdownBtn.classList.add('open');
      }
    });
  }

  if (speedMinusBtn) {
    speedMinusBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      stepSpeed(-5);
    });
  }

  if (speedPlusBtn) {
    speedPlusBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      stepSpeed(5);
    });
  }

  // Close menus on outside click
  document.addEventListener('click', (e) => {
    const target = e.target as Node;
    if (voiceDropdownContainer && !voiceDropdownContainer.contains(target)) {
      closeVoiceMenu();
    }
    if (speedClusterContainer && !speedClusterContainer.contains(target)) {
      closeSpeedMenu();
    }
  });

  let currentDomain = '';
  let ignoredSites: string[] = [];
  let isIgnored = false;

  function updateButtonState() {
    if (!currentDomain) {
      toggleSiteBtn.textContent = 'Cannot detect site';
      toggleSiteBtn.disabled = true;
      toggleSiteBtn.style.opacity = '0.5';
      return;
    }
    
    toggleSiteBtn.disabled = false;
    toggleSiteBtn.style.opacity = '1';
    
    if (isIgnored) {
      toggleSiteBtn.textContent = `Enable on ${currentDomain}`;
      toggleSiteBtn.style.background = '#10b981';
      toggleSiteBtn.style.color = '#fff';
      toggleSiteBtn.style.border = '1px solid #10b981';
    } else {
      toggleSiteBtn.textContent = `Disable on ${currentDomain}`;
      toggleSiteBtn.style.background = '';
      toggleSiteBtn.style.color = '';
      toggleSiteBtn.style.border = '';
    }
  }

  function applyTheme(theme?: string) {
    const isLight = theme === 'light' || (!theme && window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches);
    const logoEl = document.getElementById('app-logo') as HTMLImageElement | null;
    const faviconEl = document.getElementById('popup-favicon') as HTMLLinkElement | null;
    if (logoEl) logoEl.src = 'logo.png';
    if (faviconEl) faviconEl.href = 'logo.png';
    if (isLight) {
      document.body.classList.add('light-theme');
    } else {
      document.body.classList.remove('light-theme');
    }
  }

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local') {
      if (changes.pdfTheme) {
        applyTheme(changes.pdfTheme.newValue);
      }
      if (changes.voice && changes.voice.newValue !== currentVoice) {
        currentVoice = String(changes.voice.newValue);
        renderVoiceUI();
      }
      if (changes.rate && Array.isArray(changes.rate.newValue)) {
        currentRate = changes.rate.newValue[0];
        renderSpeedUI();
      }
    }
  });

  let activePdfUrl = '';
  let activePdfName = '';

  const openPdfBtn = document.getElementById('open-pdf-btn') as HTMLButtonElement | null;

  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (tabs[0] && tabs[0].url) {
      const tabUrl = tabs[0].url;
      try {
        const url = new URL(tabUrl);
        if (url.protocol.startsWith('http')) {
          currentDomain = url.hostname;
        }

        // Check for PDF file (local file:/// or web PDF)
        const pathname = url.pathname.toLowerCase();
        if (pathname.endsWith('.pdf') || tabUrl.toLowerCase().endsWith('.pdf') || pathname.includes('.pdf')) {
          activePdfUrl = tabUrl;
          const segments = url.pathname.split('/').filter(Boolean);
          const rawName = segments[segments.length - 1] || 'Document.pdf';
          try {
            activePdfName = decodeURIComponent(rawName);
          } catch (e) {
            activePdfName = rawName;
          }
        }
      } catch (e) {
        if (tabUrl.toLowerCase().endsWith('.pdf')) {
          activePdfUrl = tabUrl;
          activePdfName = 'Document.pdf';
        }
      }
    }

    if (activePdfUrl && openPdfBtn) {
      const btnSpan = openPdfBtn.querySelector('span');
      if (btnSpan) {
        btnSpan.textContent = 'Open in PDF Reader';
      }
      openPdfBtn.title = `Import and open "${activePdfName}" in ReadFlow`;
    }

    chrome.storage.local.get(["voice", "rate", "ignoredSites", "pdfTheme"], (result: Record<string, any>) => {
      if (result.voice) {
        currentVoice = String(result.voice);
      }
      if (result.rate && Array.isArray(result.rate)) {
        currentRate = result.rate[0];
      }
      renderVoiceUI();
      renderSpeedUI();

      if (result.ignoredSites && Array.isArray(result.ignoredSites)) {
        ignoredSites = result.ignoredSites as string[];
      }
      
      if (currentDomain) {
        isIgnored = ignoredSites.includes(currentDomain);
      }
      updateButtonState();
      applyTheme(result.pdfTheme);
    });
  });

  toggleSiteBtn.addEventListener('click', () => {
    if (!currentDomain) return;
    
    if (isIgnored) {
      ignoredSites = ignoredSites.filter(site => site !== currentDomain);
      isIgnored = false;
    } else {
      if (!ignoredSites.includes(currentDomain)) {
        ignoredSites = [...ignoredSites, currentDomain];
      }
      isIgnored = true;
    }
    
    chrome.storage.local.set({ ignoredSites }, () => {
      updateButtonState();
    });
  });

  if (openPdfBtn) {
    openPdfBtn.addEventListener('click', () => {
      if (activePdfUrl) {
        const readerUrl = chrome.runtime.getURL(
          `pdf-reader.html?importUrl=${encodeURIComponent(activePdfUrl)}&name=${encodeURIComponent(activePdfName)}`
        );
        chrome.tabs.create({ url: readerUrl });
      } else {
        chrome.tabs.create({ url: chrome.runtime.getURL('pdf-reader.html') });
      }
    });
  }

  // --- Update Notification UI ---
  const currentManifestVersion = chrome.runtime.getManifest().version;
  const currentVersionLabel = document.getElementById('current-version-label');
  if (currentVersionLabel) {
    currentVersionLabel.textContent = `v${currentManifestVersion}`;
  }

  const updateBanner = document.getElementById('update-banner');
  const updateVersionBadge = document.getElementById('update-version-badge');
  const downloadUpdateLink = document.getElementById('download-update-link') as HTMLAnchorElement | null;
  const toggleGuideBtn = document.getElementById('toggle-update-guide-btn');
  const updateGuidePanel = document.getElementById('update-guide-panel');
  const updateGuideArrow = document.getElementById('update-guide-arrow');
  const dismissUpdateBtn = document.getElementById('dismiss-update-btn');
  const checkUpdatesBtn = document.getElementById('check-updates-btn') as HTMLButtonElement | null;

  let activeLatestVersion = '';

  function applyUpdateInfo(info: any, dismissedVersion?: string) {
    if (!updateBanner) return;

    if (info && info.hasUpdate && info.latestVersion && info.latestVersion !== dismissedVersion) {
      activeLatestVersion = info.latestVersion;
      if (updateVersionBadge) updateVersionBadge.textContent = `v${info.latestVersion}`;
      if (downloadUpdateLink && info.releaseUrl) downloadUpdateLink.href = info.releaseUrl;
      updateBanner.style.display = 'flex';
    } else {
      updateBanner.style.display = 'none';
    }
  }

  async function fetchUpdateDirectly(): Promise<any> {
    try {
      const currentVersion = chrome.runtime.getManifest().version;
      const res = await fetch('https://api.github.com/repos/ramizmortada/readflow/releases/latest', {
        headers: {
          'Accept': 'application/vnd.github.v3+json'
        }
      });

      if (!res.ok) {
        return null;
      }

      const data = await res.json();
      const latestTag = data.tag_name || '';
      const cleanRemote = latestTag.replace(/^v/, '').trim();
      const cleanCurrent = currentVersion.replace(/^v/, '').trim();

      const rParts = cleanRemote.split('.').map((n: string) => parseInt(n, 10) || 0);
      const cParts = cleanCurrent.split('.').map((n: string) => parseInt(n, 10) || 0);

      let hasUpdate = false;
      for (let i = 0; i < Math.max(rParts.length, cParts.length); i++) {
        const r = rParts[i] || 0;
        const c = cParts[i] || 0;
        if (r > c) { hasUpdate = true; break; }
        if (r < c) { hasUpdate = false; break; }
      }

      const updateInfo = {
        hasUpdate,
        latestVersion: cleanRemote,
        currentVersion,
        releaseUrl: data.html_url || 'https://github.com/ramizmortada/readflow/releases/latest',
        releaseNotes: data.body || '',
        checkedAt: Date.now()
      };

      await chrome.storage.local.set({
        lastUpdateCheck: Date.now(),
        updateInfo
      });

      if (hasUpdate) {
        chrome.action?.setBadgeText({ text: 'NEW' });
        chrome.action?.setBadgeBackgroundColor({ color: '#10b981' });
      }

      return updateInfo;
    } catch (e) {
      console.warn('ReadFlow: direct update check error:', e);
      return null;
    }
  }

  // Load cached or trigger gentle update check
  chrome.storage.local.get(["updateInfo", "dismissedVersion"], (data) => {
    applyUpdateInfo(data.updateInfo, data.dismissedVersion as string | undefined);
    // Gentle check: try background worker first, fallback to direct fetch
    chrome.runtime.sendMessage({ type: "CHECK_FOR_UPDATES", force: false }, async (res) => {
      if (chrome.runtime.lastError || !res) {
        const directRes = await fetchUpdateDirectly();
        if (directRes) {
          chrome.storage.local.get(["dismissedVersion"], (d) => {
            applyUpdateInfo(directRes, d.dismissedVersion as string | undefined);
          });
        }
        return;
      }
      chrome.storage.local.get(["dismissedVersion"], (d) => {
        applyUpdateInfo(res, d.dismissedVersion as string | undefined);
      });
    });
  });

  if (toggleGuideBtn && updateGuidePanel) {
    toggleGuideBtn.addEventListener('click', () => {
      const isHidden = updateGuidePanel.style.display === 'none' || !updateGuidePanel.style.display;
      updateGuidePanel.style.display = isHidden ? 'flex' : 'none';
      if (updateGuideArrow) {
        updateGuideArrow.style.transform = isHidden ? 'rotate(180deg)' : 'rotate(0deg)';
        updateGuideArrow.style.transition = 'transform 0.2s ease';
      }
    });
  }

  if (dismissUpdateBtn) {
    dismissUpdateBtn.addEventListener('click', () => {
      if (updateBanner) updateBanner.style.display = 'none';
      if (activeLatestVersion) {
        chrome.runtime.sendMessage({ type: "DISMISS_UPDATE", version: activeLatestVersion }, () => {
          chrome.action?.setBadgeText({ text: '' });
          chrome.storage.local.set({ dismissedVersion: activeLatestVersion });
        });
      }
    });
  }

  if (checkUpdatesBtn) {
    checkUpdatesBtn.addEventListener('click', () => {
      const originalText = checkUpdatesBtn.textContent || 'Check for updates';
      checkUpdatesBtn.textContent = 'Checking...';
      checkUpdatesBtn.disabled = true;

      function processResult(res: any) {
        if (!checkUpdatesBtn) return;
        checkUpdatesBtn.disabled = false;
        if (!res) {
          checkUpdatesBtn.textContent = 'Failed to check';
          setTimeout(() => { if (checkUpdatesBtn) checkUpdatesBtn.textContent = originalText; }, 2500);
          return;
        }

        if (res.hasUpdate) {
          applyUpdateInfo(res, undefined); // show even if previously dismissed
          checkUpdatesBtn.textContent = 'Update available!';
          setTimeout(() => { if (checkUpdatesBtn) checkUpdatesBtn.textContent = originalText; }, 3000);
        } else {
          checkUpdatesBtn.textContent = 'Up to date ✓';
          setTimeout(() => { if (checkUpdatesBtn) checkUpdatesBtn.textContent = originalText; }, 2500);
        }
      }

      chrome.runtime.sendMessage({ type: "CHECK_FOR_UPDATES", force: true }, async (res) => {
        if (chrome.runtime.lastError || !res) {
          // If background worker was asleep, not yet reloaded, or port closed, fallback directly
          const directRes = await fetchUpdateDirectly();
          processResult(directRes);
        } else {
          processResult(res);
        }
      });
    });
  }
});

