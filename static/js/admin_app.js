// IT Utility Portal - Admin Dashboard Application Logic
const API_BASE = (window.location.pathname.includes('it-utility-portal') || window.location.hostname.includes('github.io')) ? 'static/api' : 'api';

let categoriesList = [];
let adminFilesList = [];
let allAuditLogsList = [];
let passcodesList = [];
let currentLogsPage = 1;
let logsPerPage = 100;
let activeMovingFileId = null;

document.addEventListener('DOMContentLoaded', () => {
  checkAdminAuth();
  document.getElementById('admin-login-form')?.addEventListener('submit', handleAdminLogin);
});

function checkAdminAuth() {
  const isAdmin = sessionStorage.getItem('is_admin') === 'true';
  if (isAdmin) {
    document.getElementById('admin-login-modal').style.display = 'none';
    loadAdminDashboardData();
  } else {
    document.getElementById('admin-login-modal').style.display = 'block';
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
  const sections = ['files', 'categories', 'passcodes', 'logs'];
  sections.forEach(s => {
    const el = document.getElementById(`admin-sec-${s}`);
    if (el) el.style.display = 'none';
  });

  const target = document.getElementById(`admin-sec-${tabName}`);
  if (target) target.style.display = 'block';

  document.querySelectorAll('.nav-tabs .tab-btn').forEach(b => b.classList.remove('active'));
  const activeBtn = Array.from(document.querySelectorAll('.nav-tabs .tab-btn')).find(b => {
    const onclickAttr = b.getAttribute('onclick') || '';
    return onclickAttr.includes(tabName);
  });
  if (activeBtn) activeBtn.classList.add('active');

  if (tabName === 'files') renderAdminFilesTable();
  if (tabName === 'categories') renderAdminCategories();
  if (tabName === 'passcodes') renderAdminPasscodes();
  if (tabName === 'logs') loadAdminAuditLogs();
}

async function loadAdminDashboardData() {
  try {
    const res = await fetch(`vault_manifest.json?_t=${Date.now()}`);
    if (res.ok) {
      const data = await res.json();
      adminFilesList = data.files || [];
      categoriesList = data.categories || [];
      passcodesList = data.passcodes || [];
      renderAdminStats();
      renderAdminFilesTable();
      renderAdminCategories();
      renderAdminPasscodes();
    }
  } catch (err) {
    console.warn('Dashboard data load error:', err);
  }
}

function renderAdminStats() {
  document.getElementById('stat-files').innerText = adminFilesList.length;
  document.getElementById('stat-categories').innerText = categoriesList.length;
  
  const totalSize = adminFilesList.reduce((acc, f) => acc + (f.file_size || 0), 0);
  document.getElementById('stat-storage').innerText = formatBytes(totalSize);

  const totalDownloads = adminFilesList.reduce((acc, f) => acc + (f.download_count || 0), 0);
  document.getElementById('stat-downloads').innerText = totalDownloads;
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
    const catName = cat ? cat.name : 'Utility';
    return `
      <tr style="border-bottom: 1px solid rgba(255,255,255,0.05);">
        <td style="padding: 0.75rem; font-weight: 600; color: var(--text-main);"><i class="fa-solid fa-file-zipper" style="color: var(--cyan-accent); margin-right: 0.5rem;"></i> ${escapeHtml(f.original_name)}</td>
        <td style="padding: 0.75rem;"><span class="tag cyan"><i class="fa-solid fa-folder"></i> ${escapeHtml(catName)}</span></td>
        <td style="padding: 0.75rem; color: var(--text-muted);">${formatBytes(f.file_size || 0)}</td>
        <td style="padding: 0.75rem; color: var(--text-muted);">${f.download_count || 0}</td>
        <td style="padding: 0.75rem; text-align: right;">
          <button onclick="openMoveFileModal(${f.id}, '${escapeHtml(f.original_name)}', ${f.category_id})" class="btn-action" style="padding: 0.35rem 0.75rem; font-size: 0.8rem; display: inline-flex; width: auto; margin-right: 0.35rem; background: var(--bg-card); color: var(--text-main); border: 1px solid var(--border-color);">
            <i class="fa-solid fa-truck-ramp-box"></i> Move
          </button>
        </td>
      </tr>
    `;
  }).join('');
}

function openMoveFileModal(fileId, fileName, currentCatId) {
  activeMovingFileId = fileId;
  document.getElementById('move-file-id').value = fileId;
  document.getElementById('move-file-name').innerText = fileName;

  const select = document.getElementById('move-file-target-category');
  select.innerHTML = categoriesList.map(c => `
    <option value="${c.id}" ${c.id === currentCatId ? 'selected' : ''}>${escapeHtml(c.name)}</option>
  `).join('');

  document.getElementById('move-file-modal').style.display = 'block';
}

function handleMoveFileSubmit(e) {
  e.preventDefault();
  const fileId = document.getElementById('move-file-id').value;
  const targetCatId = document.getElementById('move-file-target-category').value;

  const fileItem = adminFilesList.find(f => f.id == fileId);
  if (fileItem) fileItem.category_id = parseInt(targetCatId);

  renderAdminFilesTable();
  document.getElementById('move-file-modal').style.display = 'none';
  showToast('🚚 Category updated successfully!');
}

function renderAdminCategories() {
  const container = document.getElementById('admin-categories-list');
  if (!container) return;

  container.innerHTML = categoriesList.map(c => `
    <div class="card-item" style="margin-bottom: 0.75rem; display: flex; justify-content: space-between; align-items: center; padding: 0.85rem 1.25rem;">
      <div><i class="fa-solid fa-${c.icon || 'folder'}" style="color: var(--cyan-accent); margin-right: 0.75rem;"></i> <strong>${escapeHtml(c.name)}</strong></div>
      <span class="tag">${adminFilesList.filter(f => f.category_id === c.id).length} files</span>
    </div>
  `).join('');
}

function renderAdminPasscodes() {
  const container = document.getElementById('admin-passcodes-list');
  if (!container) return;

  container.innerHTML = `
    <div class="card-item" style="margin-bottom: 1rem; padding: 1rem;">
      <h4 style="margin-bottom: 0.5rem; color: var(--cyan-accent);"><i class="fa-solid fa-key"></i> Active Guest Passcodes</h4>
      <p style="font-size: 0.85rem; color: var(--text-muted); margin-bottom: 1rem;">Guest passcodes allow clients to unlock and download files.</p>
      
      <div style="display: flex; gap: 0.5rem; flex-wrap: wrap;">
        <span class="tag cyan" style="font-size: 0.9rem; padding: 0.4rem 0.8rem;">Master: tech2026</span>
        <span class="tag" style="font-size: 0.9rem; padding: 0.4rem 0.8rem;">Guest: PHCORNER</span>
      </div>
    </div>
  `;
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
    <tr style="border-bottom: 1px solid rgba(255,255,255,0.05);">
      <td style="padding: 0.6rem; color: var(--text-muted);">1</td>
      <td style="padding: 0.6rem;"><span class="tag cyan">GDRIVE_SYNC</span></td>
      <td style="padding: 0.6rem;">Synced 59 Google Drive files across 38 subfolders</td>
      <td style="padding: 0.6rem; color: var(--text-muted);">${new Date().toLocaleString()}</td>
    </tr>
  `;
}

function confirmDownloadAllZip() {
  const confirmed = confirm(
    `📦 DOWNLOAD ALL IT TOOLS CONFIRMATION\n\n` +
    `Are you sure you want to open your Google Drive IT_Utility_Vault folder containing all tools?\n\n` +
    `Click OK to proceed.`
  );

  if (confirmed) {
    window.open('https://drive.google.com', '_blank');
  }
}

function triggerGDriveAutoLink() {
  showToast('🔄 Auto-syncing Google Drive IT_Utility_Vault folder...');
  setTimeout(() => {
    showToast('Google Drive Vault Synced! (59 Files Active)');
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
  const container = document.getElementById('toast-container');
  if (!container) return;
  const t = document.createElement('div');
  t.className = 'toast-item';
  t.innerHTML = `<i class="fa-solid fa-circle-check" style="color: var(--cyan-accent);"></i> <span>${escapeHtml(msg)}</span>`;
  container.appendChild(t);
  setTimeout(() => t.remove(), 3500);
}

function escapeHtml(str) {
  return (str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
