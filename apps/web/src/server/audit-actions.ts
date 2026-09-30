export const auditCategories = ["RBAC", "ACCESS", "SECURITY", "ENGINEERING", "FINANCE", "DATA", "SETTINGS", "AUTH", "SERVICE"] as const;

export type AuditCategory = (typeof auditCategories)[number];

export const auditCategoryLabels: Record<AuditCategory, string> = {
  RBAC: "Права и команда",
  ACCESS: "Доступ",
  SECURITY: "Охрана",
  ENGINEERING: "Инженерия",
  FINANCE: "Финансы",
  DATA: "Данные",
  SETTINGS: "Настройки",
  AUTH: "Входы",
  SERVICE: "Заявки",
};

export const auditActions = {
  LOGIN: { label: "Вход", category: "AUTH" },
  LOGIN_FAILED: { label: "Неудачный вход", category: "AUTH" },
  OPEN_GATE: { label: "Открытие ворот", category: "ACCESS" },
  CLOSE_GATE: { label: "Закрытие ворот", category: "ACCESS" },
  ACCESS_POINT_CREATE: { label: "Точка доступа добавлена", category: "ACCESS" },
  ACCESS_POINT_EDIT: { label: "Точка доступа изменена", category: "ACCESS" },
  ACCESS_POINT_DELETE: { label: "Точка доступа удалена", category: "ACCESS" },
  CREATE_PASS: { label: "Пропуск", category: "ACCESS" },
  RESIDENT_ADD: { label: "Житель добавлен", category: "ACCESS" },
  RESIDENT_EDIT: { label: "Данные жителя", category: "ACCESS" },
  RESIDENT_REMOVE: { label: "Доступ жителя отозван", category: "ACCESS" },
  RAISE_ALARM: { label: "Вызов охраны", category: "SECURITY" },
  RAISE_SOS: { label: "SOS", category: "SECURITY" },
  SECURITY_CHAT: { label: "Сообщение охране", category: "SECURITY" },
  CAMERA_VIEW: { label: "Кадр с камеры", category: "SECURITY" },
  CAMERA_EDIT: { label: "Поток камеры", category: "ENGINEERING" },
  ALARM_ACCEPT: { label: "Тревога принята", category: "SECURITY" },
  ALARM_CLOSE: { label: "Тревога закрыта", category: "SECURITY" },
  PASS_CHECK: { label: "Проверка пропуска", category: "ACCESS" },
  DEVICE_POLL: { label: "Опрос устройства", category: "ENGINEERING" },
  DEVICE_STATUS: { label: "Статус устройства", category: "ENGINEERING" },
  ENGINEERING_SYSTEM_CREATE: { label: "Инженерная система добавлена", category: "ENGINEERING" },
  ENGINEERING_SYSTEM_EDIT: { label: "Инженерная система изменена", category: "ENGINEERING" },
  ENGINEERING_SYSTEM_DELETE: { label: "Инженерная система удалена", category: "ENGINEERING" },
  CREATE_REQUEST: { label: "Заявка", category: "SERVICE" },
  UPDATE_REQUEST: { label: "Статус заявки", category: "SERVICE" },
  PAY_INVOICE: { label: "Оплата", category: "FINANCE" },
  TEAM_ADD: { label: "Новый сотрудник", category: "RBAC" },
  TEAM_EDIT: { label: "Данные сотрудника", category: "RBAC" },
  TEAM_ROLE: { label: "Смена роли", category: "RBAC" },
  TEAM_SCOPE: { label: "Смена места работы", category: "RBAC" },
  TEAM_BLOCK: { label: "Блокировка", category: "RBAC" },
  TEAM_RESTORE: { label: "Восстановление доступа", category: "RBAC" },
  TEAM_REMOVE: { label: "Отзыв доступа", category: "RBAC" },
  ROLES_EDIT: { label: "Права роли", category: "RBAC" },
  BACKUP_EXPORT: { label: "Снимок выгружен", category: "DATA" },
  BACKUP_RESTORE: { label: "Снимок восстановлен", category: "DATA" },
  OBJECT_CREATE: { label: "Новый объект", category: "DATA" },
  OBJECT_EDIT: { label: "Данные объекта", category: "DATA" },
  OBJECT_DELETE: { label: "Удаление объекта", category: "DATA" },
  BUILDING_CREATE: { label: "Новый корпус", category: "DATA" },
  BUILDING_EDIT: { label: "Данные корпуса", category: "DATA" },
  BUILDING_DELETE: { label: "Удаление корпуса", category: "DATA" },
  UNIT_CREATE: { label: "Новая единица", category: "DATA" },
  UNIT_EDIT: { label: "Данные единицы", category: "DATA" },
  UNIT_DELETE: { label: "Удаление единицы", category: "DATA" },
  ROOM_CREATE: { label: "Новое помещение", category: "DATA" },
  ROOM_EDIT: { label: "Данные помещения", category: "DATA" },
  ROOM_DELETE: { label: "Удаление помещения", category: "DATA" },
  DEVICE_CREATE: { label: "Устройство подключено", category: "ENGINEERING" },
  DEVICE_EDIT: { label: "Устройство настроено", category: "ENGINEERING" },
  DEVICE_DELETE: { label: "Устройство отключено", category: "ENGINEERING" },
  DEVICE_DISCOVER: { label: "Поиск устройств", category: "ENGINEERING" },
  DEVICE_CHANNEL_CHANGED: { label: "Каналы устройства", category: "ENGINEERING" },
  GATEWAY_CREATE: { label: "Шлюз добавлен", category: "ENGINEERING" },
  GATEWAY_EDIT: { label: "Шлюз изменён", category: "ENGINEERING" },
  GATEWAY_DELETE: { label: "Шлюз удалён", category: "ENGINEERING" },
  DEVICE_COMMAND: { label: "Команда устройству", category: "ENGINEERING" },
  DEMO_ADAPTER_FORBIDDEN: { label: "Демо-адаптер запрещён", category: "ENGINEERING" },
  DEVICE_PROBE: { label: "Проверка устройства", category: "ENGINEERING" },
  DEVICE_HANDOVER: { label: "Передача жильцу", category: "ENGINEERING" },
  SCENARIO_CREATE: { label: "Сценарий создан", category: "ENGINEERING" },
  SCENARIO_EDIT: { label: "Сценарий изменён", category: "ENGINEERING" },
  SCENARIO_DELETE: { label: "Сценарий удалён", category: "ENGINEERING" },
  SCENARIO_RUN: { label: "Сценарий запущен", category: "ENGINEERING" },
  MODE_SETTINGS: { label: "Настройка режима", category: "SETTINGS" },
  MODE_SWITCH: { label: "Смена режима дома", category: "SETTINGS" },
  HOME_LAYOUT: { label: "Главный экран", category: "SETTINGS" },
  HOME_CHIP: { label: "Плитка главного экрана", category: "SETTINGS" },
  HOME_METRICS: { label: "Показатели на главной", category: "SETTINGS" },
  HOME_COVER: { label: "Фото на главной", category: "SETTINGS" },
  AUDIT_EXPORT: { label: "Выгрузка журнала", category: "RBAC" },
} as const satisfies Record<string, { label: string; category: AuditCategory }>;

export type AuditAction = keyof typeof auditActions;

export function isAuditCategory(value: unknown): value is AuditCategory {
  return typeof value === "string" && (auditCategories as readonly string[]).includes(value);
}

export function auditLabel(action: string): string {
  return Object.hasOwn(auditActions, action) ? auditActions[action as AuditAction].label : action;
}

export function auditCategoryOf(action: string): AuditCategory | null {
  return Object.hasOwn(auditActions, action) ? auditActions[action as AuditAction].category : null;
}
