import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

interface MailOptions {
  to: string;
  subject: string;
  html: string;
}

@Injectable()
export class MailService {
  constructor(private readonly configService: ConfigService) {}

  async send(options: MailOptions): Promise<boolean> {
    // In production, integrate with Resend, SendGrid, or similar
    // For now, log the email (development mode)
    console.log(`[MAIL] To: ${options.to}`);
    console.log(`[MAIL] Subject: ${options.subject}`);
    console.log(`[MAIL] HTML: ${options.html.substring(0, 200)}...`);
    
    // In production, you would use a real email service here
    // e.g., using Resend, SendGrid, Nodemailer, etc.
    
    return true;
  }
}