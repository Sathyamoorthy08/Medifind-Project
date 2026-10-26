const { searchTerms } = require('./search');

// Maintained, deliberately small synonym dataset. These entries support matching only;
// they are not prescribing rules or evidence of therapeutic interchangeability.
const knowledge = [
  { ingredient: 'paracetamol', terms: ['paracetamol', 'acetaminophen', 'tylenol'], category: 'Pain and fever relief', sources: ['https://www.ncbi.nlm.nih.gov/mesh/68000082', 'https://dailymed.nlm.nih.gov/dailymed/lookup.cfm?setid=01f41fae-4abb-4b96-ab09-a7d3dfc286cd&version=10'] },
  { ingredient: 'ibuprofen', terms: ['ibuprofen'], category: 'Pain and fever relief' },
  { ingredient: 'cetirizine', terms: ['cetirizine'], category: 'Allergy relief' },
  { ingredient: 'loratadine', terms: ['loratadine'], category: 'Allergy relief' },
  { ingredient: 'oral rehydration salts', terms: ['ors', 'oral rehydration salts'], category: 'Oral rehydration', relation: 'genericName', sources: ['https://cdn.who.int/media/docs/default-source/2025-eml-expert-committee/reviews/r.1_emlc-review_attachment1.pdf'] },
  { ingredient: 'ascorbic acid', terms: ['vitamin c', 'ascorbic acid'], category: 'Vitamins', sources: ['https://ods.od.nih.gov/factsheets/VitaminC-consumer/'] },
  { ingredient: 'calcium carbonate', terms: ['calcium carbonate'], category: 'Antacids' },
  { ingredient: 'povidone-iodine', terms: ['povidone iodine', 'povidone-iodine'], category: 'Basic first aid' }
];
const disclaimer = 'Informational local matching only. Suggestions are not a prescription or a guarantee of therapeutic equivalence. Do not change medicines or doses based on this result. Ask a licensed pharmacist or prescriber about different ingredients, combination products, strengths, forms, prescriptions, or uncertain matches. All stock and prices are fictional demo data.';
const normalize = value => String(value || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
function knowledgeFor(query) {
  const q = normalize(query);
  if (!q) return null;
  return knowledge.find(entry => entry.terms.some(term => { const t = normalize(term); return q === t || q.includes(t); })) || null;
}
function itemPharmacyId(item) {
  const pharmacy = item.pharmacy;
  return String(pharmacy?._id || pharmacy?.id || pharmacy || '');
}
function sameMedicineQuery(item, query) {
  const terms = searchTerms(query).map(normalize).filter(Boolean);
  const known = knowledgeFor(query);
  if (known) terms.push(normalize(known.ingredient), ...known.terms.map(normalize));
  if (!terms.length) return false;
  const medicine = normalize(item.medicine);
  const generic = normalize(item.genericName);
  const ingredient = normalize(item.activeIngredient);
  return terms.some(term => medicine === term || medicine.startsWith(`${term} `) || generic === term || ingredient === term);
}
function listingFor(item, pharmacy, query) {
  const sameTitle = normalize(item.medicine) === normalize(query) || normalize(item.medicine).startsWith(`${normalize(query)} `);
  return {
    id: String(item._id || item.id), medicine: item.medicine, genericName: item.genericName,
    activeIngredient: item.activeIngredient || item.genericName || null, category: item.category || null,
    strength: item.strength || null, form: item.form || null, price: Number(item.price), quantity: Number(item.quantity),
    pharmacy: { id: String(pharmacy._id || pharmacy.id), name: pharmacy.name, city: pharmacy.city, address: pharmacy.address },
    availability: 'Available in fictional demo inventory',
    matchReason: sameTitle ? 'Same medicine listed at another pharmacy' : 'Same generic or active ingredient listed elsewhere; review strength and form with a pharmacist',
    isDemo: item.isDemo !== false && pharmacy.isDemo !== false
  };
}
function buildSuggestions(query, inventory, pharmacies) {
  const entry = knowledgeFor(query);
  if (!entry) return { recognized: false, activeIngredient: null, suggestions: [], message: 'No verified alternative found in the demo dataset. Ask a licensed pharmacist or prescriber about options.' };
  const eligible = inventory.filter(item => Number(item.quantity) > 0 && (entry.relation === 'genericName'
    ? normalize(item.genericName) === normalize(entry.ingredient)
    : normalize(item.activeIngredient || item.genericName) === normalize(entry.ingredient)));
  const suggestions = eligible.map(item => {
    const pharmacy = pharmacies.find(p => String(p._id || p.id) === itemPharmacyId(item));
    if (!pharmacy) return null;
    const q = normalize(query);
    const sameListing = normalize(item.medicine) === q || normalize(item.genericName) === q;
    return {
      id: String(item._id || item.id), medicine: item.medicine, genericName: item.genericName,
      activeIngredient: entry.relation === 'genericName' ? null : item.activeIngredient || entry.ingredient,
      category: item.category || entry.category, strength: item.strength || null, form: item.form || null,
      price: Number(item.price), quantity: Number(item.quantity),
      pharmacy: { id: String(pharmacy._id || pharmacy.id), name: pharmacy.name, city: pharmacy.city, address: pharmacy.address },
      availability: 'Available in fictional demo inventory',
      matchReason: sameListing ? 'Same generic name' : entry.relation === 'genericName' ? 'Same generic name' : 'Same active ingredient (review strength and form with a pharmacist)',
      isDemo: item.isDemo !== false && pharmacy.isDemo !== false
    };
  }).filter(Boolean).slice(0, 6);
  return { recognized: true, activeIngredient: entry.relation === 'genericName' ? null : entry.ingredient, suggestions,
    message: suggestions.length ? '' : `No verified alternative found in the demo dataset for ${entry.ingredient}. No matching item has available demo stock. Ask a licensed pharmacist or prescriber.` };
}
function buildAvailabilityReport(query, inventory, pharmacies, selectedPharmacyId = '', selectedPharmacyName = '') {
  const q = String(query || '').trim();
  const selectedId = String(selectedPharmacyId || '');
  const selectedName = normalize(selectedPharmacyName);
  const stock = inventory.filter(item => Number(item.quantity) > 0);
  const sameMedicineElsewhere = stock.filter(item => sameMedicineQuery(item, q) && itemPharmacyId(item) !== selectedId && (!selectedName || !pharmacies.some(p => itemPharmacyId(item) === String(p._id || p.id) && normalize(p.name) === selectedName))).map(item => {
    const pharmacy = pharmacies.find(p => String(p._id || p.id) === itemPharmacyId(item));
    return pharmacy ? listingFor(item, pharmacy, q) : null;
  }).filter(Boolean).slice(0, 12);
  if (sameMedicineElsewhere.length) return {
    mode: 'other_pharmacies', recognized: true, matches: sameMedicineElsewhere, suggestions: [],
    message: 'This medicine is unavailable at the selected pharmacy. The same medicine or generic is listed at these other pharmacies.',
    disclaimer
  };
  const alternatives = buildSuggestions(q, stock, pharmacies);
  if (alternatives.suggestions.length) return {
    mode: 'alternatives', recognized: true, matches: [], ...alternatives, disclaimer
  };
  const known = knowledgeFor(q);
  const anyMatchingListing = inventory.some(item => sameMedicineQuery(item, q));
  const message = !known
    ? 'No verified alternative found in the demo dataset. Ask a licensed pharmacist or prescriber about options.'
    : anyMatchingListing
      ? `This medicine has no available stock at any listed pharmacy. No verified alternative found in the demo dataset for ${known.ingredient}. Ask a licensed pharmacist or prescriber.`
      : alternatives.message;
  return {
    mode: 'none', recognized: Boolean(known), status: anyMatchingListing ? 'unavailable_everywhere' : 'no_verified_match',
    activeIngredient: known?.relation === 'genericName' ? null : known?.ingredient || null,
    matches: [], suggestions: [], message, disclaimer
  };
}
module.exports = { knowledge, normalize, knowledgeFor, sameMedicineQuery, buildSuggestions, buildAvailabilityReport, disclaimer };
