const service = require("./trip-revenues.service");

// =======================
// Helpers
// =======================
function getUserId(req) {
return req?.user?.sub || req?.user?.id || req?.user?.userId || null;
}

function handleError(res, err) {
const status = err?.statusCode || 500;
return res.status(status).json({
message: err?.message || "Internal server error",
});
}

// =======================
// GET current revenue
// =======================
async function getByTripId(req, res) {
try {
const companyId = req.companyId;
const tripId = req.params.tripId;

```
const data = await service.getByTripId(tripId, companyId);

return res.json(data);
```

} catch (err) {
return handleError(res, err);
}
}

// =======================
// GET history
// =======================
async function getRevenueHistoryByTripId(req, res) {
try {
const companyId = req.companyId;
const tripId = req.params.tripId;

```
const data = await service.getRevenueHistoryByTripId(
  tripId,
  companyId
);

return res.json({ items: data });
```

} catch (err) {
return handleError(res, err);
}
}

// =======================
// CREATE / UPDATE
// =======================
async function createOrUpdateRevenue(req, res) {
try {
const companyId = req.companyId;
const tripId = req.params.tripId;

```
const result = await service.createOrUpdateRevenue({
  companyId,
  trip_id: tripId,
  amount: req.body?.amount,
  currency: req.body?.currency,
  source: req.body?.source,
  contract_id: req.body?.contract_id,
  invoice_id: req.body?.invoice_id,
  pricing_rule_id: req.body?.pricing_rule_id,
  notes: req.body?.notes,
  entered_by: getUserId(req),
});

return res.json(result);
```

} catch (err) {
return handleError(res, err);
}
}

// =======================
// APPROVE
// =======================
async function approveCurrentRevenue(req, res) {
try {
const companyId = req.companyId;
const tripId = req.params.tripId;

```
const result = await service.approveCurrentRevenue({
  companyId,
  trip_id: tripId,
  approved_by: getUserId(req),
  approval_notes: req.body?.approval_notes,
});

return res.json(result);
```

} catch (err) {
return handleError(res, err);
}
}

// =======================
// PROFITABILITY
// =======================
async function getTripProfitability(req, res) {
try {
const companyId = req.companyId;
const tripId = req.params.tripId;

```
const data = await service.getTripProfitability(
  tripId,
  companyId
);

return res.json(data);
```

} catch (err) {
return handleError(res, err);
}
}

module.exports = {
getByTripId,
getRevenueHistoryByTripId,
createOrUpdateRevenue,
approveCurrentRevenue,
getTripProfitability,
};
