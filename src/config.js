'use strict';

const path = require('path');
require('dotenv').config();

const boolEnv = (value, fallback) => {
  if (value === undefined || value === null || value === '') return fallback;
  return /^(1|true|yes|on)$/i.test(String(value).trim());
};
const intEnv = (value, fallback) => {
  const n = Number.parseInt(value, 10);
  return Number.isFinite(n) ? n : fallback;
};
const strEnv = (value, fallback) => value === undefined || value === null || value === '' ? fallback : String(value);

const TOKEN = process.env.TELEGRAM_BOT_TOKEN;
if (!TOKEN) {
  console.error('❌ TELEGRAM_BOT_TOKEN not set. Copy .env.example to .env and fill it in.');
  process.exit(1);
}
const ROOT = path.join(__dirname, '..');
module.exports = Object.freeze({
  TOKEN,
  DATA_VERSION: 3,
  DB_PATH: strEnv(process.env.DB_PATH, path.join(ROOT, 'data', 'mcafk.sqlite')),
  LEGACY_JSON_PATH: strEnv(process.env.LEGACY_JSON_PATH, path.join(ROOT, 'userdata.json')),
  DEFAULT_VERSION: strEnv(process.env.MC_DEFAULT_VERSION, '1.20.4'),
  MAX_RECONNECTS: intEnv(process.env.MAX_RECONNECTS, 10),
  BASE_RECONNECT_MS: intEnv(process.env.BASE_RECONNECT_MS, 5000),
  MAX_RECONNECT_MS: intEnv(process.env.MAX_RECONNECT_MS, 60000),
  MC_TIMEOUT_MS: intEnv(process.env.MC_TIMEOUT_MS, 30000),
  MAX_BOTS_GLOBAL: intEnv(process.env.MAX_BOTS_GLOBAL, 500),
  MAX_BOTS_PER_USER: intEnv(process.env.MAX_BOTS_PER_USER, 10),
  MAX_FORWARDS_PER_USER: intEnv(process.env.MAX_FORWARDS_PER_USER, 20),
  CHAT_STATE_TTL_MS: intEnv(process.env.CHAT_STATE_TTL_MS, 600000),
  CHAT_STATE_SWEEP_MS: intEnv(process.env.CHAT_STATE_SWEEP_MS, 300000),
  FORWARD_BATCH_MS: intEnv(process.env.FORWARD_BATCH_MS, 1200),
  FORWARD_BATCH_MAX_LINES: intEnv(process.env.FORWARD_BATCH_MAX_LINES, 20),
  FORWARD_BATCH_MAX_CHARS: intEnv(process.env.FORWARD_BATCH_MAX_CHARS, 3500),
  MC: Object.freeze({
    auth: strEnv(process.env.MC_AUTH, 'offline'),
    hideErrors: boolEnv(process.env.MC_HIDE_ERRORS, false),
    viewDistance: strEnv(process.env.MC_VIEW_DISTANCE, 'tiny'),
    chatLengthLimit: intEnv(process.env.MC_CHAT_LENGTH_LIMIT, 100),
    physicsEnabled: boolEnv(process.env.MC_PHYSICS_ENABLED, true),
    loadInternalPlugins: boolEnv(process.env.MC_LOAD_INTERNAL_PLUGINS, true),
    respawn: boolEnv(process.env.MC_RESPAWN, true),
  }),
});
