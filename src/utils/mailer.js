// =====================
// src/utils/mailer.js
// =====================

/**
 * Mock email sender.
 * In a real application, you would configure nodemailer, SendGrid, or AWS SES here.
 */
async function mockSendEmail({ to, subject, html }) {
  console.log("\n========================================");
  console.log("📧 MOCK EMAIL DISPATCHED");
  console.log("========================================");
  console.log(`To      : ${to}`);
  console.log(`Subject : ${subject}`);
  console.log(`Body    :\n${html.replace(/<[^>]*>?/gm, '')}`); // stripping html for console output
  console.log("========================================\n");

  return Promise.resolve({ success: true, messageId: `mock-${Date.now()}` });
}

module.exports = {
  mockSendEmail
};
