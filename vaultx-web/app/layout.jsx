import './globals.css';
import { CyberBackdrop } from '../components/CyberBackdrop.jsx';
import { ThemeProvider } from '../components/ThemeProvider.jsx';
import { AuthProvider } from '../lib/authContext.js';

export const metadata = {
  title: "VaultX | Zero-Knowledge File & Secret Sharing",
  description: "Secure, client-side encrypted zero-knowledge file and secret sharing platform.",
  icons: {
    icon: [
      { url: '/favicon.ico', sizes: 'any' },
      { url: '/icon.png', type: 'image/png', sizes: '32x32' },
    ],
    shortcut: '/favicon.ico',
    apple: [
      { url: '/apple-icon.png', sizes: '180x180', type: 'image/png' },
    ],
  },
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="font-sans antialiased bg-white text-zinc-900 dark:bg-[#050508] dark:text-[#FAFAFA] min-h-screen selection:bg-zinc-200 selection:text-zinc-900 dark:selection:bg-zinc-800 dark:selection:text-zinc-100 transition-colors duration-150">
        <ThemeProvider>
          <AuthProvider>
            <CyberBackdrop />
            {children}
          </AuthProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
