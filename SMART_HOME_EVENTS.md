# STAR HOME — События умного дома

Хранятся в снимке `ops`, не в отдельной БД.

## Лента `smartEvents`

Поля: device/gateway, kind (`command` / `state` / `availability` / `gateway`), title, result, at, seq, severity, source.

Горячий слой: 90 дней и не больше 200. Житель видит только свою единицу / общие точки объекта. Лента `/events`.

Журнал команд `commandLogs`: SUCCESS / DENIED / UNCONFIRMED, staff only.

## История `smartHistory`

Точки state после **подтверждённой** команды и inbound с канала шлюза. 30 дней hot, шаг ≥ 5 мин, не больше 400. Точки не синтезируем. На карточке устройства — список и SVG, если есть хотя бы две числовые точки.

## Триггеры сценария

- `MANUAL` / `LIFE_MODE` — как в Phase 7
- `EVENT` — все условия, HIGH не исполняем, `source: scenario` не зацикливает
- `SCHEDULE` — час/минута в TZ объекта (`STAR_HOME_TIME_ZONE` / Europe/Moscow), `lastRunAt` не чаще раза в календарный день

## Live

`publishLive` kind `device` / `gateway` (+ прежние access/alarm). Поля `seq`, `at`, `deviceId`.

Клиент по-прежнему `LiveRefresh`: WS `/live` или pulse. Второй шины нет.

`liveAccept`: apply / duplicate / stale по seq. Переподключение = refresh снимка, не replay MQTT.
