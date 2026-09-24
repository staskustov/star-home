import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import { ServiceWorkerRegister } from "@/components/pwa/ServiceWorkerRegister";
import "./globals.css";

const inter = Inter({
  subsets: ["latin", "cyrillic"],
  variable: "--font-inter",
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
    icon: [{ url: "/pwa-icon/192", sizes: "192x192", type: "image/png" }],
    apple: [{ url: "/pwa-icon/180", sizes: "180x180" }],
  },
};

export const viewport: Viewport = {
  themeColor: "#1B1713",
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
