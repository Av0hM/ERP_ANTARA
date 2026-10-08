import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
  BadRequestException,
  PayloadTooLargeException,
} from "@nestjs/common";
import { Request, Response } from "express";
import multer from "multer";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { from, lastValueFrom } from "rxjs";
import { StorageConfig } from "../../common/storage/storage.config";
@Injectable()
export class UploadInterceptor implements NestInterceptor {
  constructor(private readonly config: StorageConfig) {}
  intercept(context: ExecutionContext, next: CallHandler) {
    return from(
      (async () => {
        const dir = await mkdtemp(join(tmpdir(), "antara-multipart-"));
        try {
          const upload = multer({
            dest: dir,
            limits: {
              fileSize: this.config.maxBytes,
              files: 1,
              fields: 3,
              fieldSize: 4096,
              parts: 4,
            },
          }).single("file");
          await new Promise<void>((resolve, reject) =>
            upload(
              context.switchToHttp().getRequest<Request>(),
              context.switchToHttp().getResponse<Response>(),
              (error) => {
                if (error)
                  reject(
                    error instanceof multer.MulterError &&
                      error.code === "LIMIT_FILE_SIZE"
                      ? new PayloadTooLargeException(
                          "File exceeds upload limit",
                        )
                      : new BadRequestException("Invalid multipart upload"),
                  );
                else resolve();
              },
            ),
          );
          return await lastValueFrom(next.handle());
        } finally {
          await rm(dir, { recursive: true, force: true });
        }
      })(),
    );
  }
}
