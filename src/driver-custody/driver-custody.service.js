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
async function addTransfer({
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

  // 1) سجل التحويل
  const transfer = await prisma.driver_custody.create({
    data: {
      company_id: companyId,
      driver_id: driverId,
      trip_id: tripId || null,
      type: "TRANSFER",
      amount,
      reference: reference || null,
      attachment_url: attachmentUrl || null,
      notes: notes || null,
      status: "SETTLED",
    },
  });

  // 2) اقفل العهدة المفتوحة (لو فيه)
  await prisma.driver_custody.updateMany({
    where: {
      company_id: companyId,
      driver_id: driverId,
      trip_id: tripId || null,
      type: "CASH_RECEIVED",
      status: "PENDING",
    },
    data: {
      status: "SETTLED",
    },
  });

  return transfer;
}
async function addDeliveryProof({
  companyId,
  driverId,
  tripId,
  reference,
  attachmentUrl,
  notes,
}) {
  if (!tripId) {
    throw new Error("trip_id is required for delivery proof");
  }

  return prisma.driver_custody.create({
    data: {
      company_id: companyId,
      driver_id: driverId,
      trip_id: tripId,
      type: "DELIVERY_PROOF",
      amount: null,
      reference: reference || null,
      attachment_url: attachmentUrl || null,
      notes: notes || null,
      status: "SETTLED",
    },
  });
}

module.exports = {
  addCashReceipt,
  addTransfer,
  addDeliveryProof,
};