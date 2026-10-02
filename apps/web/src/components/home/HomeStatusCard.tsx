import Link from "next/link";
import { Icon } from "@/components/icons";
import { formatMoney } from "@/lib/format";
import type { Money } from "@/types/domain";

export type HomeNotice = { text: string; tone: "danger" | "warning" | "info"; href: string };

type NoticeInput = {
  securityStatus?: string;
  devices: { name: string; state: "ON" | "OFF" | "FAULT"; stale?: boolean }[];
  cameras: { name: string; state: string }[];
  accessPoints: { name: string; latch?: "OPEN" | "CLOSED" }[];
  balance?: Money | null;
};

const offlineCamera = new Set(["Неисправно", "Нет связи"]);
const toneRank: Record<HomeNotice["tone"], number> = { danger: 0, warning: 1, info: 2 };

function devicesWord(count: number) {
  const mod10 = count % 10;
  const mod100 = count % 100;
  if (mod10 === 1 && mod100 !== 11) return "устройство";
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return "устройства";
  return "устройств";
}

export function homeNotices({ securityStatus, devices, cameras, accessPoints, balance }: NoticeInput): HomeNotice[] {
  const notices: HomeNotice[] = [];
  if (securityStatus === "Тревога") notices.push({ text: "Охрана: тревога", tone: "danger", href: "/events" });
  const faulty = devices.filter((device) => device.state === "FAULT").length;
  if (faulty) notices.push({ text: `${faulty} ${devicesWord(faulty)} неисправно`, tone: "danger", href: "/devices" });
  const stale = devices.filter((device) => device.stale && device.state !== "FAULT").length;
  if (stale) notices.push({ text: `${stale} ${devicesWord(stale)} без связи`, tone: "warning", href: "/devices" });
  for (const camera of cameras) {
    if (offlineCamera.has(camera.state)) {
      notices.push({ text: `${camera.name}: ${camera.state.toLocaleLowerCase("ru")}`, tone: "warning", href: "/events" });
    }
  }
  for (const point of accessPoints) {
    if (point.latch === "OPEN") notices.push({ text: `${point.name}: открыто`, tone: "warning", href: "/access" });
  }
  if (balance && balance.amount > 0) {
    notices.push({ text: `Коммунальные платежи: к оплате ${formatMoney(balance.amount, balance.currency)}`, tone: "info", href: "/payments" });
  }
  return notices.sort((a, b) => toneRank[a.tone] - toneRank[b.tone]);
}

const titles = {
  ok: "Дом в норме",
  danger: "Тревога",
  warning: "Требует внимания",
  info: "Счёт к оплате",
} as const;

export function HomeStatusCard({ notices, className = "" }: { notices: HomeNotice[]; className?: string }) {
  const top = notices[0];
  const tone = (top?.tone ?? "ok") as keyof typeof titles;
  const detail = !top ? "Все системы работают исправно" : notices.length > 1 ? `${top.text} и ещё ${notices.length - 1}` : top.text;

  return (
    <Link
      href={top?.href ?? "/events"}
      className={`home-status home-status-${tone} ${className}`}
      aria-label={`События и уведомления: ${titles[tone]}. ${detail}`}
    >
      <span className="home-status-icon" aria-hidden>
        {tone === "ok" ? (
          <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
            <path d="m5 12.5 4.5 4.5L19 7.5" />
          </svg>
        ) : tone === "info" ? (
          <Icon name="payments" className="h-5 w-5" />
        ) : (
          <span className="home-status-mark">!</span>
        )}
      </span>
      <span className="home-status-text">
        <span className="home-status-title">{titles[tone]}</span>
        <span className="home-status-detail">{detail}</span>
      </span>
      <Icon name="chevron" className="home-status-chevron" />
    </Link>
  );
}
