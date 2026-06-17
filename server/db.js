'use strict';

const fs   = require('fs');
const path = require('path');

const DATA_DIR    = path.join(__dirname, 'data');
const MAX_MESSAGES = 10; // сколько сообщений передаём в Claude

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

function filePath(chatId) {
  return path.join(DATA_DIR, String(chatId) + '.json');
}

function load(chatId) {
  const fp = filePath(chatId);
  if (!fs.existsSync(fp)) {
    return {
      chat_id:    chatId,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      client:     { name: null, contact: null, niche: null, goal: null, timeline: null, budget: null },
      messages:   [],
      card_sent:  false
    };
  }
  return JSON.parse(fs.readFileSync(fp, 'utf8'));
}

function save(dialog) {
  dialog.updated_at = new Date().toISOString();
  fs.writeFileSync(filePath(dialog.chat_id), JSON.stringify(dialog, null, 2), 'utf8');
}

function addMessage(chatId, role, content) {
  const d = load(chatId);
  d.messages.push({ role, content, ts: Date.now() });
  save(d);
}

// Возвращает последние N сообщений в формате {role, content} для OpenRouter
function getMessages(chatId) {
  const d = load(chatId);
  return d.messages
    .slice(-MAX_MESSAGES)
    .map(({ role, content }) => ({ role, content }));
}

function updateClient(chatId, fields) {
  const d = load(chatId);
  Object.assign(d.client, fields);
  save(d);
}

function markCardSent(chatId) {
  const d = load(chatId);
  d.card_sent = true;
  save(d);
}

function getDialog(chatId) {
  return load(chatId);
}

module.exports = { addMessage, getMessages, updateClient, markCardSent, getDialog };
