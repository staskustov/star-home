# STAR HOME — камеры

Дата: 2026-09-29  
Статус: этап 8 в коде. Live HLS / RTSP в браузере **нет**. Железо ONVIF/RTSP на объекте **не подтверждено**.

## Роль

Камера — устройство `kind: CAMERA`, но поток **не** сенсорный канал. Конфиг потока и последний JPEG живут отдельно в снимке `ops`:

| Поле | Назначение |
|------|------------|
| `ops.devices` | Камера как устройство: место, шлюз, работа ON/OFF/FAULT |
| `ops.cameraMedia` | Протокол, адрес, URL кадра, логин/пароль |
| `ops.cameraFrames` | Один последний JPEG на камеру, не больше 80 кадров всего |

Prisma Device не является SoT потока. Браузер не получает RTSP, ONVIF URL с паролем и не ходит на камеру в LAN.

## Контур

```
Житель / охрана / специалист
        ↓  сессия, RBAC  security.camera.view
Cloud  requestCameraFrame
        ↓  очередь captureFrame + media (пароль только здесь)
HTTPS канал шлюза  pull.cameras / ack.frame / kind: camera
        ↓
Агент на объекте  (медиашлюз)
        ↓  HTTP JPEG: http-snapshot | ONVIF GetSnapshotUri | RTSP только если есть snapshotUrl
Камера в LAN
        ↓  JPEG FF D8 FF, 32…400000 байт
Cloud ingest → GET /api/smart-home/cameras/{id}/frame
```

Облако **не** скачивает LAN-камеры, даже если адаптер `http`. Echo/demo **не** рисует JPEG.

## Протоколы этого этапа

| protocol | Что делает агент |
|----------|------------------|
| `http-snapshot` | GET `snapshotUrl` (обязателен, только http(s), без `user:pass@`) |
| `onvif` | SOAP GetProfiles + GetSnapshotUri, затем GET JPEG |
| `rtsp` | Без `snapshotUrl` → `rtsp-live-unsupported`. Live HLS нет |

Подтверждение кадра: агент вернул JPEG с магией `FF D8 FF` и облако сохранило кадр. Иначе `confirmed: false`.

## Права и API

- Staff RPC `cameraFrame` — `security.camera.view`. Бухгалтер — 403.
- Житель с тем же правом: `POST/GET /api/smart-home/cameras/{id}/frame` (сессия). RTSP в ответе нет.
- Настройка потока: `updateCameraMedia` / `POST /api/smart-home/devices/{id}/camera` — `devices.edit`. Аудит `CAMERA_EDIT`.
- Просмотр: аудит `CAMERA_VIEW`.
- Камера OFF/FAULT → 409. Сид без `cameraMedia` → 200, `confirmed: false`, «Камера не подключена к потоку.»
- Объектные камеры (`unitId: null`, kind CAMERA) видны жителю как ворота и погода, если не `handedOver: false`.

`listDevices` / home отдают `hasPassword`, не пароль. Pull агенту отдаёт пароль в `cameras[]`.

## Таймаут

`STAR_HOME_CAMERA_TIMEOUT_MS` — ожидание ACK (по умолчанию 8000, не больше 20000).

## Файлы

- `apps/web/src/server/camera-media.ts`, `ops-store.ts`, `gateway-channel.ts`
- `apps/web/src/app/api/smart-home/cameras/[id]/frame/route.ts`
- `apps/gateway/camera-capture.ts`, `agent.ts`
- `apps/web/src/components/home/CameraBlock.tsx`, `components/security/CameraTile.tsx`, `components/admin/DeviceDetail.tsx`

## Не в этом этапе

Live RTSP/HLS, облачный прокси видео, фейковый JPEG, Prisma SoT камер (план, не миграция), mutual TLS.
