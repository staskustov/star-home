# STAR HOME — Device Location (Phase 0)

`roomId` не обязателен. Место устройства — scope, не обязательно комната.

## Иерархия каталога (есть)

```
Company
  └── Object
        └── Building?          Prisma + catalog
              └── Unit         дом / квартира
                    └── Room   только catalog; этаж = Room.floor
                          └── Device
```

Object-level:

```
Object
  └── Device     unitId = null, place = OBJECT | STREET
```

Сущности Floor нет. `CatalogUnit.floors` + `Room.floor` + `unit.plans[]`.  
`Device.buildingId` / `floorId` не нужны.

## DevicePlace (есть)

`OBJECT | STREET | ROOM` в `ops-store.ts`.

| place | unitId | roomId | Примеры |
|-------|--------|--------|---------|
| OBJECT | null | null | Ворота посёлка, ЛОС, общий счётчик |
| STREET | null | null | Уличная погода, радиация. WEATHER принудительно STREET |
| ROOM | из комнаты | обязателен | Датчик гостиной, щитовая дома |

`bindPlace` в `device-registry.ts`: STREET/OBJECT обнуляют дом. ROOM без комнаты — 400.  
`bindDevicePlace` при чтении: устройство с unit без room получает комнату (STREET-комната дома для камер/улицы, иначе первая жилая). Каждому дому нормализатор каталога гарантирует комнату «Улица» и хотя бы одно помещение.

Перепривязка Гостиная → Спальня или Гостиная → объект: PATCH device, history по `deviceId` сохраняется.

## Комнаты (есть)

`CatalogRoom`: id, objectId, unitId, floor, name, kind, sort.

Kinds: LIVING, BEDROOM, KITCHEN, STUDY, BOILER, BATH, HALL, TERRACE, STREET, OTHER.

Админ создаёт комнату с свободным именем (`createRoom`, `objects.structure.edit`). Тип из списка, название не фиксировано. Удаление комнаты с устройствами — 409.

ТЗ просит больше типов (CHILDREN_ROOM, GARAGE, TECHNICAL_ROOM, …). Расширение `roomKinds` — отдельный маленький шаг, не блокер каналов. BOILER / OTHER покрывают щитовую и котельную.

## Инженерия / ЛОС

Отдельной `ENGINEERING_ZONE` нет. Не заводим, пока не доказана нужда.

Предложение:

- общее инженерное оборудование объекта → `place: OBJECT`, kind POWER/WATER/…, жителю не отдавать по permission / флагу `metadata.engineering` или kind;
- оборудование дома (щитовая) → `place: ROOM`, комната kind BOILER / OTHER «Электрощитовая».

`engineeringBoard()` уже группирует по системам (heat/water/power/fire), не по зонам. Житель не ходит в `/admin/engineering`.

## Object-level для жителя

`homeSignals` / `viewerReaches`: устройство объекта (`unitId === null`) видно жителю своего объекта только если это ворота/калитка/шлагбаум/замок/погода. `POWER` / `WATER` / `HEATING` / `IRRIGATION` / `FIRE` и `metadata.engineering` скрыты.

## Admin UX мест

Сейчас: `/admin/devices` select OBJECT / STREET / ROOM + комната.  
В `/admin/objects/[id]` у помещения список устройств и «Добавить устройство» (тот же визард, place=ROOM).
