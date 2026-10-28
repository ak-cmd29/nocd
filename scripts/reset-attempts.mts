import { createClient } from "@supabase/supabase-js";

const RECORDINGS_BUCKET = "recordings";
const DEFAULT_AGENT_EMAIL = "agent@nocd.com";

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

async function main(): Promise<void> {
  const email = (process.argv[2] ?? DEFAULT_AGENT_EMAIL).trim().toLowerCase();
  const admin = createClient(
    requireEnv("NEXT_PUBLIC_SUPABASE_URL"),
    requireEnv("SUPABASE_SERVICE_ROLE_KEY"),
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

  const { data: profile, error: profileError } = await admin
    .from("profiles")
    .select("id, role")
    .ilike("email", email)
    .maybeSingle();
  if (profileError) {
    throw new Error(`Failed to look up ${email}: ${profileError.message}`);
  }
  if (!profile) {
    throw new Error(`No profile found for ${email}`);
  }
  if (profile.role !== "agent") {
    throw new Error(`${email} is a ${profile.role}, not an agent`);
  }

  const { data: attempts, error: attemptsError } = await admin
    .from("attempts")
    .select("id")
    .eq("agent_id", profile.id);
  if (attemptsError) {
    throw new Error(`Failed to list attempts: ${attemptsError.message}`);
  }
  if (!attempts || attempts.length === 0) {
    console.log(`${email} has no attempts to reset`);
    return;
  }

  const recordingPaths = attempts.flatMap(({ id }) =>
    [1, 2, 3].flatMap((question) => ["webm", "mp4"].map((extension) => `attempts/${id}/q${question}.${extension}`)),
  );
  const { error: storageError } = await admin.storage.from(RECORDINGS_BUCKET).remove(recordingPaths);
  if (storageError) {
    throw new Error(`Failed to delete recordings: ${storageError.message}`);
  }

  const { error: deleteError } = await admin.from("attempts").delete().eq("agent_id", profile.id);
  if (deleteError) {
    throw new Error(`Failed to delete attempts: ${deleteError.message}`);
  }

  console.log(`reset: ${email} (${attempts.length} attempts and their recordings deleted)`);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
