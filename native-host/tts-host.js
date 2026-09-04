const { Communicate } = require('edge-tts-universal');

let kokoroTTS = null;
let kokoroLoading = null;

async function getKokoro() {
  if (kokoroTTS) return kokoroTTS;
  if (kokoroLoading) return kokoroLoading;

  kokoroLoading = (async () => {
    const { KokoroTTS } = await import('kokoro-js');
    const tts = await KokoroTTS.from_pretrained("onnx-community/Kokoro-82M-v1.0-ONNX", {
      dtype: "q8",
      device: "cpu",
    });
    kokoroTTS = tts;
    return tts;
  })();

  return kokoroLoading;
}

function parseRateMultiplier(rateString) {
  if (!rateString) return 1.0;
  const num = parseFloat(rateString.replace('%', ''));
  if (isNaN(num)) return 1.0;
  return Math.max(0.5, Math.min(2.0, 1.0 + (num / 100)));
}

function generateWordBoundaries(text, totalDurationSeconds) {
  const words = [];
  const regex = /(\S+)/g;
  let match;
  while ((match = regex.exec(text)) !== null) {
    const raw = match[1];
    const clean = raw.replace(/^[^a-zA-Z0-9]+|[^a-zA-Z0-9]+$/g, '');
    if (clean.length > 0) {
      const charWeight = Math.max(1, clean.length);
      let pauseBonus = 0;
      if (/[,;:]$/.test(raw)) pauseBonus = 3;
      else if (/[.?!]$/.test(raw)) pauseBonus = 5;

      words.push({
        word: clean,
        weight: charWeight + pauseBonus,
        pauseBonus: pauseBonus
      });
    }
  }

  if (words.length === 0) return [];

  const totalWeight = words.reduce((sum, w) => sum + w.weight, 0);
  const totalDuration100ns = totalDurationSeconds * 10_000_000;

  let currentOffset100ns = 0;
  const boundaries = [];

  for (let i = 0; i < words.length; i++) {
    const w = words[i];
    const wordDuration100ns = (w.weight / totalWeight) * totalDuration100ns;
    const speakDuration100ns = w.pauseBonus > 0
      ? wordDuration100ns * (w.weight - w.pauseBonus * 0.7) / w.weight
      : wordDuration100ns;

    boundaries.push({
      type: "WordBoundary",
      offset: Math.round(currentOffset100ns),
      duration: Math.round(speakDuration100ns),
      textObj: w.word
    });

    currentOffset100ns += wordDuration100ns;
  }

  return boundaries;
}

function float32To16BitPcmWav(float32Array, sampleRate = 24000) {
  if (!float32Array || float32Array.length === 0) {
    return Buffer.alloc(44);
  }
  const numSamples = float32Array.length;
  const buffer = Buffer.alloc(44 + numSamples * 2);

  buffer.write('RIFF', 0);
  buffer.writeUInt32LE(36 + numSamples * 2, 4);
  buffer.write('WAVE', 8);

  buffer.write('fmt ', 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20); // PCM
  buffer.writeUInt16LE(1, 22); // Mono
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate * 2, 28);
  buffer.writeUInt16LE(2, 32);
  buffer.writeUInt16LE(16, 34);

  buffer.write('data', 36);
  buffer.writeUInt32LE(numSamples * 2, 40);

  let offset = 44;
  for (let i = 0; i < numSamples; i++) {
    const s = Math.max(-1, Math.min(1, float32Array[i]));
    const val = s < 0 ? s * 0x8000 : s * 0x7FFF;
    buffer.writeInt16LE(Math.round(val), offset);
    offset += 2;
  }

  return buffer;
}

process.on('uncaughtException', (err) => {
  sendMessage({ type: "error", error: "Host exception: " + (err?.message || err) });
});
process.on('unhandledRejection', (err) => {
  sendMessage({ type: "error", error: "Host rejection: " + (err?.message || err) });
});

// Native messaging requires reading exactly the specified number of bytes
let buffer = Buffer.alloc(0);

process.stdin.on('readable', () => {
  let chunk;
  while ((chunk = process.stdin.read()) !== null) {
    buffer = Buffer.concat([buffer, chunk]);
    processBuffer();
  }
});

function processBuffer() {
  while (buffer.length >= 4) {
    const msgLength = buffer.readUInt32LE(0);
    
    if (buffer.length >= 4 + msgLength) {
      const msgBuffer = buffer.subarray(4, 4 + msgLength);
      buffer = buffer.subarray(4 + msgLength); // Keep the rest
      
      const msgStr = msgBuffer.toString('utf8');
      try {
        const msg = JSON.parse(msgStr);
        handleMessage(msg);
      } catch (err) {
        sendMessage({ type: "error", error: "Failed to parse JSON" });
      }
    } else {
      break; // Wait for more data
    }
  }
}

function sendMessage(msg) {
  try {
    const msgStr = JSON.stringify(msg);
    const msgBuffer = Buffer.from(msgStr, 'utf8');
    
    const header = Buffer.alloc(4);
    header.writeUInt32LE(msgBuffer.length, 0);
    
    process.stdout.write(header);
    process.stdout.write(msgBuffer);
  } catch (err) {
    // Cannot log normally, ignore or write to a debug file
  }
}

async function handleMessage(msg) {
  if (msg.type === "START") {
    const { text, voice, rateString } = msg;

    if (!text || !text.trim() || !/\p{L}|\p{N}/u.test(text)) {
      sendMessage({ type: "end" });
      return;
    }

    // --- Kokoro Local AI Engine ---
    if (voice && (voice.startsWith("kokoro:") || voice === "kokoro")) {
      try {
        const tts = await getKokoro();
        const kokoroVoice = voice.startsWith("kokoro:") ? voice.slice(7) : "af_heart";
        const speed = parseRateMultiplier(rateString);

        const audio = await tts.generate(text, {
          voice: kokoroVoice,
          speed: speed
        });

        const numSamples = audio.audio?.length || 0;
        const sampleRate = audio.sampling_rate || 24000;
        const totalDurationSeconds = numSamples / sampleRate;
        const boundaries = generateWordBoundaries(text, totalDurationSeconds);

        for (const wb of boundaries) {
          sendMessage(wb);
        }

        const wavBuffer = float32To16BitPcmWav(audio.audio, sampleRate);
        const CHUNK_SIZE = 64 * 1024; // 64 KB chunks to stay well under Chrome's 1MB limit

        sendMessage({ type: "audio_wav_start" });
        for (let offset = 0; offset < wavBuffer.length; offset += CHUNK_SIZE) {
          const slice = wavBuffer.subarray(offset, Math.min(offset + CHUNK_SIZE, wavBuffer.length));
          sendMessage({
            type: "audio_wav_chunk",
            data: slice.toString('base64')
          });
        }
        sendMessage({ type: "audio_wav_end" });

        sendMessage({ type: "end" });

      } catch (error) {
        sendMessage({ type: "error", error: error.message || error.toString() });
      }
      return;
    }

    // --- Cloud Edge TTS Engine ---
    try {
      const communicate = new Communicate(text, {
        voice,
        rate: rateString
      });
      
      let audioBuffer = Buffer.alloc(0);

      for await (const chunk of communicate.stream()) {
        if (chunk.type === "audio" && chunk.data) {
          audioBuffer = Buffer.concat([audioBuffer, Buffer.from(chunk.data)]);
          if (audioBuffer.length >= 8192) {
            sendMessage({
              type: "audio",
              data: audioBuffer.toString('base64')
            });
            audioBuffer = Buffer.alloc(0);
          }
        } else if (chunk.type === "WordBoundary") {
          sendMessage({
            type: "WordBoundary",
            offset: chunk.offset,
            duration: chunk.duration,
            textObj: chunk.text
          });
        }
      }

      if (audioBuffer.length > 0) {
        sendMessage({
          type: "audio",
          data: audioBuffer.toString('base64')
        });
      }
      
      sendMessage({ type: "end" });
      
    } catch (error) {
      sendMessage({ type: "error", error: error.message || error.toString() });
    }
  }
}
