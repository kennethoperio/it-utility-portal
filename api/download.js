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
  const fileName = req.query.fileName || req.query.name || 'software_installer.exe';

  if (!fileId) {
    return res.status(400).json({ error: 'Missing fileId parameter' });
  }

  const sanitizedFileName = fileName.replace(/[^a-zA-Z0-9_.-]/g, '_');
  
  // Set headers for automatic direct browser binary download
  res.setHeader('Content-Type', 'application/octet-stream');
  res.setHeader('Content-Disposition', `attachment; filename="${sanitizedFileName}"`);

  // Direct binary stream from Google Drive usercontent endpoint
  const directUrl = `https://drive.usercontent.google.com/download?id=${fileId}&export=download&confirm=t&authuser=0`;

  https.get(directUrl, (gRes) => {
    if (gRes.headers['content-length']) {
      res.setHeader('Content-Length', gRes.headers['content-length']);
    }
    gRes.pipe(res);
  }).on('error', (err) => {
    res.status(500).send('Streaming error: ' + err.message);
  });
};
