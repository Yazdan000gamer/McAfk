'use strict';

const { Bot, InlineKeyboard } = require('grammy');
const CFG = require('./src/config');
const dbLayer = require('./src/db');
const { migrateLegacyJsonIfNeeded } = require('./src/migrate');
const store = require('./src/store');
const mcLifecycle = require('./src/mcLifecycle');
const forwardQueue = require('./src/forwardQueue');
const ui = require('./src/ui');
const { handleEcho } = require('./src/echo');
const { registerWalkCommand } = require('./src/walk');
const { esc, normUsername, botIdFor, dot } = require('./src/utils');

const bot = new Bot(CFG.TOKEN);
mcLifecycle.attachTelegramBot(bot);
forwardQueue.attachTelegramBot(bot);
store.bindNotifier((chatId, text) => bot.api.sendMessage(chatId, text, { parse_mode: 'HTML' }).catch(() => {}));

function loadBotsFromDb() {
  const rows = dbLayer.loadAllBots();
  let loaded = 0;
  for (const row of rows) {
    const id = String(row.id);
    if (store.mcBots.has(id)) continue;
    store.mcBots.set(id, {
      id, name: row.name, host: row.host, port: row.port, version: row.version,
      chatId: row.chat_id, userId: row.user_id, ownerUsername: row.owner_username,
      createdAt: row.created_at, mcBot: null, status: 'offline', connectedAt: null,
      error: 'Paused after restart — press Reconnect to resume', autoReconnect: false,
      reconnectAttempts: 0, reconnectTimer: null,
    });
    loaded++;
  }
  console.log(`📦 ${loaded} bot(s) loaded (paused). Press Reconnect to resume.`);
}

migrateLegacyJsonIfNeeded();
loadBotsFromDb();

bot.command('echo', async ctx => handleEcho(ctx, ctx.message.text.trim().slice(5).trim()));
registerWalkCommand(bot);

bot.command('start', async ctx => {
  store.clearChatState(ctx.chat.id);
  await ctx.reply(ui.mainMenuText(ctx.from.id, ctx.chat.id, ctx.from.username), {
    parse_mode: 'HTML', reply_markup: ui.mainMenuKeyboard(),
  });
});

bot.command('forward', async ctx => {
  const rawTarget = ctx.message.text.trim().split(/\s+/)[1] || '';
  const senderUsername = normUsername(ctx.from.username);
  const target = normUsername(rawTarget);
  if (!senderUsername) return ctx.reply('❌ Set a Telegram username before enabling forwarding.');
  if (target && target !== senderUsername) return ctx.reply(`❌ You can only forward your own bots.\nUse <code>/forward @${esc(senderUsername)}</code>`, { parse_mode: 'HTML' });
  const key = String(ctx.from.id);
  const subscribed = store.forwardMap.get(key)?.has(ctx.chat.id);
  if (!subscribed) { const check = store.canAddForward(key); if (!check.ok) return ctx.reply(`❌ ${check.reason}`); }
  if (!store.forwardMap.has(key)) store.forwardMap.set(key, new Set());
  store.forwardMap.get(key).add(ctx.chat.id);
  dbLayer.addForward(key, ctx.chat.id);
  const bots = store.ownedBots(ctx.from.id, ctx.chat.id, ctx.from.username);
  await ctx.reply(`✅ <b>Forwarding enabled!</b>\n\nThis chat will receive Minecraft chat from your bots.\n🤖 <b>${bots.length}</b> bot(s) — <b>${bots.filter(x => x.status === 'online').length}</b> online\n\nTo stop: <code>/unforward @${esc(senderUsername)}</code>`, { parse_mode: 'HTML' });
});

bot.command('unforward', async ctx => {
  const key = String(ctx.from.id), groups = store.forwardMap.get(key);
  if (!groups?.has(ctx.chat.id)) return ctx.reply('⚠️ This chat is not subscribed to your bots.');
  groups.delete(ctx.chat.id); if (!groups.size) store.forwardMap.delete(key);
  dbLayer.removeForward(key, ctx.chat.id);
  await ctx.reply('✅ Stopped forwarding your bot messages to this chat.');
});

bot.command('forwards', async ctx => {
  const key = String(ctx.from.id), groups = store.forwardMap.get(key);
  if (!groups?.has(ctx.chat.id)) return ctx.reply('📡 <b>No active forwards.</b>\n\nUse <code>/forward @yourusername</code> in this chat.', { parse_mode: 'HTML' });
  const bots = store.ownedBots(ctx.from.id, ctx.chat.id, ctx.from.username);
  await ctx.reply(`📡 <b>Active forwards:</b>\n\nYour bots — ${bots.length} total, ${bots.filter(x => x.status === 'online').length} online\nThis chat is subscribed to their Minecraft messages.`, { parse_mode: 'HTML' });
});

bot.on('callback_query:data', async ctx => {
  const data = ctx.callbackQuery.data, chatId = ctx.chat.id, userId = ctx.from.id, username = ctx.from.username;
  const edit = (text, keyboard) => ctx.editMessageText(text, { parse_mode: 'HTML', reply_markup: keyboard }).catch(() => {});
  const answer = (text = '') => ctx.answerCallbackQuery({ text, show_alert: false }).catch(() => {});
  if (data === 'main_menu' || data === 'refresh_menu') { store.clearChatState(chatId); await edit(ui.mainMenuText(userId, chatId, username), ui.mainMenuKeyboard()); return answer(); }
  if (data === 'help') { await edit(`⭐ <b>Help &amp; Usage</b>\n\n<b>Adding:</b> press <i>Add Bot</i> and send <code>name ip port [version]</code>.\n\n📡 Forwarding: <code>/forward @yourusername</code>\n📢 Echo: <code>/echo [botname] message</code>\n🚶 Walk: <code>/walk forward 10</code>\n\n📊 Limits: ${CFG.MAX_BOTS_PER_USER} bots/user, ${CFG.MAX_FORWARDS_PER_USER} forward chats.`, new InlineKeyboard().text('📡 Forwarding Guide', 'fwd_help').row().text('⬅️ Main Menu', 'main_menu')); return answer(); }
  if (data === 'fwd_help') { await edit(`📡 <b>Chat Forwarding</b>\n\n1. Add this bot to a group\n2. Send <code>/forward @yourusername</code>\n3. Only you can subscribe to your own bots.`, new InlineKeyboard().text('ℹ️ General Help', 'help').row().text('⬅️ Main Menu', 'main_menu')); return answer(); }
  if (data === 'list_bots') { store.clearChatState(chatId); await edit(ui.botListText(userId, chatId, username), ui.botListKeyboard(userId, chatId, username)); return answer(); }
  if (data === 'add_bot') { const check = store.canAddBot(userId); if (!check.ok) return answer(check.reason); store.setChatState(chatId, { action: 'awaiting_bot_info' }); await edit(`🔌 <b>Add a Bot</b>\n\nSend: <code>name ip port [version]</code>\nor <code>name ip:port [version]</code>\n\nVersion defaults to <code>${CFG.DEFAULT_VERSION}</code>`, new InlineKeyboard().text('❌ Cancel', 'main_menu')); return answer('✏️ Type the bot details in chat!'); }
  const [action, id] = data.split(':', 2);
  if (!['manage', 'reconnect', 'disconnect', 'confirm_remove', 'do_remove'].includes(action)) return answer();
  const info = store.getBot(id); if (!info) return answer('Bot not found');
  if (!store.currentUserOwns(info, userId, chatId, username)) return answer('This bot belongs to another user');
  store.claimLegacyOwnership(info, userId, username);
  if (action === 'manage') { await edit(ui.botManageText(info), ui.botManageKeyboard(info.id)); return answer(); }
  if (action === 'reconnect') { if (info.status === 'online' || info.status === 'connecting') return answer(`Already ${info.status}`); info.autoReconnect = true; info.reconnectAttempts = 0; mcLifecycle.spawnBot(info); await new Promise(r => setTimeout(r, 400)); await edit(ui.botManageText(store.getBot(info.id)), ui.botManageKeyboard(info.id)); return answer('🟡 Reconnecting…'); }
  if (action === 'disconnect') { info.autoReconnect = false; mcLifecycle.destroyBot(info); info.status = 'offline'; info.connectedAt = null; info.error = 'Disconnected by user'; dbLayer.saveBot(info); await edit(ui.botManageText(info), ui.botManageKeyboard(info.id)); return answer('🔴 Disconnected'); }
  if (action === 'confirm_remove') { await edit(`⚠️ Remove <b>${esc(info.name)}</b>?\nThis will disconnect it from the server.`, new InlineKeyboard().text('✅ Yes, remove', `do_remove:${info.id}`).text('❌ Cancel', `manage:${info.id}`)); return answer(); }
  info.autoReconnect = false; mcLifecycle.destroyBot(info); store.mcBots.delete(info.id); dbLayer.removeBot(info.id); await edit(ui.botListText(userId, chatId, username), ui.botListKeyboard(userId, chatId, username)); return answer(`✅ ${info.name} removed`);
});

bot.on('message:text', async ctx => {
  const text = ctx.message.text.trim(), chatId = ctx.chat.id, state = store.getChatState(chatId);
  if (!state || state.action !== 'awaiting_bot_info') return;
  store.clearChatState(chatId);
  const check = store.canAddBot(ctx.from.id); if (!check.ok) return ctx.reply(`❌ ${check.reason}`);
  const parts = text.split(/\s+/).filter(Boolean), name = parts[0] || '', rawHost = parts[1] || '';
  let host, port, version;
  if (rawHost.includes(':')) { const i = rawHost.lastIndexOf(':'); host = rawHost.slice(0, i); port = Number.parseInt(rawHost.slice(i + 1), 10); version = parts[2] || CFG.DEFAULT_VERSION; } else { host = rawHost; port = Number.parseInt(parts[2] || '', 10); version = parts[3] || CFG.DEFAULT_VERSION; }
  const back = new InlineKeyboard().text('➕ Try Again', 'add_bot').text('⬅️ Main Menu', 'main_menu');
  if (!name || !host || !port) return ctx.reply('❌ Missing info.\n<code>name ip port [version]</code>', { parse_mode: 'HTML', reply_markup: back });
  if (!Number.isInteger(port) || port < 1 || port > 65535) return ctx.reply('❌ Invalid port (1–65535).', { parse_mode: 'HTML', reply_markup: back });
  if (!/^[a-zA-Z0-9_]{1,16}$/.test(name)) return ctx.reply('❌ Invalid username — letters, numbers, underscores, max 16.', { parse_mode: 'HTML', reply_markup: back });
  const id = botIdFor(name, host, port), existing = store.getBot(id);
  if (existing && (existing.status === 'online' || existing.status === 'connecting')) return ctx.reply(`⚠️ <b>${esc(name)}</b> is already ${existing.status}.`, { parse_mode: 'HTML', reply_markup: back });
  const info = { id, name, host, port, version, chatId, userId: ctx.from.id, ownerUsername: ctx.from.username || null, createdAt: existing?.createdAt || new Date().toISOString(), mcBot: null, status: 'connecting', connectedAt: null, error: null, autoReconnect: true, reconnectAttempts: 0, reconnectTimer: null };
  store.mcBots.set(id, info);
  const message = await ctx.reply(`🟡 Connecting <b>${esc(name)}</b> to <code>${esc(host)}:${port}</code> [<code>${esc(version)}</code>]…`, { parse_mode: 'HTML' });
  mcLifecycle.spawnBot(info); dbLayer.saveBot(info);
  setTimeout(async () => { const latest = store.getBot(id); if (!latest) return; await bot.api.editMessageText(chatId, message.message_id, ui.botManageText(latest), { parse_mode: 'HTML', reply_markup: ui.botManageKeyboard(id) }).catch(() => {}); }, 3000);
});

bot.catch(error => console.error('Update error:', error.error?.message ?? error));
const shutdown = async signal => { if (store.isShuttingDown()) return; store.setShuttingDown(true); console.log(`🛑 ${signal} received — shutting down cleanly…`); for (const info of store.mcBots.values()) { info.autoReconnect = false; mcLifecycle.destroyBot(info); info.status = 'offline'; info.connectedAt = null; dbLayer.saveBot(info); } try { await bot.stop(); } catch {} process.exit(0); };
process.once('SIGINT', () => { void shutdown('SIGINT'); }); process.once('SIGTERM', () => { void shutdown('SIGTERM'); });
process.on('uncaughtException', e => { console.error('[UNCAUGHT]', e?.message || e); if (!['destroy is not a function','dest.destroy'].some(x => String(e?.message || '').includes(x)) && e?.code !== 'ERR_STREAM_DESTROYED') void shutdown('uncaughtException'); });
process.on('unhandledRejection', reason => console.error('[UNHANDLED]', reason));
console.log('🚀 Minecraft Bot Manager starting…');
bot.start({ onStart: info => console.log(`✅ Running as @${info.username}`) });
