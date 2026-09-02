# Edge Natural TTS

A Chromium browser extension that reads webpages and documents aloud using Microsoft Edge's natural neural voices with synchronized, real-time word highlighting.

---

## Features

### In-Page Web Reader
- **Hover to Play**: Hover over any paragraph, heading, list item, or article to show a quick-play button.
- **Interactive Sentence Seeking**: Hovering highlights sentences; click any sentence to immediately jump playback to that point.
- **Real-Time Word Highlighting**: Highlights words synchronously as they are spoken using the native CSS Custom Highlight API.
- **Seamless Continuous Reading**: Automatically advances through paragraphs with background sentence preloading for gap-free audio playback.
- **Smart DOM Filtering**: Automatically filters out navigation bars, menus, footers, interactive elements, and AI disclaimers (with built-in selectors for Claude, ChatGPT, and DeepSeek).
- **Floating Controls**: On-screen floating bar to play, pause, or stop playback.
- **Per-Site Toggle**: Enable or disable the hover reader on specific websites directly from the extension popup.

### Document & Book Reader (`pdf-reader.html`)
- **Multi-Format Support**: Reads PDF (`.pdf`), Word (`.docx`), EPUB (`.epub`), Markdown (`.md`), Plain Text (`.txt`), and HTML (`.html`).
- **Two Viewing Modes**:
  - **Reader Mode**: Distraction-free book layout with chapter navigation, word count, and customizable typography.
  - **PDF Mode**: Original multi-page PDF canvas view rendered with PDF.js, including zoom and fit-to-width controls.
- **Speech Auto-Scroll**: Automatically scrolls the document view to follow active speech.
- **Gemini AI Text Cleaner**: Optional page-by-page cleanup using Google Gemini to fix OCR breaks and hyphenation artifacts while preserving original wording (with undo support).
- **Local Library & Reading State**: Automatically saves documents, reading progress, and scroll positions in IndexedDB to resume anytime.
- **Markdown Export**: Export cleaned document text to Markdown files.
- **Customizable Appearance**: 4 themes (Dark, Dark Sepia, Sepia, Light), font family switcher (Sans, Serif, Mono), and adjustable font sizes.

### Voices & Playback Controls
- High-quality natural voices (Aria, Guy, Sonia, Ryan, Natasha, William).
- Adjustable playback speed slider (-50% to +100%).

---

## Prerequisites

- [Node.js](https://nodejs.org/) (v18 or newer recommended)
- Chromium-based browser (Chrome, Edge, Brave, etc.)
- Windows (for the native messaging host installer script)

---

## Installation & Setup

### 1. Install Dependencies & Build
```bash
npm install
npm run build
```
This bundles the popup, content script, background service worker, offscreen audio handler, and document reader into the `out/` directory.

### 2. Load the Extension in Your Browser
1. Open your browser and navigate to `chrome://extensions/` (or `edge://extensions/`).
2. Enable **Developer mode** (toggle in the top-right corner).
3. Click **Load unpacked**.
4. Select the `out` directory inside the project folder.
5. Note or copy the generated **Extension ID** (e.g. `abcdefghijklmnop...`).

### 3. Register the Native Messaging Host
The extension relies on a lightweight local Node.js host to stream audio from Edge TTS:
1. Double-click `native-host/install.bat` (or run `node native-host/install.js` in your terminal).
2. Paste your **Extension ID** when prompted and press **Enter**.
3. This creates the native messaging manifest and registers it under your Windows user registry key (`HKCU\Software\Google\Chrome\NativeMessagingHosts\com.edgetts.host`).

---

## How to Use

### Reading Webpages
1. Browse to any webpage or article.
2. Hover over a block of text and click the blue **Play** button that appears next to it.
3. Click any highlighted sentence to seek directly to that sentence.
4. Use the floating widget on the right edge of the screen to pause or stop playback.
5. Click the extension icon in the toolbar to change the active voice, adjust reading speed, or disable the extension on the current site.

### Reading Documents
1. Click the extension icon in your browser toolbar and select **Open PDF Reader** (or navigate to `chrome-extension://<YOUR_EXTENSION_ID>/pdf-reader.html`).
2. Drag and drop any supported file (`.pdf`, `.docx`, `.epub`, `.md`, `.txt`, `.html`) into the reader window.
3. Click on any sentence to start reading aloud, or use the top playback bar controls.
4. Switch between **Reader Mode** and **PDF Mode** using the top navigation bar.

### (Optional) Gemini AI Cleanup
1. In the Document Reader, click the ✨ (**AI Clean**) button in the top bar.
2. Enter your API key from [Google AI Studio](https://aistudio.google.com/app/apikey).
3. In Reader Mode, click the **AI Clean** badge on any page header to clean OCR artifacts on that page.
