export type SecurityCamera = { id: string; name: string; place: string; state: string; ready: boolean };

export type SecurityAlarmStatus = "OPEN" | "ACCEPTED" | "CLOSED";

export type SecurityPostView = {
  objects: { id: string; name: string }[];
  objectId: string;
  objectName: string;
  can: { handle: boolean; open: boolean; camera: boolean; passes: boolean; journal: boolean; console: boolean };
  alarms: {
    id: string;
    title: string;
    place: string;
    at: string;
    status: SecurityAlarmStatus;
    handledBy: string | null;
    handledAt: string | null;
    kind: "CALL" | "SOS";
    callerName: string | null;
  }[];
  chats: { id: string; unitId: string; place: string; actorName: string; role: string; body: string; at: string; mine: boolean }[];
  points: { id: string; name: string; kind: string; state: string; ready: boolean }[];
  cameras: SecurityCamera[];
  passes: { id: string; guestName: string; place: string; detail: string; vehicle: string }[];
  events: { id: string; time: string; title: string; result: "SUCCESS" | "UNCONFIRMED" }[];
  journal: { id: string; time: string; actor: string; action: string; target: string; result: "SUCCESS" | "DENIED" | "ERROR" }[];
};

export type PassCheck = { guestName: string; place: string; detail: string; vehicle: string };

export type SecurityCameraWall = {
  objects: { id: string; name: string }[];
  objectId: string;
  objectName: string;
  cameras: SecurityCamera[];
};
