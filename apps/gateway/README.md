# STAR HOME Local Gateway agent

Агент на объекте. Cloud не открывает MQTT контроллера.

- Heartbeat и pull очереди: `POST /api/smart-home/gateways/channel` + `x-star-home-gateway`
- Токен выдаёт staff в `/admin/devices`. В снимке только hash.
- Агент **не подтверждает** команду, которую сам не применил (`confirmed: false`).

```
STAR_HOME_CLOUD_URL=http://127.0.0.1:3456 \
STAR_HOME_GATEWAY_TOKEN=... \
npx tsx apps/gateway/agent.ts --once
```
