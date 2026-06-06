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
    super('DATABASE_TOO_NEW');
    this.name = 'DatabaseTooNewError';
    this.requiredReaderLevel = options.requiredReaderLevel;
    this.supportedReaderLevel = options.supportedReaderLevel;
    this.unknownMigrationIds = options.unknownMigrationIds || [];
  }
}
