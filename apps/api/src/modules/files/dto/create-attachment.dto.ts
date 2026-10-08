import { FileCategory } from "@prisma/client";
import {
  IsArray,
  IsEnum,
  IsBase64,
  IsInt,
  IsOptional,
  IsString,
  Min,
} from "class-validator";

export class CreateAttachmentDto {
  @IsOptional()
  @IsEnum(FileCategory)
  category?: FileCategory;

  @IsString()
  name!: string;

  @IsString()
  mimeType!: string;

  @IsInt()
  @Min(0)
  sizeBytes!: number;

  @IsOptional()
  @IsString()
  taskId?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];

  @IsOptional()
  @IsBase64()
  contentBase64?: string;
}
