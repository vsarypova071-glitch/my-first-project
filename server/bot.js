'use strict';

const http  = require('http');
const https = require('https');
const db    = require('./db');
const ai    = require('./ai');
const { SYSTEM_PROMPT } = require('./prompt');

const PORT           = parseInt(process.env.PORT || '3002', 10);
const TOKEN          = process.env.TELEGRAM_BOT_TOKEN   || '';
const ADMIN_CHAT_ID  = process.env.TELEGRAM_ADMIN_CHAT_ID || '';
const WEBHOOK_SECRET = process.env.TELEGRAM_WEBHOOK_SECRET || '';

// Rate limiting: max N messages per hour per user (in-memory)
const RATE_LIMIT  = 15;
const RATE_WINDOW = 60 * 60 * 1000;
const rateMap     = new Map();

function checkRate(chatId) {
  const now   = Date.now();
  const entry = rateMap.get(chatId);
  if (!entry || now > entry.resetAt) {
    rateMap.set(chatId, { count: 1, resetAt: now + RATE_WINDOW });
    return true;
  }
  if (entry.count >= RATE_LIMIT) return false;
  entry.count++;
  return true;
}

function tgSend(chatId, text) {
  return new Promise((resolve) => {
    const payload = JSON.stringify({ chat_id: chatId, text });
    const req = https.request(
      {
        hostname: 'api.telegram.org',
        path:     `/bot${TOKEN}/sendMessage`,
        method:   'POST',
        headers: {
          'Content-Type':   'application/json',
          'Content-Length': Buffer.byteLength(payload)
        },
        timeout: 10000
      },
      (res) => { res.resume(); resolve(); }
    );
    req.on('error',   () => resolve());
    req.on('timeout', () => { req.destroy(); resolve(); });
    req.write(payload);
    req.end();
  });
}

function statusLabel(s) {
  return { hot: '🔥 горячий', warm: '⭐ тёплый', cold: '🧊 холодный' }[s] || s;
}

function formatCard(args, chatId) {
  const lines = ['🆕 Новый клиент с сайта v-sharypova.ru', '━━━━━━━━━━━━━━━'];
  if (args.name)     lines.push('👤 Имя: '       + args.name);
  if (args.contact)  lines.push('💬 Контакт: '   + args.contact);
  else               lines.push('💬 chat_id: '   + chatId);
  if (args.niche)    lines.push('🏢 Ниша: '      + args.niche);
  if (args.goal)     lines.push('🎯 Цель: '      + args.goal);
  if (args.timeline) lines.push('⏱ Сроки: '     + args.timeline);
  if (args.budget)   lines.push('💰 Бюджет: '   + args.budget);
  if (args.summary)  lines.push('📋 Задача:\n'   + args.summary);
  lines.push('⭐ Готовность: ' + statusLabel(args.status));
  return lines.join('\n');
}

async function handleMessage(chatId, text) {
  // Фиксированное приветствие на /start — не тратим токены AI
  if (text === '/start') {
    const greeting = 'Привет! 👋\n\nСпасибо, что написали.\n\nРасскажите немного о себе и чем занимаетесь.\n\nА ещё — что сейчас для вас актуально или над чем работаете 😊';
    db.addMessage(chatId, 'assistant', greeting);
    await tgSend(chatId, greeting);
    return;
  }

  if (!checkRate(chatId)) {
    await tgSend(chatId, '⏳ Слишком много сообщений. Попробуйте через час.');
    return;
  }

  const dialog = db.getDialog(chatId);
  if (dialog.card_sent) {
    await tgSend(chatId, 'Спасибо. Виктория уже получила вашу информацию и свяжется с вами.');
    return;
  }

  db.addMessage(chatId, 'user', text);

  const messages  = db.getMessages(chatId);
  const userCount = messages.filter(m => m.role === 'user').length;

  let sysPrompt = SYSTEM_PROMPT;
  if (userCount >= 3) {
    sysPrompt += '\n\n⚠️ СТОП: клиент написал уже ' + userCount +
      ' сообщений. Немедленно вызови submit_client_card — используй всё, что уже известно. Не жди идеального ТЗ.';
  }

  const result = await ai.chat(messages, sysPrompt);

  // AI недоступен — сообщение не сохраняем в историю
  if (result.error && !result.toolCall) {
    await tgSend(chatId, result.text);
    return;
  }

  // Claude вызвал submit_client_card
  if (result.toolCall?.name === 'submit_client_card') {
    if (!dialog.card_sent) {
      if (ADMIN_CHAT_ID) {
        await tgSend(ADMIN_CHAT_ID, formatCard(result.toolCall.args, chatId));
      } else {
        console.warn('TELEGRAM_ADMIN_CHAT_ID не задан — карточка не отправлена');
      }
      db.updateClient(chatId, result.toolCall.args);
      db.markCardSent(chatId);
    }

    const reply = 'Спасибо, я передала информацию Виктории. Она посмотрит и вернётся с предложением.';
    db.addMessage(chatId, 'assistant', reply);
    await tgSend(chatId, reply);
    return;
  }

  // Обычный текстовый ответ
  if (result.text) {
    db.addMessage(chatId, 'assistant', result.text);
    await tgSend(chatId, result.text);
  }
}

function readBody(req, maxBytes = 64 * 1024) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', chunk => {
      size += chunk.length;
      if (size > maxBytes) { req.destroy(); return reject(new Error('too_large')); }
      chunks.push(chunk);
    });
    req.on('end',   () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

function send(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
}

const server = http.createServer(async (req, res) => {
  if (req.method === 'GET' && req.url === '/api/bot/health') {
    return send(res, 200, { ok: true, service: 'v-sharypova-bot' });
  }

  if (req.method === 'POST' && req.url === '/api/bot') {
    if (WEBHOOK_SECRET && req.headers['x-telegram-bot-api-secret-token'] !== WEBHOOK_SECRET) {
      return send(res, 403, { ok: false });
    }

    let update;
    try {
      const raw = await readBody(req);
      update = JSON.parse(raw);
    } catch {
      return send(res, 400, { ok: false });
    }

    // Сразу отвечаем Telegram — он не ждёт дольше 10 сек
    send(res, 200, { ok: true });

    const msg = update?.message;
    if (!msg?.text || !msg?.chat?.id) return;
    if (msg.chat.type !== 'private') return;

    handleMessage(msg.chat.id, msg.text).catch(err => {
      console.error('handleMessage error:', err.message);
    });
    return;
  }

  send(res, 404, { ok: false });
});

server.listen(PORT, '127.0.0.1', () => {
  console.log('v-sharypova bot listening on 127.0.0.1:' + PORT);
});

function shutdown(signal) {
  console.log('received ' + signal + ', shutting down');
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 5000).unref();
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT',  () => shutdown('SIGINT'));
