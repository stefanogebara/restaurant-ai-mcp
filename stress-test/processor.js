/**
 * Artillery processor — injects auth header before every request
 */
module.exports = {
  setAuthHeader(requestParams, context, ee, next) {
    const jwt = process.env.TEST_JWT;
    if (!jwt) {
      return next(new Error('TEST_JWT env var is required'));
    }
    requestParams.headers = requestParams.headers || {};
    requestParams.headers['Authorization'] = `Bearer ${jwt}`;
    return next();
  }
};
