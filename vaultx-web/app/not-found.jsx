import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center p-4 text-center">
      <h2 className="text-2xl font-bold">404 - Page Not Found</h2>
      <p className="mt-2 text-sm text-zinc-500">The requested resource could not be found.</p>
      <Link href="/" className="mt-4 rounded-md bg-zinc-900 px-4 py-2 text-xs font-semibold text-white">
        Return Home
      </Link>
    </div>
  );
}
