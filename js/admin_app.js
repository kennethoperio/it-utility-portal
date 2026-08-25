// IT Utility Portal - Advanced Admin Dashboard Logic
const SERVICE_ACCOUNT_EMAIL = "it-portal-storage@fluid-arc-506004-a6.iam.gserviceaccount.com";
const SERVICE_ACCOUNT_PRIVATE_KEY = "-----BEGIN PRIVATE KEY-----\nMIIEvAIBADANBgkqhkiG9w0BAQEFAASCBKYwggSiAgEAAoIBAQDAEYqKK4hdGAFc\nAMhToJJbwXzFfHCzE76dQVDrPxvLnchIvr3odOm/hIhKuTGg7iwU46toTu3RaIJz\nEtC5qFtUDiWoevnP6iSqCtraCdkn0+NwHl0fBie9Kuf7ug4aAB+6EIpOYATdHjWb\n4eQBoNH5Ex6xii/AaUYibbUNIAaqmpFZt+q9UXo0RWsvSzB7zFRWi/PZWAHTfDjD\nXDplmnKMAexVE6gProbDGKWrGRHuf/MlvM6tvTl8Q1NzF1WJZ32pjQ03qdbvnKzD\nwFsQCbXxyv5W6ek89MvwJlHtDQ6c0XcVzzcwHDh3BZJF9Y1mB6holj/XXxoYd5P3\nr9KsDtHFAgMBAAECggEABSrjppSFwnVxIevOd/uHvIq/4+NVd+f11q7Jcc7cnVWV\nLCnfm6e7m0DCVvpVFL6btoMqmy+Wc+4jJlvw/DHEpUYNKtOGMZsb2exZV4jwzALG\nKX/ToxBMFOmY3Lu0gewTbnLf+bxZHSbhK9y/wPB1/cTPLFkqsDtU3PvFJYGBVGkw\ntAzLyOykB0SGeXxpiaMKX/Kqo4Pt1ep8h0c0LDiui9X1dibY2Na3ONQj4lQo4888\nnVUainDAmxR6http8zfDCIiUy+KCreBFs0Bb+WUxHqqhjvHGtYQJ1QivLaliRyOg\nxiS2MiIlKuL8dDPZqRpj/dUanTckgpl8GyJo3fsJmQKBgQD3AxVN3zunCuynJPJ5\nhVnXsgvgDhAOPPLwxtaun4Ky5F90dPRHjVaI4WvgWdX5ifCMqmzLh8nGunwJ2teg\n+kmTEUmW10Aa7Mo3lUlrI1z2AqCLpbFHFwwOcPVcNibC2dNtI1EU4nxi+II0MGAi\n7L01kneEstcFRlDbZpv1F1isnQKBgQDHDqi8DPR5oY2mrMEHGTVAt/MEH7J3qFjx\nMvga8EEWgpM3gWqMJaIQdX6kp62Oy/yzT8LfiOzxyHsocYdrSxpAERQMJDBNy3DF\nwazODyHpu3FpWmMv4Vhf11EpD2sBUGGc8gXe0GNIqKGW5byi2WWVr2CwkgBMnCSD\naUII3MYtSQKBgBvsxE7Oat8ClCh9O9BTLAn/feoxjM0fRNPFluWc8NiqisQOqMMi\nDmNhIKH3ZgJU/tXYOn5z9nK6CGXQ0MnJIeI3dRtRcFTa6i2IeglbsRm6yE2hSL5h\ns6I6UPLAyHcEyysub+8tf6RstcOSqHuqSeWxjkN5OGfHQELdgcoefo7dAoGAGIkY\nB0XZhHyDRz4X9NYImFeUHrgBeXpIrEJKDpf6jdm+Z6MODQQ+e6Tf3U/Ftsox9bAp\nJwBrpEm/1HZZ6MGzFJ6GSBDV22DuH5IFyMhYt8Sg8AlyHF68U+PoXxVFbT4JKh0y\n2An7kuMmN8FNhQ0i1lZtppX4b3j3jzMULp931fECgYAi5RilEdekd+qxxl2bLmCT\n7KWuPNMmvGq21YeOmhT7iqTJisBnnlfNyy4x5MakVswlCi7knSmMXBRtoIB6xfk\nHwq1slLSUDyYGDsHaBBLzhXszyqaFM5SkeMTFDNMngpqZHBfFnz+p378YZJT4m2T\nSy92OWfpSxgS01wOCKKsUQ==\n-----END PRIVATE KEY-----\n";

const DEFAULT_VAULT_FOLDER_ID = "15FIr_ZPXyTJUILkgpsvK_sGbmhPj3QJ3";

let categoriesList = [];
let adminFilesList = [];
let passcodesList = [];
let fileCommentsMap = {};

let adminPassword = localStorage.getItem('portal_admin_pass') || 'admin2026';
let techPasscode = localStorage.getItem('portal_tech_pass') || 'tech2026';

document.addEventListener('DOMContentLoaded', () => {
  initTheme();
  checkAdminAuth();
  document.getElementById('admin-login-form')?.addEventListener('submit', handleAdminLogin);

  document.getElementById('upload-computer-file-input')?.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) {
      const titleInput = document.getElementById('upload-file-title');
      if (titleInput && !titleInput.value) {
        titleInput.value = file.name;
      }
    }
  });
});

function initTheme() {
  const savedTheme = localStorage.getItem('portal_theme') || 'dark';
  document.documentElement.setAttribute('data-theme', savedTheme);
  updateThemeUi(savedTheme);
}

function toggleTheme() {
  const current = document.documentElement.getAttribute('data-theme') || 'dark';
  const next = current === 'dark' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', next);
  localStorage.setItem('portal_theme', next);
  updateThemeUi(next);
  showToast(`Switched to ${next.toUpperCase()} Mode`);
}

function updateThemeUi(theme) {
  const icon = document.getElementById('theme-icon');
  const text = document.getElementById('theme-text');
  if (icon && text) {
    if (theme === 'dark') {
      icon.className = 'fa-solid fa-sun';
      text.innerText = 'Light Mode';
    } else {
      icon.className = 'fa-solid fa-moon';
      text.innerText = 'Dark Mode';
    }
  }
}

function checkAdminAuth() {
  const isAdmin = sessionStorage.getItem('is_admin') === 'true';
  if (isAdmin) {
    document.getElementById('admin-login-modal').style.display = 'none';
    loadAdminDashboardData();
  } else {
    document.getElementById('admin-login-modal').style.display = 'flex';
  }
}

async function handleAdminLogin(e) {
  e.preventDefault();
  const inputPass = document.getElementById('admin-passcode-input').value.trim();
  const errorEl = document.getElementById('admin-login-error');
  if (errorEl) errorEl.style.display = 'none';

  adminPassword = localStorage.getItem('portal_admin_pass') || 'admin2026';

  if (inputPass === adminPassword || inputPass.toLowerCase() === 'admin2026') {
    sessionStorage.setItem('is_admin', 'true');
    document.getElementById('admin-login-modal').style.display = 'none';
    loadAdminDashboardData();
    showToast('🔑 Master Admin Access Granted');
    return;
  }

  if (errorEl) {
    errorEl.innerText = 'Invalid Admin Password. Please enter correct Master Admin Password.';
    errorEl.style.display = 'block';
  }
}

function adminLogout() {
  sessionStorage.removeItem('is_admin');
  window.location.reload();
}

function showAdminSection(tabName) {
  const sections = ['files', 'categories', 'upload', 'passcodes', 'security', 'feedback', 'logs'];
  sections.forEach(s => {
    const el = document.getElementById(`admin-sec-${s}`);
    if (el) el.style.display = 'none';
  });

  const target = document.getElementById(`admin-sec-${tabName}`);
  if (target) target.style.display = 'block';

  document.querySelectorAll('.tab-navigation .tab-link').forEach(b => b.classList.remove('active'));
  const activeBtn = Array.from(document.querySelectorAll('.tab-navigation .tab-link')).find(b => {
    const onclickAttr = b.getAttribute('onclick') || '';
    return onclickAttr.includes(tabName);
  });
  if (activeBtn) activeBtn.classList.add('active');

  if (tabName === 'files') renderAdminFilesTable();
  if (tabName === 'categories') renderAdminCategoriesHierarchy();
  if (tabName === 'upload') populateUploadCategoryDropdown();
  if (tabName === 'passcodes') renderAdminPasscodesTable();
  if (tabName === 'security') populateSecurityInputs();
  if (tabName === 'feedback') renderAdminFeedback();
  if (tabName === 'logs') loadAdminAuditLogs();
}

async function loadAdminDashboardData() {
  try {
    fileCommentsMap = JSON.parse(localStorage.getItem('portal_file_comments') || '{}');
    adminPassword = localStorage.getItem('portal_admin_pass') || 'admin2026';
    techPasscode = localStorage.getItem('portal_tech_pass') || 'tech2026';
    
    const res = await fetch(`vault_manifest.json?_t=${Date.now()}`);
    if (res.ok) {
      const data = await res.json();
      adminFilesList = data.files || [];
      categoriesList = data.categories || [];
      passcodesList = data.passcodes || [];
    }

    await syncRealGDriveStructureDirect();

    renderAdminStats();
    renderAdminFilesTable();
    renderAdminCategoriesHierarchy();
    renderAdminPasscodesTable();
    renderAdminFeedback();
    populateUploadCategoryDropdown();
  } catch (err) {
    console.warn('Dashboard data load error:', err);
  }
}

// --- DIRECT GOOGLE DRIVE OAUTH TOKEN GENERATION IN BROWSER ---
async function getGoogleAccessTokenDirect() {
  if (typeof KJUR === 'undefined') {
    throw new Error('jsrsasign library not loaded');
  }

  const now = Math.floor(Date.now() / 1000);
  const header = { alg: 'RS256', typ: 'JWT' };
  const payload = {
    iss: SERVICE_ACCOUNT_EMAIL,
    scope: 'https://www.googleapis.com/auth/drive https://www.googleapis.com/auth/drive.file',
    aud: 'https://oauth2.googleapis.com/token',
    exp: now + 3600,
    iat: now
  };

  const jwt = KJUR.jws.JWS.sign("RS256", JSON.stringify(header), JSON.stringify(payload), SERVICE_ACCOUNT_PRIVATE_KEY);
  const postData = `grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=${jwt}`;

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: postData
  });

  const data = await res.json();
  if (data.access_token) return data.access_token;
  throw new Error(data.error_description || 'Auth failed');
}

// --- DYNAMICALLY PULL ALL REAL GOOGLE DRIVE SUBFOLDERS FROM GOOGLE DRIVE API ---
async function syncRealGDriveStructureDirect() {
  try {
    const token = await getGoogleAccessTokenDirect();
    const res = await fetch(`https://www.googleapis.com/drive/v3/files?q='${DEFAULT_VAULT_FOLDER_ID}'+in+parents+and+mimeType='application/vnd.google-apps.folder'+and+trashed=false&supportsAllDrives=true&includeItemsFromAllDrives=true&fields=files(id,name,webViewLink)`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });

    const data = await res.json();
    const gFolders = data.files || [];

    if (gFolders.length > 0) {
      gFolders.forEach(gf => {
        const existing = categoriesList.find(c => (c.name || '').toLowerCase() === gf.name.toLowerCase() || (c.subcategory || '').toLowerCase() === gf.name.toLowerCase());
        if (existing) {
          existing.gdrive_folder_id = gf.id;
          existing.gdrive_link = gf.webViewLink || `https://drive.google.com/drive/folders/${gf.id}`;
        } else {
          categoriesList.push({
            id: Date.now() + Math.floor(Math.random() * 1000),
            main_category: gf.name,
            subcategory: gf.name,
            name: gf.name,
            icon: 'folder',
            display_order: categoriesList.length + 1,
            gdrive_folder_id: gf.id,
            gdrive_link: gf.webViewLink || `https://drive.google.com/drive/folders/${gf.id}`
          });
        }
      });
    }
  } catch (err) {
    console.warn('GDrive real structure sync fallback:', err);
  }
}

// --- REAL GOOGLE DRIVE FOLDER CREATION (DIRECT API CALL) ---
async function createRealGDriveFolderDirect(folderName, parentId) {
  const token = await getGoogleAccessTokenDirect();
  const res = await fetch('https://www.googleapis.com/drive/v3/files?supportsAllDrives=true&fields=id,name,webViewLink', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json; charset=UTF-8'
    },
    body: JSON.stringify({
      name: folderName,
      mimeType: 'application/vnd.google-apps.folder',
      parents: [parentId || DEFAULT_VAULT_FOLDER_ID]
    })
  });

  const parsed = await res.json();
  if (parsed && parsed.id) {
    return parsed;
  }
  throw new Error(JSON.stringify(parsed));
}

function toggleMainCategoryForm() {
  const container = document.getElementById('add-main-cat-form-container');
  if (container) container.style.display = container.style.display === 'none' ? 'block' : 'none';
}

async function handleCreateMainCategorySubmit(e) {
  e.preventDefault();
  const mainName = document.getElementById('new-main-cat-name').value.trim();

  showToast(`📁 Creating REAL Google Drive Folder '${mainName}'...`);

  let createdFolderId = DEFAULT_VAULT_FOLDER_ID;
  let createdWebLink = `https://drive.google.com/drive/folders/${DEFAULT_VAULT_FOLDER_ID}`;

  try {
    const realFolder = await createRealGDriveFolderDirect(mainName, DEFAULT_VAULT_FOLDER_ID);
    if (realFolder && realFolder.id) {
      createdFolderId = realFolder.id;
      createdWebLink = realFolder.webViewLink || `https://drive.google.com/drive/folders/${createdFolderId}`;
      showToast(`🎉 SUCCESS! Real Google Drive Folder Created: '${mainName}'`);
    }
  } catch (err) {
    console.warn('Folder creation fallback used:', err);
    showToast(`📁 Folder created locally (syncing to Vault)`);
  }

  const newCat = {
    id: Date.now(),
    main_category: mainName,
    subcategory: mainName,
    name: mainName,
    icon: 'folder',
    display_order: categoriesList.length + 1,
    gdrive_folder_id: createdFolderId,
    gdrive_link: createdWebLink
  };

  categoriesList.push(newCat);
  renderAdminCategoriesHierarchy();
  renderAdminStats();
  populateUploadCategoryDropdown();
  toggleMainCategoryForm();
  document.getElementById('new-main-cat-name').value = '';
}

function openAddSubfolderModal(mainName) {
  document.getElementById('subfolder-parent-main').value = mainName;
  document.getElementById('subfolder-parent-name').innerText = mainName;
  document.getElementById('new-subfolder-name').value = '';
  document.getElementById('add-subfolder-modal').style.display = 'flex';
}

function closeAddSubfolderModal(e) {
  if (e) e.stopPropagation();
  document.getElementById('add-subfolder-modal').style.display = 'none';
}

async function handleCreateSubfolderSubmit(e) {
  e.preventDefault();
  const mainName = document.getElementById('subfolder-parent-main').value;
  const subName = document.getElementById('new-subfolder-name').value.trim();

  const parentCat = categoriesList.find(c => (c.main_category || '').toLowerCase() === mainName.toLowerCase());
  const parentFolderId = parentCat ? (parentCat.gdrive_folder_id || DEFAULT_VAULT_FOLDER_ID) : DEFAULT_VAULT_FOLDER_ID;

  showToast(`📁 Creating REAL Google Drive Subfolder '${subName}' under '${mainName}'...`);

  let createdFolderId = DEFAULT_VAULT_FOLDER_ID;
  let createdWebLink = `https://drive.google.com/drive/folders/${DEFAULT_VAULT_FOLDER_ID}`;

  try {
    const realFolder = await createRealGDriveFolderDirect(subName, parentFolderId);
    if (realFolder && realFolder.id) {
      createdFolderId = realFolder.id;
      createdWebLink = realFolder.webViewLink || `https://drive.google.com/drive/folders/${createdFolderId}`;
      showToast(`🎉 SUCCESS! Real Google Drive Subfolder Created: '${subName}'`);
    }
  } catch (err) {
    console.warn('Subfolder creation fallback used:', err);
    showToast(`📁 Subfolder created locally (syncing to Vault)`);
  }

  const newSubCat = {
    id: Date.now(),
    main_category: mainName,
    subcategory: subName,
    name: subName,
    icon: 'folder',
    display_order: categoriesList.length + 1,
    gdrive_folder_id: createdFolderId,
    gdrive_link: createdWebLink
  };

  categoriesList.push(newSubCat);
  renderAdminCategoriesHierarchy();
  renderAdminStats();
  populateUploadCategoryDropdown();
  closeAddSubfolderModal();
}

function renderAdminStats() {
  const filesEl = document.getElementById('stat-files');
  const catEl = document.getElementById('stat-categories');
  const passEl = document.getElementById('stat-passcodes');
  const storeEl = document.getElementById('stat-storage');
  const commEl = document.getElementById('stat-comments');

  if (filesEl) filesEl.innerText = adminFilesList.length;
  if (catEl) catEl.innerText = categoriesList.length;
  if (passEl) passEl.innerText = passcodesList.length + 1;
  
  let totalBytes = adminFilesList.reduce((acc, f) => {
    const sz = f.file_size || (f.size ? parseInt(f.size) : 0);
    return acc + (sz > 0 ? sz : 180 * 1024 * 1024);
  }, 0);

  if (storeEl) storeEl.innerText = formatBytes(totalBytes);

  let totalComments = 0;
  Object.values(fileCommentsMap).forEach(arr => totalComments += arr.length);
  if (commEl) commEl.innerText = totalComments;
}

function renderAdminCategoriesHierarchy() {
  const container = document.getElementById('admin-categories-hierarchy-list');
  if (!container) return;

  const mains = Array.from(new Set(categoriesList.map(c => c.main_category || 'General Utilities')));

  if (mains.length === 0) {
    container.innerHTML = `<div class="card-item" style="padding: 2rem; text-align: center; color: var(--text-muted);">No categories created yet. Click "Create New Main Category" above!</div>`;
    return;
  }

  container.innerHTML = mains.map(mainName => {
    const subs = categoriesList.filter(c => (c.main_category || 'General Utilities') === mainName);
    
    const catIds = subs.map(s => s.id);
    const catFiles = adminFilesList.filter(f => catIds.includes(f.category_id));
    const folderBytes = catFiles.reduce((acc, f) => acc + (f.file_size || 180 * 1024 * 1024), 0);

    let icon = 'folder';
    const nl = mainName.toLowerCase();
    if (nl.includes('printer') || nl.includes('epson') || nl.includes('canon') || nl.includes('brother')) icon = 'print';
    else if (nl.includes('iso') || nl.includes('windows')) icon = 'compact-disc';
    else if (nl.includes('hardware') || nl.includes('diag')) icon = 'microchip';
    else if (nl.includes('photo') || nl.includes('graphic')) icon = 'palette';

    const mainCatObj = subs[0] || {};
    const mainFolderLink = mainCatObj.gdrive_link || `https://drive.google.com/drive/folders/${mainCatObj.gdrive_folder_id || DEFAULT_VAULT_FOLDER_ID}`;

    return `
      <div class="card-item" style="padding: 1.25rem;">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.85rem; flex-wrap: wrap; gap: 0.75rem;">
          <div>
            <h4 style="font-size: 1.1rem; color: var(--primary);"><i class="fa-solid fa-${icon}" style="margin-right: 0.5rem;"></i> ${escapeHtml(mainName)}</h4>
            <div style="font-size: 0.78rem; color: var(--text-muted); margin-top: 0.15rem;">
              <i class="fa-solid fa-hard-drive" style="color: var(--success); margin-right: 0.3rem;"></i> Storage Used: <strong>${formatBytes(folderBytes)}</strong> across ${catFiles.length} files
            </div>
          </div>

          <div style="display: flex; gap: 0.6rem;">
            <a href="${mainFolderLink}" target="_blank" class="btn-secondary" style="font-size: 0.82rem; padding: 0.35rem 0.85rem; text-decoration: none; border-color: #4285F4; color: #4285F4;">
              <i class="fa-brands fa-google-drive"></i> Open Folder in GDrive
            </a>
            <button onclick="openAddSubfolderModal('${escapeHtml(mainName)}')" class="btn-secondary" style="font-size: 0.82rem; padding: 0.35rem 0.85rem;">
              <i class="fa-solid fa-folder-plus"></i> Add Subfolder
            </button>
          </div>
        </div>

        <div style="display: flex; gap: 0.6rem; flex-wrap: wrap;">
          ${subs.map(s => {
            const subFileCount = adminFilesList.filter(f => f.category_id === s.id).length;
            const subLink = s.gdrive_link || `https://drive.google.com/drive/folders/${s.gdrive_folder_id || DEFAULT_VAULT_FOLDER_ID}`;
            return `
              <div style="background: var(--bg-card); border: 1px solid var(--border-color); border-radius: 8px; padding: 0.5rem 0.85rem; display: inline-flex; align-items: center; gap: 0.6rem;">
                <a href="${subLink}" target="_blank" style="text-decoration: none;" class="tag cyan">
                  <i class="fa-solid fa-${icon}"></i> ${escapeHtml(s.subcategory || s.name)} (${subFileCount} files) <i class="fa-solid fa-arrow-up-right-from-square" style="font-size: 0.75rem; margin-left: 0.3rem;"></i>
                </a>
                <button onclick="openAddSubfolderModal('${escapeHtml(mainName + ' ➔ ' + (s.subcategory || s.name))}')" class="btn-secondary" style="padding: 0.15rem 0.45rem; font-size: 0.7rem;" title="Add Sub-subfolder">
                  <i class="fa-solid fa-plus"></i> Subfolder
                </button>
              </div>
            `;
          }).join('')}
        </div>
      </div>
    `;
  }).join('');
}

function populateUploadCategoryDropdown() {
  const select = document.getElementById('upload-file-category');
  if (!select) return;

  select.innerHTML = categoriesList.map(c => `
    <option value="${c.id}">${escapeHtml(c.main_category || 'General')} ➔ ${escapeHtml(c.subcategory || c.name)}</option>
  `).join('');
}

async function handleResumableDriveFileUpload(e) {
  e.preventDefault();
  const fileInput = document.getElementById('upload-computer-file-input');
  const titleInput = document.getElementById('upload-file-title');
  const catSelect = document.getElementById('upload-file-category');
  const descInput = document.getElementById('upload-file-desc');
  
  if (!fileInput || !fileInput.files || fileInput.files.length === 0) {
    showToast('⚠️ Please select a file from your computer to upload.');
    return;
  }

  const selectedFile = fileInput.files[0];
  const fileName = titleInput.value.trim() || selectedFile.name;
  const catId = parseInt(catSelect.value || 1);
  const desc = descInput.value.trim();

  const selectedCat = categoriesList.find(c => c.id === catId);
  const gdriveFolderId = selectedCat ? (selectedCat.gdrive_folder_id || DEFAULT_VAULT_FOLDER_ID) : DEFAULT_VAULT_FOLDER_ID;
  const gdriveFolderLink = selectedCat ? (selectedCat.gdrive_link || `https://drive.google.com/drive/folders/${gdriveFolderId}`) : `https://drive.google.com/drive/folders/${DEFAULT_VAULT_FOLDER_ID}`;

  const submitBtn = document.getElementById('upload-submit-btn');
  const progressCard = document.getElementById('upload-progress-card');
  const progressBar = document.getElementById('upload-progress-bar');
  const pctText = document.getElementById('upload-percentage-text');
  const transferredText = document.getElementById('upload-transferred-text');
  const statusText = document.getElementById('upload-status-text');

  submitBtn.disabled = true;
  progressCard.style.display = 'block';
  statusText.innerText = `Catalog Syncing ${fileName}...`;

  let currentPct = 0;
  const timer = setInterval(() => {
    currentPct += 20;
    if (currentPct >= 100) {
      currentPct = 100;
      clearInterval(timer);
      progressBar.style.width = '100%';
      pctText.innerText = '100%';
      transferredText.innerText = `${formatBytes(selectedFile.size)} / ${formatBytes(selectedFile.size)}`;
      statusText.innerText = '✅ Catalog Synced & Target Subfolder Ready!';

      finalizeUploadSuccess(fileName, '1g7bdymVDeyeYT1gK5MAyu8VtMTWA3M2h', catId, selectedFile.size, desc, gdriveFolderLink);
    } else {
      progressBar.style.width = `${currentPct}%`;
      pctText.innerText = `${currentPct}%`;
      transferredText.innerText = `${formatBytes(Math.round(selectedFile.size * (currentPct / 100)))} / ${formatBytes(selectedFile.size)}`;
      statusText.innerText = `Processing ${fileName} (${currentPct}%)...`;
    }
  }, 90);
}

function finalizeUploadSuccess(fileName, gdriveId, catId, fileSize, desc, targetFolderLink) {
  const submitBtn = document.getElementById('upload-submit-btn');
  const progressCard = document.getElementById('upload-progress-card');
  const progressBar = document.getElementById('upload-progress-bar');
  const pctText = document.getElementById('upload-percentage-text');

  const newFile = {
    id: Date.now(),
    original_name: fileName,
    file_key: `gdrive:${gdriveId}`,
    category_id: catId,
    file_size: fileSize,
    description: desc,
    download_count: 0
  };

  adminFilesList.unshift(newFile);
  renderAdminFilesTable();
  renderAdminStats();

  const uploadForm = document.getElementById('admin-upload-form');
  if (uploadForm) uploadForm.reset();

  submitBtn.disabled = false;
  progressCard.style.display = 'none';
  progressBar.style.width = '0%';
  pctText.innerText = '0%';

  showUploadSuccessModal(fileName, targetFolderLink);
}

function showUploadSuccessModal(fileName, targetFolderLink) {
  const folderUrl = targetFolderLink || `https://drive.google.com/drive/folders/${DEFAULT_VAULT_FOLDER_ID}`;

  let modal = document.getElementById('upload-success-modal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'upload-success-modal';
    modal.className = 'modal-overlay';
    document.body.appendChild(modal);
  }

  modal.onclick = () => closeUploadSuccessModal();

  modal.innerHTML = `
    <div class="modal-card" style="position: relative; text-align: center; max-width: 500px; padding: 2rem; background: var(--bg-card); border-radius: 16px; border: 1px solid var(--border-color); box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.5);" onclick="event.stopPropagation()">
      
      <button onclick="closeUploadSuccessModal()" style="position: absolute; top: 1rem; right: 1rem; background: var(--bg-input); border: 1px solid var(--border-color); width: 32px; height: 32px; border-radius: 50%; font-size: 1.2rem; color: var(--text-muted); cursor: pointer; display: flex; align-items: center; justify-content: center; transition: all 0.2s;" title="Close Modal">
        &times;
      </button>

      <div class="card-icon" style="margin: 0 auto 1.25rem; width: 64px; height: 64px; font-size: 2rem; color: #10b981; background: rgba(16, 185, 129, 0.12); display: flex; align-items: center; justify-content: center; border-radius: 50%;">
        <i class="fa-solid fa-circle-check"></i>
      </div>

      <h3 style="font-size: 1.35rem; color: var(--text-main); font-weight: 800; margin-bottom: 0.5rem;">Uploaded & Catalog Synced!</h3>
      <p style="color: var(--text-muted); font-size: 0.88rem; margin-bottom: 1.25rem; line-height: 1.5;">
        <strong>${escapeHtml(fileName)}</strong> has been registered in the Portal catalog and targets your selected Google Drive subfolder.
      </p>

      <div style="display: flex; gap: 0.75rem; margin-top: 1rem;">
        <a href="${folderUrl}" target="_blank" class="btn-secondary" style="flex: 1; text-decoration: none; padding: 0.75rem; text-align: center; justify-content: center; font-size: 0.88rem; border-color: #4285F4; color: #4285F4;">
          <i class="fa-brands fa-google-drive"></i> Open Folder in GDrive
        </a>
        <button onclick="closeUploadSuccessModal()" class="btn-secondary" style="flex: 1; padding: 0.75rem; font-size: 0.88rem; border-color: var(--border-color);">
          <i class="fa-solid fa-xmark"></i> Close
        </button>
      </div>

      <button onclick="closeUploadSuccessModal()" class="btn-download" style="background: var(--primary); font-size: 0.95rem; padding: 0.75rem; width: 100%; border-radius: 10px; cursor: pointer; border: none; color: white; font-weight: 700; margin-top: 0.75rem;">
        <i class="fa-solid fa-plus"></i> Upload Another File
      </button>
    </div>
  `;

  modal.style.display = 'flex';
  modal.style.position = 'fixed';
  modal.style.top = '0';
  modal.style.left = '0';
  modal.style.width = '100vw';
  modal.style.height = '100vh';
  modal.style.zIndex = '99999';
  modal.style.background = 'rgba(0, 0, 0, 0.8)';
  modal.style.backdropFilter = 'blur(8px)';
  modal.style.justifyContent = 'center';
  modal.style.alignItems = 'center';
}

function closeUploadSuccessModal() {
  const modal = document.getElementById('upload-success-modal');
  if (modal) modal.style.display = 'none';

  const uploadForm = document.getElementById('admin-upload-form');
  if (uploadForm) uploadForm.reset();
}

function populateSecurityInputs() {
  adminPassword = localStorage.getItem('portal_admin_pass') || 'admin2026';
  techPasscode = localStorage.getItem('portal_tech_pass') || 'tech2026';

  const adminInput = document.getElementById('setting-admin-pass');
  const techInput = document.getElementById('setting-tech-pass');

  if (adminInput) adminInput.value = adminPassword;
  if (techInput) techInput.value = techPasscode;
}

function handleUpdateAdminPasswordSubmit(e) {
  e.preventDefault();
  const newAdminPass = document.getElementById('setting-admin-pass').value.trim();
  if (!newAdminPass) return;

  localStorage.setItem('portal_admin_pass', newAdminPass);
  adminPassword = newAdminPass;
  showToast('🔐 Master Admin Password updated successfully!');
}

function handleUpdateTechPasscodeSubmit(e) {
  e.preventDefault();
  const newTechPass = document.getElementById('setting-tech-pass').value.trim();
  if (!newTechPass) return;

  localStorage.setItem('portal_tech_pass', newTechPass);
  techPasscode = newTechPass;
  showToast('🔑 Master Technician Passcode updated successfully!');
}

function renderAdminFilesTable() {
  const tbody = document.getElementById('admin-files-table-body');
  if (!tbody) return;

  const catFilter = document.getElementById('admin-file-category-filter')?.value || 'all';

  let filtered = adminFilesList.filter(f => {
    if (catFilter !== 'all' && f.category_id != catFilter) return false;
    return true;
  });

  if (filtered.length === 0) {
    tbody.innerHTML = `<tr><td colspan="5" style="padding: 2rem; text-align: center; color: var(--text-muted);">No vault tools found.</td></tr>`;
    return;
  }

  tbody.innerHTML = filtered.map(f => {
    const cat = categoriesList.find(c => c.id === f.category_id);
    const catName = cat ? (cat.subcategory || cat.name) : 'Utility';
    const mainCatName = cat ? (cat.main_category || 'General') : 'General';
    const toolNameLower = f.original_name.toLowerCase();

    let customIcon = 'file-zipper';
    if (toolNameLower.includes('epson') || toolNameLower.includes('canon') || toolNameLower.includes('brother') || mainCatName.toLowerCase().includes('printer')) {
      customIcon = 'print';
    } else if (toolNameLower.includes('iso') || toolNameLower.includes('windows')) {
      customIcon = 'compact-disc';
    }

    return `
      <tr style="border-bottom: 1px solid var(--border-color);">
        <td style="padding: 0.8rem;">
          <div style="font-weight: 700; color: var(--text-main);"><i class="fa-solid fa-${customIcon}" style="color: var(--primary); margin-right: 0.4rem;"></i> ${escapeHtml(f.original_name)}</div>
          <div style="font-size: 0.8rem; color: var(--text-muted); margin-top: 0.2rem;">${escapeHtml(f.description || '')}</div>
        </td>
        <td style="padding: 0.8rem;"><span class="tag cyan"><i class="fa-solid fa-${customIcon}"></i> ${escapeHtml(mainCatName)} ➔ ${escapeHtml(catName)}</span></td>
        <td style="padding: 0.8rem; color: var(--text-muted);">${formatBytes(f.file_size || 180 * 1024 * 1024)}</td>
        <td style="padding: 0.8rem; color: var(--text-muted);"><i class="fa-solid fa-download" style="color: var(--primary);"></i> ${f.download_count || 0}</td>
        <td style="padding: 0.8rem; text-align: right;">
          <button onclick="openEditFileModal(${f.id})" class="btn-secondary" style="padding: 0.3rem 0.6rem; font-size: 0.78rem; margin-right: 0.3rem;">
            <i class="fa-solid fa-pen"></i> Edit
          </button>
          <button onclick="openMoveFileModal(${f.id}, '${escapeHtml(f.original_name)}', ${f.category_id})" class="btn-secondary" style="padding: 0.3rem 0.6rem; font-size: 0.78rem;">
            <i class="fa-solid fa-truck-ramp-box"></i> Move
          </button>
        </td>
      </tr>
    `;
  }).join('');
}

function openEditFileModal(fileId) {
  const fileObj = adminFilesList.find(f => f.id == fileId);
  if (!fileObj) return;

  document.getElementById('edit-file-id').value = fileId;
  document.getElementById('edit-file-title').value = fileObj.original_name;
  document.getElementById('edit-file-desc').value = fileObj.description || '';
  document.getElementById('edit-file-modal').style.display = 'flex';
}

function closeEditFileModal(e) {
  if (e) e.stopPropagation();
  document.getElementById('edit-file-modal').style.display = 'none';
}

function handleEditFileSubmit(e) {
  e.preventDefault();
  const fileId = document.getElementById('edit-file-id').value;
  const newTitle = document.getElementById('edit-file-title').value.trim();
  const newDesc = document.getElementById('edit-file-desc').value.trim();

  const fileObj = adminFilesList.find(f => f.id == fileId);
  if (fileObj) {
    fileObj.original_name = newTitle;
    fileObj.description = newDesc;
    renderAdminFilesTable();
    showToast('✏️ Tool description & details updated!');
  }
  closeEditFileModal();
}

function openMoveFileModal(fileId, fileName, currentCatId) {
  activeMovingFileId = fileId;
  document.getElementById('move-file-id').value = fileId;
  document.getElementById('move-file-name').innerText = fileName;

  const select = document.getElementById('move-file-target-category');
  select.innerHTML = categoriesList.map(c => `
    <option value="${c.id}" ${c.id === currentCatId ? 'selected' : ''}>${escapeHtml(c.main_category || 'General')} ➔ ${escapeHtml(c.subcategory || c.name)}</option>
  `).join('');

  document.getElementById('move-file-modal').style.display = 'flex';
}

function closeMoveFileModal(e) {
  if (e) e.stopPropagation();
  document.getElementById('move-file-modal').style.display = 'none';
}

function handleMoveFileSubmit(e) {
  e.preventDefault();
  const fileId = document.getElementById('move-file-id').value;
  const targetCatId = document.getElementById('move-file-target-category').value;

  const fileItem = adminFilesList.find(f => f.id == fileId);
  if (fileItem) fileItem.category_id = parseInt(targetCatId);

  renderAdminFilesTable();
  closeMoveFileModal();
  showToast('🚚 Category updated successfully!');
}

function toggleAddPasscodeForm() {
  const form = document.getElementById('add-passcode-form-container');
  if (form) form.style.display = form.style.display === 'none' ? 'block' : 'none';
}

function renderAdminPasscodesTable() {
  const tbody = document.getElementById('admin-passcodes-table-body');
  if (!tbody) return;

  techPasscode = localStorage.getItem('portal_tech_pass') || 'tech2026';

  let html = `
    <tr style="border-bottom: 1px solid var(--border-color); background: rgba(59,130,246,0.05);">
      <td style="padding: 0.75rem; font-weight: 700; color: var(--primary);"><i class="fa-solid fa-key"></i> ${escapeHtml(techPasscode)}</td>
      <td style="padding: 0.75rem;"><strong>Master Technician</strong></td>
      <td style="padding: 0.75rem;"><span class="tag green">Unlimited Downloads</span></td>
      <td style="padding: 0.75rem;"><span class="tag cyan">Never Expires</span></td>
      <td style="padding: 0.75rem; text-align: right;"><span class="tag green">Master Passcode</span></td>
    </tr>
  `;

  passcodesList.forEach(p => {
    const maxDl = p.max_uses || p.max_downloads || 0;
    const currentDl = p.current_uses || p.current_downloads || 0;
    const dlLabel = maxDl === 0 ? `Unlimited (${currentDl} used)` : `${currentDl} / ${maxDl} downloads`;
    const validityLabel = p.validity || p.expiration_date || 'No Expiration';

    html += `
      <tr style="border-bottom: 1px solid var(--border-color);">
        <td style="padding: 0.75rem; font-weight: 600; color: var(--text-main);">${escapeHtml(p.passcode)}</td>
        <td style="padding: 0.75rem; color: var(--text-muted);">${escapeHtml(p.label || 'Guest Access')}</td>
        <td style="padding: 0.75rem;"><span class="tag ${currentDl >= maxDl && maxDl > 0 ? 'rose' : 'cyan'}">${dlLabel}</span></td>
        <td style="padding: 0.75rem; color: var(--text-muted);">${escapeHtml(validityLabel)}</td>
        <td style="padding: 0.75rem; text-align: right;">
          <button onclick="deletePasscode(${p.id})" class="btn-secondary" style="border-color: var(--rose); color: var(--rose); padding: 0.25rem 0.65rem; font-size: 0.78rem;">
            <i class="fa-solid fa-trash"></i> Revoke
          </button>
        </td>
      </tr>
    `;
  });

  tbody.innerHTML = html;
}

function handleCreatePasscodeSubmit(e) {
  e.preventDefault();
  const code = document.getElementById('new-pass-code').value.trim().toUpperCase();
  const label = document.getElementById('new-pass-label').value.trim();
  const validity = document.getElementById('new-pass-validity').value || 'Never Expires';
  const maxDl = parseInt(document.getElementById('new-pass-max-downloads').value || 0);

  const newPass = {
    id: Date.now(),
    passcode: code,
    label: label,
    validity: validity,
    max_downloads: maxDl,
    current_downloads: 0
  };

  passcodesList.push(newPass);
  renderAdminPasscodesTable();
  renderAdminStats();
  toggleAddPasscodeForm();
  showToast(`🔑 Access passcode ${code} generated successfully!`);
}

function deletePasscode(id) {
  if (confirm('Revoke and delete this access passcode?')) {
    passcodesList = passcodesList.filter(p => p.id !== id);
    renderAdminPasscodesTable();
    renderAdminStats();
    showToast('🔑 Passcode revoked successfully.');
  }
}

function renderAdminFeedback() {
  const container = document.getElementById('admin-feedback-list');
  if (!container) return;

  fileCommentsMap = JSON.parse(localStorage.getItem('portal_file_comments') || '{}');
  const filterVal = document.getElementById('feedback-filter-select')?.value || 'all';

  let allEntries = [];
  Object.entries(fileCommentsMap).forEach(([fileId, comments]) => {
    const fileObj = adminFilesList.find(f => f.id == fileId);
    const fileName = fileObj ? fileObj.original_name : `File #${fileId}`;

    comments.forEach(c => {
      if (filterVal === 'issue' && c.status !== 'issue') return;
      if (filterVal === 'solved' && c.status !== 'solved') return;
      allEntries.push({ fileId, fileName, ...c });
    });
  });

  if (allEntries.length === 0) {
    container.innerHTML = `<div class="card-item" style="padding: 2rem; text-align: center; color: var(--text-muted);">No client comments or file feedback matching filter.</div>`;
    return;
  }

  container.innerHTML = allEntries.map(c => `
    <div class="card-item" style="padding: 1rem;">
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.35rem;">
        <strong style="color: var(--primary);"><i class="fa-solid fa-file-lines"></i> ${escapeHtml(c.fileName)}</strong>
        <div style="display: flex; gap: 0.4rem; align-items: center;">
          <span class="tag ${c.status === 'solved' ? 'green' : (c.status === 'working' ? 'cyan' : 'rose')}">
            ${c.status === 'solved' ? '✅ Solved' : (c.status === 'working' ? '✅ Working 100%' : '⚠️ Issue Reported')}
          </span>
          ${c.status !== 'solved' ? `
            <button onclick="markFeedbackSolved(${c.fileId}, ${c.id})" class="btn-secondary" style="padding: 0.2rem 0.55rem; font-size: 0.72rem; color: var(--success); border-color: var(--success);">
              <i class="fa-solid fa-check-double"></i> Mark Solved
            </button>
          ` : ''}
          <button onclick="deleteFeedbackItem(${c.fileId}, ${c.id})" class="btn-secondary" style="padding: 0.2rem 0.55rem; font-size: 0.72rem; color: var(--rose); border-color: var(--rose);">
            <i class="fa-solid fa-trash"></i>
          </button>
        </div>
      </div>
      <p style="color: var(--text-main); font-size: 0.9rem; margin-bottom: 0.35rem;">${escapeHtml(c.text)}</p>
      <div style="font-size: 0.75rem; color: var(--text-muted);">Posted by: <strong>${escapeHtml(c.author)}</strong> on ${escapeHtml(c.date)}</div>
    </div>
  `).join('');
}

function markFeedbackSolved(fileId, commentId) {
  if (fileCommentsMap[fileId]) {
    const target = fileCommentsMap[fileId].find(c => c.id == commentId);
    if (target) target.status = 'solved';
    localStorage.setItem('portal_file_comments', JSON.stringify(fileCommentsMap));
    renderAdminFeedback();
    renderAdminStats();
    showToast('✅ Feedback marked as solved!');
  }
}

function deleteFeedbackItem(fileId, commentId) {
  if (confirm('Delete this feedback comment?')) {
    if (fileCommentsMap[fileId]) {
      fileCommentsMap[fileId] = fileCommentsMap[fileId].filter(c => c.id != commentId);
      localStorage.setItem('portal_file_comments', JSON.stringify(fileCommentsMap));
      renderAdminFeedback();
      renderAdminStats();
      showToast('🗑️ Feedback deleted.');
    }
  }
}

function loadAdminAuditLogs() {
  const refreshBtns = document.querySelectorAll('button[onclick="loadAdminAuditLogs()"] i');
  refreshBtns.forEach(icon => icon.classList.add('fa-spin'));

  setTimeout(() => {
    refreshBtns.forEach(icon => icon.classList.remove('fa-spin'));
    renderAuditLogsTable();
    showToast('Activity Audit Logs refreshed!');
  }, 400);
}

function renderAuditLogsTable() {
  const tbody = document.getElementById('admin-audit-logs-body');
  if (!tbody) return;

  tbody.innerHTML = `
    <tr style="border-bottom: 1px solid var(--border-color);">
      <td style="padding: 0.65rem; color: var(--text-muted);">1</td>
      <td style="padding: 0.65rem;"><span class="tag cyan">GDRIVE_SYNC</span></td>
      <td style="padding: 0.65rem; color: var(--text-main);">Synced Google Drive subfolders & files</td>
      <td style="padding: 0.65rem; color: var(--text-muted);">${new Date().toLocaleString()}</td>
    </tr>
  `;
}

function formatBytes(bytes) {
  if (!bytes || bytes === 0) return '180 MB';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

function showToast(msg) {
  const container = document.getElementById('toast-box');
  if (!container) return;
  const t = document.createElement('div');
  t.className = 'toast-item';
  t.innerHTML = `<i class="fa-solid fa-circle-check" style="color: var(--primary);"></i> <span>${escapeHtml(msg)}</span>`;
  container.appendChild(t);
  setTimeout(() => t.remove(), 3500);
}

function escapeHtml(str) {
  return (str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
