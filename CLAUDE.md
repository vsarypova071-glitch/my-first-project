# Проект

Визитка Виктории Шарыповой.

Домен: v-sharypova.ru

## Сервер

VPS Beget: 62.113.111.113

## Важно

Не изменять:
- ai-fotosessia.ru
- порт 3000

Использовать:
- v-sharypova-api
- порт 3001

## Структура

- Frontend: `/var/www/v-sharypova.ru/public`
- Backend: `/var/www/v-sharypova.ru/server`
- Systemd: `/etc/systemd/system/v-sharypova-api.service`
- Env: `/etc/v-sharypova/api.env`

## Проверка

```bash
systemctl status v-sharypova-api
curl http://127.0.0.1:3001/api/health
nginx -t
systemctl reload nginx
```

## SSL

```bash
certbot --nginx -d v-sharypova.ru -d www.v-sharypova.ru
```
