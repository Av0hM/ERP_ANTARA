import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import Ajv from "ajv";
import {
  canonicalSubsystems,
  DecisionAuthority,
  DecisionScope,
  MembershipAccessLevel,
} from "@antara/contracts";
import { requireLocalDatabaseUrl } from "../local-database-url";

const prismaDir = path.resolve(__dirname, "../../../prisma");

describe("Phase 1A contracts and safety", () => {
  it("preserves the existing migration bytes", () => {
    const hashes = {
      "20260921000000_init":
        "83d550d1662edac027948bcf48a8a2b15be300ea1f518e187cf374a6e3b5db52",
      "20261005000000_dummy_seed_marker":
        "ab3b732dd94327c491c711ab9b3a20270cde1aafb80d3ff65010bdf6531ec5c3",
    };
    for (const [name, hash] of Object.entries(hashes)) {
      expect(
        createHash("sha256")
          .update(
            readFileSync(
              path.join(prismaDir, "migrations", name, "migration.sql"),
            ),
          )
          .digest("hex"),
      ).toBe(hash);
    }
  });

  it("defines exactly the frozen five key/name/slug triples", () => {
    expect(
      canonicalSubsystems.map(({ key, name, slug }) => [key, name, slug]),
    ).toEqual([
      ["ADCS", "ADCS", "adcs"],
      ["PAYLOAD", "Payload", "payload"],
      ["GROUND_COMMS", "Ground-Station & Comms", "ground-comms"],
      ["SDM", "SDM", "sdm"],
      ["MAIN_SATELLITE", "Main Satellite", "main-satellite"],
    ]);
    expect(
      canonicalSubsystems.find(({ key }) => key === "SDM")?.description,
    ).toContain("Sponsorship, Design & Media");
    expect(Object.values(MembershipAccessLevel)).toEqual(["MEMBER", "ADMIN"]);
    expect(Object.values(DecisionScope)).toEqual(["GLOBAL", "SUBSYSTEM"]);
    expect(Object.values(DecisionAuthority)).toEqual([
      "OWNER",
      "SUBSYSTEM_ADMIN",
    ]);
  });

  it.each([
    undefined,
    "postgresql://hosted.example/database",
    "postgresql://localhost/db?host=remote",
    "https://localhost/db",
  ])("rejects missing or non-local tool URL: %s", (url) => {
    expect(() => requireLocalDatabaseUrl(url)).toThrow();
  });

  it("accepts explicit loopback PostgreSQL", () => {
    expect(
      requireLocalDatabaseUrl(
        "postgresql://127.0.0.1:55461/antara_phase1a_test",
      ),
    ).toContain("127.0.0.1");
  });

  it("ships an unreviewed empty mapping manifest with no guessed consolidation", () => {
    const manifest: unknown = JSON.parse(
      readFileSync(
        path.join(prismaDir, "backfills/v1-subsystem-map.example.json"),
        "utf8",
      ),
    );
    const schema = JSON.parse(
      readFileSync(
        path.join(prismaDir, "backfills/v1-subsystem-map.schema.json"),
        "utf8",
      ),
    );
    const validate = new Ajv({ strict: false }).compile(schema);
    expect(validate(manifest)).toBe(true);
    expect(manifest).toMatchObject({
      status: "DRAFT",
      mappings: [],
      reviewedByOwnerId: null,
    });
    expect(
      validate({
        ...(typeof manifest === "object" ? manifest : {}),
        status: "REVIEWED",
      }),
    ).toBe(false);
  });
});
