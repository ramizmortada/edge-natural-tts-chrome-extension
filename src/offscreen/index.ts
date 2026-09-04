/// <reference types="chrome" />

function base64ToUint8Array(base64: string): Uint8Array {
  const binaryString = atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

let audioRef: HTMLAudioElement | null = null;
let mediaSource: MediaSource | null = null;
let sourceBuffer: SourceBuffer | null = null;
let queue: Uint8Array[] = [];
let isFirstAppend = true;
let isPausedState = false;
let isStopped = true;
let timeUpdateInterval: any = null;
let currentPlaybackRate = 1.0;

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.target !== "offscreen") return;

  switch (msg.type) {
    case "INIT_AUDIO":
      if (audioRef) {
        audioRef.pause();
        audioRef.removeAttribute("src");
        audioRef.load();
      }
      
      queue = [];
      isFirstAppend = true;
      isPausedState = false;
      isStopped = false;
      sourceBuffer = null;
      currentPlaybackRate = 1.0;
      audioRef = new Audio();
      audioRef.playbackRate = currentPlaybackRate;
      mediaSource = new MediaSource();
      audioRef.src = URL.createObjectURL(mediaSource);
      
      mediaSource.addEventListener("sourceopen", () => {
        if (!mediaSource || isStopped) return;
        try {
          sourceBuffer = mediaSource.addSourceBuffer('audio/mpeg');
          
          sourceBuffer.addEventListener("updateend", () => {
            if (isStopped) return;
            if (isFirstAppend) {
              isFirstAppend = false;
              if (!isPausedState && !isStopped) {
                audioRef?.play().catch(e => {
                  console.error("Offscreen play failed:", e);
                  chrome.runtime.sendMessage({ type: "PLAYBACK_ERROR", error: e.message || String(e) }).catch(()=>{});
                });
              }
            }
            if (queue.length > 0 && !sourceBuffer?.updating && !isStopped) {
              sourceBuffer?.appendBuffer(queue.shift()! as unknown as BufferSource);
            }
          });
          
          if (queue.length > 0 && !sourceBuffer.updating && !isStopped) {
            sourceBuffer.appendBuffer(queue.shift()! as unknown as BufferSource);
          }
        } catch (err) {
          console.warn("SourceBuffer error:", err);
        }
      });
      
      audioRef.onended = () => {
        if (!isStopped) {
          chrome.runtime.sendMessage({ type: "PLAYBACK_ENDED" }).catch(()=>{});
        }
      };
      
      if (timeUpdateInterval) clearInterval(timeUpdateInterval);
      timeUpdateInterval = setInterval(() => {
        if (audioRef && !audioRef.paused && !isStopped) {
          chrome.runtime.sendMessage({ type: "TIME_UPDATE", currentTime: audioRef.currentTime }).catch(()=>{});
        }
      }, 50);
      break;

    case "APPEND_AUDIO":
      if (isStopped) return;
      const chunkData = base64ToUint8Array(msg.data);
      if (sourceBuffer && !sourceBuffer.updating) {
        try {
          sourceBuffer.appendBuffer(chunkData as unknown as BufferSource);
        } catch (_) {
          queue.push(chunkData);
        }
      } else {
        queue.push(chunkData);
      }
      break;

    case "APPEND_AUDIO_ARRAY":
      if (isStopped) return;
      for (const b64 of msg.data) {
        queue.push(base64ToUint8Array(b64));
      }
      if (sourceBuffer && !sourceBuffer.updating && queue.length > 0) {
        try {
          sourceBuffer.appendBuffer(queue.shift()! as unknown as BufferSource);
        } catch (_) {}
      }
      break;

    case "PLAY_AUDIO_WAV_CHUNKS":
    case "PLAY_AUDIO_WAV":
      if (audioRef) {
        audioRef.pause();
        audioRef.removeAttribute("src");
        audioRef.load();
      }

      queue = [];
      isFirstAppend = false;
      isPausedState = false;
      isStopped = false;
      sourceBuffer = null;
      mediaSource = null;

      audioRef = new Audio();
      audioRef.playbackRate = currentPlaybackRate;
      let byteChunks: Uint8Array[] = [];
      if (Array.isArray(msg.data)) {
        byteChunks = msg.data.map((b64: string) => base64ToUint8Array(b64));
      } else if (msg.data) {
        byteChunks = [base64ToUint8Array(msg.data)];
      }
      const wavBlob = new Blob(byteChunks as unknown as BlobPart[], { type: "audio/wav" });
      audioRef.src = URL.createObjectURL(wavBlob);

      audioRef.onended = () => {
        if (!isStopped) {
          chrome.runtime.sendMessage({ type: "PLAYBACK_ENDED" }).catch(()=>{});
        }
      };

      if (timeUpdateInterval) clearInterval(timeUpdateInterval);
      timeUpdateInterval = setInterval(() => {
        if (audioRef && !audioRef.paused && !isStopped) {
          chrome.runtime.sendMessage({ type: "TIME_UPDATE", currentTime: audioRef.currentTime }).catch(()=>{});
        }
      }, 50);

      audioRef.play().catch(e => {
        console.error("Offscreen WAV play failed:", e);
        chrome.runtime.sendMessage({ type: "PLAYBACK_ERROR", error: e.message || String(e) }).catch(()=>{});
      });
      break;

    case "END_STREAM":
      if (!mediaSource || isStopped) break;
      function tryEnd() {
        if (!mediaSource || isStopped) return;
        if (mediaSource.readyState === 'open') {
          if (sourceBuffer && sourceBuffer.updating) {
            sourceBuffer.addEventListener('updateend', tryEnd, { once: true });
          } else if (queue.length > 0) {
            if (sourceBuffer) {
              sourceBuffer.addEventListener('updateend', tryEnd, { once: true });
            } else {
              setTimeout(tryEnd, 50);
            }
          } else {
            try { mediaSource.endOfStream(); } catch(e) {}
          }
        } else if (mediaSource.readyState === 'closed') {
          mediaSource.addEventListener('sourceopen', tryEnd, { once: true });
        }
      }
      tryEnd();
      break;

    case "PLAY":
      isPausedState = false;
      isStopped = false;
      audioRef?.play().catch(e => console.error(e));
      break;

    case "PAUSE":
      isPausedState = true;
      audioRef?.pause();
      break;

    case "SEEK":
      if (audioRef && msg.offset !== undefined) {
        audioRef.currentTime = msg.offset;
      }
      break;

    case "SET_PLAYBACK_RATE":
      if (typeof msg.rate === "number" && msg.rate > 0) {
        currentPlaybackRate = msg.rate;
        if (audioRef) {
          audioRef.playbackRate = currentPlaybackRate;
        }
      }
      break;

    case "STOP":
      isStopped = true;
      isPausedState = false;
      currentPlaybackRate = 1.0;
      queue = [];
      if (audioRef) {
        audioRef.pause();
        audioRef.removeAttribute("src");
        audioRef.load();
        audioRef = null;
      }
      if (timeUpdateInterval) clearInterval(timeUpdateInterval);
      break;
  }
});
