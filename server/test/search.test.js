const test = require('node:test');
const assert = require('node:assert/strict');
const { searchTerms } = require('../src/search');
test('smart search adds local common-name and generic aliases', () => {
 assert.deepEqual(searchTerms('acetaminophen'), ['acetaminophen', 'paracetamol']);
 assert.deepEqual(searchTerms('Vitamin C'), ['Vitamin C', 'ascorbic acid']);
 assert.deepEqual(searchTerms('unknown brand'), ['unknown brand']);
 assert.deepEqual(searchTerms('  '), []);
});
