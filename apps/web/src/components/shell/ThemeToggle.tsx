"use client";

export function ThemeToggle() {
  return (
    <button
      type="button"
      className="theme-toggle inline-flex h-12 items-center rounded-[14px] border border-line bg-surface px-5 text-[15px] text-ink"
      onClick={() => {
        const root = document.documentElement;
        const dark = root.dataset.theme !== "dark";
        if (dark) root.dataset.theme = "dark";
        else delete root.dataset.theme;
        localStorage.setItem("star-home-theme", dark ? "dark" : "light");
      }}
    >
      <span className="theme-to-dark">Тёмная тема</span>
      <span className="theme-to-light">Светлая тема</span>
    </button>
  );
}
