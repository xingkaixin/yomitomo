export class DatabaseTooNewError extends Error {
  readonly code = 'DATABASE_TOO_NEW';
  readonly requiredReaderLevel: number;
  readonly supportedReaderLevel: number;
  readonly unknownMigrationIds: string[];

  constructor(options: {
    requiredReaderLevel: number;
    supportedReaderLevel: number;
    unknownMigrationIds?: string[];
  }) {
    super(
      `这份本地数据库需要 reader level ${options.requiredReaderLevel}，当前应用只支持到 ${options.supportedReaderLevel}。`,
    );
    this.name = 'DatabaseTooNewError';
    this.requiredReaderLevel = options.requiredReaderLevel;
    this.supportedReaderLevel = options.supportedReaderLevel;
    this.unknownMigrationIds = options.unknownMigrationIds || [];
  }
}
