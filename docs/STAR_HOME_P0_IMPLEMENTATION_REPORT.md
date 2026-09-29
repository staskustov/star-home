# STAR HOME — отчёт реализации P0

Дата: 2026-09-29  
Ветка: текущая рабочая (без commit/deploy — не запрашивались).

Правило статусов: **SOFTWARE VERIFIED**. Физический Wiren Board, реле и ONVIF **не подключались**. Пилот железа: `docs/STAR_HOME_REAL_HARDWARE_PILOT.md`.

---

## 1. Что было найдено (Phase 0)

См. `docs/STAR_HOME_P0_ANALYSIS.md`. Кратко:

- Ворота: `operations.commandDevice` → `runDevice` → `executeOnAdapter`, **без очереди**.
- Smart-home remote уже шёл в `enqueueGatewayCommand`.
- `LocalGatewayAdapter.execute` возвращал `confirmed: true` без железа.
- Сид `adapter: "local"` + погода 12.4 °C + камеры `work: "ON"` выглядели как live.
- MQTT echo в TEST-режиме закрывал команду; это не физическое подтверждение.

Архитектура была однозначна: не тащить ворота через HIGH-confirm `commandDeviceSmart`; после `access.gate.open` использовать тот же `dispatchPhysicalCommand`.

---

## 2. Что исправлено

| P0 | Решение |
|----|---------|
| Ворота обходили очередь | `operations.commandDevice` → `dispatchPhysicalCommand`. Remote → queue. Access RBAC и отсутствие второго confirm сохранены. |
| Два пути физических команд | Общий `apps/web/src/server/physical-command.ts`. `commandDeviceSmart` после RBAC тоже его вызывает. |
| Ложный success local adapter | `NODE_ENV=production` без `STAR_HOME_ALLOW_DEMO=1` → `demo-adapter-forbidden`, audit `DEMO_ADAPTER_FORBIDDEN`, `confirmed: false`. |
| Demo seed как live | `source` REAL / DEMO / MOCK / UNKNOWN. Сид local без gateway = DEMO. UI: «демо» / «симулятор». Погода в production не заполняется статикой. |
| Камеры «На связи» | `homeSignals`: без `cameraMedia.host` → «Не подключена», не «На связи». |
| Command vs state | Remote не пишет latch/on до ACKED/ingest. CONFIRMED по `ack.confirmed` или `confirmCommandsFromState`. |
| Lifecycle | Поверх очереди: ACCEPTED / DELIVERED / CONFIRMED / FAILED / TIMEOUT. Без destructive migration. |
| Idempotency | PENDING схлопывается по gateway+device+command+**value**. Агент `command-once` без изменений. |
| MQTT REAL vs TEST | `STAR_HOME_MQTT_CONFIRM=echo` (default, тесты) vs `state` (пилот: echo ≠ CONFIRMED). Брокер: localhost + RFC1918; публичный — forbidden. |
| Simulator | `apps/gateway/simulator.ts`, adapter `simulator`. **SIMULATOR VERIFIED ≠ PHYSICAL**. |
| Gateway vs device | Heartbeat CONNECTING/ERROR. Device OFFLINE без telemetry при Gateway ONLINE. |
| Stale telemetry | Channel quality GOOD / STALE / UNKNOWN. Нет подмены отсутствующего значения нулём. |
| Production guard | Один `productionRuntime()` / `demoExecutionAllowed()` в `runtime-mode.ts`. |
| Audit | commandId, requested, gateway, lifecycle в `reason`. |
| UI | Toast «Открыто» только после `confirmed`. Source для специалиста и метка демо жителю. |

---

## 3. Файлы

Новые:

- `docs/STAR_HOME_P0_ANALYSIS.md`
- `docs/STAR_HOME_REAL_HARDWARE_PILOT.md`
- `docs/STAR_HOME_P0_IMPLEMENTATION_REPORT.md` (этот файл)
- `apps/web/src/server/runtime-mode.ts`
- `apps/web/src/server/physical-command.ts`
- `apps/web/src/server/command-lifecycle.ts`
- `apps/gateway/simulator.ts`
- `apps/api/test/p0-lifecycle.test.ts`

Изменённые (основные): `operations.ts`, `smart-home.ts`, `gateway-adapter.ts`, `gateway-queue.ts`, `gateway-channel.ts`, `ops-store.ts`, `device-registry.ts`, `device-channels.ts`, `gateway-contact.ts`, `audit-actions.ts`, `ops-view.ts`, `dashboard.ts`, `apply.ts`, `agent.ts`, `broker-url.ts`, UI access/home/admin/camera, `apps/gateway/README.md`, `apps/api/test/device-channels.test.ts`, `apps/gateway/test/gateway.test.ts`.

---

## 4. Архитектурные решения

1. Access API остаётся точкой входа ворот; physical delivery унифицирована.
2. Существующие статусы очереди не дублировались второй таблицей.
3. TEST MQTT (echo) сохранён, чтобы не ломать 26 gateway-тестов. REAL = `STAR_HOME_MQTT_CONFIRM=state`.
4. Демо в non-production сохранён для сида и существующих 195 API-тестов.

---

## 5. Тесты

Добавлено:

- API `P0 command lifecycle` — 14 тестов (очередь, ворота, прямой adapter, production demo, REAL/DEMO, lifecycle, timeout, idempotency, gateway/device offline, stale, confirm state, unauthorized, cross-object).
- Gateway: simulator; MQTT confirm=state не считает echo CONFIRMED; LAN broker allow / public deny.
- Существующий channel-тест: quality `UNKNOWN`.

Прогон 2026-09-29 (in-memory, без Neon, без брокера объекта):

- `cd apps/api && ./node_modules/.bin/tsx --test test/*.test.ts` → **195 passed, 0 failed** (было 181 + P0 и ранее добавленные stage-тесты).
- `cd apps/gateway && ./node_modules/.bin/tsx --test test/*.test.ts` → **26 passed, 0 failed** (было 24).

---

## 6. Что не проверено физически

- Wiren Board в LAN
- Переключение реле
- ONVIF / RTSP поток
- Агент на объекте без интернета (длительно)
- Production deploy этого P0 (не запрашивался)

---

## 7. Что осталось для физического пилота

Выполнить `docs/STAR_HOME_REAL_HARDWARE_PILOT.md` Test 1–12 на объекте. Пока PASS нет — не писать «Wiren Board работает».

Опционально позже (не P0): UI создания шлюза, полный ONVIF, LIFE_MODE на агенте, cloud cron.

---

## 8. Оставшиеся риски

- Production с `STAR_HOME_ALLOW_DEMO=1` снова включает local confirm (явный override).
- Echo-default на агенте, если забыть `STAR_HOME_MQTT_CONFIRM=state`, даст protocol confirm без ingest. Для пилота env обязателен.
- Сид в test/dev по-прежнему подтверждает local-команды — это DEMO, не REAL.
- Heartbeat не доказывает реле; только telemetry + физическое наблюдение.

**Итог:** софт готов к **controlled physical hardware pilot**. Состояние **не** PHYSICAL HARDWARE VERIFIED.
