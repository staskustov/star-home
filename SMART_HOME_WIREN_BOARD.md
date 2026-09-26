# STAR HOME — Wiren Board adapter

Wiren Board — первый адаптер, не архитектура. Ядро не содержит `if (wirenboard)`.

## Границы

- Облако STAR HOME не контроллер автоматизации.
- MQTT контроллера не открывается в интернет.
- Приложение и frontend не говорят с MQTT / Wiren Board напрямую.
- Адаптер живёт в `apps/web/src/server/adapters/wirenboard.ts` и регистрируется через `registerGatewayAdapter`.

## Маппинг

Исходящая команда:

| Команда | Topic | Payload |
| --- | --- | --- |
| setPower / open / close | `wb/{externalId}/on` | `{ on }` |
| setBrightness | `wb/{externalId}/brightness` | `{ brightness }` |
| setTemperature / setHvacMode | `wb/{externalId}/target` | `{ temperature }` |
| setPosition / stop | `wb/{externalId}/position` | `{ position }` |

Входящие topic: `wb/{externalId}/{on|brightness|target|position|temperature|humidity}` → `NormalizedState`.

## Подтверждение

- Нет `STAR_HOME_WB_MQTT_URL` → `confirmed: false`, `broker-unconfigured`.
- URL не localhost / 127.0.0.1 → `broker-forbidden`. Локальный брокер не в облако.
- Шлюз OFFLINE (не local) → `gateway-offline`, ответ `CONTROLLER_UNAVAILABLE`.
- Успех не подменяется.

## Как подключить позже

1. Local Gateway на LAN объекта держит MQTT к Wiren Board.
2. Облако видит только HTTP/канал шлюза, не topic жителя.
3. `externalId` и adapter — технические поля, жителю не отдаются.
