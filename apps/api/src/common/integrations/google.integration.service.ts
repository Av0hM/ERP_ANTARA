import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { createSign, randomUUID } from "node:crypto";

type GoogleEventInput = {
  title: string;
  description?: string;
  startsAt: string;
  endsAt: string;
  subsystemName?: string | null;
};

type GoogleDriveUploadInput = {
  name: string;
  mimeType: string;
  contentBase64: string;
  folderId?: string | null;
};

type GoogleDriveUploadResult = {
  id: string;
  webViewLink?: string;
};

type GoogleCalendarEventResult = {
  id: string;
  summary?: string;
  description?: string;
  htmlLink?: string;
  start?: { dateTime?: string };
  end?: { dateTime?: string };
};

type GoogleTokenResponse = {
  access_token?: string;
  expires_in?: number;
  token_type?: string;
};

@Injectable()
export class GoogleIntegrationService {
  private accessToken: string | null = null;
  private accessTokenExpiresAt = 0;

  constructor(private readonly configService: ConfigService) {}

  isCalendarConfigured() {
    return Boolean(this.getGoogleCalendarId() && this.getServiceAccountEmail() && this.getPrivateKey());
  }

  isDriveConfigured() {
    return Boolean(this.getGoogleDriveRootFolderId() && this.getServiceAccountEmail() && this.getPrivateKey());
  }

  async createCalendarEvent(input: GoogleEventInput) {
    const calendarId = this.getGoogleCalendarId();
    if (!calendarId || !this.isCalendarConfigured()) {
      return null;
    }

    const accessToken = await this.getAccessToken("https://www.googleapis.com/auth/calendar.events");
    const response = await fetch(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        summary: input.title,
        description: this.buildDescription(input.description, input.subsystemName),
        start: { dateTime: input.startsAt },
        end: { dateTime: input.endsAt },
      }),
    });

    if (!response.ok) {
      throw new Error(`Google Calendar create failed: ${response.status}`);
    }

    return (await response.json()) as GoogleCalendarEventResult;
  }

  async listCalendarEvents(params: { timeMin: string; timeMax: string; maxResults?: number }) {
    const calendarId = this.getGoogleCalendarId();
    if (!calendarId || !this.isCalendarConfigured()) {
      return [];
    }

    const accessToken = await this.getAccessToken("https://www.googleapis.com/auth/calendar.readonly");
    const query = new URLSearchParams({
      timeMin: params.timeMin,
      timeMax: params.timeMax,
      singleEvents: "true",
      orderBy: "startTime",
      maxResults: String(params.maxResults ?? 10),
    });

    const response = await fetch(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events?${query.toString()}`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    if (!response.ok) {
      throw new Error(`Google Calendar list failed: ${response.status}`);
    }

    const payload = (await response.json()) as { items?: GoogleCalendarEventResult[] };
    return payload.items ?? [];
  }

  async uploadDriveFile(input: GoogleDriveUploadInput) {
    const folderId = input.folderId ?? this.getGoogleDriveRootFolderId();
    if (!folderId || !this.isDriveConfigured()) {
      return null;
    }

    const accessToken = await this.getAccessToken("https://www.googleapis.com/auth/drive.file");
    const boundary = `antara-${randomUUID()}`;
    const metadata = {
      name: input.name,
      parents: [folderId],
    };

    const contentBytes = Buffer.from(input.contentBase64, "base64");
    const body = Buffer.concat([
      Buffer.from(`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n`),
      Buffer.from(`--${boundary}\r\nContent-Type: ${input.mimeType}\r\n\r\n`),
      contentBytes,
      Buffer.from(`\r\n--${boundary}--`),
    ]);

    const response = await fetch("https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,webViewLink", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": `multipart/related; boundary=${boundary}`,
      },
      body,
    });

    if (!response.ok) {
      throw new Error(`Google Drive upload failed: ${response.status}`);
    }

    return (await response.json()) as GoogleDriveUploadResult;
  }

  private buildDescription(description?: string, subsystemName?: string | null) {
    return [description, subsystemName ? `Subsystem: ${subsystemName}` : null].filter(Boolean).join("\n\n");
  }

  private getGoogleCalendarId() {
    return this.configService.get<string>("integrations.googleCalendarId") ?? null;
  }

  private getGoogleDriveRootFolderId() {
    return this.configService.get<string>("integrations.googleDriveRootFolderId") ?? null;
  }

  private getServiceAccountEmail() {
    return this.configService.get<string>("integrations.googleServiceAccountEmail") ?? null;
  }

  private getPrivateKey() {
    const raw = this.configService.get<string>("integrations.googlePrivateKey");
    if (!raw) {
      return null;
    }
    return raw.replace(/\\n/g, "\n");
  }

  private async getAccessToken(scope: string) {
    if (this.accessToken && Date.now() < this.accessTokenExpiresAt - 60_000) {
      return this.accessToken;
    }

    const email = this.getServiceAccountEmail();
    const privateKey = this.getPrivateKey();
    if (!email || !privateKey) {
      throw new Error("Google service account credentials are not configured");
    }

    const now = Math.floor(Date.now() / 1000);
    const header = this.base64Url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
    const claim = this.base64Url(
      JSON.stringify({
        iss: email,
        scope,
        aud: "https://oauth2.googleapis.com/token",
        iat: now,
        exp: now + 3600,
      }),
    );
    const unsigned = `${header}.${claim}`;
    const signer = createSign("RSA-SHA256");
    signer.update(unsigned);
    signer.end();
    const signature = this.base64Url(signer.sign(privateKey));
    const assertion = `${unsigned}.${signature}`;

    const response = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
        assertion,
      }),
    });

    if (!response.ok) {
      throw new Error(`Google token exchange failed: ${response.status}`);
    }

    const payload = (await response.json()) as GoogleTokenResponse;
    if (!payload.access_token) {
      throw new Error("Google token exchange did not return an access token");
    }

    this.accessToken = payload.access_token;
    this.accessTokenExpiresAt = Date.now() + (payload.expires_in ?? 3600) * 1000;
    return this.accessToken;
  }

  private base64Url(input: string | Buffer) {
    return Buffer.from(input).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
  }
}

