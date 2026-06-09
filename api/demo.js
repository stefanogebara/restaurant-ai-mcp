// Diagnostic stub — full demo.js saved as api/demo.js.bak.
// Goal: prove whether `api/demo.js` is a function Vercel actually deploys.
module.exports = (req, res) => {
  res.setHeader('Content-Type', 'application/json');
  res.status(200).end(JSON.stringify({ diagnostic: 'demo.js-min', method: req.method }));
};
