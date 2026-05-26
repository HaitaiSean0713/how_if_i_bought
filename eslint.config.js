import eslint from '@eslint/js';
import firebaseRulesPlugin from '@firebase/eslint-plugin-security-rules';

export default [
  eslint.configs.recommended,
  {
    ignores: ['dist/**/*']
  },
  firebaseRulesPlugin.configs['flat/recommended']
];
