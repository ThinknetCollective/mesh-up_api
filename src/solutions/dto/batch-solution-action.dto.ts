import { IsArray, ArrayMaxSize, IsEnum, IsOptional, IsString, IsIn } from 'class-validator';

export const BATCH_ACTIONS = ['delete', 'bookmark', 'update-status'] as const;
export type BatchSolutionAction = (typeof BATCH_ACTIONS)[number];

export class BatchSolutionActionDto {
  @IsIn(BATCH_ACTIONS, { message: 'action must be one of delete, bookmark, update-status' })
  action: BatchSolutionAction;

  @IsArray()
  @ArrayMaxSize(50, { message: 'Batch size cannot exceed 50 items' })
  @IsString({ each: true })
  solutionIds: string[];

  @IsOptional()
  @IsIn(['active', 'hidden'], { message: 'status must be active or hidden' })
  status?: string;
}
