/**
 * The one serverless function.
 * ============================
 * Vercel compiles every .js file under api/ as its own function, each with
 * its own copy of node_modules. Until 2026-11-24 this project had 162 of them
 * and an ~11 minute production build. Everything the server is lives under
 * api/_app/, which the underscore keeps out of that compilation; this file is
 * the only entry, and vercel.json rewrites /api/* to it.
 *
 * Never add a second .js file directly under api/ (vercel-config.test.js
 * fails if you do). A new endpoint goes under api/_app/ plus one line in
 * api/_app/routes.js.
 */
const { route } = require('./_app/router');

module.exports = route;
