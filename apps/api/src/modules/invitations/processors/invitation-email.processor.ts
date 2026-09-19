import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Resend } from "resend";
import { Processor, WorkerHost } from "@nestjs/bullmq";
import { Job } from "bullmq";

interface InvitationEmailJob {
  email: string;
  role: string;
  subsystemId?: string;
  token: string;
  expiresAt: Date;
}

@Processor("invitation-email")
@Injectable()
export class InvitationEmailProcessor extends WorkerHost {
  private readonly resend: Resend | null = null;
  private readonly enabled: boolean;
  private readonly fromEmail: string;
  private readonly baseUrl: string;

  constructor(private readonly configService: ConfigService) {
    super();
    this.enabled = this.configService.get<string>("NOTIFICATIONS_EMAIL_ENABLED") === "true";
    this.fromEmail = this.configService.get<string>("NOTIFICATIONS_FROM_EMAIL") ?? "noreply@antaraerp.local";
    this.baseUrl = this.configService.get<string>("FRONTEND_URL") ?? "http://localhost:3000";

    const apiKey = this.configService.get<string>("RESEND_API_KEY");
    if (this.enabled && apiKey) {
      this.resend = new Resend(apiKey);
    }
  }

  async process(job: Job<InvitationEmailJob>): Promise<boolean> {
    if (!this.enabled || !this.resend) {
      return false;
    }

    const { email, role, subsystemId, token, expiresAt } = job.data;
    const inviteUrl = `${this.baseUrl}/invite/${token}`;

    try {
      await this.resend.emails.send({
        from: this.fromEmail,
        to: email,
        subject: "You're invited to join ANTARA ERP",
        html: this.renderEmailTemplate(role, subsystemId, inviteUrl, expiresAt),
      });
      return true;
    } catch (error) {
      console.error("Failed to send invitation email:", error);
      throw error;
    }
  }

  private renderEmailTemplate(role: string, subsystemId: string | undefined, inviteUrl: string, expiresAt: Date): string {
    return `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
        </head>
        <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #1f2937; max-width: 600px; margin: 0 auto; padding: 20px;">
          <div style="background: linear-gradient(135deg, #0f172a 0%, #1e293b 100%); border-radius: 12px; padding: 32px;">
            <div style="text-align: center; margin-bottom: 24px;">
              <div style="display: inline-flex; align-items: center; justify-content: center; width: 48px; height: 48px; background: rgba(59, 130, 246, 0.2); border-radius: 12px;">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#3b82f6" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"></path>
                  <path d="M13.73 21a2 2 0 0 1-3.46 0"></path>
                </svg>
              </div>
            </div>
            <h1 style="color: #f8fafc; font-size: 24px; font-weight: 600; margin: 0 0 16px; text-align: center;">You're invited to ANTARA ERP</h1>
            <p style="color: #e2e8f0; margin: 0 0 16px; text-align: center;">You've been invited to join the ANTARA CubeSat team's mission control platform.</p>
            <div style="background: rgba(255, 255, 255, 0.05); border-radius: 8px; padding: 20px; color: #e2e8f0; white-space: pre-wrap;">Role: ${role}${subsystemId ? `\nSubsystem: ${subsystemId}` : ""}</div>
            <div style="text-align: center; margin-top: 24px;">
              <a href="${inviteUrl}" style="display: inline-block; background: #3b82f6; color: white; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: 600;">Accept Invitation</a>
            </div>
            <p style="color: #64748b; font-size: 12px; text-align: center; margin-top: 24px;">
              This invitation expires on ${new Date().toLocaleString()}.<br>
              If you didn't expect this invitation, please ignore this email.
            </p>
          </div>
        </body>
      </html>
    `;
  }
}