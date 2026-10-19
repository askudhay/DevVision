import { Module } from '@nestjs/common';
import { GithubService } from './github.service';
import { ReposController } from './repos.controller';

@Module({
  controllers: [ReposController],
  providers: [GithubService],
  exports: [GithubService],
})
export class GithubModule {}
