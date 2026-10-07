import { ConfigService } from "@nestjs/config";
import { Test } from "@nestjs/testing";
import { PrismaService } from "../../../common/prisma/prisma.service";
import { NotificationEmailProcessor } from "./notification-email.processor";

const send = jest.fn();
jest.mock("resend", () => ({
  Resend: class {
    emails = { send: (...args: unknown[]) => send(...args) };
  },
}));
jest.mock("@nestjs/bullmq", () => ({
  Processor: () => () => undefined,
  InjectQueue: () => () => undefined,
  WorkerHost: class {},
}));

describe("notification delivery privacy", () => {
  const findFirst = jest.fn();
  let processor: NotificationEmailProcessor;
  beforeEach(async () => {
    jest.clearAllMocks();
    const module = await Test.createTestingModule({
      providers: [
        NotificationEmailProcessor,
        { provide: PrismaService, useValue: { notification: { findFirst } } },
        {
          provide: ConfigService,
          useValue: new ConfigService({
            NOTIFICATIONS_EMAIL_ENABLED: "true",
            RESEND_API_KEY: "local-test-only",
          }),
        },
      ],
    }).compile();
    processor = module.get(NotificationEmailProcessor);
  });
  const job = () => ({
    data: {
      notificationId: "n",
      userId: "u",
      email: "old@example.invalid",
      title: "SECRET TITLE",
      body: "SECRET BODY",
    },
  });
  it("uses a current active recipient and generic payload even for legacy queued jobs", async () => {
    findFirst.mockResolvedValue({ user: { email: "current@example.invalid" } });
    expect(await processor.process(job())).toBe(true);
    expect(findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: "n",
          userId: "u",
          user: { isActive: true, deletedAt: null },
        },
      }),
    );
    expect(send).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "current@example.invalid",
        subject: "ANTARA update",
      }),
    );
    expect(JSON.stringify(send.mock.calls)).not.toContain("SECRET");
    expect(JSON.stringify(send.mock.calls)).not.toContain("old@example");
  });
  it("does not deliver deleted notifications or inactive/deleted recipients", async () => {
    findFirst.mockResolvedValue(null);
    expect(await processor.process(job())).toBe(false);
    expect(send).not.toHaveBeenCalled();
  });
});
