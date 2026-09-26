import { registerGatewayAdapter, type AdapterResult, type GatewayAdapter } from "@/server/gateway-adapter";
import type { Device } from "@/server/ops-store";

function stub(kind: string): GatewayAdapter {
  return {
    kind,
    async execute(_device: Device, _command: string, _value: unknown): Promise<AdapterResult> {
      return { confirmed: false, error: "adapter-unconfigured" };
    },
  };
}

for (const kind of ["matter", "modbus", "knx", "zigbee", "onvif", "rs485"] as const) {
  registerGatewayAdapter(stub(kind));
}
