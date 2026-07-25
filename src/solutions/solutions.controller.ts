import { Controller, Post, Patch, Get, Body, Param, ParseIntPipe } from '@nestjs/common';
import { SolutionsService } from './solutions.service';

@Controller('v1/solutions')
export class SolutionsController {
  constructor(private readonly solutionsService: SolutionsService) {}

  @Post()
  create(@Body() body: { meshNodeId: number; content: string; authorId: string }) {
    return this.solutionsService.create(body);
  }

  @Patch(':id')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: { content: string; editorId: string },
  ) {
    return this.solutionsService.update(id, body);
  }

  @Get(':id/history')
  history(@Param('id', ParseIntPipe) id: number) {
    return this.solutionsService.findHistory(id);
  }

  @Post(':id/vote')
  vote(
    @Param('id') id: string,
    @Body() body: { voterId: string; value: number },
  ) {
    return this.solutionsService.vote(id, body.voterId, body.value);
  }

  @Patch(':id/rank')
  updateRank(
    @Param('id') id: string,
    @Body('rank', ParseIntPipe) rank: number,
  ) {
    return this.solutionsService.updateRank(id, rank);
  }
}
