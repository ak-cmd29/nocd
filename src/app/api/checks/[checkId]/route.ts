import type { NextRequest } from "next/server";
import { RECORDING_EXTENSIONS, RECORDINGS_BUCKET, recordingPath } from "@/lib/assessment/recordings";
import { getAuthContext } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { isUuid } from "@/lib/utils";
import { REQUIRED_QUESTION_COUNT } from "@/lib/validation/knowledge-check";
import type { ApiErrorResponse, DeleteCheckResponse } from "@/types";

function errorResponse(status: number, error: string): Response {
  const body: ApiErrorResponse = { error };
  return Response.json(body, { status });
}

export async function DELETE(_request: NextRequest, context: RouteContext<"/api/checks/[checkId]">): Promise<Response> {
  const { checkId } = await context.params;

  const supabase = await createClient();
  const auth = await getAuthContext(supabase);
  if (!auth) {
    return errorResponse(401, "You must be signed in to remove a knowledge check.");
  }
  if (auth.role !== "manager") {
    return errorResponse(403, "Only managers can remove knowledge checks.");
  }
  if (!isUuid(checkId)) {
    return errorResponse(404, "Knowledge check not found.");
  }

  let admin;
  try {
    admin = createAdminClient();
  } catch (error) {
    console.error("Service-role client unavailable", error);
    return errorResponse(500, "The server is misconfigured. Contact an administrator.");
  }

  const { data: attempts, error: attemptsError } = await admin.from("attempts").select("id").eq("check_id", checkId);
  if (attemptsError) {
    console.error("Failed to list attempts for knowledge check", attemptsError);
    return errorResponse(500, "Could not remove the knowledge check. Please try again.");
  }

  // Attempts are removed by the ON DELETE CASCADE on attempts.check_id.
  const { data: deleted, error: deleteError } = await admin
    .from("knowledge_checks")
    .delete()
    .eq("id", checkId)
    .select("id");
  if (deleteError) {
    console.error("Failed to delete knowledge check", deleteError);
    return errorResponse(500, "Could not remove the knowledge check. Please try again.");
  }
  if (deleted.length === 0) {
    return errorResponse(404, "Knowledge check not found. It may already have been removed.");
  }

  const recordingPaths = attempts.flatMap(({ id }) =>
    Array.from({ length: REQUIRED_QUESTION_COUNT }, (_, index) =>
      RECORDING_EXTENSIONS.map((extension) => recordingPath(id, index, extension)),
    ).flat(),
  );
  if (recordingPaths.length > 0) {
    const { error: storageError } = await admin.storage.from(RECORDINGS_BUCKET).remove(recordingPaths);
    if (storageError) {
      console.error("Knowledge check removed but its recordings could not be deleted", { checkId, storageError });
    }
  }

  const body: DeleteCheckResponse = { id: checkId, deletedAttempts: attempts.length };
  return Response.json(body);
}
