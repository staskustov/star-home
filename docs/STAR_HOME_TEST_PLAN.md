# STAR HOME — план тестов

Дата: 2026-09-29  
Статус: актуально после этапа 9.

Железо объекта в CI нет. Зелёный прогон означает инварианты софта, не «пилот на Wiren Board закрыт».

## Как гонять

```
cd apps/api && npx tsx --test test/*.test.ts
cd apps/gateway && npx tsx --test test/*.test.ts
```

In-memory `bindStore`, без Neon и без Playwright. Сид тот же, что у продукта.

## Наборы

| Файл | Что держит |
|------|------------|
| `security.test.ts` | public только `login`/`pushKey`; каждый staff-метод с permission; 403 без права не меняет store; household закрыт к staff; чужая компания 404; origin; HMAC freshness; секрет в production |
| `rbac.test.ts` | матрица ролей, pairing без plaintext в UI, команды, сценарии |
| `adapters.test.ts` | WB mapping, heartbeat `bufferLag`/`mqtt`, очередь, sent≠state |
| `command-contracts.test.ts` | accepted/queued/confirmed, cloud не execute WB |
| `device-channels.test.ts` | пустой канал ≠ 0, quality |
| `device-commission.test.ts` | probe/handover |
| `camera.test.ts` | кадр без фейка, 403 бухгалтера, pack пароля только агенту |
| `automation.test.ts` | runtime gateway vs cloud |
| `production.test.ts` | backup 5 снимков, token не в export, restore-гейт |
| `gateway/test/gateway.test.ts` | apply HTTP/MQTT, буфер, discovery, JPEG capture, echo не рисует кадр |

Новый staff-метод автоматически попадает в матрицу `security.test.ts` через `rpcAccess`.

## Этап 9 — обязательные инварианты

1. Heartbeat сохраняет `bufferLag` и `mqtt`.
2. Export: `kind: star-home-backup`, имена `catalog, people, ops, life, audit`.
3. Pairing plaintext отсутствует в JSON export; в `listGateways` нет `tokenHash`.
4. Бухгалтер и объектный админ — 403 на `exportBackup`.
5. Restore без `STAR_HOME_ALLOW_RESTORE=1` — 403; без `RESTORE` — 400; с флагом и фразой — данные применяются.
6. Restore бухгалтеру — 403 даже при флаге.

## Что гонять руками (не CI)

- Вход demo, `/admin/devices`: статус шлюза, «очередь N», MQTT.
- `/admin/settings`: скачать снимок; restore на production **не** включать.
- `GET /api/health` без cookie.
- Агент `--once` к staging: heartbeat, не к localhost MQTT с облака.
- Камера: сид без потока → «не подключён», не чёрная картинка.

## Регрессии, которые нельзя «починить» моком

- `confirmed: true` без адаптера, говорившего с железом.
- Браузерный RTSP/пароль камеры.
- Cloud subscribe на брокер объекта.
- Seed wipe живой Postgres.

Playwright и E2E на объекте — отдельный контур после появления железа.
