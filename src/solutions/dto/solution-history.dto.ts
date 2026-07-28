export class SolutionHistoryDto {
  id: number;
  solutionId: string;
  content: string;
  editedBy: string;
  previousScore: number;
  editedAt: Date;
}
