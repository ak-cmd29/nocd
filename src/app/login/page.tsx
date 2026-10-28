import { Suspense } from "react";
import { redirect } from "next/navigation";
import { getAuthContext, homePathForRole, sanitizeRedirectPath } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { LoginForm } from "./login-form";

interface LoginGateProps {
  searchParams: PageProps<"/login">["searchParams"];
}

async function LoginGate({ searchParams }: LoginGateProps) {
  const supabase = await createClient();
  const auth = await getAuthContext(supabase);
  if (auth) redirect(homePathForRole(auth.role));

  const { next } = await searchParams;
  return <LoginForm next={sanitizeRedirectPath(typeof next === "string" ? next : null)} />;
}

export default function LoginPage({ searchParams }: PageProps<"/login">) {
  return (
    <main className="flex flex-1 items-center justify-center px-4 py-16">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <p className="text-xs font-semibold uppercase tracking-widest text-indigo-600">NOCD Intake Operations</p>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight text-slate-900">AI Knowledge Check</h1>
          <p className="mt-1 text-sm text-slate-500">Sign in with your manager or advocate account.</p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <Suspense fallback={<div aria-busy="true" className="h-[236px] animate-pulse rounded-lg bg-slate-100" />}>
            <LoginGate searchParams={searchParams} />
          </Suspense>
        </div>
      </div>
    </main>
  );
}
