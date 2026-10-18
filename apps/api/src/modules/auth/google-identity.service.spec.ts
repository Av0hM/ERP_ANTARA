import { ExecutionContextHost } from "@nestjs/core/helpers/execution-context-host";
import { IdentityThrottleGuard } from "./identity-throttle.guard";
import { IdentityThrottleStorage } from "./identity-throttle.storage";
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
  it("forged signed claims cannot consume a victim identity budget", async () => {
    const storage = new IdentityThrottleStorage();
    const guard = new IdentityThrottleGuard(service, storage);
    const attacker = generateKeyPairSync("rsa", { modulusLength: 2048 });
    const context = (idToken: string) =>
      new ExecutionContextHost(
        [
          { body: { idToken }, socket: { remoteAddress: "127.0.0.1" } },
          { setHeader: jest.fn() },
        ],
        class Fixture {},
        function googleCallback() {},
      );
    try {
      for (let i = 0; i < 25; i++)
        await expect(
          guard.canActivate(context(token({ nonce: i }, attacker.privateKey))),
        ).rejects.toMatchObject({ status: 401 });
      expect(
        [...storage.storage.keys()].filter((key) => key.includes(":identity:")),
      ).toHaveLength(0);
      for (let i = 0; i < 20; i++)
        await expect(
          guard.canActivate(context(token({ nonce: i }))),
        ).resolves.toBe(true);
      expect(
        [...storage.storage.keys()].filter((key) => key.includes(":identity:")),
      ).toHaveLength(1);
    } finally {
      storage.onApplicationShutdown();
    }
  });
});
