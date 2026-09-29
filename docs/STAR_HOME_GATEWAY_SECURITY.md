# STAR HOME — безопасность шлюза и контура управления

Дата: 2026-09-29  
Статус: актуально после этапа 9.

Cloud не контроллер и не MQTT-клиент брокера объекта. Браузер не знает RTSP, MQTT, pairing token и пароль камеры.

## Идентичность агента

1. Админ с `devices.edit` вызывает `pairGateway` / `rotateGateway`.
2. Ответ один раз содержит plaintext token (48 hex).
3. В `ops.gateways[].tokenHash` пишется SHA-256. Повторный pair затирает hash.
4. `listGateways` и desk **не** отдают `tokenHash`.
5. Backup содержит hash, не plaintext. Отзыв: `revokeGateway` обнуляет hash.

Заголовок канала: `x-star-home-gateway`. Несовпадение hash → 401. Сессия браузера для канала не нужна: `/api/smart-home/gateways/channel` публичен в proxy, секрет — токен.

## Что нельзя из браузера

- MQTT URL, логин брокера, topic.
- Пароль ONVIF/HTTP камеры (только в pack `cameras` на pull агенту).
- Подпись `STAR_HOME_INTERNAL_SECRET` (HMAC между Next и Nest).
- Успех команды без `confirmed: true`.

## Cloud ↔ API

Если не embedded: POST `/rpc` с HMAC тела и `x-star-home-signature`. Окно свежести ±60 с (`freshRpc`). В `NODE_ENV=production` секрет обязателен.

Запись с чужого origin отсекается (`crossSiteWrite`). GET health и GET канала — не write.

## Права backup

| Действие | Permission | Кто |
|----------|------------|-----|
| Export снимков | `audit.export` | SUPER_ADMIN, COMPANY_ADMIN |
| Restore | `settings.company.edit` + `STAR_HOME_ALLOW_RESTORE=1` + `confirm: "RESTORE"` | те же роли |
| Object admin / бухгалтер | нет | 403 |

Файл снимка — секреты компании (passwordHash, camera passwords). UI предупреждает. Не класть в git.

## Мониторинг без утечки

Heartbeat пишет `bufferLag` и `mqtt`. Журнал обмена — статус/версия/очередь, без токена. `GET /api/health` не отдаёт имена БД, ошибки Prisma и список шлюзов.

## Демо

`adapter: "local"` и `STAR_HOME_GATEWAY_ECHO=1` подтверждают без железа. На paired non-local шлюзе local не ставит `confirmed: true`. В пилоте echo не включать.

## Тесты, которые это фиксируют

`apps/api/test/security.test.ts` — таблица методов, origin, HMAC, секрет в production.  
`apps/api/test/production.test.ts` — token не в export, tokenHash не в listGateways, restore без флага 403.  
`apps/api/test/rbac.test.ts` — pairing plaintext не в desk.
