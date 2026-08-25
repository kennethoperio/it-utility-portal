const https = require('https');

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const fileId = req.query.fileId || req.query.id;
  const fileName = req.query.fileName || req.query.name || 'software_installer.exe';

  if (!fileId) {
    return res.status(400).send('Missing fileId');
  }

  const cleanName = fileName.replace(/[^a-zA-Z0-9_.-]/g, '_');

  // Direct Google Drive Binary Stream Endpoint
  const targetUrl = `https://drive.usercontent.google.com/download?id=${fileId}&export=download&confirm=t`;

  // Force binary attachment download headers to bypass Google virus warning pages
  res.setHeader('Content-Type', 'application/octet-stream');
  res.setHeader('Content-Disposition', `attachment; filename="${cleanName}"`);

  https.get(targetUrl, (gRes) => {
    if (gRes.headers['content-length']) {
      res.setHeader('Content-Length', gRes.headers['content-length']);
    }
    gRes.pipe(res);
  }).on('error', (err) => {
    res.status(500).send('Stream error: ' + err.message);
  });
};
