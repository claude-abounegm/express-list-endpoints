const ExpressListEndPoints = require("./ExpressListEndPoints");

/**
 * Returns an array of strings with all the detected endpoints
 * @param {Object} app the express/route instance to get the endpoints from
 * @param {{ showParentMiddleware?: boolean }} options
 */
function getEndpoints(app, options = {}) {
  const endpoints = new ExpressListEndPoints(options);

  return endpoints.getEndpoints(app);
}

module.exports = getEndpoints;
