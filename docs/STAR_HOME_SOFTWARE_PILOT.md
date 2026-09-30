# STAR HOME — программный пилот без железа

Дата: 2026-09-30  
Статус железа: **не проверено**. Этот документ — runbook контура Cloud → очередь → агент → симулятор.

Обозначения:

- SOFTWARE VERIFIED — код и автотесты (уже на `https://star-home.space`)
- **SIMULATOR VERIFIED** — цель этого пилота
- PHYSICAL HARDWARE VERIFIED — только полевой чеклист в `STAR_HOME_REAL_HARDWARE_PILOT.md`

**SIMULATOR ≠ PHYSICAL HARDWARE.** Успех этого пилота нельзя записывать как работу Wiren Board, реле или камеры.

---

## Цель

Один контролируемый прогон на живом снимке:

1. Backup снимка.
2. Шлюз `adapter=simulator`.
3. Pairing + локальный агент на `https://star-home.space`.
4. Одно служебное устройство, **не передано жильцу**, источник **MOCK**.

PASS: команда ON доходит до CONFIRMED, UI/API не ставят success до `confirmed === true`, источник MOCK, житель устройство не видит.

---

## Что не делать

- Не задавать на Vercel `STAR_HOME_ALLOW_DEMO=1`.
- Не включать у агента `STAR_HOME_GATEWAY_ECHO`, `STAR_HOME_DEMO`.
- Не создавать шлюз `adapter=wirenboard` и не включать на нём симулятор: исполнение будет фейковым, а `source` станет REAL.
- Не ставить `STAR_HOME_MQTT_CONFIRM=state` — без брокера объекта это не про этот пилот.
- Не отдавать тестовое устройство жителю (`handover`).
- Не класть pairing token и backup в git и в чат.
- Не reseeding / wipe живой Postgres.

---

## Cloud

- URL: `https://star-home.space`
- Runtime: `STAR_HOME_RUNTIME=embedded`
- Объект: КП «Сияние» (`obj_siyanie`)
- `STAR_HOME_ALLOW_DEMO` не задавать
- `STAR_HOME_ALLOW_RESTORE` не нужен

Проверка канала агента без токена: `POST /api/smart-home/gateways/channel` → `401` JSON `{"message":"Нет доступа"}`. Это здоровый ответ приложения, не SSO-заглушка.

---

## Агент (хост оператора, не Vercel)

Локальный каталог `.pilot/` в корне репозитория в gitignore. Туда кладут backup и `agent.env`.

```
STAR_HOME_CLOUD_URL=https://star-home.space
STAR_HOME_GATEWAY_TOKEN=<plaintext из pairing, один раз>
STAR_HOME_GATEWAY_SIMULATOR=1
STAR_HOME_GATEWAY_INTERVAL_MS=5000
STAR_HOME_GATEWAY_BUFFER_PATH=.pilot/gateway-buffer.json
```

Не задавать: `STAR_HOME_WB_MQTT_URL`, `STAR_HOME_GATEWAY_ECHO`, `STAR_HOME_DEMO`, `STAR_HOME_SIMULATOR_FAIL`, `STAR_HOME_SIMULATOR_TIMEOUT`.

Запуск из `apps/gateway`:

```
set -a && source ../../.pilot/agent.env && set +a
npx tsx agent.ts
```

Минимальный интервал в коде — 5 с. `--once` не держит ONLINE.

Агент обязан импортировать `applyQueuedCommand` из `apply.ts`. Без этого heartbeat живёт, а команды падают с `applyQueuedCommand is not defined`.

---

## Порядок

Секреты и backup держать в `.pilot/`. Команды ниже — с staff-сессией (право `devices.create`, `devices.edit`, `audit.export`).

### 1. Backup

`GET /api/admin/backup` → файл `kind: "star-home-backup"`, `version: 1`.  
Plaintext pairing token в файле нет. Hash паролей и пароли камер — есть. Хранить закрыто.

### 2. Шлюз

UI: `/admin/devices` → форма «Создать шлюз», адаптер **Симулятор**.

Или API:

```
POST /api/smart-home/gateways
{ "objectId": "obj_siyanie", "name": "Симулятор пилота", "adapter": "simulator" }
```

Если шлюз с этим именем уже есть — не создавать второй. Адаптер обязан быть `simulator`.

### 3. Pairing

UI: на карточке шлюза «Выдать токен». Показать один раз, сразу в `.pilot/agent.env`.

Или `POST /api/smart-home/gateways/<id>/pair` → `{ token, gatewayId }`.

Поднять агент. PASS шага: шлюз `ONLINE`, `lastSeen` свежий, `version` `agent-6`, `mqtt` `none`. Вечный CONNECTING — fail.

### 4. Служебное устройство

Новая регистрация уже с `handedOver: false`. Не нажимать «Передать жильцу».

```
POST /api/smart-home/devices
{
  "objectId": "obj_siyanie",
  "place": "OBJECT",
  "gatewayId": "<id шлюза>",
  "name": "Симулятор света (не жильцу)",
  "kind": "LIGHTING",
  "externalId": "sim-pilot-light",
  "capabilities": ["power"]
}
```

PASS: `source=MOCK` (не REAL), житель `stanislav` устройство не видит.

Мастер устройств без шлюза показывает «Нет шлюзов» — после шага 2 это проходит.

### 5. Команда ON

Агент должен быть ONLINE.

```
POST /api/smart-home/devices/<id>/command
{ "command": "setPower", "value": true }
```

EXPECTED сразу: `confirmed: false`, `status: "accepted"`, `lifecycle: "ACCEPTED"`, есть `commandId`.  
Через один-два тика агента: очередь ACKED, `lifecycle: "CONFIRMED"`, состояние канала `on: true`.  
Повтор той же команды не должен дать ложный второй успех без confirm.

### 6. Отказ без агента

Остановить агент. Повторить setPower. EXPECTED: `accepted` / queued, не success. UI не «Выполнено». Затем снова поднять агент — команда доезжает или уходит в TIMEOUT, без фейкового REAL.

---

## Критерий PASS / FAIL

| Проверка | PASS | FAIL |
|----------|------|------|
| Backup сделан до записи | файл на месте, не в git | запись в живой снимок без точки отката |
| Адаптер шлюза | `simulator` | `wirenboard` + симулятор |
| Источник устройства | MOCK | REAL / DEMO |
| Handover | не передано жильцу | видно жителю как свет дома |
| Команда с агентом | CONFIRMED после ack симулятора | тост/API success на ACCEPTED |
| Команда без агента | queued, не confirmed | demo-adapter-forbidden обойден или ложный success |
| Демо-адаптер | ALLOW_DEMO не задан | local confirm в production |
| Запись результата | SIMULATOR VERIFIED | «железо работает» |

Полевой Test 1–12 из `STAR_HOME_REAL_HARDWARE_PILOT.md` этим пилотом **не закрывается**.
