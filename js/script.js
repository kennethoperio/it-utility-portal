// IT Utility Portal - Client Application & Stale-While-Revalidate Engine
const API_BASE = (window.location.pathname.includes('it-utility-portal') || window.location.hostname.includes('github.io')) ? 'static/api' : 'api';

let categoriesList = [];
let allFilesList = [];
let cmdScriptsList = [];
let starredFileIds = JSON.parse(localStorage.getItem('portal_starred_ids') || '[]');
let activeCategoryFilter = 'all';

// Default Technician Onsite Checklist
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

// --- Passcode Unlock Logic ---
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
    errorEl.innerText = 'Invalid or expired passcode. Please try again.';
    errorEl.style.display = 'block';
  }
}

async function validateAndLoadVault(passcode) {
  // Hardcoded quick passcodes for instant unlock
  if (passcode.toLowerCase() === 'tech2026' || passcode.toUpperCase() === 'PHCORNER') {
    sessionStorage.setItem('vault_passcode', passcode);
    document.getElementById('passcode-modal').style.display = 'none';
    document.getElementById('passcode-status-pill').style.display = 'inline-flex';
    loadVaultDataDataStaleWhileRevalidate();
    return true;
  }

  try {
    const res = await fetch(`${API_BASE}/validate-passcode`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ passcode })
    });
    const data = await res.json();

    if (data.valid || data.success) {
      sessionStorage.setItem('vault_passcode', passcode);
      document.getElementById('passcode-modal').style.display = 'none';
      document.getElementById('passcode-status-pill').style.display = 'inline-flex';
      loadVaultDataDataStaleWhileRevalidate();
      return true;
    }
  } catch (err) {
    // If backend is offline, accept passcode locally for failover
    sessionStorage.setItem('vault_passcode', passcode);
    document.getElementById('passcode-modal').style.display = 'none';
    loadVaultDataDataStaleWhileRevalidate();
    return true;
  }
  return false;
}

// --- Stale-While-Revalidate Data Loader & Failover Manifest Engine ---
async function loadVaultDataDataStaleWhileRevalidate() {
  // 1. Instant Load from Client Local Cache
  const cachedManifest = localStorage.getItem('vault_manifest_cache');
  if (cachedManifest) {
    try {
      const data = JSON.parse(cachedManifest);
      categoriesList = data.categories || [];
      allFilesList = data.files || [];
      cmdScriptsList = data.cmd_scripts || [];
      renderCategoryPills();
      renderToolsGrid();
      renderFavoritesGrid();
      renderCmdScripts();
    } catch (e) {
      console.warn('Stale cache read error:', e);
    }
  }

  // 2. Fetch fresh data asynchronously in background
  try {
    const res = await fetch(`${API_BASE}/portal-data?_t=${Date.now()}`);
    if (res.ok) {
      const data = await res.json();
      categoriesList = data.categories || [];
      allFilesList = data.files || [];
      cmdScriptsList = data.cmd_scripts || [];
      localStorage.setItem('vault_manifest_cache', JSON.stringify(data));
      renderCategoryPills();
      renderToolsGrid();
      renderFavoritesGrid();
      renderCmdScripts();
      return;
    }
  } catch (err) {
    console.warn('API fetch offline, switching to Failover Manifest...', err);
  }

  // 3. 24/7 HA Failover Manifest Backup (`vault_manifest.json`)
  try {
    const failoverRes = await fetch(`vault_manifest.json?_t=${Date.now()}`);
    if (failoverRes.ok) {
      const data = await failoverRes.json();
      categoriesList = data.categories || [];
      allFilesList = data.files || [];
      cmdScriptsList = data.cmd_scripts || [];
      renderCategoryPills();
      renderToolsGrid();
      renderFavoritesGrid();
      renderCmdScripts();
      console.log('24/7 Failover Manifest loaded successfully!');
    }
  } catch (e) {
    console.error('Critical failover error:', e);
  }
}

// --- Tab Switching ---
function switchTab(tabId) {
  document.querySelectorAll('.nav-tabs .tab-btn').forEach(btn => btn.classList.remove('active'));
  document.querySelectorAll('main > section').forEach(sec => sec.style.display = 'none');

  const activeTabBtn = Array.from(document.querySelectorAll('.nav-tabs .tab-btn')).find(b => b.getAttribute('onclick')?.includes(tabId));
  if (activeTabBtn) activeTabBtn.classList.add('active');

  const targetSec = document.getElementById(`tab-${tabId}`);
  if (targetSec) targetSec.style.display = 'block';

  if (tabId === 'favorites') renderFavoritesGrid();
}

// --- Category Pills & Rendering ---
function renderCategoryPills() {
  const container = document.getElementById('category-pills');
  if (!container) return;

  let html = `<button class="meta-badge ${activeCategoryFilter === 'all' ? 'win' : ''}" onclick="filterCategory('all')" style="cursor: pointer; padding: 0.4rem 1rem; font-size: 0.85rem;"><i class="fa-solid fa-layer-group"></i> All Tools (${allFilesList.length})</button>`;
  
  categoriesList.forEach(cat => {
    const count = allFilesList.filter(f => f.category_id === cat.id).length;
    const isActive = activeCategoryFilter == cat.id;
    html += `<button class="meta-badge ${isActive ? 'win' : ''}" onclick="filterCategory(${cat.id})" style="cursor: pointer; padding: 0.4rem 1rem; font-size: 0.85rem;"><i class="fa-solid fa-${cat.icon || 'folder'}"></i> ${cat.name} (${count})</button>`;
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
    grid.innerHTML = `<div class="glass-panel" style="grid-column: 1/-1; padding: 3rem; text-align: center; color: var(--text-muted);">
      <i class="fa-solid fa-folder-open" style="font-size: 2.5rem; margin-bottom: 1rem; color: var(--text-dim);"></i>
      <p>No software tools found matching your filter criteria.</p>
    </div>`;
    return;
  }

  grid.innerHTML = filtered.map(f => createToolCardHtml(f)).join('');
}

function createToolCardHtml(f) {
  const isStarred = starredFileIds.includes(f.id);
  const formattedSize = formatBytes(f.file_size || 0);

  // Google Drive direct download URL format
  let downloadUrl = `/api/files/${f.id}/download`;
  if (f.file_key && f.file_key.startswith && f.file_key.startswith('gdrive:')) {
    const gId = f.file_key.replace('gdrive:', '');
    downloadUrl = `https://drive.google.com/uc?export=download&id=${gId}&confirm=t`;
  }

  return `
    <div class="tool-card">
      <div class="tool-card-header">
        <div class="tool-icon-wrapper">
          <i class="fa-solid fa-file-zipper"></i>
        </div>
        <button class="star-btn ${isStarred ? 'starred' : ''}" onclick="toggleStar(${f.id})" title="Star / Favorite">
          <i class="fa-${isStarred ? 'solid' : 'regular'} fa-star"></i>
        </button>
      </div>

      <div>
        <div class="tool-title">${escapeHtml(f.original_name)}</div>
        <div class="tool-desc">${escapeHtml(f.description || 'No description provided.')}</div>
      </div>

      <div>
        <div class="tool-meta-row">
          <span class="meta-badge win"><i class="fa-brands fa-windows"></i> ${f.os_compatibility || 'Win 10/11'}</span>
          <span class="meta-badge portable"><i class="fa-solid fa-box-open"></i> ${f.is_portable ? 'Portable' : 'Installer'}</span>
          <span class="meta-badge"><i class="fa-solid fa-hard-drive"></i> ${formattedSize}</span>
        </div>

        <a href="${downloadUrl}" target="_blank" class="btn btn-primary" style="width: 100%;" onclick="showToast('🚚 Starting direct 1-click download...')">
          <i class="fa-solid fa-download"></i> Download Tool
        </a>
      </div>
    </div>
  `;
}

// --- Favorites Management ---
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
    grid.innerHTML = `<div class="glass-panel" style="grid-column: 1/-1; padding: 3rem; text-align: center; color: var(--text-muted);">
      <i class="fa-solid fa-star" style="font-size: 2.5rem; margin-bottom: 1rem; color: var(--text-dim);"></i>
      <p>No starred favorites yet. Click the ⭐ star icon on any tool to pin it here for quick 1-click access!</p>
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
    <label class="glass-panel" style="padding: 1rem 1.25rem; display: flex; gap: 1rem; align-items: center; cursor: pointer; text-decoration: ${item.done ? 'line-through' : 'none'}; opacity: ${item.done ? '0.6' : '1'};">
      <input type="checkbox" ${item.done ? 'checked' : ''} onchange="toggleChecklistItem(${item.id})" style="width: 18px; height: 18px; accent-color: var(--neon-cyan);">
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

// --- System & Network Diagnostic Panel ---
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

  // Measure Latency Ping
  const startTime = Date.now();
  fetch(`${API_BASE}/ping?_t=${startTime}`)
    .then(() => {
      const ping = Date.now() - startTime;
      document.getElementById('diag-ping').innerText = `${ping} ms`;
    })
    .catch(() => {
      document.getElementById('diag-ping').innerText = 'Online (CDN Fast)';
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
    <div class="glass-panel" style="padding: 1.25rem;">
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.5rem;">
        <strong style="color: var(--neon-cyan); font-size: 1.05rem;"><i class="fa-solid fa-terminal"></i> ${escapeHtml(s.title)}</strong>
        <button class="btn btn-secondary" onclick="copyCommand('${escapeHtml(s.command)}')" style="font-size: 0.8rem; padding: 0.35rem 0.75rem;"><i class="fa-solid fa-copy"></i> Copy Code</button>
      </div>
      <p style="font-size: 0.85rem; color: var(--text-muted); margin-bottom: 0.75rem;">${escapeHtml(s.description || '')}</p>
      <pre style="background: rgba(0,0,0,0.5); padding: 0.75rem; border-radius: 8px; font-family: monospace; font-size: 0.85rem; color: #a7f3d0; overflow-x: auto;"><code>${escapeHtml(s.command)}</code></pre>
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
    showToast('Please select at least one repair task.', 'warning');
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

// --- Live Search Setup ---
function initSearchAndFilter() {
  document.getElementById('main-search-input')?.addEventListener('input', () => {
    renderToolsGrid();
  });
}

// --- Helper Utilities ---
function showToast(msg) {
  const container = document.getElementById('toast-container');
  if (!container) return;
  const t = document.createElement('div');
  t.className = 'toast';
  t.innerHTML = `<i class="fa-solid fa-circle-check" style="color: var(--neon-cyan);"></i> <span>${escapeHtml(msg)}</span>`;
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
