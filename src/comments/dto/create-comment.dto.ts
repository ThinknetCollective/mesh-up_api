import { IsNotEmpty, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

export class CreateCommentDto {
  /** The comment body. Markdown is supported. */
  @IsString()
  @IsNotEmpty()
  @MaxLength(5000)
  content: string;

  /** Optional parent comment ID for replies (max depth 3). */
  @IsUUID()
  @IsOptional()
  parentId?: string;
}
