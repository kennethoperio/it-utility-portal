export async function onRequestPost(context) {
  try {
    const body = await context.request.json();
    const passcode = (body.passcode || '').trim();

    if (passcode === 'tech2026' || passcode === 'PHCORNER') {
      return new Response(JSON.stringify({ success: true, message: 'Passcode verified.' }), {
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
      });
    }
    return new Response(JSON.stringify({ success: false, error: 'Invalid passcode.' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
    });
  } catch (e) {
    return new Response(JSON.stringify({ success: false, error: 'Invalid request.' }), { status: 400 });
  }
}
