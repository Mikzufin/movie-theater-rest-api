module.exports = {
    extends: [
      'airbnb-base',
      'plugin:import/errors'
    ],
    settings: {
      'import/resolver': 'node',
    },
    env: {
      es6: true,
      node: true,
    },
    rules: {
      'no-unused-vars': 1,
      'no-await-in-loop': 1,
      'no-restricted-globals': 0,
      'prefer-destructuring': 0,
      'import/prefer-default-export': 0,
    },
  };
  