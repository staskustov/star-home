# STAR HOME — локальный шлюз

Дата: 2026-09-29  
Статус: этапы 2–5 в коде агента `apps/gateway` и админки `/admin/devices`.

## Роль

Агент работает в LAN объекта. Облако — не MQTT-клиент брокера объекта и не контроллер.

```
Cloud HTTPS  ←  агент (исходящее соединение)
                  ↓
            MQTT localhost (Wiren Board)
                  ↓
            устройства
```

Идентификация: pairing token (в облаке только hash). Версия: heartbeat `version` (`agent-5`). `lastSeen` / `lastError` / `status` ONLINE | DEGRADED | OFFLINE.

Last contact: любой успешный heartbeat / pull / ack / state обновляет `lastSeen`. Если `lastSeen` старше 90 с — шлюз `OFFLINE`, `lastError: heartbeat-stale`. Админка показывает «нет контакта» / «N мин назад», не сырой ISO.

Журнал обмена: `gatewayExchanges` (heartbeat, pull, ack, state), без токенов, 200 записей. UI — `/admin/devices`.

## Канал

`POST /api/smart-home/gateways/channel`, заголовок `x-star-home-gateway`.

| kind | Назначение |
|------|------------|
| heartbeat | статус, версия, lastError |
| pull | PENDING-команды + `externalId`, `endpoint`, `adapter` |
| ack | `confirmed` → ACKED и state; `sent` без error → SENT, state не применяется; `sent` + error / иначе → FAILED |
| state | ingest каналов по `externalId` / `deviceId` |

4xx не буферизуются. 5xx и обрыв сети — в outbound buffer, повтор при следующем цикле.

## Apply

1. `discover` — live MQTT cache, иначе JSON `STAR_HOME_WB_DISCOVERY`.
2. `http` / `endpoint` — POST, `confirmed` только если тело `confirmed: true`.
3. `wirenboard` / `mqtt` — publish `/devices/{id}/controls/{control}/on`, ждать echo на control topic; `confirmed` только при совпадении. Таймаут → `mqtt-timeout` → FAILED.
4. Иначе `agent-unapplied`.
5. Echo/demo — только при `STAR_HOME_GATEWAY_ECHO=1` или `STAR_HOME_DEMO=1`.

Повтор command id не приводит к повторному publish: in-flight lock + запомненный результат.

## Что ещё не сделано

- Локальные сценарии без облака (этап 7).
- Mutual TLS.

Файлы: `apps/gateway/agent.ts`, `apply.ts`, `mqtt-session.ts`, `topic-cache.ts`, `command-once.ts`, `outbound-buffer.ts`, `broker-url.ts`, `apps/web/src/server/gateway-contact.ts`.
