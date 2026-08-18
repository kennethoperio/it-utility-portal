import os
import sys
import sqlite3
import hashlib
import uuid
import json
import io
import socket
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

# Cloudflare R2 / S3 Storage Credentials from Environment
S3_ENDPOINT = os.environ.get('S3_ENDPOINT')
S3_ACCESS_KEY = os.environ.get('S3_ACCESS_KEY')
S3_SECRET_KEY = os.environ.get('S3_SECRET_KEY')
S3_BUCKET = os.environ.get('S3_BUCKET')

def get_s3_client():
    if S3_ENDPOINT and S3_ACCESS_KEY and S3_SECRET_KEY:
        try:
            import boto3
            return boto3.client(
                's3',
                endpoint_url=S3_ENDPOINT,
                aws_access_key_id=S3_ACCESS_KEY,
                aws_secret_access_key=S3_SECRET_KEY
            )
        except Exception as e:
            print(f"S3 client error: {e}")
    return None

# --- Database Initialization ---
def get_db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn

def init_db():
    conn = get_db()
    cursor = conn.cursor()
    
    # Users table
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT UNIQUE NOT NULL,
            password_hash TEXT NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    ''')
    
    # Settings table
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS settings (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL
        )
    ''')
    
    # Guest passcodes
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
    
    # Categories table (supports parent_id for nesting)
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
    
    # Files table
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
    
    # Audit Logs
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS audit_logs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            action TEXT NOT NULL,
            details TEXT,
            ip_address TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    ''')
    
    # Seed default settings if empty
    cursor.execute('SELECT value FROM settings WHERE key = ?', ('access_passcode',))
    if not cursor.fetchone():
        cursor.execute('INSERT INTO settings (key, value) VALUES (?, ?)', ('access_passcode', 'tech2026'))
        cursor.execute('INSERT INTO settings (key, value) VALUES (?, ?)', ('site_title', 'IT Troubleshooting Utility Hub'))
        cursor.execute('INSERT INTO settings (key, value) VALUES (?, ?)', ('announcement', 'Authorized IT Technicians Portal - Fast 1-Click Utility Downloads'))
        cursor.execute('INSERT INTO settings (key, value) VALUES (?, ?)', ('theme', 'dark'))

    # Seed default admin if empty
    cursor.execute('SELECT id FROM users WHERE username = ?', ('admin',))
    if not cursor.fetchone():
        default_hash = generate_password_hash('admin123')
        cursor.execute('INSERT INTO users (username, password_hash) VALUES (?, ?)', ('admin', default_hash))

    # Seed default categories if empty
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
            
        # Add subcategories under Printers
        cursor.execute("SELECT id FROM categories WHERE name = 'Printers'")
        printers_cat = cursor.fetchone()
        if printers_cat:
            printers_id = printers_cat['id']
            cursor.execute('INSERT INTO categories (name, parent_id, icon, description, display_order) VALUES (?, ?, ?, ?, ?)',
                           ('Resetters', printers_id, 'refresh-cw', 'Printer waste ink resetters & EEPROM clearers', 1))
            cursor.execute('INSERT INTO categories (name, parent_id, icon, description, display_order) VALUES (?, ?, ?, ?, ?)',
                           ('Drivers', printers_id, 'file-text', 'Universal and specific printer drivers & setup packs', 2))

    conn.commit()
    conn.close()

init_db()

# --- Helper Functions ---
def log_audit(action, details=""):
    try:
        ip = request.headers.get('X-Forwarded-For', request.remote_addr)
        conn = get_db()
        conn.execute('INSERT INTO audit_logs (action, details, ip_address) VALUES (?, ?, ?)', (action, details, ip))
        conn.commit()
        conn.close()
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
            return jsonify({'success': False, 'message': 'This temporary passcode has reached its usage limit.'}), 403
        
        # Increment usage count
        conn.execute('UPDATE guest_passcodes SET current_uses = current_uses + 1 WHERE id = ?', (guest['id'],))
        conn.commit()
        conn.close()
        session['is_unlocked'] = True
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
    
    # Build tree
    category_map = {c['id']: {**c, 'children': []} for c in categories}
    tree = []
    
    for c in categories:
        cid = c['id']
        pid = c['parent_id']
        if pid and pid in category_map:
            category_map[pid]['children'].append(category_map[cid])
        else:
            tree.append(category_map[cid])
            
    conn.close()
    return jsonify({'categories': tree, 'flat_list': categories})

@app.route('/api/categories', methods=['POST'])
@admin_required
def create_category():
    data = request.get_json() or {}
    name = (data.get('name') or '').strip()
    parent_id = data.get('parent_id') or None
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
    
    log_audit('CATEGORY_CREATED', f"Created category '{name}' (ID: {cat_id})")
    return jsonify({'success': True, 'id': cat_id, 'message': f"Category '{name}' created."})

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
    
    log_audit('CATEGORY_DELETED', f"Deleted category '{cat['name']}' (ID: {cat_id})")
    return jsonify({'success': True, 'message': f"Category '{cat['name']}' deleted."})

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
        sub_cats = conn.execute('SELECT id FROM categories WHERE parent_id = ?', (cat_id,)).fetchall()
        cat_ids = [int(cat_id)] + [r['id'] for r in sub_cats]
        placeholders = ','.join(['?'] * len(cat_ids))
        conditions.append(f'f.category_id IN ({placeholders})')
        params.extend(cat_ids)
        
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
    unique_key = f"{uuid.uuid4().hex}{ext}"
    filepath = os.path.join(app.config['UPLOAD_FOLDER'], unique_key)

    # Save file locally
    file.save(filepath)
    file_size = os.path.getsize(filepath)
    sha256_hash = compute_sha256(filepath)

    # If Cloudflare R2 / S3 is configured, upload to cloud bucket
    s3_client = get_s3_client()
    if s3_client and S3_BUCKET:
        try:
            s3_client.upload_file(filepath, S3_BUCKET, unique_key)
            print(f"Uploaded {unique_key} to Cloudflare R2 / S3 bucket {S3_BUCKET}")
        except Exception as e:
            print(f"Error uploading to S3/R2: {e}")

    conn = get_db()
    cursor = conn.cursor()
    cursor.execute('''
        INSERT INTO files (original_name, file_key, category_id, file_size, sha256_hash, description, version)
        VALUES (?, ?, ?, ?, ?, ?, ?)
    ''', (original_filename, unique_key, category_id, file_size, sha256_hash, description, version))
    conn.commit()
    file_id = cursor.lastrowid
    conn.close()

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
    file_record = conn.execute('SELECT * FROM files WHERE id = ?', (file_id,)).fetchone()
    
    if not file_record:
        conn.close()
        return jsonify({'error': 'Requested file does not exist.'}), 404

    unique_key = file_record['file_key']
    filepath = os.path.join(app.config['UPLOAD_FOLDER'], unique_key)

    # Check Cloudflare R2 / S3 first if local file missing
    s3_client = get_s3_client()
    if not os.path.exists(filepath) and s3_client and S3_BUCKET:
        try:
            s3_client.download_file(S3_BUCKET, unique_key, filepath)
        except Exception as e:
            print(f"Error downloading from S3/R2: {e}")

    if not os.path.exists(filepath):
        conn.close()
        return jsonify({'error': 'Physical file missing from server storage.'}), 404

    # Increment download counter
    conn.execute('UPDATE files SET download_count = download_count + 1 WHERE id = ?', (file_id,))
    conn.commit()
    conn.close()

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
            
            # Fetch from S3/R2 if missing locally
            s3_client = get_s3_client()
            if not os.path.exists(filepath) and s3_client and S3_BUCKET:
                try:
                    s3_client.download_file(S3_BUCKET, file_key, filepath)
                except Exception as e:
                    print(f"S3 download error for zip: {e}")

            if os.path.exists(filepath):
                # Build category path hierarchy (e.g. Printers/Resetters/file.exe)
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
            s3_client.delete_object(Bucket=S3_BUCKET, Key=unique_key)
        except Exception as e:
            print(f"Error deleting from S3/R2: {e}")

    conn.execute('DELETE FROM files WHERE id = ?', (file_id,))
    conn.commit()
    conn.close()

    log_audit('FILE_DELETED', f"Deleted file '{file_record['original_name']}' (ID: {file_id})")
    return jsonify({'success': True, 'message': f"File '{file_record['original_name']}' deleted."})

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

# --- IT Diagnostics & Command Scripts API ---
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

@app.route('/api/tools/cmd-scripts', methods=['GET'])
@passcode_required
def get_cmd_scripts():
    scripts = [
        {
            'title': 'Windows System File Checker & Repair',
            'type': 'PowerShell / CMD',
            'command': 'sfc /scannow && DISM /Online /Cleanup-Image /RestoreHealth',
            'description': 'Scans and repairs corrupted Windows system files and system image.'
        },
        {
            'title': 'Restart Printer Spooler & Clear Queue',
            'type': 'PowerShell / CMD',
            'command': 'net stop spooler && del /Q /F /S "%systemroot%\\System32\\Spool\\Printers\\*.*" && net start spooler',
            'description': 'Stops printer spooler, deletes stuck print jobs in queue, and restarts service.'
        },
        {
            'title': 'Complete Network Stack & DNS Reset',
            'type': 'PowerShell / CMD',
            'command': 'ipconfig /flushdns && ipconfig /release && ipconfig /renew && netsh winsock reset && netsh int ip reset',
            'description': 'Flushes DNS resolver cache, releases/renews DHCP IP lease, and resets Winsock catalog.'
        },
        {
            'title': 'Windows Activation & License Status Check',
            'type': 'CMD',
            'command': 'slmgr.vbs /dli && slmgr.vbs /xpr',
            'description': 'Displays detailed Windows activation license status and expiration info.'
        },
        {
            'title': 'Export Detailed System Specs to Desktop',
            'type': 'PowerShell',
            'command': 'Get-ComputerInfo | Out-File -FilePath "$env:USERPROFILE\\Desktop\\SystemSpecs.txt"',
            'description': 'Exports full hardware, OS, BIOS, and memory specifications into a text file.'
        }
    ]
    return jsonify({'scripts': scripts})

# --- Admin Settings & Guest Passcode API ---
@app.route('/api/admin/settings', methods=['GET', 'POST'])
@admin_required
def admin_settings():
    if request.method == 'GET':
        conn = get_db()
        logs = conn.execute('SELECT * FROM audit_logs ORDER BY created_at DESC LIMIT 50').fetchall()
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

    log_audit('GUEST_PASSCODE_CREATED', f"Created temporary passcode '{code}' for '{label}'")
    return jsonify({'success': True, 'passcode': code, 'message': f"Created guest passcode {code}"})

@app.route('/api/admin/guest-passcodes/<int:code_id>', methods=['DELETE'])
@admin_required
def delete_guest_passcode(code_id):
    conn = get_db()
    conn.execute('DELETE FROM guest_passcodes WHERE id = ?', (code_id,))
    conn.commit()
    conn.close()
    
    log_audit('GUEST_PASSCODE_DELETED', f"Deleted guest passcode ID: {code_id}")
    return jsonify({'success': True, 'message': 'Guest passcode deleted.'})

if __name__ == '__main__':
    port = int(os.environ.get('PORT', 5000))
    print(f"Starting IT Troubleshooting Utility Portal on http://0.0.0.0:{port}")
    app.run(host='0.0.0.0', port=port)
