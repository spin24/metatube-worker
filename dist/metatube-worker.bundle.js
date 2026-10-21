var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });

// node_modules/hono/dist/request/constants.js
var GET_MATCH_RESULT = /* @__PURE__ */ Symbol();

// node_modules/hono/dist/utils/buffer.js
var bufferToFormData = /* @__PURE__ */ __name((arrayBuffer, contentType) => {
  return new Response(arrayBuffer, { headers: { "Content-Type": contentType.replace(/^[^;]+/, (mediaType) => mediaType.toLowerCase()) } }).formData();
}, "bufferToFormData");

// node_modules/hono/dist/utils/body.js
var MAX_NESTED_OBJECTS = 1e4;
var isRawRequest = /* @__PURE__ */ __name((request) => "headers" in request, "isRawRequest");
var parseBody = /* @__PURE__ */ __name(async (request, options = /* @__PURE__ */ Object.create(null)) => {
  const { all = false, dot = false } = options;
  const mediaType = (isRawRequest(request) ? request.headers : request.raw.headers).get("Content-Type")?.split(";")[0].trim().toLowerCase();
  if (mediaType === "multipart/form-data" || mediaType === "application/x-www-form-urlencoded") return parseFormData(request, {
    all,
    dot
  });
  return {};
}, "parseBody");
async function parseFormData(request, options) {
  if (!isRawRequest(request) && request.bodyCache.formData) return convertFormDataToBodyData(await request.bodyCache.formData, options);
  const headers = isRawRequest(request) ? request.headers : request.raw.headers;
  const arrayBuffer = await request.arrayBuffer();
  const formDataPromise = bufferToFormData(arrayBuffer, headers.get("Content-Type") || "");
  if (!isRawRequest(request)) request.bodyCache.formData = formDataPromise;
  const formData = await formDataPromise;
  if (formData) return convertFormDataToBodyData(formData, options);
  return {};
}
__name(parseFormData, "parseFormData");
function convertFormDataToBodyData(formData, options) {
  const form = /* @__PURE__ */ Object.create(null);
  const nestingState = { count: 0 };
  formData.forEach((value, key) => {
    if (!(options.all || key.endsWith("[]"))) form[key] = value;
    else handleParsingAllValues(form, key, value);
  });
  if (options.dot) Object.entries(form).forEach(([key, value]) => {
    if (key.includes(".")) {
      handleParsingNestedValues(form, key, value, nestingState);
      delete form[key];
    }
  });
  return form;
}
__name(convertFormDataToBodyData, "convertFormDataToBodyData");
var handleParsingAllValues = /* @__PURE__ */ __name((form, key, value) => {
  if (form[key] !== void 0) {
    if (Array.isArray(form[key])) form[key].push(value);
    else form[key] = [form[key], value];
  } else if (!key.endsWith("[]")) form[key] = value;
  else form[key] = [value];
}, "handleParsingAllValues");
var handleParsingNestedValues = /* @__PURE__ */ __name((form, key, value, state) => {
  if (/(?:^|\.)__proto__\./.test(key)) return;
  let nestedForm = form;
  const keys = key.split(".", 34);
  if (keys.length > 33) throwNestingLimitExceeded();
  keys.forEach((key2, index) => {
    if (index === keys.length - 1) nestedForm[key2] = value;
    else {
      if (!nestedForm[key2] || typeof nestedForm[key2] !== "object" || Array.isArray(nestedForm[key2]) || nestedForm[key2] instanceof File) {
        if (state.count++ >= MAX_NESTED_OBJECTS) throwNestingLimitExceeded();
        nestedForm[key2] = /* @__PURE__ */ Object.create(null);
      }
      nestedForm = nestedForm[key2];
    }
  });
}, "handleParsingNestedValues");
var throwNestingLimitExceeded = /* @__PURE__ */ __name(() => {
  throw new Error("Nesting limit exceeded");
}, "throwNestingLimitExceeded");

// node_modules/hono/dist/utils/url.js
var splitPath = /* @__PURE__ */ __name((path) => {
  const paths = path.split("/");
  if (paths[0] === "") paths.shift();
  return paths;
}, "splitPath");
var splitRoutingPath = /* @__PURE__ */ __name((routePath) => {
  const { groups, path } = extractGroupsFromPath(routePath);
  const paths = splitPath(path);
  return replaceGroupMarks(paths, groups);
}, "splitRoutingPath");
var extractGroupsFromPath = /* @__PURE__ */ __name((path) => {
  const groups = [];
  path = path.replace(/\{[^}]+\}/g, (match2, index) => {
    const mark = `@${index}`;
    groups.push([mark, match2]);
    return mark;
  });
  return {
    groups,
    path
  };
}, "extractGroupsFromPath");
var replaceGroupMarks = /* @__PURE__ */ __name((paths, groups) => {
  for (let i = groups.length - 1; i >= 0; i--) {
    const [mark] = groups[i];
    for (let j = paths.length - 1; j >= 0; j--) if (paths[j].includes(mark)) {
      paths[j] = paths[j].replace(mark, groups[i][1]);
      break;
    }
  }
  return paths;
}, "replaceGroupMarks");
var patternCache = {};
var getPattern = /* @__PURE__ */ __name((label, next) => {
  if (label === "*") return "*";
  const match2 = label.match(/^\:([^\{\}]+)(?:\{(.+)\})?$/);
  if (match2) {
    const cacheKey = `${label}#${next}`;
    if (!patternCache[cacheKey]) {
      if (match2[2]) patternCache[cacheKey] = next && next[0] !== ":" && next[0] !== "*" ? [
        cacheKey,
        match2[1],
        new RegExp(`^${match2[2]}(?=/${next})`)
      ] : [
        label,
        match2[1],
        new RegExp(`^${match2[2]}$`)
      ];
      else patternCache[cacheKey] = [
        label,
        match2[1],
        true
      ];
    }
    return patternCache[cacheKey];
  }
  return null;
}, "getPattern");
var tryDecode = /* @__PURE__ */ __name((str5, decoder) => {
  try {
    return decoder(str5);
  } catch {
    return str5.replace(/(?:%[0-9A-Fa-f]{2})+/g, (match2) => {
      try {
        return decoder(match2);
      } catch {
        return match2;
      }
    });
  }
}, "tryDecode");
var tryDecodeURI = /* @__PURE__ */ __name((str5) => tryDecode(str5, decodeURI), "tryDecodeURI");
var getPath = /* @__PURE__ */ __name((request) => {
  const url = request.url;
  const start = url.indexOf("/", url.indexOf(":") + 4);
  let i = start;
  for (; i < url.length; i++) {
    const charCode = url.charCodeAt(i);
    if (charCode === 37) {
      const queryIndex = url.indexOf("?", i);
      const hashIndex = url.indexOf("#", i);
      const end = queryIndex === -1 ? hashIndex === -1 ? void 0 : hashIndex : hashIndex === -1 ? queryIndex : Math.min(queryIndex, hashIndex);
      const path = url.slice(start, end);
      return tryDecodeURI(path.includes("%25") ? path.replace(/%25/g, "%2525") : path);
    } else if (charCode === 63 || charCode === 35) break;
  }
  return url.slice(start, i);
}, "getPath");
var getPathNoStrict = /* @__PURE__ */ __name((request) => {
  const result = getPath(request);
  return result.length > 1 && result.at(-1) === "/" ? result.slice(0, -1) : result;
}, "getPathNoStrict");
var mergePath = /* @__PURE__ */ __name((base, sub, ...rest) => {
  if (rest.length) sub = mergePath(sub, ...rest);
  return `${base?.[0] === "/" ? "" : "/"}${base}${sub === "/" ? "" : `${base?.at(-1) === "/" ? "" : "/"}${sub?.[0] === "/" ? sub.slice(1) : sub}`}`;
}, "mergePath");
var checkOptionalParameter = /* @__PURE__ */ __name((path) => {
  if (path.charCodeAt(path.length - 1) !== 63 || !path.includes(":")) return null;
  const segments = path.split("/");
  const results = [];
  let basePath = "";
  segments.forEach((segment) => {
    if (segment !== "" && !/\:/.test(segment)) basePath += "/" + segment;
    else if (/\:/.test(segment)) {
      if (segment.charCodeAt(segment.length - 1) === 63) {
        if (results.length === 0 && basePath === "") results.push("/");
        else results.push(basePath);
        const optionalSegment = segment.slice(0, -1);
        basePath += "/" + optionalSegment;
        results.push(basePath);
      } else basePath += "/" + segment;
    }
  });
  return results.filter((v, i, a) => a.indexOf(v) === i);
}, "checkOptionalParameter");
var tryDecodeURIComponent = /* @__PURE__ */ __name((str5) => str5.indexOf("%") !== -1 ? tryDecode(str5, decodeURIComponent_) : str5, "tryDecodeURIComponent");
var _decodeURI = /* @__PURE__ */ __name((value) => {
  if (value.indexOf("+") !== -1) value = value.replace(/\+/g, " ");
  return tryDecodeURIComponent(value);
}, "_decodeURI");
var _getQueryParam = /* @__PURE__ */ __name((url, key, multiple) => {
  const hashIndex = url.indexOf("#", 8);
  if (hashIndex !== -1) url = url.slice(0, hashIndex);
  let encoded;
  if (!multiple && key && key.indexOf("%") === -1 && key.indexOf("+") === -1) {
    let keyIndex2 = url.indexOf("?", 8);
    if (keyIndex2 === -1) return;
    if (!url.startsWith(key, keyIndex2 + 1)) keyIndex2 = url.indexOf(`&${key}`, keyIndex2 + 1);
    while (keyIndex2 !== -1) {
      const trailingKeyCode = url.charCodeAt(keyIndex2 + key.length + 1);
      if (trailingKeyCode === 61) {
        const valueIndex = keyIndex2 + key.length + 2;
        const endIndex = url.indexOf("&", valueIndex);
        return _decodeURI(url.slice(valueIndex, endIndex === -1 ? void 0 : endIndex));
      } else if (trailingKeyCode == 38 || isNaN(trailingKeyCode)) return "";
      keyIndex2 = url.indexOf(`&${key}`, keyIndex2 + 1);
    }
    encoded = /[%+]/.test(url);
    if (!encoded) return;
  }
  const results = /* @__PURE__ */ Object.create(null);
  encoded ??= /[%+]/.test(url);
  let keyIndex = url.indexOf("?", 8);
  while (keyIndex !== -1) {
    const nextKeyIndex = url.indexOf("&", keyIndex + 1);
    let valueIndex = url.indexOf("=", keyIndex);
    if (valueIndex > nextKeyIndex && nextKeyIndex !== -1) valueIndex = -1;
    let name = url.slice(keyIndex + 1, valueIndex === -1 ? nextKeyIndex === -1 ? void 0 : nextKeyIndex : valueIndex);
    if (encoded) name = _decodeURI(name);
    keyIndex = nextKeyIndex;
    if (name === "") continue;
    let value;
    if (valueIndex === -1) value = "";
    else {
      value = url.slice(valueIndex + 1, nextKeyIndex === -1 ? void 0 : nextKeyIndex);
      if (encoded) value = _decodeURI(value);
    }
    if (multiple) {
      if (!(results[name] && Array.isArray(results[name]))) results[name] = [];
      results[name].push(value);
    } else results[name] ??= value;
  }
  return key ? results[key] : results;
}, "_getQueryParam");
var getQueryParam = _getQueryParam;
var getQueryParams = /* @__PURE__ */ __name((url, key) => {
  return _getQueryParam(url, key, true);
}, "getQueryParams");
var decodeURIComponent_ = decodeURIComponent;

// node_modules/hono/dist/request.js
var HonoRequest = class {
  static {
    __name(this, "HonoRequest");
  }
  /**
  * `.raw` can get the raw Request object.
  *
  * @see {@link https://hono.dev/docs/api/request#raw}
  *
  * @example
  * ```ts
  * // For Cloudflare Workers
  * app.post('/', async (c) => {
  *   const metadata = c.req.raw.cf?.hostMetadata?
  *   ...
  * })
  * ```
  */
  raw;
  #validatedData;
  #matchResult;
  routeIndex = 0;
  /**
  * `.path` can get the pathname of the request.
  *
  * @see {@link https://hono.dev/docs/api/request#path}
  *
  * @example
  * ```ts
  * app.get('/about/me', (c) => {
  *   const pathname = c.req.path // `/about/me`
  * })
  * ```
  */
  path;
  bodyCache = {};
  constructor(request, path = "/", matchResult = [[]]) {
    this.raw = request;
    this.path = path;
    this.#matchResult = matchResult;
  }
  param(key) {
    return key ? this.#getDecodedParam(key) : this.#getAllDecodedParams();
  }
  #getDecodedParam(key) {
    const paramKey = this.#matchResult[0][this.routeIndex]?.[1][key];
    const param = this.#getParamValue(paramKey);
    return param && tryDecodeURIComponent(param);
  }
  #getAllDecodedParams() {
    const decoded = {};
    const keys = Object.keys(this.#matchResult[0][this.routeIndex]?.[1] ?? {});
    for (const key of keys) {
      const value = this.#getParamValue(this.#matchResult[0][this.routeIndex][1][key]);
      if (value !== void 0) decoded[key] = tryDecodeURIComponent(value);
    }
    return decoded;
  }
  #getParamValue(paramKey) {
    return this.#matchResult[1] ? this.#matchResult[1][paramKey] : paramKey;
  }
  query(key) {
    return getQueryParam(this.url, key);
  }
  queries(key) {
    return getQueryParams(this.url, key);
  }
  header(name) {
    if (name) return this.raw.headers.get(name) ?? void 0;
    const headerData = /* @__PURE__ */ Object.create(null);
    this.raw.headers.forEach((value, key) => {
      headerData[key] = value;
    });
    return headerData;
  }
  async parseBody(options) {
    return parseBody(this, options);
  }
  #cachedBody = /* @__PURE__ */ __name((key) => {
    const { bodyCache, raw: raw2 } = this;
    const cachedBody = bodyCache[key];
    if (cachedBody) return cachedBody;
    for (const anyCachedKey in bodyCache) return bodyCache[anyCachedKey].then((body) => {
      if (anyCachedKey === "json") body = JSON.stringify(body);
      const contentType = anyCachedKey === "formData" ? void 0 : raw2.headers.get("content-type");
      return new Response(body, { headers: contentType ? { "Content-Type": contentType } : void 0 })[key]();
    });
    return bodyCache[key] = raw2[key]();
  }, "#cachedBody");
  /**
  * `.json()` can parse Request body of type `application/json`
  *
  * @see {@link https://hono.dev/docs/api/request#json}
  *
  * @example
  * ```ts
  * app.post('/entry', async (c) => {
  *   const body = await c.req.json()
  * })
  * ```
  */
  json() {
    return this.#cachedBody("text").then((text) => JSON.parse(text));
  }
  /**
  * `.text()` can parse Request body of type `text/plain`
  *
  * @see {@link https://hono.dev/docs/api/request#text}
  *
  * @example
  * ```ts
  * app.post('/entry', async (c) => {
  *   const body = await c.req.text()
  * })
  * ```
  */
  text() {
    return this.#cachedBody("text");
  }
  /**
  * `.arrayBuffer()` parse Request body as an `ArrayBuffer`
  *
  * @see {@link https://hono.dev/docs/api/request#arraybuffer}
  *
  * @example
  * ```ts
  * app.post('/entry', async (c) => {
  *   const body = await c.req.arrayBuffer()
  * })
  * ```
  */
  arrayBuffer() {
    return this.#cachedBody("arrayBuffer");
  }
  /**
  * `.bytes()` parses the request body as a `Uint8Array`.
  *
  * @see {@link https://hono.dev/docs/api/request#bytes}
  *
  * @example
  * ```ts
  * app.post('/entry', async (c) => {
  *   const body = await c.req.bytes()
  * })
  * ```
  */
  bytes() {
    return this.#cachedBody("arrayBuffer").then((buffer) => new Uint8Array(buffer));
  }
  /**
  * Parses the request body as a `Blob`.
  * @example
  * ```ts
  * app.post('/entry', async (c) => {
  *   const body = await c.req.blob();
  * });
  * ```
  * @see https://hono.dev/docs/api/request#blob
  */
  blob() {
    return this.#cachedBody("blob");
  }
  /**
  * Parses the request body as `FormData`.
  * @example
  * ```ts
  * app.post('/entry', async (c) => {
  *   const body = await c.req.formData();
  * });
  * ```
  * @see https://hono.dev/docs/api/request#formdata
  */
  formData() {
    return this.#cachedBody("formData");
  }
  /**
  * Adds validated data to the request.
  *
  * @param target - The target of the validation.
  * @param data - The validated data to add.
  */
  addValidatedData(target, data) {
    (this.#validatedData ??= {})[target] = data;
  }
  valid(target) {
    return this.#validatedData?.[target];
  }
  /**
  * `.url` can get the request url strings.
  *
  * @see {@link https://hono.dev/docs/api/request#url}
  *
  * @example
  * ```ts
  * app.get('/about/me', (c) => {
  *   const url = c.req.url // `http://localhost:8787/about/me`
  *   ...
  * })
  * ```
  */
  get url() {
    return this.raw.url;
  }
  /**
  * `.method` can get the method name of the request.
  *
  * @see {@link https://hono.dev/docs/api/request#method}
  *
  * @example
  * ```ts
  * app.get('/about/me', (c) => {
  *   const method = c.req.method // `GET`
  * })
  * ```
  */
  get method() {
    return this.raw.method;
  }
  get [GET_MATCH_RESULT]() {
    return this.#matchResult;
  }
  /**
  * `.matchedRoutes` can return a matched route in the handler
  *
  * @deprecated
  *
  * Use matchedRoutes helper defined in "hono/route" instead.
  *
  * @see {@link https://hono.dev/docs/api/request#matchedroutes}
  *
  * @example
  * ```ts
  * app.use('*', async function logger(c, next) {
  *   await next()
  *   c.req.matchedRoutes.forEach(({ handler, method, path }, i) => {
  *     const name = handler.name || (handler.length < 2 ? '[handler]' : '[middleware]')
  *     console.log(
  *       method,
  *       ' ',
  *       path,
  *       ' '.repeat(Math.max(10 - path.length, 0)),
  *       name,
  *       i === c.req.routeIndex ? '<- respond from here' : ''
  *     )
  *   })
  * })
  * ```
  */
  get matchedRoutes() {
    return this.#matchResult[0].map(([[, route]]) => route);
  }
  /**
  * `.routePath` can retrieve the path registered within the handler
  *
  * @deprecated
  *
  * Use routePath helper defined in "hono/route" instead.
  *
  * @see {@link https://hono.dev/docs/api/request#routepath}
  *
  * @example
  * ```ts
  * app.get('/posts/:id', (c) => {
  *   return c.json({ path: c.req.routePath })
  * })
  * ```
  */
  get routePath() {
    return this.#matchResult[0].map(([[, route]]) => route)[this.routeIndex].path;
  }
};

// node_modules/hono/dist/utils/html.js
var HtmlEscapedCallbackPhase = {
  Stringify: 1,
  BeforeStream: 2,
  Stream: 3
};
var raw = /* @__PURE__ */ __name((value, callbacks) => {
  const escapedString = new String(value);
  escapedString.isEscaped = true;
  escapedString.callbacks = callbacks;
  return escapedString;
}, "raw");
var resolveCallback = /* @__PURE__ */ __name(async (str5, phase, preserveCallbacks, context, buffer) => {
  if (typeof str5 === "object" && !(str5 instanceof String)) {
    if (!(str5 instanceof Promise)) str5 = str5.toString();
    if (str5 instanceof Promise) str5 = await str5;
  }
  const callbacks = str5.callbacks;
  if (!callbacks?.length) return Promise.resolve(str5);
  if (buffer) buffer[0] += str5;
  else buffer = [str5];
  const resStr = Promise.all(callbacks.map((c) => c({
    phase,
    buffer,
    context
  }))).then((res) => Promise.all(res.filter(Boolean).map((str6) => resolveCallback(str6, phase, false, context, buffer))).then(() => buffer[0]));
  if (preserveCallbacks) return raw(await resStr, callbacks);
  else return resStr;
}, "resolveCallback");

// node_modules/hono/dist/context.js
var TEXT_PLAIN = "text/plain; charset=UTF-8";
var setDefaultContentType = /* @__PURE__ */ __name((contentType, headers) => {
  return {
    "Content-Type": contentType,
    ...headers
  };
}, "setDefaultContentType");
var createResponseInstance = /* @__PURE__ */ __name((body, init) => new Response(body, init), "createResponseInstance");
var Context = class {
  static {
    __name(this, "Context");
  }
  #rawRequest;
  #req;
  /**
  * `.env` can get bindings (environment variables, secrets, KV namespaces, D1 database, R2 bucket etc.) in Cloudflare Workers.
  *
  * @see {@link https://hono.dev/docs/api/context#env}
  *
  * @example
  * ```ts
  * // Environment object for Cloudflare Workers
  * app.get('*', async c => {
  *   const counter = c.env.COUNTER
  * })
  * ```
  */
  env = {};
  #var;
  finalized = false;
  /**
  * `.error` can get the error object from the middleware if the Handler throws an error.
  *
  * @see {@link https://hono.dev/docs/api/context#error}
  *
  * @example
  * ```ts
  * app.use('*', async (c, next) => {
  *   await next()
  *   if (c.error) {
  *     // do something...
  *   }
  * })
  * ```
  */
  error;
  #status;
  #executionCtx;
  #res;
  #layout;
  #renderer;
  #notFoundHandler;
  #preparedHeaders;
  #matchResult;
  #path;
  /**
  * Creates an instance of the Context class.
  *
  * @param req - The Request object.
  * @param options - Optional configuration options for the context.
  */
  constructor(req, options) {
    this.#rawRequest = req;
    if (options) {
      this.#executionCtx = options.executionCtx;
      this.env = options.env;
      this.#notFoundHandler = options.notFoundHandler;
      this.#path = options.path;
      this.#matchResult = options.matchResult;
    }
  }
  /**
  * `.req` is the instance of {@link HonoRequest}.
  */
  get req() {
    this.#req ??= new HonoRequest(this.#rawRequest, this.#path, this.#matchResult);
    return this.#req;
  }
  /**
  * @see {@link https://hono.dev/docs/api/context#event}
  * The FetchEvent associated with the current request.
  *
  * @throws Will throw an error if the context does not have a FetchEvent.
  */
  get event() {
    if (this.#executionCtx && "respondWith" in this.#executionCtx) return this.#executionCtx;
    else throw Error("This context has no FetchEvent");
  }
  /**
  * @see {@link https://hono.dev/docs/api/context#executionctx}
  * The ExecutionContext associated with the current request.
  *
  * @throws Will throw an error if the context does not have an ExecutionContext.
  */
  get executionCtx() {
    if (this.#executionCtx) return this.#executionCtx;
    else throw Error("This context has no ExecutionContext");
  }
  /**
  * @see {@link https://hono.dev/docs/api/context#res}
  * The Response object for the current request.
  */
  get res() {
    return this.#res ||= createResponseInstance(null, { headers: this.#preparedHeaders ??= new Headers() });
  }
  /**
  * Sets the Response object for the current request.
  *
  * @param _res - The Response object to set.
  */
  set res(_res) {
    if (this.#res && _res) {
      _res = createResponseInstance(_res.body, _res);
      for (const [k, v] of this.#res.headers.entries()) {
        if (k === "content-type") continue;
        if (k === "set-cookie") {
          const cookies = this.#res.headers.getSetCookie();
          _res.headers.delete("set-cookie");
          for (const cookie of cookies) _res.headers.append("set-cookie", cookie);
        } else _res.headers.set(k, v);
      }
    }
    this.#res = _res;
    this.finalized = true;
  }
  /**
  * `.render()` can create a response within a layout.
  *
  * @see {@link https://hono.dev/docs/api/context#render-setrenderer}
  *
  * @example
  * ```ts
  * app.get('/', (c) => {
  *   return c.render('Hello!')
  * })
  * ```
  */
  render = /* @__PURE__ */ __name((...args) => {
    this.#renderer ??= (content) => this.html(content);
    return this.#renderer(...args);
  }, "render");
  /**
  * Sets the layout for the response.
  *
  * @param layout - The layout to set.
  * @returns The layout function.
  */
  setLayout = /* @__PURE__ */ __name((layout) => this.#layout = layout, "setLayout");
  /**
  * Gets the current layout for the response.
  *
  * @returns The current layout function.
  */
  getLayout = /* @__PURE__ */ __name(() => this.#layout, "getLayout");
  /**
  * `.setRenderer()` can set the layout in the custom middleware.
  *
  * @see {@link https://hono.dev/docs/api/context#render-setrenderer}
  *
  * @example
  * ```tsx
  * app.use('*', async (c, next) => {
  *   c.setRenderer((content) => {
  *     return c.html(
  *       <html>
  *         <body>
  *           <p>{content}</p>
  *         </body>
  *       </html>
  *     )
  *   })
  *   await next()
  * })
  * ```
  */
  setRenderer = /* @__PURE__ */ __name((renderer) => {
    this.#renderer = renderer;
  }, "setRenderer");
  /**
  * `.header()` can set headers.
  *
  * @see {@link https://hono.dev/docs/api/context#header}
  *
  * @example
  * ```ts
  * app.get('/welcome', (c) => {
  *   // Set headers
  *   c.header('X-Message', 'Hello!')
  *   c.header('Content-Type', 'text/plain')
  *
  *   // Append multiple headers using the append option (e.g. Vary)
  *   c.header('Vary', 'Accept-Encoding', { append: true })
  *   c.header('Vary', 'User-Agent', { append: true })
  *
  *   return c.body('Thank you for coming')
  * })
  * ```
  */
  header = /* @__PURE__ */ __name((name, value, options) => {
    if (this.finalized) this.#res = createResponseInstance(this.#res.body, this.#res);
    const headers = this.#res ? this.#res.headers : this.#preparedHeaders ??= new Headers();
    if (value === void 0) headers.delete(name);
    else if (options?.append) headers.append(name, value);
    else headers.set(name, value);
  }, "header");
  status = /* @__PURE__ */ __name((status) => {
    this.#status = status;
  }, "status");
  /**
  * `.set()` can set the value specified by the key.
  *
  * @see {@link https://hono.dev/docs/api/context#set-get}
  *
  * @example
  * ```ts
  * app.use('*', async (c, next) => {
  *   c.set('message', 'Hono is hot!!')
  *   await next()
  * })
  * ```
  */
  set = /* @__PURE__ */ __name((key, value) => {
    this.#var ??= /* @__PURE__ */ new Map();
    this.#var.set(key, value);
  }, "set");
  /**
  * `.get()` can use the value specified by the key.
  *
  * @see {@link https://hono.dev/docs/api/context#set-get}
  *
  * @example
  * ```ts
  * app.get('/', (c) => {
  *   const message = c.get('message')
  *   return c.text(`The message is "${message}"`)
  * })
  * ```
  */
  get = /* @__PURE__ */ __name((key) => {
    return this.#var ? this.#var.get(key) : void 0;
  }, "get");
  /**
  * `.var` can access the value of a variable.
  *
  * @see {@link https://hono.dev/docs/api/context#var}
  *
  * @example
  * ```ts
  * const result = c.var.client.oneMethod()
  * ```
  */
  get var() {
    if (!this.#var) return {};
    return Object.fromEntries(this.#var);
  }
  #newResponse(data, arg, headers) {
    let responseHeaders = this.#res ? new Headers(this.#res.headers) : this.#preparedHeaders;
    if (typeof arg === "object" && arg.headers) {
      responseHeaders ??= new Headers();
      for (const [key, value] of new Headers(arg.headers)) if (key === "set-cookie") responseHeaders.append(key, value);
      else responseHeaders.set(key, value);
    }
    if (headers) {
      if (!responseHeaders) {
        let count = 0;
        for (const k in headers) if (++count > 1 || typeof headers[k] !== "string") {
          responseHeaders = new Headers();
          break;
        }
      }
      if (responseHeaders) for (const k in headers) {
        const v = headers[k];
        if (typeof v === "string") responseHeaders.set(k, v);
        else {
          responseHeaders.delete(k);
          for (const v2 of v) responseHeaders.append(k, v2);
        }
      }
    }
    const status = typeof arg === "number" ? arg : arg?.status ?? this.#status;
    return createResponseInstance(data, {
      status,
      headers: responseHeaders ?? headers
    });
  }
  newResponse = /* @__PURE__ */ __name((...args) => this.#newResponse(...args), "newResponse");
  /**
  * `.body()` can return the HTTP response.
  * You can set headers with `.header()` and set HTTP status code with `.status`.
  * This can also be set in `.text()`, `.json()` and so on.
  *
  * @see {@link https://hono.dev/docs/api/context#body}
  *
  * @example
  * ```ts
  * app.get('/welcome', (c) => {
  *   // Set headers
  *   c.header('X-Message', 'Hello!')
  *   c.header('Content-Type', 'text/plain')
  *   // Set HTTP status code
  *   c.status(201)
  *
  *   // Return the response body
  *   return c.body('Thank you for coming')
  * })
  * ```
  */
  body = /* @__PURE__ */ __name((data, arg, headers) => this.#newResponse(data, arg, headers), "body");
  /**
  * `.text()` can render text as `Content-Type:text/plain`.
  *
  * @see {@link https://hono.dev/docs/api/context#text}
  *
  * @example
  * ```ts
  * app.get('/say', (c) => {
  *   return c.text('Hello!')
  * })
  * ```
  */
  text = /* @__PURE__ */ __name((text, arg, headers) => {
    return !this.#preparedHeaders && !this.#status && !arg && !headers && !this.finalized ? new Response(text) : this.#newResponse(text, arg, setDefaultContentType(TEXT_PLAIN, headers));
  }, "text");
  /**
  * `.json()` can render JSON as `Content-Type:application/json`.
  *
  * @see {@link https://hono.dev/docs/api/context#json}
  *
  * @example
  * ```ts
  * app.get('/api', (c) => {
  *   return c.json({ message: 'Hello!' })
  * })
  * ```
  */
  json = /* @__PURE__ */ __name((object, arg, headers) => {
    return this.#newResponse(JSON.stringify(object), arg, setDefaultContentType("application/json", headers));
  }, "json");
  html = /* @__PURE__ */ __name((html, arg, headers) => {
    const res = /* @__PURE__ */ __name((html2) => this.#newResponse(html2, arg, setDefaultContentType("text/html; charset=UTF-8", headers)), "res");
    return typeof html === "object" ? resolveCallback(html, HtmlEscapedCallbackPhase.Stringify, false, {}).then(res) : res(html);
  }, "html");
  /**
  * `.redirect()` can Redirect, default status code is 302.
  *
  * @see {@link https://hono.dev/docs/api/context#redirect}
  *
  * @example
  * ```ts
  * app.get('/redirect', (c) => {
  *   return c.redirect('/')
  * })
  * app.get('/redirect-permanently', (c) => {
  *   return c.redirect('/', 301)
  * })
  * ```
  */
  redirect = /* @__PURE__ */ __name((location, status) => {
    const locationString = String(location);
    this.header("Location", !/[^\x00-\xFF]/.test(locationString) ? locationString : encodeURI(locationString));
    return this.newResponse(null, status ?? 302);
  }, "redirect");
  /**
  * `.notFound()` can return the Not Found Response.
  *
  * @see {@link https://hono.dev/docs/api/context#notfound}
  *
  * @example
  * ```ts
  * app.get('/notfound', (c) => {
  *   return c.notFound()
  * })
  * ```
  */
  notFound = /* @__PURE__ */ __name(() => {
    this.#notFoundHandler ??= () => createResponseInstance();
    return this.#notFoundHandler(this);
  }, "notFound");
};

// node_modules/hono/dist/compose.js
var compose = /* @__PURE__ */ __name((middleware, onError, onNotFound) => {
  return (context, next) => {
    let index = -1;
    return dispatch(0);
    async function dispatch(i) {
      if (i <= index) throw new Error("next() called multiple times");
      index = i;
      let res;
      let isError = false;
      let handler;
      if (middleware[i]) {
        handler = middleware[i][0][0];
        context.req.routeIndex = i;
      } else handler = i === middleware.length && next || void 0;
      if (handler) try {
        res = await handler(context, () => dispatch(i + 1));
      } catch (err) {
        if (err instanceof Error && onError) {
          context.error = err;
          res = await onError(err, context);
          isError = true;
        } else throw err;
      }
      else if (context.finalized === false && onNotFound) res = await onNotFound(context);
      if (res && (context.finalized === false || isError)) context.res = res;
      return context;
    }
    __name(dispatch, "dispatch");
  };
}, "compose");

// node_modules/hono/dist/router.js
var METHODS = [
  "get",
  "post",
  "put",
  "delete",
  "options",
  "patch",
  "query"
];
var MESSAGE_MATCHER_IS_ALREADY_BUILT = "Can not add a route since the matcher is already built.";
var UnsupportedPathError = class extends Error {
  static {
    __name(this, "UnsupportedPathError");
  }
};

// node_modules/hono/dist/utils/constants.js
var COMPOSED_HANDLER = "__COMPOSED_HANDLER";

// node_modules/hono/dist/hono-base.js
var notFoundHandler = /* @__PURE__ */ __name((c) => {
  return c.text("404 Not Found", 404);
}, "notFoundHandler");
var errorHandler = /* @__PURE__ */ __name((err, c) => {
  if ("getResponse" in err) {
    const res = err.getResponse();
    return c.newResponse(res.body, res);
  }
  console.error(err);
  return c.text("Internal Server Error", 500);
}, "errorHandler");
var Hono = class Hono2 {
  static {
    __name(this, "Hono");
  }
  get;
  post;
  put;
  delete;
  options;
  patch;
  query;
  all;
  on;
  use;
  router;
  getPath;
  _basePath = "/";
  #path = "/";
  routes = [];
  constructor(options = {}) {
    [...METHODS, "all"].forEach((method) => {
      this[method] = (args1, ...args) => {
        const methodName = method.toUpperCase();
        if (typeof args1 === "string") this.#path = args1;
        else this.#addRoute(methodName, this.#path, args1);
        args.forEach((handler) => {
          this.#addRoute(methodName, this.#path, handler);
        });
        return this;
      };
    });
    this.on = (method, path, ...handlers) => {
      for (const p of [path].flat()) {
        this.#path = p;
        for (const m of [method].flat()) {
          const methodName = m.toUpperCase();
          for (const handler of handlers) this.#addRoute(methodName, this.#path, handler);
        }
      }
      return this;
    };
    this.use = (arg1, ...handlers) => {
      if (typeof arg1 === "string") this.#path = arg1;
      else {
        this.#path = "*";
        handlers.unshift(arg1);
      }
      handlers.forEach((handler) => {
        this.#addRoute("ALL", this.#path, handler);
      });
      return this;
    };
    const { strict, ...optionsWithoutStrict } = options;
    Object.assign(this, optionsWithoutStrict);
    this.getPath = strict ?? true ? options.getPath ?? getPath : getPathNoStrict;
  }
  #clone() {
    const clone = new Hono2({
      router: this.router,
      getPath: this.getPath
    });
    clone.errorHandler = this.errorHandler;
    clone.#notFoundHandler = this.#notFoundHandler;
    clone.routes = this.routes;
    return clone;
  }
  #notFoundHandler = notFoundHandler;
  errorHandler = errorHandler;
  /**
  * `.route()` allows grouping other Hono instance in routes.
  *
  * @see {@link https://hono.dev/docs/api/routing#grouping}
  *
  * @param {string} path - base Path
  * @param {Hono} app - other Hono instance
  * @returns {Hono} routed Hono instance
  *
  * @example
  * ```ts
  * const app = new Hono()
  * const app2 = new Hono()
  *
  * app2.get("/user", (c) => c.text("user"))
  * app.route("/api", app2) // GET /api/user
  * ```
  */
  route(path, app2) {
    const subApp = this.basePath(path);
    app2.routes.map((r) => {
      let handler;
      if (app2.errorHandler === errorHandler) handler = r.handler;
      else {
        handler = /* @__PURE__ */ __name(async (c, next) => (await compose([], app2.errorHandler)(c, () => r.handler(c, next))).res, "handler");
        handler[COMPOSED_HANDLER] = r.handler;
      }
      subApp.#addRoute(r.method, r.path, handler, r.basePath);
    });
    return this;
  }
  /**
  * `.basePath()` allows base paths to be specified.
  *
  * @see {@link https://hono.dev/docs/api/routing#base-path}
  *
  * @param {string} path - base Path
  * @returns {Hono} changed Hono instance
  *
  * @example
  * ```ts
  * const api = new Hono().basePath('/api')
  * ```
  */
  basePath(path) {
    const subApp = this.#clone();
    subApp._basePath = mergePath(this._basePath, path);
    return subApp;
  }
  /**
  * `.onError()` handles an error and returns a customized Response.
  *
  * @see {@link https://hono.dev/docs/api/hono#error-handling}
  *
  * @param {ErrorHandler} handler - request Handler for error
  * @returns {Hono} changed Hono instance
  *
  * @example
  * ```ts
  * app.onError((err, c) => {
  *   console.error(`${err}`)
  *   return c.text('Custom Error Message', 500)
  * })
  * ```
  */
  onError = /* @__PURE__ */ __name((handler) => {
    this.errorHandler = handler;
    return this;
  }, "onError");
  /**
  * `.notFound()` allows you to customize a Not Found Response.
  *
  * @see {@link https://hono.dev/docs/api/hono#not-found}
  *
  * @param {NotFoundHandler} handler - request handler for not-found
  * @returns {Hono} changed Hono instance
  *
  * @example
  * ```ts
  * app.notFound((c) => {
  *   return c.text('Custom 404 Message', 404)
  * })
  * ```
  */
  notFound = /* @__PURE__ */ __name((handler) => {
    this.#notFoundHandler = handler;
    return this;
  }, "notFound");
  /**
  * `.mount()` allows you to mount applications built with other frameworks into your Hono application.
  *
  * @deprecated Use `mount()` from `hono/mount` instead. `.mount()` will be removed in v5.
  *
  * @see {@link https://hono.dev/docs/api/hono#mount}
  *
  * @param {string} path - base Path
  * @param {Function} applicationHandler - other Request Handler
  * @param {MountOptions} [options] - options of `.mount()`
  * @returns {Hono} mounted Hono instance
  *
  * @example
  * ```ts
  * import { Router as IttyRouter } from 'itty-router'
  * import { Hono } from 'hono'
  * // Create itty-router application
  * const ittyRouter = IttyRouter()
  * // GET /itty-router/hello
  * ittyRouter.get('/hello', () => new Response('Hello from itty-router'))
  *
  * const app = new Hono()
  * app.mount('/itty-router', ittyRouter.handle)
  * ```
  *
  * @example
  * ```ts
  * const app = new Hono()
  * // Send the request to another application without modification.
  * app.mount('/app', anotherApp, {
  *   replaceRequest: (req) => req,
  * })
  * ```
  */
  mount(path, applicationHandler, options) {
    let replaceRequest;
    let optionHandler;
    if (options) {
      if (typeof options === "function") optionHandler = options;
      else {
        optionHandler = options.optionHandler;
        if (options.replaceRequest === false) replaceRequest = /* @__PURE__ */ __name((request) => request, "replaceRequest");
        else replaceRequest = options.replaceRequest;
      }
    }
    const getOptions = optionHandler ? (c) => {
      const options2 = optionHandler(c);
      return Array.isArray(options2) ? options2 : [options2];
    } : (c) => {
      let executionContext = void 0;
      try {
        executionContext = c.executionCtx;
      } catch {
      }
      return [c.env, executionContext];
    };
    replaceRequest ||= (() => {
      const mergedPath = mergePath(this._basePath, path);
      const pathPrefixLength = mergedPath === "/" ? 0 : mergedPath.length;
      return (request) => {
        const url = new URL(request.url);
        url.pathname = this.getPath(request).slice(pathPrefixLength) || "/";
        return new Request(url, request);
      };
    })();
    const handler = /* @__PURE__ */ __name(async (c, next) => {
      const res = await applicationHandler(replaceRequest(c.req.raw), ...getOptions(c));
      if (res) return res;
      await next();
    }, "handler");
    this.#addRoute("ALL", mergePath(path, "*"), handler);
    return this;
  }
  #addRoute(method, path, handler, baseRoutePath) {
    path = mergePath(this._basePath, path);
    const r = {
      basePath: baseRoutePath !== void 0 ? mergePath(this._basePath, baseRoutePath) : this._basePath,
      path,
      method,
      handler
    };
    this.router.add(method, path, [handler, r]);
    this.routes.push(r);
  }
  #handleError(err, c) {
    if (err instanceof Error) return this.errorHandler(err, c);
    throw err;
  }
  #dispatch(request, executionCtx, env, method) {
    if (method === "HEAD") return (async () => new Response(null, await this.#dispatch(request, executionCtx, env, "GET")))();
    const path = this.getPath(request, { env });
    const matchResult = this.router.match(method, path);
    const c = new Context(request, {
      path,
      matchResult,
      env,
      executionCtx,
      notFoundHandler: this.#notFoundHandler
    });
    if (matchResult[0].length === 1) {
      let res;
      try {
        res = matchResult[0][0][0][0](c, async () => {
          c.res = await this.#notFoundHandler(c);
        });
      } catch (err) {
        return this.#handleError(err, c);
      }
      return res instanceof Promise ? res.then((resolved) => resolved || (c.finalized ? c.res : this.#notFoundHandler(c))).catch((err) => this.#handleError(err, c)) : res ?? this.#notFoundHandler(c);
    }
    const composed = compose(matchResult[0], this.errorHandler, this.#notFoundHandler);
    return (async () => {
      try {
        const context = await composed(c);
        if (!context.finalized) throw new Error("Context is not finalized. Did you forget to return a Response object or `await next()`?");
        return context.res;
      } catch (err) {
        return this.#handleError(err, c);
      }
    })();
  }
  /**
  * `.fetch()` will be entry point of your app.
  *
  * @see {@link https://hono.dev/docs/api/hono#fetch}
  *
  * @param {Request} request - request Object of request
  * @param {Env} env - env Object
  * @param {ExecutionContext} executionCtx - context of execution
  * @returns {Response | Promise<Response>} response of request
  *
  */
  fetch = /* @__PURE__ */ __name((request, ...rest) => {
    return this.#dispatch(request, rest[1], rest[0], request.method);
  }, "fetch");
  /**
  * `.request()` is a useful method for testing.
  * You can pass a URL or pathname to send a GET request.
  * app will return a Response object.
  * ```ts
  * test('GET /hello is ok', async () => {
  *   const res = await app.request('/hello')
  *   expect(res.status).toBe(200)
  * })
  * ```
  * @see https://hono.dev/docs/api/hono#request
  */
  request = /* @__PURE__ */ __name((input, requestInit, Env2, executionCtx) => {
    if (input instanceof Request) return this.fetch(requestInit ? new Request(input, requestInit) : input, Env2, executionCtx);
    input = input.toString();
    return this.fetch(new Request(/^https?:\/\//.test(input) ? input : `http://localhost${mergePath("/", input)}`, requestInit), Env2, executionCtx);
  }, "request");
  /**
  * `.fire()` automatically adds a global fetch event listener.
  * This can be useful for environments that adhere to the Service Worker API, such as non-ES module Cloudflare Workers.
  * @deprecated
  * Use `fire` from `hono/service-worker` instead.
  * ```ts
  * import { Hono } from 'hono'
  * import { fire } from 'hono/service-worker'
  *
  * const app = new Hono()
  * // ...
  * fire(app)
  * ```
  * @see https://hono.dev/docs/api/hono#fire
  * @see https://developer.mozilla.org/en-US/docs/Web/API/Service_Worker_API
  * @see https://developers.cloudflare.com/workers/reference/migrate-to-module-workers/
  */
  fire = /* @__PURE__ */ __name(() => {
    addEventListener("fetch", (event) => {
      event.respondWith(this.#dispatch(event.request, event, void 0, event.request.method));
    });
  }, "fire");
};

// node_modules/hono/dist/router/utils.js
var createNullObject = /* @__PURE__ */ __name(() => /* @__PURE__ */ Object.create(null), "createNullObject");

// node_modules/hono/dist/router/reg-exp-router/matcher.js
var emptyParam = [];
function match(method, path) {
  const matchers = this.buildAllMatchers();
  const match2 = /* @__PURE__ */ __name(((method2, path2) => {
    const matcher = matchers[method2] || matchers["ALL"];
    const staticMatch = matcher[2][path2];
    if (staticMatch) return staticMatch;
    const match3 = path2.match(matcher[0]);
    if (!match3) return [[], emptyParam];
    const index = match3.indexOf("", 1);
    return [matcher[1][index], match3];
  }), "match");
  this.match = match2;
  return match2(method, path);
}
__name(match, "match");

// node_modules/hono/dist/router/reg-exp-router/node.js
var LABEL_REG_EXP_STR = "[^/]+";
var TAIL_WILDCARD_REG_EXP_STR = "(?:|/.*)";
var PATH_ERROR = /* @__PURE__ */ Symbol();
var regExpMetaChars = /* @__PURE__ */ new Set(".\\+*[^]$()");
function compareKey(a, b) {
  if (a.length === 1) return b.length === 1 ? a < b ? -1 : 1 : -1;
  if (b.length === 1) return 1;
  if (a === ".*" || a === "(?:|/.*)") return b === "(?:|/.*)" ? -1 : 1;
  else if (b === ".*" || b === "(?:|/.*)") return -1;
  if (a === "[^/]+") return 1;
  else if (b === "[^/]+") return -1;
  return a.length === b.length ? a < b ? -1 : 1 : b.length - a.length;
}
__name(compareKey, "compareKey");
var Node = class Node2 {
  static {
    __name(this, "Node");
  }
  #index;
  #varIndex;
  #children = createNullObject();
  insert(tokens, index, paramMap, context, isStatic) {
    let node = this;
    for (let i = 0, len = tokens.length; i < len; i++) {
      const token = tokens[i];
      const pattern = token.length === 1 ? token === "*" ? i === len - 1 ? [
        "",
        "",
        ".*"
      ] : [
        "",
        "",
        LABEL_REG_EXP_STR
      ] : null : token === "/*" ? [
        "",
        "",
        TAIL_WILDCARD_REG_EXP_STR
      ] : token.match(/^\:([^\{\}]+)(?:\{(.+)\})?$/);
      let nextNode;
      if (pattern) {
        const name = pattern[1];
        let regexpStr = pattern[2] || "[^/]+";
        if (name && pattern[2]) {
          if (regexpStr === ".*") throw PATH_ERROR;
          regexpStr = regexpStr.replace(/^\((?!\?:)(?=[^)]+\)$)/, "(?:");
          if (/\((?!\?:)/.test(regexpStr)) throw PATH_ERROR;
          if (regexpStr.length === 1 && regExpMetaChars.has(regexpStr)) throw PATH_ERROR;
        }
        nextNode = node.#children[regexpStr];
        if (!nextNode) {
          if (regexpStr !== ".*" && regexpStr !== "(?:|/.*)") {
            for (const k in node.#children) if ((regexpStr.length > 1 || k.length > 1) && k !== ".*" && k !== "(?:|/.*)") throw PATH_ERROR;
          }
          nextNode = node.#children[regexpStr] = new Node2();
        }
        if (name !== "") {
          nextNode.#varIndex ??= context.varIndex++;
          paramMap.push([name, nextNode.#varIndex]);
        }
      } else {
        nextNode = node.#children[token];
        if (!nextNode) {
          for (const k in node.#children) if (k.length > 1 && k !== ".*" && k !== "(?:|/.*)") throw PATH_ERROR;
          nextNode = node.#children[token] = new Node2();
        }
      }
      node = nextNode;
    }
    if (node.#index !== void 0) throw PATH_ERROR;
    node.#index = isStatic ? -1 : index;
  }
  buildRegExpStr() {
    const strList2 = Object.keys(this.#children).sort(compareKey).map((k) => {
      const c = this.#children[k];
      const childStr = c.buildRegExpStr();
      return childStr === "" ? "" : (typeof c.#varIndex === "number" ? `(${k})@${c.#varIndex}` : regExpMetaChars.has(k) ? `\\${k}` : k) + childStr;
    }).filter(Boolean);
    if (typeof this.#index === "number" && this.#index !== -1) strList2.unshift(`#${this.#index}`);
    if (strList2.length === 0) return "";
    if (strList2.length === 1) return strList2[0];
    return "(?:" + strList2.join("|") + ")";
  }
};

// node_modules/hono/dist/router/reg-exp-router/trie.js
var Trie = class {
  static {
    __name(this, "Trie");
  }
  #context = { varIndex: 0 };
  #root = new Node();
  #index = 0;
  paths = createNullObject();
  insert(path, isStatic) {
    if (isStatic) {
      this.#root.insert(path.split(""), 0, [], this.#context, true);
      return;
    }
    const paramAssoc = [];
    const groups = [];
    let markedPath = path;
    for (let i = 0; ; ) {
      let replaced = false;
      markedPath = markedPath.replace(/\{[^}]+\}/g, (m) => {
        const mark = `@\\${i}`;
        groups[i] = [mark, m];
        i++;
        replaced = true;
        return mark;
      });
      if (!replaced) break;
    }
    const tokens = markedPath.match(/(?::[^\/]+)|(?:\/\*$)|./g) || [];
    for (let i = groups.length - 1; i >= 0; i--) {
      const [mark] = groups[i];
      for (let j = tokens.length - 1; j >= 0; j--) if (tokens[j].indexOf(mark) !== -1) {
        tokens[j] = tokens[j].replace(mark, groups[i][1]);
        break;
      }
    }
    this.#root.insert(tokens, this.#index, paramAssoc, this.#context, false);
    this.paths[path] = [this.#index++, paramAssoc];
  }
  buildRegExp() {
    let regexp = this.#root.buildRegExpStr();
    if (regexp === "") return [
      /^$/,
      [],
      []
    ];
    let captureIndex = 0;
    const indexReplacementMap = [];
    const paramReplacementMap = [];
    regexp = regexp.replace(/#(\d+)|@(\d+)|\.\*\$/g, (_, handlerIndex, paramIndex) => {
      if (handlerIndex !== void 0) {
        indexReplacementMap[++captureIndex] = Number(handlerIndex);
        return "$()";
      }
      if (paramIndex !== void 0) {
        paramReplacementMap[Number(paramIndex)] = ++captureIndex;
        return "";
      }
      return "";
    });
    return [
      new RegExp(`^${regexp}`),
      indexReplacementMap,
      paramReplacementMap
    ];
  }
};

// node_modules/hono/dist/router/reg-exp-router/router.js
var wildcardRegExpCache = createNullObject();
function buildWildcardRegExp(path) {
  return wildcardRegExpCache[path] ??= new RegExp(`^${path.replace(/\/:[^/{}]+(?:\{\[\^\/]\+})?(?=[/{]|$)|\/?\*$|([.\\+*[^\]$()?{}|])/g, (match2, metaChar) => metaChar ? `\\${metaChar}` : match2 === "/*" ? TAIL_WILDCARD_REG_EXP_STR : match2 === "*" ? ".*" : `/:${LABEL_REG_EXP_STR}`)}$`);
}
__name(buildWildcardRegExp, "buildWildcardRegExp");
function findMiddleware(middleware, path) {
  for (const k of Object.keys(middleware).sort((a, b) => b.length - a.length)) if (buildWildcardRegExp(k).test(path)) return [...middleware[k]];
}
__name(findMiddleware, "findMiddleware");
var RegExpRouter = class {
  static {
    __name(this, "RegExpRouter");
  }
  name = "RegExpRouter";
  #middleware;
  #routes;
  #tries;
  constructor() {
    this.#middleware = { ["ALL"]: createNullObject() };
    this.#routes = { ["ALL"]: createNullObject() };
    this.#tries = { ["ALL"]: new Trie() };
  }
  #insertPath(method, path) {
    try {
      this.#tries[method].insert(path, !/\*|\/:/.test(path));
    } catch (e) {
      throw e === PATH_ERROR ? new UnsupportedPathError(path) : e;
    }
  }
  add(method, path, handler) {
    const middleware = this.#middleware;
    const routes = this.#routes;
    if (!middleware) throw new Error(MESSAGE_MATCHER_IS_ALREADY_BUILT);
    if (!middleware[method]) {
      this.#tries[method] = new Trie();
      for (const handlerMap of [middleware, routes]) {
        handlerMap[method] = createNullObject();
        for (const p in handlerMap["ALL"]) {
          handlerMap[method][p] = [...handlerMap["ALL"][p]];
          this.#insertPath(method, p);
        }
      }
    }
    if (path === "/*") path = "*";
    const methods = method === "ALL" ? Object.keys(middleware) : [method];
    if (/\*$/.test(path)) {
      const re = buildWildcardRegExp(path);
      for (const m of methods) if (!middleware[m][path]) {
        this.#insertPath(m, path);
        middleware[m][path] = findMiddleware(middleware[m], path) || findMiddleware(middleware["ALL"], path) || [];
      }
      for (const handlerMap of [middleware, routes]) for (const m of methods) for (const p in handlerMap[m]) re.test(p) && handlerMap[m][p].push([handler, path]);
      return;
    }
    const paths = checkOptionalParameter(path) || [path];
    for (const path2 of paths) for (const m of methods) {
      if (!routes[m][path2]) {
        this.#insertPath(m, path2);
        routes[m][path2] = findMiddleware(middleware[m], path2) || findMiddleware(middleware["ALL"], path2) || [];
      }
      routes[m][path2].push([handler, path2]);
    }
  }
  match = match;
  buildAllMatchers() {
    const matchers = createNullObject();
    for (const method of Object.keys(this.#routes)) matchers[method] = this.#buildMatcher(method);
    this.#middleware = this.#routes = this.#tries = void 0;
    wildcardRegExpCache = createNullObject();
    return matchers;
  }
  #buildMatcher(method) {
    const middleware = this.#middleware[method];
    const routes = this.#routes[method];
    const trie = this.#tries[method];
    const staticMap = createNullObject();
    const handlerData = [];
    const [regexp, indexReplacementMap, paramReplacementMap] = trie.buildRegExp();
    for (const r of [middleware, routes]) for (const path in r) {
      const handlers = r[path];
      const pathData = trie.paths[path];
      if (!pathData) {
        staticMap[path] = [handlers.map(([h]) => [h, createNullObject()]), emptyParam];
        continue;
      }
      handlerData[pathData[0]] = handlers.map(([h, handlerPath]) => [h, trie.paths[handlerPath][1].reduceRight((map, [key], i) => {
        map[key] = paramReplacementMap[pathData[1][i][1]];
        return map;
      }, createNullObject())]);
    }
    return [
      regexp,
      indexReplacementMap.map((i) => handlerData[i]),
      staticMap
    ];
  }
};

// node_modules/hono/dist/router/smart-router/router.js
var SmartRouter = class {
  static {
    __name(this, "SmartRouter");
  }
  name = "SmartRouter";
  #routers = [];
  #routes = [];
  constructor(init) {
    this.#routers = init.routers;
  }
  add(method, path, handler) {
    if (!this.#routes) throw new Error(MESSAGE_MATCHER_IS_ALREADY_BUILT);
    this.#routes.push([
      method,
      path,
      handler
    ]);
  }
  match(method, path) {
    if (!this.#routes) throw new Error("Fatal error");
    const routers = this.#routers;
    const routes = this.#routes;
    const len = routers.length;
    let i = 0;
    let res;
    for (; i < len; i++) {
      const router = routers[i];
      try {
        for (let i2 = 0, len2 = routes.length; i2 < len2; i2++) router.add(...routes[i2]);
        res = router.match(method, path);
      } catch (e) {
        if (e instanceof UnsupportedPathError) continue;
        throw e;
      }
      this.match = router.match.bind(router);
      this.#routers = [router];
      this.#routes = void 0;
      break;
    }
    if (i === len) throw new Error("Fatal error");
    this.name = `SmartRouter + ${this.activeRouter.name}`;
    return res;
  }
  get activeRouter() {
    if (this.#routes || this.#routers.length !== 1) throw new Error("No active router has been determined yet.");
    return this.#routers[0];
  }
};

// node_modules/hono/dist/router/trie-router/node.js
var emptyParams = createNullObject();
var order = 0;
var Node3 = class Node4 {
  static {
    __name(this, "Node");
  }
  #methods = [];
  #children = createNullObject();
  #patterns = [];
  #pattern;
  #params = emptyParams;
  insert(method, path, handler) {
    let curNode = this;
    const parts = splitRoutingPath(path);
    const possibleKeys = /* @__PURE__ */ new Set();
    let i = 0;
    for (const p of parts) {
      const nextP = parts[++i];
      const pattern = getPattern(p, nextP) || (nextP === void 0 && p && p.indexOf("*") === p.length - 1 ? p : null);
      const isParam = Array.isArray(pattern);
      const key = isParam ? pattern[0] : pattern || p;
      const child = curNode.#children[key] ||= new Node4();
      if (pattern && !child.#pattern) {
        child.#pattern = pattern;
        curNode.#patterns.push(child);
      }
      curNode = child;
      if (isParam) possibleKeys.add(pattern[1]);
    }
    curNode.#methods.push({ [method]: {
      handler,
      possibleKeys: [...possibleKeys],
      score: ++order
    } });
  }
  #pushHandlerSets(handlerSets, node, method, nodeParams, params) {
    for (let i = 0, len = node.#methods.length; i < len; i++) {
      const m = node.#methods[i];
      const handlerSet = m[method] || m["ALL"];
      if (handlerSet) {
        handlerSet.params = createNullObject();
        handlerSets.push(handlerSet);
        for (let i2 = 0, len2 = handlerSet.possibleKeys.length; i2 < len2; i2++) {
          const key = handlerSet.possibleKeys[i2];
          handlerSet.params[key] = params?.[key] && !i2 ? params[key] : nodeParams[key] ?? params?.[key];
        }
      }
    }
  }
  search(method, path) {
    const handlerSets = [];
    this.#params = emptyParams;
    let curNodes = [this];
    const parts = splitPath(path);
    const curNodesQueue = [];
    const len = parts.length;
    let partOffsets = null;
    for (let i = 0; i < len; i++) {
      const part = parts[i];
      const isLast = i === len - 1;
      const tempNodes = [];
      for (let j = 0, len2 = curNodes.length; j < len2; j++) {
        const node = curNodes[j];
        const nextNode = node.#children[part];
        if (nextNode) {
          nextNode.#params = node.#params;
          if (isLast) {
            if (nextNode.#children["*"]) this.#pushHandlerSets(handlerSets, nextNode.#children["*"], method, node.#params);
            this.#pushHandlerSets(handlerSets, nextNode, method, node.#params);
          } else tempNodes.push(nextNode);
        }
        for (const child of node.#patterns) {
          const pattern = child.#pattern;
          const params = node.#params === emptyParams ? {} : { ...node.#params };
          if (typeof pattern === "string") {
            if (pattern === "*" || part.startsWith(pattern.slice(0, -1))) {
              this.#pushHandlerSets(handlerSets, child, method, node.#params);
              if (pattern === "*") {
                child.#params = params;
                tempNodes.push(child);
              }
            }
            continue;
          }
          const [, name, matcher] = pattern;
          if (!part && matcher === true) continue;
          if (matcher !== true) {
            if (!partOffsets) {
              partOffsets = [];
              let offset = path[0] === "/" ? 1 : 0;
              for (let p = 0; p < len; p++) {
                partOffsets[p] = offset;
                offset += parts[p].length + 1;
              }
            }
            const restPathString = path.slice(partOffsets[i]);
            const m = matcher.exec(restPathString);
            if (m) {
              params[name] = m[0];
              this.#pushHandlerSets(handlerSets, child, method, node.#params, params);
              if (m[0].length === restPathString.length && child.#children["*"]) this.#pushHandlerSets(handlerSets, child.#children["*"], method, node.#params, params);
              for (const _ in child.#children) {
                child.#params = params;
                const componentCount = m[0].match(/\//g)?.length ?? 0;
                (curNodesQueue[componentCount] ||= []).push(child);
                break;
              }
              continue;
            }
          }
          if (matcher === true || matcher.test(part)) {
            params[name] = part;
            if (isLast) {
              this.#pushHandlerSets(handlerSets, child, method, params, node.#params);
              if (child.#children["*"]) this.#pushHandlerSets(handlerSets, child.#children["*"], method, params, node.#params);
            } else {
              child.#params = params;
              tempNodes.push(child);
            }
          }
        }
      }
      const shifted = curNodesQueue.shift();
      curNodes = shifted ? tempNodes.concat(shifted) : tempNodes;
    }
    if (handlerSets[1]) handlerSets.sort((a, b) => {
      return a.score - b.score;
    });
    return [handlerSets.map(({ handler, params }) => [handler, params])];
  }
};

// node_modules/hono/dist/router/trie-router/router.js
var TrieRouter = class {
  static {
    __name(this, "TrieRouter");
  }
  name = "TrieRouter";
  #node = new Node3();
  add(method, path, handler) {
    for (const result of checkOptionalParameter(path) || [path]) this.#node.insert(method, result, handler);
  }
  match(method, path) {
    return this.#node.search(method, path);
  }
};

// node_modules/hono/dist/hono.js
var Hono3 = class extends Hono {
  static {
    __name(this, "Hono");
  }
  /**
  * Creates an instance of the Hono class.
  *
  * @param options - Optional configuration options for the Hono instance.
  */
  constructor(options = {}) {
    super(options);
    this.router = options.router ?? new SmartRouter({ routers: [new RegExpRouter(), new TrieRouter()] });
  }
};

// src/types.ts
function isValidMovieInfo(info) {
  return info.id !== "" && info.number !== "" && info.title !== "" && info.cover_url !== "";
}
__name(isValidMovieInfo, "isValidMovieInfo");
function isValidSearchResult(r) {
  return r.id !== "" && r.number !== "" && r.title !== "" && r.provider !== "" && r.homepage !== "";
}
__name(isValidSearchResult, "isValidSearchResult");
function movieInfoToSearchResult(info) {
  return {
    id: info.id,
    number: info.number,
    title: info.title,
    provider: info.provider,
    homepage: info.homepage,
    actors: info.actors,
    thumb_url: info.thumb_url,
    cover_url: info.cover_url,
    score: info.score,
    release_date: info.release_date
  };
}
__name(movieInfoToSearchResult, "movieInfoToSearchResult");
function asSearcher(p) {
  const s = p;
  return typeof s.searchMovie === "function" && typeof s.normalizeMovieKeyword === "function" ? s : null;
}
__name(asSearcher, "asSearcher");
function isValidActorInfo(info) {
  return info.id !== "" && info.name !== "" && info.provider !== "" && info.homepage !== "";
}
__name(isValidActorInfo, "isValidActorInfo");
function isValidActorSearchResult(r) {
  return r.id !== "" && r.name !== "" && r.provider !== "" && r.homepage !== "";
}
__name(isValidActorSearchResult, "isValidActorSearchResult");
function actorInfoToSearchResult(info) {
  return {
    id: info.id,
    name: info.name,
    provider: info.provider,
    homepage: info.homepage,
    aliases: info.aliases,
    images: info.images
  };
}
__name(actorInfoToSearchResult, "actorInfoToSearchResult");
var ProviderError = class extends Error {
  constructor(message, kind) {
    super(message);
    this.kind = kind;
    this.name = "ProviderError";
  }
  kind;
  static {
    __name(this, "ProviderError");
  }
};

// src/db.ts
function rowToMovieInfo(row) {
  return {
    id: row.id,
    number: row.number,
    title: row.title,
    summary: row.summary,
    provider: row.provider,
    homepage: row.homepage,
    director: row.director,
    actors: JSON.parse(row.actors),
    thumb_url: row.thumb_url,
    cover_url: row.cover_url,
    preview_video_url: row.preview_video_url,
    preview_video_hls_url: row.preview_video_hls_url,
    preview_images: JSON.parse(row.preview_images),
    maker: row.maker,
    label: row.label,
    series: row.series,
    genres: JSON.parse(row.genres),
    score: row.score,
    runtime: row.runtime,
    release_date: row.release_date
  };
}
__name(rowToMovieInfo, "rowToMovieInfo");
async function getMovieInfoFromDB(db, provider, id) {
  const row = await db.prepare("SELECT * FROM movie_metadata WHERE provider = ? AND id = ? COLLATE NOCASE").bind(provider, id).first();
  return row ? rowToMovieInfo(row) : null;
}
__name(getMovieInfoFromDB, "getMovieInfoFromDB");
async function saveMovieInfoToDB(db, info) {
  const now = Math.floor(Date.now() / 1e3);
  await db.prepare(
    `INSERT INTO movie_metadata (
         provider, id, number, title, summary, homepage, director, actors,
         thumb_url, cover_url, preview_video_url, preview_video_hls_url,
         preview_images, maker, label, series, genres, score, runtime,
         release_date, created_at, updated_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT (provider, id) DO UPDATE SET
         number = excluded.number,
         title = excluded.title,
         summary = excluded.summary,
         homepage = excluded.homepage,
         director = excluded.director,
         actors = excluded.actors,
         thumb_url = excluded.thumb_url,
         cover_url = excluded.cover_url,
         preview_video_url = excluded.preview_video_url,
         preview_video_hls_url = excluded.preview_video_hls_url,
         preview_images = excluded.preview_images,
         maker = excluded.maker,
         label = excluded.label,
         series = excluded.series,
         genres = excluded.genres,
         score = excluded.score,
         runtime = excluded.runtime,
         release_date = excluded.release_date,
         updated_at = excluded.updated_at`
  ).bind(
    info.provider,
    info.id,
    info.number,
    info.title,
    info.summary,
    info.homepage,
    info.director,
    JSON.stringify(info.actors),
    info.thumb_url,
    info.cover_url,
    info.preview_video_url,
    info.preview_video_hls_url,
    JSON.stringify(info.preview_images),
    info.maker,
    info.label,
    info.series,
    JSON.stringify(info.genres),
    info.score,
    info.runtime,
    info.release_date,
    now,
    now
  ).run();
}
__name(saveMovieInfoToDB, "saveMovieInfoToDB");
async function searchMovieFromDB(db, keyword, providerName) {
  const scoped = providerName !== void 0;
  const stmt = scoped ? db.prepare(
    "SELECT * FROM movie_metadata WHERE provider = ? AND (number = ? COLLATE NOCASE OR id = ? COLLATE NOCASE)"
  ).bind(providerName, keyword, keyword) : db.prepare(
    "SELECT * FROM movie_metadata WHERE number = ? COLLATE NOCASE OR id = ? COLLATE NOCASE"
  ).bind(keyword, keyword);
  const { results } = await stmt.all();
  return results.map(rowToMovieInfo).filter(isValidMovieInfo).map(movieInfoToSearchResult);
}
__name(searchMovieFromDB, "searchMovieFromDB");
function rowToActorInfo(row) {
  return {
    id: row.id,
    name: row.name,
    provider: row.provider,
    homepage: row.homepage,
    summary: row.summary,
    hobby: row.hobby,
    skill: row.skill,
    blood_type: row.blood_type,
    cup_size: row.cup_size,
    measurements: row.measurements,
    nationality: row.nationality,
    height: row.height,
    aliases: JSON.parse(row.aliases),
    images: JSON.parse(row.images),
    birthday: row.birthday,
    debut_date: row.debut_date
  };
}
__name(rowToActorInfo, "rowToActorInfo");
async function getActorInfoFromDB(db, provider, id) {
  const row = await db.prepare("SELECT * FROM actor_metadata WHERE provider = ? AND id = ? COLLATE NOCASE").bind(provider, id).first();
  return row ? rowToActorInfo(row) : null;
}
__name(getActorInfoFromDB, "getActorInfoFromDB");
async function saveActorInfoToDB(db, info) {
  const now = Math.floor(Date.now() / 1e3);
  await db.prepare(
    `INSERT INTO actor_metadata (
         provider, id, name, homepage, summary, hobby, skill, blood_type,
         cup_size, measurements, nationality, height, aliases, images,
         birthday, debut_date, created_at, updated_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT (provider, id) DO UPDATE SET
         name = excluded.name,
         homepage = excluded.homepage,
         summary = excluded.summary,
         hobby = excluded.hobby,
         skill = excluded.skill,
         blood_type = excluded.blood_type,
         cup_size = excluded.cup_size,
         measurements = excluded.measurements,
         nationality = excluded.nationality,
         height = excluded.height,
         aliases = excluded.aliases,
         images = excluded.images,
         birthday = excluded.birthday,
         debut_date = excluded.debut_date,
         updated_at = excluded.updated_at`
  ).bind(
    info.provider,
    info.id,
    info.name,
    info.homepage,
    info.summary,
    info.hobby,
    info.skill,
    info.blood_type,
    info.cup_size,
    info.measurements,
    info.nationality,
    info.height,
    JSON.stringify(info.aliases),
    JSON.stringify(info.images),
    info.birthday,
    info.debut_date,
    now,
    now
  ).run();
}
__name(saveActorInfoToDB, "saveActorInfoToDB");
async function searchActorFromDB(db, keyword, providerName) {
  const { results } = await db.prepare(
    "SELECT * FROM actor_metadata WHERE provider = ? AND name = ? COLLATE NOCASE"
  ).bind(providerName, keyword).all();
  return results.map(rowToActorInfo).filter(isValidActorInfo).map(actorInfoToSearchResult);
}
__name(searchActorFromDB, "searchActorFromDB");

// src/lib/textutil.ts
function compareStrings(a, b) {
  const s = [...a.toLowerCase()];
  const t = [...b.toLowerCase()];
  if (s.length === 0 || t.length === 0) {
    return s.length === t.length ? 1 : 0;
  }
  let prev = Array.from({ length: t.length + 1 }, (_, j) => j);
  let cur = new Array(t.length + 1);
  for (let i = 1; i <= s.length; i++) {
    cur[0] = i;
    for (let j = 1; j <= t.length; j++) {
      const cost = s[i - 1] === t[j - 1] ? 0 : 2;
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
    }
    [prev, cur] = [cur, prev];
  }
  const dist = prev[t.length];
  return Math.max(0, 1 - dist / Math.max(s.length, t.length));
}
__name(compareStrings, "compareStrings");
var UNCENSORED_RE = /^(\d{4,6}[-_]\d{2,3}|(cz|gedo|k|n|kb|se)\d{2,4}|(heyzo|xxx-av|heydouga|kin8)[-_].+|([hc]0930|h4610|av9898|1000giri)[-_][a-z\d]+)$/i;
var FC2_RE = /^FC2([-_]?PPV)?[-_]?\d+$/i;
var SPECIAL_BRAND_RE = /^(gcolle|getchu|gyutto|pcolle|mywife)[-_]?.+$/i;
function isSpecial(s) {
  return isUncensored(s) || isFC2(s) || SPECIAL_BRAND_RE.test(s);
}
__name(isSpecial, "isSpecial");
function isUncensored(s) {
  return UNCENSORED_RE.test(s);
}
__name(isUncensored, "isUncensored");
function isFC2(s) {
  return FC2_RE.test(s);
}
__name(isFC2, "isFC2");
function parseIDToNumber(s) {
  const up = s.toUpperCase();
  const m = /(\d*[A-Z]+)(\d+)/.exec(up);
  return m ? `${m[1]}-${m[2]}` : up;
}
__name(parseIDToNumber, "parseIDToNumber");
function parseScore(s) {
  const fields = s.replace(/点/g, "").trim().split(/\s+/).filter(Boolean);
  if (fields.length === 0) return 0;
  const n = parseFloat(fields[0]);
  return Number.isNaN(n) ? 0 : n;
}
__name(parseScore, "parseScore");
function parseRuntime(s) {
  if (!s) return 0;
  let t = s.replace(/\s+/g, " ").trim().toLowerCase().replace(/秒/g, "s").replace(/分/g, "m").replace(/時/g, "h").replace(/时/g, "h").replace(/sec/g, "s").replace(/min/g, "m");
  let m = /(\d+):(\d+):(\d+)/.exec(t);
  if (m) return parseInt(m[1], 10) * 60 + parseInt(m[2], 10);
  m = /(\d+):(\d+)/.exec(t);
  if (m) return parseInt(m[1], 10);
  let total = 0;
  let found = false;
  for (const part of t.matchAll(/(\d+)([hms])/g)) {
    found = true;
    const v = parseInt(part[1], 10);
    if (part[2] === "h") total += v * 60;
    else if (part[2] === "m") total += v;
    else total += v / 60;
  }
  return found ? Math.floor(total) : 0;
}
__name(parseRuntime, "parseRuntime");
var ACTOR_NAME_SEPARATORS = /* @__PURE__ */ new Set(["\u3001", ";", ",", "(", "\uFF08", ")", "\uFF09"]);
function parseActorNames(s) {
  const names = [];
  let buf = "";
  const flush = /* @__PURE__ */ __name(() => {
    const name = buf.trim();
    if (name) names.push(name);
    buf = "";
  }, "flush");
  for (const ch of s) {
    if (ACTOR_NAME_SEPARATORS.has(ch)) {
      flush();
    } else {
      buf += ch;
    }
  }
  flush();
  return names;
}
__name(parseActorNames, "parseActorNames");

// src/providers/fanza.ts
var VIDEO_URL = "https://video.dmm.co.jp/";
var GRAPHQL_URL = "https://api.video.dmm.co.jp/graphql";
var CONTENT_PAGE_DATA_QUERY = `
query ContentPageData($id: ID!, $isAmateur: Boolean!, $isAnime: Boolean!, $isAv: Boolean!, $isCinema: Boolean!) {
  ppvContent(id: $id) {
    id
    floor
    title
    description
    packageImage { largeUrl mediumUrl }
    sampleImages { largeImageUrl }
    sample2DMovie { highestMovieUrl hlsMovieUrl }
    sampleVRMovie { highestMovieUrl }
    ...AvFields @include(if: $isAv)
    ...AmateurFields @include(if: $isAmateur)
    ...AnimeFields @include(if: $isAnime)
    ...CinemaFields @include(if: $isCinema)
  }
  reviewSummary(contentId: $id) { average }
}
fragment AvFields on PPVContent {
  deliveryStartDate makerReleasedAt duration makerContentId
  actresses { name } directors { name } series { name }
  maker { name } label { name } genres { name }
}
fragment AmateurFields on PPVContent {
  deliveryStartDate duration makerContentId
  amateurActress { name }
  maker { name } label { name } genres { name }
}
fragment AnimeFields on PPVContent {
  deliveryStartDate duration makerContentId series { name }
  maker { name } label { name } genres { name }
}
fragment CinemaFields on PPVContent {
  deliveryStartDate duration makerContentId
  actresses { name } directors { name } series { name }
  maker { name } label { name } genres { name }
}`;
var ALL_FLOORS = { isAmateur: true, isAnime: true, isAv: true, isCinema: true };
var AV_ONLY = { isAmateur: false, isAnime: false, isAv: true, isCinema: false };
function parseNumber(s) {
  const m = /([A-Z]+)(\d+)/.exec(s.toUpperCase());
  if (m) {
    return `${m[1]}-${String(parseInt(m[2], 10)).padStart(3, "0")}`;
  }
  return s;
}
__name(parseNumber, "parseNumber");
var FanzaProvider = class {
  static {
    __name(this, "FanzaProvider");
  }
  name = "FANZA";
  priority = 1001;
  normalizeMovieID(id) {
    return id.trim().toLowerCase();
  }
  parseMovieIDFromURL(rawURL) {
    let url;
    try {
      url = new URL(rawURL);
    } catch {
      return null;
    }
    if (url.hostname === "video.dmm.co.jp") {
      const id = url.searchParams.get("id");
      return id ? this.normalizeMovieID(id) : null;
    }
    const m = /\/cid=(.*?)\//.exec(url.pathname);
    if (m) {
      return this.normalizeMovieID(m[1]);
    }
    return null;
  }
  async getMovieInfoByID(id) {
    const normalized = this.normalizeMovieID(id);
    if (!normalized) {
      throw new ProviderError("invalid id", "invalid");
    }
    const data = await this.fetchContentPageData(normalized);
    if (!data?.ppvContent) {
      throw new ProviderError(`content not found: ${normalized}`, "not_found");
    }
    const info = mapContentToMovieInfo(data);
    if (!isValidMovieInfo(info)) {
      throw new ProviderError(`incomplete metadata: ${normalized}`, "not_found");
    }
    return info;
  }
  async getMovieInfoByURL(rawURL) {
    const id = this.parseMovieIDFromURL(rawURL);
    if (!id) {
      throw new ProviderError(`cannot parse content id from url: ${rawURL}`, "invalid");
    }
    return this.getMovieInfoByID(id);
  }
  normalizeMovieKeyword(keyword) {
    if (isSpecial(keyword)) {
      return "";
    }
    return keyword.toLowerCase();
  }
  async searchMovie(keyword) {
    if (keyword.includes("-")) {
      try {
        const results = await this.searchMovieNext(keyword.replace("-", "00") + "#");
        if (results.length > 0) {
          return results;
        }
      } catch {
      }
    }
    return this.searchMovieNext(keyword.replace("-", ""));
  }
  async searchMovieNext(keyword) {
    const searchURL = `https://www.dmm.co.jp/search/=/searchstr=${encodeURIComponent(keyword)}/limit=120/sort=date/`;
    let resp;
    try {
      resp = await fetch(searchURL, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
          Referer: "https://www.dmm.co.jp/",
          Cookie: "age_check_done=1"
        },
        // IMPORTANT: do not follow redirects. DMM answers non-Japanese
        // egress with a 307 to a region page, but the 307 response body
        // still carries the full search page (verified against the real
        // site) — following the redirect would throw the data away.
        redirect: "manual"
      });
    } catch (e) {
      throw new ProviderError(`fanza search fetch failed: ${String(e)}`, "upstream");
    }
    if (resp.status !== 200 && resp.status !== 307 && resp.status !== 302) {
      throw new ProviderError(`fanza search http ${resp.status}`, "upstream");
    }
    const html = await resp.text();
    const products = extractSearchProducts(html);
    if (products.length === 0 && html.includes("not-available-in-your-region")) {
      throw new ProviderError("fanza search: region not available", "upstream");
    }
    const results = [];
    for (const product of products) {
      if (!product.detail_url.startsWith("https://www.dmm.co.jp/digital/") && !product.detail_url.startsWith("https://www.dmm.co.jp/mono/") && !product.detail_url.startsWith("https://video.dmm.co.jp/")) {
        continue;
      }
      results.push({
        id: product.content_id,
        number: parseNumber(product.content_id),
        title: product.title,
        provider: this.name,
        homepage: product.detail_url,
        actors: product.casts ?? [],
        thumb_url: product.thumbnail_image_url,
        cover_url: previewSrc(product.thumbnail_image_url),
        score: product.rate ?? 0,
        release_date: parseSearchReleaseDate(product.release_announcement ?? "")
      });
    }
    return sortFanzaSearchResults(keyword, results);
  }
  async fetchContentPageData(id) {
    try {
      return await this.graphql(id, ALL_FLOORS);
    } catch (e) {
      if (e instanceof ProviderError && e.kind === "upstream") {
        return await this.graphql(id, AV_ONLY);
      }
      throw e;
    }
  }
  async graphql(id, floors) {
    let resp;
    try {
      resp = await fetch(GRAPHQL_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Referer: VIDEO_URL,
          "Fanza-Device": "BROWSER",
          "Cache-Control": "no-cache",
          // The Go client sends an empty UA; a browser UA is safer from
          // Workers egress and behaves identically for this API.
          "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36"
        },
        body: JSON.stringify({
          query: CONTENT_PAGE_DATA_QUERY,
          variables: { id, ...floors }
        })
      });
    } catch (e) {
      throw new ProviderError(`fanza graphql fetch failed: ${String(e)}`, "upstream");
    }
    if (!resp.ok) {
      throw new ProviderError(`fanza graphql http ${resp.status}`, "upstream");
    }
    const payload = await resp.json();
    if (payload.errors?.length && !payload.data?.ppvContent) {
      throw new ProviderError(
        `fanza graphql error: ${payload.errors[0].message}`,
        "upstream"
      );
    }
    return payload.data ?? null;
  }
};
function toDate(s) {
  return s ? s.slice(0, 10) : "";
}
__name(toDate, "toDate");
function mapContentToMovieInfo(data) {
  const c = data.ppvContent;
  const info = {
    id: c.id,
    number: c.makerContentId ?? "",
    title: c.title ?? "",
    summary: c.description ?? "",
    provider: "FANZA",
    homepage: `https://video.dmm.co.jp/${(c.floor ?? "av").toLowerCase()}/content/?id=${c.id}`,
    director: "",
    actors: [],
    thumb_url: c.packageImage?.mediumUrl ?? "",
    cover_url: c.packageImage?.largeUrl ?? "",
    preview_video_url: "",
    preview_video_hls_url: "",
    preview_images: [],
    maker: c.maker?.name ?? "",
    label: c.label?.name ?? "",
    series: c.series?.name ?? "",
    genres: [],
    score: data.reviewSummary?.average ?? 0,
    runtime: Math.floor((c.duration ?? 0) / 60),
    release_date: toDate(c.deliveryStartDate) || toDate(c.makerReleasedAt)
  };
  for (const d of c.directors ?? []) {
    if (d.name) info.director = d.name;
  }
  for (const a of c.actresses ?? []) {
    if (a.name) info.actors.push(a.name);
  }
  if (info.actors.length === 0 && c.amateurActress?.name) {
    info.actors.push(c.amateurActress.name);
  }
  for (const g of c.genres ?? []) {
    if (g.name) info.genres.push(g.name);
  }
  for (const img of c.sampleImages ?? []) {
    if (img.largeImageUrl) info.preview_images.push(img.largeImageUrl);
  }
  if (!info.number) {
    info.number = parseNumber(info.id);
  }
  if (!info.cover_url) {
    info.cover_url = info.thumb_url;
  }
  if (c.sample2DMovie?.highestMovieUrl) {
    info.preview_video_url = c.sample2DMovie.highestMovieUrl;
  }
  if (c.sample2DMovie?.hlsMovieUrl) {
    info.preview_video_hls_url = c.sample2DMovie.hlsMovieUrl;
  }
  if (c.sampleVRMovie?.highestMovieUrl) {
    info.preview_video_url = c.sampleVRMovie.highestMovieUrl;
  }
  return info;
}
__name(mapContentToMovieInfo, "mapContentToMovieInfo");
function extractSearchProducts(html) {
  let data = "";
  const pushRe = /self\.__next_f\.push\(\[(\d+),"((?:[^"\\]|\\.)*)"\]\)/g;
  for (const m of html.matchAll(pushRe)) {
    if (m[1] !== "1") continue;
    try {
      data += JSON.parse(`"${m[2]}"`);
    } catch {
      data += m[2];
    }
  }
  for (const line of data.split("\n")) {
    if (!line.includes("backendResponse")) continue;
    const lm = /^\w:(\[.+])/.exec(line);
    if (!lm) continue;
    try {
      const arr = JSON.parse(lm[1]);
      const wrapper = findObjectWithKey(arr, "backendResponse");
      const products = wrapper?.backendResponse?.contents?.data;
      if (products) return products;
    } catch {
    }
  }
  return [];
}
__name(extractSearchProducts, "extractSearchProducts");
function findObjectWithKey(value, key, depth = 0) {
  if (depth > 100 || value === null || typeof value !== "object") return void 0;
  if (!Array.isArray(value)) {
    if (key in value) return value;
    return void 0;
  }
  for (const item of value) {
    if (item !== null && typeof item === "object" && !Array.isArray(item)) {
      if (key in item) return item;
    }
    const found = findObjectWithKey(item, key, depth + 1);
    if (found !== void 0) return found;
  }
  return void 0;
}
__name(findObjectWithKey, "findObjectWithKey");
function parseSearchReleaseDate(announcement) {
  const cleaned = announcement.replace(/(配信日|発売日|貸出日)：\s*/, "");
  const m = /(\d{4})[-/](\d{1,2})[-/](\d{1,2})/.exec(cleaned);
  if (!m) return "";
  return `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`;
}
__name(parseSearchReleaseDate, "parseSearchReleaseDate");
function sortFanzaSearchResults(keyword, results) {
  const norm = /* @__PURE__ */ __name((s) => s.replace(/([A-Z]+)0*([1-9]*)/gi, "$1$2"), "norm");
  const x = norm(keyword);
  return [...results].sort((ra, rb) => {
    const a = norm(ra.id);
    const b = norm(rb.id);
    if (a === b) {
      const ad = ra.homepage.includes("/digital/") ? 0 : 1;
      const bd = rb.homepage.includes("/digital/") ? 0 : 1;
      return ad - bd;
    }
    return compareStrings(b, x) - compareStrings(a, x);
  });
}
__name(sortFanzaSearchResults, "sortFanzaSearchResults");
function previewSrc(s) {
  if (/(p[a-z]\.)jpg/.test(s)) {
    return s.replace(/(p[a-z]\.)jpg/, "pl.jpg");
  } else if (/consumer_game/.test(s)) {
    return s.replaceAll("js-", "-");
  } else if (/js-(\d+)\.jpg$/.test(s)) {
    return s.replace("js-", "jp-");
  } else if (/ts-(\d+)\.jpg$/.test(s)) {
    return s.replace("ts-", "tl-");
  } else if (/(-\d+\.)jpg$/.test(s)) {
    return s.replace(/(-\d+\.)jpg$/, "jp$1jpg");
  } else {
    return s.replaceAll("-", "jp-");
  }
}
__name(previewSrc, "previewSrc");

// src/providers/javbus.ts
var BASE_URL = "https://www.javbus.com/";
var MOVIE_URL = "https://www.javbus.com/ja/";
var JavbusProvider = class {
  static {
    __name(this, "JavbusProvider");
  }
  name = "JavBus";
  priority = 995;
  normalizeMovieID(id) {
    return id.trim().toUpperCase();
  }
  parseMovieIDFromURL(rawURL) {
    try {
      const url = new URL(rawURL);
      const base = url.pathname.split("/").filter(Boolean).pop();
      return base ? this.normalizeMovieID(base) : null;
    } catch {
      return null;
    }
  }
  async getMovieInfoByID(id) {
    const normalized = this.normalizeMovieID(id);
    if (!normalized) {
      throw new ProviderError("invalid id", "invalid");
    }
    return this.getMovieInfoByURL(MOVIE_URL + normalized);
  }
  async getMovieInfoByURL(rawURL) {
    const id = this.parseMovieIDFromURL(rawURL);
    if (!id) {
      throw new ProviderError(`cannot parse movie id from url: ${rawURL}`, "invalid");
    }
    let resp;
    try {
      resp = await fetch(rawURL, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
          Referer: BASE_URL,
          Cookie: "dv=1; existmag=all"
        },
        redirect: "follow"
      });
    } catch (e) {
      throw new ProviderError(`javbus fetch failed: ${String(e)}`, "upstream");
    }
    if (resp.status === 404) {
      throw new ProviderError(`movie not found: ${id}`, "not_found");
    }
    if (!resp.ok) {
      throw new ProviderError(`javbus http ${resp.status}`, "upstream");
    }
    const info = await parseJavbusPage(resp, rawURL, id);
    if (!isValidMovieInfo(info)) {
      throw new ProviderError(`movie not found: ${id}`, "not_found");
    }
    return info;
  }
  normalizeMovieKeyword(keyword) {
    return javbusNormalizeKeyword(keyword);
  }
  async searchMovie(keyword) {
    return javbusSearchMovie(keyword);
  }
};
async function parseJavbusPage(resp, pageURL, id) {
  const info = {
    id,
    number: "",
    title: "",
    summary: "",
    provider: "JavBus",
    homepage: pageURL,
    director: "",
    actors: [],
    thumb_url: "",
    cover_url: "",
    preview_video_url: "",
    preview_video_hls_url: "",
    preview_images: [],
    maker: "",
    label: "",
    series: "",
    genres: [],
    score: 0,
    runtime: 0,
    release_date: ""
  };
  const abs = /* @__PURE__ */ __name((u) => new URL(u, pageURL).toString(), "abs");
  let pText = "";
  let genreText = "";
  const rewriter = new HTMLRewriter().on("a.bigImage img", {
    element(el) {
      info.title = el.getAttribute("title") ?? "";
      const src = el.getAttribute("src");
      if (src) info.cover_url = abs(src);
    }
  }).on("div.info p", {
    element(el) {
      pText = "";
      el.onEndTag(() => applyInfoLine(pText, info));
    },
    text(t) {
      pText += t.text;
    }
  }).on("span.genre label a", {
    element(el) {
      genreText = "";
      el.onEndTag(() => {
        const g = genreText.trim();
        if (g) info.genres.push(g);
      });
    },
    text(t) {
      genreText += t.text;
    }
  }).on("#sample-waterfall a", {
    element(el) {
      const href = el.getAttribute("href");
      if (href) info.preview_images.push(abs(href));
    }
  }).on("div.star-name a", {
    element(el) {
      const name = el.getAttribute("title");
      if (name && !info.actors.includes(name)) info.actors.push(name);
    }
  });
  await rewriter.transform(resp).text();
  const m = /\/cover\/([a-z\d]+)(?:_b)?\.(jpg|png)/i.exec(info.cover_url);
  if (m) {
    info.thumb_url = info.cover_url.replace(
      /\/cover\/[a-z\d]+(?:_b)?\.(jpg|png)/i,
      `/thumb/${m[1]}.${m[2]}`
    );
  }
  return info;
}
__name(parseJavbusPage, "parseJavbusPage");
function applyInfoLine(raw2, info) {
  const t = raw2.replace(/\s+/g, " ").trim();
  const idx = t.indexOf(":");
  if (idx < 0) return;
  const label = t.slice(0, idx + 1);
  const value = t.slice(idx + 1).trim();
  switch (label) {
    case "\u54C1\u756A:":
      info.number = value;
      break;
    case "\u767A\u58F2\u65E5:":
      info.release_date = parseDate(value.split(" ").pop() ?? "");
      break;
    case "\u53CE\u9332\u6642\u9593:":
      info.runtime = parseRuntimeMinutes(value.split(" ").pop() ?? "");
      break;
    case "\u76E3\u7763:":
      info.director = value;
      break;
    case "\u30E1\u30FC\u30AB\u30FC:":
      info.maker = value;
      break;
    case "\u30EC\u30FC\u30D9\u30EB:":
      info.label = value;
      break;
    case "\u30B7\u30EA\u30FC\u30BA:":
      info.series = value;
      break;
  }
}
__name(applyInfoLine, "applyInfoLine");
function parseDate(s) {
  const m = /(\d{4})[-/](\d{1,2})[-/](\d{1,2})/.exec(s);
  if (!m) return "";
  return `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`;
}
__name(parseDate, "parseDate");
function parseRuntimeMinutes(s) {
  s = s.toLowerCase().replace(/秒/g, "s").replace(/分/g, "m").replace(/[時时]/g, "h").replace(/sec/g, "s").replace(/min/g, "m").replace(/\s+/g, "");
  let m = /(\d+):(\d+):(\d+)/.exec(s);
  if (m) return parseInt(m[1], 10) * 60 + parseInt(m[2], 10);
  m = /(\d+):(\d+)/.exec(s);
  if (m) return parseInt(m[1], 10);
  let seconds = 0;
  let matched = false;
  for (const g of s.matchAll(/(\d+)(h|m|s)?/g)) {
    const n = parseInt(g[1], 10);
    if (Number.isNaN(n)) continue;
    matched = true;
    if (g[2] === "h") seconds += n * 3600;
    else if (g[2] === "s") seconds += n;
    else seconds += n * 60;
  }
  return matched ? Math.floor(seconds / 60) : 0;
}
__name(parseRuntimeMinutes, "parseRuntimeMinutes");
var SEARCH_URL = "https://www.javbus.com/ja/search/";
var SEARCH_UNCENSORED_URL = "https://www.javbus.com/ja/uncensored/search/";
var JAVBUS_KEYWORD_RE = /^([\d-_]{4,}|[a-z]{1,4}\d{2,4}|heyzo[-_].+)$/i;
function javbusNormalizeKeyword(keyword) {
  if (isSpecial(keyword) && !JAVBUS_KEYWORD_RE.test(keyword)) {
    return "";
  }
  return keyword.toUpperCase();
}
__name(javbusNormalizeKeyword, "javbusNormalizeKeyword");
async function javbusSearchMovie(keyword) {
  const urls = [
    SEARCH_URL + encodeURIComponent(keyword),
    SEARCH_UNCENSORED_URL + encodeURIComponent(keyword)
  ];
  const settled = await Promise.allSettled(
    urls.map(async (u) => {
      const resp = await fetch(u, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
          Referer: BASE_URL,
          Cookie: "dv=1; existmag=all"
        },
        redirect: "follow"
      });
      if (!resp.ok) {
        throw new ProviderError(`javbus search http ${resp.status}`, "upstream");
      }
      return parseJavbusSearchPage(resp, u);
    })
  );
  const results = [];
  let lastError;
  for (const s of settled) {
    if (s.status === "fulfilled") {
      results.push(...s.value);
    } else {
      lastError = s.reason;
    }
  }
  if (results.length === 0 && lastError) {
    throw lastError instanceof ProviderError ? lastError : new ProviderError(`javbus search failed: ${String(lastError)}`, "upstream");
  }
  return results;
}
__name(javbusSearchMovie, "javbusSearchMovie");
async function parseJavbusSearchPage(resp, pageURL) {
  const results = [];
  const abs = /* @__PURE__ */ __name((u) => new URL(u, pageURL).toString(), "abs");
  let card = null;
  const finalize = /* @__PURE__ */ __name(() => {
    if (!card) return;
    const title = (card.spanText.trim().split("\n")[0] ?? "").trim();
    let cover = "";
    const m = /\/thumbs?\/([a-z\d]+)(?:_b)?\.(jpg|png)/i.exec(card.thumb);
    if (m) {
      cover = card.thumb.replace(
        /\/thumbs?\/[a-z\d]+(?:_b)?\.(jpg|png)/i,
        `/cover/${m[1]}_b.${m[2]}`
      );
    }
    const result = {
      id: card.id,
      number: card.number,
      title,
      provider: "JavBus",
      homepage: card.homepage,
      actors: [],
      thumb_url: card.thumb,
      cover_url: cover,
      score: 0,
      release_date: card.release
    };
    if (isValidSearchResult(result)) {
      results.push(result);
    }
    card = null;
  }, "finalize");
  const rewriter = new HTMLRewriter().on("a.movie-box", {
    element(el) {
      const href = el.getAttribute("href") ?? "";
      card = {
        homepage: abs(href),
        id: href.split("/").filter(Boolean).pop()?.toUpperCase() ?? "",
        thumb: "",
        spanText: "",
        dateText: "",
        dateCount: 0,
        number: "",
        release: ""
      };
      el.onEndTag(finalize);
    }
  }).on("a.movie-box img", {
    element(el) {
      if (card && !card.thumb) {
        const src = el.getAttribute("src");
        if (src) card.thumb = abs(src);
      }
    }
  }).on("a.movie-box .photo-info span", {
    text(t) {
      if (card) card.spanText += t.text;
    }
  }).on("a.movie-box date", {
    element(el) {
      if (!card) return;
      card.dateText = "";
      const c = card;
      el.onEndTag(() => {
        c.dateCount += 1;
        const v = c.dateText.trim();
        if (c.dateCount === 1) c.number = v;
        else if (c.dateCount === 2) c.release = parseDate(v);
      });
    },
    text(t) {
      if (card) card.dateText += t.text;
    }
  });
  await rewriter.transform(resp).text();
  return results;
}
__name(parseJavbusSearchPage, "parseJavbusSearchPage");

// src/providers/avbase.ts
var BASE_URL2 = "https://www.avbase.net/";
var MOVIE_URL2 = "https://www.avbase.net/works/";
var KNOWN_SOURCES = /* @__PURE__ */ new Set(["duga", "fanza", "getchu", "mgstage", "pcolle"]);
var BUILD_ID_TTL_MS = 2 * 60 * 60 * 1e3;
var UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";
function joinPrefixID(prefix, workID) {
  if (!prefix || prefix.trim() === "") return workID;
  return `${prefix}:${workID}`;
}
__name(joinPrefixID, "joinPrefixID");
function parseAvbaseDate(s) {
  if (!s) return "";
  const iso = /(\d{4})[-/](\d{1,2})[-/](\d{1,2})/.exec(s);
  if (iso) {
    return `${iso[1]}-${iso[2].padStart(2, "0")}-${iso[3].padStart(2, "0")}`;
  }
  const months = {
    Jan: "01",
    Feb: "02",
    Mar: "03",
    Apr: "04",
    May: "05",
    Jun: "06",
    Jul: "07",
    Aug: "08",
    Sep: "09",
    Oct: "10",
    Nov: "11",
    Dec: "12"
  };
  const named = /(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+(\d{1,2})\s+(\d{4})/.exec(s);
  if (named) {
    return `${named[3]}-${months[named[1]]}-${named[2].padStart(2, "0")}`;
  }
  return "";
}
__name(parseAvbaseDate, "parseAvbaseDate");
function sortProductsDesc(products) {
  return [...products].sort(
    (a, b) => a.source < b.source ? 1 : a.source > b.source ? -1 : 0
  );
}
__name(sortProductsDesc, "sortProductsDesc");
function movieInfoFromWork(work) {
  const info = {
    id: joinPrefixID(work.prefix, work.work_id),
    number: work.work_id,
    title: "",
    summary: "",
    provider: "AVBASE",
    homepage: "",
    director: "",
    actors: [],
    thumb_url: "",
    cover_url: "",
    preview_video_url: "",
    preview_video_hls_url: "",
    preview_images: [],
    maker: "",
    label: "",
    series: "",
    genres: [],
    score: 0,
    runtime: 0,
    release_date: ""
  };
  for (const product of sortProductsDesc(work.products ?? [])) {
    if (!info.title) info.title = product.title ?? "";
    if (!info.cover_url) info.cover_url = product.image_url ?? "";
    if (!info.thumb_url) info.thumb_url = product.thumbnail_url ?? "";
    if (!info.maker) info.maker = product.maker?.name ?? "";
    if (!info.label) info.label = product.label?.name ?? "";
    if (!info.series) info.series = product.series?.name ?? "";
    if (!info.summary) info.summary = product.iteminfo?.description ?? "";
    if (!info.release_date) info.release_date = parseAvbaseDate(product.date);
    if (info.preview_images.length === 0) {
      for (const sample of product.sample_image_urls ?? []) {
        if (sample.l) info.preview_images.push(sample.l);
      }
    }
  }
  for (const genre of work.genres ?? []) {
    if (genre.name) info.genres.push(genre.name);
  }
  for (const cast of work.casts ?? []) {
    if (cast.actor?.name) info.actors.push(cast.actor.name);
  }
  return info;
}
__name(movieInfoFromWork, "movieInfoFromWork");
function searchResultsFromWorks(works) {
  const results = [];
  for (const work of works) {
    const products = sortProductsDesc(work.products ?? []);
    const chosen = products.find((p) => KNOWN_SOURCES.has(p.source));
    if (!chosen) continue;
    const result = {
      id: joinPrefixID(work.prefix, work.work_id),
      number: work.work_id,
      title: work.title ?? "",
      provider: "AVBASE",
      homepage: MOVIE_URL2 + work.work_id,
      actors: (work.actors ?? []).map((a) => a.name).filter(Boolean),
      thumb_url: chosen.thumbnail_url ?? "",
      cover_url: chosen.image_url ?? "",
      score: 0,
      release_date: parseAvbaseDate(work.min_date)
    };
    if (isValidSearchResult(result)) results.push(result);
  }
  return results;
}
__name(searchResultsFromWorks, "searchResultsFromWorks");
var buildIdCache = null;
var AvbaseProvider = class {
  static {
    __name(this, "AvbaseProvider");
  }
  name = "AVBASE";
  priority = 996;
  fanza = new FanzaProvider();
  normalizeMovieID(id) {
    const trimmed = id.trim();
    if (!trimmed.includes(":")) {
      return trimmed.toUpperCase();
    }
    const [prefix, workID] = trimmed.split(":", 2);
    return joinPrefixID(prefix, workID);
  }
  parseMovieIDFromURL(rawURL) {
    try {
      const base = new URL(rawURL).pathname.split("/").filter(Boolean).pop();
      return base ? this.normalizeMovieID(decodeURIComponent(base)) : null;
    } catch {
      return null;
    }
  }
  async getMovieInfoByID(id) {
    const normalized = this.normalizeMovieID(id);
    if (!normalized) {
      throw new ProviderError("invalid id", "invalid");
    }
    return this.getMovieInfoByURL(MOVIE_URL2 + normalized);
  }
  async getMovieInfoByURL(rawURL) {
    const id = this.parseMovieIDFromURL(rawURL);
    if (!id) {
      throw new ProviderError(`cannot parse work id from url: ${rawURL}`, "invalid");
    }
    const work = await this.fetchWork(id);
    if (!work) {
      throw new ProviderError(`work not found: ${id}`, "not_found");
    }
    const workInfo = movieInfoFromWork(work);
    let info = null;
    for (const product of sortProductsDesc(work.products ?? [])) {
      if (product.source !== "fanza") continue;
      try {
        const src = await this.fanza.getMovieInfoByID(product.product_id);
        if (isValidMovieInfo(src)) {
          info = src;
          break;
        }
      } catch {
      }
    }
    if (info) {
      if (!info.maker) info.maker = workInfo.maker;
      if (!info.label) info.label = workInfo.label;
      if (!info.series) info.series = workInfo.series;
      if (!info.summary) info.summary = workInfo.summary;
      if (info.genres.length === 0) info.genres = workInfo.genres;
      if (workInfo.actors.length > 0) info.actors = workInfo.actors;
      if (workInfo.number) info.number = workInfo.number;
    } else {
      info = workInfo;
    }
    let finalID = id;
    if (workInfo.id.length > id.length && workInfo.id.includes(":")) {
      finalID = workInfo.id;
    }
    info.id = finalID;
    info.provider = this.name;
    info.homepage = rawURL;
    if (!isValidMovieInfo(info)) {
      throw new ProviderError(`incomplete metadata: ${id}`, "not_found");
    }
    return info;
  }
  normalizeMovieKeyword(keyword) {
    if (isUncensored(keyword) || isFC2(keyword)) {
      return "";
    }
    return keyword.toUpperCase();
  }
  async searchMovie(keyword) {
    const data = await this.fetchDataJSON(
      (buildId) => `https://www.avbase.net/_next/data/${buildId}/works.json?q=${encodeURIComponent(keyword)}`
    );
    const works = data?.pageProps?.works ?? [];
    return searchResultsFromWorks(works);
  }
  async fetchWork(id) {
    const data = await this.fetchDataJSON(
      (buildId) => `https://www.avbase.net/_next/data/${buildId}/works/${id}.json?id=${encodeURIComponent(id)}`,
      true
    );
    return data?.pageProps?.work ?? null;
  }
  /**
   * Fetch a _next/data JSON document. On a 404 the cached buildId may be
   * stale (AVBase redeployed) — invalidate it and retry once with a fresh
   * one. (The Go version just fails; this keeps the port self-healing.)
   */
  async fetchDataJSON(buildURL, nullOn404 = false) {
    for (let attempt = 0; attempt < 2; attempt++) {
      const buildId = await this.getBuildId();
      let resp;
      try {
        resp = await fetch(buildURL(buildId), {
          headers: { "User-Agent": UA, Referer: BASE_URL2 }
        });
      } catch (e) {
        throw new ProviderError(`avbase fetch failed: ${String(e)}`, "upstream");
      }
      if (resp.status === 404) {
        if (attempt === 0) {
          buildIdCache = null;
          continue;
        }
        if (nullOn404) return null;
        throw new ProviderError("avbase: not found", "not_found");
      }
      if (!resp.ok) {
        throw new ProviderError(`avbase http ${resp.status}`, "upstream");
      }
      return await resp.json();
    }
    return null;
  }
  async getBuildId() {
    if (buildIdCache && Date.now() - buildIdCache.at < BUILD_ID_TTL_MS) {
      return buildIdCache.id;
    }
    let resp;
    try {
      resp = await fetch(BASE_URL2, { headers: { "User-Agent": UA } });
    } catch (e) {
      throw new ProviderError(`avbase homepage fetch failed: ${String(e)}`, "upstream");
    }
    if (!resp.ok) {
      throw new ProviderError(`avbase homepage http ${resp.status}`, "upstream");
    }
    const html = await resp.text();
    const anchor = html.indexOf("__NEXT_DATA__");
    let m = null;
    if (anchor >= 0) {
      const end = html.indexOf("<\/script>", anchor);
      const block = html.slice(anchor, end > anchor ? end : void 0);
      m = /"buildId":"([^"]+)"/.exec(block);
    }
    if (!m) {
      throw new ProviderError("avbase: buildId not found", "upstream");
    }
    buildIdCache = { id: m[1], at: Date.now() };
    return m[1];
  }
};

// src/providers/av-league.ts
var ACTOR_URL = "https://www.av-league.com/actress/";
var SEARCH_URL2 = "https://www.av-league.com/search/search.php?k=";
var UA2 = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";
function parseAvlDate(s) {
  const full = /(\d{4})年\s*(\d{1,2})月\s*(\d{1,2})日/.exec(s);
  if (full) {
    return `${full[1]}-${full[2].padStart(2, "0")}-${full[3].padStart(2, "0")}`;
  }
  const iso = /(\d{4})[-/](\d{1,2})[-/](\d{1,2})/.exec(s);
  if (iso) {
    return `${iso[1]}-${iso[2].padStart(2, "0")}-${iso[3].padStart(2, "0")}`;
  }
  const year = /(\d{4})年/.exec(s);
  if (year) {
    return `${year[1]}-02-02`;
  }
  return "";
}
__name(parseAvlDate, "parseAvlDate");
function parseMeasurements(s) {
  let b = 0;
  let w = 0;
  let h = 0;
  let cup = "";
  for (const item of s.split("/")) {
    const idx = item.indexOf(":");
    if (idx < 0) continue;
    const name = item.slice(0, idx).trim();
    const data = item.slice(idx + 1);
    if (name === "B") {
      const m = /(\d+)（([A-Z])）/.exec(data);
      if (m) {
        b = parseInt(m[1], 10);
        cup = m[2];
      }
    } else if (name === "W") {
      w = parseInt(data, 10) || 0;
    } else if (name === "H") {
      h = parseInt(data, 10) || 0;
    }
  }
  return {
    measurements: b !== 0 && w !== 0 && h !== 0 ? `B:${b} / W:${w} / H:${h}` : "",
    cupSize: cup
  };
}
__name(parseMeasurements, "parseMeasurements");
function applyProfileRow(info, label, data) {
  if (data === "\u4E0D\u660E") return;
  switch (label) {
    case "3\u30B5\u30A4\u30BA": {
      const { measurements, cupSize } = parseMeasurements(data);
      if (measurements) info.measurements = measurements;
      info.cup_size = cupSize;
      break;
    }
    case "\u8EAB\u9577":
      info.height = parseInt(data.replace(/cm$/, ""), 10) || 0;
      break;
    case "\u8840\u6DB2\u578B":
      info.blood_type = data.replace(/型$/, "").trim();
      break;
    case "\u751F\u5E74\u6708\u65E5":
      info.birthday = parseAvlDate(data);
      break;
    case "\u51FA\u8EAB":
      info.nationality = data;
      break;
    case "\u30C7\u30D3\u30E5\u30FC":
      info.debut_date = parseAvlDate(data);
      break;
  }
}
__name(applyProfileRow, "applyProfileRow");
function emptyActorInfo(id, homepage) {
  return {
    id,
    name: "",
    provider: "AV-LEAGUE",
    homepage,
    summary: "",
    hobby: "",
    skill: "",
    blood_type: "",
    cup_size: "",
    measurements: "",
    nationality: "",
    height: 0,
    aliases: [],
    images: [],
    birthday: "",
    debut_date: ""
  };
}
__name(emptyActorInfo, "emptyActorInfo");
async function parseAvleagueActorPage(html, pageURL, id) {
  const info = emptyActorInfo(id, pageURL);
  let ogImage = "";
  let nameText = "";
  let profText = "";
  let pendingLabel = null;
  let thText = "";
  let tdText = "";
  const rewriter = new HTMLRewriter().on("#pan span", {
    text(t) {
      nameText += t.text;
    }
  }).on("#j-prof span", {
    text(t) {
      profText += t.text;
    }
  }).on("#contents .i-pic-box img", {
    element(el) {
      const src = el.getAttribute("src");
      if (src) info.images.push(new URL(src, pageURL).toString());
    }
  }).on('meta[property="og:image"]', {
    element(el) {
      ogImage = el.getAttribute("content") ?? "";
    }
  }).on("#contents table th", {
    text(t) {
      thText += t.text;
      if (t.lastInTextNode) {
        pendingLabel = thText.trim();
        thText = "";
      }
    }
  }).on("#contents table td", {
    text(t) {
      tdText += t.text;
      if (t.lastInTextNode) {
        if (pendingLabel !== null) {
          applyProfileRow(info, pendingLabel, tdText.trim());
          pendingLabel = null;
        }
        tdText = "";
      }
    }
  });
  await rewriter.transform(new Response(html)).text();
  info.name = nameText.trim();
  const cut = profText.indexOf(":");
  if (cut >= 0 && profText.slice(0, cut).includes("\u5225\u540D")) {
    for (const alias of profText.slice(cut + 1).split("\u3001")) {
      const a = alias.trim();
      if (a) info.aliases.push(a);
    }
  }
  if (info.images.length === 0 && ogImage) {
    info.images.push(new URL(ogImage, pageURL).toString());
  }
  return info;
}
__name(parseAvleagueActorPage, "parseAvleagueActorPage");
async function parseAvleagueSearchPage(html, pageURL) {
  const results = [];
  let picHref = "";
  let picImg = "";
  let nameHref = "";
  let nameText = "";
  const flush = /* @__PURE__ */ __name(() => {
    const href = nameHref || picHref;
    if (href && nameText.trim()) {
      const homepage = new URL(href, pageURL).toString();
      const id = parseIDFromHomepage(homepage);
      if (id) {
        results.push({
          id,
          name: nameText.trim(),
          provider: "AV-LEAGUE",
          homepage,
          aliases: [],
          images: picImg ? [new URL(picImg, pageURL).toString()] : []
        });
      }
    }
    picHref = "";
    picImg = "";
    nameHref = "";
    nameText = "";
  }, "flush");
  const rewriter = new HTMLRewriter().on(".l-pic a", {
    element(el) {
      if (nameHref || nameText) flush();
      picHref = el.getAttribute("href") ?? "";
    }
  }).on(".l-pic a img", {
    element(el) {
      picImg = el.getAttribute("data-layzr") || el.getAttribute("src") || "";
    }
  }).on(".l-name a", {
    element(el) {
      nameHref = el.getAttribute("href") ?? "";
    },
    text(t) {
      nameText += t.text;
      if (t.lastInTextNode) flush();
    }
  });
  await rewriter.transform(new Response(html)).text();
  flush();
  return results.filter(isValidActorSearchResult);
}
__name(parseAvleagueSearchPage, "parseAvleagueSearchPage");
function parseIDFromHomepage(homepage) {
  try {
    const base = new URL(homepage).pathname.split("/").filter(Boolean).pop() ?? "";
    return base.replace(/\.[^.]*$/, "");
  } catch {
    return "";
  }
}
__name(parseIDFromHomepage, "parseIDFromHomepage");
var AvleagueProvider = class {
  static {
    __name(this, "AvleagueProvider");
  }
  name = "AV-LEAGUE";
  priority = 1e3;
  normalizeActorID(id) {
    return id.trim();
  }
  parseActorIDFromURL(rawURL) {
    const id = parseIDFromHomepage(rawURL);
    return id ? this.normalizeActorID(decodeURIComponent(id)) : null;
  }
  async getActorInfoByID(id) {
    const normalized = this.normalizeActorID(id);
    if (!normalized) {
      throw new ProviderError("invalid id", "invalid");
    }
    return this.getActorInfoByURL(`${ACTOR_URL}${normalized}.html`);
  }
  async getActorInfoByURL(rawURL) {
    const id = this.parseActorIDFromURL(rawURL);
    if (!id) {
      throw new ProviderError(`cannot parse actor id from url: ${rawURL}`, "invalid");
    }
    let resp;
    try {
      resp = await fetch(rawURL, { headers: { "User-Agent": UA2 } });
    } catch (e) {
      throw new ProviderError(`av-league fetch failed: ${String(e)}`, "upstream");
    }
    if (resp.status === 404) {
      throw new ProviderError(`actor not found: ${id}`, "not_found");
    }
    if (!resp.ok) {
      throw new ProviderError(`av-league http ${resp.status}`, "upstream");
    }
    const info = await parseAvleagueActorPage(await resp.text(), rawURL, id);
    if (!info.name) {
      throw new ProviderError(`actor not found: ${id}`, "not_found");
    }
    return info;
  }
  async searchActor(keyword) {
    const url = SEARCH_URL2 + encodeURIComponent(keyword);
    let resp;
    try {
      resp = await fetch(url, { headers: { "User-Agent": UA2 } });
    } catch (e) {
      throw new ProviderError(`av-league search failed: ${String(e)}`, "upstream");
    }
    if (!resp.ok) {
      throw new ProviderError(`av-league search http ${resp.status}`, "upstream");
    }
    return parseAvleagueSearchPage(await resp.text(), url);
  }
};

// src/lib/scrape.ts
var UA3 = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";
async function fetchText(url, opts = {}) {
  const headers = { "User-Agent": UA3 };
  if (opts.cookie) headers["Cookie"] = opts.cookie;
  if (opts.referer) headers["Referer"] = opts.referer;
  if (opts.contentType) headers["Content-Type"] = opts.contentType;
  let resp;
  try {
    resp = await fetch(url, {
      method: opts.method ?? "GET",
      headers,
      body: opts.body,
      redirect: opts.redirect ?? "follow",
      signal: opts.timeoutMs ? AbortSignal.timeout(opts.timeoutMs) : void 0
    });
  } catch (e) {
    throw new ProviderError(
      `${opts.providerName ?? "fetch"} failed: ${String(e)}`,
      "upstream"
    );
  }
  const buf = await resp.arrayBuffer();
  return { status: resp.status, text: decodeBody(buf, resp.headers), url: resp.url, headers: resp.headers };
}
__name(fetchText, "fetchText");
function decodeBody(buf, headers) {
  let label = "";
  const ct = headers?.get("content-type") ?? "";
  const fromHeader = /charset=([a-zA-Z0-9_-]+)/.exec(ct);
  if (fromHeader) label = fromHeader[1];
  if (!label) {
    const head = new TextDecoder("utf-8").decode(buf.slice(0, 4096));
    const fromMeta = /charset=["']?([a-zA-Z0-9_-]+)/i.exec(head);
    if (fromMeta) label = fromMeta[1];
  }
  if (label && !/^utf-?8$/i.test(label)) {
    try {
      return new TextDecoder(label).decode(buf);
    } catch {
    }
  }
  return new TextDecoder("utf-8").decode(buf);
}
__name(decodeBody, "decodeBody");
async function fetchPage(url, opts = {}) {
  const r = await fetchText(url, opts);
  if (r.status === 404) {
    throw new ProviderError(opts.notFoundMessage ?? `not found: ${url}`, "not_found");
  }
  if (r.status < 200 || r.status >= 300) {
    throw new ProviderError(`http ${r.status} for ${url}`, "upstream");
  }
  return r;
}
__name(fetchPage, "fetchPage");
function absURL(base, rel) {
  if (!rel) return "";
  try {
    return new URL(rel, base).toString();
  } catch {
    return rel;
  }
}
__name(absURL, "absURL");
function baseMovieInfo(provider, id, homepage) {
  return {
    id,
    number: "",
    title: "",
    summary: "",
    provider,
    homepage,
    director: "",
    actors: [],
    thumb_url: "",
    cover_url: "",
    preview_video_url: "",
    preview_video_hls_url: "",
    preview_images: [],
    maker: "",
    label: "",
    series: "",
    genres: [],
    score: 0,
    runtime: 0,
    release_date: ""
  };
}
__name(baseMovieInfo, "baseMovieInfo");
function parseDateLoose(s) {
  if (!s) return "";
  const jp = /(\d{4})年\s*(\d{1,2})月\s*(\d{1,2})日/.exec(s);
  if (jp) return `${jp[1]}-${jp[2].padStart(2, "0")}-${jp[3].padStart(2, "0")}`;
  const iso = /(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/.exec(s);
  if (iso) return `${iso[1]}-${iso[2].padStart(2, "0")}-${iso[3].padStart(2, "0")}`;
  const en = /([A-Za-z]+)\s+(\d{1,2}),\s*(\d{4})|(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})/.exec(s);
  if (en) {
    const months = {
      january: 1,
      february: 2,
      march: 3,
      april: 4,
      may: 5,
      june: 6,
      july: 7,
      august: 8,
      september: 9,
      october: 10,
      november: 11,
      december: 12,
      jan: 1,
      feb: 2,
      mar: 3,
      apr: 4,
      jun: 6,
      jul: 7,
      aug: 8,
      sep: 9,
      sept: 9,
      oct: 10,
      nov: 11,
      dec: 12
    };
    const mon = months[(en[1] ?? en[5]).toLowerCase()];
    if (mon) {
      const day = (en[2] ?? en[4]).padStart(2, "0");
      return `${en[3] ?? en[6]}-${String(mon).padStart(2, "0")}-${day}`;
    }
  }
  return "";
}
__name(parseDateLoose, "parseDateLoose");
function extractJsonLd(html) {
  const out = [];
  const re = /<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi;
  for (const m of html.matchAll(re)) {
    try {
      const data = JSON.parse(m[1].replace(/\n/g, ""));
      if (Array.isArray(data)) {
        for (const d of data) {
          if (d && typeof d === "object") out.push(d);
        }
      } else if (data && typeof data === "object") {
        out.push(data);
      }
    } catch {
    }
  }
  return out;
}
__name(extractJsonLd, "extractJsonLd");
function decodeEntities(s) {
  return s.replace(/\u0000/g, "").replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCodePoint(parseInt(h, 16))).replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(parseInt(d, 10))).replace(/&nbsp;/g, "\xA0").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
}
__name(decodeEntities, "decodeEntities");
async function collectFields(html, specs) {
  const out = {};
  let rw = new HTMLRewriter();
  for (const spec of specs) {
    if (spec.mode === "text") out[spec.key] = "";
    else if (spec.mode === "attr") out[spec.key] = "";
    else out[spec.key] = [];
    rw = rw.on(spec.selector, {
      element(el) {
        if (spec.mode === "attr") {
          if (out[spec.key] === "") {
            out[spec.key] = el.getAttribute(spec.attr ?? "") ?? "";
          }
        } else if (spec.mode === "attrs") {
          const v = el.getAttribute(spec.attr ?? "");
          if (v !== null) out[spec.key].push(v);
        }
      },
      text(t) {
        if (spec.mode === "text") {
          out[spec.key] = out[spec.key] + decodeEntities(t.text);
        } else if (spec.mode === "texts") {
          const v = decodeEntities(t.text).trim();
          if (v) out[spec.key].push(v);
        }
      }
    });
  }
  await rw.transform(new Response(html)).text();
  if (typeof out.__dummy === "string") delete out.__dummy;
  return out;
}
__name(collectFields, "collectFields");
async function collectPairsSeq(html, cellSelector) {
  const cells = [];
  let cur = null;
  const rw = new HTMLRewriter().on(cellSelector, {
    element() {
      cur = { text: "", texts: [], linkBuf: "", linkDone: false };
      cells.push(cur);
    },
    text(t) {
      if (!cur) return;
      cur.text += decodeEntities(t.text);
      const v = decodeEntities(t.text).trim();
      if (v) cur.texts.push(v);
    }
  }).on(`${cellSelector} a`, {
    text(t) {
      if (cur && !cur.linkDone) {
        cur.linkBuf += decodeEntities(t.text);
        if (t.lastInTextNode) cur.linkDone = true;
      }
    }
  });
  await rw.transform(new Response(html)).text();
  const rows = [];
  for (let i = 0; i + 1 < cells.length; i += 2) {
    rows.push({
      label: cells[i].text.trim(),
      value: cells[i + 1].text.trim(),
      valueTexts: cells[i + 1].texts,
      valueFirstLink: cells[i + 1].linkBuf.trim()
    });
  }
  return rows;
}
__name(collectPairsSeq, "collectPairsSeq");
async function collectPairs(html, labelSelector, valueSelector) {
  const rows = [];
  let cur = null;
  const flush = /* @__PURE__ */ __name(() => {
    if (cur) {
      cur.label = cur.label.trim();
      cur.value = cur.value.trim();
      cur.valueFirstLink = cur.linkBuf.trim();
      rows.push(cur);
      cur = null;
    }
  }, "flush");
  const linkSelector = `${valueSelector} a`;
  const rw = new HTMLRewriter().on("tr", {
    element() {
      flush();
    }
  }).on(labelSelector, {
    element() {
      flush();
      cur = { label: "", value: "", valueTexts: [], valueFirstLink: "", linkBuf: "", linkDone: false };
    },
    text(t) {
      if (cur) cur.label += decodeEntities(t.text);
    }
  }).on(valueSelector, {
    text(t) {
      if (!cur) return;
      cur.value += decodeEntities(t.text);
      const v = decodeEntities(t.text).trim();
      if (v) cur.valueTexts.push(v);
    }
  }).on(linkSelector, {
    text(t) {
      if (cur && !cur.linkDone) {
        cur.linkBuf += decodeEntities(t.text);
        if (t.lastInTextNode) cur.linkDone = true;
      }
    }
  });
  await rw.transform(new Response(html)).text();
  flush();
  return rows;
}
__name(collectPairs, "collectPairs");

// src/providers/pondo-core.ts
function sprintf(template, ...args) {
  let i = 0;
  return template.replace(/%s/g, () => args[i++] ?? "");
}
__name(sprintf, "sprintf");
function parsePondoDetail(data, detailURL, cfg, homepage) {
  const info = baseMovieInfo(cfg.name, data.MovieID ?? "", homepage);
  info.number = data.MovieID ?? "";
  info.title = data.Title ?? "";
  info.summary = data.Desc ?? "";
  info.series = data.Series ?? "";
  info.maker = cfg.maker;
  info.release_date = parseDateLoose(data.Release);
  info.runtime = Math.floor((data.Duration ?? 0) / 60);
  if (typeof data.AvgRating === "number" && data.AvgRating <= 5) {
    info.score = data.AvgRating;
  }
  if (data.UCNAME && data.UCNAME.length > 0) info.genres = data.UCNAME;
  for (const actor of data.ActressesJa ?? []) {
    const a = actor.replace(/^-+|-+$/g, "");
    if (a) info.actors.push(a);
  }
  if (data.SampleFiles && data.SampleFiles.length > 0) {
    const sorted = [...data.SampleFiles].sort((a, b) => a.FileSize - b.FileSize);
    info.preview_video_url = absURL(detailURL, sorted[sorted.length - 1].URL);
    info.preview_video_hls_url = sprintf(cfg.sampleVideoURL, data.MovieID ?? "");
  }
  for (const thumb of [data.ThumbUltra, data.ThumbHigh, data.ThumbMed, data.ThumbLow]) {
    if (thumb) {
      const fixed = thumb.replace(/^https?:\/\/\//, "/");
      info.cover_url = absURL(detailURL, fixed);
      info.thumb_url = info.cover_url;
      break;
    }
  }
  if (data.MovieThumb) {
    info.thumb_url = absURL(detailURL, data.MovieThumb);
  }
  return info;
}
__name(parsePondoDetail, "parsePondoDetail");
function makePondoProvider(cfg) {
  const provider = {
    name: cfg.name,
    priority: cfg.priority,
    normalizeMovieID(id) {
      const t = id.trim();
      return cfg.idPattern.test(t) ? t : "";
    },
    parseMovieIDFromURL(rawURL) {
      try {
        const parts = new URL(rawURL).pathname.split("/").filter(Boolean);
        const base = parts[parts.length - 1] ?? "";
        return base ? decodeURIComponent(base) : null;
      } catch {
        return null;
      }
    },
    async getMovieInfoByID(id) {
      const normalized = provider.normalizeMovieID(id);
      if (!normalized) throw new ProviderError(`invalid id: ${id}`, "invalid");
      return provider.getMovieInfoByURL(sprintf(cfg.movieURL, normalized));
    },
    async getMovieInfoByURL(rawURL) {
      const id = provider.parseMovieIDFromURL(rawURL);
      if (!id) throw new ProviderError(`cannot parse id from url: ${rawURL}`, "invalid");
      const homepage = sprintf(cfg.movieURL, id);
      const detailURL = new URL(
        `/dyn/phpauto/movie_details/movie_id/${id}.json`,
        homepage
      ).toString();
      const r = await fetchPage(detailURL, {
        providerName: cfg.name,
        notFoundMessage: `movie not found: ${id}`
      });
      let data;
      try {
        data = JSON.parse(r.text);
      } catch {
        throw new ProviderError(`bad detail json: ${id}`, "not_found");
      }
      if (!data.MovieID) {
        throw new ProviderError(`movie not found: ${id}`, "not_found");
      }
      const info = parsePondoDetail(data, detailURL, cfg, homepage);
      try {
        if (data.Gallery && cfg.galleryPath) {
          const gURL = new URL(`/dyn/dla/json/movie_gallery/${id}.json`, homepage).toString();
          const g = await fetchPage(gURL, { providerName: cfg.name });
          const galleries = JSON.parse(g.text);
          for (const row of galleries.Rows ?? []) {
            if (!row.Protected) {
              info.preview_images.push(absURL(gURL, sprintf(cfg.galleryPath, row.Img)));
            }
          }
        } else if (data.HasGallery && cfg.legacyGalleryPath) {
          const gURL = new URL(
            `/dyn/phpauto/movie_galleries/movie_id/${id}.json`,
            homepage
          ).toString();
          const g = await fetchPage(gURL, { providerName: cfg.name });
          const galleries = JSON.parse(g.text);
          for (const row of galleries.Rows ?? []) {
            if (!row.Protected) {
              info.preview_images.push(
                absURL(gURL, sprintf(cfg.legacyGalleryPath, row.MovieID, row.Filename))
              );
            }
          }
        }
      } catch {
      }
      if (!isValidMovieInfo(info)) {
        throw new ProviderError(`incomplete metadata: ${id}`, "not_found");
      }
      return info;
    }
  };
  return provider;
}
__name(makePondoProvider, "makePondoProvider");
var pondoConfigs = [
  {
    name: "1Pondo",
    priority: 1e3,
    baseURL: "https://www.1pondo.tv/",
    movieURL: "https://www.1pondo.tv/movies/%s/",
    sampleVideoURL: "https://fms.1pondo.tv/sample/%s/mb.m3u8",
    maker: "\u4E00\u672C\u9053",
    galleryPath: "/dyn/dla/images/%s",
    legacyGalleryPath: "/assets/sample/%s/popu/%s",
    idPattern: /^\d{6}_\d{3}$/
  },
  {
    name: "10musume",
    priority: 1e3,
    baseURL: "https://www.10musume.com/",
    movieURL: "https://www.10musume.com/movies/%s/",
    sampleVideoURL: "https://fms.10musume.com/sample/%s/mb.m3u8",
    maker: "\u5929\u7136\u3080\u3059\u3081",
    galleryPath: "/dyn/dla/images/%s",
    legacyGalleryPath: "/assets/sample/%s/%s",
    idPattern: /^\d{6}_\d{2}$/
  },
  {
    name: "PACOPACOMAMA",
    priority: 999,
    baseURL: "https://www.pacopacomama.com/",
    movieURL: "https://www.pacopacomama.com/movies/%s/",
    sampleVideoURL: "https://fms.pacopacomama.com/sample/%s/mb.m3u8",
    maker: "\u30D1\u30B3\u30D1\u30B3\u30DE\u30DE",
    galleryPath: "/dyn/dla/images/%s",
    legacyGalleryPath: "/assets/sample/%s/l/%s",
    idPattern: /^\d{6}_\d{3}$/
  },
  {
    name: "MURAMURA",
    priority: 999,
    baseURL: "https://www.muramura.tv/",
    movieURL: "https://www.muramura.tv/movies/%s/",
    sampleVideoURL: "https://fms.muramura.tv/sample/%s/mb.m3u8",
    maker: "\u30E0\u30E9\u30E0\u30E9\u3063\u3066\u304F\u308B\u7D20\u4EBA",
    galleryPath: "",
    legacyGalleryPath: "",
    idPattern: /^\d{6}_\d{3}$/
  }
];
var pondoProviders = pondoConfigs.map(makePondoProvider);

// src/providers/carib-core.ts
function idFromPath(pathname) {
  const parts = pathname.split("/").filter(Boolean);
  return parts.length >= 2 ? parts[parts.length - 2] : "";
}
__name(idFromPath, "idFromPath");
async function parseCaribPage(html, pageURL, cfg, id) {
  const info = baseMovieInfo(cfg.name, id, pageURL);
  info.number = id;
  info.maker = cfg.maker;
  const fields = await collectFields(html, [
    { key: "titleMain", selector: 'h1[itemprop="name"]', mode: "text" },
    { key: "summaryMain", selector: 'p[itemprop="description"]', mode: "text" },
    { key: "titleFallback", selector: "#moviepages h1", mode: "text" },
    { key: "summaryFallback", selector: "#moviepages p", mode: "text" },
    { key: "gallery", selector: "div.gallery-ratio > a", mode: "attrs", attr: "href" }
  ]);
  info.title = fields.titleMain.trim() || fields.titleFallback.trim();
  info.summary = fields.summaryMain.trim() || fields.summaryFallback.trim();
  for (const href of fields.gallery) {
    if (!href.includes("member")) {
      info.preview_images.push(absURL(pageURL, href));
    }
  }
  const rows = await collectPairsSeq(html, "#moviepages li > span");
  for (const row of rows) {
    switch (row.label) {
      case "\u51FA\u6F14":
        for (const actor of row.valueTexts) {
          const a = actor.replace(/^-+|-+$/g, "");
          if (a) info.actors.push(a);
        }
        break;
      case "\u914D\u4FE1\u65E5":
      case "\u8CA9\u58F2\u65E5":
        info.release_date = parseDateLoose(row.value);
        break;
      case "\u518D\u751F\u6642\u9593":
        info.runtime = parseRuntime(row.value);
        break;
      case "\u30B7\u30EA\u30FC\u30BA":
        info.series = row.valueFirstLink;
        break;
      case "\u30B9\u30BF\u30B8\u30AA":
        info.maker = row.valueFirstLink || info.maker;
        break;
      case "\u30BF\u30B0":
        info.genres = row.valueTexts;
        break;
      case "\u30E6\u30FC\u30B6\u30FC\u8A55\u4FA1":
        info.score = Array.from(row.value.trim()).length;
        break;
    }
  }
  const emimg = /emimg\s*=\s*'(.+?)';/.exec(html);
  const poster = /posterImage\s*=\s*'(.+?)'\+movie_id\+'(.+?)';/.exec(html);
  const movieObj = /Movie\s*=\s*(\{.+?\});/.exec(html);
  if (emimg) {
    info.thumb_url = absURL(pageURL, emimg[1]);
    info.cover_url = info.thumb_url;
  } else if (poster) {
    info.thumb_url = absURL(pageURL, poster[1] + id + poster[2]);
    info.cover_url = info.thumb_url;
  } else if (movieObj) {
    try {
      const data = JSON.parse(movieObj[1]);
      for (const sample of [data.sample_flash_url, data.sample_m_flash_url]) {
        if (sample) {
          info.preview_video_url = absURL(pageURL, sample);
          break;
        }
      }
    } catch {
    }
  }
  if (!info.release_date) {
    const m = /(\d{6})[-_]\d+/.exec(info.id);
    if (m) {
      const d = m[1];
      info.release_date = `20${d.slice(4, 6)}-${d.slice(0, 2)}-${d.slice(2, 4)}`;
    }
  }
  return info;
}
__name(parseCaribPage, "parseCaribPage");
function makeCaribProvider(cfg) {
  const provider = {
    name: cfg.name,
    priority: cfg.priority,
    normalizeMovieID(id) {
      const t = id.trim();
      return cfg.idPattern.test(t) ? t : "";
    },
    parseMovieIDFromURL(rawURL) {
      try {
        const id = idFromPath(new URL(rawURL).pathname);
        return id ? decodeURIComponent(id) : null;
      } catch {
        return null;
      }
    },
    async getMovieInfoByID(id) {
      const normalized = provider.normalizeMovieID(id);
      if (!normalized) throw new ProviderError(`invalid id: ${id}`, "invalid");
      return provider.getMovieInfoByURL(cfg.movieURL.replace("%s", normalized));
    },
    async getMovieInfoByURL(rawURL) {
      const id = provider.parseMovieIDFromURL(rawURL);
      if (!id) throw new ProviderError(`cannot parse id from url: ${rawURL}`, "invalid");
      const r = await fetchPage(rawURL, {
        providerName: cfg.name,
        notFoundMessage: `movie not found: ${id}`
      });
      const info = await parseCaribPage(r.text, rawURL, cfg, id);
      if (!isValidMovieInfo(info)) {
        throw new ProviderError(`incomplete metadata: ${id}`, "not_found");
      }
      return info;
    }
  };
  return provider;
}
__name(makeCaribProvider, "makeCaribProvider");
var caribConfigs = [
  {
    name: "Caribbeancom",
    priority: 1e3,
    baseURL: "https://www.caribbeancom.com/",
    movieURL: "https://www.caribbeancom.com/moviepages/%s/index.html",
    maker: "\u30AB\u30EA\u30D3\u30A2\u30F3\u30B3\u30E0",
    idPattern: /^\d{6}-\d{3}$/
  },
  {
    name: "CaribbeancomPR",
    priority: 999,
    baseURL: "https://www.caribbeancompr.com/",
    movieURL: "https://www.caribbeancompr.com/moviepages/%s/index.html",
    maker: "\u30AB\u30EA\u30D3\u30A2\u30F3\u30B3\u30E0\u30D7\u30EC\u30DF\u30A2\u30E0",
    idPattern: /^\d{6}_\d{3}$/
  }
];
var caribProviders = caribConfigs.map(makeCaribProvider);

// src/providers/site0930.ts
function idFromPath2(pathname) {
  const parts = pathname.split("/").filter(Boolean);
  return parts.length >= 2 ? parts[parts.length - 2] : "";
}
__name(idFromPath2, "idFromPath");
function str(v) {
  return typeof v === "string" ? v : "";
}
__name(str, "str");
async function parse0930Page(html, pageURL, cfg, id) {
  const info = baseMovieInfo(cfg.name, id, pageURL);
  info.number = `${cfg.name.toLowerCase()}-${id}`;
  info.maker = cfg.maker;
  for (const block of extractJsonLd(html)) {
    const video = block["video"] ?? {};
    const released = block["releasedEvent"] ?? {};
    const rating = block["aggregateRating"] ?? {};
    if (!str(block["name"]) && !str(video["duration"])) continue;
    info.title = str(block["name"]);
    info.summary = str(block["description"]);
    if (str(block["image"])) {
      info.cover_url = absURL(pageURL, str(block["image"]));
      info.thumb_url = info.cover_url;
    }
    info.release_date = parseDateLoose(str(released["startDate"]));
    info.runtime = parseRuntime(str(video["duration"]));
    info.score = parseScore(str(rating["ratingValue"]));
    if (str(video["provider"])) info.maker = str(video["provider"]);
    if (str(video["actor"])) info.actors = [str(video["actor"])];
    break;
  }
  const fields = await collectFields(html, [
    { key: "playTitle", selector: "#moviePlay .moviePlay_title h1 span", mode: "text" },
    { key: "poster", selector: "#movieContent", mode: "attr", attr: "poster" },
    { key: "videoSrc", selector: "#movieContent source", mode: "attr", attr: "src" },
    { key: "galleryScripts", selector: "#movieGallery script", mode: "text" }
  ]);
  const playTitle = fields.playTitle.trim();
  if (playTitle) info.title = playTitle;
  const poster = fields.poster;
  if (poster) {
    info.cover_url = absURL(pageURL, poster);
    info.thumb_url = info.cover_url;
  }
  const videoSrc = fields.videoSrc;
  if (videoSrc) info.preview_video_url = absURL(pageURL, videoSrc);
  for (const m of fields.galleryScripts.matchAll(/href="(.+?)"/g)) {
    if (!m[1].includes("member")) info.preview_images.push(m[1]);
  }
  const rows = await collectPairs(html, "#movieInfo dt", "#movieInfo dd");
  for (const row of rows) {
    switch (row.label) {
      case "\u52D5\u753B":
        if (info.runtime === 0) info.runtime = parseRuntime(row.value);
        break;
      case "\u516C\u958B\u65E5":
        if (!info.release_date) info.release_date = parseDateLoose(row.value);
        break;
      case "\u30D7\u30EC\u30A4\u5185\u5BB9":
        for (const genre of row.value.split("\xA0")) {
          const g = genre.trim();
          if (g) info.genres.push(g);
        }
        break;
    }
  }
  return info;
}
__name(parse0930Page, "parse0930Page");
function make0930Provider(cfg) {
  const movieURL = `${cfg.baseURL}moviepages/%s/index.html`;
  const idRe = new RegExp(`^(?:${cfg.name}[-_])?([a-z\\d]+)$`, "i");
  const provider = {
    name: cfg.name,
    priority: 1e3,
    normalizeMovieID(id) {
      const m = idRe.exec(id.trim());
      return m ? m[1].toLowerCase() : "";
    },
    parseMovieIDFromURL(rawURL) {
      try {
        const id = idFromPath2(new URL(rawURL).pathname);
        return id ? decodeURIComponent(id) : null;
      } catch {
        return null;
      }
    },
    async getMovieInfoByID(id) {
      const normalized = provider.normalizeMovieID(id);
      if (!normalized) throw new ProviderError(`invalid id: ${id}`, "invalid");
      return provider.getMovieInfoByURL(movieURL.replace("%s", normalized));
    },
    async getMovieInfoByURL(rawURL) {
      const id = provider.parseMovieIDFromURL(rawURL);
      if (!id) throw new ProviderError(`cannot parse id from url: ${rawURL}`, "invalid");
      const r = await fetchPage(rawURL, {
        providerName: cfg.name,
        notFoundMessage: `movie not found: ${id}`
      });
      const info = await parse0930Page(r.text, rawURL, cfg, id);
      if (!isValidMovieInfo(info)) {
        throw new ProviderError(`incomplete metadata: ${id}`, "not_found");
      }
      return info;
    }
  };
  return provider;
}
__name(make0930Provider, "make0930Provider");
var site0930Configs = [
  { name: "C0930", baseURL: "https://www.c0930.com/", maker: "\u4EBA\u59BB\u65AC\u308A" },
  { name: "H0930", baseURL: "https://www.h0930.com/", maker: "\u30A8\u30C3\u30C1\u306A0930" },
  { name: "H4610", baseURL: "https://www.h4610.com/", maker: "\u30A8\u30C3\u30C1\u306A4610" }
];
var site0930Providers = site0930Configs.map(make0930Provider);

// src/providers/faleno-core.ts
var COOKIE = "modal=off";
async function parseFalenoPage(html, pageURL, cfg, id) {
  const info = baseMovieInfo(cfg.name, id, pageURL);
  info.number = parseIDToNumber(id);
  info.maker = cfg.name;
  info.label = cfg.name;
  const fields = await collectFields(html, [
    { key: "titleWorks", selector: "div.bar02_works > h1", mode: "text" },
    { key: "titlePlain", selector: "div.bar02 > h1", mode: "text" },
    { key: "cover", selector: "div.box_works01_img > a > img", mode: "attr", attr: "src" },
    { key: "video", selector: "div.box_works01_img > a", mode: "attr", attr: "href" },
    { key: "previews", selector: "div.box_works01_ga li a", mode: "attrs", attr: "href" },
    { key: "summary", selector: "div.box_works01_text", mode: "text" }
  ]);
  info.title = fields.titleWorks.trim() || fields.titlePlain.trim();
  const cover = fields.cover;
  if (cover) info.cover_url = absURL(pageURL, cover).split("?")[0];
  const video = fields.video;
  if (video) info.preview_video_url = absURL(pageURL, video);
  for (const href of fields.previews) {
    info.preview_images.push(absURL(pageURL, href));
  }
  const summary = fields.summary.trim();
  if (summary) info.summary = summary.replaceAll("\n", "<br />");
  const rows = await collectPairs(
    html,
    "div.box_works01_list li > span",
    "div.box_works01_list li > p"
  );
  for (const row of rows) {
    switch (row.label) {
      case "\u51FA\u6F14\u5973\u512A":
        info.actors = row.value.split("/").map((a) => a.trim()).filter(Boolean);
        break;
      case "\u53CE\u9332\u6642\u9593":
        info.runtime = parseRuntime(row.value);
        break;
      case "\u914D\u4FE1\u958B\u59CB\u65E5":
        info.release_date = parseDateLoose(row.value);
        break;
      case "\u767A\u58F2\u65E5":
        if (!info.release_date) info.release_date = parseDateLoose(row.value);
        break;
    }
  }
  return info;
}
__name(parseFalenoPage, "parseFalenoPage");
async function parseFalenoSearchPage(html, pageURL) {
  const cards = [];
  let cur = null;
  const flush = /* @__PURE__ */ __name(() => {
    if (cur) {
      cur.title = cur.titleBuf.trim().split("\n")[0].trim();
      const m = /発売開始\s*(\S+)/.exec(cur.liText);
      cur.dateText = m ? m[1] : "";
      cards.push(cur);
      cur = null;
    }
  }, "flush");
  const rw = new HTMLRewriter().on("div.box_kanren01 li", {
    element() {
      flush();
      cur = { homepage: "", cover: "", title: "", dateText: "", titleBuf: "", liText: "" };
    },
    text(t) {
      if (cur) cur.liText += t.text;
    }
  }).on("div.box_kanren01 li a", {
    element(el) {
      if (cur && !cur.homepage) cur.homepage = el.getAttribute("href") ?? "";
    }
  }).on("div.box_kanren01 li img", {
    element(el) {
      if (cur && !cur.cover) cur.cover = el.getAttribute("src") ?? "";
    }
  }).on("div.box_kanren01 li div.text_name a", {
    text(t) {
      if (cur) cur.titleBuf += t.text;
    }
  });
  await rw.transform(new Response(html)).text();
  flush();
  return cards;
}
__name(parseFalenoSearchPage, "parseFalenoSearchPage");
function makeFalenoProvider(cfg) {
  const provider = {
    name: cfg.name,
    priority: 995,
    normalizeMovieID(id) {
      return id.trim().toLowerCase();
    },
    parseMovieIDFromURL(rawURL) {
      try {
        const parts = new URL(rawURL).pathname.split("/").filter(Boolean);
        const base = parts[parts.length - 1] ?? "";
        return base ? provider.normalizeMovieID(decodeURIComponent(base)) : null;
      } catch {
        return null;
      }
    },
    async getMovieInfoByID(id) {
      const normalized = provider.normalizeMovieID(id);
      if (!normalized) throw new ProviderError("invalid id", "invalid");
      return provider.getMovieInfoByURL(cfg.movieURL.replace("%s", normalized));
    },
    async getMovieInfoByURL(rawURL) {
      const id = provider.parseMovieIDFromURL(rawURL);
      if (!id) throw new ProviderError(`cannot parse id from url: ${rawURL}`, "invalid");
      const r = await fetchPage(rawURL, {
        providerName: cfg.name,
        cookie: COOKIE,
        notFoundMessage: `movie not found: ${id}`
      });
      const info = await parseFalenoPage(r.text, rawURL, cfg, id);
      if (!isValidMovieInfo(info)) {
        throw new ProviderError(`incomplete metadata: ${id}`, "not_found");
      }
      return info;
    },
    normalizeMovieKeyword(keyword) {
      return keyword.toLowerCase().replaceAll("-", "");
    },
    async searchMovie(keyword) {
      const url = cfg.searchURL.replace("%s", encodeURIComponent(keyword));
      const r = await fetchText(url, {
        providerName: cfg.name,
        cookie: COOKIE,
        redirect: "manual"
      });
      const cards = await parseFalenoSearchPage(r.text, url);
      const results = [];
      for (const card of cards) {
        if (!card.homepage) continue;
        const homepage = absURL(url, card.homepage);
        const id = provider.parseMovieIDFromURL(homepage);
        if (!id) continue;
        const result = {
          id,
          number: parseIDToNumber(id),
          title: card.title,
          provider: cfg.name,
          homepage,
          actors: [],
          thumb_url: "",
          cover_url: card.cover ? absURL(url, card.cover) : "",
          score: 0,
          release_date: parseDateLoose(card.dateText)
        };
        if (isValidSearchResult(result)) results.push(result);
      }
      return results;
    }
  };
  return provider;
}
__name(makeFalenoProvider, "makeFalenoProvider");
var falenoConfigs = [
  {
    name: "DAHLIA",
    baseURL: "https://dahlia-av.jp/",
    movieURL: "https://dahlia-av.jp/works/%s/",
    searchURL: "https://dahlia-av.jp/?s=%s"
  },
  {
    name: "FALENO",
    baseURL: "https://faleno.jp/top/",
    movieURL: "https://faleno.jp/top/works/%s/",
    searchURL: "https://faleno.jp/top/?s=%s"
  }
];
var falenoProviders = falenoConfigs.map(makeFalenoProvider);

// src/providers/heyzo.ts
var MOVIE_URL3 = "https://www.heyzo.com/moviepages/%s/index.html";
var SAMPLE_URL = "https://www.heyzo.com/contents/%s/%s/%s";
function str2(v) {
  return typeof v === "string" ? v : "";
}
__name(str2, "str");
async function parseHeyzoPage(html, pageURL, id) {
  const info = baseMovieInfo("HEYZO", id, pageURL);
  info.number = `HEYZO-${id}`;
  info.maker = "HEYZO";
  for (const block of extractJsonLd(html)) {
    const video = block["video"] ?? {};
    const released = block["releasedEvent"] ?? {};
    const rating = block["aggregateRating"] ?? {};
    if (!str2(block["name"]) && !str2(video["duration"])) continue;
    info.title = str2(block["name"]);
    info.summary = str2(block["description"]);
    if (str2(block["image"])) {
      info.cover_url = absURL(pageURL, str2(block["image"]));
      info.thumb_url = info.cover_url;
    }
    info.release_date = parseDateLoose(str2(released["startDate"]));
    info.runtime = parseRuntime(str2(video["duration"]));
    info.score = parseScore(str2(rating["ratingValue"]));
    if (str2(video["provider"])) info.maker = str2(video["provider"]);
    if (str2(video["actor"])) info.actors = [str2(video["actor"])];
    break;
  }
  const fields = await collectFields(html, [
    { key: "h1", selector: "#movie h1", mode: "text" },
    { key: "memo", selector: "p.memo", mode: "text" },
    { key: "og", selector: 'meta[property="og:image"]', mode: "attr", attr: "content" },
    { key: "sampleScripts", selector: "div.sample-images script", mode: "text" },
    { key: "genres", selector: "ul.tag-keyword-list li a", mode: "texts" }
  ]);
  info.genres = [...new Set(fields.genres)];
  if (!info.title) {
    info.title = fields.h1.trim().split(/\s+/)[0] ?? "";
  }
  if (!info.summary) info.summary = fields.memo.trim();
  if (!info.cover_url && fields.og) {
    info.cover_url = absURL(pageURL, fields.og);
    info.thumb_url = info.cover_url;
  }
  for (const m of fields.sampleScripts.matchAll(
    /"(\/contents\/.+?\/\d+?\.\w+?)"/g
  )) {
    info.preview_images.push(absURL(pageURL, m[1]));
  }
  const rows = await collectPairsSeq(html, "table.movieInfo td");
  for (const row of rows) {
    switch (row.label) {
      case "\u516C\u958B\u65E5":
        info.release_date = parseDateLoose(row.value);
        break;
      case "\u51FA\u6F14":
        info.actors = row.valueTexts;
        break;
      case "\u30B7\u30EA\u30FC\u30BA":
        info.series = row.value.trim().replace(/^-+|-+$/g, "");
        break;
      case "\u8A55\u4FA1":
        info.score = parseScore(row.value);
        break;
    }
  }
  if (html.includes("emvideo")) {
    const m = /emvideo = "(.+?)";/.exec(html);
    if (m) info.preview_video_url = absURL(pageURL, m[1]);
  }
  if (html.includes("o = {")) {
    const m = /o = (\{.+?\});/.exec(html);
    if (m) {
      try {
        const data = JSON.parse(m[1]);
        if (data.full) info.runtime = parseRuntime(data.full);
      } catch {
      }
    }
  }
  const pc = /movieId\s*=\s*'(\d+?)';/.exec(html);
  const sc = /siteID\s*=\s*'(\d+?)';/.exec(html);
  const stream = /stream\s*=\s*'(.+?)'\+siteID\+'(.+?)'\+movieId\+'(.+?)';/.exec(html);
  if (pc && sc && stream) {
    try {
      const m3u8URL = absURL(pageURL, stream[1] + sc[1] + stream[2] + pc[1] + stream[3]);
      const playlist = await fetchText(m3u8URL, { providerName: "HEYZO" });
      if (playlist.status >= 200 && playlist.status < 300) {
        info.preview_video_hls_url = playlist.url;
        const mediaURI = pickBestMediaURI(playlist.text, playlist.url);
        if (mediaURI) {
          const m = /\/sample\/(\d+)\/(\d+)\/ts\.(.+?)\.m3u8/.exec(mediaURI);
          if (m) {
            info.preview_video_url = SAMPLE_URL.replace("%s", m[1]).replace("%s", m[2]).replace("%s", m[3]);
          }
        }
      }
    } catch {
    }
  }
  return info;
}
__name(parseHeyzoPage, "parseHeyzoPage");
function pickBestMediaURI(playlist, base) {
  const lines = playlist.split(/\r?\n/);
  let best = "";
  let bestBandwidth = -1;
  let pendingBandwidth = -1;
  for (const line of lines) {
    if (line.startsWith("#EXT-X-STREAM-INF")) {
      const m = /BANDWIDTH=(\d+)/.exec(line);
      pendingBandwidth = m ? parseInt(m[1], 10) : 0;
    } else if (line && !line.startsWith("#")) {
      if (pendingBandwidth > bestBandwidth) {
        bestBandwidth = pendingBandwidth;
        best = line.trim();
      }
      pendingBandwidth = -1;
    }
  }
  if (!best) {
    return base;
  }
  return absURL(base, best);
}
__name(pickBestMediaURI, "pickBestMediaURI");
var heyzoProvider = {
  name: "HEYZO",
  priority: 1e3,
  normalizeMovieID(id) {
    const m = /^(?:heyzo[-_])?(\d+)$/i.exec(id.trim());
    return m ? m[1] : "";
  },
  parseMovieIDFromURL(rawURL) {
    try {
      const parts = new URL(rawURL).pathname.split("/").filter(Boolean);
      const id = parts.length >= 2 ? parts[parts.length - 2] : "";
      return id ? decodeURIComponent(id) : null;
    } catch {
      return null;
    }
  },
  async getMovieInfoByID(id) {
    const normalized = heyzoProvider.normalizeMovieID(id);
    if (!normalized) throw new ProviderError(`invalid id: ${id}`, "invalid");
    return heyzoProvider.getMovieInfoByURL(
      MOVIE_URL3.replace("%s", normalized.padStart(4, "0"))
    );
  },
  async getMovieInfoByURL(rawURL) {
    const id = heyzoProvider.parseMovieIDFromURL(rawURL);
    if (!id) throw new ProviderError(`cannot parse id from url: ${rawURL}`, "invalid");
    const r = await fetchPage(rawURL, {
      providerName: "HEYZO",
      notFoundMessage: `movie not found: ${id}`
    });
    const info = await parseHeyzoPage(r.text, rawURL, id);
    if (!isValidMovieInfo(info)) {
      throw new ProviderError(`incomplete metadata: ${id}`, "not_found");
    }
    return info;
  }
};

// src/providers/heydouga.ts
var MOVIE_URL4 = "https://www.heydouga.com/moviepages/%s/%s/index.html";
var TAG_URL = "https://www.heydouga.com/get_movie_tag_all/";
var COOKIE2 = "lang=ja; over18_ppv=1; feature_group=1";
async function parseHeydougaPage(html, pageURL, id) {
  const info = baseMovieInfo("HeyDouga", id, pageURL);
  info.number = `HEYDOUGA-${id}`;
  const fields = await collectFields(html, [
    { key: "titleNodes", selector: "#title-bg h1", mode: "texts" },
    { key: "badges", selector: "#title-bg h1 span, #title-bg h1 a", mode: "texts" },
    { key: "ogTitle", selector: 'meta[property="og:title"]', mode: "attr", attr: "content" },
    { key: "summary", selector: "#movie-detail-mobile .movie-description p", mode: "text" },
    { key: "summaryDesktop", selector: "#movie-detail-desktop .movie-description p", mode: "text" },
    { key: "gallery", selector: "#movie-gallery-images a.fancybox", mode: "attrs", attr: "href" }
  ]);
  const badges = new Set(fields.badges);
  const titleNode = fields.titleNodes.find((t) => !badges.has(t)) ?? "";
  info.title = (titleNode || fields.ogTitle.trim()).replace(/\u00A0/g, " ").trim();
  const castPart = info.title.split(" - ")[0];
  if (castPart && castPart !== info.title) {
    const cast = castPart.split("\u3001").map((a) => a.trim()).filter(Boolean);
    if (cast.length >= 1 && cast.length <= 6 && cast.every((a) => a.length <= 20)) {
      info.actors = cast;
    }
  }
  info.summary = fields.summary.trim() || fields.summaryDesktop.trim();
  for (const href of fields.gallery) {
    const img = absURL(pageURL, href);
    if (href && !info.preview_images.includes(img)) info.preview_images.push(img);
  }
  const poster = /player_poster\s*=\s*"([^"]+)"/.exec(html) ?? /player_poster\s*=\s*'([^']+)'/.exec(html);
  if (poster) {
    info.cover_url = absURL(pageURL, poster[1]);
    info.thumb_url = info.cover_url;
  }
  const rows = await collectPairsSeq(html, "#movie-info li > span");
  for (const row of rows) {
    switch (row.label) {
      case "\u914D\u4FE1\u65E5\uFF1A":
        info.release_date = parseDateLoose(row.value);
        break;
      case "\u914D\u4FE1\u671F\u9593\uFF1A":
        info.release_date = parseDateLoose(row.value.split("\uFF5E")[0]);
        break;
      case "\u4E3B\u6F14\uFF1A":
        info.actors = row.value.split(/\s+/).filter(Boolean);
        break;
      case "\u63D0\u4F9B\u5143\uFF1A":
        info.maker = row.valueFirstLink || row.value.trim();
        break;
      case "\u52D5\u753B\u518D\u751F\u6642\u9593\uFF1A":
        info.runtime = parseRuntime(row.value);
        break;
    }
  }
  const hls = /source\s*=\s*'(.+\.m3.*?)';/.exec(html);
  if (hls) info.preview_video_hls_url = absURL(pageURL, hls[1]);
  return info;
}
__name(parseHeydougaPage, "parseHeydougaPage");
var heydougaProvider = {
  name: "HeyDouga",
  priority: 1e3,
  normalizeMovieID(id) {
    const m = /^(?:heydouga[-_])?(\d{4}-[a-z\d]+)$/i.exec(id.trim());
    return m ? m[1] : "";
  },
  parseMovieIDFromURL(rawURL) {
    try {
      const m = /\/(\d+)\/(\d+)\/index\.html/.exec(new URL(rawURL).pathname);
      return m ? `${m[1]}-${m[2]}` : null;
    } catch {
      return null;
    }
  },
  async getMovieInfoByID(id) {
    const normalized = heydougaProvider.normalizeMovieID(id);
    if (!normalized) throw new ProviderError(`invalid id: ${id}`, "invalid");
    const [a, b] = normalized.split("-", 2);
    return heydougaProvider.getMovieInfoByURL(
      MOVIE_URL4.replace("%s", a).replace("%s", b)
    );
  },
  async getMovieInfoByURL(rawURL) {
    const id = heydougaProvider.parseMovieIDFromURL(rawURL);
    if (!id) throw new ProviderError(`cannot parse id from url: ${rawURL}`, "invalid");
    const r = await fetchPage(rawURL, {
      providerName: "HeyDouga",
      cookie: COOKIE2,
      notFoundMessage: `movie not found: ${id}`
    });
    const info = await parseHeydougaPage(r.text, rawURL, id);
    try {
      const m = /url_get_movie_rating\s*=\s*"(.+?)";/.exec(r.text);
      if (m) {
        const rating = await fetchText(absURL(rawURL, m[1]), {
          providerName: "HeyDouga",
          cookie: COOKIE2
        });
        if (rating.status >= 200 && rating.status < 300) {
          const data = JSON.parse(rating.text);
          if (data.movie_rating_average) {
            info.score = parseScore(data.movie_rating_average);
          }
        }
      }
    } catch {
    }
    try {
      const pid = /provider_id\s*=\s*(\d+);/.exec(r.text);
      const seq = /data\s*:\s*\{\s*movie_seq\s*:\s*(\d+),/.exec(r.text);
      if (pid && seq) {
        const tags = await fetchText(TAG_URL, {
          providerName: "HeyDouga",
          cookie: COOKIE2,
          method: "POST",
          contentType: "application/x-www-form-urlencoded",
          body: new URLSearchParams({
            movie_seq: seq[1],
            provider_id: pid[1]
          }).toString()
        });
        if (tags.status >= 200 && tags.status < 300) {
          const data = JSON.parse(tags.text);
          for (const tag of data.tag ?? []) {
            if (tag.tag_name) info.genres.push(tag.tag_name);
          }
        }
      }
    } catch {
    }
    if (!isValidMovieInfo(info)) {
      throw new ProviderError(`incomplete metadata: ${id}`, "not_found");
    }
    return info;
  }
};

// src/providers/kin8.ts
var MOVIE_URL5 = "https://www.kin8tengoku.com/moviepages/%s/index.html";
var REVIEW_URL = "https://m-template.heyzo.com/snstb/api/review?%s";
async function parseKin8Page(html, pageURL, id) {
  const info = baseMovieInfo("KIN8", id, pageURL);
  info.number = `KIN8-${id}`;
  info.maker = "\u91D1\u9AEA\u5929\u570B";
  const fields = await collectFields(html, [
    { key: "title", selector: "#sub_main p.sub_title, #sub_main p.sub_title_vip", mode: "text" },
    { key: "keywords", selector: 'meta[name="keywords"]', mode: "attr", attr: "content" },
    { key: "summary", selector: "#comment", mode: "text" },
    { key: "gallery", selector: "#gallery div a, #gallery_vip div a", mode: "attrs", attr: "href" },
    { key: "reviewSite", selector: "#review_list", mode: "attr", attr: "data-d2p_site_id" },
    { key: "reviewSeq", selector: "#review_list", mode: "attr", attr: "data-movie_seq" }
  ]);
  info.title = fields.title.trim();
  if (!info.title) info.title = fields.keywords.trim();
  info.summary = fields.summary.trim();
  for (const href of fields.gallery) {
    if (href) info.preview_images.push(absURL(pageURL, href));
  }
  const rows = await collectPairs(html, "td.movie_table_td", "td.movie_table_td2");
  for (const row of rows) {
    switch (row.label) {
      case "\u30E2\u30C7\u30EB":
        info.actors = row.valueTexts;
        break;
      case "\u30AB\u30C6\u30B4\u30EA\u30FC":
        info.genres = row.valueTexts;
        break;
      case "\u518D\u751F\u6642\u9593":
        info.runtime = parseRuntime(row.value);
        break;
      case "\u66F4\u65B0\u65E5":
        info.release_date = parseDateLoose(row.value);
        break;
    }
  }
  const img = /imgurl\s*=\s*'(.+?)';/.exec(html);
  if (img) {
    info.cover_url = absURL(pageURL, img[1]);
    info.thumb_url = info.cover_url;
  }
  const limit = /samplelimit\s*=\s*(\d+);/.exec(html);
  if (limit) {
    const sampleLimit = parseInt(limit[1], 10);
    const videoID = parseInt(info.id, 10);
    if (sampleLimit > 0 && videoID > 0) {
      const videos = [...html.matchAll(/videourl\s*=\s*'(.+?)'/g)].map((m) => m[1]);
      if (videos.length === 1) {
        info.preview_video_url = absURL(pageURL, videos[0]);
      } else if (videos.length >= 2) {
        info.preview_video_url = absURL(
          pageURL,
          videoID >= sampleLimit ? videos[0] : videos[1]
        );
      }
    }
  }
  const siteId = fields.reviewSite;
  const movieSeq = fields.reviewSeq;
  if (siteId && movieSeq) {
    try {
      const ts = String(Date.now());
      const q = new URLSearchParams({
        callback: `jQuery_${ts}`,
        site_id: siteId,
        movie_seq: movieSeq,
        json: "1",
        _: ts
      });
      const r = await fetchText(REVIEW_URL.replace("%s", q.toString()), {
        providerName: "KIN8"
      });
      if (r.status >= 200 && r.status < 300) {
        const m = /\w+\((.+?)\);/s.exec(r.text);
        if (m) {
          const data = JSON.parse(m[1]);
          if (Array.isArray(data) && data.length > 0) {
            info.score = data.reduce((sum, x) => sum + (x.user_rating || 0), 0) / data.length;
          }
        }
      }
    } catch {
    }
  }
  return info;
}
__name(parseKin8Page, "parseKin8Page");
var kin8Provider = {
  name: "KIN8",
  priority: 1e3,
  normalizeMovieID(id) {
    const m = /^(?:kin8[-_])?(\d+)$/i.exec(id.trim());
    return m ? m[1] : "";
  },
  parseMovieIDFromURL(rawURL) {
    try {
      const parts = new URL(rawURL).pathname.split("/").filter(Boolean);
      const id = parts.length >= 2 ? parts[parts.length - 2] : "";
      return id ? decodeURIComponent(id) : null;
    } catch {
      return null;
    }
  },
  async getMovieInfoByID(id) {
    const normalized = kin8Provider.normalizeMovieID(id);
    if (!normalized) throw new ProviderError(`invalid id: ${id}`, "invalid");
    return kin8Provider.getMovieInfoByURL(
      MOVIE_URL5.replace("%s", normalized.padStart(4, "0"))
    );
  },
  async getMovieInfoByURL(rawURL) {
    const id = kin8Provider.parseMovieIDFromURL(rawURL);
    if (!id) throw new ProviderError(`cannot parse id from url: ${rawURL}`, "invalid");
    const r = await fetchPage(rawURL, {
      providerName: "KIN8",
      notFoundMessage: `movie not found: ${id}`
    });
    const info = await parseKin8Page(r.text, rawURL, id);
    if (!isValidMovieInfo(info)) {
      throw new ProviderError(`incomplete metadata: ${id}`, "not_found");
    }
    return info;
  }
};

// src/providers/mywife.ts
var MOVIE_URL6 = "https://mywife.cc/teigaku/model/no/%s";
async function parseMywifePage(html, pageURL, id) {
  const info = baseMovieInfo("MYWIFE", id, pageURL);
  info.number = `MYWIFE-${id}`;
  info.maker = "\u821E\u30EF\u30A4\u30D5";
  const fields = await collectFields(html, [
    { key: "title", selector: "title", mode: "text" },
    { key: "summary", selector: "div.modelsamplephototop span.text_overflow", mode: "text" },
    { key: "videoSrc", selector: "div.modelsamplephototop video#video", mode: "attr", attr: "src" },
    { key: "poster", selector: "div.modelsamplephototop video#video", mode: "attr", attr: "poster" },
    { key: "previews", selector: "div.modelsamplephoto div.modelsample_photowaku img", mode: "attrs", attr: "src" }
  ]);
  info.title = fields.title.trim();
  info.summary = fields.summary.trim();
  if (fields.videoSrc) info.preview_video_url = absURL(pageURL, fields.videoSrc);
  if (fields.poster) info.cover_url = absURL(pageURL, fields.poster);
  for (const src of fields.previews) {
    if (src) info.preview_images.push(absURL(pageURL, src));
  }
  if (info.cover_url) {
    try {
      const derived = info.cover_url.replaceAll("topview.jpg", "thumb.jpg");
      const head = await fetchText(derived, { providerName: "MYWIFE", method: "HEAD" });
      if (head.status >= 200 && head.status < 300) {
        info.thumb_url = head.url;
      }
    } catch {
    }
  }
  return info;
}
__name(parseMywifePage, "parseMywifePage");
var mywifeProvider = {
  name: "MYWIFE",
  priority: 1e3,
  normalizeMovieID(id) {
    const m = /^(?:mywife[-_])?(\d+)$/i.exec(id.trim());
    return m ? m[1] : "";
  },
  parseMovieIDFromURL(rawURL) {
    try {
      const parts = new URL(rawURL).pathname.split("/").filter(Boolean);
      const base = parts[parts.length - 1] ?? "";
      return base ? decodeURIComponent(base) : null;
    } catch {
      return null;
    }
  },
  async getMovieInfoByID(id) {
    const normalized = mywifeProvider.normalizeMovieID(id);
    if (!normalized) throw new ProviderError(`invalid id: ${id}`, "invalid");
    return mywifeProvider.getMovieInfoByURL(MOVIE_URL6.replace("%s", normalized));
  },
  async getMovieInfoByURL(rawURL) {
    const id = mywifeProvider.parseMovieIDFromURL(rawURL);
    if (!id) throw new ProviderError(`cannot parse id from url: ${rawURL}`, "invalid");
    const r = await fetchPage(rawURL, {
      providerName: "MYWIFE",
      notFoundMessage: `movie not found: ${id}`
    });
    const info = await parseMywifePage(r.text, rawURL, id);
    if (!isValidMovieInfo(info)) {
      throw new ProviderError(`incomplete metadata: ${id}`, "not_found");
    }
    return info;
  }
};

// src/providers/pcolle.ts
var MOVIE_URL7 = "https://www.pcolle.com/product/detail/?product_id=%s";
var COOKIE3 = "AGE_CONF=1";
async function parsePcollePage(html, pageURL, id) {
  const info = baseMovieInfo("Pcolle", id, pageURL);
  info.number = `PCOLLE-${id}`;
  const rows = await collectPairs(html, "table th", "table td");
  for (const row of rows) {
    switch (row.label) {
      case "\u8CA9\u58F2\u4F1A\u54E1:":
        info.maker = row.value;
        break;
      case "\u30AB\u30C6\u30B4\u30EA\u30FC:":
        if (row.valueTexts.length > 0) info.label = row.valueTexts[0];
        break;
      case "\u5546\u54C1\u540D:":
        info.title = row.value;
        break;
      case "\u8CA9\u58F2\u958B\u59CB\u65E5:":
        info.release_date = parseDateLoose(row.value);
        break;
    }
  }
  const fields = await collectFields(html, [
    { key: "titleFallback", selector: "div.title-04", mode: "text" },
    { key: "summaryP", selector: "section.item_description p.fo-14", mode: "text" },
    { key: "summarySection", selector: "section.item_description", mode: "text" },
    { key: "cover", selector: "div.item-content div.part1 article a", mode: "attr", attr: "href" },
    { key: "genres", selector: "section.item_tags li", mode: "texts" },
    { key: "previews", selector: "section.item_images li a", mode: "attrs", attr: "href" }
  ]);
  if (!info.title) info.title = fields.titleFallback.trim();
  const summaryP = fields.summaryP.trim();
  info.summary = summaryP || fields.summarySection.trim();
  if (fields.cover) {
    info.thumb_url = absURL(pageURL, fields.cover);
    info.cover_url = info.thumb_url;
  }
  info.genres = fields.genres;
  for (const href of fields.previews) {
    if (href) info.preview_images.push(absURL(pageURL, href));
  }
  if (!info.cover_url && info.preview_images.length > 0) {
    info.cover_url = info.preview_images[0];
  }
  return info;
}
__name(parsePcollePage, "parsePcollePage");
var pcolleProvider = {
  name: "Pcolle",
  priority: 1e3,
  normalizeMovieID(id) {
    const m = /^(?:PCOLLE[-_])?([a-z\d]{9,})$/i.exec(id.trim());
    return m ? m[1].toLowerCase() : "";
  },
  parseMovieIDFromURL(rawURL) {
    try {
      const pid = new URL(rawURL).searchParams.get("product_id");
      return pid ? pcolleProvider.normalizeMovieID(pid) : null;
    } catch {
      return null;
    }
  },
  async getMovieInfoByID(id) {
    const normalized = pcolleProvider.normalizeMovieID(id);
    if (!normalized) throw new ProviderError(`invalid id: ${id}`, "invalid");
    return pcolleProvider.getMovieInfoByURL(MOVIE_URL7.replace("%s", encodeURIComponent(normalized)));
  },
  async getMovieInfoByURL(rawURL) {
    const id = pcolleProvider.parseMovieIDFromURL(rawURL);
    if (!id) throw new ProviderError(`cannot parse id from url: ${rawURL}`, "invalid");
    const r = await fetchPage(rawURL, {
      providerName: "Pcolle",
      cookie: COOKIE3,
      notFoundMessage: `movie not found: ${id}`
    });
    const info = await parsePcollePage(r.text, rawURL, id);
    if (!isValidMovieInfo(info)) {
      throw new ProviderError(`incomplete metadata: ${id}`, "not_found");
    }
    return info;
  }
};

// src/providers/gcolle.ts
var MOVIE_URL8 = "https://gcolle.net/adult/contents/%s";
var SCORE_URL = "https://rating.gcolle.net/ratings/products/%s.js";
function str3(v) {
  return typeof v === "string" ? v : "";
}
__name(str3, "str");
async function parseGcollePage(html, pageURL, id) {
  const info = baseMovieInfo("Gcolle", id, pageURL);
  info.number = `GCOLLE-${id}`;
  for (const block of extractJsonLd(html)) {
    const type = str3(block["@type"]);
    if (type === "Product") {
      info.title = str3(block["name"]);
      info.summary = str3(block["description"]);
      const image = block["image"];
      const img = Array.isArray(image) ? str3(image[0]) : str3(image);
      if (img) info.cover_url = absURL(pageURL, img);
      const brand = block["brand"];
      if (brand && str3(brand["name"])) info.maker = str3(brand["name"]);
    } else if (type === "BreadcrumbList") {
      const items = block["itemListElement"];
      if (Array.isArray(items)) {
        for (const item of items) {
          if (item["position"] === 2 && str3(item["name"])) {
            info.genres = [str3(item["name"])];
          }
        }
      }
    }
  }
  if (!info.cover_url || !info.title) {
    const fields = await collectFields(html, [
      { key: "ogImage", selector: 'meta[property="og:image"]', mode: "attr", attr: "content" },
      { key: "h1", selector: "h1", mode: "text" }
    ]);
    if (!info.cover_url && fields.ogImage) {
      info.cover_url = absURL(pageURL, fields.ogImage);
    }
    if (!info.title) info.title = fields.h1.trim();
  }
  info.thumb_url = info.cover_url;
  try {
    const r = await fetchText(SCORE_URL.replace("%s", id), { providerName: "Gcolle" });
    if (r.status >= 200 && r.status < 300) {
      const data = JSON.parse(r.text);
      if (typeof data.rating === "number") info.score = data.rating;
    }
  } catch {
  }
  return info;
}
__name(parseGcollePage, "parseGcollePage");
var gcolleProvider = {
  name: "Gcolle",
  priority: 1e3,
  normalizeMovieID(id) {
    const m = /^(?:GCOLLE[-_])?(\d+)$/i.exec(id.trim());
    return m ? m[1] : "";
  },
  parseMovieIDFromURL(rawURL) {
    try {
      const parts = new URL(rawURL).pathname.split("/").filter(Boolean);
      const base = parts[parts.length - 1] ?? "";
      return base ? decodeURIComponent(base) : null;
    } catch {
      return null;
    }
  },
  async getMovieInfoByID(id) {
    const normalized = gcolleProvider.normalizeMovieID(id);
    if (!normalized) throw new ProviderError(`invalid id: ${id}`, "invalid");
    return gcolleProvider.getMovieInfoByURL(MOVIE_URL8.replace("%s", normalized));
  },
  async getMovieInfoByURL(rawURL) {
    const id = gcolleProvider.parseMovieIDFromURL(rawURL);
    if (!id) throw new ProviderError(`cannot parse id from url: ${rawURL}`, "invalid");
    const r = await fetchPage(rawURL, {
      providerName: "Gcolle",
      notFoundMessage: `movie not found: ${id}`
    });
    const info = await parseGcollePage(r.text, rawURL, id);
    if (!isValidMovieInfo(info)) {
      throw new ProviderError(`incomplete metadata: ${id}`, "not_found");
    }
    return info;
  }
};

// src/providers/tokyo-hot.ts
var MOVIE_URL9 = "https://my.tokyo-hot.com/product/%s/?lang=ja";
var SEARCH_URL3 = "https://my.tokyo-hot.com/product/?q=%s&x=0&y=0&lang=ja";
async function parseTokyoHotPage(html, pageURL, id) {
  const info = baseMovieInfo("TOKYO-HOT", id, pageURL);
  info.maker = "TOKYO-HOT";
  const fields = await collectFields(html, [
    { key: "title", selector: "#main .contents > h2", mode: "text" },
    { key: "sentences", selector: "#main div.sentence", mode: "texts" },
    { key: "packageHrefs", selector: "li.package a", mode: "attrs", attr: "href" },
    { key: "poster", selector: "div.flowplayer video", mode: "attr", attr: "poster" },
    { key: "videoSrc", selector: "div.flowplayer source", mode: "attr", attr: "src" },
    { key: "caps", selector: 'a[rel="cap"]', mode: "attrs", attr: "href" }
  ]);
  info.title = fields.title.trim();
  const sentences = fields.sentences;
  if (sentences.length > 0) info.summary = sentences.join("\n").trim();
  for (const href of fields.packageHrefs) {
    const a = absURL(pageURL, href);
    if (!info.cover_url && a.includes("jacket")) {
      info.cover_url = a;
    } else if (!info.thumb_url && a.endsWith("vb.jpg") || a.includes("package")) {
      info.thumb_url = a;
    }
  }
  if (!info.cover_url && fields.poster) {
    info.cover_url = absURL(pageURL, fields.poster);
  }
  if (fields.videoSrc) {
    info.preview_video_url = absURL(pageURL, fields.videoSrc);
  }
  for (const href of fields.caps) {
    if (href) info.preview_images.push(absURL(pageURL, href));
  }
  const rows = await collectPairs(html, "#main .infowrapper dt", "#main .infowrapper dd");
  for (const row of rows) {
    switch (row.label) {
      case "\u51FA\u6F14\u8005":
        for (const actor of row.valueTexts) {
          if (actor !== "\u4E0D\u660E") info.actors.push(actor);
        }
        break;
      case "\u30D7\u30EC\u30A4\u5185\u5BB9":
      case "\u30BF\u30B0":
        info.genres.push(...row.valueTexts);
        break;
      case "\u30B7\u30EA\u30FC\u30BA":
        info.series = row.valueFirstLink;
        break;
      case "\u30EC\u30FC\u30D9\u30EB":
        info.label = row.valueFirstLink;
        break;
      case "\u914D\u4FE1\u958B\u59CB\u65E5":
        info.release_date = parseDateLoose(row.value);
        break;
      case "\u53CE\u9332\u6642\u9593":
        info.runtime = parseRuntime(row.value);
        break;
      case "\u4F5C\u54C1\u756A\u53F7":
        info.number = row.value;
        break;
    }
  }
  info.genres = [...new Set(info.genres)];
  if (!info.thumb_url && info.cover_url) info.thumb_url = info.cover_url;
  else if (!info.cover_url && info.thumb_url) info.cover_url = info.thumb_url;
  return info;
}
__name(parseTokyoHotPage, "parseTokyoHotPage");
async function parseTokyoHotSearchPage(html) {
  const cards = [];
  let cur = null;
  const flush = /* @__PURE__ */ __name(() => {
    if (cur) {
      cur.title = cur.titleBuf.trim();
      cards.push(cur);
      cur = null;
    }
  }, "flush");
  const rw = new HTMLRewriter().on("#main ul li", {
    element() {
      flush();
      cur = { homepage: "", img: "", imgAlt: "", imgTitle: "", title: "", text: "", titleBuf: "" };
    },
    text(t) {
      if (cur) cur.text += t.text;
    }
  }).on("#main ul li a", {
    element(el) {
      if (cur && !cur.homepage) cur.homepage = el.getAttribute("href") ?? "";
    }
  }).on("#main ul li a img", {
    element(el) {
      if (cur && !cur.img) {
        cur.img = el.getAttribute("src") ?? "";
        cur.imgAlt = el.getAttribute("alt") ?? "";
        cur.imgTitle = el.getAttribute("title") ?? "";
      }
    }
  }).on("#main ul li div.title", {
    text(t) {
      if (cur) cur.titleBuf += t.text;
    }
  });
  await rw.transform(new Response(html)).text();
  flush();
  return cards;
}
__name(parseTokyoHotSearchPage, "parseTokyoHotSearchPage");
var tokyohotProvider = {
  name: "TOKYO-HOT",
  priority: 998,
  normalizeMovieID(id) {
    return id.trim().toLowerCase();
  },
  parseMovieIDFromURL(rawURL) {
    try {
      const parts = new URL(rawURL).pathname.split("/").filter(Boolean);
      const base = parts[parts.length - 1] ?? "";
      return base ? tokyohotProvider.normalizeMovieID(decodeURIComponent(base)) : null;
    } catch {
      return null;
    }
  },
  async getMovieInfoByID(id) {
    const normalized = tokyohotProvider.normalizeMovieID(id);
    if (!normalized) throw new ProviderError("invalid id", "invalid");
    return tokyohotProvider.getMovieInfoByURL(MOVIE_URL9.replace("%s", normalized));
  },
  async getMovieInfoByURL(rawURL) {
    const id = tokyohotProvider.parseMovieIDFromURL(rawURL);
    if (!id) throw new ProviderError(`cannot parse id from url: ${rawURL}`, "invalid");
    const r = await fetchPage(rawURL, {
      providerName: "TOKYO-HOT",
      notFoundMessage: `movie not found: ${id}`
    });
    const info = await parseTokyoHotPage(r.text, rawURL, id);
    if (!isValidMovieInfo(info)) {
      throw new ProviderError(`incomplete metadata: ${id}`, "not_found");
    }
    return info;
  },
  normalizeMovieKeyword(keyword) {
    return /^[a-z_]*\d+$/i.test(keyword) ? keyword.toLowerCase() : "";
  },
  async searchMovie(keyword) {
    const url = SEARCH_URL3.replace("%s", encodeURIComponent(keyword));
    const r = await fetchPage(url, { providerName: "TOKYO-HOT" });
    const cards = await parseTokyoHotSearchPage(r.text);
    const results = [];
    for (const card of cards) {
      if (!card.homepage) continue;
      const homepage = absURL(url, card.homepage);
      const id = tokyohotProvider.parseMovieIDFromURL(homepage);
      if (!id) continue;
      let number = "";
      const m = /\(作品番号: ([a-z\d\-_]+)\)/.exec(card.text);
      if (m) number = m[1];
      if (!number) number = card.imgAlt;
      if (!number) number = card.imgTitle;
      if (!number) number = id;
      const img = card.img ? absURL(url, card.img) : "";
      const result = {
        id,
        number,
        title: card.title,
        provider: "TOKYO-HOT",
        homepage,
        actors: [],
        thumb_url: img,
        cover_url: img,
        score: 0,
        release_date: ""
      };
      if (isValidSearchResult(result)) results.push(result);
    }
    return results;
  }
};

// src/providers/madouqu.ts
var MOVIE_URL10 = "https://madouqu.com/%s/";
var SEARCH_URL4 = "https://madouqu.com/?s=%s";
function extractImgSrc(src) {
  try {
    const u = new URL(src);
    const m = /(https?:\/\/.+$)/.exec(u.pathname);
    if (m) return m[1];
  } catch {
  }
  return src;
}
__name(extractImgSrc, "extractImgSrc");
async function parseMadouquPage(html, pageURL, id) {
  const info = baseMovieInfo("MadouQu", id, pageURL);
  let cur = null;
  const flush = /* @__PURE__ */ __name(() => {
    if (!cur) return;
    if (cur.img) {
      info.cover_url = extractImgSrc(cur.img);
      cur = null;
      return;
    }
    const text = cur.text;
    if (text.includes("\u756A\u865F")) {
      info.number = (text.split("\uFF1A")[1] ?? "").trim();
    } else if (text.includes("\u7247\u540D")) {
      info.title = (text.split("\uFF1A")[1] ?? "").trim();
    } else if (text.includes("\u5973\u90CE")) {
      const actors = (text.split("\uFF1A")[1] ?? "").split("\u3001").map((a) => a.trim()).filter(Boolean);
      info.actors.push(...actors);
    }
    cur = null;
  }, "flush");
  const rw = new HTMLRewriter().on('article[id^="post"] div.container p', {
    element() {
      flush();
      cur = { text: "", img: "" };
    },
    text(t) {
      if (cur) cur.text += t.text;
    }
  }).on('article[id^="post"] div.container p img', {
    element(el) {
      if (cur && !cur.img) cur.img = el.getAttribute("src") ?? "";
    }
  });
  await rw.transform(new Response(html)).text();
  flush();
  const fields = await collectFields(html, [
    { key: "tags", selector: 'article[id^="post"] div.entry-tags a', mode: "texts" },
    { key: "maker", selector: 'article[id^="post"] span.meta-category a', mode: "text" }
  ]);
  if (info.actors.length === 0) {
    info.actors = fields.tags;
  }
  if (!info.maker) info.maker = fields.maker.trim();
  if (!info.number) info.number = parseIDToNumber(id);
  if (!info.thumb_url) info.thumb_url = info.cover_url;
  return info;
}
__name(parseMadouquPage, "parseMadouquPage");
async function parseMadouquSearchPage(html) {
  const cards = [];
  let cur = null;
  const flush = /* @__PURE__ */ __name(() => {
    if (cur) {
      cards.push(cur);
      cur = null;
    }
  }, "flush");
  const rw = new HTMLRewriter().on('article[id^="post"]', {
    element() {
      flush();
      cur = { homepage: "", linkTitle: "", thumb: "" };
    }
  }).on('article[id^="post"] h2 a', {
    element(el) {
      if (cur && !cur.homepage) {
        cur.homepage = el.getAttribute("href") ?? "";
        cur.linkTitle = el.getAttribute("title") ?? "";
      }
    }
  }).on('article[id^="post"] div.entry-media a img', {
    element(el) {
      if (cur && !cur.thumb) cur.thumb = el.getAttribute("data-src") ?? "";
    }
  });
  await rw.transform(new Response(html)).text();
  flush();
  return cards;
}
__name(parseMadouquSearchPage, "parseMadouquSearchPage");
var madouquProvider = {
  name: "MadouQu",
  priority: 0,
  // disabled by default in the Go version too
  normalizeMovieID(id) {
    return id.trim();
  },
  parseMovieIDFromURL(rawURL) {
    try {
      const parts = new URL(rawURL).pathname.split("/").filter(Boolean);
      const base = parts[parts.length - 1] ?? "";
      return base ? decodeURIComponent(base) : null;
    } catch {
      return null;
    }
  },
  async getMovieInfoByID(id) {
    const normalized = madouquProvider.normalizeMovieID(id);
    if (!normalized) throw new ProviderError("invalid id", "invalid");
    return madouquProvider.getMovieInfoByURL(MOVIE_URL10.replace("%s", normalized));
  },
  async getMovieInfoByURL(rawURL) {
    const id = madouquProvider.parseMovieIDFromURL(rawURL);
    if (!id) throw new ProviderError(`cannot parse id from url: ${rawURL}`, "invalid");
    const r = await fetchPage(rawURL, {
      providerName: "MadouQu",
      notFoundMessage: `movie not found: ${id}`
    });
    const info = await parseMadouquPage(r.text, rawURL, id);
    if (!isValidMovieInfo(info)) {
      throw new ProviderError(`incomplete metadata: ${id}`, "not_found");
    }
    return info;
  },
  normalizeMovieKeyword(keyword) {
    if (isSpecial(keyword)) return "";
    return keyword.toUpperCase();
  },
  async searchMovie(keyword) {
    const url = SEARCH_URL4.replace("%s", encodeURIComponent(keyword));
    const r = await fetchPage(url, { providerName: "MadouQu" });
    const cards = await parseMadouquSearchPage(r.text);
    const results = [];
    for (const card of cards) {
      if (!card.homepage) continue;
      const homepage = absURL(url, card.homepage);
      const id = madouquProvider.parseMovieIDFromURL(homepage);
      if (!id) continue;
      const origTitle = card.linkTitle;
      const sp = origTitle.indexOf(" ");
      let nb = sp > 0 ? origTitle.slice(0, sp) : "";
      let title = sp > 0 ? origTitle.slice(sp + 1) : origTitle;
      if (!/^[A-Z0-9\-_]+$/i.test(nb)) {
        nb = parseIDToNumber(id);
        title = origTitle;
      }
      const thumb = card.thumb ? extractImgSrc(card.thumb) : "";
      const result = {
        id,
        number: nb,
        title,
        provider: "MadouQu",
        homepage,
        actors: [],
        thumb_url: thumb,
        cover_url: thumb,
        score: 0,
        release_date: ""
      };
      if (isValidSearchResult(result)) results.push(result);
    }
    return results;
  }
};

// src/providers/fc2hub.ts
var MOVIE_URL11 = "https://javten.com/video/%s/id%s/%s";
var SEARCH_URL5 = "https://javten.com/search?kw=%s";
function fc2ParseNumber(id) {
  const m = /^(?:FC2(?:[-_\s]?PPV)?[-_\s]?)?(\d+)$/i.exec(id.trim());
  return m ? m[1] : "";
}
__name(fc2ParseNumber, "fc2ParseNumber");
function str4(v) {
  return typeof v === "string" ? v : "";
}
__name(str4, "str");
function strList(v) {
  if (!Array.isArray(v)) return [];
  return v.filter((x) => typeof x === "string").map((x) => x.trim()).filter(Boolean);
}
__name(strList, "strList");
async function parseFc2hubPage(html, pageURL, id) {
  const info = baseMovieInfo("fc2hub", id, pageURL);
  const fields = await collectFields(html, [
    { key: "h1", selector: "#content h1", mode: "text" },
    { key: "previews", selector: 'a[data-fancybox="gallery"]', mode: "attrs", attr: "href" }
  ]);
  for (const href of fields.previews) {
    if (href) info.preview_images.push(absURL(pageURL, href));
  }
  for (const block of extractJsonLd(html)) {
    const type = str4(block["@type"]);
    if (type === "Movie") {
      if (str4(block["name"])) info.title = str4(block["name"]);
      if (!info.summary) info.summary = str4(block["description"]);
      if (str4(block["director"])) info.maker = str4(block["director"]);
      if (info.genres.length === 0) info.genres = strList(block["genre"]);
      const actors = strList(block["actor"]);
      if (actors.length > 0) info.actors = actors;
      const identifiers = Array.isArray(block["identifier"]) ? block["identifier"] : [];
      for (const identifier of identifiers) {
        if (typeof identifier !== "string") continue;
        const num = fc2ParseNumber(identifier);
        if (num) {
          info.number = `FC2-${num}`;
          break;
        }
      }
      info.cover_url = str4(block["image"]);
      info.release_date = parseDateLoose(str4(block["datePublished"]));
      info.runtime = parseRuntime(str4(block["duration"]));
    } else if (type === "CreativeWorkSeries") {
      const rating = block["aggregateRating"] ?? {};
      if (typeof rating["ratingValue"] === "number") {
        info.score = rating["ratingValue"];
      }
    }
  }
  const h1Text = fields.h1.trim();
  const h1Num = fc2ParseNumber(h1Text);
  if (h1Num) info.number = `FC2-${h1Num}`;
  else if (h1Text && !info.title) info.title = h1Text;
  if (!info.cover_url && info.preview_images.length > 0) {
    info.cover_url = info.preview_images[0];
  }
  info.thumb_url = info.cover_url;
  if (info.id && info.number.length > 4 && info.title) {
    const a = info.id.split("-", 2)[0];
    info.homepage = MOVIE_URL11.replace("%s", a).replace("%s", info.number.slice(4)).replace("%s", encodeURIComponent(info.title));
  }
  return info;
}
__name(parseFc2hubPage, "parseFc2hubPage");
var fc2hubProvider = {
  name: "fc2hub",
  priority: 999,
  normalizeMovieID(id) {
    return id.trim();
  },
  parseMovieIDFromURL(rawURL) {
    try {
      const m = /\/video\/(\d+)\/id(\d+)/.exec(new URL(rawURL).pathname);
      return m ? `${m[1]}-${m[2]}` : null;
    } catch {
      return null;
    }
  },
  async getMovieInfoByID(id) {
    const ss = id.trim().split("-", 2);
    if (ss.length !== 2 || !ss[0] || !ss[1]) {
      throw new ProviderError(`invalid id: ${id}`, "invalid");
    }
    const url = MOVIE_URL11.replace("%s", ss[0]).replace("%s", ss[1]).replace("%s", "%20");
    return fc2hubProvider.getMovieInfoByURL(url);
  },
  async getMovieInfoByURL(rawURL) {
    const id = fc2hubProvider.parseMovieIDFromURL(rawURL);
    if (!id) throw new ProviderError(`cannot parse id from url: ${rawURL}`, "invalid");
    const r = await fetchPage(rawURL, {
      providerName: "fc2hub",
      notFoundMessage: `movie not found: ${id}`
    });
    const info = await parseFc2hubPage(r.text, rawURL, id);
    if (!isValidMovieInfo(info)) {
      throw new ProviderError(`incomplete metadata: ${id}`, "not_found");
    }
    return info;
  },
  normalizeMovieKeyword(keyword) {
    return fc2ParseNumber(keyword);
  },
  async searchMovie(keyword) {
    const url = SEARCH_URL5.replace("%s", encodeURIComponent(keyword));
    const r = await fetchText(url, { providerName: "fc2hub", redirect: "manual" });
    const loc = r.headers.get("location");
    if (!loc) return [];
    const target = absURL(url, loc);
    let pathname = "";
    try {
      pathname = new URL(target).pathname;
    } catch {
      return [];
    }
    if (!/\/video\/\d+\/id\d+/.test(pathname)) return [];
    const info = await fc2hubProvider.getMovieInfoByURL(target);
    return [movieInfoToSearchResult(info)];
  }
};

// src/providers/duga.ts
var MOVIE_URL12 = "https://duga.jp/ppv/%s/";
var SEARCH_URL6 = "https://duga.jp/search/=/q=%s/";
async function parseDugaPage(html, pageURL, id) {
  const info = baseMovieInfo("DUGA", id, pageURL);
  const fields = await collectFields(html, [
    { key: "title", selector: "#contentsname", mode: "text" },
    { key: "thumb", selector: "div.imagebox img#productjpg", mode: "attr", attr: "src" },
    { key: "coverLink", selector: "div.imagebox > a", mode: "attr", attr: "href" },
    { key: "ogTitle", selector: 'meta[property="og:title"]', mode: "attr", attr: "content" },
    { key: "ogDesc", selector: 'meta[property="og:description"]', mode: "attr", attr: "content" },
    { key: "ogImage", selector: 'meta[property="og:image"]', mode: "attr", attr: "content" },
    { key: "video", selector: "video.play-video", mode: "attr", attr: "src" },
    { key: "previews", selector: "#digestthumbbox > li a", mode: "attrs", attr: "href" },
    { key: "actors", selector: "ul.performer li a", mode: "texts" },
    { key: "genres", selector: "ul.categorylist li a", mode: "texts" },
    { key: "directors", selector: "ul.director li a", mode: "texts" },
    { key: "scoreAlt", selector: "div.ratingstar-total img", mode: "attr", attr: "alt" }
  ]);
  info.title = fields.title.trim();
  info.thumb_url = fields.thumb ? absURL(pageURL, fields.thumb) : "";
  info.cover_url = fields.coverLink ? absURL(pageURL, fields.coverLink) : "";
  info.preview_video_url = fields.video ? absURL(pageURL, fields.video) : "";
  info.preview_images = fields.previews.map((u) => absURL(pageURL, u));
  info.actors = fields.actors;
  info.genres = fields.genres;
  const directors = fields.directors;
  if (directors.length > 0) info.director = directors[0];
  if (fields.scoreAlt) info.score = parseScore(fields.scoreAlt);
  for (const block of extractJsonLd(html)) {
    const desc = block["description"];
    if (typeof desc === "string" && desc) {
      info.summary = desc;
      break;
    }
  }
  if (!info.title) info.title = fields.ogTitle.trim();
  if (!info.summary) info.summary = fields.ogDesc.trim();
  if (!info.thumb_url && fields.ogImage) {
    info.thumb_url = absURL(pageURL, fields.ogImage);
  }
  const rows = await collectPairs(html, "div.summaryinner th", "div.summaryinner td");
  for (const row of rows) {
    switch (row.label) {
      case "\u914D\u4FE1\u958B\u59CB\u65E5":
      case "\u767A\u58F2\u65E5":
        if (!info.release_date) info.release_date = parseDateLoose(row.value);
        break;
      case "\u30E1\u30FC\u30AB\u30FC":
        info.maker = row.value;
        break;
      case "\u30EC\u30FC\u30D9\u30EB":
        info.label = row.value;
        break;
      case "\u4F5C\u54C1ID":
        info.id = row.value;
        break;
      case "\u30E1\u30FC\u30AB\u30FC\u54C1\u756A":
        info.number = row.value;
        break;
      case "\u30B7\u30EA\u30FC\u30BA":
        info.series = row.value;
        break;
    }
  }
  const dlRows = await collectPairs(html, "div.downloadbox th", "div.downloadbox td");
  for (const row of dlRows) {
    if (row.label === "\u518D\u751F\u6642\u9593" && info.runtime === 0) {
      info.runtime = parseRuntime(row.value);
    }
  }
  if (!info.cover_url) info.cover_url = info.thumb_url;
  if (!info.id) info.id = id;
  if (!info.number) info.number = info.id.toUpperCase();
  return info;
}
__name(parseDugaPage, "parseDugaPage");
async function parseDugaSearchIDs(html, pageURL) {
  const ids = [];
  let inCard = false;
  let got = false;
  const rw = new HTMLRewriter().on("div.contentslist", {
    element() {
      inCard = true;
      got = false;
    }
  }).on("#searchresultarea div.contentslist a", {
    element(el) {
      if (inCard && !got) {
        const href = el.getAttribute("href");
        if (href) {
          const parsed = dugaProvider.parseMovieIDFromURL(absURL(pageURL, href));
          if (parsed) ids.push(parsed);
          got = true;
        }
      }
    }
  });
  await rw.transform(new Response(html)).text();
  return ids;
}
__name(parseDugaSearchIDs, "parseDugaSearchIDs");
var dugaProvider = {
  name: "DUGA",
  priority: 998,
  normalizeMovieID(id) {
    return id.trim().toLowerCase();
  },
  parseMovieIDFromURL(rawURL) {
    try {
      const parts = new URL(rawURL).pathname.split("/").filter(Boolean);
      const base = parts[parts.length - 1] ?? "";
      return base ? dugaProvider.normalizeMovieID(decodeURIComponent(base)) : null;
    } catch {
      return null;
    }
  },
  async getMovieInfoByID(id) {
    const normalized = dugaProvider.normalizeMovieID(id);
    if (!normalized) throw new ProviderError(`invalid id: ${id}`, "invalid");
    return dugaProvider.getMovieInfoByURL(MOVIE_URL12.replace("%s", normalized));
  },
  async getMovieInfoByURL(rawURL) {
    const id = dugaProvider.parseMovieIDFromURL(rawURL);
    if (!id) throw new ProviderError(`cannot parse id from url: ${rawURL}`, "invalid");
    const r = await fetchPage(rawURL, {
      providerName: "DUGA",
      notFoundMessage: `movie not found: ${id}`
    });
    const info = await parseDugaPage(r.text, rawURL, id);
    if (!isValidMovieInfo(info)) {
      throw new ProviderError(`incomplete metadata: ${id}`, "not_found");
    }
    return info;
  },
  normalizeMovieKeyword(keyword) {
    if (isSpecial(keyword)) return "";
    return keyword.trim().toUpperCase();
  },
  async searchMovie(keyword) {
    const url = SEARCH_URL6.replace("%s", encodeURIComponent(keyword));
    const r = await fetchPage(url, { providerName: "DUGA" });
    const ids = await parseDugaSearchIDs(r.text, url);
    const settled = await Promise.allSettled(
      ids.slice(0, 3).map((id) => dugaProvider.getMovieInfoByID(id))
    );
    const results = [];
    for (const s of settled) {
      if (s.status === "fulfilled" && isValidMovieInfo(s.value)) {
        results.push(movieInfoToSearchResult(s.value));
      }
    }
    return results;
  }
};

// src/providers/mgs.ts
var MOVIE_URL13 = "https://www.mgstage.com/product/product_detail/%s/";
var SEARCH_URL7 = "https://www.mgstage.com/search/cSearch.php?search_word=%s";
var SAMPLE_URL2 = "https://www.mgstage.com/sampleplayer/sampleRespons.php?pid=%s";
var COOKIE4 = "adc=1";
function mgsImageSrc(s, thumb) {
  const re = /\/p[f|b]_[a-z]\d*?_/i;
  if (re.test(s)) return s.replace(re, thumb ? "/pf_e_" : "/pb_e_");
  return s;
}
__name(mgsImageSrc, "mgsImageSrc");
async function parseMgsPage(html, pageURL, id) {
  const info = baseMovieInfo("MGS", id, pageURL);
  const fields = await collectFields(html, [
    { key: "title", selector: "#center_column h1", mode: "text" },
    { key: "summary", selector: 'meta[property="og:description"]', mode: "attr", attr: "content" },
    { key: "thumb", selector: "div.detail_data > div h2 img", mode: "attr", attr: "src" },
    { key: "cover", selector: "#EnlargeImage", mode: "attr", attr: "href" },
    { key: "previews", selector: "#sample-photo dd ul li a", mode: "attrs", attr: "href" }
  ]);
  info.title = fields.title.trim();
  info.summary = fields.summary.trim();
  info.thumb_url = fields.thumb ? absURL(pageURL, fields.thumb) : "";
  info.cover_url = fields.cover ? absURL(pageURL, fields.cover) : "";
  info.preview_images = fields.previews.map((u) => absURL(pageURL, u));
  const rows = await collectPairs(html, "tr th", "tr td");
  for (const row of rows) {
    switch (row.label) {
      case "\u51FA\u6F14\uFF1A":
        info.actors = row.valueTexts;
        break;
      case "\u30E1\u30FC\u30AB\u30FC\uFF1A":
        info.maker = row.value;
        break;
      case "\u53CE\u9332\u6642\u9593\uFF1A":
        info.runtime = parseRuntime(row.value);
        break;
      case "\u54C1\u756A\uFF1A":
        info.number = row.value;
        break;
      case "\u914D\u4FE1\u958B\u59CB\u65E5\uFF1A":
      case "\u5546\u54C1\u767A\u58F2\u65E5\uFF1A":
        if (!info.release_date) info.release_date = parseDateLoose(row.value);
        break;
      case "\u30B7\u30EA\u30FC\u30BA\uFF1A":
        info.series = row.value;
        break;
      case "\u30EC\u30FC\u30D9\u30EB\uFF1A":
        info.label = row.value;
        break;
      case "\u30B8\u30E3\u30F3\u30EB\uFF1A":
        info.genres = row.valueTexts;
        break;
      case "\u8A55\u4FA1\uFF1A":
        info.score = parseScore(row.value);
        break;
    }
  }
  if (!info.number) info.number = id;
  const btn = /sample_movie_btn[\s\S]{0,400}?href="([^"]+)"/.exec(html);
  if (btn) {
    try {
      const pid = btn[1].split("/").filter(Boolean).pop() ?? "";
      if (pid) {
        const r = await fetchText(SAMPLE_URL2.replace("%s", pid), {
          cookie: COOKIE4,
          providerName: "MGS"
        });
        if (r.status >= 200 && r.status < 300) {
          const data = JSON.parse(r.text);
          if (data.url) {
            info.preview_video_url = data.url.replace(/\.ism\/request?.+$/, ".mp4");
          }
        }
      }
    } catch {
    }
  }
  return info;
}
__name(parseMgsPage, "parseMgsPage");
async function parseMgsSearch(html, pageURL) {
  const cards = [];
  let cur = null;
  let titleAnchor = false;
  const rw = new HTMLRewriter().on("#center_column ul.product_list > li", {
    element() {
      cur = { homepage: "", img: "", title: "", fallbackTitle: "", review: "" };
      cards.push(cur);
      titleAnchor = false;
    }
  }).on("#center_column ul.product_list > li h5 a", {
    element(el) {
      if (cur && !cur.homepage) cur.homepage = el.getAttribute("href") ?? "";
    }
  }).on("#center_column ul.product_list > li h5 a img", {
    element(el) {
      if (cur && !cur.img) cur.img = el.getAttribute("src") ?? "";
    }
  }).on("#center_column ul.product_list > li a", {
    element(el) {
      titleAnchor = (el.getAttribute("class") ?? "").includes("title");
    },
    text(t) {
      if (cur && titleAnchor) cur.title += t.text;
    }
  }).on("#center_column ul.product_list > li a p", {
    text(t) {
      if (cur) cur.fallbackTitle += t.text;
    }
  }).on("#center_column ul.product_list > li p.review", {
    text(t) {
      if (cur) cur.review += t.text;
    }
  });
  await rw.transform(new Response(html)).text();
  const results = [];
  for (const c of cards) {
    if (!c.homepage) continue;
    const homepage = absURL(pageURL, c.homepage);
    const id = mgsProvider.parseMovieIDFromURL(homepage);
    if (!id) continue;
    const img = c.img ? absURL(pageURL, c.img) : "";
    results.push({
      id,
      number: id,
      title: c.title.trim() || c.fallbackTitle.trim(),
      provider: "MGS",
      homepage,
      thumb_url: img ? mgsImageSrc(img, true) : "",
      cover_url: img ? mgsImageSrc(img, false) : "",
      score: parseScore(c.review),
      actors: [],
      release_date: ""
    });
  }
  return results;
}
__name(parseMgsSearch, "parseMgsSearch");
var mgsProvider = {
  name: "MGS",
  priority: 1e3,
  normalizeMovieID(id) {
    return id.trim().toUpperCase();
  },
  parseMovieIDFromURL(rawURL) {
    try {
      const parts = new URL(rawURL).pathname.split("/").filter(Boolean);
      const base = parts[parts.length - 1] ?? "";
      return base ? mgsProvider.normalizeMovieID(decodeURIComponent(base)) : null;
    } catch {
      return null;
    }
  },
  async getMovieInfoByID(id) {
    const normalized = mgsProvider.normalizeMovieID(id);
    if (!normalized) throw new ProviderError(`invalid id: ${id}`, "invalid");
    return mgsProvider.getMovieInfoByURL(MOVIE_URL13.replace("%s", normalized));
  },
  async getMovieInfoByURL(rawURL) {
    const id = mgsProvider.parseMovieIDFromURL(rawURL);
    if (!id) throw new ProviderError(`cannot parse id from url: ${rawURL}`, "invalid");
    const r = await fetchPage(rawURL, {
      cookie: COOKIE4,
      providerName: "MGS",
      notFoundMessage: `movie not found: ${id}`
    });
    const info = await parseMgsPage(r.text, rawURL, id);
    if (!isValidMovieInfo(info)) {
      throw new ProviderError(`incomplete metadata: ${id}`, "not_found");
    }
    return info;
  },
  normalizeMovieKeyword(keyword) {
    if (isSpecial(keyword)) return "";
    return keyword.trim().toUpperCase();
  },
  async searchMovie(keyword) {
    const url = SEARCH_URL7.replace("%s", encodeURIComponent(keyword));
    const r = await fetchPage(url, { cookie: COOKIE4, providerName: "MGS" });
    return parseMgsSearch(r.text, url);
  }
};

// src/providers/getchu.ts
var MOVIE_URL14 = "https://dl.getchu.com/i/item%s";
function stripTags(s) {
  return decodeEntities(s.replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
}
__name(stripTags, "stripTags");
async function parseGetchuPage(html, pageURL, id) {
  const info = baseMovieInfo("Getchu", id, pageURL);
  info.number = `GETCHU-${id}`;
  try {
    const fields = await collectFields(html, [
      {
        key: "titleDiv",
        selector: 'td div[style="color: #333333; padding: 3px 0px 0px 5px;"]',
        mode: "text"
      },
      { key: "cover", selector: 'td[bgcolor="#ffffff"] img', mode: "attr", attr: "src" },
      { key: "ogTitle", selector: 'meta[property="og:title"]', mode: "attr", attr: "content" },
      { key: "ogImage", selector: 'meta[property="og:image"]', mode: "attr", attr: "content" }
    ]);
    info.title = fields.titleDiv.trim();
    if (!info.title) info.title = fields.ogTitle.trim();
    if (fields.cover) info.cover_url = absURL(pageURL, fields.cover);
    if (!info.cover_url && fields.ogImage) {
      info.cover_url = absURL(pageURL, fields.ogImage);
    }
  } catch {
  }
  try {
    const fields = await collectFields(html, [
      {
        key: "previews",
        selector: 'td[style*="background-color: #444444;"] a',
        mode: "attrs",
        attr: "href"
      }
    ]);
    info.preview_images = fields.previews.map((u) => absURL(pageURL, u));
  } catch {
  }
  const rowRe = /<td[^>]*>\s*(サークル|配信開始日|趣向|作品内容)\s*<\/td>\s*<td[^>]*>([\s\S]*?)<\/td>/g;
  let m;
  while ((m = rowRe.exec(html)) !== null) {
    const label = m[1];
    const rawValue = m[2];
    switch (label) {
      case "\u30B5\u30FC\u30AF\u30EB":
        info.label = stripTags(rawValue);
        break;
      case "\u914D\u4FE1\u958B\u59CB\u65E5":
        info.release_date = parseDateLoose(stripTags(rawValue));
        break;
      case "\u8DA3\u5411":
        info.genres = stripTags(rawValue).split(/[\s、,]+/).map((g) => g.trim()).filter(Boolean);
        break;
      case "\u4F5C\u54C1\u5185\u5BB9":
        info.summary = stripTags(rawValue);
        break;
    }
  }
  if (!info.thumb_url) info.thumb_url = info.cover_url;
  return info;
}
__name(parseGetchuPage, "parseGetchuPage");
var getchuProvider = {
  name: "Getchu",
  priority: 1e3,
  normalizeMovieID(id) {
    const m = /^(?:GETCHU[-_])?(\d+)$/i.exec(id.trim());
    return m ? m[1] : "";
  },
  parseMovieIDFromURL(rawURL) {
    try {
      const parts = new URL(rawURL).pathname.split("/").filter(Boolean);
      const base = parts[parts.length - 1] ?? "";
      return base.replace(/^[item]+/, "") || null;
    } catch {
      return null;
    }
  },
  async getMovieInfoByID(id) {
    const normalized = getchuProvider.normalizeMovieID(id);
    if (!normalized) throw new ProviderError(`invalid id: ${id}`, "invalid");
    return getchuProvider.getMovieInfoByURL(MOVIE_URL14.replace("%s", normalized));
  },
  async getMovieInfoByURL(rawURL) {
    const id = getchuProvider.parseMovieIDFromURL(rawURL);
    if (!id) throw new ProviderError(`cannot parse id from url: ${rawURL}`, "invalid");
    const r = await fetchPage(rawURL, {
      providerName: "Getchu",
      notFoundMessage: `movie not found: ${id}`
    });
    const info = await parseGetchuPage(r.text, rawURL, id);
    if (!isValidMovieInfo(info)) {
      throw new ProviderError(`incomplete metadata: ${id}`, "not_found");
    }
    return info;
  }
};

// src/providers/ave.ts
var MOVIE_URL15 = "https://www.aventertainments.com/dvd/detail?pro=%s&lang=2&culture=ja-JP&cat=29";
var SEARCH_URL8 = "https://www.aventertainments.com/dvd/search?lang=2&cat=29&culture=ja-JP&keyword=%s&searchby=keyword";
var DDG_URL = "https://html.duckduckgo.com/html/?q=%s";
var DDG_LITE_URL = "https://lite.duckduckgo.com/lite/?q=%s";
var BING_URL = "https://www.bing.com/search?q=%s";
function aveParseNumber(s) {
  const m = /\/(?:dvd\d)?([a-z\d-_]+)\.(?:jpe?g|png|gif|webp)/i.exec(s);
  return m ? m[1].toUpperCase() : "";
}
__name(aveParseNumber, "aveParseNumber");
async function parseAvePage(html, pageURL, id) {
  const info = baseMovieInfo("AVE", id, pageURL);
  const fields = await collectFields(html, [
    { key: "title", selector: "#MyBody .section-title h3", mode: "text" },
    { key: "summary1", selector: "div.product-description", mode: "text" },
    { key: "summary2", selector: "div#category", mode: "text" },
    { key: "playerCover", selector: "#PlayerCover > img", mode: "attr", attr: "src" },
    { key: "imageSrc", selector: 'link[rel="image_src"]', mode: "attr", attr: "href" },
    { key: "galleryCover", selector: "span.grid-gallery > a", mode: "attr", attr: "href" },
    { key: "hls", selector: "#player1 > source", mode: "attr", attr: "src" }
  ]);
  info.title = fields.title.trim();
  info.summary = fields.summary1.trim() + fields.summary2.trim();
  if (fields.playerCover) {
    info.cover_url = absURL(pageURL, fields.playerCover);
    info.thumb_url = info.cover_url.replaceAll("bigcover", "jacket_images");
  }
  if (!info.thumb_url && fields.imageSrc) {
    info.thumb_url = absURL(pageURL, fields.imageSrc);
  }
  if (!info.cover_url && fields.galleryCover) {
    info.cover_url = absURL(pageURL, fields.galleryCover);
  }
  if (fields.hls) info.preview_video_hls_url = absURL(pageURL, fields.hls);
  {
    const previews = [];
    const rw = new HTMLRewriter().on("#sscontainerppv123 > img", {
      element(el) {
        const src = el.getAttribute("src");
        if (src) previews.splice(0, previews.length, absURL(pageURL, src));
      }
    }).on("div.gallery-block a.lightbox", {
      element(el) {
        const href = el.getAttribute("href");
        if (href) previews.push(absURL(pageURL, href));
      }
    });
    await rw.transform(new Response(html)).text();
    info.preview_images = previews;
  }
  const rows = await collectPairsSeq(html, "div.single-info > span");
  for (const row of rows) {
    switch (row.label) {
      case "\u5546\u54C1\u756A\u53F7":
        info.number = row.value;
        break;
      case "\u4E3B\u6F14\u5973\u512A":
        info.actors = row.valueTexts;
        break;
      case "\u30B9\u30BF\u30B8\u30AA":
        info.maker = row.value;
        break;
      case "\u30B7\u30EA\u30FC\u30BA":
        info.series = row.value;
        break;
      case "\u30AB\u30C6\u30B4\u30EA":
        info.genres = row.valueTexts;
        break;
      case "\u767A\u58F2\u65E5": {
        const first = row.value.split(/\s+/)[0] ?? "";
        info.release_date = parseDateLoose(first);
        break;
      }
      case "\u53CE\u9332\u6642\u9593":
        info.runtime = parseRuntime(row.value);
        break;
    }
  }
  if (!info.number) info.number = id;
  return info;
}
__name(parseAvePage, "parseAvePage");
async function parseAveSearch(html, pageURL) {
  const cards = [];
  let cur = null;
  const rw = new HTMLRewriter().on("div.single-slider-product", {
    element() {
      cur = { homepage: "", img: "", title: "" };
      cards.push(cur);
    }
  }).on("div.single-slider-product a", {
    element(el) {
      if (cur && !cur.homepage) cur.homepage = el.getAttribute("href") ?? "";
    }
  }).on("div.single-slider-product a img", {
    element(el) {
      if (cur && !cur.img) cur.img = el.getAttribute("src") ?? "";
    }
  }).on("div.single-slider-product p.product-title a", {
    text(t) {
      if (cur) cur.title += t.text;
    }
  });
  await rw.transform(new Response(html)).text();
  const results = [];
  for (const c of cards) {
    if (!c.homepage) continue;
    const homepage = absURL(pageURL, c.homepage);
    const id = aveProvider.parseMovieIDFromURL(homepage);
    if (!id) continue;
    const thumb = c.img ? absURL(pageURL, c.img) : "";
    results.push({
      id,
      number: aveParseNumber(thumb),
      title: c.title.trim(),
      provider: "AVE",
      homepage,
      actors: [],
      thumb_url: thumb,
      cover_url: thumb.replaceAll("jacket_images", "bigcover"),
      score: 0,
      release_date: ""
    });
  }
  return results;
}
__name(parseAveSearch, "parseAveSearch");
function parseAveCandidateIDs(html) {
  const ids = [];
  const seen = /* @__PURE__ */ new Set();
  const re = /(?:dvd|ppv)(?:%2F|\/)detail(?:%3F|\?)pro(?:%3D|=)(\d+)/gi;
  let m;
  while ((m = re.exec(html)) !== null) {
    if (!seen.has(m[1])) {
      seen.add(m[1]);
      ids.push(m[1]);
      if (ids.length >= 8) break;
    }
  }
  return ids;
}
__name(parseAveCandidateIDs, "parseAveCandidateIDs");
var aveProvider = {
  name: "AVE",
  priority: 998,
  normalizeMovieID(id) {
    return id.trim();
  },
  parseMovieIDFromURL(rawURL) {
    try {
      const u = new URL(rawURL);
      const productID = u.searchParams.get("product_id");
      if (productID) return productID;
      const old = /^\/(\d+)\/\d+\/\d+\/product_lists/.exec(u.pathname);
      if (old) return old[1];
      const pro = u.searchParams.get("pro");
      if (pro) return pro;
      return null;
    } catch {
      return null;
    }
  },
  async getMovieInfoByID(id) {
    const normalized = aveProvider.normalizeMovieID(id);
    if (!normalized) throw new ProviderError(`invalid id: ${id}`, "invalid");
    return aveProvider.getMovieInfoByURL(
      MOVIE_URL15.replace("%s", encodeURIComponent(normalized))
    );
  },
  async getMovieInfoByURL(rawURL) {
    const id = aveProvider.parseMovieIDFromURL(rawURL);
    if (!id) throw new ProviderError(`cannot parse id from url: ${rawURL}`, "invalid");
    const r = await fetchPage(rawURL, {
      providerName: "AVE",
      notFoundMessage: `movie not found: ${id}`,
      timeoutMs: 1e4
    });
    const info = await parseAvePage(r.text, rawURL, id);
    if (!isValidMovieInfo(info)) {
      throw new ProviderError(`incomplete metadata: ${id}`, "not_found");
    }
    return info;
  },
  normalizeMovieKeyword(keyword) {
    if (isSpecial(keyword)) return "";
    return keyword.trim().toUpperCase();
  },
  async searchMovie(keyword) {
    const q = encodeURIComponent(`site:aventertainments.com ${keyword}`);
    let ids = [];
    for (const template of [DDG_URL, DDG_LITE_URL, DDG_URL, DDG_LITE_URL, BING_URL]) {
      try {
        const r = await fetchText(template.replace("%s", q), {
          providerName: "AVE",
          timeoutMs: 6e3
        });
        ids = parseAveCandidateIDs(r.text);
      } catch {
        ids = [];
      }
      if (ids.length > 0) break;
    }
    if (ids.length === 0) {
      const url = SEARCH_URL8.replace("%s", encodeURIComponent(keyword));
      const r = await fetchPage(url, { providerName: "AVE" });
      return parseAveSearch(r.text, url);
    }
    const settled = await Promise.allSettled(
      ids.slice(0, 6).map((id) => aveProvider.getMovieInfoByID(id))
    );
    const infos = [];
    for (const s of settled) {
      if (s.status === "fulfilled" && isValidMovieInfo(s.value)) {
        infos.push(s.value);
      }
    }
    const norm = /* @__PURE__ */ __name((s) => s.toUpperCase().replace(/[-_\s]/g, ""), "norm");
    const kw = norm(keyword);
    const numberLike = /^[A-Z]+\d+$/.test(kw) || /^\d+$/.test(kw);
    let kept = infos;
    if (numberLike) {
      const exact = infos.filter((i) => norm(i.number) === kw);
      if (exact.length > 0) {
        kept = exact;
      } else {
        const near = infos.filter(
          (i) => compareStrings(norm(i.number), kw) >= 0.8
        );
        if (near.length > 0) kept = near;
      }
    } else if (keyword) {
      const sub = infos.filter(
        (i) => i.title.includes(keyword) || i.summary.includes(keyword) || i.actors.some((a) => a.includes(keyword)) || i.genres.some((g) => g.includes(keyword))
      );
      if (sub.length > 0) kept = sub;
    }
    return kept.map((i) => movieInfoToSearchResult(i));
  }
};

// src/providers/sod.ts
var MOVIE_URL16 = "https://ec.sod.co.jp/prime/videos/?id=%s";
var SEARCH_URL9 = "https://ec.sod.co.jp/prime/videos/genre/?search_type=1&sodsearch=%s";
var NOW_IMAGE = /\/thumbnail\/now_\w+\.jpg/;
function isValidImageURL(s) {
  return !NOW_IMAGE.test(s);
}
__name(isValidImageURL, "isValidImageURL");
async function fetchSodPage(url) {
  const r = await fetchPage(url, { providerName: "SOD" });
  if (!r.text.includes("pkg_age")) return { text: r.text, url };
  const m = /pkg_age[\s\S]{0,800}?<a[^>]+href="([^"]+)"/.exec(r.text);
  if (!m) return { text: r.text, url };
  try {
    const gate = await fetchText(absURL(url, m[1]), {
      referer: url,
      providerName: "SOD"
    });
    if (gate.status >= 200 && gate.status < 400 && gate.text) {
      return { text: gate.text, url };
    }
  } catch {
  }
  return { text: r.text, url };
}
__name(fetchSodPage, "fetchSodPage");
async function parseSodPage(html, pageURL, id) {
  const info = baseMovieInfo("SOD", id, pageURL);
  info.number = id;
  const fields = await collectFields(html, [
    { key: "title", selector: "p.product_title", mode: "text" },
    { key: "summary", selector: "div.videos_textli article", mode: "text" },
    { key: "cover", selector: "#videos_toptable div.videos_samimg a", mode: "attr", attr: "href" },
    { key: "thumb", selector: "#videos_toptable div.videos_samimg a img", mode: "attr", attr: "src" },
    { key: "previews", selector: "#videos_samsbox > a", mode: "attrs", attr: "href" },
    { key: "scoreText", selector: "#review_body div.imagestar i", mode: "text" }
  ]);
  info.title = fields.title.trim();
  info.summary = fields.summary.trim();
  if (fields.cover) info.cover_url = absURL(pageURL, fields.cover);
  if (fields.thumb) info.thumb_url = absURL(pageURL, fields.thumb);
  info.preview_images = fields.previews.map((u) => absURL(pageURL, u));
  if (fields.scoreText) info.score = parseScore(fields.scoreText);
  const rows = await collectPairsSeq(html, "#v_introduction td");
  for (const row of rows) {
    switch (row.label) {
      case "\u54C1\u756A":
        info.number = row.value;
        break;
      case "\u767A\u58F2\u5E74\u6708\u65E5":
        info.release_date = parseDateLoose(row.value);
        break;
      case "\u30B7\u30EA\u30FC\u30BA\u540D":
        info.series = row.value;
        break;
      case "\u51FA\u6F14\u8005":
        info.actors = row.valueTexts;
        break;
      case "\u518D\u751F\u6642\u9593":
        info.runtime = parseRuntime(row.value);
        break;
      case "\u76E3\u7763":
        info.director = row.value;
        break;
      case "\u30E1\u30FC\u30AB\u30FC":
        info.maker = row.value;
        break;
      case "\u30EC\u30FC\u30D9\u30EB":
        info.label = row.value;
        break;
      case "\u30B8\u30E3\u30F3\u30EB":
        info.genres = row.valueTexts;
        break;
    }
  }
  const samp = /videos_sampb[\s\S]{0,400}?<a[^>]+href="([^"]+)"/.exec(html);
  if (samp) {
    try {
      const sub = await fetchText(absURL(pageURL, samp[1]), {
        referer: pageURL,
        providerName: "SOD"
      });
      const src = /id="moviebox"[\s\S]{0,600}?<source[^>]+src="([^"]+)"/.exec(sub.text);
      if (src) info.preview_video_url = absURL(pageURL, src[1]);
    } catch {
    }
  }
  return info;
}
__name(parseSodPage, "parseSodPage");
async function parseSodSearch(html, pageURL) {
  const cards = [];
  let cur = null;
  const rw = new HTMLRewriter().on("#videos_s_mainbox", {
    element() {
      cur = { homepage: "", thumb: "", title: "", release: "" };
      cards.push(cur);
    }
  }).on("#videos_s_mainbox div.videis_s_img a", {
    element(el) {
      if (cur && !cur.homepage) cur.homepage = el.getAttribute("href") ?? "";
    }
  }).on("#videos_s_mainbox div.videis_s_img a img", {
    element(el) {
      if (cur && !cur.thumb) cur.thumb = el.getAttribute("src") ?? "";
    }
  }).on("#videos_s_mainbox div.videis_s_txt h2 a", {
    text(t) {
      if (cur) cur.title += t.text;
    }
  }).on("#videos_s_mainbox div.videis_s_star p", {
    text(t) {
      if (cur) cur.release += t.text;
    }
  });
  await rw.transform(new Response(html)).text();
  const results = [];
  for (const c of cards) {
    const thumb = c.thumb ? absURL(pageURL, c.thumb) : "";
    if (!thumb || !isValidImageURL(thumb) || !c.homepage) continue;
    const homepage = absURL(pageURL, c.homepage);
    const id = sodProvider.parseMovieIDFromURL(homepage);
    if (!id) continue;
    results.push({
      id,
      number: id,
      title: c.title.trim(),
      provider: "SOD",
      homepage,
      actors: [],
      thumb_url: thumb,
      cover_url: thumb.replaceAll("_m.jpg", "_l.jpg"),
      score: 0,
      release_date: parseDateLoose(c.release)
    });
  }
  return results;
}
__name(parseSodSearch, "parseSodSearch");
var sodProvider = {
  name: "SOD",
  priority: 999,
  normalizeMovieID(id) {
    return id.trim().toUpperCase();
  },
  parseMovieIDFromURL(rawURL) {
    try {
      const v = new URL(rawURL).searchParams.get("id");
      return v ? sodProvider.normalizeMovieID(v) : null;
    } catch {
      return null;
    }
  },
  async getMovieInfoByID(id) {
    const normalized = sodProvider.normalizeMovieID(id);
    if (!normalized) throw new ProviderError(`invalid id: ${id}`, "invalid");
    return sodProvider.getMovieInfoByURL(
      MOVIE_URL16.replace("%s", encodeURIComponent(normalized))
    );
  },
  async getMovieInfoByURL(rawURL) {
    const id = sodProvider.parseMovieIDFromURL(rawURL);
    if (!id) throw new ProviderError(`cannot parse id from url: ${rawURL}`, "invalid");
    const pageURL = MOVIE_URL16.replace("%s", encodeURIComponent(id));
    const page = await fetchSodPage(pageURL);
    const info = await parseSodPage(page.text, pageURL, id);
    info.homepage = rawURL;
    if (!isValidMovieInfo(info)) {
      throw new ProviderError(`incomplete metadata: ${id}`, "not_found");
    }
    if (!isValidImageURL(info.cover_url)) {
      throw new ProviderError("image not available", "upstream");
    }
    return info;
  },
  normalizeMovieKeyword(keyword) {
    if (isSpecial(keyword)) return "";
    return keyword.trim().toUpperCase();
  },
  async searchMovie(keyword) {
    const url = SEARCH_URL9.replace("%s", encodeURIComponent(keyword));
    const page = await fetchSodPage(url);
    return parseSodSearch(page.text, url);
  }
};

// src/providers/javfree.ts
var MOVIE_URL17 = "https://javfree.me/%s/%s";
var SEARCH_URL10 = "https://javfree.me/?s=%s";
function stripTags2(s) {
  return decodeEntities(s.replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
}
__name(stripTags2, "stripTags");
async function parseJavfreePage(html, pageURL, id) {
  const info = baseMovieInfo("JAVFREE", id, pageURL);
  const fields = await collectFields(html, [
    { key: "title", selector: "header.entry-header h1", mode: "text" },
    { key: "previews", selector: "div.entry-content > p img", mode: "attrs", attr: "src" }
  ]);
  info.title = fields.title.replace(/FC2(?:[-_]?PPV)?[-_]?\d+/gi, "").trim();
  const tail = pageURL.split("/").filter(Boolean).pop() ?? "";
  const num = fc2ParseNumber(tail);
  if (num) info.number = `FC2-${num.replace(/^FC2-/, "")}`;
  const authorBlock = /<span class="post-author">([\s\S]*?)<\/span>/.exec(html);
  if (authorBlock) {
    const inner = authorBlock[1];
    const strong = /<strong[^>]*>([\s\S]*?)<\/strong>/.exec(inner);
    if (strong) {
      info.director = stripTags2(strong[1]);
      const rest = stripTags2(inner.replace(strong[0], " "));
      const date = parseDateLoose(rest.replace(info.director, ""));
      if (date) info.release_date = date;
    }
  }
  info.preview_images = fields.previews.filter(Boolean);
  if (info.preview_images.length > 0) {
    info.cover_url = info.preview_images[0];
    info.preview_images = info.preview_images.slice(1);
  }
  info.thumb_url = info.cover_url;
  return info;
}
__name(parseJavfreePage, "parseJavfreePage");
async function parseJavfreeSearch(html, pageURL, fc2ID) {
  const cards = [];
  let cur = null;
  const rw = new HTMLRewriter().on("article.hentry", {
    element() {
      cur = { homepage: "", title: "", thumb: "" };
      cards.push(cur);
    }
  }).on("article.hentry h2 a", {
    element(el) {
      if (cur && !cur.homepage) cur.homepage = el.getAttribute("href") ?? "";
    },
    text(t) {
      if (cur) cur.title += t.text;
    }
  }).on("article.hentry a div img", {
    element(el) {
      if (cur && !cur.thumb) cur.thumb = el.getAttribute("src") ?? "";
    }
  }).on("article.hentry img", {
    element(el) {
      if (cur && !cur.thumb) cur.thumb = el.getAttribute("src") ?? "";
    }
  });
  await rw.transform(new Response(html)).text();
  const results = [];
  for (const c of cards) {
    if (!c.homepage) continue;
    const homepage = absURL(pageURL, c.homepage);
    const id = javfreeProvider.parseMovieIDFromURL(homepage);
    if (!id) continue;
    const thumb = c.thumb ? absURL(pageURL, c.thumb) : "";
    const base = thumb.split("/").pop() ?? "";
    results.push({
      id,
      number: `FC2-${fc2ID}`,
      title: c.title.trim(),
      provider: "JAVFREE",
      homepage,
      actors: [],
      thumb_url: thumb,
      cover_url: base ? `https://cf.javfree.me/HLIC/${base}` : "",
      score: 0,
      release_date: ""
    });
  }
  return results;
}
__name(parseJavfreeSearch, "parseJavfreeSearch");
var javfreeProvider = {
  name: "JAVFREE",
  priority: 993,
  normalizeMovieID(id) {
    return id.trim();
  },
  parseMovieIDFromURL(rawURL) {
    try {
      const m = /\/(\d+)\/fc2-ppv-(\d+)/.exec(new URL(rawURL).pathname);
      return m ? `${m[1]}-${m[2]}` : null;
    } catch {
      return null;
    }
  },
  async getMovieInfoByID(id) {
    const parts = id.split("-", 2);
    if (parts.length !== 2 || !parts[0] || !parts[1]) {
      throw new ProviderError(`invalid id: ${id}`, "invalid");
    }
    return javfreeProvider.getMovieInfoByURL(
      MOVIE_URL17.replace("%s", parts[0]).replace("%s", `fc2-ppv-${parts[1]}`)
    );
  },
  async getMovieInfoByURL(rawURL) {
    const id = javfreeProvider.parseMovieIDFromURL(rawURL);
    if (!id) throw new ProviderError(`cannot parse id from url: ${rawURL}`, "invalid");
    const r = await fetchPage(rawURL, {
      providerName: "JAVFREE",
      notFoundMessage: `movie not found: ${id}`
    });
    const info = await parseJavfreePage(r.text, rawURL, id);
    if (!isValidMovieInfo(info)) {
      throw new ProviderError(`incomplete metadata: ${id}`, "not_found");
    }
    return info;
  },
  normalizeMovieKeyword(keyword) {
    return fc2ParseNumber(keyword);
  },
  async searchMovie(keyword) {
    const fc2ID = keyword.slice(keyword.lastIndexOf("-") + 1);
    const url = SEARCH_URL10.replace("%s", encodeURIComponent(fc2ID));
    const r = await fetchPage(url, { providerName: "JAVFREE" });
    return parseJavfreeSearch(r.text, url, fc2ID);
  }
};

// src/providers/fc2ppvdb.ts
var MOVIE_URL18 = "https://fc2ppvdb.com/articles/%s";
function stripTags3(s) {
  return decodeEntities(s.replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
}
__name(stripTags3, "stripTags");
function textPieces(inner) {
  return inner.split(/<[^>]+>/).map((t) => decodeEntities(t).trim()).filter(Boolean);
}
__name(textPieces, "textPieces");
async function parseFc2ppvdbPage(html, pageURL, id) {
  const info = baseMovieInfo("FC2PPVDB", id, pageURL);
  info.number = `FC2-${id}`;
  try {
    const fields = await collectFields(html, [
      { key: "cover", selector: "main a > img", mode: "attr", attr: "src" },
      { key: "title", selector: "main h2 a", mode: "text" },
      { key: "ogTitle", selector: 'meta[property="og:title"]', mode: "attr", attr: "content" },
      { key: "ogImage", selector: 'meta[property="og:image"]', mode: "attr", attr: "content" }
    ]);
    if (fields.cover) info.cover_url = absURL(pageURL, fields.cover);
    info.title = fields.title.trim();
    if (!info.title) info.title = fields.ogTitle.trim();
    if (!info.cover_url && fields.ogImage) {
      info.cover_url = absURL(pageURL, fields.ogImage);
    }
  } catch {
  }
  info.thumb_url = info.cover_url;
  const rowRe = /(ID|販売者|女優|モザイク|販売日|収録時間|タグ)：<span[^>]*>([\s\S]*?)<\/span>/g;
  let m;
  while ((m = rowRe.exec(html)) !== null) {
    const label = m[1];
    const inner = m[2];
    switch (label) {
      case "ID":
        info.id = stripTags3(inner) || info.id;
        break;
      case "\u8CA9\u58F2\u8005":
        info.maker = stripTags3(inner);
        break;
      case "\u5973\u512A":
        info.actors = textPieces(inner);
        break;
      case "\u8CA9\u58F2\u65E5":
        info.release_date = parseDateLoose(stripTags3(inner));
        break;
      case "\u53CE\u9332\u6642\u9593":
        info.runtime = parseRuntime(stripTags3(inner));
        break;
      case "\u30BF\u30B0":
        info.genres = textPieces(inner);
        break;
    }
  }
  return info;
}
__name(parseFc2ppvdbPage, "parseFc2ppvdbPage");
var fc2ppvdbProvider = {
  name: "FC2PPVDB",
  priority: 998,
  normalizeMovieID(id) {
    return fc2ParseNumber(id).replace(/^FC2-/, "");
  },
  parseMovieIDFromURL(rawURL) {
    try {
      const parts = new URL(rawURL).pathname.split("/").filter(Boolean);
      return parts[parts.length - 1] ?? null;
    } catch {
      return null;
    }
  },
  async getMovieInfoByID(id) {
    const normalized = fc2ppvdbProvider.normalizeMovieID(id);
    if (!normalized) throw new ProviderError(`invalid id: ${id}`, "invalid");
    return fc2ppvdbProvider.getMovieInfoByURL(MOVIE_URL18.replace("%s", normalized));
  },
  async getMovieInfoByURL(rawURL) {
    const id = fc2ppvdbProvider.parseMovieIDFromURL(rawURL);
    if (!id) throw new ProviderError(`cannot parse id from url: ${rawURL}`, "invalid");
    const r = await fetchPage(rawURL, {
      providerName: "FC2PPVDB",
      notFoundMessage: `movie not found: ${id}`
    });
    const info = await parseFc2ppvdbPage(r.text, rawURL, id);
    if (!isValidMovieInfo(info)) {
      throw new ProviderError(`incomplete metadata: ${id}`, "not_found");
    }
    return info;
  }
};

// src/index.ts
var providers = /* @__PURE__ */ new Map();
for (const p of [
  new FanzaProvider(),
  new JavbusProvider(),
  new AvbaseProvider(),
  ...pondoProviders,
  ...caribProviders,
  ...site0930Providers,
  ...falenoProviders,
  heyzoProvider,
  heydougaProvider,
  kin8Provider,
  mywifeProvider,
  pcolleProvider,
  gcolleProvider,
  tokyohotProvider,
  madouquProvider,
  fc2hubProvider,
  dugaProvider,
  mgsProvider,
  getchuProvider,
  aveProvider,
  sodProvider,
  javfreeProvider,
  fc2ppvdbProvider
]) {
  providers.set(p.name.toUpperCase(), p);
}
function getProvider(name) {
  const provider = providers.get(name.toUpperCase());
  if (!provider) {
    throw new ProviderError(`provider not found: ${name}`, "not_found");
  }
  return provider;
}
__name(getProvider, "getProvider");
var actorProviders = /* @__PURE__ */ new Map();
for (const p of [new AvleagueProvider()]) {
  actorProviders.set(p.name.toUpperCase(), p);
}
function getActorProvider(name) {
  const provider = actorProviders.get(name.toUpperCase());
  if (!provider) {
    throw new ProviderError(`actor provider not found: ${name}`, "not_found");
  }
  return provider;
}
__name(getActorProvider, "getActorProvider");
async function getMovieInfo(env, provider, id, lazy) {
  const normalized = provider.normalizeMovieID(id);
  if (lazy) {
    const cached = await getMovieInfoFromDB(env.DB, provider.name, normalized);
    if (cached && isValidMovieInfo(cached)) {
      return cached;
    }
  }
  const info = await provider.getMovieInfoByID(normalized);
  await saveMovieInfoToDB(env.DB, info);
  return info;
}
__name(getMovieInfo, "getMovieInfo");
async function getActorInfo(env, provider, id, lazy) {
  const normalized = provider.normalizeActorID(id);
  if (lazy) {
    const cached = await getActorInfoFromDB(env.DB, provider.name, normalized);
    if (cached && isValidActorInfo(cached)) {
      return cached;
    }
  }
  const info = await provider.getActorInfoByID(normalized);
  await saveActorInfoToDB(env.DB, info);
  return info;
}
__name(getActorInfo, "getActorInfo");
function dedupeActorResults(results) {
  const seen = /* @__PURE__ */ new Set();
  const out = [];
  for (const r of results) {
    const key = `${r.provider}|${r.id}`;
    if (!seen.has(key)) {
      seen.add(key);
      out.push(r);
    }
  }
  return out;
}
__name(dedupeActorResults, "dedupeActorResults");
async function searchActorSingle(env, provider, keyword, fallback) {
  const names = parseActorNames(keyword);
  if (names.length === 0) {
    throw new ProviderError("invalid keyword", "invalid");
  }
  const all = [];
  let firstError;
  for (const name of names) {
    let live = [];
    try {
      live = await provider.searchActor(name);
    } catch (e) {
      if (firstError === void 0) firstError = e;
    }
    let merged = live;
    if (fallback) {
      const dbResults = await searchActorFromDB(env.DB, name, provider.name).catch(
        () => []
      );
      if (dbResults.length > 0) {
        merged = dedupeActorResults([...dbResults, ...live]);
      }
    }
    const scored = merged.map((r) => ({ r, s: compareStrings(r.name, name) })).filter((x) => x.s >= 0.3);
    scored.sort((a, b) => b.s - a.s);
    all.push(...scored.map((x) => x.r));
  }
  if (all.length === 0) {
    if (firstError) throw firstError;
    throw new ProviderError("info not found", "not_found");
  }
  return all;
}
__name(searchActorSingle, "searchActorSingle");
async function searchActorAll(env, keyword, fallback) {
  const settled = await Promise.allSettled(
    [...actorProviders.values()].map((p) => searchActorSingle(env, p, keyword, fallback))
  );
  let results = settled.flatMap(
    (s) => s.status === "fulfilled" ? s.value : []
  );
  const priorities = new Map(
    [...actorProviders.values()].map((p) => [p.name, p.priority])
  );
  results = [...results].sort(
    (a, b) => (priorities.get(b.provider) ?? 0) - (priorities.get(a.provider) ?? 0)
  );
  if (results.length === 0) {
    throw new ProviderError("info not found", "not_found");
  }
  return results;
}
__name(searchActorAll, "searchActorAll");
function actorProviderForURL(rawURL) {
  try {
    const host = new URL(rawURL).hostname;
    if (host.includes("av-league.com")) return actorProviders.get("AV-LEAGUE") ?? null;
  } catch {
  }
  return null;
}
__name(actorProviderForURL, "actorProviderForURL");
var app = new Hono3();
function dedupeSearchResults(results) {
  const seen = /* @__PURE__ */ new Set();
  const out = [];
  for (const r of results) {
    const key = `${r.provider}|${r.id}`;
    if (!seen.has(key)) {
      seen.add(key);
      out.push(r);
    }
  }
  return out;
}
__name(dedupeSearchResults, "dedupeSearchResults");
async function searchSingleProvider(env, provider, keyword, fallback) {
  const searcher = asSearcher(provider);
  if (!searcher) {
    const info = await getMovieInfo(env, provider, keyword, true);
    return [movieInfoToSearchResult(info)];
  }
  const kw = searcher.normalizeMovieKeyword(keyword.trim());
  if (!kw) {
    throw new ProviderError("invalid keyword", "invalid");
  }
  let live = [];
  let liveError;
  try {
    live = await searcher.searchMovie(kw);
  } catch (e) {
    liveError = e;
  }
  let merged = live;
  if (fallback) {
    const dbResults = await searchMovieFromDB(env.DB, kw, provider.name).catch(
      () => []
    );
    if (dbResults.length > 0) {
      merged = dedupeSearchResults([...live, ...dbResults]);
    }
  }
  if (merged.length === 0) {
    if (liveError) throw liveError;
    throw new ProviderError("info not found", "not_found");
  }
  return merged;
}
__name(searchSingleProvider, "searchSingleProvider");
async function searchAllProviders(env, keyword, fallback) {
  const searchers = [...providers.values()].map((p) => asSearcher(p)).filter((s) => s !== null);
  const settled = await Promise.allSettled(
    searchers.map(async (s) => {
      const kw = s.normalizeMovieKeyword(keyword);
      if (!kw) return [];
      return s.searchMovie(kw);
    })
  );
  let results = settled.flatMap(
    (s) => s.status === "fulfilled" ? s.value : []
  );
  if (fallback) {
    const dbResults = await searchMovieFromDB(env.DB, keyword).catch(
      () => []
    );
    results = [...results, ...dbResults];
  }
  results = dedupeSearchResults(results).filter(isValidSearchResult);
  const priorities = new Map(
    [...providers.values()].map((p) => [p.name, p.priority])
  );
  const score = /* @__PURE__ */ __name((r) => compareStrings(keyword, r.number) * (priorities.get(r.provider) ?? 0), "score");
  results = [...results].sort((a, b) => score(b) - score(a));
  if (results.length === 0) {
    throw new ProviderError("info not found", "not_found");
  }
  return results;
}
__name(searchAllProviders, "searchAllProviders");
var HOST_PROVIDERS = [
  ["dmm.co.jp", "FANZA"],
  ["javbus.com", "JAVBUS"],
  ["avbase.net", "AVBASE"],
  ["1pondo.tv", "1PONDO"],
  ["10musume.com", "10MUSUME"],
  ["pacopacomama.com", "PACOPACOMAMA"],
  ["muramura.tv", "MURAMURA"],
  ["caribbeancompr.com", "CARIBBEANCOMPR"],
  ["caribbeancom.com", "CARIBBEANCOM"],
  ["heyzo.com", "HEYZO"],
  ["heydouga.com", "HEYDOUGA"],
  ["kin8tengoku.com", "KIN8"],
  ["mywife.cc", "MYWIFE"],
  ["pcolle.com", "PCOLLE"],
  ["gcolle.net", "GCOLLE"],
  ["c0930.com", "C0930"],
  ["h0930.com", "H0930"],
  ["h4610.com", "H4610"],
  ["faleno.jp", "FALENO"],
  ["dahlia-av.jp", "DAHLIA"],
  ["tokyo-hot.com", "TOKYO-HOT"],
  ["madouqu.com", "MADOUQU"],
  ["javten.com", "FC2HUB"],
  ["duga.jp", "DUGA"],
  ["mgstage.com", "MGS"],
  ["getchu.com", "GETCHU"],
  ["aventertainments.com", "AVE"],
  ["sod.co.jp", "SOD"],
  ["javfree.me", "JAVFREE"],
  ["fc2ppvdb.com", "FC2PPVDB"]
];
function providerForURL(rawURL) {
  try {
    const host = new URL(rawURL).hostname;
    for (const [needle, name] of HOST_PROVIDERS) {
      if (host.includes(needle)) return providers.get(name) ?? null;
    }
  } catch {
  }
  return null;
}
__name(providerForURL, "providerForURL");
app.get(
  "/",
  (c) => c.json({
    data: {
      name: "metatube-worker",
      version: "0.1.0",
      providers: [...providers.values()].map((p) => p.name),
      actor_providers: [...actorProviders.values()].map((p) => p.name)
    }
  })
);
app.get(
  "/v1/providers",
  (c) => c.json({
    data: [
      ...[...providers.values()].map((p) => ({ name: p.name, type: "movie" })),
      ...[...actorProviders.values()].map((p) => ({ name: p.name, type: "actor" }))
    ]
  })
);
app.get("/v1/movies/search", async (c) => {
  const q = (c.req.query("q") ?? "").trim();
  if (!q) {
    throw new ProviderError("missing query parameter: q", "invalid");
  }
  const fallback = c.req.query("fallback") !== "false";
  if (/^https?:\/\//i.test(q)) {
    const provider = providerForURL(q);
    const id = provider?.parseMovieIDFromURL(q);
    if (provider && id) {
      const info = await getMovieInfo(c.env, provider, id, true);
      return c.json({ data: [movieInfoToSearchResult(info)] });
    }
    throw new ProviderError(`unsupported url: ${q}`, "not_found");
  }
  const providerName = c.req.query("provider");
  if (providerName) {
    const provider = getProvider(providerName);
    return c.json({ data: await searchSingleProvider(c.env, provider, q, fallback) });
  }
  return c.json({ data: await searchAllProviders(c.env, q, fallback) });
});
app.get("/v1/movies/:provider/:id", async (c) => {
  const provider = getProvider(c.req.param("provider"));
  const lazy = c.req.query("lazy") !== "false";
  const info = await getMovieInfo(c.env, provider, c.req.param("id"), lazy);
  return c.json({ data: info });
});
app.post("/v1/movies/:provider/lookup", async (c) => {
  const provider = getProvider(c.req.param("provider"));
  const body = await c.req.json().catch(() => ({}));
  if (!body.url) {
    throw new ProviderError("missing url", "invalid");
  }
  const id = provider.parseMovieIDFromURL(body.url);
  if (!id) {
    throw new ProviderError(`cannot parse movie id from url: ${body.url}`, "invalid");
  }
  const lazy = c.req.query("lazy") !== "false";
  const info = await getMovieInfo(c.env, provider, id, lazy);
  return c.json({ data: info });
});
app.get("/v1/actors/search", async (c) => {
  const q = (c.req.query("q") ?? "").trim();
  if (!q) {
    throw new ProviderError("missing query parameter: q", "invalid");
  }
  const fallback = c.req.query("fallback") !== "false";
  if (/^https?:\/\//i.test(q)) {
    const provider = actorProviderForURL(q);
    const id = provider?.parseActorIDFromURL(q);
    if (provider && id) {
      const info = await getActorInfo(c.env, provider, id, true);
      return c.json({ data: [actorInfoToSearchResult(info)] });
    }
    throw new ProviderError(`unsupported url: ${q}`, "not_found");
  }
  const providerName = c.req.query("provider");
  if (providerName) {
    const provider = getActorProvider(providerName);
    return c.json({ data: await searchActorSingle(c.env, provider, q, fallback) });
  }
  return c.json({ data: await searchActorAll(c.env, q, fallback) });
});
app.get("/v1/actors/:provider/:id", async (c) => {
  const provider = getActorProvider(c.req.param("provider"));
  const lazy = c.req.query("lazy") !== "false";
  const info = await getActorInfo(c.env, provider, c.req.param("id"), lazy);
  return c.json({ data: info });
});
app.post("/v1/actors/:provider/lookup", async (c) => {
  const provider = getActorProvider(c.req.param("provider"));
  const body = await c.req.json().catch(() => ({}));
  if (!body.url) {
    throw new ProviderError("missing url", "invalid");
  }
  const id = provider.parseActorIDFromURL(body.url);
  if (!id) {
    throw new ProviderError(`cannot parse actor id from url: ${body.url}`, "invalid");
  }
  const lazy = c.req.query("lazy") !== "false";
  const info = await getActorInfo(c.env, provider, id, lazy);
  return c.json({ data: info });
});
app.onError((err, c) => {
  if (err instanceof ProviderError) {
    const status = err.kind === "not_found" ? 404 : err.kind === "invalid" ? 400 : err.kind === "unsupported" ? 501 : 502;
    return c.json({ error: err.message }, status);
  }
  return c.json({ error: String(err) }, 500);
});
app.notFound((c) => c.json({ error: "not found" }, 404));
var index_default = app;
export {
  index_default as default
};
