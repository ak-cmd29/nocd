import { readFileSync } from "node:fs";
import { createClient, type SupabaseClient, type User } from "@supabase/supabase-js";
import type { KnowledgeCheck, Question, UserRole } from "../src/types";

interface SeedUser {
  email: string;
  password: string;
  role: UserRole;
}

type KnowledgeCheckInput = Pick<KnowledgeCheck, "topic" | "reference_material" | "questions">;

const SEED_USERS: readonly SeedUser[] = [
  { email: "manager@nocd.com", password: "password123", role: "manager" },
  { email: "agent@nocd.com", password: "password123", role: "agent" },
];

const SAMPLE_CHECK_PATH = new URL("../sample_check.json", import.meta.url);

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

async function findUserByEmail(supabase: SupabaseClient, email: string): Promise<User | null> {
  const perPage = 1000;
  for (let page = 1; ; page++) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage });
    if (error) throw error;
    const match = data.users.find((user) => user.email?.toLowerCase() === email.toLowerCase());
    if (match) return match;
    if (data.users.length < perPage) return null;
  }
}

async function upsertUser(supabase: SupabaseClient, seed: SeedUser): Promise<User> {
  const { data, error } = await supabase.auth.admin.createUser({
    email: seed.email,
    password: seed.password,
    email_confirm: true,
    app_metadata: { role: seed.role },
    user_metadata: { role: seed.role },
  });

  let user: User;
  if (!error) {
    user = data.user;
    console.log(`Created ${seed.role}: ${seed.email}`);
  } else {
    const existing = await findUserByEmail(supabase, seed.email);
    if (!existing) throw error;

    const updated = await supabase.auth.admin.updateUserById(existing.id, {
      password: seed.password,
      email_confirm: true,
      app_metadata: { ...existing.app_metadata, role: seed.role },
      user_metadata: { ...existing.user_metadata, role: seed.role },
    });
    if (updated.error) throw updated.error;
    user = updated.data.user;
    console.log(`Updated existing ${seed.role}: ${seed.email}`);
  }

  const { error: profileError } = await supabase
    .from("profiles")
    .upsert({ id: user.id, email: seed.email, role: seed.role }, { onConflict: "id" });
  if (profileError) throw profileError;

  return user;
}

function isQuestion(value: unknown): value is Question {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.id === "string" &&
    typeof candidate.prompt === "string" &&
    typeof candidate.criteria === "string" &&
    (candidate.sample_good_response === undefined || typeof candidate.sample_good_response === "string")
  );
}

function loadSampleCheck(): KnowledgeCheckInput {
  const parsed: unknown = JSON.parse(readFileSync(SAMPLE_CHECK_PATH, "utf8"));
  if (typeof parsed !== "object" || parsed === null) {
    throw new Error("sample_check.json must contain a JSON object.");
  }
  const candidate = parsed as Record<string, unknown>;
  if (
    typeof candidate.topic !== "string" ||
    typeof candidate.reference_material !== "string" ||
    !Array.isArray(candidate.questions) ||
    !candidate.questions.every(isQuestion)
  ) {
    throw new Error("sample_check.json does not match the KnowledgeCheck shape.");
  }
  return {
    topic: candidate.topic,
    reference_material: candidate.reference_material,
    questions: candidate.questions,
  };
}

async function seedSampleCheck(supabase: SupabaseClient, managerId: string): Promise<void> {
  const check = loadSampleCheck();

  const { data: existing, error: lookupError } = await supabase
    .from("knowledge_checks")
    .select("id")
    .eq("topic", check.topic)
    .eq("manager_id", managerId)
    .limit(1);
  if (lookupError) throw lookupError;

  if (existing.length > 0) {
    console.log(`Sample check already exists (${existing[0].id}); skipping.`);
    return;
  }

  const { data, error } = await supabase
    .from("knowledge_checks")
    .insert({ ...check, manager_id: managerId })
    .select("id")
    .single();
  if (error) throw error;
  console.log(`Inserted sample check (${data.id}).`);
}

async function main(): Promise<void> {
  const supabase = createClient(
    requireEnv("NEXT_PUBLIC_SUPABASE_URL"),
    requireEnv("SUPABASE_SERVICE_ROLE_KEY"),
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

  let managerId: string | null = null;
  for (const seed of SEED_USERS) {
    const user = await upsertUser(supabase, seed);
    if (seed.role === "manager") managerId = user.id;
  }

  if (!managerId) throw new Error("No manager user was seeded.");
  await seedSampleCheck(supabase, managerId);
}

main().catch((error: unknown) => {
  console.error("Seed failed:", error);
  process.exit(1);
});
