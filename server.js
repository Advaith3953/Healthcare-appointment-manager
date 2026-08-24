require('dotenv').config();
const express = require('express');
const path = require('path');

const { seedIfEmpty } = require('./src/seed');
const { startReminderJob } = require('./src/services/reminderJob');

const authRoutes = require('./src/routes/authRoutes');
const adminRoutes = require('./src/routes/adminRoutes');
const patientRoutes = require('./src/routes/patientRoutes');
const doctorRoutes = require('./src/routes/doctorRoutes');

const app = express();
app.use(express.json());

app.use('/api/auth', authRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/patient', patientRoutes);
app.use('/api/doctor', doctorRoutes);

app.use(express.static(path.join(__dirname, 'public')));

// Central error handler so an unexpected error never crashes the process
app.use((err, req, res, next) => {
  console.error('[server] Unhandled error:', err);
  res.status(500).json({ error: 'Something went wrong on our end. Please try again.' });
});

process.on('unhandledRejection', (err) => {
  console.error('[server] Unhandled promise rejection:', err);
});

seedIfEmpty();
startReminderJob();

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Healthcare Appointment Manager running at http://localhost:${PORT}`);
});
