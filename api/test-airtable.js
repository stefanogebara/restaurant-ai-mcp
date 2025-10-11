module.exports = async (req, res) => {
  try {
    const airtable = require('./_lib/airtable');
    res.status(200).json({
      message: "Airtable module loaded successfully!",
      functions: Object.keys(airtable)
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: true,
      message: error.message,
      stack: error.stack
    });
  }
};
