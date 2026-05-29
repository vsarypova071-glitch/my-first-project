const http = require('http');
const https = require('https');

const PORT = parseInt(process.env.PORT || '3001', 10);
const TOKEN = process.env.TELEGRAM_BOT_TOKEN || '';
const CHAT_ID = process.env.TELEGRAM_CHAT_ID || '';

function send(res, status, body) {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store'
  });
  res.end(JSON.stringify(body));
}

function readJson(req, max = 16 * 1024) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > max) {
        req.destroy();
        reject(new Error('payload_too_large'));
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => {
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}'));
      } catch (e) {
        reject(new Error('invalid_json'));
      }
    });
    req.on('error', reject);
  });
}

function tgSend(text) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify({ chat_id: CHAT_ID, text });
    const req = https.request(
      {
        hostname: 'api.telegram.org',
        path: `/bot${TOKEN}/sendMessage`,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(payload)
        },
        timeout: 10000
      },
      (r) => {
        let body = '';
        r.on('data', (c) => (body += c));
        r.on('end', () => {
          if (r.statusCode === 200) resolve();
          else reject(new Error('tg_status_' + r.statusCode));
        });
      }
    );
    req.on('error', reject);
    req.on('timeout', () => req.destroy(new Error('timeout')));
    req.write(payload);
    req.end();
  });
}

const server = http.createServer(async (req, res) => {
  if (req.method === 'OPTIONS') return send(res, 204, {});

  if (req.method === 'GET' && req.url === '/api/health') {
    return send(res, 200, { ok: true, service: 'v-sharypova-api' });
  }

  if (req.method !== 'POST' || req.url !== '/api/send') {
    return send(res, 404, { ok: false, error: 'not_found' });
  }

  if (!TOKEN || !CHAT_ID) {
    return send(res, 500, { ok: false, error: 'config' });
  }

  try {
    const body = await readJson(req);
    const name = String(body.name || '').trim();
    const contact = String(body.contact || '').trim();
    const task = String(body.task || '').trim();

    if (!name || !contact || !task) {
      return send(res, 400, { ok: false, error: 'empty_fields' });
    }
    if (name.length > 100 || contact.length > 120 || task.length > 1000) {
      return send(res, 400, { ok: false, error: 'too_long' });
    }

    const text =
      '🔔 Новая заявка с сайта\n\n' +
      '👤 Имя: ' + name + '\n' +
      '📲 Контакт: ' + contact + '\n' +
      '📝 Задача:\n' + task;

    await tgSend(text);
    return send(res, 200, { ok: true });
  } catch (err) {
    const code =
      err.message === 'payload_too_large' ? 413 :
      err.message === 'invalid_json' ? 400 :
      502;
    return send(res, code, { ok: false, error: err.message });
  }
});

server.listen(PORT, '127.0.0.1', () => {
  console.log('v-sharypova api listening on 127.0.0.1:' + PORT);
});

function shutdown(signal) {
  console.log('received ' + signal + ', shutting down');
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 5000).unref();
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
