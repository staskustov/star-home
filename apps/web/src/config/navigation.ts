import type { NavItem } from "@/types/domain";

export const residentNav: NavItem[] = [
  { href: "/home", label: "Главная", icon: "home" },
  { href: "/access", label: "Доступ", icon: "access" },
  { href: "/rooms", label: "Помещения", icon: "rooms" },
  { href: "/devices", label: "Устройства", icon: "devices" },
  { href: "/service", label: "Сервис", icon: "service" },
  { href: "/profile", label: "Профиль", icon: "profile" },
];

export const residentDock = ["/home", "/rooms", "/devices", "/service"];
