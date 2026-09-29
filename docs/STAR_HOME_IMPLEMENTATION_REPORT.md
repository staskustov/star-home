# STAR HOME — отчёт о реализации

## Этап 1. Архитектурные контракты (2026-09-28)

Код написан после согласования. MQTT и агент apply **не** делались.

### Что сделано

1. Регистрация и привязка к шлюзу копируют `device.adapter` с `gateway.adapter`. Смена адаптера шлюза обновляет привязанные устройства.
2. Облако не вызывает Wiren Board `execute`: команда только в очередь. Ответ `accepted` / `queued`, `confirmed: false`.
3. `LocalGatewayAdapter` не подтверждает устройство на paired non-local шлюзе. `executeOnAdapter` для таких адаптеров возвращает `awaiting-gateway`.
4. Статусы API: `accepted` | `queued` | `confirmed` | `failed`. Текст «Команда выполнена.» только при `confirmed: true`.
5. Канал: `Number(null)` больше не становится `0`. Добавлен `quality` (`fresh` / `stale` / `unavailable` / `unknown` / `error`).
6. Сид устройств помечен `metadata.demo: true`. Уличная погода без показаний не подменяется константой 12.4.
7. JSON-снимки остаются SoT. Камеры не трогались.

### Файлы

- `apps/web/src/server/device-registry.ts`
- `apps/web/src/server/gateway-adapter.ts`
- `apps/web/src/server/smart-home.ts`
- `apps/web/src/server/device-channels.ts`
- `apps/web/src/server/ops-store.ts`
- `apps/web/src/server/engineering.ts`
- `apps/api/test/command-contracts.test.ts`
- `apps/api/test/adapters.test.ts`
- `apps/api/test/device-channels.test.ts`
- `apps/api/test/rbac.test.ts` (ожидание `queued`, честная пустая погода)

### Тесты

`npx tsx --test test/*.test.ts` в `apps/api`: **155 passed, 0 failed.**

### Критерии этапа 1

| № | Критерий | Результат |
|---|---------|-----------|
| 1 | WB-регистрация не ставит `adapter: local` | да |
| 2 | Команда на таком устройстве не подтверждается local | да |
| 3 | API не говорит «сделано» без `confirmed` | да |
| 4 | Cloud WB execute не вызывается | да |
| 5 | Пустой канал ≠ 0 | да |
| 6 | RBAC + новые инварианты зелёные | да |
| 7 | UI жителя: успех только по `confirmed` | без ломки контракта |

### Ограничения этапа 1 (сняты на 2–3)

Агент apply и MQTT LAN сделаны ниже. Пилот с железом по-прежнему не закрыт: live Wiren Board в этой среде не проверялся.

---

## Этапы 2 и 3. Агент apply + Wiren Board MQTT (2026-09-29)

### Этап 2

- Агент применяет команды: HTTP (confirm только при `confirmed: true`), echo/demo явно, MQTT publish.
- Ack: `confirmed` / `sent` / failed. SENT не пишет `device.state`.
- Heartbeat: `version`, `lastError`, DEGRADED если брокер отвалился.
- Pull отдаёт `externalId`, `endpoint`, `adapter`.
- Буфер исходящих при 5xx и обрыве сети.
- Повтор command id не публикует MQTT снова.

### Этап 3

- Пакет `mqtt` только в `apps/gateway`.
- Subscribe native `/devices/+/controls/+`, дедуп retained, discovery из кэша, fallback JSON.
- Телеметрия → `kind: state`.
- Чужой MQTT-хост запрещён.

### Тесты

- `apps/api`: канал SENT, lastError, прежние RBAC.
- `apps/gateway/test/gateway.test.ts`: apply, дедуп, broker URL, buffer.

### Не подтверждено на железе

Live-брокер Wiren Board, retained с контроллера, reconnect на объекте.

---

## Этап 4. Реальные команды (2026-09-29)

### Что сделано

1. После MQTT publish агент ждёт значение на control topic без `/on`. `confirmed` только при совпадении payload с сообщением **после** seq publish.
2. Retained/кэш до publish не подтверждает команду. Echo с тем же значением (duplicate) подтверждает, потому что seq топика растёт.
3. Таймаут: `STAR_HOME_WB_COMMAND_TIMEOUT_MS` (4000). Retry cap: `STAR_HOME_WB_COMMAND_RETRIES` (2 дополнительных, максимум 5 попыток).
4. `error: mqtt-timeout` → очередь FAILED, `device.state` не пишется. SENT + error тоже FAILED.
5. Command id: in-flight lock + запомненный результат (`command-once.ts`).
6. Версия агента: `agent-4`.

### Файлы

- `apps/gateway/apply.ts`, `topic-cache.ts`, `command-once.ts`, `agent.ts`
- `apps/web/src/server/gateway-queue.ts`
- `docs/STAR_HOME_COMMAND_LIFECYCLE.md`, `STAR_HOME_WIREN_BOARD_MQTT.md`

### Тесты

- `apps/gateway`: echo confirm, stale timeout, retries, wait-after-seq, command-once.
- `apps/api`: SENT без state; timeout → FAILED.

### Не подтверждено на железе

Live echo Wiren Board, задержка контроллера, физический retained.

---

## Этап 5. Диагностика (2026-09-29)

### Что сделано

1. Админка `/admin/devices`: статус шлюза по-русски, версия агента, last contact («только что» / «N мин назад»), ошибка без сырых кодов.
2. Журнал обмена канала: heartbeat / pull / ack / state в `gatewayExchanges`, без токенов.
3. Нет heartbeat 90 с при известном `lastSeen` → `OFFLINE` + `heartbeat-stale`. Команда на такой шлюз уходит в очередь.
4. MQTT: повторный subscribe после reconnect, статус DEGRADED пока reconnecting. Версия `agent-5`.
5. Тест reconnect на фейковом клиенте, без живого брокера.

### Файлы

- `apps/web/src/server/gateway-contact.ts`, `gateway-channel.ts`, `ops-view.ts`
- `apps/web/src/components/admin/OpsDesk.tsx`, `DeviceDetail.tsx`
- `apps/gateway/mqtt-session.ts`, `agent.ts`

### Тесты

- `apps/api`: journal heartbeat, expire stale, format last contact.
- `apps/gateway`: resubscribe после offline, publish после reconnect.

### Следующий этап

Этап 6: консоль специалиста на `/admin/devices` — проверка с временем ответа, «передать жильцу».

---

## Этап 6. Консоль специалиста (2026-09-29)

### Что сделано

1. `/admin/devices` и карточка устройства: кнопка «Проверка» вместо «Тест». Ответ `N мс · подтверждено` или `N мс · нет ответа`.
2. `probeDevice` (staff `devices.command`): измеряет `elapsedMs`. Local/http — длительность `executeOnAdapter`. WB/mqtt — очередь и ожидание ACKED, без фальшивого `confirmed`.
3. «Передать жильцу» / «Забрать у жильца». Новая регистрация: `metadata.handedOver: false`. Без флага (сид) житель видит как раньше. Передача только после `lastProbeResult === confirmed`.
4. Житель не видит устройство, пока `handedOver === false`. Frontend не SoT.

### Файлы

- `apps/web/src/server/device-commission.ts`, `device-kinds.ts`, `device-registry.ts`
- `apps/web/src/components/admin/OpsDesk.tsx`, `DeviceDetail.tsx`
- `apps/api/test/device-commission.test.ts`

### Тесты

Проверка с `elapsedMs`, таймаут WB, ack, скрытие до передачи, сид без флага виден.

### Не подтверждено на железе

Live Wiren Board probe round-trip на объекте.

### Следующий этап

Этап 7–8 закрыты ниже. Этап 9: производственная готовность.

---

## Этап 7. Локальная автоматизация (2026-09-29)

### Что сделано

1. Сценарий несёт `runtime: "cloud" | "gateway"`. Нет поля — облако. EVENT/SCHEDULE на одном не-local шлюзе получают `gateway` при создании.
2. Облако не исполняет EVENT / SCHEDULE / LIFE_MODE со `runtime: gateway`. Ручной запуск ставит в очередь `runScenario` с `deviceId = scenario.id`, `confirmed: false`.
3. Pull отдаёт пакет автоматизаций. Агент `agent-6` исполняет EVENT по фронту, SCHEDULE раз в календарный день, критические leak→клапан и smoke/fire→свет с повтором 60 с, без облака.
4. Отчёт `kind: automation` идемпотентен по `runId`. 5xx/обрыв — существующий outbound buffer.
5. UI: «в облаке» / «на шлюзе» / «шлюз не исполняет». Нет «работает», если шлюз не исполняет.
6. HIGH пропускается у пользовательских EVENT/SCHEDULE, не у критических правил.

### Файлы

- `apps/web/src/server/automation.ts`, `scenarios.ts`, `ops-store.ts`, `gateway-channel.ts`
- `apps/gateway/local-runtime.ts`, `agent.ts`, `wb-controls.ts`
- `apps/web/src/components/home/ScenarioList.tsx`
- `apps/api/test/automation.test.ts`, `apps/gateway/test/gateway.test.ts`

### Тесты

Infer gateway, облако не гоняет gateway EVENT, очередь `runScenario`, pack + critical, ingest по `runId`, rising-edge, SCHEDULE раз в день, HIGH skip / critical close.

### Не подтверждено на железе

Локальный runtime на живом Wiren Board без интернета.

### Следующий этап

Этап 8 — камеры.

---

## Этап 8. Камеры (2026-09-29)

### Что сделано

1. Поток камеры — `ops.cameraMedia` / последний JPEG в `ops.cameraFrames`, не сенсорные каналы. Prisma не SoT.
2. Медиашлюз — локальный агент. Облако не ходит на LAN-камеру. Браузер не получает RTSP и пароль.
3. Агент снимает JPEG: HTTP snapshot, ONVIF GetProfiles+GetSnapshotUri. RTSP без snapshotUrl → `rtsp-live-unsupported`. Нет live HLS. Echo не рисует кадр.
4. Подтверждение только если JPEG `FF D8 FF` и 32…400000 байт. Сид без потока: 200, `confirmed: false`. OFF/FAULT: 409.
5. Staff `cameraFrame`; житель — `GET/POST /api/smart-home/cameras/{id}/frame`. Аудит `CAMERA_VIEW` / `CAMERA_EDIT`. Объектные CAMERA видны жителю как ворота.
6. UI: честный текст «Видеопоток не подключён», кадр только из session JPEG. Настройка потока в `/admin/devices`.

### Файлы

- `apps/web/src/server/camera-media.ts`, `ops-store.ts`, `gateway-channel.ts`, `security-post.ts`
- `apps/gateway/camera-capture.ts`, `agent.ts`, `apply.ts`
- `apps/web/src/components/home/CameraBlock.tsx`, `components/security/CameraTile.tsx`, `components/admin/DeviceDetail.tsx`
- `apps/api/test/camera.test.ts`, `apps/gateway/test/gateway.test.ts`
- `docs/STAR_HOME_CAMERA_ARCHITECTURE.md`

### Тесты

Сид без потока не подтверждает кадр; бухгалтер 403; OFF 409; пароль только в pack агенту; ingest один JPEG; объектная CAMERA видна; HTTP/ONVIF JPEG; RTSP без URL; не-JPEG; echo без кадра.

### Не подтверждено на железе

ONVIF/RTSP камера в LAN объекта.

### Следующий этап

Этап 9 — производственная готовность.

---

## Этап 9. Производственная готовность (2026-09-29)

### Что сделано

1. Heartbeat агента передаёт `bufferLag` и `mqtt` (`up`/`down`/`none`). Админка: «очередь N», «MQTT» / «MQTT нет». Протокол остаётся `agent-6`.
2. Export пяти снимков (`catalog`, `people`, `ops`, `life`, `audit`), RPC `exportBackup` / GET `/api/admin/backup`, право `audit.export`. Pairing token в файле нет.
3. Restore только при `STAR_HOME_ALLOW_RESTORE=1` + `confirm: "RESTORE"` + `settings.company.edit`. На production флаг не задаётся.
4. `GET /api/health` без сессии: `{ ok, runtime }`. Канал шлюза и health публичны в proxy; секрет канала — токен.
5. Prisma не стала SoT. План: `docs/STAR_HOME_PRISMA_PLAN.md`.
6. Документы: `STAR_HOME_DEPLOYMENT_GUIDE.md`, `STAR_HOME_GATEWAY_SECURITY.md`, `STAR_HOME_TEST_PLAN.md`.

### Файлы

- `apps/web/src/server/ops-backup.ts`, `ops-store.ts`, `gateway-channel.ts`, `rpc-handlers.ts`, `life-modes.ts`
- `apps/web/src/app/api/health/route.ts`, `app/api/admin/backup/route.ts`, `proxy.ts`
- `apps/web/src/components/admin/BackupPanel.tsx`, `OpsDesk.tsx`
- `apps/gateway/agent.ts`
- `apps/api/test/production.test.ts`, `adapters.test.ts`
- `docs/STAR_HOME_DEPLOYMENT_GUIDE.md`, `STAR_HOME_PRISMA_PLAN.md`, `STAR_HOME_GATEWAY_SECURITY.md`, `STAR_HOME_TEST_PLAN.md`

### Тесты

Export 5 снимков; plaintext token отсутствует; `listGateways` без tokenHash; бухгалтер/object admin 403 export; restore без env 403; без RESTORE 400; с флагом применяется; heartbeat bufferLag/mqtt.

### Не подтверждено на железе

Live-агент на объекте, MQTT/камеры. Restore на production не включался.

### Следующий этап

Этапы 1–9 в софте закрыты. Дальше только по отдельной просьбе: Prisma cutover, mutual TLS, live HLS, пилот на железе.


