"use client";

import { useActionState } from "react";
import { CircleAlert, LoaderCircle } from "lucide-react";
import { signIn, type SignInState } from "./actions";

const INITIAL_STATE: SignInState = { error: null };

interface LoginFormProps {
  next: string | null;
}

export function LoginForm({ next }: LoginFormProps) {
  const [state, formAction, isPending] = useActionState(signIn, INITIAL_STATE);

  return (
    <form action={formAction} className="space-y-4">
      {next ? <input type="hidden" name="next" value={next} /> : null}

      <div className="space-y-1.5">
        <label htmlFor="email" className="block text-sm font-medium text-slate-700">
          Work email
        </label>
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
          className="block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20"
        />
      </div>

      <div className="space-y-1.5">
        <label htmlFor="password" className="block text-sm font-medium text-slate-700">
          Password
        </label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          className="block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20"
        />
      </div>

      {state.error ? (
        <p role="alert" className="flex items-start gap-2 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">
          <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
          {state.error}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={isPending}
        className="flex w-full items-center justify-center gap-2 rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {isPending ? <LoaderCircle className="size-4 animate-spin" aria-hidden /> : null}
        {isPending ? "Signing in…" : "Sign in"}
      </button>
    </form>
  );
}
