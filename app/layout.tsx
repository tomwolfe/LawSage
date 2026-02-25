import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "LawSage - The Pro Se Architect",
  description: "Legal democratization platform for the people.",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "LawSage",
  },
};

export const viewport: Viewport = {
  themeColor: "#4f46e5",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <head>
        <link rel="apple-touch-icon" href="/icon-192.png" />
        <script
          dangerouslySetInnerHTML={{
            __html: `
              if ('serviceWorker' in navigator) {
                window.addEventListener('load', function() {
                  navigator.serviceWorker.register('/sw.js')
                    .then(function(registration) {
                      console.log('ServiceWorker registered: ', registration.scope);
                    })
                    .catch(function(error) {
                      console.log('ServiceWorker registration failed: ', error);
                    });
                });
              }
            `,
          }}
        />
      </head>
      <body className={`${inter.className} bg-slate-50 text-slate-900 min-h-screen flex flex-col`}>
        <header className="bg-white border-b border-slate-200 py-4 px-6 flex justify-between items-center sticky top-0 z-50">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center">
              <span className="text-white font-bold text-xl">L</span>
            </div>
            <h1 className="text-xl font-bold tracking-tight">LawSage</h1>
          </div>
          <div id="settings-portal"></div>
        </header>
        
        <main className="flex-1 max-w-5xl mx-auto w-full p-4 md:p-8">
          {children}
        </main>

        <footer className="bg-slate-900 text-slate-400 py-6 px-6 text-center text-sm">
          <p className="max-w-2xl mx-auto">
            <span className="font-semibold text-white block mb-2 underline decoration-red-500">Legal Disclaimer:</span>
            I am an AI, not an attorney. This tool provides legal information, not legal advice. 
            Use of this tool does not create an attorney-client relationship. 
            This tool is intended to help users representing themselves (Pro Se).
          </p>
          <p className="mt-4">© {new Date().getFullYear()} LawSage. All rights reserved.</p>
        </footer>
      </body>
    </html>
  );
}
