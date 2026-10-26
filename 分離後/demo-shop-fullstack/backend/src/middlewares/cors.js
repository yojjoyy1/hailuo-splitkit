const cors = require('cors');
const config = require('../config');

module.exports = function corsMw() {
  const allow = new Set(config.cors.whitelist);
  return cors({
    origin(origin, cb) {
      if (!origin || allow.has(origin) || allow.has('*')) return cb(null, true);
      return cb(null, false);
    },
    credentials: true,
  });
};
