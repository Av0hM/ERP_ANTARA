import { IsEmail, IsEnum, IsOptional, IsString, MinLength } from "class-validator";
import { AppRole } from "@antara/contracts";

export class RegisterDto {
  @IsString()
  name!: string;

  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(8)
  password!: string;

  @IsEnum(AppRole)
  @IsOptional()
  role?: AppRole;
}

