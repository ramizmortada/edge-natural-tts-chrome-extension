/// <reference types="chrome" />

let creatingOffscreen: Promise<void> | null = null;

async function setupOffscreenDocument() {
  if (await chrome.offscreen.hasDocument()) return;
  if (creatingOffscreen) {
    await creatingOffscreen;
    return;
  }
  creatingOffscreen = chrome.offscreen.createDocument({
    url: "offscreen.html",
    reasons: [chrome.offscreen.Reason.AUDIO_PLAYBACK],
    justification: "To play text-to-speech audio streams."
  });
  await creatingOffscreen;
  creatingOffscreen = null;
}

let activeClientPort: chrome.runtime.Port | null = null;

// --- Update Checker ---
const GITHUB_REPO = "ramizmortada/readflow";
const CHECK_INTERVAL_MINUTES = 720; // 12 hours

function isNewerVersion(remote: string, current: string): boolean {
  const cleanRemote = remote.replace(/^v/, '').trim();
  const cleanCurrent = current.replace(/^v/, '').trim();

  const rParts = cleanRemote.split('.').map(n => parseInt(n, 10) || 0);
  const cParts = cleanCurrent.split('.').map(n => parseInt(n, 10) || 0);

  for (let i = 0; i < Math.max(rParts.length, cParts.length); i++) {
    const r = rParts[i] || 0;
    const c = cParts[i] || 0;
    if (r > c) return true;
    if (r < c) return false;
  }
  return false;
}

async function checkForUpdates(force = false): Promise<any> {
  try {
    const currentVersion = chrome.runtime.getManifest().version;
    const stored = await chrome.storage.local.get(["lastUpdateCheck", "updateInfo", "dismissedVersion"]);
    const now = Date.now();

    // Cooldown unless forced: 1 hour minimum
    if (!force && stored.lastUpdateCheck && (now - Number(stored.lastUpdateCheck) < 60 * 60 * 1000)) {
      if (stored.updateInfo) {
        return stored.updateInfo;
      }
    }

    const res = await fetch(`https://api.github.com/repos/${GITHUB_REPO}/releases/latest`, {
      headers: {
        'Accept': 'application/vnd.github.v3+json'
      }
    });

    if (!res.ok) {
      return stored.updateInfo || { hasUpdate: false, currentVersion };
    }

    const data = await res.json();
    const latestTag = data.tag_name || "";
    const hasUpdate = isNewerVersion(latestTag, currentVersion);
    const releaseUrl = data.html_url || `https://github.com/${GITHUB_REPO}/releases/latest`;
    const releaseNotes = data.body || "";

    const updateInfo = {
      hasUpdate,
      latestVersion: latestTag.replace(/^v/, ''),
      currentVersion,
      releaseUrl,
      releaseNotes,
      checkedAt: now
    };

    await chrome.storage.local.set({
      lastUpdateCheck: now,
      updateInfo
    });

    if (hasUpdate && stored.dismissedVersion !== updateInfo.latestVersion) {
      await chrome.action.setBadgeText({ text: "NEW" });
      await chrome.action.setBadgeBackgroundColor({ color: "#2563eb" });
    } else if (!hasUpdate) {
      await chrome.action.setBadgeText({ text: "" });
    }

    return updateInfo;
  } catch (err) {
    console.warn("ReadFlow: Update check failed:", err);
    return { hasUpdate: false };
  }
}

// Alarms & Startup update checks
chrome.alarms.create("CHECK_UPDATES_ALARM", { periodInMinutes: CHECK_INTERVAL_MINUTES });
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === "CHECK_UPDATES_ALARM") {
    checkForUpdates();
  }
});

chrome.runtime.onInstalled.addListener(() => {
  checkForUpdates();
});

chrome.runtime.onStartup.addListener(() => {
  checkForUpdates();
});

chrome.runtime.onMessage.addListener((msg: any, sender: chrome.runtime.MessageSender, sendResponse: (response?: any) => void) => {
  if (msg.type === "PLAYBACK_ENDED" || msg.type === "TIME_UPDATE") {
    if (activeClientPort) {
      try {
        activeClientPort.postMessage(msg);
      } catch (e) {
      }
    }
  } else if (msg.type === "CHECK_FOR_UPDATES") {
    checkForUpdates(!!msg.force)
      .then((res) => {
        sendResponse(res || { hasUpdate: false });
      })
      .catch((err) => {
        sendResponse({ hasUpdate: false, error: err?.message || String(err) });
      });
    return true;
  } else if (msg.type === "DISMISS_UPDATE") {
    chrome.storage.local.set({ dismissedVersion: msg.version }).then(() => {
      chrome.action.setBadgeText({ text: "" });
      sendResponse({ success: true });
    }).catch(() => {
      sendResponse({ success: false });
    });
    return true;
  }
});

interface PreloadedSession {
  text: string;
  audioChunks: string[];
  wordBoundaries: any[];
  isFinished: boolean;
  error: string | null;
  nativePort: chrome.runtime.Port | null;
  isActive: boolean;
}

const preloadCache = new Map<string, PreloadedSession>();

function cleanPreloadCache() {
  if (preloadCache.size > 10) {
    const firstKey = preloadCache.keys().next().value;
    if (firstKey) {
      const session = preloadCache.get(firstKey);
      if (session?.nativePort) session.nativePort.disconnect();
      preloadCache.delete(firstKey);
    }
  }
}

function startNativeSession(text: string, voice: string, rateString: string, force = false): PreloadedSession {
  if (preloadCache.has(text)) {
    const cached = preloadCache.get(text)!;
    if (force || cached.error || (cached.isFinished && cached.audioChunks.length === 0)) {
      if (cached.nativePort) {
        try { cached.nativePort.disconnect(); } catch (_) {}
        cached.nativePort = null;
      }
      preloadCache.delete(text); // Evict and retry if forced, errored, or empty
    } else {
      return cached;
    }
  }
  cleanPreloadCache();

  const session: PreloadedSession = {
    text, audioChunks: [], wordBoundaries: [], isFinished: false, error: null, nativePort: null, isActive: false
  };
  preloadCache.set(text, session);

  try {
    const nativePort = chrome.runtime.connectNative("com.edgetts.host");
    session.nativePort = nativePort;

    nativePort.onDisconnect.addListener(() => {
      if (!session.isFinished) {
         session.error = chrome.runtime.lastError ? chrome.runtime.lastError.message! : "Native host disconnected unexpectedly.";
         preloadCache.delete(text);
         if (session.isActive && activeClientPort) {
           activeClientPort.postMessage({ type: "error", error: session.error, text });
         }
      }
    });

    nativePort.onMessage.addListener((nativeMsg: any) => {
      if (nativeMsg.type === "audio") {
        session.audioChunks.push(nativeMsg.data);
        if (session.isActive) {
          chrome.runtime.sendMessage({ target: "offscreen", type: "APPEND_AUDIO", data: nativeMsg.data }).catch(()=>{});
        }
      } else if (nativeMsg.type === "WordBoundary") {
        const wb = { type: "WordBoundary", offset: nativeMsg.offset, duration: nativeMsg.duration, textObj: nativeMsg.textObj };
        session.wordBoundaries.push(wb);
        if (session.isActive && activeClientPort) {
          activeClientPort.postMessage(wb);
        }
      } else if (nativeMsg.type === "end") {
        session.isFinished = true;
        session.nativePort?.disconnect();
        session.nativePort = null;
        if (session.isActive) {
          if (activeClientPort) activeClientPort.postMessage({ type: "end" });
          chrome.runtime.sendMessage({ target: "offscreen", type: "END_STREAM" }).catch(()=>{});
        }
      } else if (nativeMsg.type === "error") {
        session.error = nativeMsg.error;
        preloadCache.delete(text);
        session.nativePort?.disconnect();
        session.nativePort = null;
        if (session.isActive) {
          if (activeClientPort) activeClientPort.postMessage({ type: "error", error: session.error, text });
          chrome.runtime.sendMessage({ target: "offscreen", type: "STOP" }).catch(()=>{});
        }
      }
    });

    nativePort.postMessage({ type: "START", text, voice, rateString });
  } catch (e: any) {
    session.error = e.message || e.toString();
    preloadCache.delete(text);
  }

  return session;
}

const preloadQueue: {text: string, voice: string, rateString: string}[] = [];
let isPreloading = false;

async function processPreloadQueue() {
  if (isPreloading) return;
  isPreloading = true;
  while (preloadQueue.length > 0) {
    const item = preloadQueue.shift()!;
    if (preloadCache.has(item.text)) {
      const existing = preloadCache.get(item.text)!;
      if (!existing.error && (existing.isFinished || existing.nativePort)) {
        continue;
      }
    }

    const session = startNativeSession(item.text, item.voice, item.rateString);
    if (!session.isFinished && !session.error) {
      await new Promise<void>((resolve) => {
        const startTime = Date.now();
        const check = setInterval(() => {
          if (session.isFinished || session.error || (Date.now() - startTime > 15000)) {
            clearInterval(check);
            resolve();
          }
        }, 100);
      });
    }
  }
  isPreloading = false;
}

chrome.runtime.onConnect.addListener((port: chrome.runtime.Port) => {
  if (port.name !== "tts-stream") return;

  let isSessionPort = false;

  port.onDisconnect.addListener(() => {
    if (activeClientPort === port) {
      activeClientPort = null;
    }
    if (isSessionPort) {
      preloadQueue.length = 0;
      for (const s of preloadCache.values()) {
        s.isActive = false;
        if (s.nativePort) {
          try { s.nativePort.disconnect(); } catch (_) {}
          s.nativePort = null;
        }
      }
      chrome.runtime.sendMessage({ target: "offscreen", type: "STOP" }).catch(()=>{});
    }
  });

  port.onMessage.addListener(async (msg: any) => {
    if (msg.type === "PRELOAD") {
      preloadQueue.push({ text: msg.text, voice: msg.voice, rateString: msg.rateString });
      processPreloadQueue();
    } else if (msg.type === "CLEAR_PRELOAD") {
      if (Array.isArray(msg.texts)) {
        for (let i = preloadQueue.length - 1; i >= 0; i--) {
          if (msg.texts.includes(preloadQueue[i].text)) {
            preloadQueue.splice(i, 1);
          }
        }
        for (const t of msg.texts) {
          const s = preloadCache.get(t);
          if (s?.nativePort) {
            try { s.nativePort.disconnect(); } catch (_) {}
          }
          preloadCache.delete(t);
        }
      } else {
        preloadQueue.length = 0;
        for (const s of preloadCache.values()) {
          if (s?.nativePort) {
            try { s.nativePort.disconnect(); } catch (_) {}
          }
        }
        preloadCache.clear();
      }
    } else if (msg.type === "START") {
      isSessionPort = true;
      activeClientPort = port;

      // Drain old queued preloads so upcoming sentences are preloaded immediately
      preloadQueue.length = 0;

      try {
        await setupOffscreenDocument();
        chrome.runtime.sendMessage({ target: "offscreen", type: "INIT_AUDIO" }).catch(()=>{});

        // Deactivate all current sessions
        for (const s of preloadCache.values()) {
          s.isActive = false;
        }

        const session = startNativeSession(msg.text, msg.voice, msg.rateString, !!msg.force);
        session.isActive = true;

        if (session.error) {
          preloadCache.delete(msg.text);
          port.postMessage({ type: "error", error: session.error, text: msg.text });
          return;
        }

        // Catch up offscreen with already downloaded chunks
        if (session.audioChunks.length > 0) {
          chrome.runtime.sendMessage({ target: "offscreen", type: "APPEND_AUDIO_ARRAY", data: session.audioChunks }).catch(()=>{});
        }
        if (session.wordBoundaries.length > 0) {
          port.postMessage({ type: "WordBoundaryArray", data: session.wordBoundaries });
        }

        if (session.isFinished) {
          if (session.audioChunks.length === 0) {
            preloadCache.delete(msg.text);
            port.postMessage({ type: "error", error: "Empty audio generated. Please retry.", text: msg.text });
            return;
          }
          port.postMessage({ type: "end" });
          chrome.runtime.sendMessage({ target: "offscreen", type: "END_STREAM" }).catch(()=>{});
        }

      } catch (error: any) {
        preloadCache.delete(msg.text);
        port.postMessage({ type: "error", error: error.message || error.toString(), text: msg.text });
      }
    } else if (msg.type === "PLAY") {
      chrome.runtime.sendMessage({ target: "offscreen", type: "PLAY" }).catch(()=>{});
    } else if (msg.type === "PAUSE") {
      chrome.runtime.sendMessage({ target: "offscreen", type: "PAUSE" }).catch(()=>{});
    } else if (msg.type === "STOP") {
      for (const s of preloadCache.values()) {
        s.isActive = false;
        if (s.nativePort) {
          try { s.nativePort.disconnect(); } catch (_) {}
          s.nativePort = null;
        }
      }
      chrome.runtime.sendMessage({ target: "offscreen", type: "STOP" }).catch(()=>{});
    } else if (msg.type === "SEEK") {
      chrome.runtime.sendMessage({ target: "offscreen", type: "SEEK", offset: msg.offset }).catch(()=>{});
    }
  });
});

// Ensure emerald action icon is set
try {
  chrome.action?.setIcon({
    path: {
      16: "icons/icon-16.png",
      32: "icons/icon-32.png",
      48: "icons/icon-48.png",
      128: "icons/icon-128.png"
    }
  });
} catch (_) {}

