import sqlite3, json, os, datetime

DB_PATH = 'it_vault.db'
MANIFEST_PATH = 'static/vault_manifest.json'

def export_failover_manifest():
    print(f"Reading SQLite database from {DB_PATH}...")
    if not os.path.exists(DB_PATH):
        print(f"Database {DB_PATH} not found.")
        return

    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()

    categories = [dict(r) for r in cursor.execute("SELECT * FROM categories ORDER BY display_order ASC, name ASC").fetchall()]
    files = [dict(r) for r in cursor.execute("SELECT * FROM files ORDER BY id DESC").fetchall()]
    cmd_scripts = [dict(r) for r in cursor.execute("SELECT * FROM cmd_scripts ORDER BY id DESC").fetchall()]
    passcodes = [dict(r) for r in cursor.execute("SELECT * FROM guest_passcodes ORDER BY id DESC").fetchall()]
    settings = {r['key']: r['value'] for r in cursor.execute("SELECT * FROM settings").fetchall()}
    conn.close()

    manifest_data = {
        'version': '10.0',
        'generated_at': datetime.datetime.now().isoformat(),
        'categories': categories,
        'files': files,
        'cmd_scripts': cmd_scripts,
        'passcodes': passcodes,
        'settings': settings
    }

    # Ensure static directory exists
    os.makedirs(os.path.dirname(MANIFEST_PATH), exist_ok=True)
    with open(MANIFEST_PATH, 'w', encoding='utf-8') as f:
        json.dump(manifest_data, f, indent=2)

    # Also save in root static & root
    with open('vault_manifest.json', 'w', encoding='utf-8') as f:
        json.dump(manifest_data, f, indent=2)

    print(f"SUCCESS: Failover manifest generated cleanly at {MANIFEST_PATH} ({len(files)} files, {len(categories)} categories)!")

if __name__ == '__main__':
    export_failover_manifest()
