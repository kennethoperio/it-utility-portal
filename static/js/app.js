// Technician Download Portal JavaScript Logic

let currentCategoryId = null;
let currentSearchQuery = "";
let allFiles = [];
let categoriesTreeData = [];
let expandedCategoryIds = new Set();
let inactivityTimer = null;
const INACTIVITY_LIMIT = 5 * 60 * 1000; // 5 minutes

document.addEventListener('DOMContentLoaded', () => {
  initTheme();
  checkAuthStatus();
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
      alert('Session unlocked access expired due to 5 minutes of inactivity.');
      await fetch('/api/auth/logout', { method: 'POST' });
      window.location.reload();
    }, INACTIVITY_LIMIT);
  };

  ['mousemove', 'keydown', 'scroll', 'click', 'touchstart'].forEach(evt => {
    document.addEventListener(evt, resetTimer, { passive: true });
  });

  resetTimer();
}

async function checkAuthStatus() {
  try {
    const res = await fetch('/api/auth/status');
    const data = await res.json();

    if (data.site_title) {
      document.getElementById('site-title-display').innerText = data.site_title;
      document.title = data.site_title;
    }

    if (data.announcement) {
      const banner = document.getElementById('banner-container');
      document.getElementById('announcement-text').innerText = data.announcement;
      banner.style.display = 'flex';
    }

    if (data.is_unlocked) {
      document.getElementById('passcode-modal').classList.remove('active');
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
  const input = document.getElementById('passcode-input').value.trim();
  const errorEl = document.getElementById('passcode-error');

  errorEl.style.display = 'none';

  try {
    const res = await fetch('/api/auth/verify-passcode', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ passcode: input })
    });
    const data = await res.json();

    if (data.success) {
      document.getElementById('passcode-modal').classList.remove('active');
      loadCategories();
      loadFiles();
      loadCmdScripts();
      loadNetworkInfo();
    } else {
      errorEl.innerText = data.message || 'Invalid passcode.';
      errorEl.style.display = 'block';
    }
  } catch (err) {
    errorEl.innerText = 'Network error while verifying passcode.';
    errorEl.style.display = 'block';
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

  // 1. Drivers (Uniform icon for all drivers)
  if (cat.includes('driver') || cat.includes('epson') || cat.includes('hp') || cat.includes('canon') || cat.includes('brother')) {
    return { icon: 'fa-microchip', color: '#38bdf8', bg: 'rgba(56, 189, 248, 0.15)' };
  }

  // 2. Printers / Resetter
  if (cat.includes('printer') || cat.includes('reset')) {
    return { icon: 'fa-print', color: '#22c55e', bg: 'rgba(34, 197, 94, 0.15)' };
  }

  // 3. Recovery Tools
  if (cat.includes('recover') || cat.includes('undelete')) {
    return { icon: 'fa-life-ring', color: '#f59e0b', bg: 'rgba(245, 158, 11, 0.15)' };
  }

  // 4. Windows Repair
  if (cat.includes('repair') || cat.includes('fix') || cat.includes('windows')) {
    return { icon: 'fa-screwdriver-wrench', color: '#6366f1', bg: 'rgba(99, 102, 241, 0.15)' };
  }

  // 5. Activators & License Tools
  if (cat.includes('key') || cat.includes('license') || cat.includes('activat')) {
    return { icon: 'fa-key', color: '#eab308', bg: 'rgba(234, 179, 8, 0.15)' };
  }

  // 6. Network & Connectivity
  if (cat.includes('network') || cat.includes('wifi') || cat.includes('ip')) {
    return { icon: 'fa-network-wired', color: '#06b6d4', bg: 'rgba(6, 182, 212, 0.15)' };
  }

  // 7. Antivirus & Security
  if (cat.includes('anti') || cat.includes('malware') || cat.includes('shield') || cat.includes('secur')) {
    return { icon: 'fa-shield-virus', color: '#ef4444', bg: 'rgba(239, 68, 68, 0.15)' };
  }

  // 8. Hardware Diagnostics
  if (cat.includes('hard') || cat.includes('diag') || cat.includes('cpu') || cat.includes('ram')) {
    return { icon: 'fa-microchip', color: '#14b8a6', bg: 'rgba(20, 184, 166, 0.15)' };
  }

  // 9. Tools & Installers (General)
  if (cat.includes('tool') || cat.includes('install')) {
    return { icon: 'fa-toolbox', color: '#a855f7', bg: 'rgba(168, 85, 247, 0.15)' };
  }

  // Fallback by File Extension / Type
  const ext = fn.split('.').pop().toLowerCase();
  if (['zip', 'rar', '7z', 'tar', 'iso'].includes(ext)) {
    return { icon: 'fa-file-zipper', color: '#ec4899', bg: 'rgba(236, 72, 153, 0.15)' };
  }

  return { icon: 'fa-folder-tree', color: '#38bdf8', bg: 'rgba(56, 189, 248, 0.15)' };
}

async function loadCategories() {
  try {
    const res = await fetch('/api/categories');
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

function toggleCategoryExpand(event, catId) {
  if (event) event.stopPropagation();
  if (expandedCategoryIds.has(catId)) {
    expandedCategoryIds.delete(catId);
  } else {
    expandedCategoryIds.add(catId);
  }
  loadCategories();
}

function selectCategory(catId) {
  currentCategoryId = catId;
  if (catId !== null) {
    expandedCategoryIds.add(catId);
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
          <button class="btn btn-primary" style="flex: 1;" onclick="handleDownloadClick(event, ${f.id})">
            <i class="fa-solid fa-download"></i> Download
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

async function handleDownloadClick(e, fileId) {
  if (e) e.preventDefault();
  
  try {
    const checkRes = await fetch(`/api/files/check-download/${fileId}`);
    const checkData = await checkRes.json();

    if (!checkRes.ok || checkData.allowed === false) {
      const msg = checkData.error || 'Your temporary passcode download limit has been reached.';
      document.getElementById('download-limit-msg').innerText = msg;
      document.getElementById('download-limit-modal').classList.add('active');
      return;
    }

    const downloadUrl = `/api/files/download/${fileId}`;
    const a = document.createElement('a');
    a.href = downloadUrl;
    a.download = '';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);

    setTimeout(() => {
      loadFiles();
    }, 1500);

  } catch (err) {
    console.error('Error triggering download:', err);
    window.location.href = `/api/files/download/${fileId}`;
  }
}

function closeDownloadLimitModal() {
  document.getElementById('download-limit-modal').classList.remove('active');
}

function copyHash(hash) {
  navigator.clipboard.writeText(hash).then(() => {
    alert(`SHA-256 Hash copied to clipboard:\n${hash}`);
  }).catch(() => {
    alert(`SHA-256 Hash: ${hash}`);
  });
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
  document.getElementById('section-cmd').style.display = 'none';
  document.getElementById('section-net').style.display = 'none';

  if (tab === 'files') {
    document.getElementById('tab-files-btn').classList.add('active');
    document.getElementById('section-files').style.display = 'block';
  } else if (tab === 'cmd') {
    document.getElementById('tab-cmd-btn').classList.add('active');
    document.getElementById('section-cmd').style.display = 'block';
  } else if (tab === 'net') {
    document.getElementById('tab-net-btn').classList.add('active');
    document.getElementById('section-net').style.display = 'block';
  }
}

async function loadCmdScripts() {
  try {
    const res = await fetch('/api/tools/cmd-scripts');
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
    const res = await fetch('/api/tools/network-info');
    const data = await res.json();
    document.getElementById('net-client-ip').innerText = data.client_ip || '127.0.0.1';
    document.getElementById('net-server-host').innerText = data.server_hostname || 'localhost';
  } catch (err) {
    console.error('Error fetching network info:', err);
  }
}

// Interactive Network Testing Functions
async function runPingTest() {
  const host = document.getElementById('ping-target').value.trim() || '8.8.8.8';
  appendTerminalOutput(`\n[+] Executing Ping test to target '${host}'...`);
  try {
    const res = await fetch('/api/tools/ping', {
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
    const res = await fetch('/api/tools/tracert', {
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
    const res = await fetch('/api/tools/dns-lookup', {
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
