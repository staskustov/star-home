import type { NavItem } from "@/types/domain";

export const residentNav: NavItem[] = [
  { href: "/home", label: "Главная", icon: "home" },
  { href: "/access", label: "Доступ", icon: "access" },
  { href: "/ai", label: "AI", icon: "ai" },
  { href: "/service", label: "Сервис", icon: "service" },
  { href: "/profile", label: "Профиль", icon: "profile" },
];

export const adminNav: NavItem[] = [
  { href: "/admin", label: "Обзор", icon: "overview" },
  { href: "/admin/objects", label: "Объекты", icon: "objects" },
  { href: "/admin/residents", label: "Жители", icon: "residents" },
  { href: "/admin/access", label: "Доступ", icon: "access" },
  { href: "/admin/security", label: "Охрана", icon: "security" },
  { href: "/admin/requests", label: "Заявки", icon: "requests" },
  { href: "/admin/payments", label: "Платежи", icon: "payments" },
  { href: "/admin/devices", label: "Устройства", icon: "devices" },
  { href: "/admin/ai", label: "AI", icon: "ai" },
  { href: "/admin/settings", label: "Настройки", icon: "settings" },
];
