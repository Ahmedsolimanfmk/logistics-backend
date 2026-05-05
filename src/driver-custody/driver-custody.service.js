const prisma = require("../prisma");

async function addCashReceipt({
  companyId,
  driverId,
  tripId,
  amount,
  reference,
  attachmentUrl,
  notes,
}) {
  if (!amount || amount <= 0) {
    throw new Error("Amount must be greater than 0");
  }

  return prisma.driver_custody.create({
    data: {
      company_id: companyId,
      driver_id: driverId,
      trip_id: tripId || null,
      type: "CASH_RECEIVED",
      amount,
      reference: reference || null,
      attachment_url: attachmentUrl || null,
      notes: notes || null,
      status: "PENDING",
    },
  });
}

module.exports = {
  addCashReceipt,
};