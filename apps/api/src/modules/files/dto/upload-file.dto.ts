import { FileCategory } from "@prisma/client";
import { IsEnum, IsOptional, IsString, MaxLength } from "class-validator";
export class UploadFileDto {
  @IsEnum(FileCategory) category!: FileCategory;
  @IsOptional() @IsString() @MaxLength(200) taskId?: string;
}
