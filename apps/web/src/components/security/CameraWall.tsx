"use client";

import { useEffect, useState, type CSSProperties } from "react";
import { useRouter } from "next/navigation";
import { ObjectSwitcher } from "@/components/home/ObjectSwitcher";
import { CameraTile } from "@/components/security/CameraTile";
import { Clock } from "@/components/security/Clock";
import type { SecurityCameraWall } from "@/types/security";

function columns(count: number): string {
  if (count <= 1) return "grid-cols-1";
  if (count <= 4) return "grid-cols-1 sm:grid-cols-2";
  if (count <= 9) return "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3";
  return "grid-cols-1 sm:grid-cols-2 lg:grid-cols-4";
}

function rows(count: number): number {
  if (count <= 1) return 1;
  if (count <= 4) return Math.ceil(count / 2);
  if (count <= 9) return Math.ceil(count / 3);
  return Math.ceil(count / 4);
}

function useFullscreen(): [boolean, () => void] {
  const [active, setActive] = useState(false);
  useEffect(() => {
    const sync = () => setActive(document.fullscreenElement !== null);
    sync();
    document.addEventListener("fullscreenchange", sync);
    return () => document.removeEventListener("fullscreenchange", sync);
  }, []);
  const toggle = () => {
    if (document.fullscreenElement) void document.exitFullscreen().catch(() => undefined);
    else void document.documentElement.requestFullscreen().catch(() => undefined);
  };
  return [active, toggle];
}

export function CameraWall({ wall }: { wall: SecurityCameraWall }) {
  const router = useRouter();
  const [fullscreen, toggleFullscreen] = useFullscreen();
  const working = wall.cameras.filter((camera) => camera.ready).length;

  useEffect(() => {
    document.title = `Камеры · ${wall.objectName} · STAR HOME`;
  }, [wall.objectName]);

  return (
    <div className="flex min-h-dvh flex-col lg:h-dvh">
      <header className="flex flex-wrap items-center gap-x-6 gap-y-3 border-b border-line/60 bg-bg/50 px-5 py-3 backdrop-blur-xl">
        <div className="min-w-0 flex-1">
          <p className="kicker text-accent">STAR HOME · Камеры</p>
          <p className="mt-1 text-[13px] text-muted">
            {wall.cameras.length === 0 ? "Камер нет" : `В работе ${working} из ${wall.cameras.length}`}
          </p>
        </div>
        <Clock />
        <ObjectSwitcher objects={wall.objects} value={wall.objectId} onChange={(id) => router.replace(`/security/cameras?object=${encodeURIComponent(id)}`)} />
        <div className="flex items-center gap-2">
          <button type="button" onClick={toggleFullscreen} className="btn btn-secondary btn-compact">
            {fullscreen ? "Выйти из полноэкранного" : "Во весь экран"}
          </button>
          {fullscreen ? null : (
            <button type="button" onClick={() => window.close()} className="btn btn-secondary btn-compact">
              Закрыть окно
            </button>
          )}
        </div>
      </header>

      <main className="min-h-0 flex-1 p-4 lg:p-5">
        {wall.cameras.length === 0 ? (
          <p className="panel p-6 text-[15px] text-muted">На объекте «{wall.objectName}» камер нет.</p>
        ) : (
          <ul
            className={`grid h-full gap-4 ${columns(wall.cameras.length)} lg:[grid-template-rows:repeat(var(--rows),minmax(0,1fr))]`}
            style={{ "--rows": rows(wall.cameras.length) } as CSSProperties}
          >
            {wall.cameras.map((camera) => (
              <CameraTile key={camera.id} camera={camera} objectId={wall.objectId} large />
            ))}
          </ul>
        )}
      </main>
    </div>
  );
}
