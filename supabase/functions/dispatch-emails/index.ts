// dispatch-emails: sends queued notification emails (public.email_outbox) through Resend.
//
// Rows are queued by the database when a notification asks for an email and the
// user's preferences allow it. Call this on a schedule (pg_cron + pg_net, or any cron)
// with the service-role key, or manually as an admin.
//
// Needs secrets RESEND_API_KEY and EMAIL_FROM (e.g. "UniBook <no-reply@your-domain>").
// Without them it does nothing and the queue waits.
//
// POST {}  ->  { sent, failed, remaining }

import { createClient } from "npm:@supabase/supabase-js@2.119.0";

const BATCH_SIZE = 50;
const MAX_ATTEMPTS = 5;

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return json(405, { error: { code: "method_not_allowed", message: "Use POST." } });

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

  // Allowed: the service-role key (cron), or a signed-in active admin.
  if (token !== serviceKey) {
    const userClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: `Bearer ${token}` } },
      auth: { persistSession: false },
    });
    const { data: account } = await userClient.rpc("get_my_account");
    if (!account || account.role !== "admin" || account.status !== "active" || !account.mfa?.satisfied) {
      return json(403, { error: { code: "forbidden", message: "Administrators only." } });
    }
  }

  const resendKey = Deno.env.get("RESEND_API_KEY");
  const from = Deno.env.get("EMAIL_FROM");
  if (!resendKey || !from) {
    return json(503, { error: { code: "email_not_configured", message: "Set RESEND_API_KEY and EMAIL_FROM to send email." } });
  }

  const { data: batch, error } = await admin
    .from("email_outbox")
    .select("id, to_email, subject, body, attempts")
    .eq("status", "pending")
    .order("created_at")
    .limit(BATCH_SIZE);
  if (error) return json(500, { error: { code: "db_error", message: error.message } });

  let sent = 0;
  let failed = 0;
  for (const mail of batch ?? []) {
    let errorText: string | null = null;
    try {
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${resendKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          from,
          to: [mail.to_email],
          subject: mail.subject,
          text: `${mail.body}\n\n- UniBook\nYou can change which emails you get in Settings > Notifications.`,
        }),
      });
      if (!res.ok) errorText = `${res.status} ${await res.text()}`.slice(0, 500);
    } catch (err) {
      errorText = String(err).slice(0, 500);
    }

    if (errorText === null) {
      sent++;
      await admin.from("email_outbox")
        .update({ status: "sent", sent_at: new Date().toISOString(), attempts: mail.attempts + 1, last_error: null })
        .eq("id", mail.id);
    } else {
      failed++;
      const attempts = mail.attempts + 1;
      await admin.from("email_outbox")
        .update({ status: attempts >= MAX_ATTEMPTS ? "failed" : "pending", attempts, last_error: errorText })
        .eq("id", mail.id);
    }
  }

  const { count: remaining } = await admin
    .from("email_outbox").select("id", { count: "exact", head: true }).eq("status", "pending");

  return json(200, { sent, failed, remaining: remaining ?? 0 });
});
