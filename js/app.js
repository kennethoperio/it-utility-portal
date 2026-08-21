const API_BASE = (window.location.pathname.includes('it-utility-portal') || window.location.hostname.includes('github.io')) ? 'static/api' : 'api';
// Technician Download Portal JavaScript Logic

let currentCategoryId = null;
let currentSearchQuery = "";
let allFiles = [];
let categoriesTreeData = [];
let expandedCategoryIds = new Set();
let isDownloadingMap = {};

document.addEventListener('DOMContentLoaded', () => {
  initTheme();
  checkAuthStatus();
  loadDeviceInspectorDetails();
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

async function checkAuthStatus() {
  try {
    const res = await fetch(`${API_BASE}/auth/status`);
    const data = await res.json();

    if (data.site_title) {
      document.getElementById('site-title-display').innerText = data.site_title;
      document.title = `${data.site_title} | IT Utilities`;
    }

    if (data.announcement) {
      document.getElementById('announcement-text').innerText = data.announcement;
      document.getElementById('announcement-banner').style.display = 'block';
    } else {
      document.getElementById('announcement-banner').style.display = 'none';
    }

    if (data.is_unlocked) {
      document.getElementById('passcode-modal').classList.remove('active');
      if (data.is_admin) {
        document.getElementById('client-logout-btn').style.display = 'none';
      } else {
        document.getElementById('client-logout-btn').style.display = 'inline-flex';
      }
      loadCategories();
      loadFiles();
      loadCmdScripts();
      loadNetworkInfo();
    } else {
      document.getElementById('passcode-modal').classList.add('active');
    }
  } catch (err) {
    console.error('Error checking auth status:', err);
  }
}

async function submitPasscode(e) {
  e.preventDefault();
  const passcode = document.getElementById('passcode-input').value.trim();
  const errorEl = document.getElementById('passcode-error');

  errorEl.style.display = 'none';

  try {
    const res = await fetch(`${API_BASE}/auth/verify-passcode`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ passcode })
    });
    const data = await res.json();

    if (data.success) {
      document.getElementById('passcode-modal').classList.remove('active');
      document.getElementById('client-logout-btn').style.display = 'inline-flex';
      loadCategories();
      loadFiles();
      loadCmdScripts();
      loadNetworkInfo();
    } else {
      errorEl.innerText = data.message || 'Invalid passcode.';
      errorEl.style.display = 'block';
    }
  } catch (err) {
    errorEl.innerText = 'Server connection error.';
    errorEl.style.display = 'block';
  }
}

async function logoutClient() {
  try {
    await fetch(`${API_BASE}/auth/logout`, { method: 'POST' });
    window.location.reload();
  } catch (err) {
    window.location.reload();
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

function getUniformCategoryIcon(categoryName, filename) {
  const cat = (categoryName || '').toLowerCase();
  const fn = (filename || '').toLowerCase();

  if (cat.includes('driver') || cat.includes('epson') || cat.includes('hp') || cat.includes('canon') || cat.includes('brother')) {
    return { icon: 'fa-microchip', color: '#38bdf8', bg: 'rgba(56, 189, 248, 0.15)' };
  }
  if (cat.includes('printer') || cat.includes('reset')) {
    return { icon: 'fa-print', color: '#22c55e', bg: 'rgba(34, 197, 94, 0.15)' };
  }
  if (cat.includes('recover') || cat.includes('undelete')) {
    return { icon: 'fa-life-ring', color: '#f59e0b', bg: 'rgba(245, 158, 11, 0.15)' };
  }
  if (cat.includes('repair') || cat.includes('fix') || cat.includes('windows')) {
    return { icon: 'fa-screwdriver-wrench', color: '#6366f1', bg: 'rgba(99, 102, 241, 0.15)' };
  }
  if (cat.includes('key') || cat.includes('license') || cat.includes('activat')) {
    return { icon: 'fa-key', color: '#eab308', bg: 'rgba(234, 179, 8, 0.15)' };
  }
  if (cat.includes('network') || cat.includes('wifi') || cat.includes('ip')) {
    return { icon: 'fa-network-wired', color: '#06b6d4', bg: 'rgba(6, 182, 212, 0.15)' };
  }
  if (cat.includes('anti') || cat.includes('malware') || cat.includes('shield') || cat.includes('secur')) {
    return { icon: 'fa-shield-virus', color: '#ef4444', bg: 'rgba(239, 68, 68, 0.15)' };
  }
  if (cat.includes('hard') || cat.includes('diag') || cat.includes('cpu') || cat.includes('ram')) {
    return { icon: 'fa-microchip', color: '#14b8a6', bg: 'rgba(20, 184, 166, 0.15)' };
  }
  if (cat.includes('tool') || cat.includes('install')) {
    return { icon: 'fa-toolbox', color: '#a855f7', bg: 'rgba(168, 85, 247, 0.15)' };
  }

  const ext = fn.split('.').pop().toLowerCase();
  if (['zip', 'rar', '7z', 'tar', 'iso'].includes(ext)) {
    return { icon: 'fa-file-zipper', color: '#ec4899', bg: 'rgba(236, 72, 153, 0.15)' };
  }

  return { icon: 'fa-folder-tree', color: '#38bdf8', bg: 'rgba(56, 189, 248, 0.15)' };
}

async function loadCategories() {
  try {
    const res = await fetch(`${API_BASE}/categories`);
    const data = await res.json();
    categoriesTreeData = data.categories || [];

    const treeEl = document.getElementById('categories-tree');
    let html = `<li><button class="category-btn ${currentCategoryId === null ? 'active' : ''}" onclick="selectCategory(null)"><i class="fa-solid fa-border-all"></i> All Utilities</button></li>`;

    function buildCategoryTreeHtml(nodes, depth = 0) {
      let treeHtml = '';
      (nodes || []).forEach(cat => {
        const isCatActive = currentCategoryId === cat.id;
        const isExpanded = expandedCategoryIds.has(cat.id);
        const iconClass = getCategoryIconClass(cat.name, cat.icon);
        const paddingLeft = depth > 0 ? `style="padding-left: ${0.75 + depth * 0.75}rem;"` : '';
        const hasChildren = cat.children && cat.children.length > 0;

        treeHtml += `<li class="category-item">
          <div style="display: flex; align-items: center; width: 100%;">
            <button class="category-btn ${isCatActive ? 'active' : ''}" ${paddingLeft} style="flex: 1;" onclick="selectCategory(${cat.id})">
              <span><i class="fa-solid ${iconClass}"></i> ${escapeHtml(cat.name)}</span>
            </button>
            ${hasChildren ? `
              <button class="toggle-folder-btn" onclick="toggleCategoryExpand(event, ${cat.id})" title="Toggle subfolders">
                <i class="fa-solid fa-chevron-right chevron-icon ${isExpanded ? 'rotated' : ''}"></i>
              </button>
            ` : ''}
          </div>`;

        if (hasChildren) {
          treeHtml += `<ul class="subcategory-list ${isExpanded ? 'open' : ''}" style="padding-left: 0.5rem;">`;
          treeHtml += buildCategoryTreeHtml(cat.children, depth + 1);
          treeHtml += `</ul>`;
        }
        treeHtml += `</li>`;
      });
      return treeHtml;
    }

    html += buildCategoryTreeHtml(categoriesTreeData);
    treeEl.innerHTML = html;
  } catch (err) {
    console.error('Error loading categories:', err);
  }
}

function getCategoryPathIds(nodes, targetId, currentPath = []) {
  if (!targetId || !nodes) return [];
  for (const node of nodes) {
    const newPath = [...currentPath, node.id];
    if (node.id === targetId) return newPath;
    if (node.children && node.children.length > 0) {
      const found = getCategoryPathIds(node.children, targetId, newPath);
      if (found.length > 0) return found;
    }
  }
  return [];
}

function toggleCategoryExpand(event, catId) {
  if (event) event.stopPropagation();
  if (expandedCategoryIds.has(catId)) {
    expandedCategoryIds.delete(catId);
  } else {
    expandedCategoryIds.clear();
    const pathIds = getCategoryPathIds(categoriesTreeData, catId);
    pathIds.forEach(id => expandedCategoryIds.add(id));
  }
  loadCategories();
}

function selectCategory(catId) {
  currentCategoryId = catId;
  expandedCategoryIds.clear();
  if (catId !== null) {
    const pathIds = getCategoryPathIds(categoriesTreeData, catId);
    pathIds.forEach(id => expandedCategoryIds.add(id));
  }
  loadCategories();
  loadFiles();
}

function handleSearch() {
  currentSearchQuery = document.getElementById('search-input').value.trim();
  renderFiles(allFiles);
}

async function loadFiles() {
  const gridEl = document.getElementById('files-grid');
  gridEl.innerHTML = `<div style="grid-column: 1 / -1; text-align: center; color: var(--text-secondary); padding: 3rem;">
    <i class="fa-solid fa-spinner fa-spin fa-2x"></i>
    <p style="margin-top: 1rem;">Loading files...</p>
  </div>`;

  try {
    let url = '/api/files';
    const params = [];
    if (currentCategoryId !== null) params.push(`category_id=${currentCategoryId}`);
    if (params.length > 0) url += '?' + params.join('&');

    const res = await fetch(url);
    const data = await res.json();

    allFiles = data.files || [];
    renderFiles(allFiles);
  } catch (err) {
    gridEl.innerHTML = `<div style="grid-column: 1 / -1; text-align: center; color: var(--danger-color); padding: 3rem;">
      <i class="fa-solid fa-circle-exclamation fa-2x"></i>
      <p style="margin-top: 1rem;">Error loading utility tools.</p>
    </div>`;
  }
}

function findCategoryNode(nodes, targetId) {
  if (!targetId || !nodes) return null;
  for (const node of nodes) {
    if (node.id === targetId) return node;
    if (node.children && node.children.length > 0) {
      const found = findCategoryNode(node.children, targetId);
      if (found) return found;
    }
  }
  return null;
}

function renderFiles(files) {
  const gridEl = document.getElementById('files-grid');
  let html = '';

  const activeNode = findCategoryNode(categoriesTreeData, currentCategoryId);
  const hasSubfolders = activeNode && activeNode.children && activeNode.children.length > 0;

  if (hasSubfolders) {
    html += `
      <div style="grid-column: 1 / -1; margin-bottom: 1.25rem;">
        <h3 style="font-size: 1rem; color: var(--text-secondary); margin-bottom: 0.85rem; display: flex; align-items: center; gap: 0.5rem;">
          <i class="fa-solid fa-folder-tree" style="color: var(--accent-color);"></i> Subfolders inside ${escapeHtml(activeNode.name)}
        </h3>
        <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 1rem;">
    `;

    activeNode.children.forEach(sub => {
      const subIcon = getCategoryIconClass(sub.name, sub.icon);
      html += `
        <div onclick="selectCategory(${sub.id})" style="background-color: var(--card-bg); border: 1px solid var(--border-color); border-radius: var(--radius); padding: 1.1rem; display: flex; align-items: center; gap: 0.85rem; cursor: pointer; transition: transform 0.2s ease, border-color 0.2s ease;" onmouseover="this.style.borderColor='var(--accent-color)'; this.style.transform='translateY(-2px)'" onmouseout="this.style.borderColor='var(--border-color)'; this.style.transform='none'">
          <div style="width: 44px; height: 44px; border-radius: 8px; background-color: rgba(56, 189, 248, 0.12); color: var(--accent-color); display: flex; align-items: center; justify-content: center; font-size: 1.3rem; flex-shrink: 0;">
            <i class="fa-solid ${subIcon}"></i>
          </div>
          <div style="overflow: hidden; flex: 1;">
            <div style="font-weight: 700; font-size: 0.95rem; color: var(--text-primary); white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${escapeHtml(sub.name)}</div>
            <div style="font-size: 0.78rem; color: var(--accent-color); margin-top: 0.15rem;">Click to view subfolder &rarr;</div>
          </div>
        </div>
      `;
    });

    html += `
        </div>
      </div>
    `;
  }

  let filtered = files;
  if (currentSearchQuery) {
    const q = currentSearchQuery.toLowerCase();
    filtered = files.filter(f => 
      f.original_name.toLowerCase().includes(q) ||
      (f.description && f.description.toLowerCase().includes(q)) ||
      (f.category_name && f.category_name.toLowerCase().includes(q))
    );
  }

  if (filtered.length === 0) {
    if (hasSubfolders) {
      html += `
        <div style="grid-column: 1 / -1; text-align: center; color: var(--text-secondary); padding: 2rem; background-color: var(--bg-secondary); border: 1px dashed var(--border-color); border-radius: var(--radius);">
          <i class="fa-solid fa-folder-tree fa-2x" style="margin-bottom: 0.75rem; opacity: 0.5;"></i>
          <p style="font-size: 0.9rem;">Select a subfolder above to view its utility installers and drivers.</p>
        </div>
      `;
    } else {
      html = `
        <div style="grid-column: 1 / -1; text-align: center; color: var(--text-secondary); padding: 3rem;">
          <i class="fa-solid fa-folder-open fa-3x" style="margin-bottom: 1rem; opacity: 0.5;"></i>
          <h3>No tools found</h3>
          <p style="font-size: 0.9rem; margin-top: 0.5rem;">No files uploaded directly in this folder yet, or search term returned zero matches.</p>
        </div>
      `;
    }
    gridEl.innerHTML = html;
    return;
  }

  filtered.forEach(f => {
    const iconStyle = getUniformCategoryIcon(f.category_name, f.original_name);
    const sizeMB = (f.file_size / (1024 * 1024)).toFixed(2);
    const isDownloading = !!isDownloadingMap[f.id];

    html += `
      <div class="file-card">
        <div class="file-header">
          <div class="file-icon" style="background-color: ${iconStyle.bg}; color: ${iconStyle.color};">
            <i class="fa-solid ${iconStyle.icon}"></i>
          </div>
          <div style="flex: 1; overflow: hidden;">
            <div class="file-title" title="${escapeHtml(f.original_name)}">${escapeHtml(f.original_name)}</div>
            <div style="display: flex; gap: 0.5rem; align-items: center; margin-top: 0.2rem;">
              <span class="badge badge-info">${escapeHtml(f.category_name)}</span>
              <span class="badge badge-success">v${escapeHtml(f.version || '1.0')}</span>
            </div>
          </div>
        </div>

        <div class="file-desc">${escapeHtml(f.description || 'No description provided.')}</div>

        <div class="file-meta">
          <span><i class="fa-solid fa-hard-drive"></i> ${sizeMB} MB</span>
          <span><i class="fa-solid fa-download"></i> ${f.download_count || 0} downloads</span>
        </div>

        <div class="file-actions">
          <button class="btn btn-primary" id="btn-download-${f.id}" style="flex: 1;" ${isDownloading ? 'disabled' : ''} onclick="handleDownloadClick(event, ${f.id}, '${escapeJs(f.original_name)}')">
            ${isDownloading ? '<i class="fa-solid fa-spinner fa-spin"></i> Downloading...' : '<i class="fa-solid fa-download"></i> Download'}
          </button>
          <button class="btn btn-secondary btn-icon" onclick="openCommentsModal(${f.id}, '${escapeJs(f.original_name)}')" title="Technician Feedback & Comments">
            <i class="fa-solid fa-comments"></i> ${f.comment_count ? `<span style="font-size:0.75rem; font-weight:700; margin-left:2px;">${f.comment_count}</span>` : ''}
          </button>
          <button class="btn btn-secondary btn-icon" onclick="copyHash('${f.sha256_hash}')" title="Copy SHA-256 Hash">
            <i class="fa-solid fa-fingerprint"></i>
          </button>
          <button class="btn btn-secondary btn-icon" onclick="openQrModal(${f.id}, '${escapeHtml(f.original_name)}')" title="Mobile QR Code">
            <i class="fa-solid fa-qrcode"></i>
          </button>
        </div>
      </div>
    `;
  });

  gridEl.innerHTML = html;
}

// Tool Comments & Technician Feedback Logic
async function openCommentsModal(fileId, fileName) {
  document.getElementById('comment-file-id').value = fileId;
  document.getElementById('comments-tool-title').innerText = fileName;
  document.getElementById('comment-text').value = '';
  document.getElementById('comments-modal').classList.add('active');

  await loadComments(fileId);
}

function closeCommentsModal() {
  document.getElementById('comments-modal').classList.remove('active');
}

async function loadComments(fileId) {
  const container = document.getElementById('comments-list-container');
  const summaryEl = document.getElementById('comments-health-summary');
  const badgeEl = document.getElementById('comments-health-badge');

  container.innerHTML = `<div style="text-align: center; color: var(--text-secondary); padding: 1.5rem;"><i class="fa-solid fa-spinner fa-spin"></i> Loading feedback...</div>`;

  try {
    const res = await fetch(`${API_BASE}/files/${fileId}/comments`);
    const data = await res.json();
    const comments = data.comments || [];
    const stats = data.stats || { total: 0, working_count: 0, broken_count: 0, working_pct: 100 };

    if (summaryEl && badgeEl) {
      if (stats.total === 0) {
        summaryEl.innerText = 'No technician feedback posted yet. Be the first!';
        badgeEl.className = 'badge badge-info';
        badgeEl.innerText = 'No Reviews Yet';
      } else {
        summaryEl.innerText = `${stats.working_count} Working vs ${stats.broken_count} Reported Issues (${stats.total} total reviews)`;
        if (stats.broken_count > 0 && stats.working_pct < 60) {
          badgeEl.className = 'badge badge-danger';
          badgeEl.innerText = `🔴 ${stats.working_pct}% Working`;
        } else {
          badgeEl.className = 'badge badge-success';
          badgeEl.innerText = `🟢 ${stats.working_pct}% Working`;
        }
      }
    }

    if (comments.length === 0) {
      container.innerHTML = `<div style="text-align: center; color: var(--text-secondary); padding: 1.5rem; background: var(--bg-secondary); border-radius: 8px;">No comments posted for this tool yet.</div>`;
      return;
    }

    let html = '';
    comments.forEach(c => {
      const isWorking = c.status === 'working';
      const badgeHtml = isWorking 
        ? `<span class="badge badge-success" style="font-size: 0.75rem;"><i class="fa-solid fa-check"></i> Working Great</span>`
        : `<span class="badge badge-danger" style="font-size: 0.75rem;"><i class="fa-solid fa-triangle-exclamation"></i> Issue Found</span>`;
      const dateStr = c.created_at ? c.created_at.split(' ')[0] : '';

      html += `
        <div style="background-color: var(--bg-secondary); border: 1px solid var(--border-color); border-radius: var(--radius); padding: 0.85rem; margin-bottom: 0.75rem;">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.35rem;">
            <div style="display: flex; align-items: center; gap: 0.5rem;">
              <strong style="font-size: 0.88rem; color: var(--text-primary);"><i class="fa-solid fa-user-gear" style="color: var(--accent-color);"></i> ${escapeHtml(c.author_name)}</strong>
              ${badgeHtml}
            </div>
            <span style="font-size: 0.75rem; color: var(--text-secondary);">${dateStr}</span>
          </div>
          <p style="font-size: 0.85rem; color: var(--text-secondary); margin: 0; line-height: 1.4;">${escapeHtml(c.comment_text)}</p>
        </div>
      `;
    });

    container.innerHTML = html;
  } catch (err) {
    container.innerHTML = `<div style="text-align: center; color: var(--danger-color); padding: 1rem;">Error loading tool comments.</div>`;
  }
}

async function submitToolComment(e) {
  if (e) e.preventDefault();
  const fileId = document.getElementById('comment-file-id').value;
  const author_name = document.getElementById('comment-author').value.trim();
  const status = document.getElementById('comment-status').value;
  let comment_text = document.getElementById('comment-text').value.trim();
  const submitBtn = document.getElementById('comment-submit-btn');

  if (!fileId) {
    alert('Invalid file.');
    return;
  }

  if (!comment_text) {
    comment_text = status === 'working' ? 'Verified working.' : 'Issue reported.';
  }

  submitBtn.disabled = true;
  submitBtn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Submitting...`;

  try {
    const res = await fetch(`${API_BASE}/files/${fileId}/comments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ author_name, status, comment_text })
    });
    const data = await res.json();
    submitBtn.disabled = false;
    submitBtn.innerHTML = `<i class="fa-solid fa-paper-plane"></i> Submit Feedback`;

    if (res.ok && data.success) {
      document.getElementById('comment-text').value = '';
      await loadComments(fileId);
      loadFiles();
    } else {
      alert(data.error || 'Failed submitting feedback.');
    }
  } catch (err) {
    submitBtn.disabled = false;
    submitBtn.innerHTML = `<i class="fa-solid fa-paper-plane"></i> Submit Feedback`;
    alert('Network error submitting feedback.');
  }
}

async function handleDownloadClick(e, fileId, fileName) {
  if (e) e.preventDefault();
  
  if (isDownloadingMap[fileId]) return;
  isDownloadingMap[fileId] = true;

  const btn = document.getElementById(`btn-download-${fileId}`);
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Preparing...`;
  }

  try {
    const checkRes = await fetch(`${API_BASE}/files/check-download/${fileId}`);
    const checkData = await checkRes.json();

    if (!checkRes.ok || checkData.allowed === false) {
      delete isDownloadingMap[fileId];
      if (btn) {
        btn.disabled = false;
        btn.innerHTML = `<i class="fa-solid fa-download"></i> Download`;
      }
      const msg = checkData.error || 'Your temporary passcode download limit has been reached.';
      document.getElementById('download-limit-msg').innerText = msg;
      document.getElementById('download-limit-modal').classList.add('active');
      return;
    }
  } catch (err) {
    console.error('Check download permission error:', err);
  }

  const modal = document.getElementById('download-progress-modal');
  const filenameEl = document.getElementById('download-progress-filename');
  const fillEl = document.getElementById('download-progress-fill');
  const statusEl = document.getElementById('download-progress-status');

  if (filenameEl) filenameEl.innerText = fileName ? `Downloading: ${fileName}` : 'Connecting to 5 TB Google Drive...';
  if (fillEl) fillEl.style.width = '10%';
  if (statusEl) statusEl.innerText = '🚀 Download Started! Browser pop-up triggered...';

  if (modal) modal.classList.add('active');

  const downloadUrl = `/api/files/download/${fileId}`;
  window.location.href = downloadUrl;

  let currentPercent = 10;
  const progressInterval = setInterval(() => {
    currentPercent += 20;
    if (currentPercent >= 100) {
      currentPercent = 100;
      clearInterval(progressInterval);

      if (fillEl) fillEl.style.width = '100%';
      if (statusEl) statusEl.innerText = '✅ File Transfer Initialized!';

      setTimeout(() => {
        if (modal) modal.classList.remove('active');
        delete isDownloadingMap[fileId];
        if (btn) {
          btn.disabled = false;
          btn.innerHTML = `<i class="fa-solid fa-download"></i> Download`;
        }
      }, 1200);
    } else {
      if (fillEl) fillEl.style.width = `${currentPercent}%`;
      if (statusEl) statusEl.innerText = `Streaming chunks... ${currentPercent}%`;
    }
  }, 800);
}

function copyHash(hash) {
  navigator.clipboard.writeText(hash).then(() => {
    alert(`SHA-256 Hash copied to clipboard:\n${hash}`);
  });
}

function closeDownloadLimitModal() {
  document.getElementById('download-limit-modal').classList.remove('active');
}

function openQrModal(fileId, fileName) {
  document.getElementById('qr-tool-name').innerText = `Scan to download: ${fileName}`;
  const container = document.getElementById('qr-image-container');
  container.innerHTML = `<img src="/api/files/qrcode/${fileId}" alt="QR Code" style="width: 180px; height: 180px; display: block;">`;
  document.getElementById('qrcode-modal').classList.add('active');
}

function closeQrModal() {
  document.getElementById('qrcode-modal').classList.remove('active');
}

// Navigation Tabs
function switchMainTab(tab) {
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
  document.getElementById('section-files').style.display = 'none';
  document.getElementById('section-builder').style.display = 'none';
  document.getElementById('section-cmd').style.display = 'none';
  document.getElementById('section-net').style.display = 'none';
  document.getElementById('section-inspector').style.display = 'none';

  if (tab === 'files') {
    document.getElementById('tab-files-btn').classList.add('active');
    document.getElementById('section-files').style.display = 'block';
  } else if (tab === 'builder') {
    document.getElementById('tab-builder-btn').classList.add('active');
    document.getElementById('section-builder').style.display = 'block';
  } else if (tab === 'cmd') {
    document.getElementById('tab-cmd-btn').classList.add('active');
    document.getElementById('section-cmd').style.display = 'block';
  } else if (tab === 'net') {
    document.getElementById('tab-net-btn').classList.add('active');
    document.getElementById('section-net').style.display = 'block';
  } else if (tab === 'inspector') {
    document.getElementById('tab-inspector-btn').classList.add('active');
    document.getElementById('section-inspector').style.display = 'block';
    loadDeviceInspectorDetails();
  }
}

// 1-Click Interactive Batch Script Generator
async function downloadCustomScript() {
  const tasks = [];
  if (document.getElementById('task-temp')?.checked) tasks.push('temp');
  if (document.getElementById('task-dns')?.checked) tasks.push('dns');
  if (document.getElementById('task-spooler')?.checked) tasks.push('spooler');
  if (document.getElementById('task-sfc')?.checked) tasks.push('sfc');
  if (document.getElementById('task-power')?.checked) tasks.push('power');

  if (tasks.length === 0) {
    alert('Please select at least one repair/optimization task.');
    return;
  }

  try {
    const res = await fetch(`${API_BASE}/tools/generate-script`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tasks })
    });

    const blob = await res.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'IT_Vault_Custom_Repair.bat';
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.URL.revokeObjectURL(url);
  } catch (err) {
    alert('Failed to generate script.');
  }
}

// Device Inspector Logic
function loadDeviceInspectorDetails() {
  const osEl = document.getElementById('insp-os');
  const browserEl = document.getElementById('insp-browser');
  const screenEl = document.getElementById('insp-screen');
  const coresEl = document.getElementById('insp-cores');
  const ramEl = document.getElementById('insp-ram');

  if (osEl) {
    const ua = navigator.userAgent;
    let os = "Windows PC";
    if (ua.includes("Win")) os = "Windows OS";
    else if (ua.includes("Mac")) os = "macOS";
    else if (ua.includes("Android")) os = "Android Mobile";
    else if (ua.includes("iPhone") || ua.includes("iPad")) os = "iOS Device";
    else if (ua.includes("Linux")) os = "Linux OS";
    osEl.innerText = os;
  }

  if (browserEl) {
    const ua = navigator.userAgent;
    let browser = "Chrome / WebKit";
    if (ua.includes("Firefox")) browser = "Mozilla Firefox";
    else if (ua.includes("Edg")) browser = "Microsoft Edge";
    else if (ua.includes("Chrome")) browser = "Google Chrome";
    else if (ua.includes("Safari")) browser = "Apple Safari";
    browserEl.innerText = browser;
  }

  if (screenEl) {
    screenEl.innerText = `${window.screen.width} x ${window.screen.height} (${window.screen.colorDepth}-bit color)`;
  }

  if (coresEl) {
    coresEl.innerText = `${navigator.hardwareConcurrency || 4} Logical Cores`;
  }

  if (ramEl) {
    ramEl.innerText = navigator.deviceMemory ? `~${navigator.deviceMemory} GB RAM` : '8+ GB RAM (Approx)';
  }
}

function copyPowerShellSpecsCmd() {
  const cmd = `Get-ComputerInfo | Out-File -FilePath "$env:USERPROFILE\\Desktop\\SystemSpecs.txt"`;
  navigator.clipboard.writeText(cmd).then(() => {
    alert('PowerShell Hardware Specs export command copied to clipboard!');
  });
}

async function loadCmdScripts() {
  try {
    const res = await fetch(`${API_BASE}/tools/cmd-scripts`);
    const data = await res.json();
    const listEl = document.getElementById('cmd-scripts-list');

    let html = '';
    (data.scripts || []).forEach((s, idx) => {
      html += `
        <div style="background-color: var(--bg-secondary); border: 1px solid var(--border-color); border-radius: var(--radius); padding: 1.25rem;">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.5rem;">
            <h3 style="font-size: 1.05rem; font-weight: 600;">${escapeHtml(s.title)}</h3>
            <span class="badge badge-info">${escapeHtml(s.type)}</span>
          </div>
          <p style="font-size: 0.88rem; color: var(--text-secondary); margin-bottom: 0.75rem;">${escapeHtml(s.description)}</p>
          <div class="code-box">
            <span>${escapeHtml(s.command)}</span>
            <button class="code-copy-btn" onclick="copyCommand('${escapeJs(s.command)}')"><i class="fa-solid fa-copy"></i> Copy</button>
          </div>
        </div>
      `;
    });
    listEl.innerHTML = html;
  } catch (err) {
    console.error('Error loading CMD scripts:', err);
  }
}

function copyCommand(cmd) {
  navigator.clipboard.writeText(cmd).then(() => {
    alert('Command copied to clipboard!');
  });
}

async function loadNetworkInfo() {
  try {
    const res = await fetch(`${API_BASE}/tools/network-info`);
    const data = await res.json();
    document.getElementById('net-client-ip').innerText = data.client_ip || '127.0.0.1';
    document.getElementById('net-server-host').innerText = data.server_hostname || 'localhost';
  } catch (err) {
    console.error('Error fetching network info:', err);
  }
}

// Interactive Network Testing Functions (Pure Python Socket Probes)
async function runPingTest() {
  const host = document.getElementById('ping-target').value.trim() || '8.8.8.8';
  appendTerminalOutput(`\n[+] Executing Ping test to target '${host}'...`);
  try {
    const res = await fetch(`${API_BASE}/tools/ping`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ host })
    });
    const data = await res.json();
    appendTerminalOutput(data.output || 'No response returned from ping.');
  } catch (err) {
    appendTerminalOutput(`[-] Ping error: ${err.message}`);
  }
}

async function runTracertTest() {
  const host = document.getElementById('tracert-target').value.trim() || '1.1.1.1';
  appendTerminalOutput(`\n[+] Executing Traceroute (tracert) to '${host}' (Max 10 hops)... Please wait...`);
  try {
    const res = await fetch(`${API_BASE}/tools/tracert`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ host })
    });
    const data = await res.json();
    appendTerminalOutput(data.output || 'No response returned from traceroute.');
  } catch (err) {
    appendTerminalOutput(`[-] Traceroute error: ${err.message}`);
  }
}

async function runDnsLookupTest() {
  const host = document.getElementById('dns-target').value.trim() || 'google.com';
  appendTerminalOutput(`\n[+] Executing DNS nslookup for domain '${host}'...`);
  try {
    const res = await fetch(`${API_BASE}/tools/dns-lookup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ host })
    });
    const data = await res.json();
    appendTerminalOutput(data.output || 'No response returned from DNS lookup.');
  } catch (err) {
    appendTerminalOutput(`[-] DNS Lookup error: ${err.message}`);
  }
}

function appendTerminalOutput(text) {
  const term = document.getElementById('net-terminal-output');
  if (!term) return;
  const time = new Date().toLocaleTimeString();
  term.innerText += `\n[${time}] ${text}`;
  term.scrollTop = term.scrollHeight;
}

function clearTerminalOutput() {
  const term = document.getElementById('net-terminal-output');
  if (term) term.innerText = 'Console cleared. Select a test tool above to execute network diagnostics.';
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
