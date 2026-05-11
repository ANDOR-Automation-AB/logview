#!/usr/bin/env node
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const sudoUser = process.env.SUDO_USER;
const homeDir = sudoUser ? path.join('/home', sudoUser) : os.homedir();
const settingsDir = path.join(homeDir, '.config', 'logview');
const settingsPath = path.join(settingsDir, 'settings.json');
const defaults = { db: '', table: '', timeColumn: '', rows: [] };

if (!fs.existsSync(settingsDir)) fs.mkdirSync(settingsDir, { recursive: true });
if (!fs.existsSync(settingsPath)) fs.writeFileSync(settingsPath, JSON.stringify(defaults, null, 2));

if (process.env.SUDO_UID) {
  const uid = parseInt(process.env.SUDO_UID);
  const gid = parseInt(process.env.SUDO_GID);
  fs.chownSync(settingsDir, uid, gid);
  fs.chownSync(settingsPath, uid, gid);
}
