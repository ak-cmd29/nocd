import { Suspense } from "react";
import { redirect } from "next/navigation";
import { PageSkeleton } from "@/components/page-skeleton";
import { getAuthContext, homePathForRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

async function RoleRedirect(): Promise<never> {
  const supabase = await createClient();
  const auth = await getAuthContext(supabase);
  redirect(auth ? homePathForRole(auth.role) : "/login");
}

export default function Home() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <RoleRedirect />
    </Suspense>
  );
}
