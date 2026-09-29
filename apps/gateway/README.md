# STAR HOME Local Gateway agent

Агент на объекте. Cloud не открывает MQTT контроллера в интернет.

Версия протокола: `agent-6`.

## Что делает

- Исходящий HTTPS к `POST /api/smart-home/gateways/channel` + заголовок `x-star-home-gateway`.
- Heartbeat: статус, версия, `lastError`.
- Pull очереди команд и ack: `confirmed` / `sent` / ошибка.
- **Apply:** HTTP-endpoint устройства; Wiren Board MQTT publish + ожидание echo; `discover`.
- MQTT subscribe на `/devices/+/controls/+` (и meta), кэш retained, телеметрия в cloud `kind: state`.
- Буфер исходящих вызовов при 5xx / обрыве сети (`STAR_HOME_GATEWAY_BUFFER_PATH`).
- Повторный pull той же команды не публикует MQTT дважды (in-flight lock + память id).
- Локальные сценарии и критические правила (pack с pull, EVENT/SCHEDULE, leak/fire).
- Камеры: pull `cameras`, команда `captureFrame`, JPEG из LAN (HTTP snapshot / ONVIF). Live RTSP нет. Echo не рисует кадр.

MQTT `confirmed: true` только если после publish на control topic (без `/on`) пришло совпадающее значение. Publish без echo — `sent`, затем `mqtt-timeout` / FAILED. Житель не видит «Сделано» без `confirmed`.

## MQTT

Только localhost: `mqtt://127.0.0.1` или `mqtt://localhost` (в т.ч. `mqtts://`). Иной хост — `broker-forbidden`, соединение не открывается.

```
STAR_HOME_CLOUD_URL=https://star-home.example \
STAR_HOME_GATEWAY_TOKEN=... \
STAR_HOME_WB_MQTT_URL=mqtt://127.0.0.1:1883 \
STAR_HOME_WB_MQTT_USER=... \
STAR_HOME_WB_MQTT_PASSWORD=... \
npx tsx agent.ts
```

Файл-снимок `STAR_HOME_WB_DISCOVERY` — запасной discovery, если брокер ещё пуст.

`STAR_HOME_WB_COMMAND_TIMEOUT_MS` — ожидание echo (по умолчанию 4000).  
`STAR_HOME_WB_COMMAND_RETRIES` — дополнительные попытки publish (по умолчанию 2, всего не больше 5).

`STAR_HOME_GATEWAY_ECHO=1` или `STAR_HOME_DEMO=1` — явный тестовый режим: команда подтверждается без железа. В пилоте не включать.

`--once` — один цикл, без демона.

Установка зависимостей: `cd apps/gateway && npm install`.
