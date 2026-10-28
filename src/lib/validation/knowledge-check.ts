import type { KnowledgeCheckInput, Question } from "@/types";

export const REQUIRED_QUESTION_COUNT = 3;
export const MAX_CHECK_FILE_BYTES = 1_000_000;

export const CHECK_FIELD_LIMITS = {
  topic: 200,
  referenceMaterial: 50_000,
  questionId: 64,
  prompt: 2_000,
  criteria: 8_000,
  sampleGoodResponse: 8_000,
} as const;

const QUESTION_ID_PATTERN = /^[A-Za-z0-9_-]+$/;

export type KnowledgeCheckValidationResult =
  | { ok: true; value: KnowledgeCheckInput }
  | { ok: false; errors: string[] };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readRequiredText(
  source: Record<string, unknown>,
  key: string,
  label: string,
  maxLength: number,
  errors: string[],
): string | null {
  const raw = source[key];
  if (typeof raw !== "string" || raw.trim().length === 0) {
    errors.push(`${label} is required and must be a non-empty string.`);
    return null;
  }
  const value = raw.trim();
  if (value.length > maxLength) {
    errors.push(`${label} must be at most ${maxLength.toLocaleString()} characters (got ${value.length.toLocaleString()}).`);
    return null;
  }
  return value;
}

function validateQuestion(raw: unknown, index: number, errors: string[]): Question | null {
  const label = `Question ${index + 1}`;
  if (!isRecord(raw)) {
    errors.push(`${label} must be an object with "prompt" and "criteria".`);
    return null;
  }

  const startingErrorCount = errors.length;

  let id = `q${index + 1}`;
  if (raw.id !== undefined) {
    if (typeof raw.id !== "string" || !QUESTION_ID_PATTERN.test(raw.id.trim())) {
      errors.push(`${label} "id" may only contain letters, numbers, hyphens, and underscores.`);
    } else if (raw.id.trim().length > CHECK_FIELD_LIMITS.questionId) {
      errors.push(`${label} "id" must be at most ${CHECK_FIELD_LIMITS.questionId} characters.`);
    } else {
      id = raw.id.trim();
    }
  }

  const prompt = readRequiredText(raw, "prompt", `${label} "prompt"`, CHECK_FIELD_LIMITS.prompt, errors);
  const criteria = readRequiredText(raw, "criteria", `${label} "criteria"`, CHECK_FIELD_LIMITS.criteria, errors);

  let sampleGoodResponse: string | undefined;
  if (raw.sample_good_response !== undefined && raw.sample_good_response !== null) {
    if (typeof raw.sample_good_response !== "string") {
      errors.push(`${label} "sample_good_response" must be a string when provided.`);
    } else if (raw.sample_good_response.trim().length > CHECK_FIELD_LIMITS.sampleGoodResponse) {
      errors.push(
        `${label} "sample_good_response" must be at most ${CHECK_FIELD_LIMITS.sampleGoodResponse.toLocaleString()} characters.`,
      );
    } else if (raw.sample_good_response.trim().length > 0) {
      sampleGoodResponse = raw.sample_good_response.trim();
    }
  }

  if (errors.length > startingErrorCount || prompt === null || criteria === null) {
    return null;
  }

  return sampleGoodResponse === undefined
    ? { id, prompt, criteria }
    : { id, prompt, criteria, sample_good_response: sampleGoodResponse };
}

export function validateKnowledgeCheckInput(input: unknown): KnowledgeCheckValidationResult {
  if (!isRecord(input)) {
    return { ok: false, errors: ["The file must contain a single JSON object."] };
  }

  const errors: string[] = [];

  const topic = readRequiredText(input, "topic", '"topic"', CHECK_FIELD_LIMITS.topic, errors);
  const referenceMaterial = readRequiredText(
    input,
    "reference_material",
    '"reference_material"',
    CHECK_FIELD_LIMITS.referenceMaterial,
    errors,
  );

  const questions: Question[] = [];
  if (!Array.isArray(input.questions)) {
    errors.push(`"questions" must be an array of exactly ${REQUIRED_QUESTION_COUNT} items.`);
  } else if (input.questions.length !== REQUIRED_QUESTION_COUNT) {
    errors.push(
      `"questions" must contain exactly ${REQUIRED_QUESTION_COUNT} items (got ${input.questions.length}).`,
    );
  } else {
    input.questions.forEach((raw, index) => {
      const question = validateQuestion(raw, index, errors);
      if (question) questions.push(question);
    });

    const seenIds = new Set<string>();
    for (const question of questions) {
      if (seenIds.has(question.id)) {
        errors.push(`Question ids must be unique ("${question.id}" appears more than once).`);
      }
      seenIds.add(question.id);
    }
  }

  if (errors.length > 0 || topic === null || referenceMaterial === null) {
    return { ok: false, errors };
  }

  return { ok: true, value: { topic, reference_material: referenceMaterial, questions } };
}
