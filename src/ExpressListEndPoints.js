const regexpExpressRegexp =
  /^\/\^\\\/(?:(:?[\w\\.-]*(?:\\\/:?[\w\\.-]*)*)|(\(\?:\(\[\^\\\/]\+\?\)\)))\\\/.*/;
const expressRootRegexp = "/^\\/?(?=\\/|$)/i";
const regexpExpressParam = /\(\?:\(\[\^\\\/]\+\?\)\)/g;
const STACK_ITEM_VALID_NAMES = ["router", "bound dispatch", "mounted_app"];

class ExpressListEndPoints {
  options = {
    showParentMiddleware: false,
    hideAnonymousMiddleware: false,
    showAllRoutes: false,
    excludeMiddleware: new Set(),
  };

  /**
   *
   * @param {{
   *  showParentMiddleware?: boolean;
   *  hideAnonymousMiddleware?: boolean;
   *  showAllRoutes?: boolean;
   *  excludeMiddleware?: String[]
   * }} options
   */
  constructor(options) {
    if (typeof options === "object") {
      options = {
        ...this.options,
        ...options,
      };

      let { excludeMiddleware } = options;
      excludeMiddleware = new Set(
        Array.isArray(excludeMiddleware) ? excludeMiddleware : []
      );

      options.excludeMiddleware = excludeMiddleware;

      this.options = options;
    }
  }

  /**
   * Returns all the verbs detected for the passed route
   */
  _getRouteMethods(route) {
    const methods = [];

    for (const method in route.methods) {
      if (method === "_all" && !this.options.showAllRoutes) {
        continue;
      }

      methods.push(method.toUpperCase());
    }

    return methods;
  }

  _getMiddlewareName(middleware) {
    let name = middleware.handle.name;

    if (!name && !this.options.hideAnonymousMiddleware) {
      name = "anonymous";
    }

    if (Array.isArray(middleware.handle.params)) {
      name = `${name}(${middleware.handle.params.join(", ")})`;
    }

    return name;
  }

  /**
   * Returns the names (or anonymous) of all the middleware attached to the
   * passed route
   */
  _getRouteMiddleware(route) {
    return route.stack
      .map((item) => this._getMiddlewareName(item))
      .filter((v) => !!v && !this.options.excludeMiddleware.has(v));
  }

  /**
   * Returns true if found regexp related with express params
   */
  _hasParams(pathRegexp) {
    return regexpExpressParam.test(pathRegexp);
  }

  /**
   * @param {Object} route Express route object to be parsed
   * @param {string} basePath The basePath the route is on
   * @return {Object[]} Endpoints info
   */
  _parseExpressRoute(route, basePath, parentMiddleware = []) {
    const endpoints = [];
    const middleware = [
      ...parentMiddleware,
      ...this._getRouteMiddleware(route),
    ];

    if (Array.isArray(route.path)) {
      route.path.forEach((path) => {
        endpoints.push({
          path: basePath + (basePath && path === "/" ? "" : path),
          methods: this._getRouteMethods(route),
          middleware,
        });
      });
    } else {
      endpoints.push({
        path: basePath + (basePath && route.path === "/" ? "" : route.path),
        methods: this._getRouteMethods(route),
        middleware,
      });
    }

    return endpoints;
  }

  _parseExpressPath(expressPathRegexp, params) {
    let parsedPath = regexpExpressRegexp.exec(expressPathRegexp);
    let parsedRegexp = expressPathRegexp;
    let paramIdx = 0;

    while (this._hasParams(parsedRegexp)) {
      const paramId = ":" + params[paramIdx].name;

      parsedRegexp = parsedRegexp
        .toString()
        .replace(/\(\?:\(\[\^\\\/]\+\?\)\)/, paramId);

      paramIdx++;
    }

    if (parsedRegexp !== expressPathRegexp) {
      parsedPath = regexpExpressRegexp.exec(parsedRegexp);
    }

    parsedPath = parsedPath[1].replace(/\\\//g, "/");

    return parsedPath;
  }

  /**
   * Ensures the path of the new endpoints isn't yet in the array.
   * If the path is already in the array merges the endpoints with the existing
   * one, if not, it adds them to the array.
   *
   * @param {Array} endpoints Array of current endpoints
   * @param {Object[]} newEndpoints New endpoints to be added to the array
   * @returns {Array} Updated endpoints array
   */
  _addEndpoints(endpoints, newEndpoints) {
    newEndpoints.forEach((newEndpoint) => {
      const foundEndpointIdx = endpoints.findIndex(
        (item) => item.path === newEndpoint.path
      );

      if (foundEndpointIdx > -1) {
        const foundEndpoint = endpoints[foundEndpointIdx];

        const newMethods = newEndpoint.methods.filter(
          (method) => foundEndpoint.methods.indexOf(method) === -1
        );

        foundEndpoint.methods = foundEndpoint.methods.concat(newMethods);
      } else {
        endpoints.push(newEndpoint);
      }
    });

    return endpoints;
  }

  _parseEndpoints({ app, basePath, endpoints, parentMiddleware = [] }) {
    const stack = app.stack || (app._router && app._router.stack);

    endpoints = endpoints || [];
    basePath = basePath || "";

    const middleware = [...parentMiddleware];

    if (!stack) {
      this._addEndpoints(endpoints, [
        {
          path: basePath,
          methods: [],
          middlewares: [],
        },
      ]);
    } else {
      stack.forEach((stackItem) => {
        if (stackItem.route) {
          const newEndpoints = this._parseExpressRoute(
            stackItem.route,
            basePath,
            middleware
          );

          endpoints = this._addEndpoints(endpoints, newEndpoints);
        } else if (STACK_ITEM_VALID_NAMES.indexOf(stackItem.name) > -1) {
          if (regexpExpressRegexp.test(stackItem.regexp)) {
            const parsedPath = this._parseExpressPath(
              stackItem.regexp,
              stackItem.keys
            );

            this._parseEndpoints({
              app: stackItem.handle,
              basePath: `${basePath}/${parsedPath}`,
              endpoints,
              parentMiddleware: middleware,
            });
          } else if (
            !stackItem.path &&
            stackItem.regexp &&
            stackItem.regexp.toString() !== expressRootRegexp
          ) {
            const regEcpPath = " RegExp(" + stackItem.regexp + ") ";

            this._parseEndpoints({
              app: stackItem.handle,
              basePath: `${basePath}/${regEcpPath}`,
              endpoints,
              parentMiddleware: middleware,
            });
          } else {
            this._parseEndpoints({
              app: stackItem.handle,
              basePath,
              endpoints,
              parentMiddleware: middleware,
            });
          }
        } else if (this.options.showParentMiddleware) {
          const name = this._getMiddlewareName(stackItem);

          if (name && !this.options.excludeMiddleware.has(name)) {
            middleware.push(name);
          }
        }
      });
    }

    return endpoints;
  }

  /**
   * Returns an array of strings with all the detected endpoints
   * @param {Object} app the express/route instance to get the endpoints from
   */
  getEndpoints(app) {
    const endpoints = this._parseEndpoints({ app });

    return endpoints;
  }
}

module.exports = ExpressListEndPoints;
