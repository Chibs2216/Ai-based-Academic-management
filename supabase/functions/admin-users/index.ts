// admin-users: account management that needs the Auth admin API.
// Callable only by an active admin who has satisfied MFA.
//
// POST { action: "create", email, full_name, role, department_code?, institution_id?, password? }
//      Without a password an invitation email is sent instead.
// POST { action: "set_role", user_ids: string[], role }
// POST { action: "set_status", user_ids: string[], status: "active" | "inactive" | "locked" }
//      inactive/locked also blocks sign-in at the Auth level (ban); active lifts it.
// POST { action: "reset_mfa", user_ids: string[] }
//      Removes every MFA factor and backup code so the user can enroll again.
// POST { action: "send_password_reset", user_ids: string[], redirect_to? }

import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2.119.0";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const ROLES = ["student", "teacher", "admin"] as const;
const STATUSES = ["active", "inactive", "locked"] as const;
const MAX_BATCH = 200;

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });
}
function fail(status: number, code: string, message: string): Response {
  return json(status, { error: { code, message } });
}

function clientIp(req: Request): string | null {
  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || null;
}

async function audit(
  admin: SupabaseClient, actorId: string, action: string, targetId: string,
  details: Record<string, unknown>, ip: string | null,
) {
  const { error } = await admin.from("audit_logs").insert({
    actor_id: actorId, action, target_type: "user", target_id: targetId, details, ip,
  });
  if (error) console.error("audit insert failed", error.message);
}

function validIds(ids: unknown): string[] | null {
  if (!Array.isArray(ids) || ids.length === 0 || ids.length > MAX_BATCH) return null;
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  return ids.every((id) => typeof id === "string" && uuid.test(id)) ? (ids as string[]) : null;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return fail(405, "method_not_allowed", "Use POST.");

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return fail(401, "unauthenticated", "Sign in first.");

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const userClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false },
  });
  const admin = createClient(supabaseUrl, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { persistSession: false },
  });

  // Caller must be an active admin whose MFA requirement is met.
  const { data: account, error: accountError } = await userClient.rpc("get_my_account");
  if (accountError || !account) return fail(401, "unauthenticated", "Your session has expired. Sign in again.");
  if (account.role !== "admin" || account.status !== "active") {
    return fail(403, "forbidden", "Only administrators can manage accounts.");
  }
  if (!account.mfa?.satisfied) return fail(403, "mfa_required", "Complete MFA verification first.");
  const actorId: string = account.id;
  const ip = clientIp(req);

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return fail(400, "bad_request", "Send a JSON body.");
  }

  switch (body.action) {
    case "create": {
      const email = String(body.email ?? "").trim().toLowerCase();
      const fullName = String(body.full_name ?? "").trim();
      const role = String(body.role ?? "student");
      const password = body.password ? String(body.password) : null;
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return fail(400, "bad_request", "Enter a valid email address.");
      if (!fullName) return fail(400, "bad_request", "full_name is required.");
      if (!ROLES.includes(role as typeof ROLES[number])) return fail(400, "bad_request", "role must be student, teacher or admin.");
      if (password !== null && password.length < 10) return fail(400, "weak_password", "Passwords need at least 10 characters.");

      const appMetadata = {
        role,
        department_code: body.department_code ? String(body.department_code).toUpperCase() : undefined,
        institution_id: body.institution_id ? String(body.institution_id) : undefined,
      };

      let userId: string;
      if (password) {
        const { data, error } = await admin.auth.admin.createUser({
          email, password, email_confirm: true,
          app_metadata: appMetadata, user_metadata: { full_name: fullName },
        });
        if (error) return fail(400, "create_failed", error.message);
        userId = data.user.id;
      } else {
        const { data, error } = await admin.auth.admin.inviteUserByEmail(email, {
          data: { full_name: fullName },
          redirectTo: body.redirect_to ? String(body.redirect_to) : undefined,
        });
        if (error) return fail(400, "invite_failed", error.message);
        userId = data.user.id;
        // Invites cannot carry app_metadata, so set the role afterwards (server-side only).
        await admin.auth.admin.updateUserById(userId, { app_metadata: appMetadata });
        const { data: dept } = appMetadata.department_code
          ? await admin.from("departments").select("id").eq("code", appMetadata.department_code).maybeSingle()
          : { data: null };
        await admin.from("profiles").update({
          role, full_name: fullName, department_id: dept?.id ?? null,
          institution_id: appMetadata.institution_id ?? null,
        }).eq("id", userId);
      }

      await audit(admin, actorId, "user.created", userId, { email, role, invited: !password }, ip);
      return json(200, { user_id: userId, invited: !password });
    }

    case "set_role": {
      const ids = validIds(body.user_ids);
      const role = String(body.role ?? "");
      if (!ids) return fail(400, "bad_request", `user_ids must be 1-${MAX_BATCH} user IDs.`);
      if (!ROLES.includes(role as typeof ROLES[number])) return fail(400, "bad_request", "role must be student, teacher or admin.");
      if (role !== "admin" && ids.includes(actorId)) {
        return fail(400, "self_demotion", "You cannot remove your own administrator role.");
      }
      // Through the admin's own session, so the audit trigger records who did it.
      const { data, error } = await userClient.from("profiles").update({ role }).in("id", ids).select("id");
      if (error) return fail(400, "update_failed", error.message);
      // Keep app_metadata in step for anything that reads the JWT.
      await Promise.all(ids.map((id) => admin.auth.admin.updateUserById(id, { app_metadata: { role } })));
      return json(200, { updated: data?.length ?? 0 });
    }

    case "set_status": {
      const ids = validIds(body.user_ids);
      const status = String(body.status ?? "");
      if (!ids) return fail(400, "bad_request", `user_ids must be 1-${MAX_BATCH} user IDs.`);
      if (!STATUSES.includes(status as typeof STATUSES[number])) {
        return fail(400, "bad_request", "status must be active, inactive or locked.");
      }
      if (status !== "active" && ids.includes(actorId)) {
        return fail(400, "self_lockout", "You cannot deactivate or lock your own account.");
      }
      const { data, error } = await userClient.from("profiles").update({ status }).in("id", ids).select("id");
      if (error) return fail(400, "update_failed", error.message);
      // A ban stops new sign-ins and token refreshes at the Auth level.
      const banDuration = status === "active" ? "none" : "876000h";
      const results = await Promise.all(
        ids.map((id) => admin.auth.admin.updateUserById(id, { ban_duration: banDuration })),
      );
      const failed = results.filter((r) => r.error).length;
      return json(200, { updated: data?.length ?? 0, auth_update_failures: failed });
    }

    case "reset_mfa": {
      const ids = validIds(body.user_ids);
      if (!ids) return fail(400, "bad_request", `user_ids must be 1-${MAX_BATCH} user IDs.`);
      const outcome: Record<string, number | string> = {};
      for (const id of ids) {
        const { data, error } = await admin.auth.admin.mfa.listFactors({ userId: id });
        if (error) {
          outcome[id] = `error: ${error.message}`;
          continue;
        }
        let removed = 0;
        for (const factor of data.factors) {
          const { error: deleteError } = await admin.auth.admin.mfa.deleteFactor({ id: factor.id, userId: id });
          if (!deleteError) removed++;
        }
        await admin.from("mfa_recovery_codes").delete().eq("user_id", id);
        await admin.from("notifications").insert({
          user_id: id, type: "system", email: true,
          title: "Your two-step verification was reset",
          body: "An administrator removed your MFA devices. Set up MFA again the next time you sign in.",
        });
        await audit(admin, actorId, "user.mfa_reset", id, { factors_removed: removed }, ip);
        outcome[id] = removed;
      }
      return json(200, { factors_removed: outcome });
    }

    case "send_password_reset": {
      const ids = validIds(body.user_ids);
      if (!ids) return fail(400, "bad_request", `user_ids must be 1-${MAX_BATCH} user IDs.`);
      const { data: people, error } = await admin.from("profiles").select("id, email").in("id", ids);
      if (error) return fail(400, "lookup_failed", error.message);
      let sent = 0;
      for (const person of people ?? []) {
        const { error: resetError } = await admin.auth.resetPasswordForEmail(person.email, {
          redirectTo: body.redirect_to ? String(body.redirect_to) : undefined,
        });
        if (!resetError) {
          sent++;
          await audit(admin, actorId, "user.password_reset_sent", person.id, {}, ip);
        }
      }
      return json(200, { sent });
    }

    default:
      return fail(400, "bad_request", "Unknown action.");
  }
});
