/* ==========================================================================
   STI CampusFlow — office rules
   Change these values to fit the campus. No code changes needed.
   ========================================================================== */
const env = typeof process !== 'undefined' && process.env ? process.env : {};
const config = {
  officeName: 'Office of the Registrar',
  campusName: 'STI College Global City',

  // Opening hours, in 24-hour time. Appointments are cut into windows of `slotMinutes`.
  openTime: '08:00',
  closeTime: '17:00',
  lunchStart: '12:00',
  lunchEnd: '13:00',
  slotMinutes: 60,            // one-hour windows: 8 AM, 9 AM, 10 AM…

  // How many students can claim in the SAME window. Keeps the counter from getting crowded
  // (feedback: "yung limit nalang baka magconflict sa ibang students").
  defaultSlotCapacity: 8,

  maxAdvanceDays: 45,          // how far ahead students can book
  minLeadHours: 2,             // same-day bookings must be at least this far away
  maxOpenRequests: 3,          // open requests per student at one time

  // Late policy (feedback: "cancel ba agad or may extra time?")
  graceMinutes: 30,            // minutes after the window ends before a request counts as missed
  rescheduleWindowDays: 7,     // days a student has to pick a new time after missing
  maxReschedules: 2,           // how many times a student can move one request

  // Reminders (feedback: "within a day mag nonotif")
  reminderHoursBefore: 24,     // first reminder
  secondReminderHoursBefore: 2,// second, same-day reminder

  // Privacy on the claiming board: show 02000•••456 instead of the full number
  maskStudentNumbers: true,

  port: Number(env.PORT) || 3000,
  // Where the database and the QR secret key are kept. On a host, point DATA_DIR at the
  // persistent disk (e.g. /var/data) so data survives restarts and redeploys.
  dataDir: env.DATA_DIR || 'data',
  databaseFile: env.DB_FILE || 'campusflow.db',

  // First start on an empty database: 'demo' = sample students and requests (for testing/defense),
  // 'minimal' = only the document list + head registrar account (for real use).
  seedMode: env.SEED_MODE || 'demo',
  adminPassword: env.ADMIN_PASSWORD || '',   // password for REG-001 when seedMode is 'minimal'
  sessionHours: 8,

  // Gmail. Every notification the student gets in the app is also emailed.
  // Turn on 2-Step Verification on the account, then make an App Password at
  // Google Account > Security > App passwords > Mail, and paste the 16-character
  // code below. Never put the account's real password here.
  // Leave both blank and emails print in the console instead, which is handy while testing.
  gmail: {
    user: env.GMAIL_USER || '',
    appPassword: env.GMAIL_APP_PASSWORD || '',
    fromName: env.GMAIL_FROM_NAME || 'STI CampusFlow Registrar',
  },
  emailNotifications: env.EMAIL_NOTIFICATIONS !== 'off',

  // Password rules for student sign-up
  minPasswordLength: 8,
  demoPassword: env.DEMO_PASSWORD || 'Student@123',   // sample student accounts when seedMode is 'demo'
  // Only these email domains may sign in (subdomains count, so sti.edu.ph also allows globalcity.sti.edu.ph)
  allowedEmailDomains: (env.ALLOWED_EMAIL_DOMAINS || 'sti.edu.ph').split(',').map((d) => d.trim()).filter(Boolean),

  // Address printed inside the QR code on slips. Leave empty to use this computer's
  // Wi-Fi address automatically (so phones on the same network can open it).
  // Set it to your real domain once the system is hosted, e.g. 'https://campusflow.example.edu'
  publicUrl: env.PUBLIC_URL || '',
};

if (typeof module !== 'undefined' && module.exports) module.exports = config;
else if (typeof window !== 'undefined') window.CAMPUSFLOW_CONFIG = config;
