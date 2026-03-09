function ok(payload = {}) {
  return {
    ok: true,
    ...payload,
  };
}

module.exports = {
  ok,
};