const { readDb, writeDb, genId } = require('../db');

// Turn "09:00" into minutes-since-midnight for easy math
function toMinutes(hhmm) {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}
function toHHMM(mins) {
  const h = String(Math.floor(mins / 60)).padStart(2, '0');
  const m = String(mins % 60).padStart(2, '0');
  return `${h}:${m}`;
}

/**
 * Compute available slots for a doctor on a given date.
 * Excludes leave days entirely, and excludes any slot already booked.
 */
function getAvailableSlots(db, doctorId, date) {
  const doctor = db.doctors.find((d) => d.id === doctorId);
  if (!doctor) return { error: 'Doctor not found' };
  if (doctor.leaveDays.includes(date)) return { onLeave: true, slots: [] };

  const start = toMinutes(doctor.workingHours.start);
  const end = toMinutes(doctor.workingHours.end);
  const duration = doctor.slotDurationMinutes;

  const allSlots = [];
  for (let t = start; t + duration <= end; t += duration) {
    allSlots.push(toHHMM(t));
  }

  const bookedTimes = new Set(
    db.appointments
      .filter((a) => a.doctorId === doctorId && a.date === date && a.status === 'booked')
      .map((a) => a.time)
  );

  const slots = allSlots.filter((t) => !bookedTimes.has(t));
  return { onLeave: false, slots };
}

/**
 * Atomically reserve a slot for a patient.
 *
 * "Atomic" here means: read -> validate -> write happens as one synchronous
 * block, with no `await` in between. Node runs JS on a single thread, so a
 * purely synchronous function body cannot be interleaved with another
 * request's handler — the whole check-then-reserve sequence finishes before
 * the event loop can hand control to a concurrent booking request. That is
 * the "slot hold" mechanism: the slot is locked in the moment it's checked,
 * not after some later async step (like an LLM call) finishes.
 *
 * Anything that can fail or take time (LLM summary, email, calendar file)
 * happens AFTER this function returns, against the already-confirmed
 * appointment record, so it can never cause a double-booking.
 */
function reserveSlot({ doctorId, patientId, date, time, symptomForm }) {
  const db = readDb(); // sync read
  const doctor = db.doctors.find((d) => d.id === doctorId);
  if (!doctor) return { ok: false, error: 'Doctor not found' };
  if (doctor.leaveDays.includes(date)) {
    return { ok: false, error: 'Doctor is on leave on this date' };
  }

  const { start, end } = doctor.workingHours;
  const duration = doctor.slotDurationMinutes;
  const tMins = toMinutes(time);
  if (tMins < toMinutes(start) || tMins + duration > toMinutes(end)) {
    return { ok: false, error: 'Requested time is outside working hours' };
  }

  const clash = db.appointments.some(
    (a) => a.doctorId === doctorId && a.date === date && a.time === time && a.status === 'booked'
  );
  if (clash) {
    return { ok: false, error: 'This slot was just booked by someone else. Please pick another.' };
  }

  const appointment = {
    id: genId('appt'),
    patientId,
    doctorId,
    date,
    time,
    status: 'booked',
    symptomForm: symptomForm || null,
    preVisitSummary: null,
    preVisitSummaryPending: true,
    doctorNotes: null,
    prescription: null,
    postVisitSummary: null,
    calendarEventIds: { patient: null, doctor: null },
    remindersSent: [],
    createdAt: new Date().toISOString()
  };

  db.appointments.push(appointment);
  writeDb(db); // sync write — reservation is now durable before we return

  return { ok: true, appointment };
}

module.exports = { getAvailableSlots, reserveSlot, toMinutes, toHHMM };
