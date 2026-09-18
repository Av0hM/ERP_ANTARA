import { IsDateString, IsInt, IsOptional, IsString, Min } from "class-validator";

export class StopWorklogSessionDto {
  @IsDateString()
  endedAt!: string;

  @IsInt()
  @Min(1)
  durationMin!: number;

  @IsString()
  @IsOptional()
  notes?: string;
}

