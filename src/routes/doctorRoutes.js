const express = require('express');
const { readDb, writeDb } = require('../db');
const { requireAuth, requireRole } = require('../middleware/auth');
const { generatePostVisitSummary } = require('../services/llmService');
const { sendEmail } = require('../services/emailService');

const router = express.Router();
router.use(requireAuth, requireRole('doctor'));

function myDoctorProfile(db, userId) {
  return db.doctors.find((d) => d.userId === userId);
}

router.get('/appointments', (req, res) => {
  const db = readDb();
  const doctor = myDoctorProfile(db, req.user.userId);
  if (!doctor) return res.status(404).json({ error: 'Doctor profile not found for this account' });

  const appointments = db.appointments
    .filter((a) => a.doctorId === doctor.id && a.status !== 'cancelled')
    .map((a) => ({ ...a, patient: publicPatient(db, a.patientId) }))
    .sort((a, b) => `${a.date}${a.time}`.localeCompare(`${b.date}${b.time}`));

  res.json({ appointments });
});

router.get('/leave-days', (req, res) => {
  const db = readDb();
  const doctor = myDoctorProfile(db, req.user.userId);
  if (!doctor) return res.status(404).json({ error: 'Doctor profile not found' });
  res.json({ leaveDays: doctor.leaveDays });
});

/**
 * Submit post-visit notes + prescription. Generates a patient-friendly
 * summary via the LLM (with fallback), marks the appointment completed,
 * and emails the patient. Also kicks off medication reminders via
 * remindersSent tracking, picked up by reminderJob.
 */
router.post('/appointments/:id/complete', async (req, res) => {
  const { notes, prescription } = req.body;
  if (!notes) return res.status(400).json({ error: 'notes are required' });

  const db = readDb();
  const doctor = myDoctorProfile(db, req.user.userId);
  const appt = db.appointments.find((a) => a.id === req.params.id && a.doctorId === doctor?.id);
  if (!appt) return res.status(404).json({ error: 'Appointment not found' });

  appt.doctorNotes = notes;
  appt.prescription = prescription || null;
  appt.status = 'completed';
  writeDb(db);

  const summary = await generatePostVisitSummary(notes, prescription);

  const fresh = readDb();
  const apptRef = fresh.appointments.find((a) => a.id === req.params.id);
  apptRef.postVisitSummary = summary;
  writeDb(fresh);

  const patient = fresh.users.find((u) => u.id === apptRef.patientId);
  if (patient) {
    await sendEmail({
      to: patient.email,
      subject: 'Your visit summary is ready',
      body: `Hi ${patient.name}, here's a summary of your visit with Dr. ${doctor.name}:\n\n${summary.text}`,
      type: 'post_visit',
      appointmentId: appt.id
    });
  }

  res.json({ appointment: apptRef });
});

function publicPatient(db, patientId) {
  const p = db.users.find((u) => u.id === patientId);
  if (!p) return null;
  const { passwordHash, salt, ...safe } = p;
  return safe;
}

module.exports = router;
