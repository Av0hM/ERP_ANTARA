import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Resend } from "resend";
import { Processor, WorkerHost } from "@nestjs/bullmq";
import { Job } from "bullmq";

export interface InvitationEmailJob {
  email: string;
  globalRole: "MEMBER" | "OWNER";
  memberships: { name: string; accessLevel: "MEMBER" | "ADMIN" }[];
  invitationUrl: string;
  expiresAt: string;
}
interface LegacyInvitationEmailJob {
  email: string;
  token: string;
  expiresAt: string | Date;
  role: string;
  subsystemId?: string;
}
const escapeHtml = (value: string) =>
  value.replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ]!,
  );
@Processor("invitation-email")
@Injectable()
export class InvitationEmailProcessor extends WorkerHost {
  private readonly resend: Resend | null;
  private readonly from: string;
  private readonly baseUrl: string;
  constructor(config: ConfigService) {
    super();
    this.baseUrl =
      config.get<string>("FRONTEND_URL") ?? "http://localhost:3000";
    const key = config.get<string>("RESEND_API_KEY");
    this.from = config.get<string>("NOTIFICATIONS_FROM_EMAIL") ?? "";
    this.resend =
      config.get<string>("NOTIFICATIONS_EMAIL_ENABLED") === "true" &&
      key &&
      this.from
        ? new Resend(key)
        : null;
  }
  async process(
    job: Pick<Job<InvitationEmailJob | LegacyInvitationEmailJob>, "data">,
  ): Promise<boolean> {
    if (!this.resend) throw new Error("EMAIL_DELIVERY_UNAVAILABLE");
    const data = job.data;
    try {
      const invitationUrl =
        "invitationUrl" in data
          ? data.invitationUrl
          : new URL(`/invite/${data.token}`, this.baseUrl).toString();
      const access = !("globalRole" in data)
        ? "Review your access on the invitation page."
        : data.globalRole === "OWNER"
          ? "Owner — Global access"
          : data.memberships
              .map(
                (g) =>
                  `${g.name} — ${g.accessLevel === "ADMIN" ? "Admin" : "Member"}`,
              )
              .join("\n") || "Member — no subsystem access yet";
      const result = await this.resend.emails.send({
        from: this.from,
        to: data.email,
        subject: "You're invited to Project ANTARA ERP",
        html: `<h1>You're invited to Project ANTARA ERP</h1><p>Access:</p><pre>${escapeHtml(access)}</pre><p><a href="${escapeHtml(invitationUrl)}">Accept invitation</a></p><p>This invitation expires on ${escapeHtml(new Date(data.expiresAt).toISOString())}.</p><p>If you were not expecting this invitation, you can ignore this email.</p>`,
      });
      if (result.error) throw new Error("Delivery rejected");
      return true;
    } catch {
      throw new Error("EMAIL_DELIVERY_FAILED");
    }
  }
}
