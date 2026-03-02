/** @type {import('jest').Config} */
module.exports = {
  moduleFileExtensions: ['js', 'json', 'ts'],
  rootDir:              '.',
  testEnvironment:      'node',
  testRegex:            'test/.*\\.e2e-spec\\.ts$',
  transform: {
    '^.+\\.(t|j)s$': ['ts-jest', {
      tsconfig: {
        // E2E testleri için gevşek tsconfig — jest açıklamaları vs için
        strict:               true,
        esModuleInterop:      true,
        experimentalDecorators: true,
        emitDecoratorMetadata:  true,
        target:               'ES2022',
        module:               'CommonJS',
        moduleResolution:     'node',
        skipLibCheck:         true,
      },
    }],
  },
  moduleNameMapper: {
    '^@common/(.*)$':  '<rootDir>/src/common/$1',
    '^@modules/(.*)$': '<rootDir>/src/modules/$1',
    '^@prisma/client$': '<rootDir>/../../packages/database/generated/client',
  },
  // E2E testleri yavaş olabilir — 120 sn timeout
  testTimeout: 120_000,
  // Paralel çalıştırma kapalı: DB state birbirini bozmasın
  maxWorkers:  1,
};
