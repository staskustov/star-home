# STAR HOME — план унификации Prisma (не миграция)

Дата: 2026-09-29  
Статус: **план этапа 9. JSON-снимки остаются SoT. Код чтения UI из Prisma Device не переключался.**

Этот документ не разрешает cutover. Миграция Prisma→SoT — отдельное согласование, backup, rollback, тесты.

## Как сейчас

| Слой | Роль |
|------|------|
| `Snapshot` (`id` = `catalog` \| `people` \| `ops` \| `life` \| `audit`) | **SoT.** Весь продукт читает JSON через `store-bind` / `readOps` |
| Prisma `Device`, `DeviceState`, `User`, `AuditLog`, … | проекция после ответа (`projectSnapshot` в `after()`), отчёты и совместимость схемы |
| UI / RPC / агент | читают снимки, не Prisma Device |

Проекция `ops` неполная: нет таблиц Gateway, Channel, Scenario, CameraMedia, CameraFrame, очереди команд. `Device` без `gatewayId`, `externalId`, `channels`, `availability`. Extra-поля намеренно живут только в JSON.

Запись в Prisma не является подтверждением команды и не источник кадра камеры.

## Почему не cutover в этапе 9

1. Пилот держится на одном JSON на контур: backup — пять blob, restore атомарнее, чем десятки таблиц.
2. Каналы, качество, очередь, камеры, сценарии `runtime` ещё не смоделированы в schema.
3. Двойное чтение (часть UI из Prisma, часть из ops) даст ложный успех и расхождение.
4. Живую Postgres нельзя reseeding-ить; ошибка миграции бьёт КП «Сияние».

## Целевое состояние (когда согласуют отдельно)

1. Схема покрывает Gateway, Channel, Command, CameraMedia без потери JSON-полей (`metadata Json` или отдельные таблицы).
2. Период dual-write: RPC пишет Snapshot **и** Prisma в одной транзакции; UI всё ещё читает Snapshot.
3. Тесты: каждый write-RPC сверяет проекцию; backup/restore прогоняется до cutover.
4. Cutover чтения: один флаг, выключаемый; rollback = снова читать Snapshot (снимки не удалять минимум один релиз).
5. Только после стабильного чтения — сужение JSON (не наоборот).

## Критерии, без которых cutover не начинать

- Полный backup `star-home-backup` v1 и проверенный restore на копии БД.
- Нет UI-пути, который читает `prisma.device` для карточки жителя или кадра.
- Проекция Gateway + Channel + cameraMedia круглая (запись = чтение).
- Нагрузочно: advisory lock embedded-режима и размер `ops` JSON оценены.
- План отката письменно, окно согласовано.

## Что делать сейчас

- Новые поля устройства/шлюза/камеры — в JSON снимка.
- Prisma-модель расширять только если нужна проекция для отчёта, без смены SoT.
- Не импортировать `@prisma/client` в компоненты.
- Restore пишет снимки целиком; проекция пересчитается штатным `projectSnapshot`.

Связанные файлы: `apps/api/prisma/schema.prisma`, `apps/web/src/server/persistence/embedded.ts`, `project.ts`, `ops-store.ts`, `ops-backup.ts`.
