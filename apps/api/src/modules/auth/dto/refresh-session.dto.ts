import { IsString } from "class-validator";

export class RefreshSessionDto {
  @IsString()
  refreshToken!: string;
}

