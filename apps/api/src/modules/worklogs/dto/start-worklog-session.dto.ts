import { IsOptional, IsString } from "class-validator";

export class StartWorklogSessionDto {
  @IsString()
  taskId!: string;

  @IsString()
  @IsOptional()
  notes?: string;
}
