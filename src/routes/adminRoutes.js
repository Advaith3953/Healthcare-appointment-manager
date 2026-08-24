const express = require('express');
const { readDb, writeDb, genId } = require('../db');
const { hashPassword } = require('../utils/password');
const { requireAuth, requireRole } = require('../middleware/auth');
const { sendEmail } = require('../services/emailService');
const { deleteEvent } = require('../services/calendarService');

const router = express.Router();
router.use(requireAuth, requireRole('admin'));

// Create a doctor: makes a login-capable user AND a doctor profile
router.post('/doctors', (req, res) => {
  const { name, email, password, specialisation, workingHours, slotDurationMinutes } = req.body;
  if (!name || !email || !password || !specialisation || !workingHours || !slotDurationMinutes) {
    return res.status(400).json({ error: 'name, email, password, specialisation, workingHours {start,end}, slotDurationMinutes are required' });
  }
  const db = readDb();
  if (db.users.some((u) => u.email.toLowerCase() === email.toLowerCase())) {
    return res.status(409).json({ error: 'A user with this email already exists' });
  }

  const { hash, salt } = hashPassword(password);
  const user = { id: genId('user'), name, email, phone: '', passwordHash: hash, salt, role: 'doctor' };
  const doctor = {
    id: genId('doc'),
    userId: user.id,
    name,
    email,
    specialisation,
    workingHours, // { start: "09:00", end: "17:00" }
    slotDurationMinutes,
    leaveDays: []
  };

  db.users.push(user);
  db.doctors.push(doctor);
  writeDb(db);

  res.status(201).json({ doctor });
});

router.get('/doctors', (req, res) => {
  const db = readDb();
  res.json({ doctors: db.doctors });
});

router.patch('/doctors/:id', (req, res) => {
  const db = readDb();
  const doctor = db.doctors.find((d) => d.id === req.params.id);
  if (!doctor) return res.status(404).json({ error: 'Doctor not found' });

  const { specialisation, workingHours, slotDurationMinutes } = req.body;
  if (specialisation) doctor.specialisation = specialisation;
  if (workingHours) doctor.workingHours = workingHours;
  if (slotDurationMinutes) doctor.slotDurationMinutes = slotDurationMinutes;

  writeDb(db);
  res.json({ doctor });
});

/**
 * Mark a doctor on leave for a date. Any existing "booked" appointments on
 * that date are cancelled and the affected patients are emailed — this is
 * the "leave conflict handling" requirement.
 */
router.post('/doctors/:id/leave', async (req, res) => {
  const { date } = req.body;
  if (!date) return res.status(400).json({ error: 'date is required (YYYY-MM-DD)' });

  const db = readDb();
  const doctor = db.doctors.find((d) => d.id === req.params.id);
  if (!doctor) return res.status(404).json({ error: 'Doctor not found' });

  if (!doctor.leaveDays.includes(date)) doctor.leaveDays.push(date);

  const affected = db.appointments.filter(
    (a) => a.doctorId === doctor.id && a.date === date && a.status === 'booked'
  );

  for (const appt of affected) {
    appt.status = 'cancelled';
    appt.cancelReason = 'doctor_leave';
  }
  writeDb(db);

  // Notify affected patients + clean up their calendar events
  for (const appt of affected) {
    const patient = db.users.find((u) => u.id === appt.patientId);
    if (appt.calendarEventIds?.patient) deleteEvent(appt.calendarEventIds.patient);
    if (appt.calendarEventIds?.doctor) deleteEvent(appt.calendarEventIds.doctor);
    if (patient) {
      await sendEmail({
        to: patient.email,
        subject: 'Your appointment has been cancelled',
        body: `Hi ${patient.name}, unfortunately Dr. ${doctor.name} is unavailable on ${date} and your ${appt.time} appointment has been cancelled. Please rebook at your convenience — we're sorry for the inconvenience.`,
        type: 'cancellation',
        appointmentId: appt.id
      });
    }
  }

  res.json({ doctor, cancelledAppointments: affected.length });
});

module.exports = router;
