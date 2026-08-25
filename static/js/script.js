// IT Utility Portal - Client Application Logic
const API_BASE = (window.location.pathname.includes('it-utility-portal') || window.location.hostname.includes('github.io')) ? 'static/api' : 'api';

let categoriesList = [];
let allFilesList = [];
let cmdScriptsList = [];
let passcodesList = [];
let starredFileIds = JSON.parse(localStorage.getItem('portal_starred_ids') || '[]');
let fileCommentsMap = JSON.parse(localStorage.getItem('portal_file_comments') || '{}');

let activeMainCategory = 'all';
let activeSubcategory = 'all';
let expandedSidebarMenus = {};

// Default Technician Repair Checklist
const defaultChecklist = [
  { id: 1, text: 'Run SFC /SCANNOW & DISM RestoreHealth to verify OS integrity', done: false },
  { id: 2, text: 'Flush DNS & Reset Winsock stack (ipconfig /flushdns)', done: false },
  { id: 3, text: 'Clean %temp%, Prefetch, and SoftwareDistribution cache', done: false },
  { id: 4, text: 'Scan for malware / adware using AdwCleaner & Malwarebytes', done: false },
  { id: 5, text: 'Update GPU, Network, and Chipset drivers to latest versions', done: false },
  { id: 6, text: 'Verify Power Options set to High Performance / Ultimate Mode', done: false },
  { id: 7, text: 'Check Disk Health SMART status using CrystalDiskInfo', done: false }
];
let currentChecklist = JSON.parse(localStorage.getItem('portal_checklist') || JSON.stringify(defaultChecklist));

document.addEventListener('DOMContentLoaded', () => {
  initTheme();
  initPasscodeCheck();
  initSearchAndFilter();
  renderDiagnostics();
  renderChecklist();

  document.getElementById('passcode-form')?.addEventListener('submit', handlePasscodeSubmit);
});

// --- Theme Toggle ---
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

// --- Client Logout ---
function clientLogout() {
  sessionStorage.removeItem('vault_passcode');
  localStorage.removeItem('vault_passcode');
  document.getElementById('passcode-modal').style.display = 'flex';
  document.getElementById('passcode-status-pill').style.display = 'none';
  showToast('Vault Locked. Logged out successfully.');
}

// --- DIRECT DOWNLOAD ENGINE WITH VIRUS SCAN WARNING BYPASS (CONFIRM=T) ---
function triggerDirectDownload(fileId, fileName) {
  showToast(`🚚 Direct downloading ${fileName}...`);

  // 1. Increment Download Counter
  const fileObj = allFilesList.find(f => (f.file_key || '').includes(fileId) || f.id == fileId);
  if (fileObj) {
    fileObj.download_count = (fileObj.download_count || 0) + 1;
    renderToolsGrid();
  }

  // 2. Direct Bypass Download URL with confirm=t
  const directUrl = `https://drive.usercontent.google.com/download?id=${fileId}&export=download&confirm=t&authuser=0`;

  // Create form to trigger instant download bypass
  const form = document.createElement('form');
  form.action = directUrl;
  form.method = 'GET';
  form.style.display = 'none';

  const inputId = document.createElement('input');
  inputId.name = 'id';
  inputId.value = fileId;
  form.appendChild(inputId);

  const inputExport = document.createElement('input');
  inputExport.name = 'export';
  inputExport.value = 'download';
  form.appendChild(inputExport);

  const inputConfirm = document.createElement('input');
  inputConfirm.name = 'confirm';
  inputConfirm.value = 't';
  form.appendChild(inputConfirm);

  document.body.appendChild(form);
  form.submit();
  setTimeout(() => form.remove(), 1000);
}

// --- Passcode Authorization Logic ---
function initPasscodeCheck() {
  const savedPasscode = sessionStorage.getItem('vault_passcode') || localStorage.getItem('vault_passcode');
  if (savedPasscode) {
    validateAndLoadVault(savedPasscode);
  } else {
    document.getElementById('passcode-modal').style.display = 'flex';
  }
}

async function handlePasscodeSubmit(e) {
  e.preventDefault();
  const inputVal = document.getElementById('passcode-input').value.trim();
  const errorEl = document.getElementById('passcode-error');
  errorEl.style.display = 'none';

  const isValid = await validateAndLoadVault(inputVal);
  if (!isValid) {
    errorEl.innerText = 'Invalid passcode. Please enter tech2026 or a valid guest code.';
    errorEl.style.display = 'block';
  }
}

async function validateAndLoadVault(passcode) {
  const cleanCode = passcode.trim();
  await loadVaultDataStaleWhileRevalidate();

  const isMasterTech = cleanCode.toLowerCase() === 'tech2026';
  const isGuestCode = passcodesList.some(p => p.passcode && p.passcode.trim().toUpperCase() === cleanCode.toUpperCase());
  const isDefaultGuest = cleanCode.toUpperCase() === 'PHCORNER';

  if (isMasterTech || isGuestCode || isDefaultGuest) {
    sessionStorage.setItem('vault_passcode', cleanCode);
    document.getElementById('passcode-modal').style.display = 'none';
    
    const pill = document.getElementById('passcode-status-pill');
    const label = document.getElementById('active-passcode-label');
    if (pill && label) {
      pill.style.display = 'inline-flex';
      label.innerText = isMasterTech ? 'Master Tech' : `Guest (${cleanCode.toUpperCase()})`;
    }
    return true;
  }
  return false;
}

// --- Data Loader ---
async function loadVaultDataStaleWhileRevalidate() {
  try {
    const res = await fetch(`vault_manifest.json?_t=${Date.now()}`);
    if (res.ok) {
      const data = await res.json();
      categoriesList = data.categories || [];
      allFilesList = data.files || [];
      cmdScriptsList = data.cmd_scripts || [];
      passcodesList = data.passcodes || [];
      
      renderLeftSidebar();
      renderToolsGrid();
      renderFavoritesGrid();
      renderCmdScripts();
    }
  } catch (e) {
    console.warn('Manifest load error:', e);
  }
}

// --- Left Navigation Sidebar Explorer (SUPPORTS SUBFOLDERS ON SUBFOLDERS) ---
function renderLeftSidebar() {
  const container = document.getElementById('sidebar-categories-menu');
  if (!container) return;

  const mains = Array.from(new Set(categoriesList.map(c => c.main_category || 'General Utilities')));

  let html = `
    <div class="menu-item ${activeMainCategory === 'all' ? 'active' : ''}" onclick="selectMainCategory('all')">
      <span><i class="fa-solid fa-border-all item-icon"></i> All Vault Tools</span>
      <span class="tag cyan">${allFilesList.length}</span>
    </div>
  `;

  mains.forEach(mainName => {
    const matchingCats = categoriesList.filter(c => (c.main_category || 'General Utilities') === mainName);
    const matchingCatIds = matchingCats.map(c => c.id);
    const totalFilesCount = allFilesList.filter(f => matchingCatIds.includes(f.category_id)).length;

    if (totalFilesCount > 0) {
      const isMainActive = activeMainCategory === mainName;
      const isExpanded = expandedSidebarMenus[mainName] || isMainActive;
      const hasSubfolders = matchingCats.length > 1;

      let icon = 'folder';
      const nl = mainName.toLowerCase();
      if (nl.includes('printer') || nl.includes('driver')) icon = 'print';
      else if (nl.includes('photo') || nl.includes('graphic') || nl.includes('design')) icon = 'palette';
      else if (nl.includes('video')) icon = 'film';
      else if (nl.includes('diagnostic') || nl.includes('hardware')) icon = 'microchip';
      else if (nl.includes('iso') || nl.includes('windows')) icon = 'compact-disc';

      html += `
        <div>
          <div class="menu-item ${isMainActive ? 'active' : ''}" onclick="toggleSidebarMenu('${escapeHtml(mainName)}')">
            <span><i class="fa-solid fa-${icon} item-icon"></i> ${escapeHtml(mainName)}</span>
            <div style="display: flex; align-items: center; gap: 0.35rem;">
              <span class="tag">${totalFilesCount}</span>
              ${hasSubfolders ? `<i class="fa-solid fa-chevron-${isExpanded ? 'down' : 'right'}" style="font-size: 0.75rem;"></i>` : ''}
            </div>
          </div>
      `;

      if (hasSubfolders && isExpanded) {
        html += `<div class="subfolder-list">`;
        matchingCats.forEach(cat => {
          const subCount = allFilesList.filter(f => f.category_id === cat.id).length;
          if (subCount > 0) {
            const isSubActive = activeSubcategory == cat.id;
            html += `
              <div class="subfolder-item ${isSubActive ? 'active' : ''}" onclick="selectSubcategory('${escapeHtml(mainName)}', ${cat.id}, event)">
                <span><i class="fa-solid fa-${cat.icon || 'folder'}" style="margin-right: 0.4rem; font-size: 0.75rem;"></i> ${escapeHtml(cat.subcategory || cat.name)}</span>
                <span>(${subCount})</span>
              </div>
            `;
          }
        });
        html += `</div>`;
      }

      html += `</div>`;
    }
  });

  container.innerHTML = html;
}

function toggleSidebarMenu(mainName) {
  expandedSidebarMenus[mainName] = !expandedSidebarMenus[mainName];
  selectMainCategory(mainName);
}

function selectMainCategory(mainName) {
  activeMainCategory = mainName;
  activeSubcategory = 'all';
  
  const count = getActiveCategoryFilesCount();
  updateCategoryBannerLabel(mainName === 'all' ? 'All Vault Tools' : mainName, count);

  renderLeftSidebar();
  renderToolsGrid();
}

function selectSubcategory(mainName, subId, e) {
  if (e) e.stopPropagation();
  activeMainCategory = mainName;
  activeSubcategory = subId;

  const catObj = categoriesList.find(c => c.id === subId);
  const subName = catObj ? (catObj.subcategory || catObj.name) : 'Subfolder';
  const count = allFilesList.filter(f => f.category_id === subId).length;

  updateCategoryBannerLabel(`${mainName} ➔ ${subName}`, count);

  renderLeftSidebar();
  renderToolsGrid();
}

function updateCategoryBannerLabel(label, count) {
  const lbl = document.getElementById('current-category-label');
  const cnt = document.getElementById('current-category-count');
  if (lbl && cnt) {
    lbl.innerHTML = `<i class="fa-solid fa-layer-group" style="color: var(--primary);"></i> ${escapeHtml(label)}`;
    cnt.innerText = `${count} Tools`;
  }
}

function getActiveCategoryFilesCount() {
  if (activeMainCategory === 'all') return allFilesList.length;
  const matchingCatIds = categoriesList.filter(c => (c.main_category || 'General Utilities') === activeMainCategory).map(c => c.id);
  return allFilesList.filter(f => matchingCatIds.includes(f.category_id)).length;
}

// --- Tab Switching ---
function switchTab(tabId) {
  document.querySelectorAll('.tab-navigation .tab-link').forEach(btn => btn.classList.remove('active'));
  document.querySelectorAll('main section').forEach(sec => sec.style.display = 'none');

  const activeTabBtn = Array.from(document.querySelectorAll('.tab-navigation .tab-link')).find(b => b.getAttribute('onclick')?.includes(tabId));
  if (activeTabBtn) activeTabBtn.classList.add('active');

  const targetSec = document.getElementById(`tab-${tabId}`);
  if (targetSec) targetSec.style.display = 'block';

  if (tabId === 'favorites') renderFavoritesGrid();
}

// --- Tools Grid Rendering ---
function renderToolsGrid() {
  const grid = document.getElementById('tools-grid');
  if (!grid) return;

  const searchQuery = (document.getElementById('main-search-input')?.value || '').toLowerCase().trim();

  let filtered = allFilesList.filter(f => {
    if (activeMainCategory !== 'all') {
      const catObj = categoriesList.find(c => c.id === f.category_id);
      const fileMainCat = catObj ? (catObj.main_category || 'General Utilities') : 'General Utilities';
      if (fileMainCat !== activeMainCategory) return false;
    }

    if (activeSubcategory !== 'all' && f.category_id != activeSubcategory) {
      return false;
    }

    if (searchQuery) {
      const matchName = f.original_name.toLowerCase().includes(searchQuery);
      const matchDesc = (f.description || '').toLowerCase().includes(searchQuery);
      return matchName || matchDesc;
    }

    return true;
  });

  if (filtered.length === 0) {
    grid.innerHTML = `<div class="card-item" style="grid-column: 1/-1; padding: 3rem; text-align: center; color: var(--text-muted);">
      <i class="fa-solid fa-folder-open" style="font-size: 2.5rem; margin-bottom: 1rem; color: var(--text-dim);"></i>
      <p>No software tools found matching your selection.</p>
    </div>`;
    return;
  }

  grid.innerHTML = filtered.map(f => createToolCardHtml(f)).join('');
}

function createToolCardHtml(f) {
  const isStarred = starredFileIds.includes(f.id);
  const formattedSize = formatBytes(f.file_size || 0);

  const gId = (f.file_key || '').replace('gdrive:', '');
  const cat = categoriesList.find(c => c.id === f.category_id);
  const catName = cat ? (cat.subcategory || cat.name) : 'Utility';
  const mainCatName = cat ? (cat.main_category || '').toLowerCase() : '';

  // Custom Vibrant Category Icon
  let customIcon = 'file-zipper';
  let iconColor = 'var(--primary)';
  if (mainCatName.includes('printer') || catName.toLowerCase().includes('epson') || catName.toLowerCase().includes('canon') || catName.toLowerCase().includes('brother')) {
    customIcon = 'print';
    iconColor = '#06b6d4';
  } else if (mainCatName.includes('graphic') || mainCatName.includes('photo') || mainCatName.includes('design')) {
    customIcon = 'palette';
    iconColor = '#a855f7';
  } else if (mainCatName.includes('video')) {
    customIcon = 'film';
    iconColor = '#ec4899';
  } else if (mainCatName.includes('diagnostic') || mainCatName.includes('hardware')) {
    customIcon = 'microchip';
    iconColor = '#10b981';
  } else if (mainCatName.includes('iso') || mainCatName.includes('windows')) {
    customIcon = 'compact-disc';
    iconColor = '#3b82f6';
  } else if (mainCatName.includes('resetter') || mainCatName.includes('activator')) {
    customIcon = 'key';
    iconColor = '#f59e0b';
  }

  const comments = fileCommentsMap[f.id] || [];
  const downloadsCount = f.download_count || 0;

  return `
    <div class="card-item">
      <div>
        <div class="card-head">
          <div class="card-icon" style="color: ${iconColor}; background: rgba(59, 130, 246, 0.1);">
            <i class="fa-solid fa-${customIcon}"></i>
          </div>
          <button class="star-icon ${isStarred ? 'starred' : ''}" onclick="toggleStar(${f.id})" title="Star / Favorite">
            <i class="fa-${isStarred ? 'solid' : 'regular'} fa-star"></i>
          </button>
        </div>

        <div class="card-title">${escapeHtml(f.original_name)}</div>
        <div class="card-desc">${escapeHtml(f.description || 'Google Drive Software Utility')}</div>
      </div>

      <div>
        <div class="card-tags">
          <span class="tag cyan"><i class="fa-solid fa-folder"></i> ${escapeHtml(catName)}</span>
          <span class="tag green"><i class="fa-solid fa-hard-drive"></i> ${formattedSize}</span>
          <span class="tag" title="Total Times Downloaded"><i class="fa-solid fa-download" style="color: var(--primary);"></i> ${downloadsCount} Downloads</span>
          <button onclick="openCommentsModal(${f.id}, '${escapeHtml(f.original_name)}')" class="tag" style="cursor: pointer; background: var(--bg-card-hover);">
            <i class="fa-solid fa-comments" style="color: var(--primary);"></i> 💬 Feedback (${comments.length})
          </button>
        </div>

        <button class="btn-download" onclick="triggerDirectDownload('${gId}', '${escapeHtml(f.original_name)}')">
          <i class="fa-solid fa-download"></i> Direct Download
        </button>
      </div>
    </div>
  `;
}

// --- Comments System ---
function openCommentsModal(fileId, fileName) {
  document.getElementById('comment-file-id').value = fileId;
  document.getElementById('comment-modal-title').innerText = `💬 Feedback: ${fileName}`;
  renderCommentsList(fileId);
  document.getElementById('comments-modal').style.display = 'flex';
}

function closeCommentsModal() {
  document.getElementById('comments-modal').style.display = 'none';
}

function renderCommentsList(fileId) {
  const container = document.getElementById('comments-list');
  if (!container) return;

  const list = fileCommentsMap[fileId] || [];

  if (list.length === 0) {
    container.innerHTML = `<div style="text-align: center; padding: 1.5rem; color: var(--text-muted); font-size: 0.88rem;">No comments yet for this tool. Be the first technician to leave feedback!</div>`;
    return;
  }

  container.innerHTML = list.map(c => `
    <div style="background: var(--bg-card); border: 1px solid var(--border-color); padding: 0.75rem; border-radius: 8px; font-size: 0.85rem;">
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.35rem;">
        <strong style="color: var(--text-main);">${escapeHtml(c.author || 'Technician')}</strong>
        <span class="tag ${c.status === 'solved' ? 'green' : (c.status === 'working' ? 'cyan' : 'rose')}" style="font-size: 0.7rem;">
          ${c.status === 'solved' ? '✅ Solved' : (c.status === 'working' ? '✅ Working 100%' : '⚠️ Issue Reported')}
        </span>
      </div>
      <p style="color: var(--text-muted);">${escapeHtml(c.text)}</p>
      <div style="font-size: 0.72rem; color: var(--text-dim); margin-top: 0.35rem;">${escapeHtml(c.date)}</div>
    </div>
  `).join('');
}

function submitFileComment(e) {
  e.preventDefault();
  const fileId = document.getElementById('comment-file-id').value;
  const author = document.getElementById('comment-author-input').value.trim();
  const text = document.getElementById('comment-text-input').value.trim();
  const status = document.getElementById('comment-status-select').value;

  if (!text || !author) return;

  const newComment = {
    id: Date.now(),
    author,
    text,
    status,
    date: new Date().toLocaleString()
  };

  if (!fileCommentsMap[fileId]) fileCommentsMap[fileId] = [];
  fileCommentsMap[fileId].unshift(newComment);

  localStorage.setItem('portal_file_comments', JSON.stringify(fileCommentsMap));
  document.getElementById('comment-text-input').value = '';

  renderCommentsList(fileId);
  renderToolsGrid();
  showToast('💬 Comment & Feedback posted successfully!');
}

// --- Favorites ---
function toggleStar(fileId) {
  if (starredFileIds.includes(fileId)) {
    starredFileIds = starredFileIds.filter(id => id !== fileId);
    showToast('Removed from Favorites');
  } else {
    starredFileIds.push(fileId);
    showToast('⭐ Pinned to Favorites!');
  }
  localStorage.setItem('portal_starred_ids', JSON.stringify(starredFileIds));
  document.getElementById('fav-count').innerText = starredFileIds.length;
  renderToolsGrid();
  renderFavoritesGrid();
}

function renderFavoritesGrid() {
  const grid = document.getElementById('favorites-grid');
  if (!grid) return;

  document.getElementById('fav-count').innerText = starredFileIds.length;
  const starredFiles = allFilesList.filter(f => starredFileIds.includes(f.id));

  if (starredFiles.length === 0) {
    grid.innerHTML = `<div class="card-item" style="grid-column: 1/-1; padding: 3rem; text-align: center; color: var(--text-muted);">
      <i class="fa-solid fa-star" style="font-size: 2.5rem; margin-bottom: 1rem; color: var(--text-dim);"></i>
      <p>No starred favorites yet. Click the ⭐ star icon on any tool card to pin it here!</p>
    </div>`;
    return;
  }

  grid.innerHTML = starredFiles.map(f => createToolCardHtml(f)).join('');
}

// --- Checklist ---
function renderChecklist() {
  const container = document.getElementById('checklist-container');
  if (!container) return;

  container.innerHTML = currentChecklist.map(item => `
    <label class="card-item" style="padding: 0.9rem 1.1rem; display: flex; gap: 1rem; align-items: center; cursor: pointer; text-decoration: ${item.done ? 'line-through' : 'none'}; opacity: ${item.done ? '0.6' : '1'}; flex-direction: row;">
      <input type="checkbox" ${item.done ? 'checked' : ''} onchange="toggleChecklistItem(${item.id})" style="width: 18px; height: 18px; accent-color: var(--primary);">
      <span style="font-size: 0.95rem; font-weight: 500;">${escapeHtml(item.text)}</span>
    </label>
  `).join('');
}

function toggleChecklistItem(id) {
  const item = currentChecklist.find(i => i.id === id);
  if (item) {
    item.done = !item.done;
    localStorage.setItem('portal_checklist', JSON.stringify(currentChecklist));
    renderChecklist();
  }
}

function resetChecklist() {
  currentChecklist = JSON.parse(JSON.stringify(defaultChecklist));
  localStorage.setItem('portal_checklist', JSON.stringify(currentChecklist));
  renderChecklist();
  showToast('Checklist reset to default steps.');
}

// --- System Diagnostics ---
function renderDiagnostics() {
  const userAgent = navigator.userAgent;
  let os = 'Windows PC';
  if (userAgent.includes('Windows NT 10.0')) os = 'Windows 10 / 11';
  if (userAgent.includes('Mac OS')) os = 'macOS';
  if (userAgent.includes('Linux')) os = 'Linux OS';

  let browser = 'Chrome / Edge';
  if (userAgent.includes('Firefox')) browser = 'Mozilla Firefox';
  if (userAgent.includes('Safari') && !userAgent.includes('Chrome')) browser = 'Apple Safari';

  document.getElementById('diag-os').innerText = os;
  document.getElementById('diag-browser').innerText = browser;
  document.getElementById('diag-screen').innerText = `${window.screen.width} x ${window.screen.height}`;

  const startTime = Date.now();
  fetch(`vault_manifest.json?_t=${startTime}`)
    .then(() => {
      const ping = Date.now() - startTime;
      document.getElementById('diag-ping').innerText = `${ping} ms (Fast CDN)`;
    })
    .catch(() => {
      document.getElementById('diag-ping').innerText = 'Online';
    });
}

// --- CMD Commands ---
function renderCmdScripts() {
  const container = document.getElementById('cmd-scripts-container');
  if (!container) return;

  if (cmdScriptsList.length === 0) {
    cmdScriptsList = [
      { id: 1, title: 'SFC & DISM System Repair', type: 'cmd', command: 'sfc /scannow && DISM /Online /Cleanup-Image /RestoreHealth', description: 'Fixes corrupted Windows system files & component store.' },
      { id: 2, title: 'Network Stack Reset', type: 'cmd', command: 'ipconfig /flushdns && netsh winsock reset && netsh int ip reset', description: 'Flushes DNS resolver cache and resets TCP/IP winsock.' },
      { id: 3, title: 'Activate High Performance Power Plan', type: 'cmd', command: 'powercfg -duplicatescheme e9a42b02-d5df-448d-aa00-03f14749eb61', description: 'Unlocks Windows Ultimate High Performance power scheme.' }
    ];
  }

  container.innerHTML = cmdScriptsList.map(s => `
    <div class="card-item">
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.5rem;">
        <strong style="color: var(--primary); font-size: 1.05rem;"><i class="fa-solid fa-terminal"></i> ${escapeHtml(s.title)}</strong>
        <button class="btn-secondary" onclick="copyCommand('${escapeHtml(s.command)}')" style="font-size: 0.8rem; padding: 0.35rem 0.75rem;"><i class="fa-solid fa-copy"></i> Copy Code</button>
      </div>
      <p style="font-size: 0.85rem; color: var(--text-muted); margin-bottom: 0.75rem;">${escapeHtml(s.description || '')}</p>
      <pre style="background: var(--bg-input); padding: 0.75rem; border-radius: 6px; font-family: monospace; font-size: 0.85rem; color: var(--text-main); overflow-x: auto; border: 1px solid var(--border-color);"><code>${escapeHtml(s.command)}</code></pre>
    </div>
  `).join('');
}

function copyCommand(text) {
  navigator.clipboard.writeText(text);
  showToast('📋 Command copied to clipboard!');
}

// --- Automated Batch Generator ---
function generateBatchScript(e) {
  e.preventDefault();
  const checkboxes = document.querySelectorAll('#batch-form input[name="tasks"]:checked');
  const tasks = Array.from(checkboxes).map(cb => cb.value);

  if (tasks.length === 0) {
    showToast('Please select at least one repair task.');
    return;
  }

  let lines = [
    "@echo off",
    "title IT Utility Vault - Automated Repair Script",
    "color 0A",
    "cls",
    "echo ========================================================",
    "echo   IT UTILITY VAULT AUTOMATED REPAIR SCRIPT",
    "echo ========================================================",
    "echo."
  ];

  if (tasks.includes('sfc')) {
    lines.push("echo [+] Running SFC & DISM System Repair...", "sfc /scannow", "DISM /Online /Cleanup-Image /RestoreHealth", "echo.");
  }
  if (tasks.includes('network')) {
    lines.push("echo [+] Resetting Network Stack & Flushing DNS...", "ipconfig /flushdns", "netsh winsock reset", "echo.");
  }
  if (tasks.includes('temp')) {
    lines.push("echo [+] Cleaning Temp Files...", "del /s /f /q %temp%\\*.* >nul 2>&1", "echo.");
  }

  lines.push("echo [OK] All repair tasks completed successfully!", "pause");

  const blob = new Blob([lines.join("\r\n")], { type: 'application/x-bat' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'IT_Vault_Custom_Repair.bat';
  a.click();
  showToast('⚡ Custom .bat repair script downloaded!');
}

function initSearchAndFilter() {
  document.getElementById('main-search-input')?.addEventListener('input', () => {
    renderToolsGrid();
  });
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

function formatBytes(bytes) {
  if (!bytes || bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

function escapeHtml(str) {
  return (str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
