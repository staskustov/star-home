# STAR HOME — AI tools для умного дома

Инструменты встроены в существующий `ask` / `confirm`. Новый движок не создавался.

## Запросы (без confirm)

| Query | Что отвечает |
| --- | --- |
| status | климат из показаний, режим жизни, категории |
| rooms | помещения каталога |
| devices | список в scope, без выдуманных статусов |
| device_status | климат, если есть reading |
| security_status | охрана режима + открытые точки |
| open_doors | latch OPEN по факту |
| alerts | FAULT и открытые тревоги |
| energy | POWER / lighting / energy, «нет показаний» если state пуст |
| visitors / balance | как раньше |

Нет данных — честный отказ, не выдумка.

## Действия (confirm)

| Tool | Право | Примечание |
| --- | --- | --- |
| open_gate | access.gate.open | как раньше |
| control_device | devices.command / access.gate.open | LOW/MEDIUM сразу после AI-confirm; HIGH идёт через тот же confirm token smart-команды |
| set_temperature | devices.command | только реальное CLIMATE с thermostat |
| switch_mode / create_pass / create_request / pay | прежние |

AI не ходит в MQTT. AI не обходит RBAC. HIGH без confirm не исполняется.
