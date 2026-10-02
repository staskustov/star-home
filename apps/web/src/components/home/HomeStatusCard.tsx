import Link from "next/link";
import { Icon } from "@/components/icons";

export type HomeIssue = { text: string; tone: "danger" | "warning" };

type StatusInput = {
  securityStatus?: string;
  devices: { name: string; state: "ON" | "OFF" | "FAULT"; stale?: boolean }[];
  cameras: { name: string; state: string }[];
  accessPoints: { name: string; latch?: "OPEN" | "CLOSED" }[];
};

const offlineCamera = new Set(["Неисправно", "Нет связи"]);

function devicesWord(count: number) {
  const mod10 = count % 10;
  const mod100 = count % 100;
  if (mod10 === 1 && mod100 !== 11) return "устройство";
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return "устройства";
  return "устройств";
}

export function homeIssues({ securityStatus, devices, cameras, accessPoints }: StatusInput): HomeIssue[] {
  const issues: HomeIssue[] = [];
  if (securityStatus === "Тревога") issues.push({ text: "Охрана: тревога", tone: "danger" });
  const faulty = devices.filter((device) => device.state === "FAULT").length;
  if (faulty) issues.push({ text: `${faulty} ${devicesWord(faulty)} неисправно`, tone: "danger" });
  const stale = devices.filter((device) => device.stale && device.state !== "FAULT").length;
  if (stale) issues.push({ text: `${stale} ${devicesWord(stale)} без связи`, tone: "warning" });
  for (const camera of cameras) {
    if (offlineCamera.has(camera.state)) issues.push({ text: `${camera.name}: ${camera.state.toLocaleLowerCase("ru")}`, tone: "warning" });
  }
  for (const point of accessPoints) {
    if (point.latch === "OPEN") issues.push({ text: `${point.name}: открыто`, tone: "warning" });
  }
  return issues;
}

export function HomeStatusCard({ issues, href = "/events" }: { issues: HomeIssue[]; href?: string }) {
  const danger = issues.some((issue) => issue.tone === "danger");
  const tone = issues.length === 0 ? "ok" : danger ? "danger" : "warning";
  const title = tone === "ok" ? "Дом в норме" : tone === "danger" ? "Тревога" : "Требует внимания";
  const detail =
    tone === "ok"
      ? "Все системы работают исправно"
      : issues.length > 1
        ? `${issues[0]!.text} и ещё ${issues.length - 1}`
        : issues[0]!.text;

  return (
    <Link href={href} className={`home-status home-status-${tone}`} aria-live="polite">
      <span className="home-status-icon" aria-hidden>
        {tone === "ok" ? (
          <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
            <path d="m5 12.5 4.5 4.5L19 7.5" />
          </svg>
        ) : (
          <span className="home-status-mark">!</span>
        )}
      </span>
      <span className="home-status-text">
        <span className="home-status-title">{title}</span>
        <span className="home-status-detail">{detail}</span>
      </span>
      <Icon name="chevron" className="home-status-chevron" />
    </Link>
  );
}
