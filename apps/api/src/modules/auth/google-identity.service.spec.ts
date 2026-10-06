import { ConfigService } from "@nestjs/config";
import { OAuth2Client } from "google-auth-library";
import { CertificateFormat } from "google-auth-library/build/src/auth/oauth2client";
import { generateKeyPairSync, sign } from "node:crypto";
import { GoogleIdentityService } from "./google-identity.service";

// Only certificate retrieval is mocked. Real Google library signature/claim validation runs offline.
const keys = generateKeyPairSync("rsa", { modulusLength: 2048 });
function token(
  overrides: Record<string, unknown> = {},
  signatureKey = keys.privateKey,
) {
  const now = Math.floor(Date.now() / 1000);
  const header = Buffer.from(
    JSON.stringify({ alg: "RS256", kid: "fixture" }),
  ).toString("base64url");
  const payload = Buffer.from(
    JSON.stringify({
      sub: "google-sub",
      iss: "https://accounts.google.com",
      aud: "fixture-client",
      iat: now,
      exp: now + 3600,
      email: "OWNER@fixture.invalid",
      email_verified: true,
      name: "Verified Owner",
      ...overrides,
    }),
  ).toString("base64url");
  const input = `${header}.${payload}`;
  return `${input}.${sign("RSA-SHA256", Buffer.from(input), signatureKey).toString("base64url")}`;
}
describe("Google identity verification", () => {
  const service = new GoogleIdentityService(
    new ConfigService({ GOOGLE_CLIENT_ID: "fixture-client" }),
  );
  beforeEach(() => {
    jest
      .spyOn(OAuth2Client.prototype, "getFederatedSignonCertsAsync")
      .mockResolvedValue({
        certs: {
          fixture: keys.publicKey
            .export({ type: "spki", format: "pem" })
            .toString(),
        },
        format: CertificateFormat.PEM,
      });
  });
  afterEach(() => jest.restoreAllMocks());
  it("verifies signed identity and derives normalized profile", async () => {
    await expect(service.verify(token())).resolves.toMatchObject({
      email: "owner@fixture.invalid",
      name: "Verified Owner",
    });
  });
  it.each([
    ["wrong audience", { aud: "attacker-client" }],
    ["wrong issuer", { iss: "https://attacker.invalid" }],
    ["expired", { exp: Math.floor(Date.now() / 1000) - 600 }],
    ["just expired", { exp: Math.floor(Date.now() / 1000) - 1 }],
    ["unverified email", { email_verified: false }],
    ["string verified claim", { email_verified: "true" }],
    ["invalid email", { email: "not-an-email" }],
    ["missing email", { email: null }],
    ["missing subject", { sub: "" }],
  ])("rejects %s", async (_label, claims) => {
    await expect(service.verify(token(claims))).rejects.toThrow(
      "Authentication failed",
    );
  });
  it("rejects wrong signature", async () => {
    const attacker = generateKeyPairSync("rsa", { modulusLength: 2048 });
    await expect(
      service.verify(token({}, attacker.privateKey)),
    ).rejects.toThrow("Authentication failed");
  });
  it.each([
    "",
    "invalid-token",
    `${Buffer.from('{"alg":"none"}').toString("base64url")}.${Buffer.from('{"email":"owner@fixture.invalid"}').toString("base64url")}.`,
  ])("rejects malformed/unsigned tokens", async (value) => {
    await expect(service.verify(value)).rejects.toThrow(
      "Authentication failed",
    );
  });
  it("fails closed without configured audience", async () => {
    await expect(
      new GoogleIdentityService(new ConfigService()).verify(token()),
    ).rejects.toThrow("Authentication failed");
  });
});
