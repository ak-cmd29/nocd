import Link from "next/link";
import { LogOut } from "lucide-react";
import { signOut } from "@/app/login/actions";
import type { UserRole } from "@/types";

interface AppHeaderProps {
  email: string;
  role: UserRole;
}

export function AppHeader({ email, role }: AppHeaderProps) {
  return (
    <header className="border-b border-slate-200 bg-white">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-6 py-4">
        <Link href="/" className="flex flex-col">
          <span className="text-xs font-semibold uppercase tracking-widest text-indigo-600">NOCD Intake Operations</span>
          <span className="text-base font-semibold text-slate-900">AI Knowledge Check</span>
        </Link>
        <div className="flex items-center gap-4">
          <div className="hidden text-right sm:block">
            <p className="text-sm font-medium text-slate-900">{email}</p>
            <p className="text-xs capitalize text-slate-500">{role}</p>
          </div>
          <form action={signOut}>
            <button
              type="submit"
              className="flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-sm font-medium text-slate-600 transition hover:bg-slate-50 hover:text-slate-900"
            >
              <LogOut className="size-4" aria-hidden />
              Sign out
            </button>
          </form>
        </div>
      </div>
    </header>
  );
}
