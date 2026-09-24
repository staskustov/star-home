# STAR HOME — Admin & RBAC Architecture

Статус: **анализ завершён. Код не менялся. Ждём подтверждения перед Phase A.**

Документ описывает, как встроить Admin Console, роли, права и scope в текущую архитектуру, не переписывая её.

Связанные документы:

- `ADMIN_PERMISSION_MATRIX.md` — права по ролям.
- `ADMIN_ROUTES.md` — экраны, навигация, RPC-методы.
- `ADMIN_SECURITY_MODEL.md` — границы доверия, угрозы, проверки.

## 1. Как устроено сейчас

### 1.1 Поток запроса

```
Браузер
  → cookie star_home_session (HMAC: userId, membershipId, exp)
  → Next 16 (apps/web, :3456)
      proxy.ts: 401 без сессии, guard для страниц
      app/api/*: route handler → jsonRpc(method, body)
      server components: rpc(method)
  → rpc-wire.ts: POST /rpc, тело { method, input, session }, подпись HMAC internal secret
  → Nest API (apps/api, :3457) — единственный writer
      проверка подписи → handleRpc(method, input, session)
      rpc-handlers.ts → доменные функции → stores
  → stores (people, catalog, ops, life) в памяти + snapshot в Postgres (+ проекция в таблицы)
```

Браузер не может подделать `session`: её собирает Next из подписанной cookie, а тело к API подписано внутренним секретом. `input` приходит от пользователя и считается недоверенным.

### 1.2 Модель людей и доступа

| Сущность | Где | Поля |
| --- | --- | --- |
| `User` | `people-store.ts` | `id`, `login`, `name`, `passwordHash` |
| `Membership` | `people-store.ts` | `id`, `userId`, `companyId`, `role`, `objectId`, `unitId`, `expiresAt`, `passId` |
| `Company → Object → Building? → Unit` | `catalog-store.ts` | универсальная иерархия, тип объекта задаёт наличие корпусов |

Роль живёт в `Membership`. У человека может быть несколько membership. Сессия держит одну активную (`membershipId`), переключение — `switch`.

Scope сейчас неявный:

- `objectId = null, unitId = null` → вся компания;
- `objectId` задан → объект;
- `unitId` задан → единица.

Scope «корпус» не существует.

### 1.3 Как проверяются права

Прав как понятия нет. Проверки — наборы ролей, продублированные по файлам:

| Файл | Набор |
| --- | --- |
| `directory.ts` | `adminRoles` = SUPER, COMPANY, OBJECT, MANAGER |
| `catalog.ts` | `companyRoles`, `structureRoles` |
| `actor.ts` | `companyRoles`, `homeRoles` |
| `residents.ts` | `companyRoles`, `householdRoles` |
| `life-modes.ts` | `companyRoles` |
| `rpc-handlers.ts`, `ai.ts` | точечные `role === "RESIDENT"` |

`actorFromSession` пускает в любые админские методы четыре роли без различий. Решение «можно ли» принимается внутри каждой доменной функции по-своему.

### 1.4 Навигация

`config/navigation.ts` → `adminNav` из 10 пунктов показывается всем админам одинаково. `routing.ts → guardPath` проверяет только «есть ли хоть одна админская membership» для всего `/admin/*`.

### 1.5 Аудит

До Phase E: `ops.audit[]` с полями `actorUserId`, `companyId`, `objectId`, `action`, `target`, `result`, `error`, `at`; без входов, каталога, жителей, режимов, отказов, роли, IP и устройства. С Phase E журнал отдельный, см. 3.6.

### 1.6 Что уже есть в Admin Console

Обзор, Объекты (структура), Жители, Доступ, Охрана, Заявки, Платежи, Устройства, AI, Настройки. Данные операций приходят одним методом `ops` на всю компанию.

## 2. Найденные проблемы

| # | Проблема | Риск |
| --- | --- | --- |
| P1 | `ops` отдаёт данные всей компании, фильтр по объекту делает UI. OBJECT_ADMIN и MANAGER видят пропуска, счета, аудит и AI-диалоги чужих объектов | Утечка между объектами |
| P2 | Нет permission-модели, только role sets в 6 местах | Расхождение правил, ошибки при новых ролях |
| P3 | SECURITY, SERVICE_OPERATOR не имеют консоли (`/no-access`); ACCOUNTANT отсутствует в `roles` | Требуемые роли не работают |
| P4 | MANAGER может менять настройки режимов жизни, добавлять жителей, открывать ворота без различия прав | Избыточные права |
| P5 | `openObjectGateFor` записывает в `Place.role` жёстко `COMPANY_ADMIN` | Недостоверный аудит |
| P6 | Нет блокировки пользователя и отзыва сессии; cookie живёт 14 дней | Уволенный сотрудник сохраняет доступ |
| P7 | `removeResident` удаляет `User`, если у него не осталось membership | Потеря истории и связей аудита |
| P8 | Аудит неполный, без роли/IP/устройства, без записи отказов | Нельзя расследовать инцидент |
| P9 | `guardPath` не различает разделы `/admin/*` | Страница открывается, данные — нет; UX 403 внутри раздела |
| P10 | Мёртвые хелперы `openOwnGate`, `addOwnPass`, `payOwnInvoice`, `callOwnSecurity`, `addOwnRequest`, `setRequestStatus`, `openObjectGate`, `saveModeSetting`, `switchOwnMode`, `settingsBoard`, `residentsActor` в Next пишут в store напрямую | Если их подключат, запись пойдёт мимо API |
| P11 | SUPER_ADMIN привязан к `companyId`, как COMPANY_ADMIN | Нет платформенного уровня |
| P12 | Нет тестов доступа | Регрессии прав не ловятся |

## 3. Целевая архитектура

Принцип: не новая система, а один слой решения «можно ли», вставленный между `handleRpc` и доменными функциями.

```
handleRpc(method, input, session, client)
  → authenticate(session)            // user ACTIVE, sessionVersion совпадает, membership активна
  → policy = methodPolicy[method]    // deny, если метода нет в таблице
  → target = policy.target(input)    // что пользователь хочет тронуть: object / building / unit / user
  → decide(actor, policy.permission, target)
      → 401 / 403 / 404 + audit DENIED для критических
  → handler(actor, input)            // доменная функция получает уже проверенного actor
  → audit SUCCESS / ERROR для критических
```

### 3.1 Новые модули (apps/web/src/server/rbac/)

| Файл | Назначение |
| --- | --- |
| `permissions.ts` | Список permission-ключей, группы, признак «критическое» |
| `policy.ts` | Системные роли → права по умолчанию, ранги ролей, допустимые scope |
| `scope.ts` | Вычисление scope membership, `contains(scope, target)` |
| `decide.ts` | `can(actor, permission, target)` — единственная точка решения |
| `rbac-store.ts` | Переопределения матрицы на уровне компании (snapshot `rbac`) |
| `audit-store.ts` | Append-only журнал (snapshot `audit`), выделенный из ops |

Модули живут в `apps/web/src/server`, как все доменные файлы, и исполняются в процессе API. Next их не вызывает для записи.

### 3.2 Actor

```ts
type Actor = {
  userId: string;
  membershipId: string;
  role: Role;
  companyId: string;
  scope: { kind: "PLATFORM" | "COMPANY" | "OBJECT" | "BUILDING" | "UNIT"; objectId?: string; buildingId?: string; unitId?: string };
  permissions: ReadonlySet<Permission>; // из policy + переопределений компании
  client: { ip: string | null; device: string | null };
};
```

Actor строится только на сервере из `session.userId + session.membershipId` и stores. Из `input` в него не попадает ничего.

### 3.3 Scope

| Scope | Membership | Покрывает |
| --- | --- | --- |
| PLATFORM | SUPER_ADMIN | все компании (служебный уровень, в Team не назначается) |
| COMPANY | `objectId = null` | все объекты компании |
| OBJECT | `objectId` | объект, его корпуса и единицы |
| BUILDING | `objectId + buildingId` | корпус и его единицы (только для типов с корпусами) |
| UNIT | `unitId` | единица |
| SELF | модификатор права | только записи, где автор/владелец = `userId` |

SELF не отдельная membership, а сужение конкретного права. Пример: FAMILY_MEMBER видит заявки единицы только свои (`service.view:self`).

Правило сравнения: запись с `objectId/buildingId/unitId` доступна, если scope actor её содержит. Чужая компания → 404 (не раскрываем существование). Своя компания вне scope → 403.

Как это реализовано (Phase D, `rbac/decide.ts`):

- `reaches(actor, row)` — единственная проверка записи: компания → объект в scope → для BUILDING единица записи лежит в корпусе.
- `unitId: null` — общая инфраструктура объекта (въезд, общие камеры). Сотрудник корпуса её видит и может открыть общие ворота.
- В журнале сотрудник корпуса видит записи единиц своего корпуса, записи с `buildingId` своего корпуса и записи уровня объекта только в категориях ACCESS и SECURITY (общий въезд, тревоги). Запись с неизвестной единицей скрыта.
- Записи без `objectId` (права ролей, дела всей компании) видят только сотрудники уровня компании.
- Изменения уровня объекта (название, корпуса, режимы жизни) требуют `objectFor(..., "whole")`. Сотрудник корпуса меняет только единицы своего корпуса.
- Membership с корпусом чужого объекта или удалённым корпусом не даёт доступа (403). Корпус с закреплёнными сотрудниками удалить нельзя (409).
- SECURITY видит в журнале только категории ACCESS и SECURITY (`auditCategoriesOf`).
- SELF: FAMILY_MEMBER видит только свои заявки, GUEST — только свой пропуск.

### 3.4 Изменения модели данных (аддитивно, без reseed)

| Сущность | Добавить | По умолчанию для существующих записей |
| --- | --- | --- |
| `User` | `email`, `phone`, `status: ACTIVE / BLOCKED`, `lastLoginAt`, `sessionVersion` | `""`, `""`, `ACTIVE`, `null`, `1` |
| `Membership` | `buildingId`, `status: ACTIVE / REVOKED`, `createdAt`, `createdBy` | `null`, `ACTIVE`, `null`, `null` |
| `Role` (тип) | `ACCOUNTANT` | — |
| `rbac` snapshot | `{ companyId, role, grants[], revokes[] }[]` | пусто = системные права |
| `audit` snapshot | новая запись (см. 3.6) | старые записи `ops.audit` переносятся при первой загрузке, `role = null` |

Нормализация — в `load()` каждого store, как уже сделано для `Device.work`. Проекция Prisma: добавить колонки в `User`, `Membership`, новую таблицу `AuditEntry` (через `db push` без потери данных — только новые nullable поля).

Сессия: в cookie добавляется `sv` (sessionVersion). Блокировка, смена роли или scope увеличивает `sessionVersion` → старые cookie отклоняются на первом же запросе.

### 3.5 Роли

Используются ровно 10 ролей из задачи. Новых не создаём.

Ранг задаёт, кто кого может назначать:

| Роль | Ранг | Допустимый scope | Консоль |
| --- | --- | --- | --- |
| SUPER_ADMIN | 100 | PLATFORM | Admin |
| COMPANY_ADMIN | 90 | COMPANY | Admin |
| OBJECT_ADMIN | 70 | OBJECT | Admin |
| MANAGER | 50 | OBJECT, BUILDING | Admin |
| SECURITY | 40 | OBJECT, BUILDING | Security (в Phase A–F — урезанный Admin, см. `ADMIN_ROUTES.md`) |
| SERVICE_OPERATOR | 40 | OBJECT, BUILDING | Admin (заявки) |
| ACCOUNTANT | 40 | COMPANY, OBJECT | Admin (платежи) |
| RESIDENT | 10 | UNIT | Resident |
| FAMILY_MEMBER | 5 | UNIT | Resident |
| GUEST | 1 | UNIT (пропуск) | Guest |

Сотрудников (ранг ≥ 40) ведёт «Команда». Жителей, семью и гостей — «Жители». Смешения нет.

### 3.6 Аудит

```ts
type AuditEntry = {
  id: string;
  at: string;              // ISO
  actorUserId: string;
  actorRole: Role | null;
  membershipId: string | null;
  companyId: string;
  objectId: string | null;
  buildingId: string | null;
  unitId: string | null;
  category: "RBAC" | "ACCESS" | "SECURITY" | "ENGINEERING" | "FINANCE" | "DATA" | "SETTINGS" | "AUTH" | "SERVICE";
  action: string;          // TEAM_ROLE_CHANGE, GATE_OPEN, ...
  targetType: string;      // user, membership, pass, device, invoice, object, ...
  targetId: string | null;
  target: string;          // человекочитаемо
  result: "SUCCESS" | "DENIED" | "ERROR";
  reason: string;          // причина отказа или ошибки
  ip: string | null;
  device: string | null;   // короткий user-agent
  changes?: { field: string; from: string; to: string }[];
};
```

Журнал только дописывается. API-метода удаления или правки нет. Ротация — позже, по сроку хранения.

Как это реализовано (Phase E):

| Файл | Назначение |
| --- | --- |
| `server/audit-actions.ts` | Справочник действий: подпись и категория. Категория записи берётся отсюда, не из вызова |
| `server/audit-context.ts` | Контекст запроса (AsyncLocalStorage): IP, устройство, роль и membership actor |
| `server/audit-store.ts` | Snapshot `audit`: последние 5000 записей, новые сверху. Старые `ops.audit` переносятся один раз, `ops.audit` больше не пишется |
| `server/audit-view.ts` | Видимость по scope, экран, выгрузка CSV |
| `apps/api/src/project.ts` | Проекция в `AuditLog` Postgres только дописыванием (`createMany skipDuplicates`). Таблица — постоянный архив, окно snapshot её не обрезает |

- IP и устройство Next берёт из заголовков запроса и кладёт в подписанное тело RPC. За прокси IP нужно брать от доверенного прокси, без него `x-forwarded-for` может подделать клиент — поле справочное.
- Отказы 403 на критических методах (`guardedMethods` в `rpc-handlers.ts`) пишутся как `DENIED`. `objectId` из input берётся, только если объект принадлежит компании actor.
- Вход и неудачные попытки (`LOGIN`, `LOGIN_FAILED`) пишутся только для существующих логинов.
- Экран `/admin/audit` (`audit.view`): фильтры категория / объект / сотрудник / результат в URL, детали записи. Выгрузка CSV (`audit.export`, POST) сама пишется в журнал как `AUDIT_EXPORT`. Значения, похожие на формулы, экранируются.
- Категория ENGINEERING: опрос устройства (`DEVICE_POLL`, результат только от адаптера) и смена рабочего статуса (`DEVICE_STATUS`, с изменениями «было / стало»). Пост охраны пишет `ALARM_ACCEPT`, `ALARM_CLOSE`, `PASS_CHECK`, открытие общих точек — `OPEN_GATE`.

### 3.6.1 Пост охраны и Инженерия

- `/security` — отдельный экран без сайдбара консоли. Роль SECURITY попадает туда сразу после входа. Остальным сотрудникам с `security.view` экран доступен из пункта «Пост охраны».
- На посту: тревоги (принять / закрыть), камеры (только запрос кадра, видеопотока нет), общие ворота и калитки (квартирные замки охране не показываются и не открываются), проверка пропуска по коду, список гостей, события доступа, журнал поста.
- `/admin/engineering` — четыре системы: климат и отопление, вода и протечки, электричество и свет, пожарная безопасность. Система без устройств показывается как «Не подключено». Показания — только сохранённые от адаптера, иначе «нет показаний».
- Рабочий статус устройства: «В работе», «Выведено из работы», «Неисправно». Выведенное из работы устройство нельзя опросить и открыть.

### 3.7 Admin Console UX

- Один layout `/admin`, одна design system (bronze glass).
- Навигация строится сервером: `admin` отдаёт `sections[]`, UI рисует только их.
- Раздел, которого нет в `sections`, закрывается в `guardPath` и в самом RPC.
- Название «Посёлок» берётся из типа выбранного объекта (`objectPresentation`): КП → «Посёлок», ЖК → «Комплекс», дом → «Дом». Код не ветвится по конкретному объекту.

## 4. Фазы

| Фаза | Содержание | Критерий готовности |
| --- | --- | --- |
| A — Dashboard | Сервер: `dashboard` со scope; ответ «Всё в порядке?», счётчики, внимание, системы, события. UI обзора | Метод отдаёт только данные scope; экран проверен на 1440/1024 |
| B — Team | Поля User, методы team*, страница «Команда», блокировка + sessionVersion | Блок/восстановление/удаление работают, блок отзывает сессию |
| C — Roles & Permissions | `permissions.ts`, `policy.ts`, `decide.ts`, таблица `methodPolicy`, перевод всех методов, страница матрицы, переопределения компании | Все RPC идут через `can()`, role sets удалены |
| D — Scope | BUILDING, SELF, фильтрация `ops` и списков по scope, 403/404 политика | P1 закрыт тестом |
| E — Audit Log | audit-store, перенос старых записей, запись критических действий и отказов, IP/устройство, экран журнала | Каждое действие из списка задачи даёт запись |
| F — Security QA | Автотесты матрицы роль × метод, прямые вызовы API с чужими id, сессии заблокированных, отчёт | Нет прохода без permission; отчёт приложен |

Порядок A → B → C можно поменять на C → A → B, если нужен фундамент прав до UI. Рекомендация: оставить как в задаче, но в Phase A сразу использовать `decide.ts` в минимальном виде (только `dashboard.view`), чтобы не переделывать.

После каждой фазы: tsc, eslint, тесты, визуальная проверка в браузере, security review изменений, git checkpoint, отчёт. Следующая фаза — только после подтверждения.

## 5. Что не делаем

- Не переписываем stores, транспорт Next → API, сессии и resident app.
- Не создаём роли сверх десяти.
- Не показываем подтверждение действий, которые адаптер не подтвердил (ворота, инженерия, банк).
- Не выдумываем видеопоток камер и показания, которых нет.
- Не ветвим код по «Сиянию».
