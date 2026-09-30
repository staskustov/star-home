import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import { ServiceWorkerRegister } from "@/components/pwa/ServiceWorkerRegister";
import "./globals.css";

const inter = Inter({
  subsets: ["latin", "cyrillic"],
  variable: "--font-inter",
  display: "swap",
});

export const metadata: Metadata = {
  title: "STAR HOME",
  description: "Ваш дом. Ваша жизнь. Всё в одном приложении.",
  applicationName: "STAR HOME",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    title: "STAR HOME",
    statusBarStyle: "black-translucent",
  },
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "48x48" },
      { url: "/favicon.svg", type: "image/svg+xml" },
      { url: "/brand/icons/icon-32.png", sizes: "32x32", type: "image/png" },
      { url: "/brand/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/brand/icons/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
  },
};

export const viewport: Viewport = {
  themeColor: "#1B1713",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ru" className={`${inter.variable} h-full antialiased`} data-theme="dark" data-palette="bronze" suppressHydrationWarning>
      <head>
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@24,400,0..1,0&display=block"
        />
        <script
          dangerouslySetInnerHTML={{
            __html: "try{var raw=localStorage.getItem('star-home-appearance')||'dark:bronze';var parts=raw.split(':');var mode=parts[0]==='light'?'light':'dark';var palette=parts[1]||'bronze';if(mode==='light')document.documentElement.removeAttribute('data-theme');else document.documentElement.dataset.theme='dark';if(['bronze','blue','red','yellow','ink'].indexOf(palette)>=0)document.documentElement.dataset.palette=palette;var color=mode==='light'?'#ece5da':'#1b1713';var meta=document.querySelector('meta[name=\"theme-color\"]');if(meta)meta.setAttribute('content',color)}catch(e){document.documentElement.dataset.theme='dark';document.documentElement.dataset.palette='bronze'}",
          }}
        />
      </head>
      <body className="min-h-full">
        {children}
        <ServiceWorkerRegister />
      </body>
    </html>
  );
}
