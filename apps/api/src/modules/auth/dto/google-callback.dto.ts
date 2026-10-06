import { IsString, MaxLength, MinLength } from "class-validator";
export class GoogleCallbackDto {
  @IsString()
  @MinLength(1)
  @MaxLength(16384)
  idToken!: string;
}
