module.exports = async (req, res) => {
  res.status(200).json({ message: "Test endpoint works!", method: req.method });
};
