const https = require('https');
const http = require('http');

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const fileId = req.query.fileId || req.query.id;
  const fileName = req.query.fileName || req.query.name || 'installer.exe';

  if (!fileId) {
    return res.status(400).json({ error: 'Missing fileId parameter' });
  }

  const gdriveUrl = `https://drive.google.com/uc?export=download&id=${fileId}&confirm=t`;

  // Set Attachment Header so Browser saves directly into Downloads folder without opening any pages!
  const sanitizedFileName = fileName.replace(/[^a-zA-Z0-9_.-]/g, '_');
  res.setHeader('Content-Type', 'application/octet-stream');
  res.setHeader('Content-Disposition', `attachment; filename="${sanitizedFileName}"`);

  https.get(gdriveUrl, (gRes) => {
    // Handle Google Drive Redirects (302/303) automatically on Vercel backend
    if (gRes.statusCode === 302 || gRes.statusCode === 301 || gRes.statusCode === 303) {
      const redirectUrl = gRes.headers.location;
      if (redirectUrl) {
        const client = redirectUrl.startsWith('https') ? https : http;
        client.get(redirectUrl, (finalRes) => {
          if (finalRes.headers['content-length']) {
            res.setHeader('Content-Length', finalRes.headers['content-length']);
          }
          finalRes.pipe(res);
        }).on('error', (err) => {
          res.status(500).json({ error: 'Error streaming from Google Drive' });
        });
        return;
      }
    }

    if (gRes.headers['content-length']) {
      res.setHeader('Content-Length', gRes.headers['content-length']);
    }
    gRes.pipe(res);
  }).on('error', (err) => {
    res.status(500).json({ error: 'Serverless streaming error: ' + err.message });
  });
};
