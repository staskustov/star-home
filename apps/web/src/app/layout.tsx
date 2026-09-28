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
    statusBarStyle: "default",
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
  themeColor: "#f04444",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ru" className={`${inter.variable} h-full antialiased`} data-theme="dark" data-palette="bronze" suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: "try{var raw=localStorage.getItem('star-home-appearance')||'dark:bronze';var parts=raw.split(':');var mode=parts[0]==='light'?'light':'dark';var palette=parts[1]||'bronze';if(mode==='dark')document.documentElement.dataset.theme='dark';if(['bronze','blue','red','yellow','ink'].indexOf(palette)>=0)document.documentElement.dataset.palette=palette}catch(e){document.documentElement.dataset.theme='dark';document.documentElement.dataset.palette='bronze'}",
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
