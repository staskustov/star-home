export type AuditOption = { value: string; label: string };

export type AuditRow = {
  id: string;
  at: string;
  time: string;
  actor: string;
  role: string | null;
  place: string;
  category: string;
  categoryLabel: string;
  action: string;
  target: string;
  result: "SUCCESS" | "DENIED" | "ERROR";
  resultLabel: string;
  reason: string;
  ip: string | null;
  device: string | null;
  changes: { field: string; from: string; to: string }[];
};

export type AuditBoard = {
  entries: AuditRow[];
  total: number;
  limit: number;
  nextLimit: number | null;
  filters: { category: string | null; objectId: string | null; actorUserId: string | null; result: string | null };
  options: { categories: AuditOption[]; objects: AuditOption[]; actors: AuditOption[]; results: AuditOption[] };
  canExport: boolean;
};
