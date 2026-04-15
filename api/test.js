module.exports = function (req, res) {
  res.status(200).json({ ok: true, time: new Date().toISOString(), node: process.version });
};
