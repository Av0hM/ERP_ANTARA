import { ArgumentsHost, BadRequestException, Logger } from "@nestjs/common";
import { SafeExceptionFilter } from "./safe-exception.filter";
describe("safe unexpected errors", () => {
  afterEach(() => jest.restoreAllMocks());
  it("does not disclose secrets in response or logs", () => {
    const log = jest
      .spyOn(Logger.prototype, "error")
      .mockImplementation(() => {});
    const json = jest.fn();
    const status = jest.fn().mockReturnValue({ json });
    const host = {
      switchToHttp: () => ({ getResponse: () => ({ status }) }),
    } as ArgumentsHost;
    new SafeExceptionFilter().catch(
      new Error("postgresql://private:secret@internal-host/db"),
      host,
    );
    expect(status).toHaveBeenCalledWith(500);
    expect(JSON.stringify([json.mock.calls, log.mock.calls])).not.toMatch(
      /postgresql|private|secret|internal-host/,
    );
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({ code: "REQUEST_FAILED" }),
    );
  });
  it("preserves useful expected validation errors", () => {
    const json = jest.fn();
    const status = jest.fn().mockReturnValue({ json });
    const host = {
      switchToHttp: () => ({ getResponse: () => ({ status }) }),
    } as ArgumentsHost;
    new SafeExceptionFilter().catch(
      new BadRequestException("Invalid category"),
      host,
    );
    expect(status).toHaveBeenCalledWith(400);
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({ message: "Invalid category" }),
    );
  });
});
