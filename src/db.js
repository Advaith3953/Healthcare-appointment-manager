const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DB_PATH = path.join(__dirname, '..', 'data', 'db.json');

const EMPTY_DB = {
  users: [],        // { id, name, email, passwordHash, salt, role, phone }
  doctors: [],       // { id, userId, name, specialisation, workingHours:{start,end}, slotDurationMinutes, leaveDays:[] }
  appointments: [],  // { id, patientId, doctorId, date, time, status, symptomForm, preVisitSummary, doctorNotes, prescription, postVisitSummary, calendarEventId, remindersSent }
  notifications: []  // sent-email log: { id, to, subject, body, type, appointmentId, sentAt, status }
};

function ensureDb() {
  if (!fs.existsSync(DB_PATH)) {
    fs.writeFileSync(DB_PATH, JSON.stringify(EMPTY_DB, null, 2));
  }
}

function readDb() {
  ensureDb();
  const raw = fs.readFileSync(DB_PATH, 'utf-8');
  return JSON.parse(raw);
}

function writeDb(db) {
  // Synchronous write -> completes before the event loop yields, which is
  // what keeps slot-booking checks race-free (see slotService.js).
  fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2));
}

function genId(prefix) {
  return `${prefix}_${crypto.randomBytes(6).toString('hex')}`;
}

module.exports = { readDb, writeDb, genId, DB_PATH };
