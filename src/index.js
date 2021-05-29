const ExpressListEndPoints = require("./ExpressListEndPoints");

/**
 * Returns an array of strings with all the detected endpoints
 * @param {Object} app the express/route instance to get the endpoints from
 * @param {{ showParentMiddleware?: boolean }} options
 */
function listEndpoints(app, options = {}) {
  const endpoints = new ExpressListEndPoints(options);

  return endpoints.getEndpoints(app);
}

function wrap(fn) {
  if (typeof fn !== "function") {
    throw new Error("fn needs to be a function");
  }

  return {
    [fn.name](...args) {
      const ret = fn(...args);

      if (typeof ret === "function") {
        ret.params = args;
      }

      return ret;
    },
  }[fn.name];
}

module.exports = { listEndpoints, wrap, ExpressListEndPoints };
