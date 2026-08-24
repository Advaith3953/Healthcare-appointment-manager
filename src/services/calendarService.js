const fs = require('fs');
const path = require('path');
const { genId } = require('../db');

const CAL_DIR = path.join(__dirname, '..', '..', 'calendar_events');

function formatICSDate(date, time) {
  // date: "2026-08-25", time: "09:30" -> "20260825T093000"
  return `${date.replace(/-/g, '')}T${time.replace(':', '')}00`;
}

/**
 * Creates a calendar event for one attendee (patient or doctor).
 *
 * This demo writes a standard .ics file to /calendar_events instead of
 * calling the real Google Calendar API, so it runs without any OAuth setup.
 * The .ics file is a real, importable calendar event — double-clicking it
 * adds it to Google Calendar / Outlook / Apple Calendar.
 *
 * To upgrade to live Google Calendar sync:
 *  1. Set up a Google Cloud project, enable the Calendar API, and complete
 *     the OAuth 2.0 consent flow (see README "Upgrading to real Google
 *     Calendar") to get a refresh token per doctor/patient.
 *  2. Replace the body of this function with a call to
 *     googleapis.calendar('v3').events.insert({ calendarId, requestBody }).
 *  3. Store the returned Google event ID in place of the local file id
 *     below — updateEvent/deleteEvent already key off that id, so no other
 *     code needs to change.
 */
function createEvent({ attendeeEmail, title, description, date, time, durationMinutes }) {
  const id = genId('cal');
  const dtStart = formatICSDate(date, time);
  const [h, m] = time.split(':').map(Number);
  const endMins = h * 60 + m + durationMinutes;
  const endTime = `${String(Math.floor(endMins / 60)).padStart(2, '0')}:${String(endMins % 60).padStart(2, '0')}`;
  const dtEnd = formatICSDate(date, endTime);

  const ics = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Healthcare Appointment Manager//EN',
    'BEGIN:VEVENT',
    `UID:${id}@clinic.local`,
    `DTSTART:${dtStart}`,
    `DTEND:${dtEnd}`,
    `SUMMARY:${title}`,
    `DESCRIPTION:${description}`,
    `ATTENDEE:mailto:${attendeeEmail}`,
    'STATUS:CONFIRMED',
    'END:VEVENT',
    'END:VCALENDAR'
  ].join('\r\n');

  fs.writeFileSync(path.join(CAL_DIR, `${id}.ics`), ics);
  return id;
}

function updateEvent(eventId, changes) {
  // For the .ics mock, simplest correct behaviour is delete + recreate.
  deleteEvent(eventId);
  return createEvent(changes);
}

function deleteEvent(eventId) {
  const file = path.join(CAL_DIR, `${eventId}.ics`);
  if (fs.existsSync(file)) fs.unlinkSync(file);
}

module.exports = { createEvent, updateEvent, deleteEvent };
