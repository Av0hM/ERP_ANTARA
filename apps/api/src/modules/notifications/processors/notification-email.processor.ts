import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Resend } from "resend";
import { Processor, WorkerHost } from "@nestjs/bullmq";
import { Job } from "bullmq";

interface NotificationEmailJob {
  notificationId: string;
  userId: string;
  email: string;
  title: string;
  body: string;
}

@Processor("notification-email")
@Injectable()
export class NotificationEmailProcessor extends WorkerHost {
  private readonly resend: Resend | null = null;
  private readonly enabled: boolean;
  private readonly fromEmail: string;

  constructor(private readonly configService: ConfigService) {
    super();
    this.enabled = this.configService.get<string>("NOTIFICATIONS_EMAIL_ENABLED") === "true";
    this.fromEmail = this.configService.get<string>("NOTIFICATIONS_FROM_EMAIL") ?? "noreply@antaraerp.local";

    const apiKey = this.configService.get<string>("RESEND_API_KEY");
    if (this.enabled && apiKey) {
      this.resend = new Resend(apiKey);
    }
  }

  async process(job: Job<NotificationEmailJob>): Promise<boolean> {
    if (!this.enabled || !this.resend) {
      return false;
    }

    const { email, title, body } = job.data;

    try {
      await this.resend.emails.send({
        from: this.fromEmail,
        to: email,
        subject: title,
        html: this.renderEmailTemplate(title, body),
      });
      return true;
    } catch (error) {
      console.error("Failed to send notification email:", error);
      throw error;
    }
  }

  private renderEmailTemplate(subject: string, body: string): string {
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
            <h1 style="color: #f8fafc; font-size: 24px; font-weight: 600; margin: 0 0 16px; text-align: center;">${subject}</h1>
            <div style="background: rgba(255, 255, 255, 0.05); border-radius: 8px; padding: 20px; color: #e2e8f0; white-space: pre-wrap;">${body}</div>
            <p style="color: #64748b; font-size: 12px; text-align: center; margin-top: 24px;">
              This is an automated notification from ANTARA ERP. Please do not reply to this email.
            </p>
          </div>
        </body>
      </html>
    `;
  }
}