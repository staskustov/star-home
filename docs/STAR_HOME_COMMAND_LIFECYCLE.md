# STAR HOME — жизненный цикл команды

Дата: 2026-09-29  
Статус: актуально после этапа 8. Prisma SoT — этап 9.

## Путь

```
Житель / специалист
  → RBAC на сервере
  → commandDeviceSmart
  → если адаптер шлюза local или http: execute в облаке
  → если wirenboard / mqtt: очередь HTTPS → агент
       → MQTT publish на LAN
       → ждать значение на control topic (без /on) после seq publish
       → совпало → confirmed; таймаут после retry cap → failed
  → UI считает успех только при confirmed === true
```

Браузер до MQTT не допускается. Cloud не вызывает WB execute.

## Статусы ответа API (`status`)

| status | confirmed | Смысл |
|--------|-----------|--------|
| `confirmed` | true | Адаптер подтвердил (cloud `local`/`http`, HTTP-агент с `confirmed`, MQTT echo) |
| `accepted` | false | Cloud принял, очередь агенту |
| `queued` | false | Шлюз офлайн, ждём агента |
| `failed` | false | Не подтверждено |

Отдельно: `needsConfirm: true` — HIGH-risk, ждём confirm token.

«Команда выполнена.» только при `confirmed: true`.

Проверка специалиста (`probeDevice`): та же команда, но Cloud **ждёт** ACKED/FAILED/EXPIRED (или таймаут `STAR_HOME_PROBE_TIMEOUT_MS`, по умолчанию 12 с). UI показывает `N мс · подтверждено` или `N мс · нет ответа`. `confirmed: true` только после железа/адаптера.

Очередь шлюза (`gatewayCommands.status`): PENDING → SENT (MQTT ушёл, ещё ждём echo) → ACKED | FAILED | EXPIRED.

SENT не меняет `device.state`. FAILED после `mqtt-timeout` тоже не меняет state. Телеметрия может обновить каналы независимо, когда брокер пришлёт значение.

Ack агента:

| confirmed | sent | error | Очередь |
|-----------|------|-------|---------|
| true | * | * | ACKED, пишем state |
| false | true | нет | SENT |
| false | true | `mqtt-timeout` / другая | FAILED |
| false | false | * | FAILED |

`captureFrame`: в ack может быть `frame` (base64 JPEG). Cloud сохраняет кадр только если магия JPEG верна. Echo не подтверждает камеру. Подробности: `docs/STAR_HOME_CAMERA_ARCHITECTURE.md`.

## Адаптеры

- Транспорт: `gateway.adapter`.
- Cloud execute только `local` и `http`.
- Агент HTTP: confirm только если тело ответа `confirmed: true`.
- Агент MQTT: confirm только если после publish пришло значение на read-topic, совпавшее с payload (`1`/`true`/`"1"`, числа с допуском 0.05). Без `waitMqtt` (тесты этапа 3) остаётся `sent`, не `confirmed`.

Таймаут: `STAR_HOME_WB_COMMAND_TIMEOUT_MS` (по умолчанию 4000). Повторы: `STAR_HOME_WB_COMMAND_RETRIES` (по умолчанию 2 дополнительных, всего не больше 5 попыток).

## Идентификаторы

`gatewayCommands[].id`. Дедуп PENDING в очереди. Агент держит in-flight lock и запоминает результат id: повторный pull не публикует MQTT снова и не ждёт echo второй раз.

## Файлы

- `apps/web/src/server/smart-home.ts`
- `apps/web/src/server/gateway-queue.ts`
- `apps/gateway/apply.ts`, `apps/gateway/agent.ts`, `apps/gateway/topic-cache.ts`, `apps/gateway/command-once.ts`
- `apps/web/src/components/home/DeviceCommand.tsx`
