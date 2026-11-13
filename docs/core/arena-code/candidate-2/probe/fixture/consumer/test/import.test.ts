import { test } from 'node:test';
import assert from 'node:assert/strict';
import { count } from '@probe/producer';
import type { Count } from '@probe/producer';
test('emitted ESM imports a second workspace package', () => { const value: Count = count(); assert.deepEqual(value,{count:24}); });
