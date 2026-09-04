export default {
  rules: {
    'annotation-no-unknown': true,
    'at-rule-no-unknown': [true, { ignoreAtRules: ['layer', 'property'] }],
    'block-no-empty': true,
    'color-no-invalid-hex': true,
    'declaration-block-no-duplicate-custom-properties': true,
    'declaration-block-no-duplicate-properties': [true, {
      ignore: ['consecutive-duplicates-with-different-values'],
    }],
    'function-calc-no-unspaced-operator': true,
    'function-no-unknown': true,
    'no-invalid-double-slash-comments': true,
    'property-no-unknown': true,
    'selector-pseudo-class-no-unknown': true,
    'selector-pseudo-element-no-unknown': true,
    'string-no-newline': true,
    'unit-no-unknown': true,
  },
};
