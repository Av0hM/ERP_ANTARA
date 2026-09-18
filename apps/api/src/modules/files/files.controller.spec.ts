import { FilesController } from "./files.controller";

describe("FilesController", () => {
  const filesService = {
    list: jest.fn(),
    create: jest.fn(),
  };

  let controller: FilesController;

  beforeEach(() => {
    jest.clearAllMocks();
    controller = new FilesController(filesService as never);
  });

  it("delegates attachment listing to the service", async () => {
    filesService.list.mockResolvedValue([]);

    await expect(controller.listAttachments()).resolves.toEqual([]);
    expect(filesService.list).toHaveBeenCalled();
  });
});
