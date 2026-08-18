// Technician Download Portal JavaScript Logic

let currentCategoryId = null;
let currentSearchQuery = "";
let allFiles = [];
let inactivityTimer = null;
const INACTIVITY_LIMIT = 5 * 60 * 1000; // 5 minutes

document.addEventListener('DOMContentLoaded', () => {
  checkAuthStatus();
  setupInactivityAutoLogout();
});

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

async function loadCategories() {
  try {
    const res = await fetch('/api/categories');
    const data = await res.json();

    const treeEl = document.getElementById('categories-tree');
    let html = `<li><button class="category-btn ${currentCategoryId === null ? 'active' : ''}" onclick="selectCategory(null)"><i class="fa-solid fa-border-all"></i> All Utilities</button></li>`;

    data.categories.forEach(cat => {
      const isCatActive = currentCategoryId === cat.id;
      const iconClass = cat.icon || 'folder';
      
      html += `<li class="category-item">
        <button class="category-btn ${isCatActive ? 'active' : ''}" onclick="selectCategory(${cat.id})">
          <span><i class="fa-solid fa-${iconClass}"></i> ${escapeHtml(cat.name)}</span>
          <i class="fa-solid fa-chevron-right" style="font-size: 0.75rem; opacity: 0.6;"></i>
        </button>`;

      if (cat.children && cat.children.length > 0) {
        html += `<ul class="subcategory-list">`;
        cat.children.forEach(sub => {
          const isSubActive = currentCategoryId === sub.id;
          html += `<li>
            <button class="subcategory-btn ${isSubActive ? 'active' : ''}" onclick="selectCategory(${sub.id})">
              <i class="fa-solid fa-folder-minus" style="font-size: 0.75rem;"></i> ${escapeHtml(sub.name)}
            </button>
          </li>`;
        });
        html += `</ul>`;
      }
      html += `</li>`;
    });

    treeEl.innerHTML = html;
  } catch (err) {
    console.error('Error loading categories:', err);
  }
}

function selectCategory(catId) {
  currentCategoryId = catId;
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

function renderFiles(files) {
  const gridEl = document.getElementById('files-grid');

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
    gridEl.innerHTML = `<div style="grid-column: 1 / -1; text-align: center; color: var(--text-secondary); padding: 3rem;">
      <i class="fa-solid fa-folder-open fa-3x" style="margin-bottom: 1rem; opacity: 0.5;"></i>
      <h3>No tools found</h3>
      <p style="font-size: 0.9rem; margin-top: 0.5rem;">No files uploaded in this folder yet, or search term returned zero matches.</p>
    </div>`;
    return;
  }

  let html = '';
  filtered.forEach(f => {
    const ext = f.original_name.split('.').pop().toLowerCase();
    let fileIcon = 'fa-file';
    if (['exe', 'msi', 'bat', 'cmd', 'ps1', 'vbs'].includes(ext)) fileIcon = 'fa-gear';
    else if (['zip', 'rar', '7z', 'tar', 'gz', 'iso'].includes(ext)) fileIcon = 'fa-file-zipper';
    else if (['pdf', 'doc', 'txt'].includes(ext)) fileIcon = 'fa-file-lines';

    const sizeMB = (f.file_size / (1024 * 1024)).toFixed(2);

    html += `
      <div class="file-card">
        <div class="file-header">
          <div class="file-icon"><i class="fa-solid ${fileIcon}"></i></div>
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
          <a href="/api/files/download/${f.id}" class="btn btn-primary" style="flex: 1;" onclick="handleDownloadClick(event, ${f.id})">
            <i class="fa-solid fa-download"></i> Download
          </a>
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

function handleDownloadClick(e, fileId) {
  // Allow browser to trigger download link, then check auth status after brief delay to lock UI if limit reached
  setTimeout(() => {
    checkAuthStatus();
  }, 1200);
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

// Dark/Light Theme Toggle
document.getElementById('theme-toggle-btn').addEventListener('click', () => {
  const currentTheme = document.documentElement.getAttribute('data-theme');
  const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', newTheme);
  const icon = document.querySelector('#theme-toggle-btn i');
  if (newTheme === 'light') {
    icon.className = 'fa-solid fa-sun';
  } else {
    icon.className = 'fa-solid fa-moon';
  }
});
