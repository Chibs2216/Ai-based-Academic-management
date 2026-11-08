// summarize-material: AI summary of a course material (text or PDF) with Claude.
//
// POST { material_id: string, length?: "short" | "detailed", regenerate?: boolean }
// -> 200 { summary, length, model, cached, created_at }
//
// Access is checked with the caller's own token, so RLS decides whether they may
// read the material. Summaries are cached per (material, length) and shared by
// everyone in the course; pass regenerate: true to replace the cached one.

import Anthropic from "npm:@anthropic-ai/sdk@1.6.0";
import { createClient } from "npm:@supabase/supabase-js@2.119.0";

const MODEL = "claude-opus-5-5";
const MAX_PDF_BYTES = 30 * 1024 * 1024;
const MAX_TEXT_CHARS = 400_000;

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

function fail(status: number, code: string, message: string): Response {
  return json(status, { error: { code, message } });
}

const SYSTEM_PROMPT = `You summarize university course materials for the students taking the course.
Write in clear, plain English that a second- or third-year undergraduate can follow.
Keep the meaning of the source exactly: do not add facts, examples or claims that are not in the material.
Keep technical terms, definitions, formulas and code identifiers as the source writes them.
Output plain text only: no headings, no Markdown, no preamble such as "Here is a summary".`;

const LENGTH_INSTRUCTIONS: Record<string, string> = {
  short: "Write a short summary of 2 to 4 sentences that captures the main idea and the most important points.",
  detailed:
    "Write a detailed summary of 2 to 4 short paragraphs. Cover every main concept in the order the material presents it, and finish with one sentence on what a student should be able to do after studying it.",
};

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return fail(405, "method_not_allowed", "Use POST.");

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return fail(401, "unauthenticated", "Sign in first.");

  let body: { material_id?: string; length?: string; regenerate?: boolean };
  try {
    body = await req.json();
  } catch {
    return fail(400, "bad_request", "Send a JSON body.");
  }
  const materialId = body.material_id;
  const length = body.length ?? "short";
  if (!materialId) return fail(400, "bad_request", "material_id is required.");
  if (!(length in LENGTH_INSTRUCTIONS)) return fail(400, "bad_request", "length must be short or detailed.");

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const userClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false },
  });
  const adminClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { persistSession: false },
  });

  const { data: userData, error: userError } = await userClient.auth.getUser();
  if (userError || !userData.user) return fail(401, "unauthenticated", "Your session has expired. Sign in again.");

  // Feature switch (admins can turn the summarizer off in System Settings).
  const { data: setting } = await userClient
    .from("app_settings").select("value").eq("key", "ai_summaries_enabled").maybeSingle();
  if (setting && setting.value === false) {
    return fail(503, "ai_disabled", "AI summaries are turned off by your administrator.");
  }

  // RLS: returns nothing unless the caller can see this course.
  const { data: material, error: materialError } = await userClient
    .from("materials")
    .select("id, title, kind, body_text, storage_path, mime_type, size_bytes")
    .eq("id", materialId)
    .maybeSingle();
  if (materialError) return fail(500, "db_error", materialError.message);
  if (!material) return fail(404, "not_found", "Material not found, or you are not in this course.");

  if (!body.regenerate) {
    const { data: cached } = await userClient
      .from("material_summaries")
      .select("summary, length, model, created_at")
      .eq("material_id", materialId)
      .eq("length", length)
      .maybeSingle();
    if (cached) return json(200, { ...cached, cached: true });
  }

  // Build the document content for Claude.
  let content: Anthropic.Beta.BetaContentBlockParam[];
  const instruction = `${LENGTH_INSTRUCTIONS[length]}\n\nMaterial title: ${material.title}`;

  if (material.body_text && material.body_text.trim()) {
    if (material.body_text.length > MAX_TEXT_CHARS) {
      return fail(413, "too_large", "This material is too long to summarize in one go.");
    }
    content = [
      { type: "document", source: { type: "text", media_type: "text/plain", data: material.body_text }, title: material.title },
      { type: "text", text: instruction },
    ];
  } else if (material.storage_path) {
    const { data: file, error: downloadError } = await userClient.storage
      .from("course-materials").download(material.storage_path);
    if (downloadError || !file) return fail(404, "file_missing", "The material's file could not be found in storage.");

    const mime = material.mime_type || file.type;
    const bytes = new Uint8Array(await file.arrayBuffer());

    if (mime === "application/pdf") {
      if (bytes.byteLength > MAX_PDF_BYTES) {
        return fail(413, "too_large", "PDFs larger than 30 MB cannot be summarized.");
      }
      content = [
        { type: "document", source: { type: "base64", media_type: "application/pdf", data: bytesToBase64(bytes) }, title: material.title },
        { type: "text", text: instruction },
      ];
    } else if (mime.startsWith("text/")) {
      const text = new TextDecoder().decode(bytes);
      if (text.length > MAX_TEXT_CHARS) return fail(413, "too_large", "This material is too long to summarize in one go.");
      content = [
        { type: "document", source: { type: "text", media_type: "text/plain", data: text }, title: material.title },
        { type: "text", text: instruction },
      ];
    } else {
      return fail(422, "unsupported_type", "Only PDF and text materials can be summarized right now.");
    }
  } else {
    return fail(422, "unsupported_type", "This material is a link; there is no text to summarize.");
  }

  const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
  if (!apiKey) return fail(503, "ai_unavailable", "The AI summarizer is not configured yet. Try again later.");

  const anthropic = new Anthropic({ apiKey });

  let summary: string;
  let servedBy: string;
  try {
    const response = await anthropic.beta.messages.create({
      model: MODEL,
      max_tokens: 16000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: { effort: "low" },
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content }],
    });

    if (response.stop_reason === "refusal") {
      return fail(422, "refused", "The AI could not summarize this material. Ask your teacher if the content is correct.");
    }
    summary = response.content
      .flatMap((block) => (block.type === "text" ? [block.text] : []))
      .join("")
      .trim();
    servedBy = response.model;
    if (!summary) return fail(502, "empty_summary", "The AI returned an empty summary. Try again.");
  } catch (err) {
    if (err instanceof Anthropic.RateLimitError) {
      return fail(429, "ai_busy", "The AI service is busy. Wait a moment and try again.");
    }
    if (err instanceof Anthropic.AuthenticationError || err instanceof Anthropic.PermissionDeniedError) {
      console.error("Anthropic credentials rejected", err.status);
      return fail(503, "ai_unavailable", "The AI summarizer is not configured correctly. Tell your administrator.");
    }
    if (err instanceof Anthropic.BadRequestError) {
      console.error("Anthropic rejected the request", err.message);
      return fail(422, "ai_rejected", "This material could not be processed by the AI.");
    }
    if (err instanceof Anthropic.APIConnectionError) {
      return fail(503, "ai_unavailable", "Could not reach the AI service. Try again shortly.");
    }
    if (err instanceof Anthropic.APIError) {
      console.error("Anthropic API error", err.status, err.message);
      return fail(502, "ai_error", "The AI service had a problem. Try again shortly.");
    }
    throw err;
  }

  const { data: saved, error: saveError } = await adminClient
    .from("material_summaries")
    .upsert(
      { material_id: materialId, length, summary, model: servedBy, generated_by: userData.user.id, created_at: new Date().toISOString() },
      { onConflict: "material_id,length" },
    )
    .select("summary, length, model, created_at")
    .single();
  if (saveError) {
    console.error("Could not cache summary", saveError.message);
    return json(200, { summary, length, model: servedBy, cached: false, created_at: new Date().toISOString() });
  }

  return json(200, { ...saved, cached: false });
});
