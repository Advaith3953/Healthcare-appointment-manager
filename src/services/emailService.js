const fs = require('fs');
const path = require('path');
const { readDb, writeDb, genId } = require('../db');

const LOG_PATH = path.join(__dirname, '..', '..', 'data', 'emails.log');

/**
 * Sends (or, in demo mode, simulates) an email and always records the
 * attempt in db.notifications so failures are visible and retryable
 * instead of silently disappearing.
 */
async function sendEmail({ to, subject, body, type, appointmentId }) {
  const db = readDb();
  const record = {
    id: genId('notif'),
    to,
    subject,
    body,
    type, // 'booking_confirmation' | 'reminder' | 'cancellation' | 'post_visit'
    appointmentId: appointmentId || null,
    attempts: 0,
    status: 'pending',
    sentAt: null,
    createdAt: new Date().toISOString()
  };
  db.notifications.push(record);
  writeDb(db);

  await attemptDelivery(record.id);
  return record.id;
}

async function attemptDelivery(notificationId) {
  const db = readDb();
  const record = db.notifications.find((n) => n.id === notificationId);
  if (!record || record.status === 'sent') return;

  record.attempts += 1;

  try {
    if (process.env.EMAIL_MODE === 'smtp' && process.env.SMTP_HOST) {
      // Real provider hook. Plug in nodemailer / SendGrid / Mailgun here:
      //
      //   const nodemailer = require('nodemailer');
      //   const transporter = nodemailer.createTransport({
      //     host: process.env.SMTP_HOST, port: process.env.SMTP_PORT,
      //     auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
      //   });
      //   await transporter.sendMail({ from: process.env.EMAIL_FROM, ...record });
      //
      // Left unimplemented on purpose for this simple demo — see README.
      throw new Error('SMTP mode selected but not implemented in this demo — see README');
    }

    // Default "log" mode: simulate sending so the app runs with zero setup.
    const line = `[${new Date().toISOString()}] TO:${record.to} TYPE:${record.type} SUBJECT:"${record.subject}"\n${record.body}\n---\n`;
    fs.appendFileSync(LOG_PATH, line);
    console.log(`[emailService] (simulated) sent -> ${record.to}: ${record.subject}`);

    record.status = 'sent';
    record.sentAt = new Date().toISOString();
  } catch (err) {
    console.error(`[emailService] delivery failed (attempt ${record.attempts}):`, err.message);
    record.status = record.attempts >= 3 ? 'failed' : 'pending';
    record.lastError = err.message;
  }

  writeDb(db);
}

/** Retries any notification stuck in "pending" (used by the background job). */
async function retryPendingEmails() {
  const db = readDb();
  const pending = db.notifications.filter((n) => n.status === 'pending' && n.attempts < 3);
  for (const n of pending) {
    await attemptDelivery(n.id);
  }
}

module.exports = { sendEmail, retryPendingEmails };
