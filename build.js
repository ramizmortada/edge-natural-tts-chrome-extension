const fs = require('fs');
const { execSync } = require('child_process');

console.log("Cleaning out directory...");
fs.rmSync('out', { recursive: true, force: true });
fs.mkdirSync('out', { recursive: true });

let start = Date.now();
console.log("Copying public files...");
fs.cpSync('public', 'out', { recursive: true });

console.log("Building popup script...");
execSync('npx esbuild src/popup/index.ts --bundle --outfile=out/popup.js --format=iife --target=es2020', { stdio: 'inherit' });
console.log('Done in ' + (Date.now() - start) + 'ms');

start = Date.now();
console.log("Building content script...");
execSync('npx esbuild src/content/index.ts --bundle --outfile=out/content.js --format=iife --target=es2020 --platform=browser');
console.log('Done in ' + (Date.now() - start) + 'ms');

start = Date.now();
console.log('Building background script...');
execSync('npx esbuild src/background/index.ts --bundle --outfile=out/background.js --format=esm --target=es2020 --platform=browser');
console.log('Done in ' + (Date.now() - start) + 'ms');

start = Date.now();
console.log('Building offscreen script...');
execSync('npx esbuild src/offscreen/index.ts --bundle --outfile=out/offscreen.js --format=iife --target=es2020 --platform=browser');
console.log('Done in ' + (Date.now() - start) + 'ms');

start = Date.now();
console.log('Building PDF reader script...');
execSync('npx esbuild src/pdf-reader/index.ts --bundle --outfile=out/pdf-reader.js --format=iife --target=es2020 --platform=browser');
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

console.log("Build complete!");

