# STAR HOME Local Gateway agent

Агент на объекте. Cloud не открывает MQTT контроллера.

- Heartbeat и pull очереди: `POST /api/smart-home/gateways/channel` + `x-star-home-gateway`
- Токен выдаёт staff в `/admin/devices`. В снимке только hash.
- Агент **не подтверждает** команду, которую сам не применил (`confirmed: false`).
- Команда `discover`: читает локальный снимок `STAR_HOME_WB_DISCOVERY` (JSON файл или inline) с topic `/devices/.../controls/...`. Cloud MQTT не открывает.
- Вне localhost Cloud URL только `https`. Mutual TLS и отдельный binary — отдельно, здесь не подменяем.
- `--once` — один цикл heartbeat/pull/ack, без демона.

```
STAR_HOME_CLOUD_URL=http://127.0.0.1:3456 \
STAR_HOME_GATEWAY_TOKEN=... \
STAR_HOME_WB_DISCOVERY=./wb-discovery.json \
npx tsx apps/gateway/agent.ts --once
```
