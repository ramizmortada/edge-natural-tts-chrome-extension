document.addEventListener('DOMContentLoaded', () => {
  const voiceSelect = document.getElementById('voice-select') as HTMLSelectElement;
  const rateSlider = document.getElementById('rate-slider') as HTMLInputElement;
  const speedLabel = document.getElementById('speed-label') as HTMLSpanElement;
  const toggleSiteBtn = document.getElementById('toggle-site-btn') as HTMLButtonElement;

  function formatSpeed(ratePercent: number): string {
    const mult = 1 + ratePercent / 100;
    const rounded = Math.round(mult * 100) / 100;
    const str = (Math.abs(rounded * 10 - Math.round(rounded * 10)) < 0.001) ? rounded.toFixed(1) : rounded.toFixed(2);
    return `${str}x`;
  }

  function updateSpeedLabel(val: number) {
    speedLabel.textContent = formatSpeed(val);
  }

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
      toggleSiteBtn.style.background = '#f8fafc';
      toggleSiteBtn.style.color = '#0f172a';
      toggleSiteBtn.style.border = '1px solid #e2e8f0';
    }
  }

  function applyTheme(theme?: string) {
    const isLight = theme === 'light' || theme === 'sepia' || (!theme && window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches);
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
    if (area === 'local' && changes.pdfTheme) {
      applyTheme(changes.pdfTheme.newValue);
    }
  });

  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (tabs[0] && tabs[0].url) {
      try {
        const url = new URL(tabs[0].url);
        if (url.protocol.startsWith('http')) {
          currentDomain = url.hostname;
        }
      } catch (e) {
        // Invalid URL
      }
    }

    chrome.storage.local.get(["voice", "rate", "ignoredSites", "pdfTheme"], (result: Record<string, any>) => {
      if (result.voice) {
        voiceSelect.value = String(result.voice);
      }
      if (result.rate && Array.isArray(result.rate)) {
        const val = result.rate[0];
        rateSlider.value = val.toString();
        updateSpeedLabel(val);
      }
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

  voiceSelect.addEventListener('change', () => {
    chrome.storage.local.set({ voice: voiceSelect.value });
  });

  rateSlider.addEventListener('input', () => {
    const val = parseInt(rateSlider.value, 10);
    updateSpeedLabel(val);
    chrome.storage.local.set({ rate: [val] });
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

  const openPdfBtn = document.getElementById('open-pdf-btn') as HTMLButtonElement | null;
  if (openPdfBtn) {
    openPdfBtn.addEventListener('click', () => {
      chrome.tabs.create({ url: chrome.runtime.getURL('pdf-reader.html') });
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
        chrome.action?.setBadgeBackgroundColor({ color: '#2563eb' });
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

