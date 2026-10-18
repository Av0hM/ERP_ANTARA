import { expect, test } from "@playwright/test";
import { validateAuthResponse } from "oauth4webapi";

// Offline reproduction using the installed OAuth parser. Never disable checks.
const server = {
  issuer: "https://accounts.google.com",
  authorization_response_iss_parameter_supported: true,
};
const client = { client_id: "fixture-client" };
const callback = () =>
  new URLSearchParams({ code: "fixture-code", state: "fixture-state" });

test("discovery requiring iss rejects a callback missing it before token exchange", () => {
  expect(() =>
    validateAuthResponse(server, client, callback(), "fixture-state"),
  ).toThrow('response parameter "iss" (issuer) missing');
});
test("matching issuer and state pass; wrong issuer or state still fails", () => {
  const params = callback();
  params.set("iss", server.issuer);
  expect(
    validateAuthResponse(server, client, params, "fixture-state").get("code"),
  ).toBe("fixture-code");
  expect(() =>
    validateAuthResponse(server, client, params, "different-state"),
  ).toThrow();
  params.set("iss", "https://attacker.invalid");
  expect(() =>
    validateAuthResponse(server, client, params, "fixture-state"),
  ).toThrow();
});
test("discovery without issuer-response support does not demand iss", () => {
  expect(
    validateAuthResponse(
      { issuer: server.issuer },
      client,
      callback(),
      "fixture-state",
    ).get("code"),
  ).toBe("fixture-code");
});
