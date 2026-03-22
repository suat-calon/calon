/** @type {import('jest').Config} */
module.exports = {
  testMatch: ['<rootDir>/lib/__tests__/**/*.test.ts'],
  transform: {
    '\\.[jt]sx?$': ['babel-jest', {
      presets: [
        ['@babel/preset-env', { targets: { node: 'current' } }],
        ['@babel/preset-typescript', { isTSX: false, allExtensions: true }],
      ],
    }],
  },
};
