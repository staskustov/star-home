# STAR HOME — полевой пилот физического контура

Дата: 2026-09-29  
Статус железа: **не проверено**. Этот документ — процедура. Пока чеклист не заполнен по факту, **не утверждать**, что Wiren Board, реле или камера работают.

Обозначения результата:

- SOFTWARE VERIFIED — код и автотесты
- SIMULATOR VERIFIED — контур Cloud → Queue → Agent → SIMULATOR
- PHYSICAL HARDWARE VERIFIED — только после PASS в поле

**SIMULATOR ≠ PHYSICAL HARDWARE.**

---

## Hardware

Минимальный состав:

- 1 × Wiren Board (контроллер объекта)
- 1 × MQTT broker на LAN объекта (часто на самом WB)
- 1 × STAR HOME Gateway Agent (хост в той же LAN)
- 1 × физическое реле / нагрузка на выходе WB
- Сеть объекта (LAN) + исходящий HTTPS к cloud STAR HOME
- Cloud STAR HOME (`https://star-home.space` или стенд)

Камеры / ONVIF в этот пилот **не входят**.

---

## Software

### Cloud

- `NODE_ENV=production`
- `STAR_HOME_ALLOW_DEMO` **не задавать** (демо-адаптер запрещён)
- `STAR_HOME_ALLOW_RESTORE` не нужен для пилота команд
- Runtime: `STAR_HOME_RUNTIME=embedded` (как сейчас) или HMAC API — не смешивать два writer на одну БД

### Gateway agent

```
STAR_HOME_CLOUD_URL=https://star-home.space
STAR_HOME_GATEWAY_TOKEN=<pairing token, один раз из админки>
STAR_HOME_WB_MQTT_URL=mqtt://192.168.x.x:1883
STAR_HOME_WB_MQTT_USER=
STAR_HOME_WB_MQTT_PASSWORD=
STAR_HOME_MQTT_CONFIRM=state
STAR_HOME_WB_COMMAND_TIMEOUT_MS=4000
STAR_HOME_WB_COMMAND_RETRIES=2
STAR_HOME_GATEWAY_INTERVAL_MS=20000
```

Не включать: `STAR_HOME_GATEWAY_ECHO`, `STAR_HOME_DEMO`, `STAR_HOME_GATEWAY_SIMULATOR`.

Секреты только в env хоста агента, не в git.

### Объект в STAR HOME

1. Создать шлюз `adapter=wirenboard`.
2. Pairing → сохранить plaintext token только на агенте.
3. Зарегистрировать устройство: `kind` LIGHTING или реле, `externalId` = id устройства WB, `source` будет REAL.
4. Каналы: power (`on`).

### MQTT схема команды

- Publish: `/devices/<externalId>/controls/on/on` payload `1` / `0`
- State: `/devices/<externalId>/controls/on`

---

## Test procedure

Для каждого теста заполнить ACTUAL и PASS/FAIL на объекте. EXPECTED задан заранее.

### Test 1 — Gateway connects

EXPECTED: heartbeat `ONLINE` или `CONNECTING`→`ONLINE`; `lastSeen` свежий; pairing принят.  
ACTUAL:  
PASS/FAIL:

### Test 2 — MQTT connects

EXPECTED: `mqtt=up` на шлюзе; `lastError` пустой. Gateway ONLINE **не** означает Device ONLINE.  
ACTUAL:  
PASS/FAIL:

### Test 3 — Device state appears

EXPECTED: устройство `source=REAL`, `availability` ONLINE только после telemetry; значение не 0-заглушка.  
ACTUAL:  
PASS/FAIL:

### Test 4 — ON command

EXPECTED: UI не «Выполнено» сразу. Command ACCEPTED → очередь PENDING. Агент pull. MQTT publish `1`. Lifecycle ACCEPTED→DELIVERED.  
ACTUAL:  
PASS/FAIL:

### Test 5 — Physical relay switches

EXPECTED: нагрузка на реле слышна/видна. Пока это не наблюдали — **не PHYSICAL HARDWARE VERIFIED**.  
ACTUAL:  
PASS/FAIL:

### Test 6 — Physical state confirmation

EXPECTED: WB публикует фактический `on`; ingest; command ACKED / CONFIRMED; UI «Включено» только после этого.  
ACTUAL:  
PASS/FAIL:

### Test 7 — OFF command

EXPECTED: то же для `0` / выкл. Command и device state разделены до confirm.  
ACTUAL:  
PASS/FAIL:

### Test 8 — Gateway internet loss

EXPECTED: агент буферит исходящие; MQTT в LAN может жить; cloud показывает gateway OFFLINE по stale heartbeat (~90 с). Команда жителя — queued.  
ACTUAL:  
PASS/FAIL:

### Test 9 — MQTT reconnect

EXPECTED: статус CONNECTING при reconnect; затем ONLINE; повторная доставка той же command id не делает второе независимое реле.  
ACTUAL:  
PASS/FAIL:

### Test 10 — Cloud reconnect

EXPECTED: буфер flush; heartbeat снова ONLINE; устройство не становится ONLINE без своего lastSeen.  
ACTUAL:  
PASS/FAIL:

### Test 11 — Duplicate command

EXPECTED: повтор PENDING с тем же command+value не создаёт второй gcmd; агент command-once не публикует дважды.  
ACTUAL:  
PASS/FAIL:

### Test 12 — Device failure

EXPECTED: нет telemetry → Device OFFLINE / STALE, Gateway может остаться ONLINE; command TIMEOUT/FAILED; UI не «Выполнено».  
ACTUAL:  
PASS/FAIL:

---

## Simulator (до железа)

Полный runbook: `docs/STAR_HOME_SOFTWARE_PILOT.md`.

```
STAR_HOME_GATEWAY_SIMULATOR=1
```

Шлюз только `adapter=simulator`. Результат: **SIMULATOR VERIFIED**. Не записывать как REAL. Не включать `STAR_HOME_GATEWAY_ECHO` / `STAR_HOME_DEMO`. `MQTT_CONFIRM=state` — только в полевом пилоте с брокером объекта.
