// Admin Dashboard JavaScript Logic

let categoriesList = [];
let adminFilesList = [];

document.addEventListener('DOMContentLoaded', () => {
  checkAdminAuth();
  setupDragAndDrop();
});

async function checkAdminAuth() {
  try {
    const res = await fetch('/api/auth/status');
    const data = await res.json();

    if (data.is_admin) {
      document.getElementById('admin-login-modal').classList.remove('active');
      document.getElementById('admin-main-content').style.display = 'block';
      document.getElementById('admin-logout-btn').style.display = 'inline-flex';
      loadAdminDashboardData();
    } else {
      document.getElementById('admin-login-modal').classList.add('active');
      document.getElementById('admin-main-content').style.display = 'none';
      document.getElementById('admin-logout-btn').style.display = 'none';
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
  loadAdminSettingsData();
}

// Tab Switching
function switchAdminTab(tabName) {
  const tabs = ['upload', 'files', 'categories', 'passcodes', 'logs', 'settings'];
  tabs.forEach(t => {
    const el = document.getElementById(`admin-sec-${t}`);
    if (el) el.style.display = 'none';
  });

  const buttons = document.querySelectorAll('.tabs .tab-btn');
  buttons.forEach(b => b.classList.remove('active'));

  const target = document.getElementById(`admin-sec-${tabName}`);
  if (target) target.style.display = 'block';

  // Highlight active button
  const activeBtn = Array.from(buttons).find(b => b.getAttribute('onclick').includes(tabName));
  if (activeBtn) activeBtn.classList.add('active');

  if (tabName === 'files') loadAdminFiles();
  if (tabName === 'categories') loadAdminCategories();
  if (tabName === 'passcodes' || tabName === 'logs' || tabName === 'settings') loadAdminSettingsData();
}

// Batch Download All Tools (.zip) with Confirmation
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

// Categories Management
async function loadAdminCategories() {
  try {
    const res = await fetch('/api/categories');
    const data = await res.json();

    categoriesList = data.flat_list || [];

    // Populate category select dropdowns
    const selectEl = document.getElementById('upload-category');
    const parentSelectEl = document.getElementById('cat-parent');
    const filterSelectEl = document.getElementById('admin-file-category-filter');

    let selectHtml = '<option value="">-- Select Category --</option>';
    let parentHtml = '<option value="">-- Main Folder (Top Level) --</option>';
    let filterHtml = '<option value="">All Categories & Folders</option>';

    categoriesList.forEach(c => {
      const prefix = c.parent_id ? '&nbsp;&nbsp;└── ' : '';
      selectHtml += `<option value="${c.id}">${prefix}${escapeHtml(c.name)}</option>`;
      filterHtml += `<option value="${c.id}">${prefix}${escapeHtml(c.name)}</option>`;
      if (!c.parent_id) {
        parentHtml += `<option value="${c.id}">${escapeHtml(c.name)}</option>`;
      }
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
      const parentName = c.parent_id ? (categoriesList.find(p => p.id === c.parent_id)?.name || 'Main') : 'Main Folder';
      tableHtml += `
        <tr>
          <td><strong>${c.parent_id ? '└── ' : ''}${escapeHtml(c.name)}</strong></td>
          <td><span class="badge badge-info">${escapeHtml(parentName)}</span></td>
          <td>${escapeHtml(c.description || '-')}</td>
          <td>
            <button class="btn btn-danger btn-sm" onclick="deleteCategory(${c.id}, '${escapeJs(c.name)}')">
              <i class="fa-solid fa-trash"></i> Delete
            </button>
          </td>
        </tr>
      `;
    });

    if (tableBody) tableBody.innerHTML = tableHtml || '<tr><td colspan="4" style="text-align:center;">No categories created yet.</td></tr>';
  } catch (err) {
    console.error('Error loading admin categories:', err);
  }
}

async function handleCreateCategory(e) {
  e.preventDefault();
  const name = document.getElementById('cat-name').value.trim();
  const parent_id = document.getElementById('cat-parent').value || null;
  const description = document.getElementById('cat-description').value.trim();

  try {
    const res = await fetch('/api/categories', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, parent_id, description })
    });
    const data = await res.json();

    if (data.success) {
      alert(data.message);
      document.getElementById('create-category-form').reset();
      loadAdminCategories();
    } else {
      alert(data.error || 'Failed to create category.');
    }
  } catch (err) {
    alert('Server error creating category.');
  }
}

async function deleteCategory(id, name) {
  if (!confirm(`Are you sure you want to delete category "${name}"?\nWarning: This will also delete all files assigned to this folder!`)) return;

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

// Settings & Guest Passcodes
async function loadAdminSettingsData() {
  try {
    const res = await fetch('/api/admin/settings');
    const data = await res.json();

    // Stats
    if (data.stats) {
      document.getElementById('stat-files').innerText = data.stats.total_files || 0;
      document.getElementById('stat-storage').innerText = `${((data.stats.total_bytes || 0) / (1024 * 1024)).toFixed(1)} MB`;
      document.getElementById('stat-downloads').innerText = data.stats.total_downloads || 0;
    }

    // Settings fields
    document.getElementById('set-site-title').value = data.site_title || '';
    document.getElementById('set-announcement').value = data.announcement || '';
    document.getElementById('set-primary-passcode').value = data.access_passcode || '';

    // Guest passcodes table
    const passTable = document.getElementById('guest-passcodes-table-body');
    let passHtml = '';
    (data.guest_passcodes || []).forEach(g => {
      const usesStr = g.max_uses > 0 ? `${g.current_uses} / ${g.max_uses}` : `${g.current_uses} (Unlimited)`;
      const expires = g.expires_at ? g.expires_at.split(' ')[0] : 'Never';
      passHtml += `
        <tr>
          <td><strong style="color: var(--accent-color);">${escapeHtml(g.passcode)}</strong></td>
          <td>${escapeHtml(g.label)}</td>
          <td>${usesStr}</td>
          <td>${expires}</td>
          <td><button class="btn btn-danger btn-sm" onclick="deleteGuestPasscode(${g.id})"><i class="fa-solid fa-trash"></i></button></td>
        </tr>
      `;
    });
    if (passTable) passTable.innerHTML = passHtml || '<tr><td colspan="5" style="text-align:center;">No temporary passcodes created.</td></tr>';

    // Audit logs table
    const logsTable = document.getElementById('admin-audit-logs-body');
    let logsHtml = '';
    (data.audit_logs || []).forEach(l => {
      logsHtml += `
        <tr>
          <td>#${l.id}</td>
          <td><span class="badge badge-info">${escapeHtml(l.action)}</span></td>
          <td>${escapeHtml(l.details)}</td>
          <td>${escapeHtml(l.ip_address)}</td>
          <td>${escapeHtml(l.created_at)}</td>
        </tr>
      `;
    });
    if (logsTable) logsTable.innerHTML = logsHtml || '<tr><td colspan="5" style="text-align:center;">No activity logged yet.</td></tr>';

  } catch (err) {
    console.error('Error loading admin settings:', err);
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
