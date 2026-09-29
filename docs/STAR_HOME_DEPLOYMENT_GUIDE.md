# STAR HOME — развёртывание (этап 9)

Дата: 2026-09-29  
Статус: актуально после этапа 9. Не reseeding живой Postgres. Секреты не в репозиторий.

Продуктовый алиас: `https://star-home.space`. Корень сайта на Vercel — `apps/web`.

Подробности двух runtime и переезда с Neon: корневой `DEPLOY.md`. Этот файл — runbook пилота: backup, агент, health, переменные.

## Контуры

| Контур | Переключатель | Данные |
|--------|---------------|--------|
| Vercel + Neon | `STAR_HOME_RUNTIME=embedded` | таблица `Snapshot` (SoT) + проекция Prisma |
| Next → Nest API | `STAR_HOME_API_URL` + HMAC | те же снимки; не гонять оба режима на одной БД |

`GET /api/health` без сессии: `{ ok: true, runtime: "embedded" \| "remote" }`. Базу не пингует.

Локальный агент: исходящий HTTPS на `POST /api/smart-home/gateways/channel`, заголовок `x-star-home-gateway`. Cloud не MQTT-клиент. Браузер до брокера не допускается.

## Переменные production (Vercel)

Обязательные:

```
STAR_HOME_RUNTIME=embedded
DATABASE_URL=<pooled Neon>
STAR_HOME_INTERNAL_SECRET=<32+ байт>
STAR_HOME_SESSION_SECRET=<32+ байт>
STAR_HOME_VAPID_PUBLIC / STAR_HOME_VAPID_PRIVATE / STAR_HOME_VAPID_SUBJECT
```

Не задавать на живом контуре:

```
STAR_HOME_ALLOW_RESTORE=1
STAR_HOME_DEMO=1
STAR_HOME_GATEWAY_ECHO=1
```

Агент на объекте (не в Vercel):

```
STAR_HOME_CLOUD_URL=https://star-home.space
STAR_HOME_GATEWAY_TOKEN=<plaintext, один раз из админки>
STAR_HOME_WB_MQTT_URL=mqtt://127.0.0.1:1883
STAR_HOME_WB_MQTT_USER / STAR_HOME_WB_MQTT_PASSWORD
STAR_HOME_GATEWAY_BUFFER_PATH=<файл буфера исходящих>
```

Токен шлюза в облаке хранится только как SHA-256. После ротации старый токен сразу недействителен.

## Backup

SoT — пять JSON-снимков: `catalog`, `people`, `ops`, `life`, `audit`.

1. Войти как COMPANY_ADMIN / SUPER_ADMIN (`audit.export`).
2. `/admin/settings` → «Скачать снимок» или `GET /api/admin/backup`.
3. Файл `kind: "star-home-backup"`, `version: 1`. Внутри hash паролей, пароли потоков камер, hash токена шлюза. **Plaintext pairing token в файле нет.**
4. Хранить закрыто, не в git, не в чат.

Аудит: `BACKUP_EXPORT`. Объектный администратор и бухгалтер выгрузить не могут.

## Restore

По умолчанию выключен. Случайный POST из UI живой контур не затирает.

Порядок аварийного восстановления (staging / согласованное окно):

1. Сделать свежий export текущего контура (откат).
2. Задать `STAR_HOME_ALLOW_RESTORE=1` только на время операции.
3. Войти с `settings.company.edit`.
4. POST `/api/admin/backup` с `{ "confirm": "RESTORE", "backup": <файл> }`.
5. Сразу убрать `STAR_HOME_ALLOW_RESTORE`.
6. Проверить `GET /api/health`, вход admin/admin не использовать на пилоте как постоянный пароль, heartbeat шлюза, кадр камеры.

Без флага — 403. Без фразы `RESTORE` — 400. Бухгалтер — 403.

После restore `readOps()` может дописать сидовые устройства, которых не было в старом файле. Это не wipe; это нормализация снимка. Не вызывать seed/wipe Postgres.

## Мониторинг агента

Heartbeat (протокол `agent-6`) пишет `status`, `version`, `lastError`, `bufferLag`, `mqtt` (`up` | `down` | `none`).

| Сигнал | Где | Смысл |
|--------|-----|--------|
| нет контакта | `lastSeen` старше 90 с | шлюз OFFLINE, `heartbeat-stale` |
| MQTT нет | `mqtt: down` | брокер LAN недоступен, команды WB не подтвердятся |
| очередь N | `bufferLag` | исходящий буфер агента при 5xx/обрыве |
| DEGRADED | heartbeat | агент жив, канал к брокеру плохой |

UI: `/admin/devices`. Журнал `gatewayExchanges` без токенов.

## Деплой сайта

Только по явной просьбе. Из корня репозитория, scope аккаунта владельца:

```
npx --yes vercel --prod --yes --scope starteam2
```

Корень проекта Vercel — `apps/web`. Корневой `package-lock.json` не коммитить.

## Демо-логины (сид, не пилот)

- `admin` / `admin` → `/admin`
- `stanislav` / `resident` → житель
- `security` → `/security`

На пилоте сменить пароли после первого входа. Не reseeding живой базы ради демо.

## Что этот этап не закрывает

- Live Wiren Board / ONVIF на объекте.
- Prisma как SoT (`docs/STAR_HOME_PRISMA_PLAN.md` — план, не миграция).
- Mutual TLS агента.
- База в РФ (152-ФЗ): сейчас Neon `eu-central-1`.
