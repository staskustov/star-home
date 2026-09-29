# STAR HOME — локальный шлюз

Дата: 2026-09-29  
Статус: этапы 2–7 в коде агента `apps/gateway` и админки `/admin/devices`.

## Роль

Агент работает в LAN объекта. Облако — не MQTT-клиент брокера объекта и не контроллер.

```
Cloud HTTPS  ←  агент (исходящее соединение)
                  ↓
            MQTT localhost (Wiren Board)
                  ↓
            устройства
```

Идентификация: pairing token (в облаке только hash). Версия: heartbeat `version` (`agent-6`). `lastSeen` / `lastError` / `status` ONLINE | DEGRADED | OFFLINE.

Last contact: любой успешный heartbeat / pull / ack / state обновляет `lastSeen`. Если `lastSeen` старше 90 с — шлюз `OFFLINE`, `lastError: heartbeat-stale`. Админка показывает «нет контакта» / «N мин назад», не сырой ISO.

Журнал обмена: `gatewayExchanges` (heartbeat, pull, ack, state), без токенов, 200 записей. UI — `/admin/devices`.

## Канал

`POST /api/smart-home/gateways/channel`, заголовок `x-star-home-gateway`.

| kind | Назначение |
|------|------------|
| heartbeat | статус, версия, lastError |
| pull | PENDING-команды + `externalId`, `endpoint`, `adapter` + пакет `automations` |
| ack | `confirmed` → ACKED и state; `sent` без error → SENT, state не применяется; `sent` + error / иначе → FAILED |
| state | ingest каналов по `externalId` / `deviceId` |
| automation | отчёт локального прогона (`runId`, scenarioId/ruleId, confirmed). Повтор того же `runId` не применяется |

4xx не буферизуются. 5xx и обрыв сети — в outbound buffer, повтор при следующем цикле.

## Apply

1. `discover` — live MQTT cache, иначе JSON `STAR_HOME_WB_DISCOVERY`.
2. `http` / `endpoint` — POST, `confirmed` только если тело `confirmed: true`.
3. `wirenboard` / `mqtt` — publish `/devices/{id}/controls/{control}/on`, ждать echo на control topic; `confirmed` только при совпадении. Таймаут → `mqtt-timeout` → FAILED.
4. `runScenario` — шаги из `value.steps` на агенте, затем отчёт `automation`.
5. Иначе `agent-unapplied`.
6. Echo/demo — только при `STAR_HOME_GATEWAY_ECHO=1` или `STAR_HOME_DEMO=1`.

Повтор command id не приводит к повторному publish: in-flight lock + запомненный результат.

## Локальная автоматизация

Сценарий: `runtime: "cloud" | "gateway"`. Нет поля — облако. Облако не исполняет gateway EVENT/SCHEDULE/LIFE_MODE.

Агент после pull загружает pack: пользовательские сценарии этого шлюза + критические правила (протечка → закрыть воду/полив; дым/пожар → свет). EVENT — фронт условия. SCHEDULE — один раз в календарный день зоны объекта. Критические — пока условие истинно, повтор не чаще 60 с, HIGH не пропускается.

UI не пишет, что сценарий «работает», если `runtime: gateway` и шлюз offline/stale.

## Что ещё не сделано

- Mutual TLS.
- Камеры (этап 8).

Файлы: `apps/gateway/agent.ts`, `apply.ts`, `local-runtime.ts`, `mqtt-session.ts`, `topic-cache.ts`, `command-once.ts`, `outbound-buffer.ts`, `broker-url.ts`, `apps/web/src/server/gateway-contact.ts`, `automation.ts`.
