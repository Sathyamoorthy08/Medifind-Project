require('dotenv').config({ path: process.env.ENV_FILE || 'server/.env' });
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const { User, Pharmacy, Inventory } = require('./models');
const pharmacies = [
  { name: 'GreenCross Pharmacy', address: '12 College Road, Anna Nagar', city: 'Chennai', phone: '+91 44 4000 1001', location: { lat: 13.085, lng: 80.21 } },
  { name: 'WellSpring Medico', address: '8 Lake View Street, T. Nagar', city: 'Chennai', phone: '+91 44 4000 1002', location: { lat: 13.0418, lng: 80.2341 } },
  { name: 'CarePlus Community Pharmacy', address: '24 Park Avenue, Adyar', city: 'Chennai', phone: '+91 44 4000 1003', location: { lat: 13.0012, lng: 80.2565 } },
  { name: 'Sunrise Health Mart', address: '5 MG Road, Bengaluru', city: 'Bengaluru', phone: '+91 80 4000 1004', location: { lat: 12.975, lng: 77.606 } },
  { name: 'CityCare Pharmacy', address: '31 FC Road, Pune', city: 'Pune', phone: '+91 20 4000 1005', location: { lat: 18.5204, lng: 73.841 } }
];
// Each listing is fictional classroom demonstration inventory, not verified pharmacy stock.
const medicines = [
  { medicine: 'Paracetamol 500 mg', genericName: 'Paracetamol', activeIngredient: 'paracetamol', category: 'Pain and fever relief', strength: '500 mg', form: 'Tablet', price: 18, quantity: 32 },
  { medicine: 'Paracetamol 650 mg', genericName: 'Paracetamol', activeIngredient: 'paracetamol', category: 'Pain and fever relief', strength: '650 mg', form: 'Tablet', price: 24, quantity: 24 },
  { medicine: 'Acetaminophen Oral Suspension', genericName: 'Paracetamol', activeIngredient: 'paracetamol', category: 'Pain and fever relief', strength: '120 mg/5 ml', form: 'Oral suspension', price: 68, quantity: 12 },
  { medicine: 'Ibuprofen 200 mg', genericName: 'Ibuprofen', activeIngredient: 'ibuprofen', category: 'Pain and fever relief', strength: '200 mg', form: 'Tablet', price: 32, quantity: 0 },
  { medicine: 'Cetirizine 10 mg', genericName: 'Cetirizine', activeIngredient: 'cetirizine', category: 'Allergy relief', strength: '10 mg', form: 'Tablet', price: 24, quantity: 12 },
  { medicine: 'Loratadine 10 mg', genericName: 'Loratadine', activeIngredient: 'loratadine', category: 'Allergy relief', strength: '10 mg', form: 'Tablet', price: 38, quantity: 14 },
  { medicine: 'Antacid Suspension', genericName: 'Aluminium hydroxide + magnesium hydroxide', activeIngredient: 'aluminium hydroxide + magnesium hydroxide', category: 'Antacids', strength: '170 ml', form: 'Suspension', price: 96, quantity: 15 },
  { medicine: 'Calcium Carbonate Chewables', genericName: 'Calcium carbonate', activeIngredient: 'calcium carbonate', category: 'Antacids', strength: '500 mg', form: 'Chewable tablet', price: 42, quantity: 16 },
  { medicine: 'ORS Lemon Sachet', genericName: 'Oral rehydration salts', activeIngredient: 'oral rehydration salts', category: 'Oral rehydration', strength: '21 g', form: 'Powder sachet', price: 22, quantity: 20 },
  { medicine: 'ORS Orange Sachet', genericName: 'Oral rehydration salts', activeIngredient: 'oral rehydration salts', category: 'Oral rehydration', strength: '21 g', form: 'Powder sachet', price: 25, quantity: 18 },
  { medicine: 'Vitamin C 500 mg', genericName: 'Ascorbic acid', activeIngredient: 'ascorbic acid', category: 'Vitamins', strength: '500 mg', form: 'Tablet', price: 48, quantity: 8 },
  { medicine: 'Vitamin D3 1000 IU', genericName: 'Cholecalciferol', activeIngredient: 'cholecalciferol', category: 'Vitamins', strength: '1000 IU', form: 'Tablet', price: 72, quantity: 11 },
  { medicine: 'B-Complex Tablets', genericName: 'Vitamin B complex', activeIngredient: 'vitamin b complex', category: 'Vitamins', strength: 'Standard', form: 'Tablet', price: 56, quantity: 13 },
  { medicine: 'Adhesive Bandages', genericName: 'Adhesive dressing', activeIngredient: 'adhesive dressing', category: 'Basic first aid', strength: 'Assorted', form: 'Strip pack', price: 35, quantity: 30 },
  { medicine: 'Sterile Gauze Roll', genericName: 'Cotton gauze', activeIngredient: 'cotton gauze', category: 'Basic first aid', strength: '5 cm', form: 'Roll', price: 28, quantity: 25 },
  { medicine: 'Antiseptic Solution', genericName: 'Povidone-iodine', activeIngredient: 'povidone-iodine', category: 'Basic first aid', strength: '50 ml', form: 'Topical solution', price: 64, quantity: 9 },
  { medicine: 'Saline Nasal Spray', genericName: 'Sodium chloride', activeIngredient: 'sodium chloride', category: 'Nasal care', strength: '20 ml', form: 'Nasal spray', price: 89, quantity: 9 },
  { medicine: 'Cough Lozenges', genericName: 'Menthol', activeIngredient: 'menthol', category: 'Throat care', strength: 'Pack of 10', form: 'Lozenge', price: 35, quantity: 18 },
  { medicine: 'Digital Thermometer', genericName: 'Digital thermometer', activeIngredient: 'digital thermometer', category: 'Health devices', strength: 'Digital', form: 'Device', price: 145, quantity: 6 },
  { medicine: 'Zinc 20 mg', genericName: 'Zinc sulfate', activeIngredient: 'zinc sulfate', category: 'Vitamins and minerals', strength: '20 mg', form: 'Tablet', price: 31, quantity: 17 },
  { medicine: 'Sterile Saline Eye Drops', genericName: 'Sterile sodium chloride', activeIngredient: 'sterile sodium chloride', category: 'Eye care', strength: '10 ml', form: 'Eye drops', price: 58, quantity: 7 }
];
async function seed() {
  await mongoose.connect(process.env.MONGODB_URI);
  await Promise.all([User.deleteMany({ email: /@demo\.medifind\.test$/ }), Pharmacy.deleteMany({ isDemo: true }), Inventory.deleteMany({ isDemo: true })]);
  const created = await Pharmacy.insertMany(pharmacies.map(p => ({ ...p, isDemo: true })));
  for (let n = 0; n < created.length; n++) await Inventory.insertMany(medicines.map((m, i) => ({ pharmacy: created[n]._id, ...m, price: m.price + (i % 3) * 4, quantity: Math.max(0, m.quantity - (n % 3) * 2), isDemo: true })));
  const passwordHash = await bcrypt.hash('DemoPass123!', 12);
  await User.create([{ name: 'Demo Explorer', email: 'user@demo.medifind.test', passwordHash, role: 'user' }, { name: 'Demo Pharmacy', email: 'pharmacy@demo.medifind.test', passwordHash, role: 'pharmacy', pharmacy: created[0]._id }]);
  console.log(`Seeded ${created.length} fictional pharmacies, ${created.length * medicines.length} demo inventory rows and two demo accounts.`);
  await mongoose.disconnect();
}
if (require.main === module) seed().catch(e => { console.error(e); process.exit(1); });
module.exports = { pharmacies, medicines, seed };

