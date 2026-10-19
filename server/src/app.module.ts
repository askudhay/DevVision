import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { GithubModule } from './github/github.module';
import { OnboardingModule } from './onboarding/onboarding.module';

@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true }), GithubModule, OnboardingModule],
})
export class AppModule {}
