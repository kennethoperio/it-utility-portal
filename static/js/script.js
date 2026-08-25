// IT Utility Portal - Friendly Client Application Logic
const API_BASE = (window.location.pathname.includes('it-utility-portal') || window.location.hostname.includes('github.io')) ? 'static/api' : 'api';

let categoriesList = [];
let allFilesList = [];
let cmdScriptsList = [];
let passcodesList = [];
let starredFileIds = JSON.parse(localStorage.getItem('portal_starred_ids') || '[]');
let activeCategoryFilter = 'all';

// Default Technician Onsite Repair Checklist
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
  initPasscodeCheck();
  initSearchAndFilter();
  renderDiagnostics();
  renderChecklist();

  document.getElementById('passcode-form')?.addEventListener('submit', handlePasscodeSubmit);
});

// --- Direct Download Without Opening New Tab ---
function triggerDirectDownload(fileId, fileName) {
  showToast(`🚚 Starting direct download: ${fileName}...`);
  
  let iframe = document.getElementById('hidden-download-frame');
  if (!iframe) {
    iframe = document.createElement('iframe');
    iframe.id = 'hidden-download-frame';
    iframe.style.display = 'none';
    document.body.appendChild(iframe);
  }

  // Primary direct download URL from Google Drive
  const directUrl = `https://drive.usercontent.google.com/download?id=${fileId}&export=download&confirm=t`;
  iframe.src = directUrl;

  // Backup fallback after 3 seconds if needed
  setTimeout(() => {
    if (!iframe.src || iframe.src === 'about:blank') {
      const fallbackUrl = `https://drive.google.com/uc?export=download&id=${fileId}&confirm=t`;
      iframe.src = fallbackUrl;
    }
  }, 3000);
}

// --- Passcode Authorization Logic ---
function initPasscodeCheck() {
  const savedPasscode = sessionStorage.getItem('vault_passcode') || localStorage.getItem('vault_passcode');
  if (savedPasscode) {
    validateAndLoadVault(savedPasscode);
  } else {
    document.getElementById('passcode-modal').style.display = 'block';
  }
}

async function handlePasscodeSubmit(e) {
  e.preventDefault();
  const inputVal = document.getElementById('passcode-input').value.trim();
  const errorEl = document.getElementById('passcode-error');
  errorEl.style.display = 'none';

  const isValid = await validateAndLoadVault(inputVal);
  if (!isValid) {
    errorEl.innerText = 'Invalid passcode. Please enter tech2026 or a valid guest passcode.';
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
      
      renderCategoryPills();
      renderToolsGrid();
      renderFavoritesGrid();
      renderCmdScripts();
    }
  } catch (e) {
    console.warn('Manifest load error:', e);
  }
}

// --- Tab Switching ---
function switchTab(tabId) {
  document.querySelectorAll('.tab-navigation .tab-link').forEach(btn => btn.classList.remove('active'));
  document.querySelectorAll('main > section').forEach(sec => sec.style.display = 'none');

  const activeTabBtn = Array.from(document.querySelectorAll('.tab-navigation .tab-link')).find(b => b.getAttribute('onclick')?.includes(tabId));
  if (activeTabBtn) activeTabBtn.classList.add('active');

  const targetSec = document.getElementById(`tab-${tabId}`);
  if (targetSec) targetSec.style.display = 'block';

  if (tabId === 'favorites') renderFavoritesGrid();
}

// --- Category Pills Bar ---
function renderCategoryPills() {
  const container = document.getElementById('category-pills');
  if (!container) return;

  let html = `<button class="cat-pill ${activeCategoryFilter === 'all' ? 'active' : ''}" onclick="filterCategory('all')"><i class="fa-solid fa-layer-group"></i> All Tools (${allFilesList.length})</button>`;
  
  categoriesList.forEach(cat => {
    const count = allFilesList.filter(f => f.category_id === cat.id).length;
    if (count > 0) {
      const isActive = activeCategoryFilter == cat.id;
      html += `<button class="cat-pill ${isActive ? 'active' : ''}" onclick="filterCategory(${cat.id})"><i class="fa-solid fa-${cat.icon || 'folder'}"></i> ${cat.name} (${count})</button>`;
    }
  });

  container.innerHTML = html;
}

function filterCategory(catId) {
  activeCategoryFilter = catId;
  renderCategoryPills();
  renderToolsGrid();
}

// --- Tools Grid Rendering ---
function renderToolsGrid() {
  const grid = document.getElementById('tools-grid');
  if (!grid) return;

  const searchQuery = (document.getElementById('main-search-input')?.value || '').toLowerCase().trim();

  let filtered = allFilesList.filter(f => {
    if (activeCategoryFilter !== 'all' && f.category_id != activeCategoryFilter) return false;
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
      <p>No tools found matching your filter criteria.</p>
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
  const catName = cat ? cat.name : 'Utility';

  return `
    <div class="card-item">
      <div>
        <div class="card-head">
          <div class="card-icon">
            <i class="fa-solid fa-file-zipper"></i>
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
        </div>

        <button class="btn-download" onclick="triggerDirectDownload('${gId}', '${escapeHtml(f.original_name)}')">
          <i class="fa-solid fa-download"></i> Direct Download
        </button>
      </div>
    </div>
  `;
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

// --- Onsite Repair Checklist ---
function renderChecklist() {
  const container = document.getElementById('checklist-container');
  if (!container) return;

  container.innerHTML = currentChecklist.map(item => `
    <label class="card-item" style="padding: 0.9rem 1.1rem; display: flex; gap: 1rem; align-items: center; cursor: pointer; text-decoration: ${item.done ? 'line-through' : 'none'}; opacity: ${item.done ? '0.6' : '1'}; flex-direction: row;">
      <input type="checkbox" ${item.done ? 'checked' : ''} onchange="toggleChecklistItem(${item.id})" style="width: 18px; height: 18px; accent-color: var(--primary-accent);">
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

// --- CMD Commands Library ---
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
        <strong style="color: var(--cyan-accent); font-size: 1.05rem;"><i class="fa-solid fa-terminal"></i> ${escapeHtml(s.title)}</strong>
        <button class="tab-link" onclick="copyCommand('${escapeHtml(s.command)}')" style="font-size: 0.8rem; padding: 0.35rem 0.75rem;"><i class="fa-solid fa-copy"></i> Copy Code</button>
      </div>
      <p style="font-size: 0.85rem; color: var(--text-muted); margin-bottom: 0.75rem;">${escapeHtml(s.description || '')}</p>
      <pre style="background: #0d1117; padding: 0.75rem; border-radius: 6px; font-family: monospace; font-size: 0.85rem; color: #a7f3d0; overflow-x: auto; border: 1px solid var(--border-color);"><code>${escapeHtml(s.command)}</code></pre>
    </div>
  `).join('');
}

function copyCommand(text) {
  navigator.clipboard.writeText(text);
  showToast('📋 Command copied to clipboard!');
}

// --- Automated Batch Script Generator ---
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
  t.innerHTML = `<i class="fa-solid fa-circle-check" style="color: var(--cyan-accent);"></i> <span>${escapeHtml(msg)}</span>`;
  container.appendChild(t);
  setTimeout(() => t.remove(), 3500);
}

function formatBytes(bytes) {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

function escapeHtml(str) {
  return (str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
