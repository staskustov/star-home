# STAR HOME — Architecture

Статус: **Phase 0. Анализ завершён. Реализация не начата.**

Продукт: STAR HOME — универсальная платформа управления жилыми объектами.
Первый объект данных: КП «Сияние». Он не является частью архитектуры и не порождает отдельный код.

## 1. Что найдено

### 1.1 Рабочая папка `star-home`

Каталог `/Users/staskustov/star-home` пустой.

Нет framework, frontend, backend, базы, авторизации, маршрутов, компонентов, стилей, API, design system и конфигурации деплоя.

Продукт создаётся с нуля. Существующий стек переписывать нечего.

### 1.2 Соседний прототип `siyanie`

Путь: `/Users/staskustov/siyanie`.

| Слой | Факт |
| --- | --- |
| Framework | Next.js 14, React 18, App Router |
| Язык | TypeScript |
| Стили | Tailwind CSS 3, акцент `#3b82f6` |
| Экраны | Одна страница `src/app/page.tsx` |
| Данные | Объект `residentData` и списки записаны прямо в странице |
| Auth | Нет |
| API | Нет |
| База | Нет |
| PWA | Нет |
| Бренд в UI | «Siyanie» |

Компоненты: `Header`, `ResidentCard`, `QuickActions`, `NewsSection`, `StatusDashboard`, `FooterNavigation`.

Это черновик экрана жителя коттеджного посёлка. Его нельзя развивать как STAR HOME: бренд привязан к одному объекту, данные живут в UI, иерархии Company → Object → Unit нет.

### 1.3 Соседний продукт `star-hub`

Путь: `/Users/staskustov/star-hub`. Домен: star-hub.co.

| Слой | Факт |
| --- | --- |
| Framework | Next.js 15, React 19, App Router |
| Язык | TypeScript 5.8 |
| Стили | Tailwind CSS 4, собственные стили админки |
| Данные | Prisma 7, PostgreSQL |
| Auth | Cookie-сессия, `jose`, `bcryptjs`, роли сотрудников холдинга |
| Роли | ADMINISTRATOR, CEO, DIRECTOR, MANAGER, EMPLOYEE, MARKETING, EDITOR, TRANSLATOR, ENGINEER, LAWYER, INVESTOR, VIEWER |
| Домен | Публичный сайт холдинга, CRM, сделки, проекты, почта, учёт, чат, AI-ассистент |
| PWA | `manifest.webmanifest` с именем «STAR OS», `sw.js`, Web Push. Только админка |
| Деплой | Vercel, Docker, Caddy/nginx, Cloudflare |
| Redis | В текущем `docker-compose` нет |
| Жилые объекты | Нет модели Company / Object / Building / Unit / Resident |

`star-hub` — другой продукт. Встраивать STAR HOME в него нельзя: другая модель доступа, другой бренд PWA, другая визуальная система.

Полезные приёмы, которые можно повторить позже своими модулями:

- серверная сессия в httpOnly cookie;
- пароль только как hash;
- проверка прав на сервере, не на клиенте;
- подтверждение опасного действия до вызова сервиса;
- журнал действий;
- Prisma и PostgreSQL;
- отдельный service worker и manifest.

Код, роли и манифест `star-hub` не копируются.

## 2. Решение

STAR HOME — отдельное приложение в `star-home`.

```
STAR HOME
 └── Company
      └── Object          КП «Сияние», ЖК, апартаменты, любой следующий объект
           └── Building?  может отсутствовать
                └── Unit
                     └── Resident / Family / Guest
```

Запрещено:

- `if (project === "siyanie")` и любая ветка по имени объекта;
- отдельная база, backend или UI-архитектура на посёлок;
- показывать жителю MQTT, Modbus, IP, Device ID;
- считать frontend источником прав;
- давать AI прямой доступ к базе или устройствам.

## 3. Целевая архитектура

Два процесса. Один репозиторий. Одна кодовая база клиента: PWA, без native-приложений на первом этапе.

```
apps/web     Next.js — PWA, экраны жителя и администратора
apps/api     NestJS — истина по auth, tenant, объектам, действиям
packages/contracts   общие типы запросов и ответов
```

Потоки:

```
Resident / Admin UI
        ↓
apps/web  (рендер, mock на Phase 1, далее только вызов API)
        ↓
apps/api
        ↓
Auth → Company → Object → Resource → Action
        ↓
PostgreSQL    Redis    S3-compatible storage
        ↓
Smart Home Core → Device Abstraction → Adapters
Payment Provider abstraction
LLM Provider abstraction → Policy → Confirmation → Tool
```

### Frontend

- Next.js, TypeScript `strict`.
- Tailwind CSS.
- Собственная лёгкая design system. shadcn не подключать, пока своих примитивов достаточно.
- Mobile-first для жителя. Desktop-first для администратора.
- Компоненты получают данные через props. Mock живёт в отдельном модуле, по форме будущего API.

### Backend

NestJS выбран потому, что границы уже нужны: tenant-guards, WebSocket, адаптеры устройств, платежи и policy engine. Route handlers внутри Next.js повторили бы рост монолита `star-hub`.

На Phase 1 backend не поднимается. Контракты описываются так, будто ответы уже приходят из API.

### Данные и инфраструктура

| Назначение | Технология |
| --- | --- |
| База | PostgreSQL |
| Доступ к данным | Prisma в `apps/api` |
| Кэш, лимиты, pub/sub | Redis |
| Realtime | WebSocket gateway в API |
| Файлы | S3-compatible |
| AI | Абстракция провайдера. Инструменты только после policy и подтверждения |

## 4. Границы модулей API

Ресурсы, без привязки к объекту:

`/auth` `/users` `/companies` `/objects` `/buildings` `/units` `/residents` `/access` `/visitors` `/security` `/devices` `/payments` `/service-requests` `/notifications` `/ai`

Каждый обработчик читает актёра из сессии. `userId`, `role` и `objectId` из тела запроса не являются доказательством права.

## 5. Умный дом, доступ, платежи, AI

С Phase 12–20 экраны остаются в Next.js, а решение и хранение живут в `apps/api`. Процесс API поднимает PostgreSQL и Redis, подписывает проверку каждого вызова и отдаёт живые события по WebSocket. Оплата идёт через HTTP-адрес банка: без своего адреса API отвечает локальной заглушкой и не подключает SDK банка. Языковая модель тоже вызывается по HTTP; если адрес не задан, отвечает локальная модель без доступа к базе и устройствам. Ошибка или неизвестный инструмент не подменяются правилами. Файлы пишутся на диск, пока не задан S3-адрес. Телефонный push готовит ключи VAPID; доставка есть только после подписки браузера. Ядро по-прежнему не выбирает производителя устройства. С Phase 21–30 экран дома, обзор компании, доступ, охрана, платежи и заявки читают те же записи. Категория устройства — человеческое имя. Локальная модель по-прежнему только сопоставляет фразу с инструментом или вопросом; числа и гости подставляются из дома после проверки сессии. С Phase 31–50 те же снимки проецируются в отдельные таблицы PostgreSQL. Решение по-прежнему принимает снимок после проверки сессии, а не строка, присланная браузером.

Умный дом:

```
API → Smart Home Core → Device Abstraction Layer → Adapter
```

Будущие адаптеры: Matter, MQTT, Modbus, HTTP, ONVIF, RS-485, vendor API. Ядро не знает производителя.

Платежи: интерфейс `PaymentProvider`. Счета, начисления, показания, история.

AI:

```
User → AI → Policy Engine → Permission → Confirmation → Tool → Service → Device
```

AI не выполняет SQL и не пишет в устройства. Данные для ответа приходят только из разрешённых сервисов. Неподтверждённое действие не считается выполненным.

Офлайн: можно показать оболочку и последнее известное состояние. Команда «ворота открыты» допустима только после ответа backend.

## 6. Безопасность

Цепочка на каждом запросе:

1. Authentication — сессия.
2. Company access — членство в компании.
3. Object access — членство или роль на объект.
4. Resource access — дом, заявка, устройство, счёт принадлежат этому объекту и компании.
5. Action permission — роль разрешает действие.

Аудит важных действий: кто, когда, что, над чем, результат, ошибка.

## 7. Что сознательно не входит в Phase 0

Код, UI, миграции, устройства, платежи, ворота, AI API, четвёртая жизненная сцена.

Следующий шаг после подтверждения — только Phase 1: Login, Resident Home, Admin Dashboard на mock-данных.
