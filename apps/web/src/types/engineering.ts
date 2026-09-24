export type DeviceWork = "ON" | "OFF" | "FAULT";

export type EngineeringDevice = {
  id: string;
  name: string;
  kind: string;
  place: string;
  work: DeviceWork;
  workLabel: string;
  reading: string | null;
  link: string;
};

export type EngineeringSystem = {
  id: string;
  name: string;
  state: string;
  tone: "success" | "warning" | "danger" | "muted";
  devices: EngineeringDevice[];
};

export type EngineeringBoard = {
  objects: {
    objectId: string;
    systems: EngineeringSystem[];
    meters: { id: string; name: string; place: string; value: string | null; unit: string; at: string | null }[];
  }[];
  can: { poll: boolean; edit: boolean };
  works: { value: DeviceWork; label: string }[];
};
