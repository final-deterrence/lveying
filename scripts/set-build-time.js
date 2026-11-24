const fs = require('fs');
const path = require('path');

// Get current time in the desired format
const now = new Date();
const year = now.getFullYear();
const month = String(now.getMonth() + 1).padStart(2, '0');
const day = String(now.getDate()).padStart(2, '0');
const hour = String(now.getHours()).padStart(2, '0');
const minute = String(now.getMinutes()).padStart(2, '0');

const buildTime = `${year}.${month}.${day} ${hour}:${minute}`;

// Write to a .env.local file
const envPath = path.join(__dirname, '..', '.env.local');
const original = fs.existsSync(envPath) ? fs.readFileSync(envPath, 'utf8') : '';
const entry = `NEXT_PUBLIC_BUILD_TIME=${buildTime}`;
const envContent = /^NEXT_PUBLIC_BUILD_TIME=.*$/m.test(original)
  ? original.replace(/^NEXT_PUBLIC_BUILD_TIME=.*$/m, entry)
  : `${original}${original && !original.endsWith('\n') ? '\n' : ''}${entry}\n`;
fs.writeFileSync(envPath, envContent, { mode: 0o600 });
console.log(`Build time set to: ${buildTime}`);
