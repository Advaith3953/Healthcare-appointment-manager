const express = require('express');
const { readDb, writeDb } = require('../db');
const { requireAuth, requireRole } = require('../middleware/auth');
const { getAvailableSlots, reserveSlot } = require('../utils/slotUtils');
const { generatePreVisitSummary } = require('../services/llmService');
const { sendEmail } = require('../services/emailService');
const { createEvent } = require('../services/calendarService');

const router = express.Router();
router.use(requireAuth, requireRole('patient'));

router.get('/doctors', (req, res) => {
  const db = readDb();
  const { specialisation } = req.query;
  let doctors = db.doctors;
  if (specialisation) {
    doctors = doctors.filter((d) =>
      d.specialisation.toLowerCase().includes(specialisation.toLowerCase())
    );
  }
  res.json({ doctors });
});

router.get('/doctors/:id/slots', (req, res) => {
  const { date } = req.query;
  if (!date) return res.status(400).json({ error: 'date query param is required (YYYY-MM-DD)' });
  const db = readDb();
  const result = getAvailableSlots(db, req.params.id, date);
  if (result.error) return res.status(404).json(result);
  res.json(result);
});

/**
 * Book an appointment. Two phases:
 *  1. SYNC: reserve the slot (atomic — see slotUtils.reserveSlot).
 *     Responds to the client immediately once this succeeds.
 *  2. ASYNC (fire-and-forget from the client's point of view, but awaited
 *     here so we can return the finished summary too when it's fast):
 *     generate the LLM pre-visit summary, send confirmation emails, and
 *     create calendar holds. None of these can ever undo the reservation —
 *     if they fail, the booking still stands and is retried/left visible
 *     as "pending" rather than breaking the flow.
 */
router.post('/appointments', async (req, res) => {
  const { doctorId, date, time, symptoms } = req.body;
  if (!doctorId || !date || !time || !symptoms) {
    return res.status(400).json({ error: 'doctorId, date, time and symptoms are required' });
  }

  const reservation = reserveSlot({
    doctorId,
    patientId: req.user.userId,
    date,
    time,
    symptomForm: { symptoms, submittedAt: new Date().toISOString() }
  });

  if (!reservation.ok) {
    return res.status(409).json({ error: reservation.error });
  }

  // Respond immediately with the confirmed booking — the patient should
  // never wait on the LLM/email/calendar steps to know their slot is held.
  res.status(201).json({ appointment: reservation.appointment, status: 'booked' });

  // Continue the rest of the flow after responding.
  finishBookingSideEffects(reservation.appointment.id).catch((err) =>
    console.error('[patientRoutes] post-booking side effects failed:', err.message)
  );
});

async function finishBookingSideEffects(appointmentId) {
  const db = readDb();
  const appt = db.appointments.find((a) => a.id === appointmentId);
  if (!appt) return;
  const doctor = db.doctors.find((d) => d.id === appt.doctorId);
  const patient = db.users.find((u) => u.id === appt.patientId);

  // LLM pre-visit summary (never throws — see llmService fallback)
  const summary = await generatePreVisitSummary(appt.symptomForm.symptoms);
  const fresh1 = readDb();
  const apptRef1 = fresh1.appointments.find((a) => a.id === appointmentId);
  apptRef1.preVisitSummary = summary;
  apptRef1.preVisitSummaryPending = false;
  writeDb(fresh1);

  // Calendar holds for both patient and doctor
  const patientEventId = createEvent({
    attendeeEmail: patient.email,
    title: `Appointment with Dr. ${doctor.name}`,
    description: `Specialisation: ${doctor.specialisation}`,
    date: appt.date,
    time: appt.time,
    durationMinutes: doctor.slotDurationMinutes
  });
  const doctorEventId = createEvent({
    attendeeEmail: doctor.email,
    title: `Appointment with ${patient.name}`,
    description: `Chief complaint: ${summary.chiefComplaint}`,
    date: appt.date,
    time: appt.time,
    durationMinutes: doctor.slotDurationMinutes
  });
  const fresh2 = readDb();
  const apptRef2 = fresh2.appointments.find((a) => a.id === appointmentId);
  apptRef2.calendarEventIds = { patient: patientEventId, doctor: doctorEventId };
  writeDb(fresh2);

  // Email confirmations
  await sendEmail({
    to: patient.email,
    subject: 'Appointment confirmed',
    body: `Hi ${patient.name}, your appointment with Dr. ${doctor.name} (${doctor.specialisation}) on ${appt.date} at ${appt.time} is confirmed. A calendar invite has been created.`,
    type: 'booking_confirmation',
    appointmentId
  });
  await sendEmail({
    to: doctor.email,
    subject: 'New appointment booked',
    body: `Hi Dr. ${doctor.name}, ${patient.name} booked a slot on ${appt.date} at ${appt.time}. Urgency: ${summary.urgencyLevel}. Chief complaint: ${summary.chiefComplaint}.`,
    type: 'booking_confirmation',
    appointmentId
  });
}

router.get('/appointments', (req, res) => {
  const db = readDb();
  const appointments = db.appointments
    .filter((a) => a.patientId === req.user.userId)
    .map((a) => ({ ...a, doctor: db.doctors.find((d) => d.id === a.doctorId) }))
    .sort((a, b) => `${b.date}${b.time}`.localeCompare(`${a.date}${a.time}`));
  res.json({ appointments });
});

router.get('/appointments/:id', (req, res) => {
  const db = readDb();
  const appt = db.appointments.find((a) => a.id === req.params.id && a.patientId === req.user.userId);
  if (!appt) return res.status(404).json({ error: 'Appointment not found' });
  res.json({ appointment: appt, doctor: db.doctors.find((d) => d.id === appt.doctorId) });
});

module.exports = router;
