// Makes (or replaces) the restricted VELARIS key: <SK_DIR>\velaris-token.txt
// The key is written to the file only — it is NOT printed here. Open the file yourself and copy it into the VELARIS website (SYKHAI_TOKEN).
// Delete the file to switch the key off at once. Run again to get a brand-new key (the old one stops working).
'use strict';
const fs = require('fs'), path = require('path'), crypto = require('crypto');
const ROOT = process.env.SK_DIR || 'D:\\SykhaiEditor';
fs.mkdirSync(ROOT, { recursive: true });
const f = path.join(ROOT, 'velaris-token.txt');
const existed = fs.existsSync(f);
fs.writeFileSync(f, crypto.randomBytes(24).toString('hex') + '\r\n');
console.log(existed ? 'New VELARIS key created (the old one no longer works).' : 'VELARIS key created.');
console.log('File: ' + f);
