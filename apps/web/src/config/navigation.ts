import type { NavItem } from "@/types/domain";

export const residentNav: NavItem[] = [
  { href: "/home", label: "Главная", icon: "home" },
  { href: "/rooms", label: "Помещения", icon: "rooms" },
  { href: "/service", label: "Сервис", icon: "service" },
  { href: "/access", label: "Доступ", icon: "access" },
  { href: "/devices", label: "Устройства", icon: "devices" },
  { href: "/scenarios", label: "Сценарии", icon: "scenarios" },
  { href: "/events", label: "События", icon: "event" },
  { href: "/payments", label: "Платежи", icon: "payments" },
  { href: "/profile", label: "Настройки", icon: "settings" },
];

export const residentDock = ["/home", "/rooms", "/devices"];
