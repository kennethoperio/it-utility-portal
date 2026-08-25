const fs = require('fs');
const path = require('path');

module.exports = (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Content-Type', 'application/json');

  try {
    const manifestPath = path.join(process.cwd(), 'vault_manifest.json');
    if (fs.existsSync(manifestPath)) {
      const data = fs.readFileSync(manifestPath, 'utf8');
      return res.status(200).send(data);
    }
  } catch (err) {
    console.warn('Manifest reading error:', err);
  }

  res.status(200).json({ categories: [], files: [], passcodes: [] });
};
