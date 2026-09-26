# STAR HOME — События умного дома

Хранятся в снимке `ops`, не в отдельной БД.

## Лента `smartEvents`

Поля: device/gateway, kind (`command` / `state` / `availability` / `gateway`), title, result, at, seq.

Горячий слой: последние 200. Житель видит только свою единицу / общие точки объекта.

## История `smartHistory`

Точки state после **подтверждённой** команды. Последние 400. Графики — позже.

## Live

`publishLive` kind `device` / `gateway` (+ прежние access/alarm). Поля `seq`, `at`, `deviceId`.

Клиент по-прежнему `LiveRefresh`: WS `/live` или pulse. Второй шины нет.

`liveAccept`: apply / duplicate / stale по seq. Переподключение = refresh снимка, не replay MQTT.
