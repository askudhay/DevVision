import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import { ApiOperation } from '@nestjs/swagger';
import { GenerateOnboardingDto } from './generate-onboarding.dto';
import { OnboardingResult, OnboardingService } from './onboarding.service';

@Controller('onboarding')
export class OnboardingController {
  constructor(private readonly onboarding: OnboardingService) {}

  @Post()
  @HttpCode(200)
  @ApiOperation({ summary: "Generate an onboarding guide from each repo's onboarding.md" })
  generate(@Body() dto: GenerateOnboardingDto): Promise<OnboardingResult> {
    return this.onboarding.generate(dto);
  }
}
