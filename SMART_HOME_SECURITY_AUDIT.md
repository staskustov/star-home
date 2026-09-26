# STAR HOME — Security audit (Phase 9)

Проверено тестами `rbac.test.ts`, `security.test.ts`, `adapters.test.ts`.

## Изоляция

- Чужая компания: device/gateway/scenario/command → 404, стор не меняется.
- Соседняя единица той же компании: команда 403/404.
- Жителю не отдаются endpoint, adapter, externalId.

## Команды

- LOW/MEDIUM: `devices.command` (житель и семья получили право).
- HIGH: `access.gate.open` или `engineering.command` + confirm token + аудит `DEVICE_COMMAND`.
- Нет capability → 400.
- OFFLINE не-local шлюз → не success.
- Лимит 20 команд / 60 с на пользователя и 10 / 60 с на устройство.
- Очередь шлюза: окно 15 мин, EXPIRED ack не применяет state.
- `smartHomeCommandLog` / `setDeviceFavorite` чужой компании → 404.

## AI

- Без `ai.use` — отказ (существующий контур).
- Действие без confirm не исполняется.
- HIGH после AI-confirm проходит тот же smart-confirm, не MQTT.

## Replay / injection

- Неизвестный RPC → 404, в том числе prototype names.
- Просроченный confirm token отбрасывается.
- Метод без записи в `methodPolicy` недоступен.

## Оставшийся риск

Полный Local Gateway binary и сетевой MQTT на объекте ещё не в проде. Пока адаптер не подтверждает удалённый брокер.
