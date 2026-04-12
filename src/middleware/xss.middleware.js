const xss = require("xss");

const sanitizeInput = (obj) => {
  try {
    if (typeof obj !== "object") {
      if (typeof obj === "string") {
        return xss(obj);
      } else {
        return obj;
      }
    }
    for (const key in obj) {
      if (Object.prototype.hasOwnProperty.call(obj, key)) {
        obj[key] = sanitizeInput(obj[key]);
      }
    }
    return obj;
  } catch (err) {
    console.error(`Error sanitizing object: ${err}`);
    return obj; // or return an empty object, depending on your requirements
  }
};

module.exports = (req, res, next) => {
  // Sanitize all parts of the request except `markdown` field
  if (req.body && req.body.markdown) {
    // Leave markdown field unsanitized
    const markdown = req.body.markdown;
    delete req.body.markdown;
    req.body = sanitizeInput(req.body);
    req.body.markdown = markdown;
  } else {
    req.body = sanitizeInput(req.body);
  }
  req.query = sanitizeInput(req.query);
  req.params = sanitizeInput(req.params);
  req.headers = sanitizeInput(req.headers);
  req.cookies = sanitizeInput(req.cookies);
  req.url = sanitizeInput(req.url);

  // Sanitize responses
  res.locals.safeOutput = sanitizeInput(res.locals.safeOutput);

  next();
};
