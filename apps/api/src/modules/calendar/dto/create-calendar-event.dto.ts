import { IsBoolean, IsDateString, IsOptional, IsString } from "class-validator";

export class CreateCalendarEventDto {
  @IsString()
  title!: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsDateString()
  startsAt!: string;

  @IsDateString()
  endsAt!: string;

  @IsString()
  @IsOptional()
  subsystemId?: string;

  @IsBoolean()
  @IsOptional()
  isRecurring?: boolean;
}

