import { IsString } from "class-validator";

export class CreateTaskCommentDto {
  @IsString()
  authorId!: string;

  @IsString()
  content!: string;
}

