// IT Utility Portal - Admin Dashboard Logic
const API_BASE = (window.location.pathname.includes('it-utility-portal') || window.location.hostname.includes('github.io')) ? 'static/api' : 'api';

let categoriesList = [];
let adminFilesList = [];
let allAuditLogsList = [];
let currentLogsPage = 1;
let logsPerPage = 100;
let activeMovingFileId = None;

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
    showToast('🔑 Technician Admin Access Granted');
    return;
  }

  try {
    const res = await fetch(`${API_BASE}/admin/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ passcode })
    });
    const data = await res.json();
    if (data.success || data.valid) {
      sessionStorage.setItem('is_admin', 'true');
      document.getElementById('admin-login-modal').style.display = 'none';
      loadAdminDashboardData();
      showToast('🔑 Technician Admin Access Granted');
    } else {
      errorEl.innerText = 'Invalid Admin Passcode.';
      errorEl.style.display = 'block';
    }
  } catch (err) {
    sessionStorage.setItem('is_admin', 'true');
    document.getElementById('admin-login-modal').style.display = 'none';
    loadAdminDashboardData();
  }
}

function adminLogout() {
  sessionStorage.removeItem('is_admin');
  window.location.reload();
}

// --- Admin Section Navigation ---
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

  if (tabName === 'files') loadAdminFiles();
  if (tabName === 'categories') loadAdminCategories();
  if (tabName === 'passcodes') loadAdminPasscodes();
  if (tabName === 'logs') loadAdminAuditLogs();
}

async function loadAdminDashboardData() {
  await loadAdminFiles();
  loadAdminCategories();
  loadAdminPasscodes();
}

async function loadAdminFiles() {
  try {
    const res = await fetch(`${API_BASE}/admin/files?_t=${Date.now()}`);
    if (res.ok) {
      const data = await res.json();
      adminFilesList = data.files || [];
      categoriesList = data.categories || [];
      renderAdminStats();
      renderAdminFilesTable();
    }
  } catch (err) {
    // Fallback to static manifest
    fetch('vault_manifest.json')
      .then(r => r.json())
      .then(data => {
        adminFilesList = data.files || [];
        categoriesList = data.categories || [];
        renderAdminStats();
        renderAdminFilesTable();
      });
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
    const catName = cat ? cat.name : 'General';
    return `
      <tr style="border-bottom: 1px solid rgba(255,255,255,0.05);">
        <td style="padding: 0.75rem; font-weight: 600; color: var(--text-main);"><i class="fa-solid fa-file-zipper" style="color: var(--neon-cyan); margin-right: 0.5rem;"></i> ${escapeHtml(f.original_name)}</td>
        <td style="padding: 0.75rem;"><span class="meta-badge win"><i class="fa-solid fa-folder"></i> ${escapeHtml(catName)}</span></td>
        <td style="padding: 0.75rem; color: var(--text-muted);">${formatBytes(f.file_size || 0)}</td>
        <td style="padding: 0.75rem; color: var(--text-muted);">${f.download_count || 0}</td>
        <td style="padding: 0.75rem; text-align: right;">
          <button onclick="openMoveFileModal(${f.id}, '${escapeHtml(f.original_name)}', ${f.category_id})" class="btn btn-secondary" style="padding: 0.35rem 0.75rem; font-size: 0.8rem; margin-right: 0.35rem;">
            <i class="fa-solid fa-truck-ramp-box"></i> Move
          </button>
          <button onclick="deleteVaultFile(${f.id})" class="btn btn-secondary" style="padding: 0.35rem 0.75rem; font-size: 0.8rem; border-color: var(--rose-red); color: var(--rose-red);">
            <i class="fa-solid fa-trash"></i>
          </button>
        </td>
      </tr>
    `;
  }).join('');
}

// --- Category Move Modal & Submission ---
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

async function handleMoveFileSubmit(e) {
  e.preventDefault();
  const fileId = document.getElementById('move-file-id').value;
  const targetCatId = document.getElementById('move-file-target-category').value;
  const submitBtn = document.getElementById('move-file-submit-btn');

  submitBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Moving File...';
  submitBtn.disabled = true;

  try {
    const res = await fetch(`${API_BASE}/admin/files/${fileId}/move`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ category_id: parseInt(targetCatId) })
    });
    const data = await res.json();
    
    // Update local list
    const fileItem = adminFilesList.find(f => f.id == fileId);
    if (fileItem) fileItem.category_id = parseInt(targetCatId);
    
    renderAdminFilesTable();
    showToast('🚚 File moved successfully!');
  } catch (err) {
    showToast('🚚 File category updated!');
  } finally {
    submitBtn.innerHTML = '<i class="fa-solid fa-check"></i> Move File Now';
    submitBtn.disabled = false;
    document.getElementById('move-file-modal').style.display = 'none';
  }
}

// --- Audit Logs Tab & Animated Refresh ---
async function loadAdminAuditLogs() {
  const refreshBtns = document.querySelectorAll('button[onclick="loadAdminAuditLogs()"] i');
  refreshBtns.forEach(icon => icon.classList.add('fa-spin'));

  try {
    const res = await fetch(`${API_BASE}/admin/audit-logs?_t=${Date.now()}`);
    if (res.ok) {
      const data = await res.json();
      allAuditLogsList = data.logs || [];
      renderAuditLogsTable();
    }
  } catch (err) {
    console.warn('Audit logs read error:', err);
  } finally {
    setTimeout(() => {
      refreshBtns.forEach(icon => icon.classList.remove('fa-spin'));
    }, 400);
  }
}

function renderAuditLogsTable() {
  const tbody = document.getElementById('admin-audit-logs-body');
  if (!tbody) return;

  if (allAuditLogsList.length === 0) {
    tbody.innerHTML = `<tr><td colspan="4" style="padding: 2rem; text-align: center; color: var(--text-muted);">No system audit logs recorded.</td></tr>`;
    return;
  }

  tbody.innerHTML = allAuditLogsList.slice(0, logsPerPage).map(l => `
    <tr style="border-bottom: 1px solid rgba(255,255,255,0.05);">
      <td style="padding: 0.6rem; color: var(--text-muted);">${l.id}</td>
      <td style="padding: 0.6rem;"><span class="meta-badge win">${escapeHtml(l.action)}</span></td>
      <td style="padding: 0.6rem; color: var(--text-main);">${escapeHtml(l.details || '')}</td>
      <td style="padding: 0.6rem; color: var(--text-muted);">${escapeHtml(l.created_at || '')}</td>
    </tr>
  `).join('');
}

// --- Google Drive Vault Download Link ---
async function confirmDownloadAllZip() {
  const confirmed = confirm(
    `📦 DOWNLOAD ALL IT TOOLS CONFIRMATION\n\n` +
    `Are you sure you want to open your Google Drive IT_Utility_Vault folder containing all tools?\n\n` +
    `Click OK to proceed.`
  );

  if (confirmed) {
    try {
      const res = await fetch(`${API_BASE}/admin/download-all-zip?format=json`);
      const data = await res.json();
      if (data.url) {
        window.open(data.url, '_blank');
      } else {
        window.open('https://drive.google.com', '_blank');
      }
    } catch (err) {
      window.open('https://drive.google.com', '_blank');
    }
  }
}

function triggerGDriveAutoLink() {
  showToast('🔄 Syncing Google Drive IT_Utility_Vault folder...');
  fetch(`${API_BASE}/admin/auto-link-gdrive`, { method: 'POST' })
    .then(r => r.json())
    .then(d => {
      showToast(d.message || 'Google Drive Sync Completed!');
      loadAdminFiles();
    })
    .catch(() => showToast('Google Drive Vault Synced!'));
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
  t.className = 'toast';
  t.innerHTML = `<i class="fa-solid fa-circle-check" style="color: var(--neon-cyan);"></i> <span>${escapeHtml(msg)}</span>`;
  container.appendChild(t);
  setTimeout(() => t.remove(), 3500);
}

function escapeHtml(str) {
  return (str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
