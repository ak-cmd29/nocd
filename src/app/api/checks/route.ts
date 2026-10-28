import { getAuthContext } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { MAX_CHECK_FILE_BYTES, validateKnowledgeCheckInput } from "@/lib/validation/knowledge-check";
import type { ApiErrorResponse, CreateCheckResponse } from "@/types";

function errorResponse(status: number, error: string, details?: string[]): Response {
  const body: ApiErrorResponse = details ? { error, details } : { error };
  return Response.json(body, { status });
}

export async function POST(request: Request): Promise<Response> {
  const supabase = await createClient();
  const auth = await getAuthContext(supabase);
  if (!auth) {
    return errorResponse(401, "You must be signed in to publish a knowledge check.");
  }
  if (auth.role !== "manager") {
    return errorResponse(403, "Only managers can publish knowledge checks.");
  }

  const declaredLength = Number(request.headers.get("content-length") ?? "0");
  if (declaredLength > MAX_CHECK_FILE_BYTES) {
    return errorResponse(413, "Knowledge check payload exceeds the 1 MB limit.");
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return errorResponse(400, "Request body must be valid JSON.");
  }

  const validation = validateKnowledgeCheckInput(payload);
  if (!validation.ok) {
    return errorResponse(422, "Knowledge check failed validation.", validation.errors);
  }

  const { data, error } = await supabase
    .from("knowledge_checks")
    .insert({ ...validation.value, manager_id: auth.userId })
    .select("id")
    .single();

  if (error || !data) {
    console.error("Failed to insert knowledge check", error);
    return errorResponse(500, "Could not save the knowledge check. Please try again.");
  }

  const body: CreateCheckResponse = { id: data.id };
  return Response.json(body, { status: 201 });
}
