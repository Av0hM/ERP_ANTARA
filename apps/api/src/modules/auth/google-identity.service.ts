import { Injectable, UnauthorizedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { OAuth2Client } from "google-auth-library";
import { isEmail } from "class-validator";

@Injectable()
export class GoogleIdentityService {
  private readonly client = new OAuth2Client();
  constructor(private readonly config: ConfigService) {}

  async verify(idToken: string) {
    const audience = this.config.get<string>("GOOGLE_CLIENT_ID");
    if (
      !audience ||
      typeof idToken !== "string" ||
      !idToken ||
      idToken.length > 16384
    ) {
      throw new UnauthorizedException("Authentication failed");
    }
    try {
      // Google's supported verifier validates signature, issuer, audience and expiry.
      const ticket = await this.client.verifyIdToken({ idToken, audience });
      const claims = ticket.getPayload();
      if (
        !claims ||
        !claims.sub ||
        claims.aud !== audience ||
        !["accounts.google.com", "https://accounts.google.com"].includes(
          claims.iss,
        ) ||
        !Number.isFinite(claims.exp) ||
        claims.exp * 1000 <= Date.now() ||
        claims.email_verified !== true ||
        !claims.email ||
        !isEmail(claims.email)
      ) {
        throw new Error("Invalid identity");
      }
      return {
        email: claims.email.trim().toLowerCase(),
        name: claims.name?.trim() || claims.email,
        avatarUrl: claims.picture,
      };
    } catch {
      throw new UnauthorizedException("Authentication failed");
    }
  }
}
