module.exports = {
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'", 'http://localhost:*'],
      styleSrc: ["'self'", "'unsafe-inline'", 'http://localhost:*'],
      imgSrc: ["'self'", 'http://localhost:*'],
      fontSrc: ["'self'", 'http://localhost:*'],
      frameSrc: ["'self'", 'http://localhost:*'],
      frameAncestors: ["'self'", 'http://localhost:*'],
      objectSrc: ["'self'", 'http://localhost:*'],
      connectSrc: ["'self'", 'http://localhost:*', 'ws://localhost:*'],
    },
  },
  crossOriginResourcePolicy: {
    policy: 'cross-origin',
  },
  crossOriginOpenerPolicy: {
    policy: 'same-origin-allow-popups',
  },
  crossOriginEmbedderPolicy: {
    policy: 'credentialless',
  },
}
