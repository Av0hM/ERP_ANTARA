import { IsOptional, IsString } from "class-validator";

export class StartWorklogSessionDto {
  @IsString()
  userId!: string;

  @IsString()
  taskId!: string;

  @IsString()
  @IsOptional()
  notes?: string;
}
