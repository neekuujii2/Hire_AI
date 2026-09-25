import type { ReactNode } from "react";
import Link from "next/link";

export default function CareersLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-white">
      <header className="flex items-center justify-between px-6 py-4 border-b">
        <Link href="/" className="font-semibold text-xl">
          HireAI
        </Link>
      </header>
      <main>{children}</main>
      <footer className="py-8 text-center text-sm text-gray-500 border-t mt-12">
        Powered by <a href="https://deepinterview.ai" className="underline">HireAI</a>
      </footer>
    </div>
  );
}
