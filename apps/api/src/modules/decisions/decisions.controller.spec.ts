import "reflect-metadata";
import { DecisionsController } from "./decisions.controller";
import { ROLES_KEY } from "../../common/decorators/roles.decorator";

describe("Decision write permissions", () => {
  it.each(["create", "update", "delete"] as const)("limits %s to owners and admins", (method) => {
    expect(Reflect.getMetadata(ROLES_KEY, DecisionsController.prototype[method])).toEqual(["OWNER", "ADMIN"]);
  });
});
