export async function onRequest(context) {
  const DEFAULT_CATEGORIES = [
    { id: 1, name: "Tools & Installers", parent_id: null, icon: "toolbox", description: "General IT utilities and installers", display_order: 1 },
    { id: 2, name: "Printers", parent_id: null, icon: "print", description: "Printer drivers and resetters", display_order: 2 },
    { id: 3, name: "Drivers", parent_id: 2, icon: "microchip", description: "Hardware device drivers", display_order: 3 },
    { id: 4, name: "Resetters", parent_id: 2, icon: "rotate-left", description: "Epson & Canon printer resetters", display_order: 4 },
    { id: 5, name: "Windows Repair", parent_id: null, icon: "screwdriver-wrench", description: "Windows OS fix and repair tools", display_order: 5 },
    { id: 6, name: "Activators & License Tools", parent_id: null, icon: "key", description: "License activation software", display_order: 6 },
    { id: 7, name: "Network & Connectivity", parent_id: null, icon: "network-wired", description: "Network diagnostics and monitoring", display_order: 7 },
    { id: 8, name: "Hardware Diagnostics", parent_id: null, icon: "microchip", description: "RAM, HDD, CPU testing utilities", display_order: 8 }
  ];

  const DEFAULT_FILES = [
    { id: 60, original_name: "Classroom_Spy_Professional_4.8.19.rar", file_key: "gdrive:1YlmvTp6clyBOJKVpXNer78QISDXsu7Th", category_id: 1, file_size: 97982792, download_count: 5, description: "Classroom Spy Pro Remote Monitoring Utility", version: "4.8.19", created_at: "2026-08-20 12:00:00" },
    { id: 61, original_name: "hdsentinel_pro_setup.zip", file_key: "gdrive:1YlmvTp6clyBOJKVpXNer78QISDXsu7Th", category_id: 8, file_size: 35000000, download_count: 12, description: "Hard Disk Sentinel Pro Drive Health Monitor", version: "6.10", created_at: "2026-08-20 12:00:00" }
  ];

  return new Response(JSON.stringify({
    files: DEFAULT_FILES,
    categories: DEFAULT_CATEGORIES,
    gdrive_active: true
  }), {
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'no-cache, no-store, must-revalidate'
    }
  });
}
