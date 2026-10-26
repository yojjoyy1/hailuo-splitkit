function fail(status, code, message) {
  const err = new Error(message);
  err.status = status;
  err.code = code;
  return err;
}

function ok(res, data) {
  return res.json({ success: true, data, requestId: res.getHeader('X-Trace-Id') });
}

function publicUser(u) {
  if (!u) return null;
  const { password, ...rest } = u;
  return rest;
}

module.exports = { fail, ok, publicUser };
