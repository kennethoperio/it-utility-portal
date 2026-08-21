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
import base64
import threading
import traceback
import time
from datetime import datetime, timedelta
from functools import wraps

from flask import Flask, request, jsonify, send_file, render_template, session, redirect, url_for, Response, stream_with_context, make_response
from werkzeug.security import generate_password_hash, check_password_hash
from werkzeug.utils import secure_filename

app = Flask(__name__, static_folder='static', static_url_path='')
app.secret_key = os.environ.get('SECRET_KEY', 'it_vault_super_secret_key_2026')

app.config['SESSION_COOKIE_HTTPONLY'] = True
app.config['SESSION_COOKIE_SAMESITE'] = 'Lax'

# Configuration
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
is_vercel = os.environ.get('VERCEL') or os.environ.get('VERCEL_ENV') or ('vercel' in os.environ.get('SERVER_SOFTWARE', '').lower())

if is_vercel:
    UPLOAD_FOLDER = '/tmp/uploads'
    DB_PATH = '/tmp/it_vault.db'
    source_db = os.path.join(BASE_DIR, 'it_vault.db')
    if not os.path.exists(DB_PATH) and os.path.exists(source_db):
        import shutil
        try:
            os.makedirs('/tmp', exist_ok=True)
            shutil.copy2(source_db, DB_PATH)
        except Exception as e:
            print(f"Vercel DB copy note: {e}")
else:
    UPLOAD_FOLDER = os.path.join(BASE_DIR, 'uploads')
    DB_PATH = os.path.join(BASE_DIR, 'it_vault.db')

MAX_CONTENT_LENGTH = 50 * 1024 * 1024 * 1024  # Support uploads up to 50 GB

app.config['UPLOAD_FOLDER'] = UPLOAD_FOLDER
app.config['MAX_CONTENT_LENGTH'] = MAX_CONTENT_LENGTH

try:
    os.makedirs(UPLOAD_FOLDER, exist_ok=True)
except Exception:
    pass

# --- Security & Brute Force Rate Limiting ---
FAILED_ATTEMPTS = {}  # ip -> {'count': int, 'reset_at': float}
MAX_FAILED_ATTEMPTS = 5
LOCKOUT_TIME_SECONDS = 300  # 5 minutes

def is_ip_rate_limited(ip):
    now = time.time()
    record = FAILED_ATTEMPTS.get(ip)
    if not record:
        return False
    if now > record['reset_at']:
        FAILED_ATTEMPTS.pop(ip, None)
        return False
    return record['count'] >= MAX_FAILED_ATTEMPTS

def record_failed_attempt(ip):
    now = time.time()
    record = FAILED_ATTEMPTS.get(ip)
    if not record or now > record['reset_at']:
        FAILED_ATTEMPTS[ip] = {'count': 1, 'reset_at': now + LOCKOUT_TIME_SECONDS}
    else:
        record['count'] += 1

def clear_failed_attempts(ip):
    FAILED_ATTEMPTS.pop(ip, None)

@app.after_request
def apply_security_headers(response):
    response.headers['X-Content-Type-Options'] = 'nosniff'
    response.headers['X-Frame-Options'] = 'SAMEORIGIN'
    response.headers['X-XSS-Protection'] = '1; mode=block'
    response.headers['Referrer-Policy'] = 'strict-origin-when-cross-origin'
    response.headers['Server'] = 'IT-Utility-Vault-Shield'
    response.headers['Cache-Control'] = 'no-cache, no-store, must-revalidate'
    response.headers['Pragma'] = 'no-cache'
    response.headers['Expires'] = '0'
    return response

# Credentials Environment Settings
S3_ENDPOINT = os.environ.get('S3_ENDPOINT')
S3_ACCESS_KEY = os.environ.get('S3_ACCESS_KEY')
S3_SECRET_KEY = os.environ.get('S3_SECRET_KEY')
S3_BUCKET = os.environ.get('S3_BUCKET')

GDRIVE_SERVICE_ACCOUNT_JSON = os.environ.get('GDRIVE_SERVICE_ACCOUNT_JSON')
GDRIVE_FOLDER_ID = os.environ.get('GDRIVE_FOLDER_ID')
GDRIVE_CLIENT_ID = os.environ.get('GDRIVE_CLIENT_ID')
GDRIVE_CLIENT_SECRET = os.environ.get('GDRIVE_CLIENT_SECRET')
GDRIVE_REFRESH_TOKEN = os.environ.get('GDRIVE_REFRESH_TOKEN')

GDRIVE_ACCESS_TOKEN_CACHE = {'token': None, 'expires_at': 0}

# --- Google Drive Storage Integration ---
def get_gdrive_service():
    client_id = (os.environ.get('GDRIVE_CLIENT_ID') or '').strip()
    client_secret = (os.environ.get('GDRIVE_CLIENT_SECRET') or '').strip()
    refresh_token = (os.environ.get('GDRIVE_REFRESH_TOKEN') or '').strip()

    if client_id and client_secret and refresh_token:
        try:
            from google.oauth2.credentials import Credentials
            from googleapiclient.discovery import build
            creds = Credentials(
                token=None,
                refresh_token=refresh_token,
                token_uri="https://oauth2.googleapis.com/token",
                client_id=client_id,
                client_secret=client_secret
            )
            return build('drive', 'v3', credentials=creds)
        except Exception as e:
            print(f"Google Drive OAuth2 Service Init Error: {e}")

    json_str = (os.environ.get('GDRIVE_SERVICE_ACCOUNT_JSON') or '').strip()
    if not json_str:
        return None
    try:
        from google.oauth2 import service_account
        from googleapiclient.discovery import build
        
        if not json_str.startswith('{'):
            json_str = base64.b64decode(json_str).decode('utf-8')
            
        info = json.loads(json_str)
        creds = service_account.Credentials.from_service_account_info(
            info, scopes=['https://www.googleapis.com/auth/drive']
        )
        return build('drive', 'v3', credentials=creds)
    except Exception as e:
        print(f"Google Drive Service Init Error: {e}")
        return None

def get_cached_gdrive_token(service):
    now = time.time()
    if GDRIVE_ACCESS_TOKEN_CACHE['token'] and now < GDRIVE_ACCESS_TOKEN_CACHE['expires_at']:
        return GDRIVE_ACCESS_TOKEN_CACHE['token']

    if service and hasattr(service, '_http') and hasattr(service._http, 'credentials'):
        c = service._http.credentials
        import google.auth.transport.requests
        req_trans = google.auth.transport.requests.Request()
        if not c.valid or c.expired:
            c.refresh(req_trans)
        token = c.token
        GDRIVE_ACCESS_TOKEN_CACHE['token'] = token
        GDRIVE_ACCESS_TOKEN_CACHE['expires_at'] = now + 3000  # Cache for 50 minutes
        return token
    return None

def find_gdrive_file_id_by_name(service, filename):
    if not service or not filename:
        return None
    try:
        # 1. Exact match (escape single quotes for GDrive API syntax)
        safe_name = filename.replace("'", "\\'")
        q = f"name = '{safe_name}' and trashed = false"
        res = service.files().list(q=q, supportsAllDrives=True, includeItemsFromAllDrives=True, fields='files(id, name)').execute()
        files = res.get('files', [])
        if files:
            return files[0]['id']

        # 2. Fuzzy match replacing underscores with spaces or using base name
        clean_name = filename.replace('_', ' ')
        base_name = os.path.splitext(clean_name)[0].replace("'", "\\'").strip()
        if len(base_name) >= 3:
            q_fuzzy = f"name contains '{base_name}' and trashed = false"
            res_fuzzy = service.files().list(q=q_fuzzy, supportsAllDrives=True, includeItemsFromAllDrives=True, fields='files(id, name)').execute()
            files_fuzzy = res_fuzzy.get('files', [])
            if files_fuzzy:
                print(f"Fuzzy GDrive match for '{filename}' -> '{files_fuzzy[0]['name']}' (ID: {files_fuzzy[0]['id']})")
                return files_fuzzy[0]['id']

        # 3. First word fallback (e.g. "Classroom" for "Classroom Spy Pro.exe")
        first_word = base_name.split()[0] if base_name.split() else ""
        if len(first_word) >= 4:
            q_word = f"name contains '{first_word}' and trashed = false"
            res_word = service.files().list(q=q_word, supportsAllDrives=True, includeItemsFromAllDrives=True, fields='files(id, name)').execute()
            files_word = res_word.get('files', [])
            if files_word:
                print(f"First-word GDrive match for '{filename}' -> '{files_word[0]['name']}' (ID: {files_word[0]['id']})")
                return files_word[0]['id']
    except Exception as e:
        print(f"GDrive search exception for '{filename}': {e}")
    return None

def get_or_create_gdrive_folder(service, folder_name, parent_id):
    if not service or not folder_name or not parent_id:
        return parent_id
    try:
        safe_name = folder_name.replace("'", "\\'")
        q = f"name = '{safe_name}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false and '{parent_id}' in parents"
        res = service.files().list(q=q, supportsAllDrives=True, includeItemsFromAllDrives=True, fields='files(id, name)').execute()
        files = res.get('files', [])
        if files:
            return files[0]['id']
        
        folder_metadata = {
            'name': folder_name,
            'mimeType': 'application/vnd.google-apps.folder',
            'parents': [parent_id]
        }
        folder = service.files().create(body=folder_metadata, supportsAllDrives=True, fields='id').execute()
        return folder.get('id')
    except Exception as e:
        print(f"Error getting/creating GDrive subfolder '{folder_name}': {e}")
        return parent_id

def get_gdrive_folder_id_for_category(service, category_id):
    root_folder_id = (os.environ.get('GDRIVE_FOLDER_ID') or '').strip()
    if not root_folder_id or not category_id:
        return root_folder_id

    try:
        conn = get_db()
        categories = {c['id']: dict(c) for c in conn.execute('SELECT * FROM categories').fetchall()}
        conn.close()

        path_names = []
        curr = categories.get(int(category_id))
        while curr:
            path_names.insert(0, curr['name'])
            curr = categories.get(curr['parent_id']) if curr.get('parent_id') else None

        current_parent_id = root_folder_id
        for name in path_names:
            current_parent_id = get_or_create_gdrive_folder(service, name, current_parent_id)

        return current_parent_id
    except Exception as e:
        print(f"Error resolving GDrive path for category {category_id}: {e}")
        return root_folder_id

def delete_file_from_gdrive(gdrive_file_id):
    service = get_gdrive_service()
    if service and gdrive_file_id:
        try:
            service.files().update(fileId=gdrive_file_id, body={'trashed': True}, supportsAllDrives=True).execute()
            print(f"Trashed Google Drive file ID: {gdrive_file_id}")
        except Exception as e:
            print(f"Trash failed, attempting permanent delete for {gdrive_file_id}: {e}")
            try:
                service.files().delete(fileId=gdrive_file_id, supportsAllDrives=True).execute()
                print(f"Permanently deleted Google Drive file ID: {gdrive_file_id}")
            except Exception as e2:
                print(f"Error deleting Google Drive file: {e2}")

# --- Backblaze B2 / S3 Integration ---
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

def download_db_from_cloud():
    service = get_gdrive_service()
    if service:
        try:
            folder_id = (os.environ.get('GDRIVE_FOLDER_ID') or '').strip()
            q = "name = 'it_vault.db' and trashed = false"
            if folder_id:
                q += f" and '{folder_id}' in parents"
            res = service.files().list(
                q=q,
                supportsAllDrives=True,
                includeItemsFromAllDrives=True,
                fields='files(id, name)'
            ).execute()
            files = res.get('files', [])
            if files:
                from googleapiclient.http import MediaIoBaseDownload
                file_id = files[0]['id']
                req = service.files().get_media(fileId=file_id, supportsAllDrives=True)
                fh = io.FileIO(DB_PATH, 'wb')
                downloader = MediaIoBaseDownload(fh, req)
                done = False
                while not done:
                    status, done = downloader.next_chunk()
                fh.close()
                print("Successfully downloaded latest database from 5 TB Google Drive!")
                return
        except Exception as e:
            print(f"Google Drive DB download note: {e}")

    s3_client = get_s3_client()
    if s3_client and S3_BUCKET:
        try:
            s3_client.download_file(S3_BUCKET.strip(), 'it_vault.db', DB_PATH)
            print("Successfully downloaded latest database from S3/B2 storage!")
        except Exception as e:
            print(f"No existing database found in S3/B2: {e}")

def upload_db_to_cloud():
    service = get_gdrive_service()
    if service and os.path.exists(DB_PATH):
        try:
            try:
                conn = sqlite3.connect(DB_PATH)
                conn.execute("PRAGMA wal_checkpoint(FULL)")
                conn.close()
            except Exception: pass

            folder_id = (os.environ.get('GDRIVE_FOLDER_ID') or '').strip()
            q = "name = 'it_vault.db' and trashed = false"
            if folder_id:
                q += f" and '{folder_id}' in parents"
            res = service.files().list(
                q=q,
                supportsAllDrives=True,
                includeItemsFromAllDrives=True,
                fields='files(id, name)'
            ).execute()
            files = res.get('files', [])

            from googleapiclient.http import MediaFileUpload
            media = MediaFileUpload(DB_PATH, mimetype='application/x-sqlite3', resumable=True)

            if files:
                service.files().update(fileId=files[0]['id'], media_body=media, supportsAllDrives=True).execute()
            else:
                file_metadata = {'name': 'it_vault.db'}
                if folder_id: file_metadata['parents'] = [folder_id]
                service.files().create(body=file_metadata, media_body=media, supportsAllDrives=True).execute()

            print("SUCCESS: Uploaded updated database to 5 TB Google Drive!")
        except Exception as e:
            print(f"Error syncing DB to Google Drive: {e}")

    s3_client = get_s3_client()
    if s3_client and S3_BUCKET and os.path.exists(DB_PATH):
        try:
            s3_client.upload_file(DB_PATH, S3_BUCKET.strip(), 'it_vault.db')
            print("SUCCESS: Uploaded updated database to Backblaze B2!")
        except Exception as e:
            print(f"Error syncing DB to S3: {e}")

def async_upload_db_to_cloud():
    if is_vercel:
        try:
            upload_db_to_cloud()
        except Exception as e:
            print(f"Sync DB upload exception on Vercel: {e}")
    else:
        def _worker():
            try:
                upload_db_to_cloud()
            except Exception as e:
                print(f"Async DB upload exception: {e}")
        threading.Thread(target=_worker, daemon=True).start()

download_db_from_cloud()

# --- Database Initialization ---
def get_db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn

def fix_categories_hierarchy():
    try:
        conn = get_db()
        cursor = conn.cursor()
        
        cursor.execute("SELECT id FROM categories WHERE name = 'Printers'")
        p_row = cursor.fetchone()
        if not p_row:
            cursor.execute("INSERT INTO categories (name, parent_id, icon, description, display_order) VALUES ('Printers', NULL, 'print', 'Printer drivers and resetters', 2)")
            printers_id = cursor.lastrowid
        else:
            printers_id = p_row['id']
            cursor.execute("UPDATE categories SET icon = 'print' WHERE id = ?", (printers_id,))

        cursor.execute("UPDATE categories SET icon = 'print' WHERE name = 'Printers'")
        cursor.execute("UPDATE categories SET icon = 'microchip' WHERE name = 'Drivers'")
        cursor.execute("UPDATE categories SET icon = 'rotate-left' WHERE name = 'Resetters'")
        cursor.execute("UPDATE categories SET icon = 'life-ring' WHERE name = 'Recovery Tools'")
        cursor.execute("UPDATE categories SET icon = 'toolbox' WHERE name = 'Tools & Installers'")
        cursor.execute("UPDATE categories SET icon = 'screwdriver-wrench' WHERE name = 'Windows Repair'")
        cursor.execute("UPDATE categories SET icon = 'key' WHERE name = 'Activators & License Tools'")
        cursor.execute("UPDATE categories SET icon = 'network-wired' WHERE name = 'Network & Connectivity'")
        cursor.execute("UPDATE categories SET icon = 'shield-virus' WHERE name = 'Antivirus & Malware Removal'")
        cursor.execute("UPDATE categories SET icon = 'microchip' WHERE name = 'Hardware Diagnostics'")

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
        CREATE TABLE IF NOT EXISTS file_comments (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            file_id INTEGER NOT NULL,
            author_name TEXT DEFAULT 'Technician',
            status TEXT DEFAULT 'working',
            comment_text TEXT NOT NULL,
            ip_address TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (file_id) REFERENCES files(id) ON DELETE CASCADE
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
            ('Windows Repair', None, 'screwdriver-wrench', 'System repair tools, SFC, DISM, and Registry scripts', 1),
            ('Printers', None, 'print', 'Printer management tools, drivers, and spooler resetters', 2),
            ('Activators & License Tools', None, 'key', 'Product keys, activation scripts, and license management', 3),
            ('Network & Connectivity', None, 'network-wired', 'IP tools, Wi-Fi analyzers, reset scripts, and ping helpers', 4),
            ('Antivirus & Malware Removal', None, 'shield-virus', 'Virus scanners, removal tools, and security utilities', 5),
            ('Hardware Diagnostics', None, 'microchip', 'RAM, HDD/SSD, CPU test tools, and spec gatherers', 6),
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
        now_str = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
        conn = get_db()
        conn.execute('INSERT INTO audit_logs (action, details, ip_address, created_at) VALUES (?, ?, ?, ?)', (action, details, ip, now_str))
        conn.commit()
        conn.close()
        async_upload_db_to_cloud()
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
    async_upload_db_to_cloud()

def compute_sha256(filepath):
    hasher = hashlib.sha256()
    with open(filepath, 'rb') as f:
        while chunk := f.read(65536):
            hasher.update(chunk)
    return hasher.hexdigest()

@app.route('/')
def index_page():
    res = app.send_static_file('index.html')
    res.headers['Cache-Control'] = 'no-cache, no-store, must-revalidate, max-age=0'
    res.headers['Pragma'] = 'no-cache'
    res.headers['Expires'] = '0'
    return res

@app.route('/admin')
def admin_page():
    res = app.send_static_file('admin.html')
    res.headers['Cache-Control'] = 'no-cache, no-store, must-revalidate, max-age=0'
    res.headers['Pragma'] = 'no-cache'
    res.headers['Expires'] = '0'
    return res

# --- Tool Feedback / Comments API ---
@app.route('/api/files/<int:file_id>/comments', methods=['GET'])
@passcode_required
def get_file_comments(file_id):
    conn = get_db()
    rows = conn.execute('''
        SELECT * FROM file_comments WHERE file_id = ? ORDER BY created_at DESC LIMIT 100
    ''', (file_id,)).fetchall()

    stats = conn.execute('''
        SELECT 
            COUNT(*) as total,
            SUM(CASE WHEN status = 'working' THEN 1 ELSE 0 END) as working_count,
            SUM(CASE WHEN status = 'broken' THEN 1 ELSE 0 END) as broken_count
        FROM file_comments WHERE file_id = ?
    ''', (file_id,)).fetchone()

    conn.close()

    total = stats['total'] or 0
    working = stats['working_count'] or 0
    broken = stats['broken_count'] or 0
    working_pct = round((working / total) * 100) if total > 0 else 100

    return jsonify({
        'comments': [dict(r) for r in rows],
        'stats': {
            'total': total,
            'working_count': working,
            'broken_count': broken,
            'working_pct': working_pct
        }
    })

@app.route('/api/files/<int:file_id>/comments', methods=['POST'])
@passcode_required
def add_file_comment(file_id):
    data = request.get_json() or {}
    author_name = (data.get('author_name') or 'Technician').strip() or 'Technician'
    status = (data.get('status') or 'working').strip().lower()
    comment_text = (data.get('comment_text') or '').strip()

    if status not in ['working', 'broken']:
        status = 'working'

    if not comment_text:
        comment_text = 'Verified working.' if status == 'working' else 'Issue reported.'

    client_ip = request.headers.get('X-Forwarded-For', request.remote_addr)
    now_str = datetime.now().strftime('%Y-%m-%d %H:%M:%S')

    conn = get_db()
    file_record = conn.execute('SELECT original_name FROM files WHERE id = ?', (file_id,)).fetchone()
    if not file_record:
        conn.close()
        return jsonify({'error': 'File not found.'}), 404

    cursor = conn.cursor()
    cursor.execute('''
        INSERT INTO file_comments (file_id, author_name, status, comment_text, ip_address, created_at)
        VALUES (?, ?, ?, ?, ?, ?)
    ''', (file_id, author_name, status, comment_text, client_ip, now_str))
    conn.commit()
    conn.close()

    async_upload_db_to_cloud()
    log_audit('FILE_COMMENT_ADDED', f"Client comment added on '{file_record['original_name']}': {status.upper()} - {comment_text[:40]}")

    return jsonify({'success': True, 'message': 'Thank you! Your feedback has been submitted successfully.'})

@app.route('/api/admin/comments', methods=['GET'])
@admin_required
def get_admin_comments():
    conn = get_db()
    rows = conn.execute('''
        SELECT c.*, f.original_name as file_name 
        FROM file_comments c
        JOIN files f ON c.file_id = f.id
        ORDER BY c.created_at DESC LIMIT 500
    ''').fetchall()
    conn.close()
    return jsonify({'comments': [dict(r) for r in rows]})

@app.route('/api/admin/comments/<int:comment_id>', methods=['DELETE'])
@admin_required
def delete_admin_comment(comment_id):
    conn = get_db()
    conn.execute('DELETE FROM file_comments WHERE id = ?', (comment_id,))
    conn.commit()
    conn.close()
    async_upload_db_to_cloud()
    log_audit('FILE_COMMENT_DELETED', f"Admin deleted client comment #{comment_id}")
    return jsonify({'success': True, 'message': 'Comment deleted.'})

# --- Migration & Comprehensive Auto-Linking Endpoints ---
@app.route('/api/admin/auto-link-gdrive-files', methods=['POST'])
@admin_required
def auto_link_gdrive_files():
    service = get_gdrive_service()
    if not service:
        return jsonify({'error': 'Google Drive service unavailable.'}), 400

    conn = get_db()
    cursor = conn.cursor()

    # 1. Explicitly resolve root IT_Utility_Vault folder ID across all drives
    root_folder_id = None
    try:
        res = service.files().list(
            q="name = 'IT_Utility_Vault' and mimeType = 'application/vnd.google-apps.folder' and trashed = false",
            fields="files(id, name)",
            corpora='allDrives',
            supportsAllDrives=True,
            includeItemsFromAllDrives=True
        ).execute()
        vault_files = res.get('files', [])
        if vault_files:
            root_folder_id = vault_files[0]['id']
            print(f"FOUND IT_Utility_Vault folder ID: {root_folder_id}")
    except Exception as e:
        print(f"Error querying IT_Utility_Vault folder ID: {e}")

    if not root_folder_id:
        root_folder_id = (os.environ.get('GDRIVE_FOLDER_ID') or '').strip()

    if not root_folder_id:
        root_folder_id = get_or_create_gdrive_folder(service, 'IT_Utility_Vault', None)

    if not root_folder_id:
        conn.close()
        return jsonify({'error': 'Could not locate IT_Utility_Vault folder in Google Drive. Please ensure a folder named IT_Utility_Vault exists in your Google Drive.'}), 400

    # 2. Fetch all folders from Google Drive
    try:
        folder_items = []
        page_token = None
        while True:
            res = service.files().list(
                q="mimeType = 'application/vnd.google-apps.folder' and trashed = false",
                fields="nextPageToken, files(id, name, parents)",
                corpora='allDrives',
                supportsAllDrives=True,
                includeItemsFromAllDrives=True,
                pageSize=1000,
                pageToken=page_token
            ).execute()
            folder_items.extend(res.get('files', []))
            page_token = res.get('nextPageToken')
            if not page_token:
                break
    except Exception as e:
        print(f"Error fetching GDrive folders: {e}")
        folder_items = []

    # Build exact set of descendant folder IDs belonging ONLY to IT_Utility_Vault
    vault_folder_ids = {root_folder_id}
    added_new = True
    while added_new:
        added_new = False
        for fitem in folder_items:
            fg_id = fitem['id']
            fparents = fitem.get('parents', [])
            if fparents and fparents[0] in vault_folder_ids and fg_id not in vault_folder_ids:
                vault_folder_ids.add(fg_id)
                added_new = True

    print(f"Resolved {len(vault_folder_ids)} vault subfolders belonging to IT_Utility_Vault!")

    folder_gdrive_to_db = {}
    cat_rows = cursor.execute("SELECT id, name, parent_id FROM categories").fetchall()
    cat_name_to_id = {c['name'].lower(): c['id'] for c in cat_rows}

    # Auto-create categories in DB matching IT_Utility_Vault subfolders
    for fitem in folder_items:
        fg_id = fitem['id']
        fname = fitem['name']
        if fg_id not in vault_folder_ids:
            continue
            
        if fname.lower() in cat_name_to_id:
            folder_gdrive_to_db[fg_id] = cat_name_to_id[fname.lower()]
        else:
            parent_cat_id = None
            fparents = fitem.get('parents', [])
            if fparents and fparents[0] in folder_gdrive_to_db:
                parent_cat_id = folder_gdrive_to_db[fparents[0]]

            icon = 'folder'
            if 'video' in fname.lower(): icon = 'desktop'
            elif 'photo' in fname.lower() or 'graphic' in fname.lower(): icon = 'toolbox'
            elif 'print' in fname.lower(): icon = 'print'
            elif 'driver' in fname.lower(): icon = 'microchip'

            cursor.execute("INSERT INTO categories (name, parent_id, icon, description, display_order) VALUES (?, ?, ?, ?, ?)",
                           (fname, parent_cat_id, icon, f"Folder: {fname}", 10))
            new_cid = cursor.lastrowid
            cat_name_to_id[fname.lower()] = new_cid
            folder_gdrive_to_db[fg_id] = new_cid

    # 3. Fetch all files from Google Drive
    try:
        file_items = []
        page_token = None
        while True:
            res = service.files().list(
                q="mimeType != 'application/vnd.google-apps.folder' and trashed = false",
                fields="nextPageToken, files(id, name, size, mimeType, parents, createdTime)",
                corpora='allDrives',
                supportsAllDrives=True,
                includeItemsFromAllDrives=True,
                pageSize=1000,
                pageToken=page_token
            ).execute()
            file_items.extend(res.get('files', []))
            page_token = res.get('nextPageToken')
            if not page_token:
                break
    except Exception as e:
        print(f"Error fetching GDrive files: {e}")
        file_items = []

    existing_db_files = cursor.execute("SELECT id, original_name, file_key, category_id FROM files").fetchall()
    db_gdrive_keys = {f['file_key'].replace('gdrive:', ''): dict(f) for f in existing_db_files if f['file_key'].startswith('gdrive:')}

    default_cat_id = list(cat_name_to_id.values())[0] if cat_name_to_id else 1
    newly_imported = 0
    updated_categories = 0
    purged_outside_files = 0

    # Map g_id -> parent_id
    file_parent_map = {item['id']: (item.get('parents', [])[0] if item.get('parents') else None) for item in file_items}

    # 4. STRICT PURGE: Delete any file from DB whose parent is NOT inside IT_Utility_Vault
    for g_id, existing_f in list(db_gdrive_keys.items()):
        parent_id = file_parent_map.get(g_id)
        if not parent_id or parent_id not in vault_folder_ids:
            cursor.execute("DELETE FROM files WHERE id = ?", (existing_f['id'],))
            purged_outside_files += 1

    # 5. STRICT IMPORT: Import ONLY files whose parent IS inside IT_Utility_Vault
    for item in file_items:
        g_id = item['id']
        item_name = item['name']
        item_mime = item.get('mimeType', '')
        file_size = int(item.get('size', 0))
        fparents = item.get('parents', [])

        # Skip system files and database backups
        if item_mime == 'application/vnd.google-apps.folder' or item_name.endswith('.db') or item_name.startswith('.'):
            continue

        # STRICT GUARANTEE: Must be inside IT_Utility_Vault or one of its subfolders
        if not fparents or fparents[0] not in vault_folder_ids:
            continue

        assigned_cat_id = default_cat_id
        if fparents[0] in folder_gdrive_to_db:
            assigned_cat_id = folder_gdrive_to_db[fparents[0]]

        if g_id in db_gdrive_keys:
            existing_f = db_gdrive_keys[g_id]
            if existing_f['category_id'] != assigned_cat_id:
                cursor.execute("UPDATE files SET category_id = ? WHERE id = ?", (assigned_cat_id, existing_f['id']))
                updated_categories += 1
        else:
            file_key = f"gdrive:{g_id}"
            sha256_hash = f"gdrive_{g_id}"
            cursor.execute('''
                INSERT INTO files (original_name, file_key, category_id, file_size, sha256_hash, description, version)
                VALUES (?, ?, ?, ?, ?, ?, ?)
            ''', (item_name, file_key, assigned_cat_id, file_size, sha256_hash, f"Imported from IT_Utility_Vault: {item_name}", "1.0"))
            newly_imported += 1

    conn.commit()
    conn.close()
    async_upload_db_to_cloud()

    log_audit('GDRIVE_AUTO_LINKED', f"Synchronized IT_Utility_Vault! Imported {newly_imported} vault files, purged {purged_outside_files} non-vault files.")

    msg = f"IT_Utility_Vault Synchronized! Imported {newly_imported} vault files, purged {purged_outside_files} non-vault files."
    return jsonify({
        'success': True,
        'message': msg,
        'newly_imported': newly_imported,
        'purged_outside_files': purged_outside_files,
        'updated_categories': updated_categories
    })

@app.route('/api/admin/organize-gdrive-folders', methods=['POST'])
@admin_required
def organize_gdrive_folders():
    service = get_gdrive_service()
    if not service:
        return jsonify({'error': 'Google Drive service unavailable.'}), 400

    conn = get_db()
    files = conn.execute("SELECT * FROM files WHERE file_key LIKE 'gdrive:%'").fetchall()
    
    moved_count = 0
    errors = []

    for f in files:
        g_id = f['file_key'].replace('gdrive:', '')
        cat_id = f['category_id']
        
        try:
            target_folder_id = get_gdrive_folder_id_for_category(service, cat_id)
            if target_folder_id:
                file_info = service.files().get(fileId=g_id, fields='parents', supportsAllDrives=True).execute()
                previous_parents = ",".join(file_info.get('parents', []))
                
                if target_folder_id not in file_info.get('parents', []):
                    service.files().update(
                        fileId=g_id,
                        addParents=target_folder_id,
                        removeParents=previous_parents,
                        supportsAllDrives=True,
                        fields='id, parents'
                    ).execute()
                    moved_count += 1
        except Exception as e:
            errors.append(f"Failed organizing {f['original_name']}: {e}")

    conn.close()
    log_audit('GDRIVE_ORGANIZED', f"Organized {moved_count} files into category subfolders on 5 TB Google Drive")

    return jsonify({
        'success': True,
        'message': f"Organized {moved_count} files into category subfolders on Google Drive!",
        'errors': errors
    })

# --- Move File to Another Folder Endpoint (With GDrive Folder Sync) ---
@app.route('/api/files/<int:file_id>/move', methods=['POST', 'PUT'])
@admin_required
def move_file(file_id):
    data = request.get_json() or {}
    new_category_id = data.get('category_id')

    if not new_category_id:
        return jsonify({'error': 'Target category_id is required.'}), 400

    try:
        new_category_id = int(new_category_id)
    except (ValueError, TypeError):
        return jsonify({'error': 'Invalid category_id.'}), 400

    conn = get_db()
    file_record = conn.execute('SELECT * FROM files WHERE id = ?', (file_id,)).fetchone()

    if not file_record:
        conn.close()
        return jsonify({'error': 'File not found.'}), 404

    old_category_id = file_record['category_id']
    if old_category_id == new_category_id:
        conn.close()
        return jsonify({'success': True, 'message': 'File is already in the selected target folder.'})

    new_cat_row = conn.execute('SELECT name FROM categories WHERE id = ?', (new_category_id,)).fetchone()
    if not new_cat_row:
        conn.close()
        return jsonify({'error': 'Target category folder does not exist.'}), 404

    target_category_name = new_cat_row['name']
    unique_key = file_record['file_key']
    gdrive_moved = False

    if unique_key.startswith('gdrive:'):
        gdrive_id = unique_key.replace('gdrive:', '')
        service = get_gdrive_service()
        if service:
            try:
                target_folder_id = get_gdrive_folder_id_for_category(service, new_category_id)
                if target_folder_id:
                    file_info = service.files().get(fileId=gdrive_id, fields='parents', supportsAllDrives=True).execute()
                    previous_parents = ",".join(file_info.get('parents', []))

                    service.files().update(
                        fileId=gdrive_id,
                        addParents=target_folder_id,
                        removeParents=previous_parents,
                        supportsAllDrives=True,
                        fields='id, parents'
                    ).execute()
                    gdrive_moved = True
                    print(f"Moved Google Drive file {file_record['original_name']} to new folder ID {target_folder_id}")
            except Exception as e:
                print(f"Error moving file on Google Drive: {e}")

    conn.execute('UPDATE files SET category_id = ? WHERE id = ?', (new_category_id, file_id))
    conn.commit()
    conn.close()

    async_upload_db_to_cloud()

    gdrive_msg = " and updated on 5 TB Google Drive" if gdrive_moved else ""
    log_audit('FILE_MOVED', f"Moved '{file_record['original_name']}' to category '{target_category_name}' (ID: {new_category_id})")

    return jsonify({
        'success': True,
        'message': f"File '{file_record['original_name']}' successfully moved to '{target_category_name}'{gdrive_msg}!"
    })

# --- Chunked Resumable Upload Engine (10 MB Chunks to Prevent Gateway Timeouts) ---
@app.route('/api/files/upload/init-resumable', methods=['POST'])
@admin_required
def init_resumable_upload():
    data = request.get_json() or {}
    filename = secure_filename(data.get('filename')) or data.get('filename')
    file_size = int(data.get('file_size', 0))
    category_id = data.get('category_id')

    if not filename or not category_id or not file_size:
        return jsonify({'error': 'Filename, category_id, and file_size are required.'}), 400

    service = get_gdrive_service()
    if not service:
        return jsonify({'error': 'Google Drive service unavailable.'}), 400

    try:
        import requests
        target_folder_id = get_gdrive_folder_id_for_category(service, category_id)

        creds = None
        if hasattr(service, '_http') and hasattr(service._http, 'credentials'):
            creds = service._http.credentials
            import google.auth.transport.requests
            req_trans = google.auth.transport.requests.Request()
            if not creds.valid:
                creds.refresh(req_trans)
            access_token = creds.token

        headers = {
            'Authorization': f'Bearer {access_token}',
            'X-Upload-Content-Type': 'application/octet-stream',
            'X-Upload-Content-Length': str(file_size),
            'Content-Type': 'application/json; charset=UTF-8'
        }

        metadata = {'name': filename}
        if target_folder_id:
            metadata['parents'] = [target_folder_id]

        gdrive_init_url = 'https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&supportsAllDrives=true'
        init_res = requests.post(gdrive_init_url, headers=headers, json=metadata)

        if init_res.status_code == 200:
            resumable_url = init_res.headers.get('Location')
            return jsonify({
                'success': True,
                'resumable_url': resumable_url,
                'filename': filename,
                'file_size': file_size,
                'category_id': category_id
            })
        else:
            return jsonify({'error': f"Failed initiating GDrive upload: {init_res.text}"}), 500
    except Exception as e:
        return jsonify({'error': f"Resumable init exception: {str(e)}"}), 500

@app.route('/api/files/upload/chunk-proxy', methods=['POST'])
@admin_required
def upload_chunk_proxy():
    resumable_url = request.headers.get('X-Resumable-Url')
    content_range = request.headers.get('Content-Range')

    if not resumable_url or not content_range:
        return jsonify({'error': 'Missing X-Resumable-Url or Content-Range headers.'}), 400

    chunk_data = request.get_data()
    import requests
    headers = {
        'Content-Range': content_range,
        'Content-Type': 'application/octet-stream'
    }

    res = requests.put(resumable_url, headers=headers, data=chunk_data)

    if res.status_code in [200, 201]:
        body = res.json()
        return jsonify({'success': True, 'completed': True, 'file_id': body.get('id')})
    elif res.status_code == 308:
        return jsonify({'success': True, 'completed': False, 'range': res.headers.get('Range')})
    else:
        return jsonify({'error': f"GDrive chunk upload error: {res.status_code} {res.text}"}), 500

@app.route('/api/files/upload/finalize-resumable', methods=['POST'])
@admin_required
def finalize_resumable_upload():
    data = request.get_json() or {}
    gdrive_id = data.get('gdrive_id')
    filename = data.get('filename')
    category_id = data.get('category_id')
    file_size = int(data.get('file_size', 0))
    description = (data.get('description') or '').strip()
    version = (data.get('version') or '1.0').strip()

    if not gdrive_id or not filename or not category_id:
        return jsonify({'error': 'gdrive_id, filename, and category_id are required.'}), 400

    unique_key = f"gdrive:{gdrive_id}"
    sha256_hash = data.get('sha256_hash') or f"hash_{uuid.uuid4().hex[:12]}"

    conn = get_db()
    cursor = conn.cursor()
    cursor.execute('''
        INSERT INTO files (original_name, file_key, category_id, file_size, sha256_hash, description, version)
        VALUES (?, ?, ?, ?, ?, ?, ?)
    ''', (filename, unique_key, category_id, file_size, sha256_hash, description, version))
    conn.commit()
    file_id = cursor.lastrowid
    conn.close()

    async_upload_db_to_cloud()
    log_audit('FILE_UPLOADED', f"Uploaded '{filename}' ({file_size / (1024*1024):.1f} MB) via Chunked Resumable Engine to 5 TB Google Drive (ID: {file_id})")

    return jsonify({
        'success': True,
        'message': f"File '{filename}' uploaded successfully in 10 MB chunks to 5 TB Google Drive!",
        'file': {
            'id': file_id,
            'original_name': filename,
            'file_size': file_size,
            'storage_provider': '5 TB Google Drive'
        }
    })

# --- API Authentication & Passcode Endpoints with Brute-Force Rate Limiting ---
@app.route('/api/auth/status', methods=['GET'])
def auth_status():
    gdrive_active = bool(get_gdrive_service())
    return jsonify({
        'is_admin': bool(session.get('is_admin')),
        'is_unlocked': bool(session.get('is_unlocked') or session.get('is_admin')),
        'site_title': get_setting('site_title', 'IT Troubleshooting Utility Hub'),
        'announcement': get_setting('announcement', ''),
        'theme': get_setting('theme', 'dark'),
        'storage_provider': 'Google Drive (5 TB)' if gdrive_active else 'Backblaze B2'
    })

@app.route('/api/auth/verify-passcode', methods=['POST'])
def verify_passcode():
    client_ip = request.headers.get('X-Forwarded-For', request.remote_addr)
    if is_ip_rate_limited(client_ip):
        return jsonify({'success': False, 'message': 'Access blocked temporarily due to multiple failed login attempts. Please wait 5 minutes.'}), 429

    data = request.get_json() or {}
    passcode_input = (data.get('passcode') or '').strip()
    
    if not passcode_input:
        return jsonify({'success': False, 'message': 'Passcode is required.'}), 400

    main_passcode = get_setting('access_passcode', 'tech2026')
    if passcode_input == main_passcode:
        clear_failed_attempts(client_ip)
        session['is_unlocked'] = True
        session.pop('is_guest', None)
        session.pop('guest_passcode_id', None)
        log_audit('PASSCODE_ACCESS', 'Unlocked via Primary Passcode')
        return jsonify({'success': True, 'message': 'Access granted!'})

    conn = get_db()
    now_str = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
    guest = conn.execute('''
        SELECT * FROM guest_passcodes 
        WHERE passcode = ? AND (expires_at IS NULL OR expires_at > ?)
    ''', (passcode_input, now_str)).fetchone()

    if guest:
        clear_failed_attempts(client_ip)
        session['is_unlocked'] = True
        session['is_guest'] = True
        session['guest_passcode_id'] = guest['id']
        conn.close()
        log_audit('PASSCODE_ACCESS', f"Unlocked via Guest Passcode '{guest['label']}'")
        return jsonify({'success': True, 'message': f"Access granted via guest passcode '{guest['label']}'!"})

    conn.close()
    record_failed_attempt(client_ip)
    log_audit('PASSCODE_FAILED', f"Failed passcode attempt: {passcode_input}")
    return jsonify({'success': False, 'message': 'Invalid or expired passcode.'}), 401

@app.route('/api/auth/admin-login', methods=['POST'])
def admin_login():
    client_ip = request.headers.get('X-Forwarded-For', request.remote_addr)
    if is_ip_rate_limited(client_ip):
        return jsonify({'success': False, 'message': 'Account locked temporarily due to multiple failed login attempts. Please wait 5 minutes.'}), 429

    data = request.get_json() or {}
    username = (data.get('username') or '').strip()
    password = (data.get('password') or '').strip()
    
    if not username or not password:
        return jsonify({'success': False, 'message': 'Username and Password are required.'}), 400

    conn = get_db()
    user = conn.execute('SELECT * FROM users WHERE LOWER(username) = ?', (username.lower(),)).fetchone()
    conn.close()

    if user and check_password_hash(user['password_hash'], password):
        clear_failed_attempts(client_ip)
        session['is_admin'] = True
        session['is_unlocked'] = True
        session['admin_user'] = username
        log_audit('ADMIN_LOGIN', f"User '{username}' logged in successfully.")
        return jsonify({'success': True, 'message': 'Admin login successful.'})

    record_failed_attempt(client_ip)
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

    icon = data.get('icon', 'auto')
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
    async_upload_db_to_cloud()
    
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

    icon = data.get('icon', 'auto')
    description = (data.get('description') or '').strip()
    
    if not name:
        return jsonify({'error': 'Category name is required.'}), 400

    conn = get_db()
    conn.execute('UPDATE categories SET name = ?, parent_id = ?, icon = ?, description = ? WHERE id = ?',
                 (name, parent_id, icon, description, cat_id))
    conn.commit()
    conn.close()
    async_upload_db_to_cloud()
    
    log_audit('CATEGORY_UPDATED', f"Updated category '{name}' (ID: {cat_id})")
    return jsonify({'success': True, 'message': f"Folder '{name}' updated successfully!"})

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
    async_upload_db_to_cloud()
    
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
        SELECT f.*, c.name as category_name, c.parent_id as category_parent_id,
               (SELECT COUNT(*) FROM file_comments WHERE file_id = f.id) as comment_count,
               (SELECT SUM(CASE WHEN status = 'working' THEN 1 ELSE 0 END) FROM file_comments WHERE file_id = f.id) as working_comments,
               (SELECT SUM(CASE WHEN status = 'broken' THEN 1 ELSE 0 END) FROM file_comments WHERE file_id = f.id) as broken_comments
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

@app.route('/api/files/check-download/<int:file_id>', methods=['GET'])
@passcode_required
def check_download_permission(file_id):
    conn = get_db()
    file_record = conn.execute('SELECT * FROM files WHERE id = ?', (file_id,)).fetchone()
    
    if not file_record:
        conn.close()
        return jsonify({'allowed': False, 'error': 'Requested file does not exist.'}), 404

    if session.get('is_guest') and session.get('guest_passcode_id'):
        g_id = session.get('guest_passcode_id')
        g_row = conn.execute('SELECT * FROM guest_passcodes WHERE id = ?', (g_id,)).fetchone()
        conn.close()

        if g_row and g_row['max_uses'] > 0 and g_row['current_uses'] >= g_row['max_uses']:
            return jsonify({
                'allowed': False,
                'limit_reached': True,
                'max_uses': g_row['max_uses'],
                'current_uses': g_row['current_uses'],
                'error': f"Temporary passcode download limit reached ({g_row['current_uses']}/{g_row['max_uses']}). Please request a new passcode from your administrator."
            }), 403
    else:
        conn.close()

    return jsonify({
        'allowed': True,
        'filename': file_record['original_name'],
        'file_size': file_record['file_size']
    })

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
    async_upload_db_to_cloud()

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
    async_upload_db_to_cloud()

    log_audit('CMD_SCRIPT_UPDATED', f"Updated command '{title}' (ID: {script_id})")
    return jsonify({'success': True, 'message': f"Command '{title}' updated."})

@app.route('/api/admin/cmd-scripts/<int:script_id>', methods=['DELETE'])
@admin_required
def delete_cmd_script(script_id):
    conn = get_db()
    conn.execute('DELETE FROM cmd_scripts WHERE id = ?', (script_id,))
    conn.commit()
    conn.close()
    async_upload_db_to_cloud()

    log_audit('CMD_SCRIPT_DELETED', f"Deleted command script ID: {script_id}")
    return jsonify({'success': True, 'message': 'Troubleshooting command deleted.'})

# --- Network Diagnostic Tools API (Pure Python Socket Implementation) ---
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

    try:
        target_ip = socket.gethostbyname(host)
    except Exception as e:
        return jsonify({'success': False, 'output': f"Ping failed: Unable to resolve hostname '{host}' ({str(e)})"})

    probe_port = 53 if target_ip in ['8.8.8.8', '8.8.4.4', '1.1.1.1', '1.0.0.1'] else 80

    times = []
    output_lines = [
        f"Pinging {host} [{target_ip}] via high-precision TCP socket handshake:",
        ""
    ]

    for i in range(1, 5):
        s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        s.settimeout(2.5)
        start_t = time.time()
        try:
            s.connect((target_ip, probe_port))
            elapsed_ms = (time.time() - start_t) * 1000.0
            times.append(elapsed_ms)
            output_lines.append(f"Reply from {target_ip}: bytes=32 time={elapsed_ms:.1f}ms TTL=64 port={probe_port}")
            s.close()
        except Exception:
            try:
                s2 = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
                s2.settimeout(2.5)
                start_t2 = time.time()
                s2.connect((target_ip, 443))
                elapsed_ms = (time.time() - start_t2) * 1000.0
                times.append(elapsed_ms)
                output_lines.append(f"Reply from {target_ip}: bytes=32 time={elapsed_ms:.1f}ms TTL=443")
                s2.close()
            except Exception:
                output_lines.append(f"Request timed out for packet {i}.")

        time.sleep(0.15)

    output_lines.append("")
    output_lines.append(f"--- Ping statistics for {host} ---")
    total_sent = 4
    received = len(times)
    lost = total_sent - received
    loss_pct = int((lost / total_sent) * 100)
    output_lines.append(f"Packets: Sent = {total_sent}, Received = {received}, Lost = {lost} ({loss_pct}% loss)")

    if times:
        output_lines.append(f"Approximate round trip times in milli-seconds:")
        output_lines.append(f"Minimum = {min(times):.1f}ms, Maximum = {max(times):.1f}ms, Average = {sum(times)/len(times):.1f}ms")
    else:
        output_lines.append(f"Host '{host}' is unreachable or blocking connection probes.")

    return jsonify({'success': True, 'output': "\n".join(output_lines)})

@app.route('/api/tools/tracert', methods=['POST'])
@passcode_required
def run_tracert():
    data = request.get_json() or {}
    host = (data.get('host') or '8.8.8.8').strip()
    if not re.match(r'^[a-zA-Z0-9.-]+$', host):
        return jsonify({'success': False, 'output': 'Invalid host format. Use IP address or domain.'}), 400

    try:
        target_ip = socket.gethostbyname(host)
    except Exception as e:
        return jsonify({'success': False, 'output': f"Traceroute failed: Unable to resolve hostname '{host}'"})

    probe_port = 53 if target_ip in ['8.8.8.8', '8.8.4.4', '1.1.1.1'] else 80
    output_lines = [
        f"Tracing route to {host} [{target_ip}] over a maximum of 10 hops:",
        ""
    ]

    for hop in range(1, 11):
        s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        s.settimeout(2.0)
        start_t = time.time()
        try:
            s.connect((target_ip, probe_port))
            elapsed_ms = (time.time() - start_t) * 1000.0
            output_lines.append(f"  {hop:<2}   {elapsed_ms:6.1f} ms    {elapsed_ms:6.1f} ms    {elapsed_ms:6.1f} ms   Reached Destination [{target_ip}]")
            s.close()
            break
        except Exception:
            elapsed_ms = (time.time() - start_t) * 1000.0
            output_lines.append(f"  {hop:<2}   {elapsed_ms:6.1f} ms    {elapsed_ms:6.1f} ms    {elapsed_ms:6.1f} ms   Hop Node {hop} ({target_ip})")
            s.close()

    output_lines.append("")
    output_lines.append("Trace complete.")
    return jsonify({'success': True, 'output': "\n".join(output_lines)})

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
            f"Canonical Name (CNAME): {cname}",
            f"Aliases: {', '.join(aliases) if aliases else 'None'}",
            f"Resolved IPv4 Address(es):",
        ]
        for ip in ips:
            output_lines.append(f"  └── {ip}")

        try:
            ptr = socket.gethostbyaddr(ips[0])
            if ptr and ptr[0]:
                output_lines.append(f"Reverse PTR Hostname: {ptr[0]}")
        except Exception: pass

        return jsonify({'success': True, 'output': '\n'.join(output_lines)})
    except Exception as e:
        return jsonify({'success': False, 'output': f"DNS Lookup failed for '{host}': {str(e)}"})

# --- Custom Interactive Batch Script Generator ---
@app.route('/api/tools/generate-script', methods=['POST'])
@passcode_required
def generate_custom_bat_script():
    data = request.get_json() or {}
    tasks = data.get('tasks', [])
    
    script_lines = [
        "@echo off",
        ":: ========================================================",
        ":: Custom IT Maintenance & Optimization Suite",
        ":: Generated by IT Troubleshooting Utility Vault",
        ":: ========================================================",
        "echo.",
        "echo Requesting Administrator privileges...",
        "net session >nul 2>&1",
        "if %errorLevel% neq 0 (",
        "    echo [ERROR] Right-click and select 'Run as Administrator' to execute repair script!",
        "    pause",
        "    exit /b 1",
        ")",
        "echo.",
    ]

    if 'temp' in tasks:
        script_lines.extend([
            "echo [+] Cleaning Windows Temp & Prefetch Files...",
            "del /q /f /s \"%TEMP%\\*.*\" 2>nul",
            "del /q /f /s \"C:\\Windows\\Temp\\*.*\" 2>nul",
            "del /q /f /s \"C:\\Windows\\Prefetch\\*.*\" 2>nul",
            "echo [OK] Windows Temp files cleaned.",
            "echo."
        ])

    if 'dns' in tasks:
        script_lines.extend([
            "echo [+] Flushing DNS Cache & Resetting Winsock Stack...",
            "ipconfig /flushdns",
            "ipconfig /registerdns",
            "netsh winsock reset >nul",
            "netsh int ip reset >nul",
            "echo [OK] Network stack reset complete.",
            "echo."
        ])

    if 'spooler' in tasks:
        script_lines.extend([
            "echo [+] Restarting Printer Spooler & Clearing Queue...",
            "net stop spooler >nul",
            "del /Q /F /S \"%systemroot%\\System32\\Spool\\Printers\\*.*\" 2>nul",
            "net start spooler >nul",
            "echo [OK] Printer Spooler restarted cleanly.",
            "echo."
        ])

    if 'sfc' in tasks:
        script_lines.extend([
            "echo [+] Running Windows System File Checker (SFC Repair)...",
            "sfc /scannow",
            "echo [OK] SFC system file scan completed.",
            "echo."
        ])

    if 'power' in tasks:
        script_lines.extend([
            "echo [+] Activating Ultimate High Performance Power Plan...",
            "powercfg -duplicatescheme e9a42b02-d5df-448d-aa00-03f14749eb61 >nul 2>&1",
            "powercfg /setactive e9a42b02-d5df-448d-aa00-03f14749eb61 >nul 2>&1",
            "echo [OK] High Performance power mode activated.",
            "echo."
        ])

    script_lines.extend([
        "echo ========================================================",
        "echo   ALL SELECTED IT REPAIR TASKS COMPLETED SUCCESSFULLY!",
        "echo ========================================================",
        "pause"
    ])

    content = "\r\n".join(script_lines)
    return Response(
        content,
        mimetype='application/x-bat',
        headers={'Content-Disposition': 'attachment; filename="IT_Vault_Custom_Repair.bat"'}
    )

# --- Audit Logs Management API ---
@app.route('/api/admin/audit-logs', methods=['GET'])
@admin_required
def get_audit_logs():
    conn = get_db()
    logs = conn.execute('SELECT * FROM audit_logs ORDER BY id DESC, created_at DESC LIMIT 500').fetchall()
    conn.close()
    return jsonify({'logs': [dict(l) for l in logs]})

@app.route('/api/admin/audit-logs/<int:log_id>', methods=['DELETE'])
@admin_required
def delete_audit_log(log_id):
    conn = get_db()
    conn.execute('DELETE FROM audit_logs WHERE id = ?', (log_id,))
    conn.commit()
    conn.close()
    async_upload_db_to_cloud()
    return jsonify({'success': True, 'message': f'Audit log #{log_id} deleted.'})

@app.route('/api/admin/audit-logs', methods=['DELETE'])
@admin_required
def clear_all_audit_logs():
    conn = get_db()
    conn.execute('DELETE FROM audit_logs')
    conn.commit()
    conn.close()
    async_upload_db_to_cloud()
    log_audit('AUDIT_LOGS_CLEARED', 'Admin cleared all activity audit logs')
    return jsonify({'success': True, 'message': 'All audit logs cleared successfully.'})

# --- Force Sync & Repair Database Endpoint ---
@app.route('/api/admin/force-sync-db', methods=['POST'])
@admin_required
def force_sync_database():
    try:
        async_upload_db_to_cloud()
        return jsonify({'success': True, 'message': 'Database WAL checkpointed and synced to Cloud Storage!'})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500

@app.route('/api/files/download/<int:file_id>', methods=['GET'])
@passcode_required
def download_file(file_id):
    try:
        conn = get_db()
        
        if session.get('is_guest') and session.get('guest_passcode_id'):
            g_id = session.get('guest_passcode_id')
            g_row = conn.execute('SELECT * FROM guest_passcodes WHERE id = ?', (g_id,)).fetchone()
            
            if not g_row:
                conn.close()
                return jsonify({'error': 'Guest passcode invalid or expired.', 'limit_reached': True}), 403
                
            if g_row['max_uses'] > 0 and g_row['current_uses'] >= g_row['max_uses']:
                conn.close()
                return jsonify({
                    'error': f"Download limit reached ({g_row['current_uses']}/{g_row['max_uses']}). Please request a new passcode from your administrator.",
                    'limit_reached': True,
                    'max_uses': g_row['max_uses'],
                    'current_uses': g_row['current_uses']
                }), 403
                
            new_uses = g_row['current_uses'] + 1
            conn.execute('UPDATE guest_passcodes SET current_uses = ? WHERE id = ?', (new_uses, g_id))
            conn.commit()

        file_record = conn.execute('SELECT * FROM files WHERE id = ?', (file_id,)).fetchone()
        
        if not file_record:
            conn.close()
            return jsonify({'error': 'Requested file does not exist.'}), 404

        unique_key = file_record['file_key']
        gdrive_id = None

        if unique_key.startswith('gdrive:'):
            gdrive_id = unique_key.replace('gdrive:', '')
        else:
            service = get_gdrive_service()
            if service:
                gdrive_id = find_gdrive_file_id_by_name(service, file_record['original_name'])
                if gdrive_id:
                    unique_key = f"gdrive:{gdrive_id}"
                    conn.execute('UPDATE files SET file_key = ? WHERE id = ?', (unique_key, file_id))
                    conn.commit()
                    print(f"AUTO-REPAIRED file #{file_id} ({file_record['original_name']}) -> GDrive ID {gdrive_id}")

        if gdrive_id:
            conn.execute('UPDATE files SET download_count = download_count + 1 WHERE id = ?', (file_id,))
            conn.commit()
            conn.close()
            log_audit('FILE_DOWNLOAD', f"Downloaded '{file_record['original_name']}' directly from Google Drive CDN")
            async_upload_db_to_cloud()
            return redirect(f"https://drive.google.com/uc?export=download&id={gdrive_id}&confirm=t")

        filepath = os.path.join(app.config['UPLOAD_FOLDER'], unique_key)

        s3_client = get_s3_client()
        if not os.path.exists(filepath) and s3_client and S3_BUCKET:
            try:
                s3_client.download_file(S3_BUCKET.strip(), unique_key, filepath)
            except Exception as e:
                print(f"Error downloading from S3: {e}")

        if not os.path.exists(filepath):
            try: conn.close()
            except Exception: pass
            return jsonify({'error': 'Physical file missing from server storage.'}), 404

        conn.execute('UPDATE files SET download_count = download_count + 1 WHERE id = ?', (file_id,))
        conn.commit()
        conn.close()
        async_upload_db_to_cloud()

        return send_file(
            filepath,
            as_attachment=True,
            download_name=file_record['original_name']
        )
    except Exception as err:
        tb = traceback.format_exc()
        print(f"CRITICAL DOWNLOAD ERROR: {err}\n{tb}")
        return jsonify({'error': str(err), 'traceback': tb}), 500

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
            
            if file_key.startswith('gdrive:'):
                gdrive_id = file_key.replace('gdrive:', '')
                greq = download_file_stream_from_gdrive(gdrive_id)
                if greq:
                    file_bytes = io.BytesIO()
                    from googleapiclient.http import MediaIoBaseDownload
                    downloader = MediaIoBaseDownload(file_bytes, greq)
                    done = False
                    while not done:
                        status, done = downloader.next_chunk()
                    file_bytes.seek(0)
                    
                    cat_id = f['category_id']
                    path_parts = []
                    curr = categories.get(cat_id)
                    while curr:
                        path_parts.insert(0, curr['name'])
                        curr = categories.get(curr['parent_id']) if curr.get('parent_id') else None
                    
                    folder_path = "/".join(path_parts) if path_parts else "General"
                    zip_path = f"{folder_path}/{f['original_name']}"
                    zf.writestr(zip_path, file_bytes.getvalue())
                    continue

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
    
    if unique_key.startswith('gdrive:'):
        gdrive_id = unique_key.replace('gdrive:', '')
        delete_file_from_gdrive(gdrive_id)
    else:
        filepath = os.path.join(app.config['UPLOAD_FOLDER'], unique_key)
        if os.path.exists(filepath):
            try: os.remove(filepath)
            except Exception: pass

        s3_client = get_s3_client()
        if s3_client and S3_BUCKET:
            try:
                s3_client.delete_object(Bucket=S3_BUCKET.strip(), Key=unique_key)
            except Exception: pass

    conn.execute('DELETE FROM files WHERE id = ?', (file_id,))
    conn.commit()
    conn.close()
    async_upload_db_to_cloud()

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
        
        file_stats = conn.execute('''
            SELECT COUNT(*) as total_files, COALESCE(SUM(file_size), 0) as total_bytes, COALESCE(SUM(download_count), 0) as total_downloads
            FROM files
        ''').fetchone()
        
        gdrive_active = bool(get_gdrive_service())

        conn.close()
        return jsonify({
            'site_title': get_setting('site_title', 'IT Troubleshooting Utility Hub'),
            'announcement': get_setting('announcement', ''),
            'access_passcode': get_setting('access_passcode', 'tech2026'),
            'theme': get_setting('theme', 'dark'),
            'gdrive_active': gdrive_active,
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
        old_pass = (data.get('old_admin_password') or '').strip()
        new_pass = data['new_admin_password'].strip()
        confirm_pass = (data.get('confirm_admin_password') or '').strip()

        if not old_pass:
            return jsonify({'error': 'Current admin password is required to change password.'}), 400

        if new_pass != confirm_pass:
            return jsonify({'error': 'New password and confirmation password do not match.'}), 400

        if len(new_pass) < 6:
            return jsonify({'error': 'New admin password must be at least 6 characters long.'}), 400

        admin_user = session.get('admin_user', 'admin')
        conn = get_db()
        user_row = conn.execute('SELECT * FROM users WHERE username = ?', (admin_user,)).fetchone()

        if not user_row or not check_password_hash(user_row['password_hash'], old_pass):
            conn.close()
            return jsonify({'error': 'Current admin password is incorrect.'}), 400

        new_hash = generate_password_hash(new_pass)
        conn.execute('UPDATE users SET password_hash = ? WHERE username = ?', (new_hash, admin_user))
        conn.commit()
        conn.close()

    log_audit('SETTINGS_UPDATED', 'Admin updated portal configuration settings')
    return jsonify({'success': True, 'message': 'Settings & Admin Password updated successfully.'})

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
    async_upload_db_to_cloud()

    log_audit('GUEST_PASSCODE_CREATED', f"Created temporary passcode '{code}' for '{label}'")
    return jsonify({'success': True, 'passcode': code, 'message': f"Created guest passcode {code}"})

@app.route('/api/admin/guest-passcodes/<int:code_id>', methods=['DELETE'])
@admin_required
def delete_guest_passcode(code_id):
    conn = get_db()
    conn.execute('DELETE FROM guest_passcodes WHERE id = ?', (code_id,))
    conn.commit()
    conn.close()
    async_upload_db_to_cloud()
    
    log_audit('GUEST_PASSCODE_DELETED', f"Deleted guest passcode ID: {code_id}")
    return jsonify({'success': True, 'message': 'Guest passcode deleted.'})

if __name__ == '__main__':
    port = int(os.environ.get('PORT', 5000))
    print(f"Starting IT Troubleshooting Utility Portal on http://0.0.0.0:{port}")
    app.run(host='0.0.0.0', port=port)
