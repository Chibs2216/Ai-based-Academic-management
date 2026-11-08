// mfa-recovery: one-time backup codes for users who lose their authenticator.
// Supabase Auth has no built-in recovery codes, so they live here.
//
// POST { action: "generate" }  (requires an aal2 session)
//      -> { codes: string[] }   Shown once. Replaces any previous set.
// POST { action: "status" }
//      -> { remaining: number }
// POST { action: "redeem", code: "ABCD-EFGH" }  (works at aal1, i.e. right after the password step)
//      Burns the code and removes the user's MFA factors so they can sign in and enroll again.

import { createClient } from "npm:@supabase/supabase-js@2.119.0";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const CODE_COUNT = 10;
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no 0/O/1/I
const MAX_FAILED_REDEEMS = 5;
const FAILED_WINDOW_MINUTES = 15;

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });
}
function fail(status: number, code: string, message: string): Response {
  return json(status, { error: { code, message } });
}

function newCode(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(8));
  const chars = Array.from(bytes, (b) => ALPHABET[b % ALPHABET.length]).join("");
  return `${chars.slice(0, 4)}-${chars.slice(4)}`;
}

function normalize(code: string): string {
  const clean = code.toUpperCase().replace(/[^A-Z0-9]/g, "");
  return clean.length === 8 ? `${clean.slice(0, 4)}-${clean.slice(4)}` : clean;
}

async function sha256(text: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return fail(405, "method_not_allowed", "Use POST.");

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return fail(401, "unauthenticated", "Sign in first.");
  const token = authHeader.replace(/^Bearer\s+/i, "");

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const admin = createClient(supabaseUrl, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { persistSession: false },
  });

  // Verify the caller's JWT and read its assurance level.
  const { data: claimsData, error: claimsError } = await admin.auth.getClaims(token);
  if (claimsError || !claimsData?.claims?.sub) return fail(401, "unauthenticated", "Your session has expired. Sign in again.");
  const userId = claimsData.claims.sub as string;
  const aal = (claimsData.claims.aal as string | undefined) ?? "aal1";
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || null;

  let body: { action?: string; code?: string };
  try {
    body = await req.json();
  } catch {
    return fail(400, "bad_request", "Send a JSON body.");
  }

  if (body.action === "generate") {
    if (aal !== "aal2") {
      return fail(403, "mfa_required", "Verify with your authenticator app before creating backup codes.");
    }
    const codes = Array.from({ length: CODE_COUNT }, newCode);
    const rows = await Promise.all(codes.map(async (code) => ({ user_id: userId, code_hash: await sha256(code) })));

    const { error: deleteError } = await admin.from("mfa_recovery_codes").delete().eq("user_id", userId);
    if (deleteError) return fail(500, "db_error", deleteError.message);
    const { error: insertError } = await admin.from("mfa_recovery_codes").insert(rows);
    if (insertError) return fail(500, "db_error", insertError.message);

    await admin.from("audit_logs").insert({
      actor_id: userId, action: "mfa.recovery_codes_generated", target_type: "user", target_id: userId, ip,
    });
    return json(200, { codes });
  }

  if (body.action === "status") {
    const { count, error } = await admin
      .from("mfa_recovery_codes")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .is("used_at", null);
    if (error) return fail(500, "db_error", error.message);
    return json(200, { remaining: count ?? 0 });
  }

  if (body.action === "redeem") {
    if (!body.code) return fail(400, "bad_request", "Enter one of your backup codes.");

    // Throttle guessing: at most 5 failed attempts per 15 minutes.
    const since = new Date(Date.now() - FAILED_WINDOW_MINUTES * 60_000).toISOString();
    const { count: recentFailures } = await admin
      .from("audit_logs")
      .select("id", { count: "exact", head: true })
      .eq("target_id", userId)
      .eq("action", "mfa.recovery.failed")
      .gte("created_at", since);
    if ((recentFailures ?? 0) >= MAX_FAILED_REDEEMS) {
      return fail(429, "too_many_attempts", `Too many wrong codes. Wait ${FAILED_WINDOW_MINUTES} minutes or contact an administrator.`);
    }

    const hash = await sha256(normalize(body.code));
    const { data: match, error: matchError } = await admin
      .from("mfa_recovery_codes")
      .update({ used_at: new Date().toISOString() })
      .eq("user_id", userId)
      .eq("code_hash", hash)
      .is("used_at", null)
      .select("id")
      .maybeSingle();
    if (matchError) return fail(500, "db_error", matchError.message);

    if (!match) {
      await admin.from("audit_logs").insert({
        actor_id: userId, action: "mfa.recovery.failed", target_type: "user", target_id: userId, ip,
      });
      return fail(400, "invalid_code", "That code is wrong or has already been used.");
    }

    const { data: factorData, error: listError } = await admin.auth.admin.mfa.listFactors({ userId });
    if (listError) return fail(500, "auth_error", listError.message);
    for (const factor of factorData.factors) {
      await admin.auth.admin.mfa.deleteFactor({ id: factor.id, userId });
    }
    await admin.from("mfa_recovery_codes").delete().eq("user_id", userId).is("used_at", null);

    await admin.from("audit_logs").insert({
      actor_id: userId, action: "mfa.recovery_code_used", target_type: "user", target_id: userId, ip,
      details: { factors_removed: factorData.factors.length },
    });
    await admin.from("notifications").insert({
      user_id: userId, type: "system", email: true,
      title: "A backup code was used on your account",
      body: "Your two-step verification was turned off with a backup code. If this wasn't you, contact an administrator now.",
    });

    return json(200, {
      ok: true,
      message: "Backup code accepted. Sign in again, then set up two-step verification with your new device.",
    });
  }

  return fail(400, "bad_request", "Unknown action.");
});
