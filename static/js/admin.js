// Admin Dashboard JavaScript Logic

let categoriesList = [];
let adminFilesList = [];
let allAuditLogsList = [];
let adminCmdScriptsList = [];
let currentLogsPage = 1;
let autoRefreshTimer = null;

document.addEventListener('DOMContentLoaded', () => {
  initTheme();
  checkAdminAuth();
  setupDragAndDrop();
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
  const tabs = ['upload', 'files', 'categories', 'commands', 'passcodes', 'feedback', 'logs', 'settings'];
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
  if (tabName === 'passcodes' || tabName === 'settings') loadAdminSettingsData();
  if (tabName === 'feedback') loadAdminComments();
  if (tabName === 'logs') loadAuditLogs();
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

function handleFileSelect(e) {
  const file = e.target.files[0];
  if (file) {
    updateDropZoneText(file.name);
  }
}

function onFileSelected(e) {
  return handleFileSelect(e);
}

function updateDropZoneText(filename) {
  document.getElementById('drop-zone-text').innerHTML = `<i class="fa-solid fa-file-check" style="color: var(--success-color);"></i> Selected: <strong>${escapeHtml(filename)}</strong>`;
}

function uploadFile(e) {
  return handleFileUpload(e);
}

async function handleFileUpload(e) {
  if (e) e.preventDefault();
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
  const progressBar = document.getElementById('upload-progress-bar');
  const progressFill = document.getElementById('upload-progress-fill');
  const statusText = document.getElementById('upload-status-text');
  const submitBtn = document.getElementById('upload-submit-btn');

  progressBar.style.display = 'block';
  statusText.style.display = 'block';
  submitBtn.disabled = true;
  statusText.innerText = 'Initiating 10 MB Chunked Resumable Session...';

  try {
    // Step 1: Init Resumable Upload Session
    const initRes = await fetch('/api/files/upload/init-resumable', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        filename: file.name,
        file_size: file.size,
        category_id: categorySelect.value
      })
    });
    const initData = await initRes.json();

    if (!initRes.ok || !initData.resumable_url) {
      alert(initData.error || 'Failed initiating resumable upload.');
      submitBtn.disabled = false;
      return;
    }

    const resumableUrl = initData.resumable_url;
    const chunkSize = 10 * 1024 * 1024; // 10 MB per chunk
    const totalChunks = Math.ceil(file.size / chunkSize);
    let uploadedBytes = 0;
    let finalGdriveId = null;

    // Step 2: Upload Chunks Sequentially
    for (let chunkIdx = 0; chunkIdx < totalChunks; chunkIdx++) {
      const start = chunkIdx * chunkSize;
      const end = Math.min(start + chunkSize, file.size);
      const chunkBlob = file.slice(start, end);
      const contentRange = `bytes ${start}-${end - 1}/${file.size}`;

      let chunkSuccess = false;
      let retries = 0;

      while (!chunkSuccess && retries < 5) {
        try {
          const currentMB = (end / (1024 * 1024)).toFixed(1);
          const totalMB = (file.size / (1024 * 1024)).toFixed(1);
          statusText.innerText = `Uploading Chunk ${chunkIdx + 1}/${totalChunks} (${currentMB} MB / ${totalMB} MB)...`;

          const chunkRes = await fetch('/api/files/upload/chunk-proxy', {
            method: 'POST',
            headers: {
              'X-Resumable-Url': resumableUrl,
              'Content-Range': contentRange,
              'Content-Type': 'application/octet-stream'
            },
            body: chunkBlob
          });

          const chunkData = await chunkRes.json();

          if (chunkRes.ok && chunkData.success) {
            chunkSuccess = true;
            uploadedBytes = end;
            const percent = Math.round((uploadedBytes / file.size) * 100);
            progressFill.style.width = `${percent}%`;

            if (chunkData.completed && chunkData.file_id) {
              finalGdriveId = chunkData.file_id;
            }
          } else {
            retries++;
            statusText.innerText = `Retrying Chunk ${chunkIdx + 1} (Attempt ${retries}/5)...`;
            await new Promise(r => setTimeout(r, 2000));
          }
        } catch (err) {
          retries++;
          statusText.innerText = `Network retry Chunk ${chunkIdx + 1} (Attempt ${retries}/5)...`;
          await new Promise(r => setTimeout(r, 2000));
        }
      }

      if (!chunkSuccess) {
        alert(`Upload paused at chunk ${chunkIdx + 1} due to network timeout after 5 retries. Please try again.`);
        submitBtn.disabled = false;
        return;
      }
    }

    // Step 3: Finalize DB Registration
    statusText.innerText = 'Finalizing file registration in vault...';
    const finalRes = await fetch('/api/files/upload/finalize-resumable', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        gdrive_id: finalGdriveId,
        filename: file.name,
        category_id: categorySelect.value,
        file_size: file.size,
        description: description,
        version: version
      })
    });

    const finalData = await finalRes.json();
    submitBtn.disabled = false;

    if (finalRes.ok && finalData.success) {
      alert(finalData.message || 'File uploaded successfully!');
      document.getElementById('upload-form').reset();
      document.getElementById('drop-zone-text').innerHTML = `Drag & drop installer/executable file here or click to browse`;
      progressBar.style.display = 'none';
      statusText.style.display = 'none';
      progressFill.style.width = '0%';
      loadAdminDashboardData();
    } else {
      alert(finalData.error || 'Failed finalizing file registration.');
    }

  } catch (err) {
    submitBtn.disabled = false;
    alert(`Upload exception: ${err.message}`);
  }
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
          <button class="btn btn-secondary btn-sm" onclick="openMoveFileModal(${f.id}, '${escapeJs(f.original_name)}', ${f.category_id})" title="Move File to Another Folder"><i class="fa-solid fa-folder-arrow-right"></i> Move</button>
          <button class="btn btn-danger btn-sm" onclick="deleteFile(${f.id}, '${escapeJs(f.original_name)}')"><i class="fa-solid fa-trash"></i></button>
        </td>
      </tr>
    `;
  });

  tableBody.innerHTML = html || '<tr><td colspan="8" style="text-align:center;">No files found matching criteria.</td></tr>';
}

async function openMoveFileModal(fileId, fileName, currentCatId) {
  document.getElementById('move-file-id').value = fileId;
  document.getElementById('move-file-name').innerText = fileName;

  const selectEl = document.getElementById('move-file-target-category');
  if (selectEl) {
    try {
      const res = await fetch('/api/categories');
      const data = await res.json();
      const catList = data.flat_list || [];

      let optionsHtml = '';
      catList.forEach(c => {
        const prefix = c.depth > 0 ? '  '.repeat(c.depth) + '└── ' : '';
        const isSelected = c.id === currentCatId ? 'selected' : '';
        optionsHtml += `<option value="${c.id}" ${isSelected}>${prefix}${escapeHtml(c.name)}</option>`;
      });
      selectEl.innerHTML = optionsHtml;
    } catch (err) {
      console.error('Error loading categories for move modal:', err);
    }
  }

  document.getElementById('move-file-modal').classList.add('active');
}

function closeMoveFileModal() {
  document.getElementById('move-file-modal').classList.remove('active');
}

async function handleMoveFileSubmit(e) {
  if (e) e.preventDefault();
  const fileId = document.getElementById('move-file-id').value;
  const targetCatId = document.getElementById('move-file-target-category').value;

  if (!fileId || !targetCatId) {
    alert('Please select a target folder.');
    return;
  }

  try {
    const res = await fetch(`/api/files/${fileId}/move`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ category_id: targetCatId })
    });
    const data = await res.json();

    if (res.ok && data.success) {
      alert(data.message || 'File moved successfully!');
      closeMoveFileModal();
      loadAdminDashboardData();
    } else {
      alert(data.error || 'Failed moving file.');
    }
  } catch (err) {
    alert('Server network error moving file.');
  }
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
      const usedGB = usedMB / 1024;
      
      const isGDrive = data.gdrive_active;
      const limitGB = isGDrive ? 5000 : 10; // 5 TB vs 10 GB
      const freeGB = Math.max(0, limitGB - usedGB);
      const percentUsed = ((usedGB / limitGB) * 100).toFixed(2);

      document.getElementById('stat-files').innerText = data.stats.total_files || 0;
      document.getElementById('stat-storage').innerText = `${usedMB.toFixed(1)} MB (${percentUsed}%)`;
      
      const usedLabelEl = document.querySelector('#stat-storage').previousElementSibling;
      if (usedLabelEl) {
        usedLabelEl.innerText = isGDrive ? 'Google Drive Storage Used' : 'Backblaze Storage Used';
      }

      const leftEl = document.getElementById('stat-storage-left');
      const leftLabelEl = document.querySelector('#stat-storage-left').previousElementSibling;

      if (leftEl) {
        if (isGDrive) {
          if (leftLabelEl) leftLabelEl.innerText = '5 TB Google Drive Storage Left';
          const freeTB = (freeGB / 1024).toFixed(3);
          leftEl.innerText = `${freeTB} TB Free`;
          leftEl.style.color = 'var(--success-color)';
        } else {
          if (leftLabelEl) leftLabelEl.innerText = '10 GB Free Storage Left';
          leftEl.innerText = `${freeGB.toFixed(2)} GB Free`;
          if (freeGB < 1) leftEl.style.color = 'var(--danger-color)';
          else leftEl.style.color = 'var(--success-color)';
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

async function migrateFilesToGDrive() {
  if (!confirm('Are you sure you want to copy all existing tools (172 MB) from Backblaze B2 into your 5 TB Google Drive folder?')) return;

  try {
    const res = await fetch('/api/admin/migrate-to-gdrive', { method: 'POST' });
    const data = await res.json();
    if (data.success) {
      alert(data.message);
      loadAdminDashboardData();
    } else {
      alert(data.error || 'Migration failed.');
    }
// Client Tool Comments & Feedback Moderation
async function loadAdminComments() {
  const tableBody = document.getElementById('admin-comments-table-body');
  if (!tableBody) return;

  tableBody.innerHTML = '<tr><td colspan="7" style="text-align:center;"><i class="fa-solid fa-spinner fa-spin"></i> Loading feedback...</td></tr>';

  try {
    const res = await fetch('/api/admin/comments');
    const data = await res.json();
    const comments = data.comments || [];

    if (comments.length === 0) {
      tableBody.innerHTML = '<tr><td colspan="7" style="text-align:center;">No technician feedback submitted yet.</td></tr>';
      return;
    }

    let html = '';
    comments.forEach(c => {
      const isWorking = c.status === 'working';
      const badgeClass = isWorking ? 'badge-success' : 'badge-danger';
      const statusLabel = isWorking ? '🟢 Working' : '🔴 Issue Reported';
      const dateStr = c.created_at ? c.created_at.split(' ')[0] : '-';

      html += `
        <tr>
          <td>#${c.id}</td>
          <td><strong>${escapeHtml(c.file_name)}</strong></td>
          <td>${escapeHtml(c.author_name)}</td>
          <td><span class="badge ${badgeClass}">${statusLabel}</span></td>
          <td style="max-width: 320px; word-break: break-word;">${escapeHtml(c.comment_text)}</td>
          <td>${dateStr}</td>
          <td>
            <button class="btn btn-danger btn-sm" onclick="deleteComment(${c.id})"><i class="fa-solid fa-trash"></i> Delete</button>
          </td>
        </tr>
      `;
    });

    tableBody.innerHTML = html;
  } catch (err) {
    tableBody.innerHTML = '<tr><td colspan="7" style="text-align:center; color: var(--danger-color);">Error loading client feedback.</td></tr>';
  }
}

async function deleteComment(commentId) {
  if (!confirm(`Are you sure you want to delete comment #${commentId}?`)) return;

  try {
    const res = await fetch(`/api/admin/comments/${commentId}`, { method: 'DELETE' });
    const data = await res.json();
    if (res.ok && data.success) {
      alert(data.message || 'Comment deleted.');
      loadAdminComments();
    } else {
      alert(data.error || 'Failed deleting comment.');
    }
  } catch (err) {
    alert('Server error deleting comment.');
  }
}

// Audit Logs Pagination & Actions
async function loadAuditLogs() {
  try {
    const res = await fetch('/api/admin/audit-logs');
    const data = await res.json();
    allAuditLogsList = data.logs || [];
    renderAuditLogsTable();
  } catch (err) {
    console.error('Error loading audit logs:', err);
  }
}

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
  const old_admin_password = document.getElementById('set-old-admin-password').value.trim();
  const new_admin_password = document.getElementById('set-admin-password').value.trim();
  const confirm_admin_password = document.getElementById('set-confirm-admin-password').value.trim();

  if (new_admin_password || old_admin_password || confirm_admin_password) {
    if (!old_admin_password) {
      alert('Please enter your current admin password to approve changing your password.');
      return;
    }
    if (!new_admin_password) {
      alert('Please enter a new admin password.');
      return;
    }
    if (new_admin_password.length < 6) {
      alert('New admin password must be at least 6 characters long.');
      return;
    }
    if (new_admin_password !== confirm_admin_password) {
      alert('New password and confirmation password do not match!');
      return;
    }
  }

  try {
    const res = await fetch('/api/admin/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        site_title,
        announcement,
        access_passcode,
        old_admin_password,
        new_admin_password,
        confirm_admin_password
      })
    });
    const data = await res.json();

    if (data.success) {
      alert(data.message || 'Portal & Security Settings updated successfully!');
      document.getElementById('set-old-admin-password').value = '';
      document.getElementById('set-admin-password').value = '';
      document.getElementById('set-confirm-admin-password').value = '';
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
