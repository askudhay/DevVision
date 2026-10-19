import { Controller, Get, Query } from '@nestjs/common';
import { ApiOperation, ApiQuery } from '@nestjs/swagger';
import { GithubService, RepoSummary } from './github.service';

@Controller('repos')
export class ReposController {
  constructor(private readonly github: GithubService) {}

  @Get()
  @ApiOperation({ summary: "List the owner's repos whose name matches the filter" })
  @ApiQuery({ name: 'q', required: false, description: 'Name filter. Defaults to GITHUB_REPO_FILTER.' })
  list(@Query('q') q?: string): Promise<RepoSummary[]> {
    return this.github.listRepos(q || undefined);
  }
}
