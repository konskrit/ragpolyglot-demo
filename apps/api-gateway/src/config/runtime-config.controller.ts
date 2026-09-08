import { Body, Controller, Get, Put } from '@nestjs/common';
import { ApiBody, ApiOkResponse, ApiProperty, ApiTags } from '@nestjs/swagger';
import { RuntimeConfigService } from './runtime-config.service';

class ConfigSettingDto {
  @ApiProperty()
  key!: string;

  @ApiProperty({ enum: ['string', 'int', 'bool'] })
  kind!: string;

  @ApiProperty({ description: 'Current value from .env (or process env)' })
  value!: string;

  @ApiProperty({ type: [String] })
  services!: string[];
}

class ConfigGetResponseDto {
  @ApiProperty()
  envFilePath!: string;

  @ApiProperty({ type: [ConfigSettingDto] })
  settings!: ConfigSettingDto[];
}

class ConfigPutResponseDto extends ConfigGetResponseDto {
  @ApiProperty({ type: [String] })
  changedKeys!: string[];

  @ApiProperty({ type: [String] })
  recreateServices!: string[];

  @ApiProperty({
    description:
      'Copyable compose command (restart is not enough — env is applied at recreate)',
  })
  command!: string;
}

@ApiTags('config')
@Controller('config')
export class RuntimeConfigController {
  constructor(private readonly runtimeConfig: RuntimeConfigService) {}

  @Get()
  @ApiOkResponse({ type: ConfigGetResponseDto })
  getConfig() {
    return this.runtimeConfig.getConfig();
  }

  @Put()
  @ApiBody({
    schema: {
      type: 'object',
      additionalProperties: {
        oneOf: [{ type: 'string' }, { type: 'number' }, { type: 'boolean' }],
      },
      example: {
        OCR_INGEST_PREFETCH: 2,
        KRAKEN_GPU_CONCURRENT: 2,
        RAG_TOP_K: 5,
      },
    },
  })
  @ApiOkResponse({ type: ConfigPutResponseDto })
  updateConfig(@Body() body: Record<string, unknown>) {
    return this.runtimeConfig.updateConfig(body ?? {});
  }
}
