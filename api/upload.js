const crypto = require('crypto');
const https = require('https');

const GDRIVE_CREDENTIALS = {
  client_email: "it-portal-storage@fluid-arc-506004-a6.iam.gserviceaccount.com",
  private_key: "-----BEGIN PRIVATE KEY-----\nMIIEvAIBADANBgkqhkiG9w0BAQEFAASCBKYwggSiAgEAAoIBAQDAEYqKK4hdGAFc\nAMhToJJbwXzFfHCzE76dQVDrPxvLnchIvr3odOm/hIhKuTGg7iwU46toTu3RaIJz\nEtC5qFtUDiWoevnP6iSqCtraCdkn0+NwHl0fBie9Kuf7ug4aAB+6EIpOYATdHjWb\n4eQBoNH5Ex6xii/AaUYibbUNIAaqmpFZt+q9UXo0RWsvSzB7zFRWi/PZWAHTfDjD\nXDplmnKMAexVE6gProbDGKWrGRHuf/MlvM6tvTl8Q1NzF1WJZ32pjQ03qdbvnKzD\nwFsQCbXxyv5W6ek89MvwJlHtDQ6c0XcVzzcwHDh3BZJF9Y1mB6holj/XXxoYd5P3\nr9KsDtHFAgMBAAECggEABSrjppSFwnVxIevOd/uHvIq/4+NVd+f11q7Jcc7cnVWV\nLCnfm6e7m0DCVvpVFL6btoMqmy+Wc+4jJlvw/DHEpUYNKtOGMZsb2exZV4jwzALG\nKX/ToxBMFOmY3Lu0gewTbnLf+bxZHSbhK9y/wPB1/cTPLFkqsDtU3PvFJYGBVGkw\ntAzLyOykB0SGeXxpiaMKX/Kqo4Pt1ep8h0c0LDiui9X1dibY2Na3ONQj4lQo4888\nnVUainDAmxR6http8zfDCIiUy+KCreBFs0Bb+WUxHqqhjvHGtYQJ1QivLaliRyOg\nxiS2MiIlKuL8dDPZqRpj/dUanTckgpl8GyJo3fsJmQKBgQD3AxVN3zunCuynJPJ5\nhVnXsgvgDhAOPPLwxtaun4Ky5F90dPRHjVaI4WvgWdX5ifCMqmzLh8nGunwJ2teg\n+kmTEUmW10Aa7Mo3lUlrI1z2AqCLpbFHFwwOcPVcNibC2dNtI1EU4nxi+II0MGAi\n7L01kneEstcFRlDbZpv1F1isnQKBgQDHDqi8DPR5oY2mrMEHGTVAt/MEH7J3qFjx\nMvga8EEWgpM3gWqMJaIQdX6kp62Oy/yzT8LfiOzxyHsocYdrSxpAERQMJDBNy3DF\nwazODyHpu3FpWmMv4Vhf11EpD2sBUGGc8gXe0GNIqKGW5byi2WWVr2CwkgBMnCSD\naUII3MYtSQKBgBvsxE7Oat8ClCh9O9BTLAn/feoxjM0fRNPFluWc8NiqisQOqMMi\nDmNhIKH3ZgJU/tXYOn5z9nK6CGXQ0MnJIeI3dRtRcFTa6i2IeglbsRm6yE2hSL5h\ns6I6UPLAyHcEyysub+8tf6RstcOSqHuqSeWxjkN5OGfHQELdgcoefo7dAoGAGIkY\nB0XZhHyDRz4X9NYImFeUHrgBeXpIrEJKDpf6jdm+Z6MODQQ+e6Tf3U/Ftsox9bAp\nJwBrpEm/1HZZ6MGzFJ6GSBDV22DuH5IFyMhYt8Sg8AlyHF68U+PoXxVFbT4JKh0y\n2An7kuMmN8FNhQ0i1lZtppX4b3j3jzMULp931fECgYAi5RilEdekd+qxxl2bLmCT\nb7KWuPNMmvGq21YeOmhT7iqTJisBnnlfNyy4x5MakVswlCi7knSmMXBRtoIB6xfk\nHwq1slLSUDyYGDsHaBBLzhXszyqaFM5SkeMTFDNMngpqZHBfFnz+p378YZJT4m2T\nSy92OWfpSxgS01wOCKKsUQ==\n-----END PRIVATE KEY-----\n"
};

const DEFAULT_PARENT_FOLDER_ID = '15FIr_ZPXyTJUILkgpsvK_sGbmhPj3QJ3';

function base64UrlEncode(str) {
  return Buffer.from(str)
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

function getGoogleAccessToken() {
  return new Promise((resolve, reject) => {
    const now = Math.floor(Date.now() / 1000);
    const header = base64UrlEncode(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
    const claimSet = base64UrlEncode(JSON.stringify({
      iss: GDRIVE_CREDENTIALS.client_email,
      scope: 'https://www.googleapis.com/auth/drive https://www.googleapis.com/auth/drive.file',
      aud: 'https://oauth2.googleapis.com/token',
      exp: now + 3600,
      iat: now
    }));

    const unsignedToken = `${header}.${claimSet}`;
    const signer = crypto.createSign('RSA-SHA256');
    signer.update(unsignedToken);
    const signature = signer.sign(GDRIVE_CREDENTIALS.private_key, 'base64')
      .replace(/=/g, '')
      .replace(/\+/g, '-')
      .replace(/\//g, '_');

    const jwt = `${unsignedToken}.${signature}`;
    const postData = `grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=${jwt}`;

    const req = https.request('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': Buffer.byteLength(postData)
      }
    }, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(body);
          if (parsed.access_token) resolve(parsed.access_token);
          else reject(new Error(parsed.error_description || 'Auth failed'));
        } catch (e) {
          reject(e);
        }
      });
    });

    req.on('error', reject);
    req.write(postData);
    req.end();
  });
}

function createRealGDriveFolder(accessToken, folderName, parentId) {
  return new Promise((resolve, reject) => {
    const fileMetadata = JSON.stringify({
      name: folderName,
      mimeType: 'application/vnd.google-apps.folder',
      parents: [parentId || DEFAULT_PARENT_FOLDER_ID]
    });

    const req = https.request('https://www.googleapis.com/drive/v3/files?supportsAllDrives=true&fields=id,name,webViewLink', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json; charset=UTF-8'
      }
    }, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(body);
          if (parsed.id) resolve(parsed);
          else reject(new Error(body));
        } catch (e) {
          reject(e);
        }
      });
    });

    req.on('error', reject);
    req.write(fileMetadata);
    req.end();
  });
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS, PATCH, DELETE, POST, PUT');
  res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    let bodyData = '';
    req.on('data', chunk => { bodyData += chunk; });
    req.on('end', async () => {
      let payload = {};
      try { payload = JSON.parse(bodyData); } catch (e) {}

      const fileName = payload.title || 'Vault_Tool';
      const targetFolderId = payload.folder_id || DEFAULT_PARENT_FOLDER_ID;
      const fileSize = payload.size || 52428800;
      const mimeType = payload.mimeType || 'application/octet-stream';

      try {
        const token = await getGoogleAccessToken();
        const locationUrl = await initResumableSession(token, fileName, targetFolderId, fileSize, mimeType);

        return res.status(200).json({
          success: true,
          location_url: locationUrl,
          file_name: fileName,
          parent_folder_id: targetFolderId
        });
      } catch (err) {
        return res.status(500).json({ error: 'Resumable init failed: ' + err.message });
      }
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};

async function initResumableSession(token, fileName, parentId, fileSize, mimeType) {
  const metadata = {
    name: fileName,
    parents: [parentId || DEFAULT_PARENT_FOLDER_ID]
  };

  let response = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&supportsAllDrives=true', {
    method: 'POST',
    headers: {
      'Authorization': Bearer ,
      'Content-Type': 'application/json; charset=UTF-8',
      'X-Upload-Content-Type': mimeType || 'application/octet-stream'
    },
    body: JSON.stringify(metadata)
  });

  let locationUrl = response.headers.get('location');
  if (!locationUrl && parentId !== DEFAULT_PARENT_FOLDER_ID) {
    metadata.parents = [DEFAULT_PARENT_FOLDER_ID];
    response = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&supportsAllDrives=true', {
      method: 'POST',
      headers: {
        'Authorization': Bearer ,
        'Content-Type': 'application/json; charset=UTF-8',
        'X-Upload-Content-Type': mimeType || 'application/octet-stream'
      },
      body: JSON.stringify(metadata)
    });
    locationUrl = response.headers.get('location');
  }

  if (locationUrl) {
    return locationUrl;
  }
  const text = await response.text();
  throw new Error("Google Drive API returned status " + response.status + ": " + text);
}
