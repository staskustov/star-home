"use client";

import { useState, type UIEvent } from "react";
import { Icon } from "@/components/icons";
import { CameraViewer, orderCameras, type HomeCamera } from "@/components/home/CameraViewer";
import { HomeSection } from "@/components/home/HomeSection";

export function CameraBlock({ cameras }: { cameras: HomeCamera[] }) {
  const ordered = orderCameras(cameras);
  const [viewer, setViewer] = useState<number | null>(null);
  const [index, setIndex] = useState(0);

  if (ordered.length === 0) return null;

  function onScroll(event: UIEvent<HTMLDivElement>) {
    const target = event.currentTarget;
    const width = target.firstElementChild?.getBoundingClientRect().width ?? target.clientWidth;
    setIndex(Math.round(target.scrollLeft / (width + 10)));
  }

  return (
    <HomeSection title="Камеры" linkLabel="Все камеры" onAction={() => setViewer(0)} className="home-cams">
      <div className="cam-grid" onScroll={onScroll}>
        {ordered.map((item, position) => (
          <button
            key={item.id ?? item.name}
            type="button"
            aria-haspopup="dialog"
            aria-expanded={viewer === position}
            onClick={() => setViewer(position)}
            className="cam-tile"
          >
            <span className="cam-well">
              {item.id && item.hasFrame ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={`/api/smart-home/cameras/${item.id}/frame?t=last`} alt="" loading="lazy" />
              ) : (
                <Icon name="camera" className="h-6 w-6" />
              )}
            </span>
            <span className="cam-meta">
              <span className="min-w-0">
                <span className="cam-name">{item.name}</span>
                <span className="cam-state">
                  {item.scope === "project" ? "Проект" : "Объект"}
                  {item.state ? ` · ${item.state}` : ""}
                </span>
              </span>
              <Icon name="chevron" className="cam-chevron" />
            </span>
          </button>
        ))}
      </div>
      {ordered.length > 2 ? (
        <div className="cam-dots flex justify-center gap-1.5" aria-hidden>
          {ordered.map((item, position) => (
            <span
              key={item.id ?? item.name}
              className={`h-1.5 rounded-full transition-all duration-200 ${position === index ? "w-5 bg-ink" : "w-1.5 bg-muted/50"}`}
            />
          ))}
        </div>
      ) : null}
      {viewer !== null ? (
        <CameraViewer cameras={ordered} index={viewer} onClose={() => setViewer(null)} onSelect={setViewer} />
      ) : null}
    </HomeSection>
  );
}
