function isUuid(v) {
  return (
    typeof v === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v)
  );
}

function assertUuid(value, fieldName = "id") {
  if (!isUuid(value)) {
    const err = new Error(`${fieldName} must be uuid`);
    err.statusCode = 400;
    throw err;
  }
  return true;
}

module.exports = {
  isUuid,
  assertUuid,
};