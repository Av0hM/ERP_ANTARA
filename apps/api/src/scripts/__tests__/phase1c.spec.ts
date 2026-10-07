import {
  bootstrapOptions,
  verifyLocalResolution,
} from "../v1-bootstrap-safety";
const base = [
  "--action",
  "owner",
  "--mode",
  "local",
  "--user-id",
  "explicit-target",
  "--ack",
  "LOCAL_RESTORE_BOOTSTRAP",
];
const url = "postgresql://fixture@127.0.0.1:55461/antara_phase1c_test";
describe("Phase 1C explicit operator controls", () => {
  it("requires its own URL even with DATABASE_URL configured", () => {
    expect(() => bootstrapOptions(base, undefined)).toThrow(
      "PHASE1C_DATABASE_URL",
    );
  });
  it.each(
    [
      [],
      base.slice(0, 4),
      base.slice(0, 6),
      [...base, "--user-id", "other"],
    ].map((args) => ({ args })),
  )("rejects incomplete/duplicate arguments %j", ({ args }) => {
    expect(() => bootstrapOptions(args, url)).toThrow();
  });
  it.each([
    "postgresql://neon.example/db",
    "postgresql://127.0.0.1/db?host=cloud",
    "postgresql://127.0.0.1/db?schema=other",
    "https://127.0.0.1/db",
  ])("rejects unsafe local URL %s", (target) => {
    expect(() => bootstrapOptions(base, target)).toThrow();
  });
  it("does not expose a password in the displayed database identity", () => {
    const options = bootstrapOptions(
      base,
      "postgresql://fixture:secret@127.0.0.1/db",
    );
    expect(JSON.stringify(options.identity)).not.toContain("secret");
    expect(options.userId).toBe("explicit-target");
  });
  it("production requires a separate acknowledgement", () => {
    const args = base.map((v) => (v === "local" ? "production" : v));
    expect(() => bootstrapOptions(args, "postgresql://host/db")).toThrow();
    expect(
      bootstrapOptions(
        args.map((v) =>
          v === "LOCAL_RESTORE_BOOTSTRAP" ? "PRODUCTION_BOOTSTRAP" : v,
        ),
        "postgresql://host/db",
      ).mode,
    ).toBe("production");
  });
  it("checks loopback resolution", async () => {
    await expect(verifyLocalResolution("127.0.0.1")).resolves.toBeUndefined();
    await expect(verifyLocalResolution("192.0.2.1")).rejects.toThrow();
  });
});
