const fs = require('fs');
const esbuild = require('esbuild');
const postcss = require('postcss');
const tailwind = require('@tailwindcss/postcss');

async function build() {
  console.log("Cleaning out directory...");
  fs.rmSync('out', { recursive: true, force: true });
  fs.mkdirSync('out', { recursive: true });

  console.log("Generating extension icons from emerald logo.png...");
  try {
    const sharp = require('sharp');
    fs.mkdirSync('public/icons', { recursive: true });
    const iconSizes = [16, 32, 48, 128];
    for (const s of iconSizes) {
      await sharp('public/logo.png')
        .resize(s, s, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
        .png()
        .toFile(`public/icons/icon-${s}.png`);
    }
  } catch (err) {
    console.warn("Could not generate icons with sharp:", err.message);
  }

  let start = Date.now();
  console.log("Copying public files...");
  fs.cpSync('public', 'out', { recursive: true });

  console.log("Compiling Tailwind v4 CSS for PDF Reader...");
  start = Date.now();
  const globalCss = fs.readFileSync('src/styles/globals.css', 'utf-8');
  const processedCss = await postcss([tailwind()]).process(globalCss, { from: 'src/styles/globals.css' });
  fs.writeFileSync('out/pdf-reader.css', processedCss.css);
  fs.writeFileSync('public/pdf-reader.css', processedCss.css);
  console.log('CSS compiled in ' + (Date.now() - start) + 'ms');

  start = Date.now();
  console.log("Building popup script...");
  esbuild.buildSync({
    entryPoints: ['src/popup/index.ts'],
    bundle: true,
    outfile: 'out/popup.js',
    format: 'iife',
    target: 'es2020'
  });
  console.log('Done in ' + (Date.now() - start) + 'ms');

  start = Date.now();
  console.log("Building content script...");
  esbuild.buildSync({
    entryPoints: ['src/content/index.ts'],
    bundle: true,
    outfile: 'out/content.js',
    format: 'iife',
    target: 'es2020',
    platform: 'browser'
  });
  console.log('Done in ' + (Date.now() - start) + 'ms');

  start = Date.now();
  console.log('Building background script...');
  esbuild.buildSync({
    entryPoints: ['src/background/index.ts'],
    bundle: true,
    outfile: 'out/background.js',
    format: 'esm',
    target: 'es2020',
    platform: 'browser'
  });
  console.log('Done in ' + (Date.now() - start) + 'ms');

  start = Date.now();
  console.log('Building offscreen script...');
  esbuild.buildSync({
    entryPoints: ['src/offscreen/index.ts'],
    bundle: true,
    outfile: 'out/offscreen.js',
    format: 'iife',
    target: 'es2020',
    platform: 'browser'
  });
  console.log('Done in ' + (Date.now() - start) + 'ms');

  start = Date.now();
  console.log('Building PDF reader script (React + Shadcn UI)...');
  esbuild.buildSync({
    entryPoints: ['src/pdf-reader/index.tsx'],
    bundle: true,
    outfile: 'out/pdf-reader.js',
    format: 'iife',
    target: 'es2020',
    platform: 'browser',
    jsx: 'automatic'
  });
  console.log('Done in ' + (Date.now() - start) + 'ms');

  console.log('Copying PDF.js worker and assets...');
  if (fs.existsSync('node_modules/pdfjs-dist/build/pdf.worker.min.mjs')) {
    fs.copyFileSync('node_modules/pdfjs-dist/build/pdf.worker.min.mjs', 'out/pdf.worker.min.mjs');
  } else if (fs.existsSync('node_modules/pdfjs-dist/build/pdf.worker.mjs')) {
    fs.copyFileSync('node_modules/pdfjs-dist/build/pdf.worker.mjs', 'out/pdf.worker.min.mjs');
  }

  if (fs.existsSync('node_modules/pdfjs-dist/wasm')) {
    fs.cpSync('node_modules/pdfjs-dist/wasm', 'out/wasm', { recursive: true });
  }
  if (fs.existsSync('node_modules/pdfjs-dist/cmaps')) {
    fs.cpSync('node_modules/pdfjs-dist/cmaps', 'out/cmaps', { recursive: true });
  }
  if (fs.existsSync('node_modules/pdfjs-dist/standard_fonts')) {
    fs.cpSync('node_modules/pdfjs-dist/standard_fonts', 'out/standard_fonts', { recursive: true });
  }
  if (fs.existsSync('node_modules/pdfjs-dist/iccs')) {
    fs.cpSync('node_modules/pdfjs-dist/iccs', 'out/iccs', { recursive: true });
  }

  console.log('Building Native Host bundle...');
  start = Date.now();
  esbuild.buildSync({
    entryPoints: ['native-host/tts-host.js'],
    bundle: true,
    platform: 'node',
    target: 'node18',
    outfile: 'native-host/tts-host.bundle.js'
  });
  console.log('Done in ' + (Date.now() - start) + 'ms');

  console.log('Packaging native-host directory into out/native-host...');
  fs.mkdirSync('out/native-host', { recursive: true });
  fs.copyFileSync('native-host/tts-host.bundle.js', 'out/native-host/tts-host.bundle.js');
  fs.copyFileSync('native-host/tts-host.bat', 'out/native-host/tts-host.bat');
  fs.copyFileSync('native-host/install.bat', 'out/native-host/install.bat');
  fs.copyFileSync('native-host/install.js', 'out/native-host/install.js');
  fs.copyFileSync('native-host/com.edgetts.host.json', 'out/native-host/com.edgetts.host.json');

  if (fs.existsSync('update.bat')) {
    console.log('Packaging update.bat into out/update.bat...');
    fs.copyFileSync('update.bat', 'out/update.bat');
  }
  if (fs.existsSync('update.ps1')) {
    console.log('Packaging update.ps1 into out/update.ps1...');
    fs.copyFileSync('update.ps1', 'out/update.ps1');
  }

  console.log("Build complete!");
}

build().catch(err => {
  console.error("Build failed:", err);
  process.exit(1);
});
