'use strict';

const https = require('https');

const TIMEOUT_MS = 15000;

const TOOLS = [{
  type: 'function',
  function: {
    name: 'submit_client_card',
    description: 'Отправить карточку клиента Виктории когда собрана основная информация или диалог завершается',
    parameters: {
      type: 'object',
      properties: {
        name:     { type: 'string', description: 'Имя клиента' },
        contact:  { type: 'string', description: 'Telegram или телефон' },
        niche:    { type: 'string', description: 'Ниша или сфера' },
        goal:     { type: 'string', description: 'Цель клиента' },
        timeline: { type: 'string', description: 'Сроки' },
        budget:   { type: 'string', description: 'Бюджет' },
        summary:  { type: 'string', description: 'Краткое описание задачи своими словами' },
        status:   { type: 'string', enum: ['hot', 'warm', 'cold'], description: 'Оценка готовности' }
      },
      required: ['summary', 'status']
    }
  }
}];

function callApi(messages, systemPrompt) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({
      model:       process.env.OPENROUTER_MODEL || 'anthropic/claude-haiku-4.5',
      messages:    [{ role: 'system', content: systemPrompt }, ...messages],
      tools:       TOOLS,
      tool_choice: 'auto',
      max_tokens:  400,
      temperature: 0.7
    });

    const req = https.request(
      {
        hostname: 'openrouter.ai',
        path:     '/api/v1/chat/completions',
        method:   'POST',
        headers: {
          'Content-Type':   'application/json',
          'Content-Length': Buffer.byteLength(body),
          'Authorization':  'Bearer ' + process.env.OPENROUTER_API_KEY,
          'HTTP-Referer':   process.env.OPENROUTER_SITE_URL  || 'https://v-sharypova.ru',
          'X-Title':        process.env.OPENROUTER_SITE_NAME || 'v-sharypova-bot'
        },
        timeout: TIMEOUT_MS
      },
      (res) => {
        let raw = '';
        res.on('data', chunk => raw += chunk);
        res.on('end', () => {
          if (res.statusCode === 429) return reject(Object.assign(new Error('rate_limit'), { code: 429 }));
          if (res.statusCode >= 500)  return reject(Object.assign(new Error('server_error'), { code: res.statusCode }));
          if (res.statusCode !== 200) return reject(Object.assign(new Error('api_error'),    { code: res.statusCode }));
          try { resolve(JSON.parse(raw)); }
          catch { reject(new Error('invalid_json')); }
        });
      }
    );

    req.on('timeout', () => req.destroy(new Error('timeout')));
    req.on('error',   reject);
    req.write(body);
    req.end();
  });
}

// Всегда возвращает { text, toolCall, error }
// Никогда не бросает исключение — бот не зависнет
async function chat(messages, systemPrompt) {
  try {
    const res     = await callApi(messages, systemPrompt);
    const message = res.choices?.[0]?.message;

    if (!message) throw new Error('empty_response');

    if (message.tool_calls?.length) {
      const tc = message.tool_calls[0];
      let args = {};
      try { args = JSON.parse(tc.function.arguments); } catch {}
      return { text: null, toolCall: { name: tc.function.name, args }, error: null };
    }

    return { text: message.content || '', toolCall: null, error: null };

  } catch (err) {
    const friendly =
      err.code === 429
        ? '⏳ Сейчас много запросов — попробуйте через минуту.'
        : 'Сейчас временно не получается обработать запрос. Попробуйте чуть позже.';

    return { text: friendly, toolCall: null, error: err.message };
  }
}

module.exports = { chat };
