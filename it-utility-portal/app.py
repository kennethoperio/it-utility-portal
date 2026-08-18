import os
import sys
import sqlite3
import hashlib
import uuid
import json
import io
import socket
import subprocess
import re
import zipfile
from datetime import datetime, timedelta
from functools import wraps

from flask import Flask, request, jsonify, send_file, render_template, session, redirect, url_for, Response
from werkzeug.security import generate_password_hash, check_password_hash
from werkzeug.utils import secure_filename

app = Flask(__name__, static_folder='static', static_url_path='')
app.secret_key = os.environ.get('SECRET_KEY', 'it_vault_super_secret_key_2026')

# Configuration
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
UPLOAD_FOLDER = os.path.join(BASE_DIR, 'uploads')
DB_PATH = os.path.join(BASE_DIR, 'it_vault.db')
MAX_CONTENT_LENGTH = 5 * 1024 * 1024 * 1024  # Support uploads up to 5 GB

app.config['UPLOAD_FOLDER'] = UPLOAD_FOLDER
app.config['MAX_CONTENT_LENGTH'] = MAX_CONTENT_LENGTH

os.makedirs(UPLOAD_FOLDER, exist_ok=True)

# Cloudflare R2 / S3 / Backblaze Storage Credentials from Environment
S3_ENDPOINT = os.environ.get('S3_ENDPOINT')
S3_ACCESS_KEY = os.environ.get('S3_ACCESS_KEY')
S3_SECRET_KEY = os.environ.get('S3_SECRET_KEY')
S3_BUCKET = os.environ.get('S3_BUCKET')

def get_s3_client():
    if S3_ENDPOINT and S3_ACCESS_KEY and S3_SECRET_KEY:
        try:
            import boto3
            from botocore.client import Config

            endpoint = S3_ENDPOINT.strip()
            if not endpoint.startswith('http://') and not endpoint.startswith('https://'):
                endpoint = f"https://{endpoint}"

            region = 'us-west-004'
            clean_host = endpoint.replace('https://', '').replace('http://', '')
            parts = clean_host.split('.')
            if len(parts) >= 2 and parts[0] == 's3':
                region = parts[1]

            return boto3.client(
                's3',
                endpoint_url=endpoint,
                aws_access_key_id=S3_ACCESS_KEY.strip(),
                aws_secret_access_key=S3_SECRET_KEY.strip(),
                region_name=region,
                config=Config(signature_version='s3v4')
            )
        except Exception as e:
            print(f"Backblaze B2 S3 client init error: {e}")
    return None

def download_db_from_s3():
    s3_client = get_s3_client()
    if s3_client and S3_BUCKET:
        try:
            s3_client.download_file(S3_BUCKET.strip(), 'it_vault.db', DB_PATH)
            print("Successfully downloaded latest database from cloud storage!")
        except Exception as e:
            print(f"No existing database found in cloud storage (or initial boot): {e}")

def upload_db_to_s3():
    s3_client = get_s3_client()
    if s3_client and S3_BUCKET and os.path.exists(DB_PATH):
        try:
            try:
                conn = sqlite3.connect(DB_PATH)
                conn.execute("PRAGMA wal_checkpoint(FULL)")
                conn.close()
            except Exception as chk_e:
                print(f"WAL checkpoint note: {chk_e}")

            s3_client.upload_file(DB_PATH, S3_BUCKET.strip(), 'it_vault.db')
            print("SUCCESS: Uploaded updated database to Backblaze B2!")
        except Exception as e:
            print(f"Error syncing DB to S3: {e}")

# Download latest DB on server boot before initializing sqlite
download_db_from_s3()

# --- Database Initialization & Maintenance ---
def get_db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn

def fix_categories_hierarchy():
    try:
        conn = get_db()
        cursor = conn.cursor()
        
        # Ensure Printers category exists
        cursor.execute("SELECT id FROM categories WHERE name = 'Printers'")
        p_row = cursor.fetchone()
        if not p_row:
            cursor.execute("INSERT INTO categories (name, parent_id, icon, description, display_order) VALUES ('Printers', NULL, 'printer', 'Printer drivers and resetters', 2)")
            printers_id = cursor.lastrowid
        else:
            printers_id = p_row['id']

        # Force Resetters and Drivers to have parent_id = Printers ID if unparented
        cursor.execute("UPDATE categories SET parent_id = ? WHERE name IN ('Resetters', 'Drivers') AND (parent_id IS NULL OR parent_id = '')", (printers_id,))
        
        conn.commit()
        conn.close()
    except Exception as e:
        print(f"Error fixing category hierarchy: {e}")

def init_db():
    conn = get_db()
    cursor = conn.cursor()
    
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT UNIQUE NOT NULL,
            password_hash TEXT NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    ''')
    
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS settings (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL
        )
    ''')
    
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS guest_passcodes (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            passcode TEXT UNIQUE NOT NULL,
            label TEXT,
            max_uses INTEGER DEFAULT 0,
            current_uses INTEGER DEFAULT 0,
            expires_at TIMESTAMP,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    ''')
    
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS categories (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            parent_id INTEGER DEFAULT NULL,
            icon TEXT DEFAULT 'folder',
            description TEXT,
            display_order INTEGER DEFAULT 0,
            FOREIGN KEY (parent_id) REFERENCES categories(id) ON DELETE CASCADE
        )
    ''')
    
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS files (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            original_name TEXT NOT NULL,
            file_key TEXT UNIQUE NOT NULL,
            category_id INTEGER NOT NULL,
            file_size INTEGER NOT NULL,
            sha256_hash TEXT NOT NULL,
            description TEXT,
            version TEXT,
            download_count INTEGER DEFAULT 0,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE CASCADE
        )
    ''')
    
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS audit_logs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            action TEXT NOT NULL,
            details TEXT,
            ip_address TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    ''')

    cursor.execute('''
        CREATE TABLE IF NOT EXISTS cmd_scripts (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            title TEXT NOT NULL,
            type TEXT NOT NULL,
            command TEXT NOT NULL,
            description TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    ''')
    
    cursor.execute('SELECT value FROM settings WHERE key = ?', ('access_passcode',))
    if not cursor.fetchone():
        cursor.execute('INSERT INTO settings (key, value) VALUES (?, ?)', ('access_passcode', 'tech2026'))
        cursor.execute('INSERT INTO settings (key, value) VALUES (?, ?)', ('site_title', 'IT Troubleshooting Utility Hub'))
        cursor.execute('INSERT INTO settings (key, value) VALUES (?, ?)', ('announcement', 'Authorized IT Technicians Portal - Fast 1-Click Utility Downloads'))
        cursor.execute('INSERT INTO settings (key, value) VALUES (?, ?)', ('theme', 'dark'))

    cursor.execute('SELECT id FROM users WHERE username = ?', ('admin',))
    if not cursor.fetchone():
        default_hash = generate_password_hash('admin123')
        cursor.execute('INSERT INTO users (username, password_hash) VALUES (?, ?)', ('admin', default_hash))

    cursor.execute('SELECT COUNT(*) as count FROM categories')
    if cursor.fetchone()['count'] == 0:
        categories_data = [
            ('Windows Repair', None, 'wrench', 'System repair tools, SFC, DISM, and Registry scripts', 1),
            ('Printers', None, 'printer', 'Printer management tools, drivers, and spooler resetters', 2),
            ('Activators & License Tools', None, 'key', 'Product keys, activation scripts, and license management', 3),
            ('Network & Connectivity', None, 'wifi', 'IP tools, Wi-Fi analyzers, reset scripts, and ping helpers', 4),
            ('Antivirus & Malware Removal', None, 'shield', 'Virus scanners, removal tools, and security utilities', 5),
            ('Hardware Diagnostics', None, 'cpu', 'RAM, HDD/SSD, CPU test tools, and spec gatherers', 6),
        ]
        for name, pid, icon, desc, order in categories_data:
            cursor.execute('INSERT INTO categories (name, parent_id, icon, description, display_order) VALUES (?, ?, ?, ?, ?)',
                           (name, pid, icon, desc, order))

    cursor.execute('SELECT COUNT(*) as count FROM cmd_scripts')
    if cursor.fetchone()['count'] == 0:
        default_scripts = [
            ('Windows System File Checker & Repair', 'PowerShell / CMD', 'sfc /scannow && DISM /Online /Cleanup-Image /RestoreHealth', 'Scans and repairs corrupted Windows system files and system image.'),
            ('Restart Printer Spooler & Clear Queue', 'PowerShell / CMD', 'net stop spooler && del /Q /F /S "%systemroot%\\System32\\Spool\\Printers\\*.*" && net start spooler', 'Stops printer spooler, deletes stuck print jobs in queue, and restarts service.'),
            ('Complete Network Stack & DNS Reset', 'PowerShell / CMD', 'ipconfig /flushdns && ipconfig /release && ipconfig /renew && netsh winsock reset && netsh int ip reset', 'Flushes DNS resolver cache, releases/renews DHCP IP lease, and resets Winsock catalog.'),
            ('Windows Activation & License Status Check', 'CMD', 'slmgr.vbs /dli && slmgr.vbs /xpr', 'Displays detailed Windows activation license status and expiration info.'),
            ('Export Detailed System Specs to Desktop', 'PowerShell', 'Get-ComputerInfo | Out-File -FilePath "$env:USERPROFILE\\Desktop\\SystemSpecs.txt"', 'Exports full hardware, OS, BIOS, and memory specifications into a text file.')
        ]
        for title, stype, cmd, desc in default_scripts:
            cursor.execute('INSERT INTO cmd_scripts (title, type, command, description) VALUES (?, ?, ?, ?)', (title, stype, cmd, desc))

    conn.commit()
    conn.close()

    fix_categories_hierarchy()

init_db()

# --- Helper Functions ---
def log_audit(action, details=""):
    try:
        ip = request.headers.get('X-Forwarded-For', request.remote_addr)
        conn = get_db()
        conn.execute('INSERT INTO audit_logs (action, details, ip_address) VALUES (?, ?, ?)', (action, details, ip))
        conn.commit()
        conn.close()
        upload_db_to_s3()
    except Exception as e:
        print(f"Audit log error: {e}")

def admin_required(f):
    @wraps(f)
    def decorated_function(*args, **kwargs):
        if not session.get('is_admin'):
            return jsonify({'error': 'Unauthorized. Admin login required.'}), 401
        return f(*args, **kwargs)
    return decorated_function

def passcode_required(f):
    @wraps(f)
    def decorated_function(*args, **kwargs):
        if session.get('is_admin') or session.get('is_unlocked'):
            return f(*args, **kwargs)
        return jsonify({'error': 'Access denied. Valid passcode required.'}), 403
    return decorated_function

def get_setting(key, default=""):
    conn = get_db()
    row = conn.execute('SELECT value FROM settings WHERE key = ?', (key,)).fetchone()
    conn.close()
    return row['value'] if row else default

def set_setting(key, value):
    conn = get_db()
    conn.execute('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)', (key, str(value)))
    conn.commit()
    conn.close()
    upload_db_to_s3()

def compute_sha256(filepath):
    hasher = hashlib.sha256()
    with open(filepath, 'rb') as f:
        while chunk := f.read(65536):
            hasher.update(chunk)
    return hasher.hexdigest()

# --- Static Web Pages ---
@app.route('/')
def index_page():
    return app.send_static_file('index.html')

@app.route('/admin')
def admin_page():
    return app.send_static_file('admin.html')

# --- API Authentication & Passcode Endpoints ---
@app.route('/api/auth/status', methods=['GET'])
def auth_status():
    return jsonify({
        'is_admin': bool(session.get('is_admin')),
        'is_unlocked': bool(session.get('is_unlocked') or session.get('is_admin')),
        'site_title': get_setting('site_title', 'IT Troubleshooting Utility Hub'),
        'announcement': get_setting('announcement', ''),
        'theme': get_setting('theme', 'dark')
    })

@app.route('/api/auth/verify-passcode', methods=['POST'])
def verify_passcode():
    data = request.get_json() or {}
    passcode_input = (data.get('passcode') or '').strip()
    
    if not passcode_input:
        return jsonify({'success': False, 'message': 'Passcode is required.'}), 400

    main_passcode = get_setting('access_passcode', 'tech2026')
    if passcode_input == main_passcode:
        session['is_unlocked'] = True
        session.pop('is_guest', None)
        session.pop('guest_passcode_id', None)
        log_audit('PASSCODE_ACCESS', 'Unlocked via Primary Passcode')
        return jsonify({'success': True, 'message': 'Access granted!'})

    # Check guest passcodes
    conn = get_db()
    now_str = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
    guest = conn.execute('''
        SELECT * FROM guest_passcodes 
        WHERE passcode = ? AND (expires_at IS NULL OR expires_at > ?)
    ''', (passcode_input, now_str)).fetchone()

    if guest:
        if guest['max_uses'] > 0 and guest['current_uses'] >= guest['max_uses']:
            conn.close()
            return jsonify({'success': False, 'message': 'This temporary passcode has reached its download limit.'}), 403
        
        session['is_unlocked'] = True
        session['is_guest'] = True
        session['guest_passcode_id'] = guest['id']
        conn.close()
        log_audit('PASSCODE_ACCESS', f"Unlocked via Guest Passcode '{guest['label']}'")
        return jsonify({'success': True, 'message': 'Access granted via guest passcode!'})

    conn.close()
    log_audit('PASSCODE_FAILED', f"Failed passcode attempt: {passcode_input}")
    return jsonify({'success': False, 'message': 'Invalid passcode.'}), 401

@app.route('/api/auth/admin-login', methods=['POST'])
def admin_login():
    data = request.get_json() or {}
    username = (data.get('username') or '').strip()
    password = (data.get('password') or '').strip()
    
    conn = get_db()
    user = conn.execute('SELECT * FROM users WHERE username = ?', (username,)).fetchone()
    conn.close()

    if user and check_password_hash(user['password_hash'], password):
        session['is_admin'] = True
        session['is_unlocked'] = True
        session['admin_user'] = username
        log_audit('ADMIN_LOGIN', f"User '{username}' logged in successfully.")
        return jsonify({'success': True, 'message': 'Admin login successful.'})

    log_audit('ADMIN_LOGIN_FAILED', f"Failed admin login for '{username}'")
    return jsonify({'success': False, 'message': 'Invalid username or password.'}), 401

@app.route('/api/auth/logout', methods=['POST'])
def logout():
    session.clear()
    return jsonify({'success': True, 'message': 'Logged out.'})

# --- Category Management API ---
@app.route('/api/categories', methods=['GET'])
@passcode_required
def list_categories():
    conn = get_db()
    rows = conn.execute('SELECT * FROM categories ORDER BY display_order ASC, name ASC').fetchall()
    categories = [dict(r) for r in rows]
    conn.close()
    
    # Build hierarchical tree supporting unlimited nested subfolders
    category_map = {}
    for c in categories:
        cid = int(c['id'])
        pid = int(c['parent_id']) if c['parent_id'] is not None and str(c['parent_id']).isdigit() else None
        category_map[cid] = {**c, 'id': cid, 'parent_id': pid, 'children': []}

    tree = []
    for cid, cat in category_map.items():
        pid = cat['parent_id']
        if pid and pid in category_map:
            category_map[pid]['children'].append(cat)
        else:
            tree.append(cat)

    # Build hierarchical ordered flat list (parent followed recursively by all nested children)
    ordered_flat = []
    def traverse(cat_node, depth=0):
        ordered_flat.append({**cat_node, 'depth': depth})
        for child in cat_node.get('children', []):
            traverse(child, depth + 1)

    for root_node in tree:
        traverse(root_node, 0)

    return jsonify({'categories': tree, 'flat_list': ordered_flat})

@app.route('/api/categories', methods=['POST'])
@admin_required
def create_category():
    data = request.get_json() or {}
    name = (data.get('name') or '').strip()
    
    parent_id = data.get('parent_id')
    if parent_id == "" or parent_id is None:
        parent_id = None
    else:
        try:
            parent_id = int(parent_id)
        except (ValueError, TypeError):
            parent_id = None

    icon = data.get('icon', 'folder')
    description = (data.get('description') or '').strip()
    
    if not name:
        return jsonify({'error': 'Category name is required.'}), 400

    conn = get_db()
    cursor = conn.cursor()
    cursor.execute('INSERT INTO categories (name, parent_id, icon, description) VALUES (?, ?, ?, ?)',
                   (name, parent_id, icon, description))
    conn.commit()
    cat_id = cursor.lastrowid
    conn.close()
    upload_db_to_s3()
    
    log_audit('CATEGORY_CREATED', f"Created category '{name}' (ID: {cat_id})")
    return jsonify({'success': True, 'id': cat_id, 'message': f"Folder '{name}' created successfully!"})

@app.route('/api/categories/<int:cat_id>', methods=['PUT'])
@admin_required
def update_category(cat_id):
    data = request.get_json() or {}
    name = (data.get('name') or '').strip()
    parent_id = data.get('parent_id')
    if parent_id == "" or parent_id is None:
        parent_id = None
    else:
        try:
            parent_id = int(parent_id)
        except (ValueError, TypeError):
            parent_id = None

    description = (data.get('description') or '').strip()
    
    if not name:
        return jsonify({'error': 'Category name is required.'}), 400

    conn = get_db()
    conn.execute('UPDATE categories SET name = ?, parent_id = ?, description = ? WHERE id = ?',
                 (name, parent_id, description, cat_id))
    conn.commit()
    conn.close()
    upload_db_to_s3()
    
    log_audit('CATEGORY_UPDATED', f"Updated category '{name}' (ID: {cat_id})")
    return jsonify({'success': True, 'message': f"Folder '{name}' updated."})

@app.route('/api/categories/<int:cat_id>', methods=['DELETE'])
@admin_required
def delete_category(cat_id):
    conn = get_db()
    cat = conn.execute('SELECT name FROM categories WHERE id = ?', (cat_id,)).fetchone()
    if not cat:
        conn.close()
        return jsonify({'error': 'Category not found.'}), 404
        
    conn.execute('DELETE FROM categories WHERE id = ?', (cat_id,))
    conn.commit()
    conn.close()
    upload_db_to_s3()
    
    log_audit('CATEGORY_DELETED', f"Deleted category '{cat['name']}' (ID: {cat_id})")
    return jsonify({'success': True, 'message': f"Folder '{cat['name']}' deleted."})

# --- File Management & Download API ---
@app.route('/api/files', methods=['GET'])
@passcode_required
def list_files():
    cat_id = request.args.get('category_id')
    search = request.args.get('search', '').strip()
    
    conn = get_db()
    query = '''
        SELECT f.*, c.name as category_name, c.parent_id as category_parent_id 
        FROM files f 
        JOIN categories c ON f.category_id = c.id
    '''
    params = []
    conditions = []
    
    if cat_id:
        conditions.append('f.category_id = ?')
        params.append(int(cat_id))
        
    if search:
        conditions.append('(f.original_name LIKE ? OR f.description LIKE ? OR c.name LIKE ?)')
        search_param = f'%{search}%'
        params.extend([search_param, search_param, search_param])
        
    if conditions:
        query += ' WHERE ' + ' AND '.join(conditions)
        
    query += ' ORDER BY f.created_at DESC'
    
    rows = conn.execute(query, params).fetchall()
    files_list = [dict(r) for r in rows]
    conn.close()
    
    return jsonify({'files': files_list})

@app.route('/api/tools/cmd-scripts', methods=['GET'])
@passcode_required
def get_cmd_scripts():
    conn = get_db()
    rows = conn.execute('SELECT * FROM cmd_scripts ORDER BY id ASC').fetchall()
    scripts = [dict(r) for r in rows]
    conn.close()
    return jsonify({'scripts': scripts})

@app.route('/api/admin/cmd-scripts', methods=['POST'])
@admin_required
def create_cmd_script():
    data = request.get_json() or {}
    title = (data.get('title') or '').strip()
    script_type = (data.get('type') or 'PowerShell / CMD').strip()
    command = (data.get('command') or '').strip()
    description = (data.get('description') or '').strip()

    if not title or not command:
        return jsonify({'error': 'Title and Command script string are required.'}), 400

    conn = get_db()
    cursor = conn.cursor()
    cursor.execute('INSERT INTO cmd_scripts (title, type, command, description) VALUES (?, ?, ?, ?)',
                   (title, script_type, command, description))
    conn.commit()
    script_id = cursor.lastrowid
    conn.close()
    upload_db_to_s3()

    log_audit('CMD_SCRIPT_CREATED', f"Created troubleshooting command '{title}' (ID: {script_id})")
    return jsonify({'success': True, 'id': script_id, 'message': f"Command '{title}' created successfully!"})

@app.route('/api/admin/cmd-scripts/<int:script_id>', methods=['PUT'])
@admin_required
def update_cmd_script(script_id):
    data = request.get_json() or {}
    title = (data.get('title') or '').strip()
    script_type = (data.get('type') or 'PowerShell / CMD').strip()
    command = (data.get('command') or '').strip()
    description = (data.get('description') or '').strip()

    if not title or not command:
        return jsonify({'error': 'Title and Command script string are required.'}), 400

    conn = get_db()
    conn.execute('UPDATE cmd_scripts SET title = ?, type = ?, command = ?, description = ? WHERE id = ?',
                 (title, script_type, command, description, script_id))
    conn.commit()
    conn.close()
    upload_db_to_s3()

    log_audit('CMD_SCRIPT_UPDATED', f"Updated command '{title}' (ID: {script_id})")
    return jsonify({'success': True, 'message': f"Command '{title}' updated."})

@app.route('/api/admin/cmd-scripts/<int:script_id>', methods=['DELETE'])
@admin_required
def delete_cmd_script(script_id):
    conn = get_db()
    conn.execute('DELETE FROM cmd_scripts WHERE id = ?', (script_id,))
    conn.commit()
    conn.close()
    upload_db_to_s3()

    log_audit('CMD_SCRIPT_DELETED', f"Deleted command script ID: {script_id}")
    return jsonify({'success': True, 'message': 'Troubleshooting command deleted.'})

# --- Network Diagnostic Tools API (Ping, Tracert, DNS Lookup) ---
@app.route('/api/tools/network-info', methods=['GET'])
@passcode_required
def network_info():
    client_ip = request.headers.get('X-Forwarded-For', request.remote_addr)
    server_hostname = socket.gethostname()
    try:
        server_ip = socket.gethostbyname(server_hostname)
    except Exception:
        server_ip = '127.0.0.1'
        
    return jsonify({
        'client_ip': client_ip,
        'server_hostname': server_hostname,
        'server_ip': server_ip,
        'timestamp': datetime.now().isoformat()
    })

@app.route('/api/tools/ping', methods=['POST'])
@passcode_required
def run_ping():
    data = request.get_json() or {}
    host = (data.get('host') or '8.8.8.8').strip()
    if not re.match(r'^[a-zA-Z0-9.-]+$', host):
        return jsonify({'success': False, 'output': 'Invalid host format. Use IP address (e.g. 8.8.8.8) or domain (e.g. google.com)'}), 400

    count_flag = '-n' if sys.platform == 'win32' else '-c'
    cmd = ['ping', count_flag, '4', host]
    try:
        res = subprocess.run(cmd, capture_output=True, text=True, timeout=12)
        out = res.stdout or res.stderr or "No output returned from ping."
        return jsonify({'success': True, 'output': out})
    except subprocess.TimeoutExpired:
        return jsonify({'success': False, 'output': f"Ping timeout to target host '{host}'."})
    except Exception as e:
        return jsonify({'success': False, 'output': f"Ping error: {str(e)}"})

@app.route('/api/tools/tracert', methods=['POST'])
@passcode_required
def run_tracert():
    data = request.get_json() or {}
    host = (data.get('host') or '8.8.8.8').strip()
    if not re.match(r'^[a-zA-Z0-9.-]+$', host):
        return jsonify({'success': False, 'output': 'Invalid host format. Use IP address or domain.'}), 400

    tracert_bin = 'tracert' if sys.platform == 'win32' else 'traceroute'
    max_hops_flag = '-h' if sys.platform == 'win32' else '-m'
    cmd = [tracert_bin, max_hops_flag, '10', host]
    try:
        res = subprocess.run(cmd, capture_output=True, text=True, timeout=25)
        out = res.stdout or res.stderr or "No output returned from traceroute."
        return jsonify({'success': True, 'output': out})
    except subprocess.TimeoutExpired:
        return jsonify({'success': False, 'output': f"Traceroute timeout to target host '{host}' (Max 10 hops)."})
    except Exception as e:
        return jsonify({'success': False, 'output': f"Traceroute error: {str(e)}"})

@app.route('/api/tools/dns-lookup', methods=['POST'])
@passcode_required
def run_dns_lookup():
    data = request.get_json() or {}
    host = (data.get('host') or 'google.com').strip()
    if not re.match(r'^[a-zA-Z0-9.-]+$', host):
        return jsonify({'success': False, 'output': 'Invalid domain format.'}), 400

    try:
        host_info = socket.gethostbyname_ex(host)
        cname = host_info[0]
        aliases = host_info[1]
        ips = host_info[2]
        
        output_lines = [
            f"Server Domain: {host}",
            f"Canonical Name: {cname}",
            f"Aliases: {', '.join(aliases) if aliases else 'None'}",
            f"Resolved IPv4 Address(es):",
        ]
        for ip in ips:
            output_lines.append(f"  └── {ip}")

        return jsonify({'success': True, 'output': '\n'.join(output_lines)})
    except Exception as e:
        return jsonify({'success': False, 'output': f"DNS Lookup failed for '{host}': {str(e)}"})

# --- Audit Logs Management API ---
@app.route('/api/admin/audit-logs/<int:log_id>', methods=['DELETE'])
@admin_required
def delete_audit_log(log_id):
    conn = get_db()
    conn.execute('DELETE FROM audit_logs WHERE id = ?', (log_id,))
    conn.commit()
    conn.close()
    upload_db_to_s3()
    return jsonify({'success': True, 'message': f'Audit log #{log_id} deleted.'})

@app.route('/api/admin/audit-logs', methods=['DELETE'])
@admin_required
def clear_all_audit_logs():
    conn = get_db()
    conn.execute('DELETE FROM audit_logs')
    conn.commit()
    conn.close()
    upload_db_to_s3()
    log_audit('AUDIT_LOGS_CLEARED', 'Admin cleared all activity audit logs')
    return jsonify({'success': True, 'message': 'All audit logs cleared successfully.'})

# --- Force Sync & Repair Database Endpoint ---
@app.route('/api/admin/force-sync-db', methods=['POST'])
@admin_required
def force_sync_database():
    try:
        upload_db_to_s3()
        return jsonify({'success': True, 'message': 'Database WAL checkpointed and synced to Backblaze B2!'})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500

# --- Backblaze B2 Diagnostic Test Endpoint ---
@app.route('/api/admin/test-s3', methods=['GET'])
@admin_required
def test_s3_connection():
    s3_client = get_s3_client()
    if not s3_client:
        return jsonify({
            'success': False,
            'message': 'Failed to initialize boto3 S3 client. Check S3_ENDPOINT, S3_ACCESS_KEY, S3_SECRET_KEY.',
            'config': {
                'S3_ENDPOINT': S3_ENDPOINT,
                'S3_ACCESS_KEY': S3_ACCESS_KEY[:6] + '***' if S3_ACCESS_KEY else None,
                'S3_BUCKET': S3_BUCKET
            }
        }), 500

    try:
        bucket = (S3_BUCKET or '').strip()
        res = s3_client.list_objects_v2(Bucket=bucket)
        objs = [o['Key'] for o in res.get('Contents', [])]
        
        return jsonify({
            'success': True,
            'message': f"Successfully connected to Backblaze B2 bucket '{bucket}'!",
            'bucket_objects_count': len(objs),
            'bucket_files': objs[:10]
        })
    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e),
            'message': f"Error connecting to Backblaze B2: {str(e)}"
        }), 500

@app.route('/api/files/upload', methods=['POST'])
@admin_required
def upload_file():
    if 'file' not in request.files:
        return jsonify({'error': 'No file stream provided in request.'}), 400
        
    file = request.files['file']
    category_id = request.form.get('category_id')
    description = request.form.get('description', '').strip()
    version = request.form.get('version', '1.0').strip()
    
    if not file or not file.filename:
        return jsonify({'error': 'Selected file has no filename.'}), 400
        
    if not category_id:
        return jsonify({'error': 'Category selection is required.'}), 400

    original_filename = secure_filename(file.filename) or file.filename
    ext = os.path.splitext(original_filename)[1]
    unique_key = f"{uuid.uuid4().hex}_{original_filename}"
    filepath = os.path.join(app.config['UPLOAD_FOLDER'], unique_key)

    # Save file locally
    file.save(filepath)
    file_size = os.path.getsize(filepath)
    sha256_hash = compute_sha256(filepath)

    # Upload to Cloudflare R2 / S3 / Backblaze B2 bucket
    s3_client = get_s3_client()
    if s3_client and S3_BUCKET:
        try:
            bucket_name = S3_BUCKET.strip()
            s3_client.upload_file(filepath, bucket_name, unique_key)
            print(f"SUCCESS: Uploaded {unique_key} to Backblaze B2 bucket '{bucket_name}'")
        except Exception as e:
            print(f"ERROR uploading to Backblaze B2: {e}")
            log_audit('S3_UPLOAD_ERROR', f"Failed uploading {original_filename} to B2: {str(e)}")

    conn = get_db()
    cursor = conn.cursor()
    cursor.execute('''
        INSERT INTO files (original_name, file_key, category_id, file_size, sha256_hash, description, version)
        VALUES (?, ?, ?, ?, ?, ?, ?)
    ''', (original_filename, unique_key, category_id, file_size, sha256_hash, description, version))
    conn.commit()
    file_id = cursor.lastrowid
    conn.close()
    upload_db_to_s3()

    log_audit('FILE_UPLOADED', f"Uploaded file '{original_filename}' ({file_size} bytes, ID: {file_id})")
    return jsonify({
        'success': True,
        'message': f"File '{original_filename}' uploaded successfully!",
        'file': {
            'id': file_id,
            'original_name': original_filename,
            'file_size': file_size,
            'sha256_hash': sha256_hash
        }
    })

@app.route('/api/files/download/<int:file_id>', methods=['GET'])
@passcode_required
def download_file(file_id):
    conn = get_db()
    
    # Enforce Guest Passcode Download Limits Strictly
    if session.get('is_guest') and session.get('guest_passcode_id'):
        g_id = session.get('guest_passcode_id')
        g_row = conn.execute('SELECT * FROM guest_passcodes WHERE id = ?', (g_id,)).fetchone()
        
        if not g_row:
            session.clear()
            conn.close()
            return jsonify({'error': 'Guest passcode invalid or expired.'}), 403
            
        if g_row['max_uses'] > 0 and g_row['current_uses'] >= g_row['max_uses']:
            session['is_unlocked'] = False
            session.pop('guest_passcode_id', None)
            session.pop('is_guest', None)
            conn.close()
            return jsonify({'error': 'Your temporary passcode download limit has been reached.'}), 403
            
        # Increment download count for guest passcode
        new_uses = g_row['current_uses'] + 1
        conn.execute('UPDATE guest_passcodes SET current_uses = ? WHERE id = ?', (new_uses, g_id))
        conn.commit()

        # If limit reached with this download, lock session immediately for future downloads
        if g_row['max_uses'] > 0 and new_uses >= g_row['max_uses']:
            session['is_unlocked'] = False
            session.pop('guest_passcode_id', None)
            session.pop('is_guest', None)

    file_record = conn.execute('SELECT * FROM files WHERE id = ?', (file_id,)).fetchone()
    
    if not file_record:
        conn.close()
        return jsonify({'error': 'Requested file does not exist.'}), 404

    unique_key = file_record['file_key']
    filepath = os.path.join(app.config['UPLOAD_FOLDER'], unique_key)

    # Check Cloudflare R2 / S3 / Backblaze first if local file missing
    s3_client = get_s3_client()
    if not os.path.exists(filepath) and s3_client and S3_BUCKET:
        try:
            s3_client.download_file(S3_BUCKET.strip(), unique_key, filepath)
        except Exception as e:
            print(f"Error downloading from S3/R2/B2: {e}")

    if not os.path.exists(filepath):
        conn.close()
        return jsonify({'error': 'Physical file missing from server storage.'}), 404

    # Increment download counter
    conn.execute('UPDATE files SET download_count = download_count + 1 WHERE id = ?', (file_id,))
    conn.commit()
    conn.close()
    upload_db_to_s3()

    log_audit('FILE_DOWNLOADED', f"Downloaded '{file_record['original_name']}' (ID: {file_id})")
    
    return send_file(
        filepath,
        as_attachment=True,
        download_name=file_record['original_name']
    )

@app.route('/api/admin/download-all-zip', methods=['GET'])
@admin_required
def download_all_zip():
    conn = get_db()
    files = conn.execute('''
        SELECT f.*, c.name as category_name, c.parent_id 
        FROM files f 
        JOIN categories c ON f.category_id = c.id
    ''').fetchall()
    
    if not files:
        conn.close()
        return jsonify({'error': 'No files uploaded to download.'}), 404
        
    categories = {c['id']: dict(c) for c in conn.execute('SELECT * FROM categories').fetchall()}
    conn.close()

    memory_file = io.BytesIO()
    with zipfile.ZipFile(memory_file, 'w', zipfile.ZIP_DEFLATED) as zf:
        for f in files:
            file_key = f['file_key']
            filepath = os.path.join(app.config['UPLOAD_FOLDER'], file_key)
            
            # Fetch from S3/R2/B2 if missing locally
            s3_client = get_s3_client()
            if not os.path.exists(filepath) and s3_client and S3_BUCKET:
                try:
                    s3_client.download_file(S3_BUCKET.strip(), file_key, filepath)
                except Exception as e:
                    print(f"S3 download error for zip: {e}")

            if os.path.exists(filepath):
                cat_id = f['category_id']
                path_parts = []
                curr = categories.get(cat_id)
                while curr:
                    path_parts.insert(0, curr['name'])
                    curr = categories.get(curr['parent_id']) if curr.get('parent_id') else None
                
                folder_path = "/".join(path_parts) if path_parts else "General"
                zip_path = f"{folder_path}/{f['original_name']}"
                zf.write(filepath, arcname=zip_path)

    memory_file.seek(0)
    filename = f"IT_Utility_Vault_All_Tools_{datetime.now().strftime('%Y%m%d')}.zip"
    
    log_audit('DOWNLOAD_ALL_ZIP', 'Admin downloaded full tool vault ZIP archive')
    return send_file(
        memory_file,
        mimetype='application/zip',
        as_attachment=True,
        download_name=filename
    )

@app.route('/api/files/<int:file_id>', methods=['DELETE'])
@admin_required
def delete_file(file_id):
    conn = get_db()
    file_record = conn.execute('SELECT * FROM files WHERE id = ?', (file_id,)).fetchone()
    
    if not file_record:
        conn.close()
        return jsonify({'error': 'File not found.'}), 404

    unique_key = file_record['file_key']
    filepath = os.path.join(app.config['UPLOAD_FOLDER'], unique_key)
    
    if os.path.exists(filepath):
        try:
            os.remove(filepath)
        except Exception as e:
            print(f"Error removing local file: {e}")

    s3_client = get_s3_client()
    if s3_client and S3_BUCKET:
        try:
            bucket_name = S3_BUCKET.strip()
            try:
                versions = s3_client.list_object_versions(Bucket=bucket_name, Prefix=unique_key)
                for ver in versions.get('Versions', []):
                    s3_client.delete_object(Bucket=bucket_name, Key=unique_key, VersionId=ver['VersionId'])
                for dm in versions.get('DeleteMarkers', []):
                    s3_client.delete_object(Bucket=bucket_name, Key=unique_key, VersionId=dm['VersionId'])
            except Exception as ve:
                print(f"B2 version cleanup note: {ve}")

            s3_client.delete_object(Bucket=bucket_name, Key=unique_key)
        except Exception as e:
            print(f"Error deleting from S3/R2/B2: {e}")

    conn.execute('DELETE FROM files WHERE id = ?', (file_id,))
    conn.commit()
    conn.close()
    upload_db_to_s3()

    log_audit('FILE_DELETED', f"Deleted file '{file_record['original_name']}' (ID: {file_id})")
    return jsonify({'success': True, 'message': f"File '{file_record['original_name']}' deleted permanently."})

# --- QR Code & Shareable Utilities ---
@app.route('/api/files/qrcode/<int:file_id>', methods=['GET'])
@passcode_required
def get_file_qrcode(file_id):
    conn = get_db()
    file_record = conn.execute('SELECT * FROM files WHERE id = ?', (file_id,)).fetchone()
    conn.close()
    
    if not file_record:
        return jsonify({'error': 'File not found.'}), 404

    download_url = request.host_url.rstrip('/') + f"/api/files/download/{file_id}"
    
    try:
        import qrcode
        qr = qrcode.QRCode(version=1, box_size=8, border=2)
        qr.add_data(download_url)
        qr.make(fit=True)
        img = qr.make_image(fill_color="black", back_color="white")
        
        img_io = io.BytesIO()
        img.save(img_io, 'PNG')
        img_io.seek(0)
        return send_file(img_io, mimetype='image/png')
    except Exception as e:
        return jsonify({'error': f"QR Code generation error: {str(e)}", 'url': download_url}), 500

# --- Admin Settings & Guest Passcode API ---
@app.route('/api/admin/settings', methods=['GET', 'POST'])
@admin_required
def admin_settings():
    if request.method == 'GET':
        conn = get_db()
        logs = conn.execute('SELECT * FROM audit_logs ORDER BY created_at DESC LIMIT 500').fetchall()
        guest_codes = conn.execute('SELECT * FROM guest_passcodes ORDER BY created_at DESC').fetchall()
        
        # Stats summary
        file_stats = conn.execute('''
            SELECT COUNT(*) as total_files, COALESCE(SUM(file_size), 0) as total_bytes, COALESCE(SUM(download_count), 0) as total_downloads
            FROM files
        ''').fetchone()
        
        conn.close()
        return jsonify({
            'site_title': get_setting('site_title', 'IT Troubleshooting Utility Hub'),
            'announcement': get_setting('announcement', ''),
            'access_passcode': get_setting('access_passcode', 'tech2026'),
            'theme': get_setting('theme', 'dark'),
            'stats': dict(file_stats),
            'audit_logs': [dict(l) for l in logs],
            'guest_passcodes': [dict(g) for g in guest_codes]
        })
        
    data = request.get_json() or {}
    if 'site_title' in data: set_setting('site_title', data['site_title'].strip())
    if 'announcement' in data: set_setting('announcement', data['announcement'].strip())
    if 'theme' in data: set_setting('theme', data['theme'])
    if 'access_passcode' in data and data['access_passcode'].strip():
        set_setting('access_passcode', data['access_passcode'].strip())
        
    if 'new_admin_password' in data and data['new_admin_password'].strip():
        new_hash = generate_password_hash(data['new_admin_password'].strip())
        conn = get_db()
        conn.execute('UPDATE users SET password_hash = ? WHERE username = ?', (new_hash, session.get('admin_user', 'admin')))
        conn.commit()
        conn.close()

    log_audit('SETTINGS_UPDATED', 'Admin updated portal configuration settings')
    return jsonify({'success': True, 'message': 'Settings updated successfully.'})

@app.route('/api/admin/guest-passcodes', methods=['POST'])
@admin_required
def create_guest_passcode():
    data = request.get_json() or {}
    label = (data.get('label') or 'Guest Technician').strip()
    max_uses = int(data.get('max_uses', 0))
    days_valid = int(data.get('days_valid', 7))
    
    code = f"TECH-{uuid.uuid4().hex[:6].upper()}"
    expires_at = (datetime.now() + timedelta(days=days_valid)).strftime('%Y-%m-%d %H:%M:%S') if days_valid > 0 else None
    
    conn = get_db()
    conn.execute('''
        INSERT INTO guest_passcodes (passcode, label, max_uses, expires_at)
        VALUES (?, ?, ?, ?)
    ''', (code, label, max_uses, expires_at))
    conn.commit()
    conn.close()
    upload_db_to_s3()

    log_audit('GUEST_PASSCODE_CREATED', f"Created temporary passcode '{code}' for '{label}'")
    return jsonify({'success': True, 'passcode': code, 'message': f"Created guest passcode {code}"})

@app.route('/api/admin/guest-passcodes/<int:code_id>', methods=['DELETE'])
@admin_required
def delete_guest_passcode(code_id):
    conn = get_db()
    conn.execute('DELETE FROM guest_passcodes WHERE id = ?', (code_id,))
    conn.commit()
    conn.close()
    upload_db_to_s3()
    
    log_audit('GUEST_PASSCODE_DELETED', f"Deleted guest passcode ID: {code_id}")
    return jsonify({'success': True, 'message': 'Guest passcode deleted.'})

if __name__ == '__main__':
    port = int(os.environ.get('PORT', 5000))
    print(f"Starting IT Troubleshooting Utility Portal on http://0.0.0.0:{port}")
    app.run(host='0.0.0.0', port=port)
