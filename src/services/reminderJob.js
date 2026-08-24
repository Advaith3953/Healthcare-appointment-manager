const { readDb, writeDb } = require('../db');
const { sendEmail, retryPendingEmails } = require('./emailService');

// How often the job wakes up. Kept short (30s) so the demo is easy to see
// working; in production this would run every few minutes via cron/queue.
const TICK_MS = 30 * 1000;

/**
 * Very simple frequency parser: looks for a number of times/day in the
 * prescription text (e.g. "twice daily", "3 times a day", "once daily").
 * Falls back to once/day if nothing is recognised, so reminders still fire.
 */
function parseTimesPerDay(prescriptionText = '') {
  const text = prescriptionText.toLowerCase();
  if (/once|1 time|1x/.test(text)) return 1;
  if (/twice|2 times|2x/.test(text)) return 2;
  if (/thrice|3 times|3x|three times/.test(text)) return 3;
  if (/4 times|four times|4x/.test(text)) return 4;
  return 1;
}

async function checkMedicationReminders() {
  const db = readDb();
  const now = new Date();

  const completed = db.appointments.filter(
    (a) => a.status === 'completed' && a.prescription
  );

  for (const appt of completed) {
    const timesPerDay = parseTimesPerDay(appt.prescription);
    const alreadySent = appt.remindersSent.length;

    // Demo pacing: one reminder per tick per appointment, up to
    // timesPerDay reminders total, so behaviour is easy to observe.
    if (alreadySent < timesPerDay) {
      const patient = db.users.find((u) => u.id === appt.patientId);
      if (!patient) continue;

      await sendEmail({
        to: patient.email,
        subject: 'Medication reminder',
        body: `Hi ${patient.name}, this is a reminder to take your medication as prescribed: "${appt.prescription}".`,
        type: 'reminder',
        appointmentId: appt.id
      });

      const fresh = readDb();
      const apptRef = fresh.appointments.find((a) => a.id === appt.id);
      apptRef.remindersSent.push(now.toISOString());
      writeDb(fresh);
    }
  }
}

function startReminderJob() {
  setInterval(async () => {
    try {
      await checkMedicationReminders();
      await retryPendingEmails();
    } catch (err) {
      // Background job errors must never crash the server.
      console.error('[reminderJob] tick failed:', err.message);
    }
  }, TICK_MS);
  console.log(`[reminderJob] started, ticking every ${TICK_MS / 1000}s`);
}

module.exports = { startReminderJob, checkMedicationReminders };
