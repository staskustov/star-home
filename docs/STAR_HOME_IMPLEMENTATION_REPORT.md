# STAR HOME — отчёт о реализации

## Этап 1. Архитектурные контракты (2026-09-28)

Код написан после согласования. MQTT и агент apply **не** делались.

### Что сделано

1. Регистрация и привязка к шлюзу копируют `device.adapter` с `gateway.adapter`. Смена адаптера шлюза обновляет привязанные устройства.
2. Облако не вызывает Wiren Board `execute`: команда только в очередь. Ответ `accepted` / `queued`, `confirmed: false`.
3. `LocalGatewayAdapter` не подтверждает устройство на paired non-local шлюзе. `executeOnAdapter` для таких адаптеров возвращает `awaiting-gateway`.
4. Статусы API: `accepted` | `queued` | `confirmed` | `failed`. Текст «Команда выполнена.» только при `confirmed: true`.
5. Канал: `Number(null)` больше не становится `0`. Добавлен `quality` (`fresh` / `stale` / `unavailable` / `unknown` / `error`).
6. Сид устройств помечен `metadata.demo: true`. Уличная погода без показаний не подменяется константой 12.4.
7. JSON-снимки остаются SoT. Камеры не трогались.

### Файлы

- `apps/web/src/server/device-registry.ts`
- `apps/web/src/server/gateway-adapter.ts`
- `apps/web/src/server/smart-home.ts`
- `apps/web/src/server/device-channels.ts`
- `apps/web/src/server/ops-store.ts`
- `apps/web/src/server/engineering.ts`
- `apps/api/test/command-contracts.test.ts`
- `apps/api/test/adapters.test.ts`
- `apps/api/test/device-channels.test.ts`
- `apps/api/test/rbac.test.ts` (ожидание `queued`, честная пустая погода)

### Тесты

`npx tsx --test test/*.test.ts` в `apps/api`: **155 passed, 0 failed.**

### Критерии этапа 1

| № | Критерий | Результат |
|---|---------|-----------|
| 1 | WB-регистрация не ставит `adapter: local` | да |
| 2 | Команда на таком устройстве не подтверждается local | да |
| 3 | API не говорит «сделано» без `confirmed` | да |
| 4 | Cloud WB execute не вызывается | да |
| 5 | Пустой канал ≠ 0 | да |
| 6 | RBAC + новые инварианты зелёные | да |
| 7 | UI жителя: успех только по `confirmed` | без ломки контракта |

### Ограничения этапа 1 (сняты на 2–3)

Агент apply и MQTT LAN сделаны ниже. Пилот с железом по-прежнему не закрыт: live Wiren Board в этой среде не проверялся.

---

## Этапы 2 и 3. Агент apply + Wiren Board MQTT (2026-09-29)

### Этап 2

- Агент применяет команды: HTTP (confirm только при `confirmed: true`), echo/demo явно, MQTT publish.
- Ack: `confirmed` / `sent` / failed. SENT не пишет `device.state`.
- Heartbeat: `version`, `lastError`, DEGRADED если брокер отвалился.
- Pull отдаёт `externalId`, `endpoint`, `adapter`.
- Буфер исходящих при 5xx и обрыве сети.
- Повтор command id не публикует MQTT снова.

### Этап 3

- Пакет `mqtt` только в `apps/gateway`.
- Subscribe native `/devices/+/controls/+`, дедуп retained, discovery из кэша, fallback JSON.
- Телеметрия → `kind: state`.
- Чужой MQTT-хост запрещён.

### Тесты

- `apps/api`: канал SENT, lastError, прежние RBAC.
- `apps/gateway/test/gateway.test.ts`: apply, дедуп, broker URL, buffer.

### Не подтверждено на железе

Live-брокер Wiren Board, retained с контроллера, reconnect на объекте.

---

## Этап 4. Реальные команды (2026-09-29)

### Что сделано

1. После MQTT publish агент ждёт значение на control topic без `/on`. `confirmed` только при совпадении payload с сообщением **после** seq publish.
2. Retained/кэш до publish не подтверждает команду. Echo с тем же значением (duplicate) подтверждает, потому что seq топика растёт.
3. Таймаут: `STAR_HOME_WB_COMMAND_TIMEOUT_MS` (4000). Retry cap: `STAR_HOME_WB_COMMAND_RETRIES` (2 дополнительных, максимум 5 попыток).
4. `error: mqtt-timeout` → очередь FAILED, `device.state` не пишется. SENT + error тоже FAILED.
5. Command id: in-flight lock + запомненный результат (`command-once.ts`).
6. Версия агента: `agent-4`.

### Файлы

- `apps/gateway/apply.ts`, `topic-cache.ts`, `command-once.ts`, `agent.ts`
- `apps/web/src/server/gateway-queue.ts`
- `docs/STAR_HOME_COMMAND_LIFECYCLE.md`, `STAR_HOME_WIREN_BOARD_MQTT.md`

### Тесты

- `apps/gateway`: echo confirm, stale timeout, retries, wait-after-seq, command-once.
- `apps/api`: SENT без state; timeout → FAILED.

### Не подтверждено на железе

Live echo Wiren Board, задержка контроллера, физический retained.

---

## Этап 5. Диагностика (2026-09-29)

### Что сделано

1. Админка `/admin/devices`: статус шлюза по-русски, версия агента, last contact («только что» / «N мин назад»), ошибка без сырых кодов.
2. Журнал обмена канала: heartbeat / pull / ack / state в `gatewayExchanges`, без токенов.
3. Нет heartbeat 90 с при известном `lastSeen` → `OFFLINE` + `heartbeat-stale`. Команда на такой шлюз уходит в очередь.
4. MQTT: повторный subscribe после reconnect, статус DEGRADED пока reconnecting. Версия `agent-5`.
5. Тест reconnect на фейковом клиенте, без живого брокера.

### Файлы

- `apps/web/src/server/gateway-contact.ts`, `gateway-channel.ts`, `ops-view.ts`
- `apps/web/src/components/admin/OpsDesk.tsx`, `DeviceDetail.tsx`
- `apps/gateway/mqtt-session.ts`, `agent.ts`

### Тесты

- `apps/api`: journal heartbeat, expire stale, format last contact.
- `apps/gateway`: resubscribe после offline, publish после reconnect.

### Следующий этап

Этап 6: консоль специалиста на `/admin/devices` — проверка с временем ответа, «передать жильцу».

