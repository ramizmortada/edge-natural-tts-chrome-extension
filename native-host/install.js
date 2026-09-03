const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const readline = require('readline');

const DEFAULT_EXT_ID = 'doamgjjamfoodahblejajjaolbklnbfo';

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

rl.question(`Enter your Chrome Extension ID [Press ENTER for default: ${DEFAULT_EXT_ID}]: `, (extId) => {
  extId = extId.trim() || DEFAULT_EXT_ID;

  const manifestPath = path.join(__dirname, 'com.edgetts.host.json');
  const batPath = path.join(__dirname, 'tts-host.bat');
  
  // Create JSON manifest
  const manifest = {
    name: "com.edgetts.host",
    description: "ReadFlow Edge TTS Host",
    path: batPath,
    type: "stdio",
    allowed_origins: [
      `chrome-extension://${extId}/`
    ]
  };

  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
  console.log(`Created manifest at: ${manifestPath}`);

  // Add registry keys for Chrome and Edge
  try {
    const regChrome = `REG ADD "HKCU\\Software\\Google\\Chrome\\NativeMessagingHosts\\com.edgetts.host" /ve /t REG_SZ /d "${manifestPath}" /f`;
    execSync(regChrome, { stdio: 'inherit' });
    console.log("Successfully registered for Google Chrome.");
  } catch (e) {
    console.error("Failed to add Chrome registry key.", e);
  }

  try {
    const regEdge = `REG ADD "HKCU\\Software\\Microsoft\\Edge\\NativeMessagingHosts\\com.edgetts.host" /ve /t REG_SZ /d "${manifestPath}" /f`;
    execSync(regEdge, { stdio: 'inherit' });
    console.log("Successfully registered for Microsoft Edge.");
  } catch (e) {
    console.error("Failed to add Edge registry key.", e);
  }

  console.log("\nSetup complete! You can now use neural voices in ReadFlow.");
  rl.close();
});
