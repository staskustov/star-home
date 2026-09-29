# STAR HOME — Wiren Board и MQTT

Дата: 2026-09-29  
Статус: этап 4. MQTT только в `apps/gateway`. Пакет `mqtt` не подключается в `apps/web`.

## Границы

- Брокер объекта не публикуется в интернет.
- Агент ходит только на `127.0.0.1` / `localhost` (`mqtt://` или `mqtts://`).
- Cloud `WirenBoardAdapter.execute` по-прежнему не публикует и не подтверждает.

## Подписка

- `/devices/+/controls/+` — значения (включая retained).
- `/devices/+/meta/+` — метаданные.

QoS 1. Повтор того же topic+payload не обновляет кэш значения, но увеличивает seq топика — так echo Wiren Board с тем же `1` всё равно закрывает wait-after-write.

Discovery: группировка native topic → одно физическое устройство, много каналов (`wb-controls.ts` / `topic-cache.ts`). Файл `STAR_HOME_WB_DISCOVERY` — fallback.

Телеметрия: кэш → `kind: state` на cloud ingest (`externalId` + channels). Пустое значение не подменяется нулём на стороне cloud.

## Команда (этап 4 = publish + read-after-write)

Publish: `/devices/{externalId}/controls/{on|brightness|target|position}/on`  
Читаем echo: `/devices/{externalId}/controls/{on|brightness|target|position}` (без `/on`).  
Payload: `1` / `0` / число строкой.

Агент ставит waiter **до** publish, с `afterSeq` текущего seq read-topic. Совпадение payload → `confirmed: true` и `state`. Retained до publish не считается подтверждением.

Нет echo за таймаут — повтор publish (cap), затем `confirmed: false`, `sent: true`, `error: mqtt-timeout`. Cloud переводит команду в FAILED, `device.state` не трогает.

## Переменные агента

| Переменная | Смысл |
|------------|--------|
| `STAR_HOME_WB_MQTT_URL` | `mqtt://127.0.0.1:1883` |
| `STAR_HOME_WB_MQTT_USER` | опционально |
| `STAR_HOME_WB_MQTT_PASSWORD` | опционально |
| `STAR_HOME_WB_DISCOVERY` | JSON fallback |
| `STAR_HOME_WB_COMMAND_TIMEOUT_MS` | ожидание echo, по умолчанию 4000 |
| `STAR_HOME_WB_COMMAND_RETRIES` | дополнительные попытки, по умолчанию 2 |
| `STAR_HOME_GATEWAY_ECHO` | тест/демо, не пилот |

Auth брокера и TLS (`mqtts://127.0.0.1`) поддерживаются клиентом mqtt.js. Сертификаты CA — стандартные для mqtts.

## Проверено / не проверено

Проверено в CI: маппинг topic, дедуп + seq, wait-after-seq, confirm по echo, timeout, retry cap, FAILED на `mqtt-timeout`, запрет чужого хоста.

Не проверено на физическом Wiren Board в этой среде: live broker, retained с реального контроллера, задержка echo, reconnect на объекте.
