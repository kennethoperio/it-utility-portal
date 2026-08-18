// Admin Dashboard JavaScript Logic

let categoriesList = [];
let adminFilesList = [];
let allAuditLogsList = [];
let adminCmdScriptsList = [];
let currentLogsPage = 1;
let logsPerPage = 10;
let autoRefreshTimer = null;
let inactivityTimer = null;
const INACTIVITY_LIMIT = 5 * 60 * 1000; // 5 minutes

document.addEventListener('DOMContentLoaded', () => {
  initTheme();
  checkAdminAuth();
  setupDragAndDrop();
  setupInactivityAutoLogout();
});

function initTheme() {
  const savedTheme = localStorage.getItem('portal_theme') || 'dark';
  document.documentElement.setAttribute('data-theme', savedTheme);
  updateThemeIcon(savedTheme);
}

function toggleTheme() {
  const current = document.documentElement.getAttribute('data-theme') || 'dark';
  const newTheme = current === 'dark' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', newTheme);
  localStorage.setItem('portal_theme', newTheme);
  updateThemeIcon(newTheme);
}

function updateThemeIcon(theme) {
  const icon = document.querySelector('#theme-toggle-btn i');
  if (icon) {
    icon.className = theme === 'light' ? 'fa-solid fa-sun' : 'fa-solid fa-moon';
  }
}

function setupInactivityAutoLogout() {
  const resetTimer = () => {
    if (inactivityTimer) clearTimeout(inactivityTimer);
    inactivityTimer = setTimeout(async () => {
      alert('Admin session expired due to 5 minutes of inactivity.');
      await fetch('/api/auth/logout', { method: 'POST' });
      window.location.reload();
    }, INACTIVITY_LIMIT);
  };

  ['mousemove', 'keydown', 'scroll', 'click', 'touchstart'].forEach(evt => {
    document.addEventListener(evt, resetTimer, { passive: true });
  });

  resetTimer();
}

async function checkAdminAuth() {
  try {
    const res = await fetch('/api/auth/status');
    const data = await res.json();

    if (data.is_admin) {
      document.getElementById('admin-login-modal').classList.remove('active');
      document.getElementById('admin-main-content').style.display = 'block';
      document.getElementById('admin-logout-btn').style.display = 'inline-flex';
      loadAdminDashboardData();
      
      if (!autoRefreshTimer) {
        autoRefreshTimer = setInterval(() => {
          loadAdminSettingsData(true);
        }, 3000);
      }
    } else {
      document.getElementById('admin-login-modal').classList.add('active');
      document.getElementById('admin-main-content').style.display = 'none';
      document.getElementById('admin-logout-btn').style.display = 'none';
      if (autoRefreshTimer) {
        clearInterval(autoRefreshTimer);
        autoRefreshTimer = null;
      }
    }
  } catch (err) {
    console.error('Error checking admin auth:', err);
  }
}

async function submitAdminLogin(e) {
  e.preventDefault();
  const username = document.getElementById('admin-user-input').value.trim();
  const password = document.getElementById('admin-pass-input').value.trim();
  const errorEl = document.getElementById('admin-login-error');

  errorEl.style.display = 'none';

  try {
    const res = await fetch('/api/auth/admin-login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });
    const data = await res.json();

    if (data.success) {
      document.getElementById('admin-login-modal').classList.remove('active');
      document.getElementById('admin-main-content').style.display = 'block';
      document.getElementById('admin-logout-btn').style.display = 'inline-flex';
      loadAdminDashboardData();
    } else {
      errorEl.innerText = data.message || 'Invalid admin credentials.';
      errorEl.style.display = 'block';
    }
  } catch (err) {
    errorEl.innerText = 'Server communication error.';
    errorEl.style.display = 'block';
  }
}

async function logoutAdmin() {
  await fetch('/api/auth/logout', { method: 'POST' });
  window.location.reload();
}

function loadAdminDashboardData() {
  loadAdminCategories();
  loadAdminFiles();
  loadAdminCmdScripts();
  loadAdminSettingsData();
}

// Tab Switching
function switchAdminTab(tabName) {
  const tabs = ['upload', 'files', 'categories', 'commands', 'passcodes', 'logs', 'settings'];
  tabs.forEach(t => {
    const el = document.getElementById(`admin-sec-${t}`);
    if (el) el.style.display = 'none';
  });

  const buttons = document.querySelectorAll('.tabs .tab-btn');
  buttons.forEach(b => b.classList.remove('active'));

  const target = document.getElementById(`admin-sec-${tabName}`);
  if (target) target.style.display = 'block';

  const activeBtn = Array.from(buttons).find(b => b.getAttribute('onclick').includes(tabName));
  if (activeBtn) activeBtn.classList.add('active');

  if (tabName === 'files') loadAdminFiles();
  if (tabName === 'categories') loadAdminCategories();
  if (tabName === 'commands') loadAdminCmdScripts();
  if (tabName === 'passcodes' || tabName === 'logs' || tabName === 'settings') loadAdminSettingsData();
}

function confirmDownloadAllZip() {
  const totalFilesStr = document.getElementById('stat-files')?.innerText || '0';
  const totalStorageStr = document.getElementById('stat-storage')?.innerText || '0 MB';

  if (parseInt(totalFilesStr) === 0) {
    alert('No utility tools have been uploaded to your vault yet.');
    return;
  }

  const confirmed = confirm(
    `📦 DOWNLOAD ALL IT TOOLS CONFIRMATION\n\n` +
    `Are you sure you want to download a single ZIP package containing all ${totalFilesStr} tools?\n\n` +
    `Total Package Size: ~${totalStorageStr}\n` +
    `Folder Hierarchy: Saved in subfolders organized by category.\n\n` +
    `Click OK to start downloading.`
  );

  if (confirmed) {
    window.location.href = '/api/admin/download-all-zip';
  }
}

function getCategoryIconClass(categoryName, iconName) {
  if (iconName && iconName !== 'folder' && iconName !== 'folder-minus' && iconName !== 'auto') {
    return iconName.startsWith('fa-') ? iconName : `fa-${iconName}`;
  }
  const name = (categoryName || '').toLowerCase();
  if (name.includes('driver')) return 'fa-microchip';
  if (name.includes('print')) return 'fa-print';
  if (name.includes('reset')) return 'fa-rotate-left';
  if (name.includes('recover') || name.includes('undelete')) return 'fa-life-ring';
  if (name.includes('tool') || name.includes('install')) return 'fa-toolbox';
  if (name.includes('repair') || name.includes('fix') || name.includes('tweak')) return 'fa-screwdriver-wrench';
  if (name.includes('key') || name.includes('license') || name.includes('activat')) return 'fa-key';
  if (name.includes('network') || name.includes('wifi') || name.includes('ip')) return 'fa-network-wired';
  if (name.includes('anti') || name.includes('malware') || name.includes('shield') || name.includes('secur')) return 'fa-shield-virus';
  if (name.includes('hard') || name.includes('diag') || name.includes('ram') || name.includes('cpu')) return 'fa-microchip';
  if (name.includes('data') || name.includes('sql') || name.includes('db')) return 'fa-database';
  if (name.includes('disk') || name.includes('hdd') || name.includes('ssd') || name.includes('storage')) return 'fa-hard-drive';
  if (name.includes('remote') || name.includes('desk') || name.includes('vnc')) return 'fa-desktop';
  if (name.includes('mobile') || name.includes('android') || name.includes('phone')) return 'fa-mobile-screen';
  return 'fa-folder-tree';
}

// Categories Management
async function loadAdminCategories() {
  try {
    const res = await fetch('/api/categories');
    const data = await res.json();

    categoriesList = data.flat_list || [];
    const catMap = {};
    categoriesList.forEach(c => catMap[c.id] = c.name);

    const selectEl = document.getElementById('upload-category');
    const parentSelectEl = document.getElementById('cat-parent');
    const filterSelectEl = document.getElementById('admin-file-category-filter');

    let selectHtml = '<option value="">-- Select Target Folder --</option>';
    let parentHtml = '<option value="">-- Main Folder (Top Level) --</option>';
    let filterHtml = '<option value="">All Categories & Folders</option>';

    categoriesList.forEach(c => {
      const depth = c.depth || 0;
      const prefix = depth > 0 ? '&nbsp;&nbsp;'.repeat(depth) + '└── ' : '';

      selectHtml += `<option value="${c.id}">${prefix}${escapeHtml(c.name)}</option>`;
      filterHtml += `<option value="${c.id}">${prefix}${escapeHtml(c.name)}</option>`;
      parentHtml += `<option value="${c.id}">${prefix}${escapeHtml(c.name)}</option>`;
    });

    if (selectEl) selectEl.innerHTML = selectHtml;
    if (parentSelectEl) parentSelectEl.innerHTML = parentHtml;
    if (filterSelectEl) {
      const selectedVal = filterSelectEl.value;
      filterSelectEl.innerHTML = filterHtml;
      filterSelectEl.value = selectedVal;
    }

    // Populate Categories Table
    const tableBody = document.getElementById('admin-categories-table-body');
    let tableHtml = '';

    categoriesList.forEach(c => {
      const depth = c.depth || 0;
      const indent = depth > 0 ? '&nbsp;&nbsp;'.repeat(depth) + '└── ' : '';
      const parentName = c.parent_id ? (catMap[c.parent_id] || 'Main') : 'Main Folder';
      const iconClass = getCategoryIconClass(c.name, c.icon);

      tableHtml += `
        <tr>
          <td><strong>${indent}${escapeHtml(c.name)}</strong></td>
          <td><span class="badge badge-info">${escapeHtml(parentName)}</span></td>
          <td><i class="fa-solid ${iconClass}" style="color: var(--accent-color);"></i> <code>${iconClass}</code></td>
          <td>${escapeHtml(c.description || '-')}</td>
          <td>
            <button class="btn btn-secondary btn-sm" onclick="openEditCategoryModal(${c.id}, '${escapeJs(c.name)}', ${c.parent_id || 'null'}, '${escapeJs(c.icon || 'auto')}', '${escapeJs(c.description || '')}')">
              <i class="fa-solid fa-pen"></i> Edit
            </button>
            <button class="btn btn-danger btn-sm" onclick="deleteCategory(${c.id}, '${escapeJs(c.name)}')">
              <i class="fa-solid fa-trash"></i> Delete
            </button>
          </td>
        </tr>
      `;
    });

    if (tableBody) tableBody.innerHTML = tableHtml || '<tr><td colspan="5" style="text-align:center;">No categories created yet.</td></tr>';
  } catch (err) {
    console.error('Error loading admin categories:', err);
  }
}

async function handleCreateCategory(e) {
  e.preventDefault();
  const name = document.getElementById('cat-name').value.trim();
  const parent_id = document.getElementById('cat-parent').value || null;
  const icon = document.getElementById('cat-icon').value || 'auto';
  const description = document.getElementById('cat-description').value.trim();

  try {
    const res = await fetch('/api/categories', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, parent_id, icon, description })
    });
    const data = await res.json();

    if (data.success) {
      alert(data.message);
      document.getElementById('create-category-form').reset();
      loadAdminCategories();
      loadAdminFiles();
    } else {
      alert(data.error || 'Failed to create category.');
    }
  } catch (err) {
    alert('Server error creating category.');
  }
}

function openEditCategoryModal(id, name, parentId, icon, description) {
  document.getElementById('edit-cat-id').value = id;
  document.getElementById('edit-cat-name').value = name || '';
  document.getElementById('edit-cat-icon').value = icon || 'auto';
  document.getElementById('edit-cat-description').value = description || '';

  const editParentSelect = document.getElementById('edit-cat-parent');
  let parentHtml = '<option value="">-- Main Folder (Top Level) --</option>';
  categoriesList.forEach(c => {
    if (c.id !== id) {
      const depth = c.depth || 0;
      const prefix = depth > 0 ? '&nbsp;&nbsp;'.repeat(depth) + '└── ' : '';
      parentHtml += `<option value="${c.id}">${prefix}${escapeHtml(c.name)}</option>`;
    }
  });
  editParentSelect.innerHTML = parentHtml;
  editParentSelect.value = parentId ? parentId : '';

  document.getElementById('edit-category-modal').classList.add('active');
}

function closeEditCategoryModal() {
  document.getElementById('edit-category-modal').classList.remove('active');
}

async function handleSaveCategoryEdit(e) {
  e.preventDefault();
  const id = document.getElementById('edit-cat-id').value;
  const name = document.getElementById('edit-cat-name').value.trim();
  const parent_id = document.getElementById('edit-cat-parent').value || null;
  const icon = document.getElementById('edit-cat-icon').value || 'auto';
  const description = document.getElementById('edit-cat-description').value.trim();

  try {
    const res = await fetch(`/api/categories/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, parent_id, icon, description })
    });
    const data = await res.json();

    if (data.success) {
      alert(data.message);
      closeEditCategoryModal();
      loadAdminCategories();
      loadAdminFiles();
    } else {
      alert(data.error || 'Failed to update category.');
    }
  } catch (err) {
    alert('Server error updating category.');
  }
}

async function deleteCategory(id, name) {
  if (!confirm(`Are you sure you want to delete category "${name}"?\nWarning: This will also delete all subfolders and files assigned to this folder!`)) return;

  try {
    const res = await fetch(`/api/categories/${id}`, { method: 'DELETE' });
    const data = await res.json();
    if (data.success) {
      alert(data.message);
      loadAdminCategories();
      loadAdminFiles();
    } else {
      alert(data.error || 'Failed to delete category.');
    }
  } catch (err) {
    alert('Server error deleting category.');
  }
}

// Troubleshooting Commands Management
async function loadAdminCmdScripts() {
  try {
    const res = await fetch('/api/tools/cmd-scripts');
    const data = await res.json();
    adminCmdScriptsList = data.scripts || [];
    renderAdminCmdScriptsTable(adminCmdScriptsList);
  } catch (err) {
    console.error('Error loading CMD scripts in admin:', err);
  }
}

function renderAdminCmdScriptsTable(scripts) {
  const tableBody = document.getElementById('admin-commands-table-body');
  if (!tableBody) return;

  let html = '';
  scripts.forEach(s => {
    html += `
      <tr>
        <td><strong>${escapeHtml(s.title)}</strong></td>
        <td><span class="badge badge-info">${escapeHtml(s.type)}</span></td>
        <td><code style="background:#1e293b; padding:0.2rem 0.4rem; border-radius:4px; font-size:0.8rem; font-family:monospace; color:#38bdf8;">${escapeHtml(s.command)}</code></td>
        <td>
          <button class="btn btn-secondary btn-sm" onclick="editCmdScript(${s.id}, '${escapeJs(s.title)}', '${escapeJs(s.type)}', '${escapeJs(s.command)}', '${escapeJs(s.description || '')}')">
            <i class="fa-solid fa-pen"></i> Edit
          </button>
          <button class="btn btn-danger btn-sm" onclick="deleteCmdScript(${s.id}, '${escapeJs(s.title)}')">
            <i class="fa-solid fa-trash"></i> Delete
          </button>
        </td>
      </tr>
    `;
  });

  tableBody.innerHTML = html || '<tr><td colspan="4" style="text-align:center;">No troubleshooting commands added yet.</td></tr>';
}

async function handleCreateCmdScript(e) {
  e.preventDefault();
  const title = document.getElementById('cmd-title').value.trim();
  const type = document.getElementById('cmd-type').value;
  const command = document.getElementById('cmd-command').value.trim();
  const description = document.getElementById('cmd-description').value.trim();

  try {
    const res = await fetch('/api/admin/cmd-scripts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title, type, command, description })
    });
    const data = await res.json();

    if (data.success) {
      alert(data.message);
      document.getElementById('create-command-form').reset();
      loadAdminCmdScripts();
    } else {
      alert(data.error || 'Failed to add command script.');
    }
  } catch (err) {
    alert('Server error creating command script.');
  }
}

async function editCmdScript(id, currentTitle, currentType, currentCmd, currentDesc) {
  const title = prompt("Edit Command Title:", currentTitle);
  if (!title || !title.trim()) return;

  const type = prompt("Edit Environment Type (e.g. PowerShell / CMD, PowerShell, CMD):", currentType) || currentType;
  const command = prompt("Edit Command String:", currentCmd);
  if (!command || !command.trim()) return;

  const description = prompt("Edit Description:", currentDesc) || "";

  try {
    const res = await fetch(`/api/admin/cmd-scripts/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: title.trim(), type: type.trim(), command: command.trim(), description: description.trim() })
    });
    const data = await res.json();

    if (data.success) {
      alert(data.message);
      loadAdminCmdScripts();
    } else {
      alert(data.error || 'Failed to update command script.');
    }
  } catch (err) {
    alert('Server error editing command script.');
  }
}

async function deleteCmdScript(id, title) {
  if (!confirm(`Are you sure you want to delete command "${title}"?`)) return;

  try {
    const res = await fetch(`/api/admin/cmd-scripts/${id}`, { method: 'DELETE' });
    const data = await res.json();
    if (data.success) {
      alert(data.message);
      loadAdminCmdScripts();
    } else {
      alert(data.error || 'Failed to delete command.');
    }
  } catch (err) {
    alert('Server error deleting command.');
  }
}

// Drag & Drop Upload
function setupDragAndDrop() {
  const dropZone = document.getElementById('drop-zone');
  if (!dropZone) return;

  ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
    dropZone.addEventListener(eventName, preventDefaults, false);
  });

  function preventDefaults(e) {
    e.preventDefault();
    e.stopPropagation();
  }

  ['dragenter', 'dragover'].forEach(eventName => {
    dropZone.addEventListener(eventName, () => dropZone.classList.add('dragover'), false);
  });

  ['dragleave', 'drop'].forEach(eventName => {
    dropZone.addEventListener(eventName, () => dropZone.classList.remove('dragover'), false);
  });

  dropZone.addEventListener('drop', (e) => {
    const dt = e.dataTransfer;
    const files = dt.files;
    if (files.length > 0) {
      document.getElementById('file-input').files = files;
      updateDropZoneText(files[0].name);
    }
  });
}

function onFileSelected(e) {
  const file = e.target.files[0];
  if (file) {
    updateDropZoneText(file.name);
  }
}

function updateDropZoneText(filename) {
  document.getElementById('drop-zone-text').innerHTML = `<i class="fa-solid fa-file-check" style="color: var(--success-color);"></i> Selected: <strong>${escapeHtml(filename)}</strong>`;
}

function handleFileUpload(e) {
  e.preventDefault();
  const fileInput = document.getElementById('file-input');
  const categorySelect = document.getElementById('upload-category');
  const description = document.getElementById('upload-description').value.trim();
  const version = document.getElementById('upload-version').value.trim();

  if (!fileInput.files || fileInput.files.length === 0) {
    alert('Please select a file to upload.');
    return;
  }
  if (!categorySelect.value) {
    alert('Please select a target category/folder.');
    return;
  }

  const file = fileInput.files[0];
  const formData = new FormData();
  formData.append('file', file);
  formData.append('category_id', categorySelect.value);
  formData.append('description', description);
  formData.append('version', version);

  const progressBar = document.getElementById('upload-progress-bar');
  const progressFill = document.getElementById('upload-progress-fill');
  const statusText = document.getElementById('upload-status-text');
  const submitBtn = document.getElementById('upload-submit-btn');

  progressBar.style.display = 'block';
  statusText.style.display = 'block';
  submitBtn.disabled = true;

  const xhr = new XMLHttpRequest();
  xhr.open('POST', '/api/files/upload', true);

  xhr.upload.onprogress = (event) => {
    if (event.lengthComputable) {
      const percent = Math.round((event.loaded / event.total) * 100);
      progressFill.style.width = `${percent}%`;
      statusText.innerText = `Uploading: ${percent}% (${(event.loaded / (1024*1024)).toFixed(1)} MB / ${(event.total / (1024*1024)).toFixed(1)} MB)`;
    }
  };

  xhr.onload = () => {
    submitBtn.disabled = false;
    if (xhr.status === 200) {
      const data = JSON.parse(xhr.responseText);
      alert(data.message || 'File uploaded successfully!');
      document.getElementById('upload-form').reset();
      document.getElementById('drop-zone-text').innerHTML = `Drag & drop installer/executable file here or click to browse`;
      progressBar.style.display = 'none';
      statusText.style.display = 'none';
      progressFill.style.width = '0%';
      loadAdminDashboardData();
    } else {
      let err = 'Upload failed.';
      try { err = JSON.parse(xhr.responseText).error; } catch(e){}
      alert(err);
      statusText.innerText = `Upload failed: ${err}`;
    }
  };

  xhr.onerror = () => {
    submitBtn.disabled = false;
    alert('Network error during file upload.');
  };

  xhr.send(formData);
}

// Manage Files Table with Category & Search Filtering
async function loadAdminFiles() {
  const catFilter = document.getElementById('admin-file-category-filter')?.value;
  try {
    let url = '/api/files';
    if (catFilter) url += `?category_id=${catFilter}`;

    const res = await fetch(url);
    const data = await res.json();
    adminFilesList = data.files || [];
    renderAdminFilesTable(adminFilesList);
  } catch (err) {
    console.error('Error loading admin files:', err);
  }
}

function filterAdminFilesTable() {
  const searchQuery = document.getElementById('admin-file-search-filter')?.value.trim().toLowerCase() || '';
  let filtered = adminFilesList;
  if (searchQuery) {
    filtered = adminFilesList.filter(f => 
      f.original_name.toLowerCase().includes(searchQuery) ||
      (f.description && f.description.toLowerCase().includes(searchQuery)) ||
      (f.category_name && f.category_name.toLowerCase().includes(searchQuery))
    );
  }
  renderAdminFilesTable(filtered);
}

function renderAdminFilesTable(files) {
  const tableBody = document.getElementById('admin-files-table-body');
  if (!tableBody) return;

  let html = '';
  files.forEach(f => {
    const sizeMB = (f.file_size / (1024 * 1024)).toFixed(2);
    const dateStr = f.created_at ? f.created_at.split(' ')[0] : '-';

    html += `
      <tr>
        <td>#${f.id}</td>
        <td><strong>${escapeHtml(f.original_name)}</strong></td>
        <td><span class="badge badge-info">${escapeHtml(f.category_name)}</span></td>
        <td>${sizeMB} MB</td>
        <td>v${escapeHtml(f.version || '1.0')}</td>
        <td>${f.download_count || 0}</td>
        <td>${dateStr}</td>
        <td>
          <a href="/api/files/download/${f.id}" class="btn btn-secondary btn-sm" title="Download"><i class="fa-solid fa-download"></i></a>
          <button class="btn btn-danger btn-sm" onclick="deleteFile(${f.id}, '${escapeJs(f.original_name)}')"><i class="fa-solid fa-trash"></i></button>
        </td>
      </tr>
    `;
  });

  tableBody.innerHTML = html || '<tr><td colspan="8" style="text-align:center;">No files found matching criteria.</td></tr>';
}

async function deleteFile(id, name) {
  if (!confirm(`Are you sure you want to delete file "${name}" from server storage?`)) return;

  try {
    const res = await fetch(`/api/files/${id}`, { method: 'DELETE' });
    const data = await res.json();
    if (data.success) {
      alert(data.message);
      loadAdminDashboardData();
    } else {
      alert(data.error || 'Failed to delete file.');
    }
  } catch (err) {
    alert('Server error deleting file.');
  }
}

// Settings, Guest Passcodes & Audit Logs Pagination
async function loadAdminSettingsData(isSilent = false) {
  try {
    const res = await fetch('/api/admin/settings');
    const data = await res.json();

    if (data.stats) {
      const totalBytes = data.stats.total_bytes || 0;
      const usedMB = totalBytes / (1024 * 1024);
      const limitBytes = 10 * 1024 * 1024 * 1024; // 10 GB
      const freeBytes = Math.max(0, limitBytes - totalBytes);
      const freeGB = (freeBytes / (1024 * 1024 * 1024)).toFixed(2);
      const percentUsed = ((totalBytes / limitBytes) * 100).toFixed(1);

      document.getElementById('stat-files').innerText = data.stats.total_files || 0;
      document.getElementById('stat-storage').innerText = `${usedMB.toFixed(1)} MB (${percentUsed}%)`;
      
      const leftEl = document.getElementById('stat-storage-left');
      if (leftEl) {
        leftEl.innerText = `${freeGB} GB Free`;
        if (freeBytes < 1 * 1024 * 1024 * 1024) {
          leftEl.style.color = 'var(--danger-color)';
        } else {
          leftEl.style.color = 'var(--success-color)';
        }
      }

      document.getElementById('stat-downloads').innerText = data.stats.total_downloads || 0;
    }

    if (!isSilent) {
      document.getElementById('set-site-title').value = data.site_title || '';
      document.getElementById('set-announcement').value = data.announcement || '';
      document.getElementById('set-primary-passcode').value = data.access_passcode || '';
    }

    const passTable = document.getElementById('guest-passcodes-table-body');
    let passHtml = '';
    (data.guest_passcodes || []).forEach(g => {
      const isLimitReached = g.max_uses > 0 && g.current_uses >= g.max_uses;
      const usesStr = g.max_uses > 0 ? `${g.current_uses} / ${g.max_uses}` : `${g.current_uses} (Unlimited)`;
      const expires = g.expires_at ? g.expires_at.split(' ')[0] : 'Never';
      const badgeClass = isLimitReached ? 'badge-danger' : 'badge-info';
      const badgeStyle = isLimitReached ? 'background: rgba(239, 68, 68, 0.15); color: #ef4444;' : '';

      passHtml += `
        <tr>
          <td><strong style="color: var(--accent-color);">${escapeHtml(g.passcode)}</strong></td>
          <td>${escapeHtml(g.label)}</td>
          <td><span class="badge ${badgeClass}" style="${badgeStyle}">${usesStr}</span></td>
          <td>${expires}</td>
          <td><button class="btn btn-danger btn-sm" onclick="deleteGuestPasscode(${g.id})"><i class="fa-solid fa-trash"></i></button></td>
        </tr>
      `;
    });
    if (passTable) passTable.innerHTML = passHtml || '<tr><td colspan="5" style="text-align:center;">No temporary passcodes created.</td></tr>';

    allAuditLogsList = data.audit_logs || [];
    renderAuditLogsTable();

  } catch (err) {
    if (!isSilent) console.error('Error loading admin settings:', err);
  }
}

// Audit Logs Pagination & Actions
function changeLogsPerPage(val) {
  logsPerPage = parseInt(val) || 10;
  currentLogsPage = 1;
  renderAuditLogsTable();
}

function prevLogsPage() {
  if (currentLogsPage > 1) {
    currentLogsPage--;
    renderAuditLogsTable();
  }
}

function nextLogsPage() {
  const maxPage = Math.ceil(allAuditLogsList.length / logsPerPage) || 1;
  if (currentLogsPage < maxPage) {
    currentLogsPage++;
    renderAuditLogsTable();
  }
}

function renderAuditLogsTable() {
  const logsTable = document.getElementById('admin-audit-logs-body');
  if (!logsTable) return;

  const totalLogs = allAuditLogsList.length;
  const maxPage = Math.ceil(totalLogs / logsPerPage) || 1;
  if (currentLogsPage > maxPage) currentLogsPage = maxPage;

  const startIndex = (currentLogsPage - 1) * logsPerPage;
  const endIndex = Math.min(startIndex + logsPerPage, totalLogs);
  const pageLogs = allAuditLogsList.slice(startIndex, endIndex);

  let logsHtml = '';
  pageLogs.forEach(l => {
    logsHtml += `
      <tr>
        <td>#${l.id}</td>
        <td><span class="badge badge-info">${escapeHtml(l.action)}</span></td>
        <td>${escapeHtml(l.details)}</td>
        <td>${escapeHtml(l.ip_address)}</td>
        <td>${escapeHtml(l.created_at)}</td>
        <td>
          <button class="btn btn-danger btn-sm" onclick="deleteSingleAuditLog(${l.id})" title="Delete Log Entry"><i class="fa-solid fa-trash-can"></i></button>
        </td>
      </tr>
    `;
  });

  logsTable.innerHTML = logsHtml || '<tr><td colspan="6" style="text-align:center;">No activity logged yet.</td></tr>';

  const infoEl = document.getElementById('logs-pagination-info');
  const pageNumberEl = document.getElementById('logs-page-number');
  const prevBtn = document.getElementById('logs-prev-btn');
  const nextBtn = document.getElementById('logs-next-btn');

  if (infoEl) {
    infoEl.innerText = totalLogs > 0 ? `Showing ${startIndex + 1} to ${endIndex} of ${totalLogs} logs` : 'Showing 0 logs';
  }
  if (pageNumberEl) {
    pageNumberEl.innerText = `Page ${currentLogsPage} of ${maxPage}`;
  }
  if (prevBtn) prevBtn.disabled = (currentLogsPage <= 1);
  if (nextBtn) nextBtn.disabled = (currentLogsPage >= maxPage);
}

async function deleteSingleAuditLog(id) {
  if (!confirm(`Are you sure you want to delete audit log #${id}?`)) return;
  try {
    const res = await fetch(`/api/admin/audit-logs/${id}`, { method: 'DELETE' });
    const data = await res.json();
    if (data.success) {
      allAuditLogsList = allAuditLogsList.filter(l => l.id !== id);
      renderAuditLogsTable();
    } else {
      alert(data.error || 'Failed to delete audit log.');
    }
  } catch (err) {
    alert('Server error deleting audit log.');
  }
}

async function clearAllAuditLogs() {
  if (!confirm('Are you sure you want to CLEAR ALL AUDIT LOGS?\nWarning: This action cannot be undone!')) return;
  try {
    const res = await fetch('/api/admin/audit-logs', { method: 'DELETE' });
    const data = await res.json();
    if (data.success) {
      alert(data.message);
      allAuditLogsList = [];
      renderAuditLogsTable();
    } else {
      alert(data.error || 'Failed to clear audit logs.');
    }
  } catch (err) {
    alert('Server error clearing audit logs.');
  }
}

async function handleCreateGuestPasscode(e) {
  e.preventDefault();
  const label = document.getElementById('passcode-label').value.trim();
  const max_uses = document.getElementById('passcode-max-uses').value;
  const days_valid = document.getElementById('passcode-valid-days').value;

  try {
    const res = await fetch('/api/admin/guest-passcodes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ label, max_uses, days_valid })
    });
    const data = await res.json();

    if (data.success) {
      alert(`Temporary Guest Passcode Generated:\n\nPasscode: ${data.passcode}\nLabel: ${label}`);
      document.getElementById('guest-passcode-form').reset();
      loadAdminSettingsData();
    } else {
      alert(data.error || 'Failed to generate guest passcode.');
    }
  } catch (err) {
    alert('Server error generating guest passcode.');
  }
}

async function deleteGuestPasscode(id) {
  if (!confirm('Are you sure you want to delete this temporary guest passcode?')) return;
  try {
    const res = await fetch(`/api/admin/guest-passcodes/${id}`, { method: 'DELETE' });
    const data = await res.json();
    if (data.success) loadAdminSettingsData();
  } catch (err) {
    alert('Error deleting passcode.');
  }
}

async function handleSaveSettings(e) {
  e.preventDefault();
  const site_title = document.getElementById('set-site-title').value.trim();
  const announcement = document.getElementById('set-announcement').value.trim();
  const access_passcode = document.getElementById('set-primary-passcode').value.trim();
  const new_admin_password = document.getElementById('set-admin-password').value.trim();

  try {
    const res = await fetch('/api/admin/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ site_title, announcement, access_passcode, new_admin_password })
    });
    const data = await res.json();

    if (data.success) {
      alert('Portal & Security Settings updated successfully!');
      document.getElementById('set-admin-password').value = '';
      loadAdminSettingsData();
    } else {
      alert(data.error || 'Failed to save settings.');
    }
  } catch (err) {
    alert('Server error saving settings.');
  }
}

// Helpers
function escapeHtml(str) {
  if (!str) return '';
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function escapeJs(str) {
  if (!str) return '';
  return String(str).replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}
