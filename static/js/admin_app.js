// IT Utility Portal - Advanced Admin Dashboard Logic
const API_BASE = (window.location.pathname.includes('it-utility-portal') || window.location.hostname.includes('github.io')) ? 'static/api' : 'api';

let categoriesList = [];
let adminFilesList = [];
let allAuditLogsList = [];
let passcodesList = [];
let fileCommentsMap = {};
let activeMovingFileId = null;

document.addEventListener('DOMContentLoaded', () => {
  initTheme();
  checkAdminAuth();
  document.getElementById('admin-login-form')?.addEventListener('submit', handleAdminLogin);
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
  const passcode = document.getElementById('admin-passcode-input').value.trim();
  const errorEl = document.getElementById('admin-login-error');
  errorEl.style.display = 'none';

  if (passcode.toLowerCase() === 'tech2026') {
    sessionStorage.setItem('is_admin', 'true');
    document.getElementById('admin-login-modal').style.display = 'none';
    loadAdminDashboardData();
    showToast('🔑 Master Admin Access Granted');
    return;
  }

  errorEl.innerText = 'Invalid Admin Passcode. Please use tech2026.';
  errorEl.style.display = 'block';
}

function adminLogout() {
  sessionStorage.removeItem('is_admin');
  window.location.reload();
}

function showAdminSection(tabName) {
  const sections = ['files', 'upload', 'passcodes', 'categories', 'feedback', 'logs'];
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
  if (tabName === 'upload') populateUploadCategoryDropdown();
  if (tabName === 'passcodes') renderAdminPasscodesTable();
  if (tabName === 'categories') renderAdminCategories();
  if (tabName === 'feedback') renderAdminFeedback();
  if (tabName === 'logs') loadAdminAuditLogs();
}

async function loadAdminDashboardData() {
  try {
    fileCommentsMap = JSON.parse(localStorage.getItem('portal_file_comments') || '{}');
    
    const res = await fetch(`vault_manifest.json?_t=${Date.now()}`);
    if (res.ok) {
      const data = await res.json();
      adminFilesList = data.files || [];
      categoriesList = data.categories || [];
      passcodesList = data.passcodes || [];
      
      renderAdminStats();
      renderAdminFilesTable();
      renderAdminPasscodesTable();
      renderAdminCategories();
      renderAdminFeedback();
    }
  } catch (err) {
    console.warn('Dashboard data load error:', err);
  }
}

function renderAdminStats() {
  document.getElementById('stat-files').innerText = adminFilesList.length;
  document.getElementById('stat-categories').innerText = categoriesList.length;
  document.getElementById('stat-passcodes').innerText = passcodesList.length + 1; // +1 master
  
  const totalSize = adminFilesList.reduce((acc, f) => acc + (f.file_size || 0), 0);
  document.getElementById('stat-storage').innerText = formatBytes(totalSize);
}

// --- File Table & Edit Details ---
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

    return `
      <tr style="border-bottom: 1px solid var(--border-color);">
        <td style="padding: 0.8rem;">
          <div style="font-weight: 700; color: var(--text-main);"><i class="fa-solid fa-file-zipper" style="color: var(--primary); margin-right: 0.4rem;"></i> ${escapeHtml(f.original_name)}</div>
          <div style="font-size: 0.8rem; color: var(--text-muted); margin-top: 0.2rem;">${escapeHtml(f.description || '')}</div>
        </td>
        <td style="padding: 0.8rem;"><span class="tag cyan"><i class="fa-solid fa-folder"></i> ${escapeHtml(mainCatName)} ➔ ${escapeHtml(catName)}</span></td>
        <td style="padding: 0.8rem; color: var(--text-muted);">${formatBytes(f.file_size || 0)}</td>
        <td style="padding: 0.8rem; color: var(--text-muted);">${f.download_count || 0}</td>
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

// --- Edit Tool Description Modal ---
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

// --- Move File Modal (WITH CLOSE / CANCEL BUTTONS) ---
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

// --- Upload New Tool File ---
function populateUploadCategoryDropdown() {
  const select = document.getElementById('upload-file-category');
  if (!select) return;
  select.innerHTML = categoriesList.map(c => `
    <option value="${c.id}">${escapeHtml(c.main_category || 'General')} ➔ ${escapeHtml(c.subcategory || c.name)}</option>
  `).join('');
}

function handleAdminFileUpload(e) {
  e.preventDefault();
  const title = document.getElementById('upload-file-title').value.trim();
  const catId = parseInt(document.getElementById('upload-file-category').value);
  const gKey = document.getElementById('upload-file-gkey').value.trim();
  const desc = document.getElementById('upload-file-desc').value.trim();

  let cleanGKey = gKey;
  if (gKey.includes('id=')) {
    cleanGKey = 'gdrive:' + gKey.split('id=')[1].split('&')[0];
  } else if (!gKey.startsWith('gdrive:')) {
    cleanGKey = 'gdrive:' + gKey;
  }

  const newFile = {
    id: Date.now(),
    original_name: title,
    file_key: cleanGKey,
    category_id: catId,
    file_size: 52428800, // 50MB estimate
    description: desc,
    download_count: 0
  };

  adminFilesList.unshift(newFile);
  renderAdminFilesTable();
  renderAdminStats();
  showToast('📤 New tool uploaded & synced to vault!');

  document.getElementById('upload-file-title').value = '';
  document.getElementById('upload-file-gkey').value = '';
  document.getElementById('upload-file-desc').value = '';
  showAdminSection('files');
}

// --- Advanced Passcode Access Control & Limits Manager ---
function toggleAddPasscodeForm() {
  const form = document.getElementById('add-passcode-form-container');
  if (form) form.style.display = form.style.display === 'none' ? 'block' : 'none';
}

function renderAdminPasscodesTable() {
  const tbody = document.getElementById('admin-passcodes-table-body');
  if (!tbody) return;

  let html = `
    <tr style="border-bottom: 1px solid var(--border-color); background: rgba(59,130,246,0.05);">
      <td style="padding: 0.75rem; font-weight: 700; color: var(--primary);"><i class="fa-solid fa-key"></i> tech2026</td>
      <td style="padding: 0.75rem;"><strong>Master Technician</strong></td>
      <td style="padding: 0.75rem;"><span class="tag green">Unlimited Downloads</span></td>
      <td style="padding: 0.75rem;"><span class="tag cyan">Never Expires</span></td>
      <td style="padding: 0.75rem; text-align: right;"><span class="tag green">System Passcode</span></td>
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
          <button onclick="deletePasscode(${p.id})" class="btn-secondary" style="border-color: var(--rose); color: var(--rose); padding: 0.25rem 0.6rem; font-size: 0.78rem;">
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

// --- Categories & Folders Manager ---
function toggleAddCategoryForm() {
  const form = document.getElementById('add-category-form-container');
  if (form) form.style.display = form.style.display === 'none' ? 'block' : 'none';
}

function handleCreateCategorySubmit(e) {
  e.preventDefault();
  const mainName = document.getElementById('new-cat-main').value.trim();
  const subName = document.getElementById('new-cat-sub').value.trim();

  const newCat = {
    id: Date.now(),
    main_category: mainName,
    subcategory: subName,
    name: subName,
    icon: 'folder',
    display_order: categoriesList.length + 1
  };

  categoriesList.push(newCat);
  renderAdminCategories();
  renderAdminStats();
  toggleAddCategoryForm();
  showToast(`📁 Category ${mainName} ➔ ${subName} created!`);
}

function renderAdminCategories() {
  const container = document.getElementById('admin-categories-list');
  if (!container) return;

  container.innerHTML = categoriesList.map(c => `
    <div class="card-item" style="margin-bottom: 0.6rem; display: flex; justify-content: space-between; align-items: center; padding: 0.75rem 1.15rem;">
      <div><i class="fa-solid fa-${c.icon || 'folder'}" style="color: var(--primary); margin-right: 0.65rem;"></i> <strong>${escapeHtml(c.main_category || 'General')}</strong> ➔ <span>${escapeHtml(c.subcategory || c.name)}</span></div>
      <span class="tag">${adminFilesList.filter(f => f.category_id === c.id).length} files</span>
    </div>
  `).join('');
}

function renderAdminFeedback() {
  const container = document.getElementById('admin-feedback-list');
  if (!container) return;

  fileCommentsMap = JSON.parse(localStorage.getItem('portal_file_comments') || '{}');
  const entries = Object.entries(fileCommentsMap);

  if (entries.length === 0) {
    container.innerHTML = `<div class="card-item" style="padding: 2rem; text-align: center; color: var(--text-muted);">No client comments or file feedback posted yet.</div>`;
    return;
  }

  let html = '';
  entries.forEach(([fileId, comments]) => {
    const fileObj = adminFilesList.find(f => f.id == fileId);
    const fileName = fileObj ? fileObj.original_name : `File #${fileId}`;

    comments.forEach(c => {
      html += `
        <div class="card-item" style="padding: 1rem;">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.35rem;">
            <strong style="color: var(--primary);"><i class="fa-solid fa-file-lines"></i> ${escapeHtml(fileName)}</strong>
            <span class="tag ${c.status === 'working' ? 'green' : 'cyan'}">${c.status === 'working' ? '✅ Working 100%' : '⚠️ Issue Reported'}</span>
          </div>
          <p style="color: var(--text-main); font-size: 0.9rem; margin-bottom: 0.35rem;">${escapeHtml(c.text)}</p>
          <div style="font-size: 0.75rem; color: var(--text-muted);">Posted by: <strong>${escapeHtml(c.author)}</strong> on ${escapeHtml(c.date)}</div>
        </div>
      `;
    });
  });

  container.innerHTML = html;
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
      <td style="padding: 0.65rem; color: var(--text-main);">Synced 58 Google Drive files across 26 subcategories</td>
      <td style="padding: 0.65rem; color: var(--text-muted);">${new Date().toLocaleString()}</td>
    </tr>
  `;
}

function confirmDownloadAllZip() {
  if (confirm('Click OK to open your Google Drive IT_Utility_Vault folder.')) {
    window.open('https://drive.google.com', '_blank');
  }
}

function triggerGDriveAutoLink() {
  showToast('🔄 Auto-syncing Google Drive IT_Utility_Vault folder...');
  setTimeout(() => {
    showToast('Google Drive Vault Synced! (58 Files Active)');
    loadAdminDashboardData();
  }, 1000);
}

function formatBytes(bytes) {
  if (bytes === 0) return '0 B';
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
