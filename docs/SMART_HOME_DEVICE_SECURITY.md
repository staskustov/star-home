# STAR HOME — Device Security

Backend — источник прав. Frontend object-filter на `/admin/devices` не является SoT.

## Роли и устройства

Права: `devices.view|command|create|edit|delete`, `engineering.view|command|edit`, `access.gate.open`. Отдельных `smart-home.*` нет.

| Роль | create / rebind | command | technical |
|------|-----------------|---------|-----------|
| SUPER / COMPANY / OBJECT_ADMIN | да | да | да при engineering.view |
| MANAGER | edit да, create нет | да | при engineering.view |
| SERVICE_OPERATOR | нет | нет | смотрит engineering |
| SECURITY | нет | нет (ворота через access.gate.open) | нет |
| RESIDENT / FAMILY | нет | LOW/MEDIUM | нет |
| GUEST | нет | нет | нет |

`registerDevice` / `updateDevice` / `removeDevice` — только staff + permission.  
`reaches(actor, device)`: компания + объект + unit scope. Чужая компания 404, своя вне scope 403.

Technical (`adapter`, `externalId`, `endpoint`, gateway, lastError) в `asCard` только staff + `engineering.view`. Житель topic не получает.

## Закрыто к этапу 6

- Resident не POST/PATCH/DELETE registry, не discover, не pair, не channel patch.
- IDOR по deviceId другого дома — 403/404.
- Duplicate `gatewayId + externalId` → 409.
- Object-level POWER/WATER/HEAT и `metadata.engineering` скрыты от жителя; ворота и погода остаются.
- Команда только через `commandDeviceSmart`. Канал `writable: false` или `enabled: false` не даёт command.
- HIGH: confirm + audit `DEVICE_COMMAND`.
- Cloud MQTT на чужой брокер запрещён (`broker-forbidden`).
- Токен шлюза — hash; plaintext один раз при pair.
- AI читает каналы только server-side (`room_climate`, `device_channels`). Нет `get_mqtt`. Команды AI идут в `commandDeviceSmart`.
- Audit: `DEVICE_DISCOVER`, `DEVICE_CREATE`, `DEVICE_EDIT` (в т.ч. пин плана), `DEVICE_CHANNEL_CHANGED`, `DEVICE_DELETE`, `DEVICE_COMMAND`.
- Удаление Device не cascade-стирает history.

## Правила

- Service видит engineering object-devices; resident — нет.
- AI: только server tools по уже отфильтрованному scope.
- Агент исполняет только подписанную очередь cloud, не входящий MQTT из интернета.
- `bindPlace` сверяет комнату с object и actor. Тело запроса не доверяем.

## Тесты

Resident discover 403; resident PATCH channel 403; house A не читает device house B; duplicate externalId; rebind сохраняет history; object engineering скрыт; writable:false не командует; AI климат/каналы без topic; `get_mqtt` отвергается.
