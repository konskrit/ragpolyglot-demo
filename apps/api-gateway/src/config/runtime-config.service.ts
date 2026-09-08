import {
  BadRequestException,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import type { RuntimeConfig, RuntimeConfigUpdate } from '@ragpolyglot-shared';
import {
  CONFIG_SETTING_BY_KEY,
  CONFIG_SETTINGS,
  recreateCommand,
  type ConfigSetting,
} from './config-settings';
import {
  mergeEnvFile,
  parseEnvAssignments,
  readEnvFile,
  resolveEnvFilePath,
  writeEnvFile,
} from './env-file';

@Injectable()
export class RuntimeConfigService {
  getConfig(): RuntimeConfig {
    const envFilePath = this.envPath();
    const fileValues = parseEnvAssignments(readEnvFile(envFilePath));
    return {
      envFilePath,
      settings: CONFIG_SETTINGS.map((s) => ({
        key: s.key,
        kind: s.kind,
        value: this.viewValue(s, this.effectiveValue(s.key, fileValues)),
        services: [...s.services],
      })),
    };
  }

  updateConfig(values: Record<string, unknown>): RuntimeConfigUpdate {
    if (!values || typeof values !== 'object' || Array.isArray(values)) {
      throw new BadRequestException('Body must be an object of key → value');
    }

    const updates = new Map<
      string,
      { value: string; setting: ConfigSetting }
    >();
    for (const [key, raw] of Object.entries(values)) {
      const setting = CONFIG_SETTING_BY_KEY.get(key);
      if (!setting) {
        throw new BadRequestException(`Key not allowed: ${key}`);
      }
      updates.set(key, {
        value: this.normalizeValue(setting, raw),
        setting,
      });
    }

    if (updates.size === 0) {
      throw new BadRequestException('No settings to update');
    }

    const envFilePath = this.envPath();
    const previous = readEnvFile(envFilePath);
    const prevMap = parseEnvAssignments(previous);

    const changed = new Map<string, string>();
    const serviceSet = new Set<string>();
    for (const [key, { value, setting }] of updates) {
      const current = this.viewValue(
        setting,
        this.effectiveValue(key, prevMap),
      );
      if (current === value) continue;
      changed.set(key, value);
      for (const svc of setting.services) {
        serviceSet.add(svc);
      }
    }

    if (changed.size === 0) {
      return {
        envFilePath,
        changedKeys: [],
        recreateServices: [],
        command: '',
        settings: this.getConfig().settings,
      };
    }

    writeEnvFile(envFilePath, mergeEnvFile(previous, changed));

    const recreateServices = [...serviceSet].sort();
    const changedKeys = [...changed.keys()].sort();
    return {
      envFilePath,
      changedKeys,
      recreateServices,
      command: recreateCommand(recreateServices),
      settings: this.getConfig().settings,
    };
  }

  private envPath(): string {
    try {
      return resolveEnvFilePath();
    } catch (err) {
      throw new ServiceUnavailableException(
        err instanceof Error ? err.message : 'env file unavailable',
      );
    }
  }

  private effectiveValue(key: string, fileValues: Map<string, string>): string {
    const fromFile = fileValues.get(key);
    if (fromFile !== undefined) return fromFile;
    const fromProcess = process.env[key];
    return fromProcess === undefined ? '' : fromProcess;
  }

  /** Normalize for UI when possible; keep raw if the file value is invalid. */
  private viewValue(setting: ConfigSetting, raw: string): string {
    try {
      return this.normalizeValue(setting, raw);
    } catch {
      return raw;
    }
  }

  private normalizeValue(setting: ConfigSetting, raw: unknown): string {
    if (raw === null || raw === undefined) {
      return '';
    }
    const asString = typeof raw === 'string' ? raw.trim() : String(raw).trim();

    switch (setting.kind) {
      case 'string':
        return asString;
      case 'bool': {
        const lower = asString.toLowerCase();
        if (lower === 'true' || lower === '1' || lower === 'yes') return 'true';
        if (
          lower === 'false' ||
          lower === '0' ||
          lower === 'no' ||
          lower === ''
        )
          return 'false';
        throw new BadRequestException(
          `${setting.key} must be a boolean (true/false)`,
        );
      }
      case 'int': {
        if (asString === '') return '';
        const n = Number(asString);
        if (!Number.isFinite(n) || !Number.isInteger(n)) {
          throw new BadRequestException(`${setting.key} must be an integer`);
        }
        return String(n);
      }
      default:
        return asString;
    }
  }
}
