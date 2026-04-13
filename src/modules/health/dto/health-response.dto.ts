import { ApiProperty } from '@nestjs/swagger';

export class HealthResponseDto {
  @ApiProperty({ example: 'ok' })
  status!: 'ok';

  @ApiProperty({ example: 'hookah-api' })
  service!: string;

  @ApiProperty({ example: '0.1.0' })
  version!: string;

  @ApiProperty({ example: '2026-04-13T18:00:00.000Z' })
  timestamp!: string;

  @ApiProperty({
    example: ['catalog', 'inventory', 'orders'],
    type: [String],
  })
  boundedContexts!: string[];
}
