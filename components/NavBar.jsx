"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { logout } from "@/app/(auth)/actions";

const links = [
  { href: "/bills", label: "บิลของฉัน", icon: "🧾" },
  { href: "/bills/new", label: "สร้างบิล", icon: "➕" },
  { href: "/outstanding", label: "บิลคงค้าง", icon: "⏳" },
  { href: "/people", label: "รายชื่อคน", icon: "👥" },
  { href: "/settings", label: "ตั้งค่า", icon: "⚙️" },
];

function isActive(pathname, href) {
  return href === "/bills" ? pathname === "/bills" : pathname.startsWith(href);
}

export default function NavBar({ email, displayName }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  return (
    <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/90 backdrop-blur">
      <div className="mx-auto max-w-3xl px-4">
        <div className="flex h-14 items-center justify-between">
          <Link href="/bills" className="font-bold text-slate-900">
            💸 หารบิล
          </Link>

          <nav className="hidden md:flex items-center gap-1">
            {links.map((l) => (
              <Link
                key={l.href}
                href={l.href}
                className={`rounded-lg px-3 py-1.5 text-sm font-medium transition ${
                  isActive(pathname, l.href)
                    ? "bg-brand-50 text-brand-700"
                    : "text-slate-600 hover:bg-slate-100"
                }`}
              >
                {l.label}
              </Link>
            ))}
          </nav>

          <div className="flex items-center gap-3">
            <span className="hidden sm:inline text-sm text-slate-500">
              {displayName || email}
            </span>
            <form action={logout}>
              <button className="btn-secondary !px-3 !py-1.5 text-xs">
                ออกจากระบบ
              </button>
            </form>
            <button
              className="md:hidden rounded-lg p-2 hover:bg-slate-100"
              onClick={() => setOpen((v) => !v)}
              aria-label="เมนู"
              aria-expanded={open}
            >
              ☰
            </button>
          </div>
        </div>

        {open && (
          <nav className="md:hidden flex flex-col gap-1 pb-3">
            {links.map((l) => (
              <Link
                key={l.href}
                href={l.href}
                onClick={() => setOpen(false)}
                className={`rounded-lg px-3 py-2 text-sm font-medium ${
                  isActive(pathname, l.href)
                    ? "bg-brand-50 text-brand-700"
                    : "text-slate-600 hover:bg-slate-100"
                }`}
              >
                {l.icon} {l.label}
              </Link>
            ))}
          </nav>
        )}
      </div>
    </header>
  );
}
