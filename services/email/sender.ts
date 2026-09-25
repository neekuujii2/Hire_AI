import { render } from "@react-email/render";
import Resend from "resend";
import { Queue } from "bullmq";
import { getSupabaseClient } from "@/lib/supabase"; // helper to create a server‑side client
import templates from "./templates";
import { log } from "@/lib/logger"; // assume a simple logger wrapper

// BullMQ queue – shared across the app
export const emailQueue = new Queue("email-queue", {
  connection: {
    host: process.env.REDIS_HOST || "127.0.0.1",
    port: Number(process.env.REDIS_PORT) || 6379,
  },
});

/**
 * Render a template with data, send via Resend, and enqueue the job.
 * Returns a promise that resolves when the job is queued.
 */
export async function sendEmail(
  templateName: keyof typeof templates,
  to: string,
  data: Record<string, any>,
) {
  const html = render(templates[templateName](data));
  const text = render(templates[templateName](data), { plainText: true });

  // Enqueue the actual sending – we keep a tiny DB audit row now.
  await emailQueue.add("send", {
    to,
    subject: extractSubject(templateName, data),
    html,
    text,
    orgId: data.orgId,
  });

  // Insert audit log (lightweight – fire‑and‑forget)
  try {
    const supabase = getSupabaseClient();
    await supabase.from("audit_logs").insert({
      event_type: "email",
      payload: { template: templateName, to, data },
      status: "queued",
      org_id: data.orgId,
    });
  } catch (e) {
    log.error("Failed to write email audit", e);
  }
}

function extractSubject(
  name: keyof typeof templates,
  data: Record<string, any>,
): string {
  // Very simple mapping – in a real app you may store subjects separately.
  const subjects: Record<string, string> = {
    APPLICATION_RECEIVED: `We received your application — ${data.jobTitle} at ${data.company}`,
    INTERVIEW_INVITE: `You\'ve been selected for an AI interview — ${data.jobTitle}`,
    INTERVIEW_REMINDER: "Reminder: Your interview link expires in 24 hours",
    APPLICATION_REJECTED: `Update on your application — ${data.company}`,
    APPLICATION_SHORTLISTED: `Great news — you\'ve been shortlisted! ${data.company}`,
    HR_NEW_APPLICATION: `${data.name} applied for ${data.jobTitle}`,
    HR_INTERVIEW_COMPLETE: `${data.name} completed their AI interview — Score: ${data.score}/100`,
  };
  return subjects[name] ?? "HireAI Notification";
}

export default sendEmail;