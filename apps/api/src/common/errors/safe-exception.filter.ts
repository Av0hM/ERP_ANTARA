import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  Logger,
} from "@nestjs/common";
import { Response } from "express";

/** Never send/log raw unexpected errors: provider/Prisma errors can contain secrets. */
@Catch()
export class SafeExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(SafeExceptionFilter.name);
  catch(error: unknown, host: ArgumentsHost) {
    const response = host.switchToHttp().getResponse<Response>();
    const status = error instanceof HttpException ? error.getStatus() : 500;
    if (status >= 500) {
      this.logger.error({ code: "REQUEST_FAILED", status });
      response.status(status).json({
        statusCode: status,
        message: "Operation unavailable. Please try again.",
        code: "REQUEST_FAILED",
      });
      return;
    }
    const body =
      error instanceof HttpException ? error.getResponse() : "Request failed";
    response
      .status(status)
      .json(
        typeof body === "string" ? { statusCode: status, message: body } : body,
      );
  }
}
