const { readDb, writeDb, genId } = require('./db');
const { hashPassword } = require('./utils/password');

function seedIfEmpty() {
  const db = readDb();
  if (db.users.length > 0) return; // already seeded

  const admin = mkUser('Clinic Admin', 'admin@clinic.local', 'admin123', 'admin');
  const doc1User = mkUser('Dr. Asha Rao', 'asha.rao@clinic.local', 'doctor123', 'doctor');
  const doc2User = mkUser('Dr. Liam Chen', 'liam.chen@clinic.local', 'doctor123', 'doctor');

  db.users.push(admin, doc1User, doc2User);
  db.doctors.push(
    {
      id: genId('doc'),
      userId: doc1User.id,
      name: doc1User.name,
      email: doc1User.email,
      specialisation: 'General Medicine',
      workingHours: { start: '09:00', end: '13:00' },
      slotDurationMinutes: 20,
      leaveDays: []
    },
    {
      id: genId('doc'),
      userId: doc2User.id,
      name: doc2User.name,
      email: doc2User.email,
      specialisation: 'Dermatology',
      workingHours: { start: '14:00', end: '17:00' },
      slotDurationMinutes: 30,
      leaveDays: []
    }
  );

  writeDb(db);
  console.log('[seed] Demo data created:');
  console.log('  Admin  -> admin@clinic.local / admin123');
  console.log('  Doctor -> asha.rao@clinic.local / doctor123 (General Medicine)');
  console.log('  Doctor -> liam.chen@clinic.local / doctor123 (Dermatology)');
  console.log('  (Patients: register your own from the Patient portal)');
}

function mkUser(name, email, password, role) {
  const { hash, salt } = hashPassword(password);
  return { id: genId('user'), name, email, phone: '', passwordHash: hash, salt, role };
}

module.exports = { seedIfEmpty };
