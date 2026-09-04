document.addEventListener('DOMContentLoaded', () => {
  const voiceSelect = document.getElementById('voice-select') as HTMLSelectElement;
  const rateSlider = document.getElementById('rate-slider') as HTMLInputElement;
  const speedLabel = document.getElementById('speed-label') as HTMLSpanElement;
  const toggleSiteBtn = document.getElementById('toggle-site-btn') as HTMLButtonElement;

  function updateSpeedLabel(val: number) {
    speedLabel.textContent = val >= 0 ? `+${val}%` : `${val}%`;
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
      toggleSiteBtn.style.background = '#3b82f6';
      toggleSiteBtn.style.color = '#fff';
      toggleSiteBtn.style.border = '1px solid #3b82f6';
    } else {
      toggleSiteBtn.textContent = `Disable on ${currentDomain}`;
      toggleSiteBtn.style.background = '#f8fafc';
      toggleSiteBtn.style.color = '#0f172a';
      toggleSiteBtn.style.border = '1px solid #e2e8f0';
    }
  }

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

    chrome.storage.local.get(["voice", "rate", "ignoredSites"], (result: Record<string, any>) => {
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

  // Load cached or trigger gentle update check
  chrome.storage.local.get(["updateInfo", "dismissedVersion"], (data) => {
    applyUpdateInfo(data.updateInfo, data.dismissedVersion);
    // Background gentle check
    chrome.runtime.sendMessage({ type: "CHECK_FOR_UPDATES", force: false }, (res) => {
      if (chrome.runtime.lastError) return;
      if (res) {
        chrome.storage.local.get(["dismissedVersion"], (d) => {
          applyUpdateInfo(res, d.dismissedVersion);
        });
      }
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
        chrome.runtime.sendMessage({ type: "DISMISS_UPDATE", version: activeLatestVersion });
      }
    });
  }

  if (checkUpdatesBtn) {
    checkUpdatesBtn.addEventListener('click', () => {
      const originalText = checkUpdatesBtn.textContent || 'Check for updates';
      checkUpdatesBtn.textContent = 'Checking...';
      checkUpdatesBtn.disabled = true;

      chrome.runtime.sendMessage({ type: "CHECK_FOR_UPDATES", force: true }, (res) => {
        checkUpdatesBtn.disabled = false;
        if (chrome.runtime.lastError || !res) {
          checkUpdatesBtn.textContent = 'Failed to check';
          setTimeout(() => { checkUpdatesBtn.textContent = originalText; }, 2500);
          return;
        }

        if (res.hasUpdate) {
          applyUpdateInfo(res, undefined); // show even if previously dismissed
          checkUpdatesBtn.textContent = 'Update available!';
          setTimeout(() => { checkUpdatesBtn.textContent = originalText; }, 3000);
        } else {
          checkUpdatesBtn.textContent = 'Up to date ✓';
          setTimeout(() => { checkUpdatesBtn.textContent = originalText; }, 2500);
        }
      });
    });
  }
});

