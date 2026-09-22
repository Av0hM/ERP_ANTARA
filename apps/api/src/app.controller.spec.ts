import { Test } from "@nestjs/testing";

import { AppController } from "./app.controller";

describe("AppController", () => {
  it("returns service info at root", async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [AppController],
    }).compile();

    const controller = moduleRef.get(AppController);
    const result = controller.root();
    expect(result.status).toBe("ok");
    expect(result.service).toBe("antara-erp-api");
    expect(result.timestamp).toBeDefined();
  });
});

