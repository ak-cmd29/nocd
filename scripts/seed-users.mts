import { createClient } from "@supabase/supabase-js";
import type { SupabaseClient, User } from "@supabase/supabase-js";

type SeedRole = "manager" | "agent";

interface SeedUser {
  email: string;
  password: string;
  role: SeedRole;
}

const SEED_USERS: readonly SeedUser[] = [
  { email: "manager@nocd.com", password: "password123", role: "manager" },
  { email: "agent@nocd.com", password: "password123", role: "agent" },
];

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

async function findUserByEmail(admin: SupabaseClient, email: string): Promise<User | null> {
  const perPage = 200;
  for (let page = 1; ; page += 1) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage });
    if (error) {
      throw new Error(`Failed to list users: ${error.message}`);
    }
    const match = data.users.find((user) => user.email?.toLowerCase() === email.toLowerCase());
    if (match) {
      return match;
    }
    if (data.users.length < perPage) {
      return null;
    }
  }
}

async function upsertSeedUser(admin: SupabaseClient, seed: SeedUser): Promise<string> {
  const attributes = {
    password: seed.password,
    email_confirm: true,
    app_metadata: { role: seed.role },
    user_metadata: { role: seed.role },
  };

  const existing = await findUserByEmail(admin, seed.email);

  let userId: string;
  if (existing) {
    const { error } = await admin.auth.admin.updateUserById(existing.id, attributes);
    if (error) {
      throw new Error(`Failed to update ${seed.email}: ${error.message}`);
    }
    userId = existing.id;
  } else {
    const { data, error } = await admin.auth.admin.createUser({ email: seed.email, ...attributes });
    if (error || !data.user) {
      throw new Error(`Failed to create ${seed.email}: ${error?.message ?? "no user returned"}`);
    }
    userId = data.user.id;
  }

  const { error: profileError } = await admin
    .from("profiles")
    .upsert({ id: userId, email: seed.email, role: seed.role }, { onConflict: "id" });
  if (profileError) {
    throw new Error(`Failed to upsert profile for ${seed.email}: ${profileError.message}`);
  }

  return existing ? "updated" : "created";
}

async function main(): Promise<void> {
  const admin = createClient(
    requireEnv("NEXT_PUBLIC_SUPABASE_URL"),
    requireEnv("SUPABASE_SERVICE_ROLE_KEY"),
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

  for (const seed of SEED_USERS) {
    const outcome = await upsertSeedUser(admin, seed);
    console.log(`${outcome}: ${seed.email} (${seed.role})`);
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
