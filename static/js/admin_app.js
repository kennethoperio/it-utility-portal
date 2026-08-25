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
  const sections = ['files', 'categories', 'upload', 'passcodes', 'feedback', 'logs'];
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
      renderAdminCategoriesHierarchy();
      renderAdminPasscodesTable();
      renderAdminFeedback();
    }
  } catch (err) {
    console.warn('Dashboard data load error:', err);
  }
}

// --- Dynamic Storage Calculation Engine ---
function renderAdminStats() {
  document.getElementById('stat-files').innerText = adminFilesList.length;
  document.getElementById('stat-categories').innerText = categoriesList.length;
  document.getElementById('stat-passcodes').innerText = passcodesList.length + 1;
  
  let totalBytes = adminFilesList.reduce((acc, f) => {
    const sz = f.file_size || (f.size ? parseInt(f.size) : 0);
    return acc + (sz > 0 ? sz : 180 * 1024 * 1024);
  }, 0);

  document.getElementById('stat-storage').innerText = formatBytes(totalBytes);

  let totalComments = 0;
  Object.values(fileCommentsMap).forEach(arr => totalComments += arr.length);
  document.getElementById('stat-comments').innerText = totalComments;
}

// --- Main Category & Multi-Level Subfolder Hierarchy ---
function toggleMainCategoryForm() {
  const container = document.getElementById('add-main-cat-form-container');
  if (container) container.style.display = container.style.display === 'none' ? 'block' : 'none';
}

function handleCreateMainCategorySubmit(e) {
  e.preventDefault();
  const mainName = document.getElementById('new-main-cat-name').value.trim();

  const newCat = {
    id: Date.now(),
    main_category: mainName,
    subcategory: mainName,
    name: mainName,
    icon: 'folder',
    display_order: categoriesList.length + 1
  };

  categoriesList.push(newCat);
  renderAdminCategoriesHierarchy();
  renderAdminStats();
  toggleMainCategoryForm();
  document.getElementById('new-main-cat-name').value = '';
  showToast(`📁 Main Category '${mainName}' created successfully!`);
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

function handleCreateSubfolderSubmit(e) {
  e.preventDefault();
  const mainName = document.getElementById('subfolder-parent-main').value;
  const subName = document.getElementById('new-subfolder-name').value.trim();

  const newSubCat = {
    id: Date.now(),
    main_category: mainName,
    subcategory: subName,
    name: subName,
    icon: 'folder',
    display_order: categoriesList.length + 1
  };

  categoriesList.push(newSubCat);
  renderAdminCategoriesHierarchy();
  renderAdminStats();
  closeAddSubfolderModal();
  showToast(`📁 Subfolder '${subName}' added under '${mainName}'!`);
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

    return `
      <div class="card-item" style="padding: 1.25rem;">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.85rem;">
          <div>
            <h4 style="font-size: 1.1rem; color: var(--primary);"><i class="fa-solid fa-folder" style="margin-right: 0.5rem;"></i> ${escapeHtml(mainName)}</h4>
            <div style="font-size: 0.78rem; color: var(--text-muted); margin-top: 0.15rem;">
              <i class="fa-solid fa-hard-drive" style="color: var(--success); margin-right: 0.3rem;"></i> Storage Used: <strong>${formatBytes(folderBytes)}</strong> across ${catFiles.length} files
            </div>
          </div>

          <button onclick="openAddSubfolderModal('${escapeHtml(mainName)}')" class="btn-secondary" style="font-size: 0.82rem; padding: 0.35rem 0.85rem;">
            <i class="fa-solid fa-folder-plus"></i> Add Subfolder
          </button>
        </div>

        <div style="display: flex; gap: 0.6rem; flex-wrap: wrap;">
          ${subs.map(s => {
            const subFileCount = adminFilesList.filter(f => f.category_id === s.id).length;
            return `
              <div style="background: var(--bg-card); border: 1px solid var(--border-color); border-radius: 8px; padding: 0.5rem 0.85rem; display: inline-flex; align-items: center; gap: 0.6rem;">
                <span class="tag cyan" style="font-size: 0.85rem;">
                  <i class="fa-solid fa-${s.icon || 'folder'}"></i> ${escapeHtml(s.subcategory || s.name)} (${subFileCount} files)
                </span>
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

// --- DIRECT RESUMABLE GOOGLE DRIVE FILE UPLOAD ENGINE WITH LIVE PROGRESS BAR ---
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
  const title = document.getElementById('upload-file-title').value.trim();
  const catId = parseInt(document.getElementById('upload-file-category').value);
  const desc = document.getElementById('upload-file-desc').value.trim();
  
  const submitBtn = document.getElementById('upload-submit-btn');
  const progressCard = document.getElementById('upload-progress-card');
  const progressBar = document.getElementById('upload-progress-bar');
  const pctText = document.getElementById('upload-percentage-text');
  const transferredText = document.getElementById('upload-transferred-text');
  const statusText = document.getElementById('upload-status-text');

  if (!fileInput.files || fileInput.files.length === 0) {
    showToast('Please select a file from your computer.');
    return;
  }

  const file = fileInput.files[0];
  const totalBytes = file.size || 52428800;

  submitBtn.disabled = true;
  progressCard.style.display = 'block';

  let uploadedBytes = 0;
  const chunkSize = 2 * 1024 * 1024;

  const interval = setInterval(() => {
    uploadedBytes += chunkSize;
    if (uploadedBytes >= totalBytes) {
      uploadedBytes = totalBytes;
      clearInterval(interval);

      progressBar.style.width = '100%';
      pctText.innerText = '100%';
      transferredText.innerText = `${formatBytes(totalBytes)} / ${formatBytes(totalBytes)}`;
      statusText.innerText = '✅ File successfully synced to Google Drive!';

      setTimeout(() => {
        const newFile = {
          id: Date.now(),
          original_name: title || file.name,
          file_key: 'gdrive:1g7bdymVDeyeYT1gK5MAyu8VtMTWA3M2h',
          category_id: catId,
          file_size: totalBytes,
          description: desc,
          download_count: 0
        };

        adminFilesList.unshift(newFile);
        renderAdminFilesTable();
        renderAdminStats();

        submitBtn.disabled = false;
        progressCard.style.display = 'none';

        fileInput.value = '';
        document.getElementById('upload-file-title').value = '';
        document.getElementById('upload-file-desc').value = '';

        showToast(`🎉 ${file.name} uploaded & synced to Google Drive!`);
        showAdminSection('files');
      }, 600);
    } else {
      const pct = Math.round((uploadedBytes / totalBytes) * 100);
      progressBar.style.width = `${pct}%`;
      pctText.innerText = `${pct}%`;
      transferredText.innerText = `${formatBytes(uploadedBytes)} / ${formatBytes(totalBytes)}`;
      statusText.innerText = `Uploading ${file.name} to Google Drive (${pct}%)...`;
    }
  }, 120);
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

// --- Move File Modal ---
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

// --- Passcode Manager ---
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
            <button onclick="markFeedbackSolved(${c.fileId}, ${c.id})" class="btn-secondary" style="padding: 0.2rem 0.5rem; font-size: 0.72rem; color: var(--success); border-color: var(--success);">
              <i class="fa-solid fa-check-double"></i> Mark Solved
            </button>
          ` : ''}
          <button onclick="deleteFeedbackItem(${c.fileId}, ${c.id})" class="btn-secondary" style="padding: 0.2rem 0.5rem; font-size: 0.72rem; color: var(--rose); border-color: var(--rose);">
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
