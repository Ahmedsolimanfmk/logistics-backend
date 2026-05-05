const service = require("./driver-custody.service");

function getAuthUserId(req) {
  return req.user?.sub || req.user?.id;
}

async function addCashReceipt(req, res) {
  try {
    const companyId = req.companyId;
    const userId = getAuthUserId(req);

    const { driver_id, trip_id, amount, reference, attachment_url, notes } =
      req.body;

    const data = await service.addCashReceipt({
      companyId,
      driverId: driver_id,
      tripId: trip_id,
      amount,
      reference,
      attachmentUrl: attachment_url,
      notes,
    });

    return res.json({
      success: true,
      data,
    });
  } catch (error) {
    return res.status(400).json({
      success: false,
      message: error.message,
    });
  }
}

module.exports = {
  addCashReceipt,
};