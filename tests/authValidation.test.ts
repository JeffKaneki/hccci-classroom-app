import assert from 'node:assert/strict';
import test from 'node:test';

import { isAllowedRegistrationEmail } from '../src/lib/authValidation';

test('accepts HCCCI school email addresses case-insensitively', () => {
  assert.equal(isAllowedRegistrationEmail('student@hccci.edu.ph'), true);
  assert.equal(isAllowedRegistrationEmail('  Student.Name@HCCCI.EDU.PH  '), true);
});

test('rejects personal, lookalike, and malformed registration addresses', () => {
  assert.equal(isAllowedRegistrationEmail('admin@gmail.com'), false);
  assert.equal(isAllowedRegistrationEmail('student@sub.hccci.edu.ph'), false);
  assert.equal(isAllowedRegistrationEmail('student@hccci.edu.ph.example.com'), false);
  assert.equal(isAllowedRegistrationEmail('student hccci.edu.ph'), false);
  assert.equal(isAllowedRegistrationEmail(''), false);
});
