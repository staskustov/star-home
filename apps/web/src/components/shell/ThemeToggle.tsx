"use client";

export function ThemeToggle() {
  return (
    <button
      type="button"
      className="theme-toggle btn btn-secondary"
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
