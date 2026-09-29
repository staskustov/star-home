# STAR HOME — целевая архитектура и план (этап 0)

Дата: 2026-09-28  
Статус: **черновик на согласование. Код целевого контура не писался.**  
Опирается на: `docs/STAR_HOME_CURRENT_STATE_AUDIT.md`

КП «Сияние» — первый объект данных. Ядро без `if (project === "siyanie")`.

---

## 1. Принципы (не обсуждаются повторно, если нет возражения)

1. Cloud STAR HOME — не контроллер автоматизации и не MQTT-клиент брокера объекта.
2. Браузер / PWA не ходит на брокер и не знает секреты устройств.
3. Успех для жителя = `confirmed: true` только после подтверждения шлюзом/адаптером, который **реально** говорил с оборудованием.
4. Моки — только явный demo/test (`adapter: "local"` или `STAR_HOME_DEMO=1`), не рабочий режим пилота.
5. Снимок JSON (`ops` / `catalog` / …) остаётся SoT до отдельного согласованного этапа унификации с Prisma.
6. Не reseeding живой Postgres. Новые поля — в JSON снимка.
7. Frontend не SoT прав.
8. Три режима жизни: HOME / WORK / VACATION.
9. Камеры — отдельная подсистема (этап 8), не сенсорная модель.
10. Не ломать существующий визуальный язык и мобильную навигацию.

---

## 2. Целевой контур управления

```
STAR HOME Web / PWA
        ↓  сессия, RBAC
Cloud API  (rpc-handlers → smart-home)
        ↓  проверка команды, очередь, аудит
HTTPS исходящий канал шлюза  (/api/smart-home/gateways/channel)
        ↓
STAR HOME Local Gateway (агент на объекте)
        ↓  адаптеры
Wiren Board MQTT (LAN)  |  http  |  (позже: modbus, knx, …)
        ↓
физические устройства
        ↓  ack + telemetry
Cloud: состояние, история, уведомления
```

**Локально без облака (этап 7):** сценарии и критические правила на агенте; буфер событий; после reconnect — идемпотентная доставка.

**Облако:** пользователи, объекты, права, UI, удалённые команды, история, уведомления, админка.

---

## 3. Модель сущностей (целевая = развитие текущей)

Не плодить вторую иерархию. Маппинг на существующее:

| ТЗ | Сейчас | Целевое |
|----|--------|---------|
| Project | `catalog` Object | то же, имя в UI «объект» |
| Building | Building | без изменений |
| Unit | Unit | без изменений |
| Room | Room в catalog | без изменений |
| Gateway | `ops.gateways` | + lastContact, agentVersion, bufferLag (metadata/поля JSON) |
| Device | `ops.devices` | `adapter` согласован со шлюзом; запрет `local` на paired gateway |
| Channel | `devices[].channels` | SoT параметра; `state` — проекция |
| Capability | `device-capabilities.ts` | без смены UI-контракта |
| Telemetry | channel.value + updatedAt + status | явный quality: fresh / stale / unavailable / unknown / error |
| Command | `gatewayCommands` + commandLogs | статусы: accepted / sent / confirmed / failed / expired |
| Automation | `ops.scenarios` | + `runtime: "cloud" \| "gateway"`; не врать «работает», если runtime не исполняет |
| Event | smartEvents | без дубля |
| AuditLog | audit snapshot | без изменений контура |

Идентификаторы: внутренний `id` стабилен; `externalId` + `gatewayId` — ключ железа.

---

## 4. Жизненный цикл команды (цель)

Различать три факта (ТЗ §6):

1. **accepted** — Cloud принял, права ок, поставлено в очередь.
2. **sent** — агент взял и отправил в адаптер/MQTT.
3. **confirmed** — устройство/контроллер подтвердил (или детерминированный read-after-write).

UI жителя:

- confirmed → «Сделано»
- accepted/sent → «Отправляется» / «На оборудовании»
- failed → причина, без отката в ложный успех
- HIGH-risk — как сейчас, confirm token

Запрещено: `LocalGatewayAdapter` на устройстве с `gatewayId` paired-шлюза.

Двойной путь «очередь + cloud execute WB» убрать: для `wirenboard`/`mqtt` cloud **только** enqueue; execute — на агенте.

---

## 5. Wiren Board / MQTT (цель, не реализация сейчас)

- MQTT только на LAN у агента.
- Auth брокера, TLS если есть, QoS и retained — на агенте.
- Discovery: live subscribe + опциональный файл как fallback.
- Дедуп сообщений по topic+payload+id.
- Cloud видит нормализованные channels, не сырой topic в UI жителя.
- Потеря брокера → availability OFFLINE, значения last-known + stale, не нули.

Пакет `mqtt` — **только** в `apps/gateway`, не в `apps/web`.

---

## 6. Варианты этапа 2–4 (сравнение)

| Вариант | Надёжность | Сложность | Сопровождение | Рекомендация |
|---------|------------|-----------|---------------|--------------|
| A. Агент MQTT + HTTP канал как сейчас | Высокая, совпадает с запретом cloud MQTT | Средняя | Один агент, один канал | **Да** |
| B. Cloud подписывается на брокер объекта | Нарушает ТЗ и текущий security | Ниже на старте | Дыра, VPN/expose broker | **Нет** |
| C. Только HTTP-адаптер без MQTT | Не покрывает WB | Низкая | Тупик для пилота Сияние | Нет как основной |

Обратное соединение агента → cloud сохраняем (уже есть). Mutual TLS — позже, не блокер этапа 2.

---

## 7. Унификация хранения (не этап 1)

Сейчас JSON SoT + неполная Prisma-проекция. Этап 9 **зафиксировал** это планом (`docs/STAR_HOME_PRISMA_PLAN.md`), без cutover:

1. JSON — SoT пилота.
2. Проекция Gateway/Channel только для отчётов, без смены чтения UI — не делалась в этапе 9.
3. Миграция Prisma→SoT — отдельное согласование, backup, rollback, тесты.
4. Не читать UI из Prisma Device, пока пишет ops.

---

## 8. План по этапам

Каждый этап: код → тесты `apps/api/test` → короткий отчёт → **стоп на подтверждение**. Коммит/деплой только по просьбе.

### Этап 1. Архитектурные контракты *(сделано 2026-09-28)*

Ужесточить модель без MQTT.

- Согласовать `device.adapter` с `gateway.adapter` при register/bind.
- Запретить `confirmed: true` от `local`, если есть paired non-local gateway.
- Явные статусы команды в ответе API: accepted / queued / confirmed / failed.
- Quality на канале (не подменять пустое нулём).
- Убрать dual execute для wirenboard: cloud не вызывает WB execute.
- Пометить demo-сид.
- Тесты на эти инварианты.

**Критерии приёмки этапа 1**

1. Регистрация устройства на WB-шлюзе не ставит `adapter: "local"`.
2. Команда на такое устройство не подтверждается LocalGatewayAdapter.
3. Ответ API не говорит «сделано» без `confirmed: true`.
4. Для wirenboard cloud execute не вызывается (только очередь).
5. Канал без значения не показывается как 0.
6. Существующие RBAC-тесты зелёные; добавлены тесты инвариантов.
7. UI жителя не сломан (карточки, confirmed).

**Файлы этапа 1 (ожидаемые):**  
`device-registry.ts`, `gateway-adapter.ts`, `smart-home.ts`, `device-channels.ts`, `ops-store.ts` (типы), `apps/api/test/adapters.test.ts`, `device-channels.test.ts`, точечно UI статусов команды.

### Этап 2. Реальный локальный шлюз *(сделано 2026-09-29)*

- Агент: идентичность, heartbeat, версия, lastError.
- Apply команд (хотя бы http/echo + каркас MQTT publish).
- Ack sent/confirmed/failed.
- Буфер исходящих state при 5xx cloud (простой disk/memory queue).
- Документ `docs/STAR_HOME_GATEWAY_ARCHITECTURE.md` (актуальный, заменить Phase 0).

### Этап 3. Wiren Board + MQTT *(сделано 2026-09-29)*

- `mqtt` в gateway.
- Subscribe/discovery native topics.
- Телеметрия → ingest.
- `docs/STAR_HOME_WIREN_BOARD_MQTT.md`.

### Этап 4. Реальные команды *(сделано 2026-09-29)*

- Publish set + read-after-write / WB ack.
- Идемпотентность command id.
- Таймауты, retry cap.
- `docs/STAR_HOME_COMMAND_LIFECYCLE.md`.

### Этап 5. Диагностика *(сделано 2026-09-29)*

- Статусы, last contact, журнал обмена в админке.
- Тесты reconnect.

### Этап 6. Консоль специалиста *(сделано 2026-09-29)*

- Доработать `/admin/devices` (не новый продукт): проверка, время ответа, «передать жильцу».

### Этап 7. Локальная автоматизация *(сделано 2026-09-29)*

- Runtime сценариев на агенте; флаг `runtime`.
- Критические правила без облака.

### Этап 8. Камеры *(сделано 2026-09-29)*

- Отдельная модель `cameraMedia` / `cameraFrames`, ONVIF/HTTP кадр, медиашлюз на агенте, права, аудит просмотра.
- `docs/STAR_HOME_CAMERA_ARCHITECTURE.md`.
- Live HLS и облачный RTSP не делались. Железо камер не подтверждено.

### Этап 9. Производственная готовность *(сделано 2026-09-29)*

- Backup/restore снимков (`exportBackup` / `restoreBackup`), гейт `STAR_HOME_ALLOW_RESTORE=1` + фраза `RESTORE`.
- Мониторинг агента: heartbeat `bufferLag` / `mqtt`, UI `/admin/devices`.
- `GET /api/health` без сессии.
- Security tests: token не в export, restore без флага 403.
- План Prisma (`docs/STAR_HOME_PRISMA_PLAN.md`) — **не** миграция SoT.
- `docs/STAR_HOME_DEPLOYMENT_GUIDE.md`, `STAR_HOME_GATEWAY_SECURITY.md`, `STAR_HOME_TEST_PLAN.md`.

Документы `STAR_HOME_DEVICE_MODEL.md` и `STAR_HOME_COMMAND_LIFECYCLE.md` заполнены. JSON остаётся SoT.

---

## 9. Риски и зависимости

| Риск | Следствие | Митигация |
|------|-----------|-----------|
| Пилот требует железо/брокер | Этапы 3–4 нельзя закрыть только в CI | Разделить: софт проверен / железо не подтверждено |
| `local` в проде | Ложный успех | Этап 1: запрет на paired gateway |
| Dual execute | Гонка очередь vs cloud fail | Этап 1: один путь |
| Живая БД | Потеря демо-данных | Никакого seed wipe |
| Устаревшие docs | Ложные решения | Этот файл + audit — источник; старые пометить |
| SCHEDULE без cron | «Сценарий есть, не исполняется» | Честный статус; cron/агент на этапе 7 |
| Камеры рано | Размазывание фокуса | Жёсткий этап 8 |

Зависимости: существующий RPC, RBAC, канал `/gateways/channel`, снимок `ops`, Vercel embedded.

Не добавлять библиотеки в web без нужды. `mqtt` — только gateway.

---

## 10. Что нужно от вас для старта этапа 1

Подтвердите, пожалуйста:

1. Этап 1 (контракты, без MQTT) — **первый код** после этого документа.
2. Агент остаётся исходящим HTTPS; cloud MQTT **не** открываем.
3. JSON-снимки остаются SoT; этап 9 — план Prisma, не cutover.
4. Демо-`local` можно оставить для устройств **без** шлюза (текущий UX жителя на сиде), но не для пилотного WB.
5. Камеры не трогаем до этапа 8.
6. Консоль специалиста — развитие `/admin/devices`, не отдельное приложение.

После подтверждения начинается только этап 1, с тестами и остановкой.
