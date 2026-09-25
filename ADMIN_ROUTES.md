# STAR HOME — Admin Routes

Статус: **проект маршрутов. Существующие пути не переименовываются, чтобы не ломать ссылки.**

## 1. Консоли

| Консоль | Префикс | Кто | Приоритет информации |
| --- | --- | --- | --- |
| Resident | `/home`, `/access`, `/rooms`, `/devices`, `/service`, `/profile`, `/my-objects` | RESIDENT, FAMILY_MEMBER | Мой дом в порядке? |
| Guest | `/guest` | GUEST | Мой пропуск |
| Admin | `/admin/*` | SA, CA, OA, MG, SO, AC | Объект в порядке? Что требует внимания? |
| Security | `/admin/*` в урезанном виде; позже `/security/*` | SECURITY | Кто у ворот, тревоги, камеры |

Resident app в этом этапе не меняется.

## 2. Навигация Admin Console

Пункт показывается, только если у активной membership есть право из колонки «Право для показа».

| # | Пункт | Путь | Право для показа | Статус |
| --- | --- | --- | --- | --- |
| 1 | Обзор | `/admin` | `dashboard.view` | есть, переделать (Phase A) |
| 2 | Посёлок* | `/admin/objects`, `/admin/objects/[id]` | `objects.view` | есть |
| 3 | Жители | `/admin/residents` | `residents.view` | есть |
| 4 | Доступ | `/admin/access` | `access.view` | есть |
| 5 | Пост охраны | `/security` (отдельный экран; `/admin/security` перенаправляет туда) | `security.view` | есть |
| 6 | Заявки | `/admin/requests` | `service.view` | есть |
| 7 | Платежи | `/admin/payments` | `payments.view` | есть |
| 8 | Инженерия | `/admin/engineering` | `engineering.view` | есть |
| 9 | Устройства | `/admin/devices` | `devices.view` | есть |
| 10 | AI | `/admin/ai` | `ai.view` | есть |
| 11 | Команда | `/admin/team` | `users.view` | **новый** (Phase B) |
| 12 | Роли и права | `/admin/roles` | `roles.view` | **новый** (Phase C) |
| 13 | Журнал действий | `/admin/audit` | `audit.view` | есть (Phase E) |
| 14 | Настройки | `/admin/settings` | `settings.view` | есть |

\* Подпись зависит от типа выбранного объекта: КП → «Посёлок», ЖК / апарт-комплекс → «Комплекс», дом → «Дом». Путь один.

Группы в сайдбаре, чтобы 14 пунктов читались:

- **Объект:** Обзор, Посёлок, Жители.
- **Операции:** Доступ, Пост охраны, Заявки, Платежи.
- **Системы:** Инженерия, Устройства, AI.
- **Управление:** Команда, Роли и права, Журнал действий, Настройки.

Пустая группа не показывается.

### 2.1 Что видит роль

| Роль | Пункты |
| --- | --- |
| SA, CA | все 14 |
| OA | все, кроме изменения ролей (страница ролей только для чтения) |
| MG | Обзор, Посёлок, Жители, Доступ, Охрана, Заявки, Платежи, Инженерия, Устройства, Настройки |
| SE | Обзор, Посёлок, Жители, Доступ, Охрана, Устройства, Журнал (ACCESS, SECURITY) |
| SO | Обзор, Посёлок, Жители, Заявки, Инженерия, Устройства |
| AC | Обзор, Посёлок, Жители, Платежи |

### 2.2 Защита страниц

`guardPath` получает таблицу `путь → право`. Нет права → редирект на `/admin` (или на `destinationFor`, если нет и `dashboard.view`). Это только UX. Данные страницы всё равно приходят из RPC с проверкой.

## 3. RPC-методы

Колонка «Target» — откуда берётся проверяемый объект. `session` — только из подписанной сессии, `input.*` — недоверенный параметр, который сверяется со scope.

### 3.1 Существующие методы

| Метод | Право | Target | Изменение |
| --- | --- | --- | --- |
| `admin` | `dashboard.view` | scope | + `sections[]`, `permissions[]` активной роли |
| `ops` | право раздела | scope | **фильтр по scope** (P1); разбить на `opsAccess`, `opsSecurity`, `opsRequests`, `opsPayments`, `opsDevices`, `opsAi`, чтобы каждый отдавал только своё |
| `tree` | `objects.view` | `input.objectId` | без изменений логики |
| `createObject` | `objects.create` | company | + аудит |
| `updateObject` | `objects.edit` | `input.objectId` | + аудит |
| `removeObject` | `objects.delete` | `input.objectId` | + аудит |
| `createBuilding`, `removeBuilding`, `createUnit`, `removeUnit` | `objects.structure.edit` | `input.objectId` / `buildingId` / `unitId` | + аудит |
| `residents` | `residents.view` | scope | маска полей по праву |
| `addResident` | `residents.create` | `input.unitId` | + аудит |
| `removeResident` | `residents.delete` | membership → unit | отзыв membership, User не удаляется (P7) |
| `settings` | `settings.view` | scope | — |
| `saveMode` | `settings.edit` | `input.objectId` | + аудит с изменениями |
| `openObjectGate` | `access.gate.open` | `input.objectId` | реальная роль в аудите (P5) |
| `cameraFrame` | `security.camera.view` | `input.objectId` | — |
| `setRequestStatus` | `service.edit` | request → object | — |
| `openGate`, `openPoint` | `access.gate.open` | unit из сессии | — |
| `addPass` | `access.pass.create` | unit из сессии | — |
| `addRequest` | `service.create` | unit из сессии | — |
| `pay` | `payments.pay` | unit из сессии | — |
| `alarm` | `security.alarm.raise` | unit из сессии | — |
| `switchMode` | `home.mode.switch` | unit из сессии | + аудит |
| `home`, `access`, `requests`, `places`, `profile`, `guest` | `home.view` / `guest.pass.view` | сессия | без изменений |
| `ask`, `confirm` | `ai.use` + право инструмента | сессия | инструмент проверяется своим правом |
| `login` | публичный | — | + `lastLoginAt`, аудит AUTH, отказ для BLOCKED |
| `destination`, `guard`, `switch` | сессия | — | учитывают `status` и права |

### 3.2 Новые методы

| Метод | Право | Target | Фаза |
| --- | --- | --- | --- |
| `dashboard` | `dashboard.view` | `input.objectId` ⊂ scope или весь scope | A |
| `team` | `users.view` | scope | B |
| `teamAdd` | `users.create` + `users.role.assign` + `users.scope.assign` | `input.scope` ⊂ scope actor | B |
| `teamEdit` | `users.edit` | user в scope | B |
| `teamRole` | `users.role.assign` | membership в scope, ранг | B |
| `teamScope` | `users.scope.assign` | новый scope ⊂ scope actor | B/D |
| `teamBlock`, `teamRestore` | `users.block` | user в scope | B |
| `teamRemove` | `users.delete` | membership в scope | B |
| `roles` | `roles.view` | company | C |
| `rolesSave` | `roles.edit` | company, потолок ранга | C |
| `audit` | `audit.view` | scope, фильтр категорий | E |
| `auditExport` | `audit.export` | scope | E |
| `securityPost` | `security.view` | объект ⊂ scope; камеры — `camera.view`, гости и события — `access.view`, журнал — `audit.view` | пост |
| `securityCameras` | `security.view` + `security.camera.view` | камеры объекта в досягаемости, без остальных данных поста | пост |
| `handleAlarm` | `security.alarm.handle` | alarm → object, досягаемость корпуса; OPEN → ACCEPTED → CLOSED | пост |
| `openObjectPoint` | `access.gate.open` | только общие точки объекта, без квартирных замков | пост |
| `checkPass` | `access.view` | пропуска объекта в досягаемости | пост |
| `engineering` | `engineering.view` | scope | инженерия |
| `pollDevice` | `engineering.command` | устройство объекта в досягаемости, не выведено из работы | инженерия |
| `setDeviceWork` | `engineering.edit` | устройство объекта в досягаемости | инженерия |
| `passRevoke` | `access.pass.revoke` | pass → unit/object | D |

Неизвестный метод → 404. Метод без записи в `methodPolicy` → 403 и запись `DENIED`. Так новый метод не откроется случайно.

## 4. HTTP-обёртки в Next

По образцу существующих `app/api/*/route.ts`: тонкий `jsonRpc(method, body)` без логики.

| Путь | Метод RPC |
| --- | --- |
| `POST /api/admin/team` | `teamAdd` |
| `PATCH /api/admin/team/[membershipId]` | `teamRole` / `teamScope` / `teamEdit` по полю `op` |
| `POST /api/admin/team/[userId]/block`, `.../restore` | `teamBlock`, `teamRestore` |
| `DELETE /api/admin/team/[membershipId]` | `teamRemove` |
| `PUT /api/admin/roles` | `rolesSave` |
| `POST /api/admin/audit/export` | `auditExport` |
| `POST /api/security/alarms/[id]` | `securityCameras` | `security.view` + `security.camera.view` | камеры объекта в досягаемости, без остальных данных поста | пост |
| `handleAlarm` |
| `POST /api/security/points` | `openObjectPoint` |
| `POST /api/security/camera` | `cameraFrame` (по `deviceId` камеры) |
| `POST /api/security/passes` | `checkPass` |
| `POST /api/engineering/devices/[id]` | `pollDevice` |
| `PATCH /api/engineering/devices/[id]` | `setDeviceWork` |
| `DELETE /api/access/passes/[id]` | `passRevoke` |

Обёртки передают в RPC `client: { ip, device }` из заголовков запроса (см. `ADMIN_SECURITY_MODEL.md`).

## 5. Dashboard (Phase A)

Цель — понять состояние объекта за 3–5 секунд.

Порядок сверху вниз:

1. **Статус объекта.** Одна фраза и тон: «Всё в порядке» / «Требует внимания: 2» / «Тревога». Формулу считает сервер: открытые тревоги → danger; неисправные устройства, заявки старше срока, неподтверждённые команды → warning.
2. **Внимание.** До пяти пунктов, от серьёзного к лёгкому, каждый ведёт в свой раздел. Если пусто — строки нет.
3. **Пульс.** Дома / единицы, жители, гости сегодня, открытые заявки, тревоги, события доступа за сутки. Счётчик тревог окрашивается только если > 0.
4. **Системы.** Компактная полоса: Доступ, Охрана, Камеры, Климат, Протечки. Состояние — из устройств, без выдуманных значений.
5. **Лента.** Последние события доступа и журнала.

Для COMPANY scope вверху — полоса объектов с их статусом, клик выбирает объект. Для OBJECT scope — сразу объект.

Каждый блок отдаётся только при наличии права. Например, у AC нет блока доступа, у SE — платежей.
