import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ArrayMaxSize, ArrayNotEmpty, IsArray, IsOptional, IsString, MaxLength } from 'class-validator';

export class GenerateOnboardingDto {
  @ApiProperty({
    description: 'Repos to onboard onto, as "repo", "owner/repo" or a GitHub URL',
    example: ['crewclaro-api', 'crewclaro-web'],
  })
  @IsArray()
  @ArrayNotEmpty()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  repos: string[];

  @ApiPropertyOptional({ description: 'Used to personalise the guide', example: 'Alex Johnson' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  developerName?: string;

  @ApiPropertyOptional({ description: 'Team or track the developer joins', example: 'Backend & Platform' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  department?: string;
}
