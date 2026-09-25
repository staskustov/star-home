# STAR HOME — развёртывание

Один и тот же код работает в двух режимах. Режим выбирается переменными окружения, код менять не нужно.

| | Встроенный (Vercel) | Серверный (VPS) |
|---|---|---|
| Где выполняются обработчики | в функциях Next.js | в Nest API (`apps/api`) |
| Переключатель | `STAR_HOME_RUNTIME=embedded` | `STAR_HOME_API_URL=https://api.…` |
| Живые обновления | опрос `/api/live/pulse` раз в 20 с (только видимая вкладка) | WebSocket `STAR_HOME_LIVE_URL` |
| Счётчик попыток входа | таблица `LoginAttempt` | Redis (`REDIS_URL`) |
| Файлы заявок | колонка `StoredFile.data` | диск или S3 (`STAR_HOME_S3_ENDPOINT`) |
| Web Push | `web-push` в функции | `web-push` в API |

Данные в обоих режимах одинаковые: таблица `Snapshot` (рабочие снимки с версией) и реляционная проекция (`User`, `SecurityEvent`, `AuditLog`, …). Переезд — это смена переменных, без переноса формата.

## Сейчас: Vercel Hobby + Neon Free

- Проект Vercel `star-home`, корень `apps/web`, регион функций `fra1` (`apps/web/vercel.json`), рядом с Neon `eu-central-1`.
- Схема: `apps/api/prisma/schema.prisma` — единственный источник. `apps/web` копирует её при `npm install` (`postinstall`) и генерирует клиент.
- Изменение схемы: `DATABASE_URL=<unpooled> npx prisma db push` из `apps/web` (после `npm install`).

Переменные production:

```
STAR_HOME_RUNTIME=embedded
DATABASE_URL=<pooled Neon>            # pgbouncer=true добавляется автоматически
STAR_HOME_INTERNAL_SECRET=<32+ байт>
STAR_HOME_SESSION_SECRET=<32+ байт>
STAR_HOME_VAPID_PUBLIC / STAR_HOME_VAPID_PRIVATE / STAR_HOME_VAPID_SUBJECT
```

Как устроен встроенный режим: каждый запрос берёт `pg_advisory_xact_lock`, подтягивает снимки, версия которых изменилась в другом экземпляре, выполняет обработчик и в той же транзакции записывает изменённые снимки. Проекция в таблицы идёт после ответа (`after()`), только для последней версии. Пульс объекта хранится в Data Cache Vercel и сбрасывается при событии — открытые экраны не будят базу.

Пределы бесплатных тарифов:

- Neon Free: 100 CU-часов в месяц, 0,5 ГБ. База засыпает через 5 минут без запросов; при исчерпании лимита — остановка до следующего месяца. Следить: консоль Neon → Usage.
- Vercel Hobby: 1 млн вызовов и 4 часа CPU в месяц; только некоммерческое использование по условиям Vercel.
- Все запросы выполняются по очереди (глобальная блокировка). Для десятков одновременных пользователей хватает; дальше — серверный режим.
- Neon и Vercel находятся во Франкфурте. Для персональных данных граждан РФ (152-ФЗ) нужна база в РФ — это ещё одна причина для переезда.

## Переезд на свой сервер

1. Сервер (например Selectel, Ubuntu 24.04): Node 24, PostgreSQL 16, Redis, nginx.
2. Перенос базы: `pg_dump --no-owner <neon-unpooled> | psql postgresql://star:…@127.0.0.1/starhome`.
3. API:
   ```
   cd apps/api && npm ci && npm run prisma
   DATABASE_URL=… REDIS_URL=redis://127.0.0.1:6379 HOST=127.0.0.1 PORT=3457 \
   STAR_HOME_INTERNAL_SECRET=… STAR_HOME_VAPID_PUBLIC=… STAR_HOME_VAPID_PRIVATE=… \
   NODE_ENV=production ./node_modules/.bin/tsx src/main.ts
   ```
   Проверка: `GET /health` → `{"ok":true}`.
4. Сайт (на том же сервере или остаётся на Vercel): убрать `STAR_HOME_RUNTIME`, задать
   `STAR_HOME_API_URL=https://api.star-home.space` и `STAR_HOME_LIVE_URL=wss://api.star-home.space/live`.
   Секреты `STAR_HOME_INTERNAL_SECRET` и `STAR_HOME_SESSION_SECRET` должны совпадать с API — тогда сессии пользователей сохранятся.
5. nginx: `api.star-home.space` → `127.0.0.1:3457` с `Upgrade`/`Connection` для `/live`.
6. Не запускать оба режима на одной базе одновременно: API держит снимки в памяти и не подтягивает чужие версии.
