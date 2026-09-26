# STAR HOME — Smart Home Security Model

Статус: **Phase 31–52. Replay window, journal, rate на устройство. TECHNICAL_ADMIN не вводили.**

База: `ADMIN_SECURITY_MODEL.md`, `ADMIN_RBAC_ARCHITECTURE.md`, `ADMIN_PERMISSION_MATRIX.md`.
Новую систему пользователей не создаём.

## 1. Цепочка каждой команды

```
Authentication
  → Authorization (permission + риск)
    → Object scope
      → Unit scope
        → Device belongs to that chain
          → Capability / validation
            → HIGH: confirmation
              → Gateway
                → Device
                  → Audit + live
```

`deviceId` из запроса не доказывает право. Сервер резолвит устройство и проверяет `reaches`.
Frontend `canCommand` — только отображение.

## 2. Права: что есть и что меняем

Уже есть: `devices.view/command/create/edit/delete`, `engineering.*`, `access.gate.open`, `access.points.manage`, `ai.use`.

| Роль | Сейчас | Для умного дома |
| --- | --- | --- |
| RESIDENT / FAMILY | `devices.view`, ворота через `access.gate.open` | + `devices.command` **только LOW/MEDIUM** на своей единице + object-level, которые unit видит сейчас (`unitId` свой или null) |
| GUEST | нет устройств | без команд |
| SECURITY | `devices.view`, ворота, камеры | команды только opener / alarm / camera frame; свет и климат чужого дома — нет |
| SERVICE_OPERATOR | `devices.view`, `engineering.view` | технический просмотр; команды — после явной выдачи `engineering.command` |
| MANAGER | `devices.command/edit` | LOW/MEDIUM объекта; HIGH — как сейчас через access, не клапаны без права |
| OBJECT_ADMIN / COMPANY_ADMIN | почти всё | реестр шлюзов, комнаты, техника, HIGH с аудитом |
| TECHNICAL | отдельной роли нет | не вводим `TECHNICAL_ADMIN` в Phase 1. Техконсоль: `engineering.view` + `devices.create/edit` у админов объекта/компании |

Новых ролей в Phase 1–6 нет. Если понадобится узкий техник — отдельное подтверждение, запись в матрицу.

Житель **не получает** `devices.create`. Подключение устройств — админ / техконсоль.

## 3. Уровни риска команд

| Риск | Примеры | Право | Confirm | Аудит |
| --- | --- | --- | --- | --- |
| LOW | свет, яркость, шторы | `devices.command` | нет | событие, не обязательно полный audit |
| MEDIUM | уставка климата, вентиляция, розетка | `devices.command` | нет (пока) | событие |
| HIGH | ворота, калитка, замок, клапан воды, авария, инженерное включение | `access.gate.open` для opener; иначе `engineering.command` + не `ai` без confirm | да | всегда `AuditRecord` |

AI не выполняет HIGH без policy + permission + confirm. Как текущий `open_gate`.

Life mode «Я уехал» не закрывает воду и не открывает ворота без тех же правил.

## 4. Изоляция multi-tenant

Тесты уже проверяют чужой `objectId` (ворота, точки доступа, unit). Тот же шаблон:

- House A не читает и не командует House B
- компания A → 404 на id компании B
- scope BUILDING не видит чужие квартиры
- `unitId: null` (общие ворота) виден охране объекта и жителям этого объекта по текущим правилам `homeSignals` / `accessPoint`, не жителям другого объекта

## 5. Шлюз

- Токен шлюза ≠ сессия пользователя.
- Отзыв токена шлюза немедленно рвёт канал.
- Replay: `commandId` + окно времени.
- Rate limit команд на device/user (рядом с login throttle).
- `internalAddress` и секреты брокера — только технический ответ, не `home()`, не AI.

## 6. Данные жителю vs технику

| Поле | Житель | Техконсоль |
| --- | --- | --- |
| name, room, state, availability | да | да |
| lastSeen, stale | да, по-человечески | да + ISO |
| externalId, topic, endpoint, IP | нет | да |
| lastError, adapter log | нет | да |

Ошибка жителю: «Устройство недоступно», «Не удалось подтвердить». Не «MQTT timeout 500ms».

## 7. Аудит HIGH

Пишем как существующий `AuditRecord`:

- user, role, membership
- company, object, unit
- device, command, value
- result SUCCESS / DENIED / ERROR
- source APP / ADMIN / AI / SCENARIO
- ip, device

Новые action codes (Phase 3): `DEVICE_COMMAND`, `GATEWAY_SYNC`, плюс существующие `OPEN_GATE`, `CLOSE_GATE`, `DEVICE_POLL`.

## 8. Честность состояния

Нельзя:

- подставлять климат, если reading нет
- показывать stale как live
- отвечать AI выдуманной температурой
- считать команду выполненной без `confirmed` адаптера

Можно:

- показать последнее известное + время
- пустое «нет показаний»

Это продолжение правила продукта: не фейкать датчики, камеры, банк, GPT.

## 9. Риски модуля

1. Выдать жителю `devices.command` без проверки unit.
2. Общий HTTP endpoint устройства, доступный из браузера напрямую.
3. Local Gateway без аутентификации.
4. Сценарии, обходящие HIGH policy.
5. Логи MQTT в ответе `/home`.
