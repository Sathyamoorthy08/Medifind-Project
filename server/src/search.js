const aliases = new Map([
 ['acetaminophen', 'paracetamol'], ['paracetamol', 'acetaminophen'],
 ['vitamin c', 'ascorbic acid'], ['ascorbic acid', 'vitamin c'],
 ['ors', 'oral rehydration salts'], ['oral rehydration salts', 'ors'],
 ['menthol', 'cough lozenges'], ['gauze', 'bandage roll'],
]);
function searchTerms(input) { const term = String(input || '').trim(); if (!term) return []; const alias = aliases.get(term.toLowerCase()); return [...new Set([term, ...(alias ? [alias] : [])])]; }
module.exports = { searchTerms };
