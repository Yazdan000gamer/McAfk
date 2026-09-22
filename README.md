# McAfk — Telegram Minecraft bot manager

Node.js Telegram bot manager for offline-mode Mineflayer bots. Version 2 stores bot definitions and forwarding subscriptions in SQLite, supports bounded resource usage, reconnect backoff, batched chat forwarding, and configurable Mineflayer options.

## Setup

```bash
cp .env.example .env
# Set TELEGRAM_BOT_TOKEN in .env
npm install
npm start
```

Use `/start` in a private chat to manage bots. Add bots with `name host port [version]`; use `/echo` to send Minecraft chat and `/walk` to move online bots. In a group, use `/forward @yourusername` to forward your bots' chat.

See `.env.example` for storage, resource-limit, reconnect, batching, and Mineflayer settings. Existing v1 `userdata.json` data is imported automatically on first boot.

For educational use only; operate bots only on servers where you have permission. MIT licensed.
