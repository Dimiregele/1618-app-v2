// tts — voce naturală pentru asistent, cu cache pe server.
//
// Fluxul: aplicația trimite un text scurt (replici fixe: întrebări, instrucțiuni). Funcția calculează un hash
// din (furnizor, voce, text); dacă fișierul mp3 există deja în bucket-ul public `tts-cache`, îl returnează
// direct. Altfel îl sintetizează, îl salvează și returnează URL-ul. Fiecare replică costă deci o singură dată,
// indiferent câți utilizatori o aud.
//
// Furnizori (se alege după ce secrete sunt setate; vezi README):
//  - ElevenLabs: dacă există ELEVENLABS_API_KEY + ELEVENLABS_VOICE_ID. Atenție: planul gratuit NU permite
//    folosire comercială și cere atribuire; pentru un produs cu abonamente e nevoie de un plan plătit.
//  - Azure Speech (voci neurale, 500.000 caractere gratuite/lună): AZURE_SPEECH_KEY + AZURE_SPEECH_REGION.
//    Vocea implicită e ro-RO-AlinaNeural; se poate schimba cu TTS_VOICE (ex. ro-RO-EmilNeural).
//
// NU cache-uim texte personale: aplicația trimite doar replici generice, iar fișierele sunt publice (după hash).

import { createClient } from "npm:@supabase/supabase-js@2";

const BUCKET = "tts-cache";
const MAX_CHARS = 400;

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

async function sha256Hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

const escapeXml = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");

type Provider = { name: "elevenlabs" | "azure"; voice: string };

function pickProvider(): Provider | null {
  const elKey = Deno.env.get("ELEVENLABS_API_KEY");
  const elVoice = Deno.env.get("ELEVENLABS_VOICE_ID");
  if (elKey && elVoice) return { name: "elevenlabs", voice: elVoice };
  if (Deno.env.get("AZURE_SPEECH_KEY") && Deno.env.get("AZURE_SPEECH_REGION")) {
    return { name: "azure", voice: Deno.env.get("TTS_VOICE") ?? "ro-RO-AlinaNeural" };
  }
  return null;
}

async function synthesize(provider: Provider, text: string): Promise<Uint8Array> {
  if (provider.name === "elevenlabs") {
    const res = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(provider.voice)}?output_format=mp3_44100_64`,
      {
        method: "POST",
        headers: {
          "xi-api-key": Deno.env.get("ELEVENLABS_API_KEY")!,
          "Content-Type": "application/json",
          Accept: "audio/mpeg",
        },
        body: JSON.stringify({ text, model_id: Deno.env.get("ELEVENLABS_MODEL") ?? "eleven_multilingual_v2" }),
      },
    );
    if (!res.ok) throw new Error(`ElevenLabs HTTP ${res.status}`);
    return new Uint8Array(await res.arrayBuffer());
  }

  const region = Deno.env.get("AZURE_SPEECH_REGION")!;
  const ssml =
    `<speak version='1.0' xml:lang='ro-RO'><voice xml:lang='ro-RO' name='${escapeXml(provider.voice)}'>` +
    `${escapeXml(text)}</voice></speak>`;
  const res = await fetch(`https://${region}.tts.speech.microsoft.com/cognitiveservices/v1`, {
    method: "POST",
    headers: {
      "Ocp-Apim-Subscription-Key": Deno.env.get("AZURE_SPEECH_KEY")!,
      "Content-Type": "application/ssml+xml",
      "X-Microsoft-OutputFormat": "audio-24khz-96kbitrate-mono-mp3",
      "User-Agent": "1618-app",
    },
    body: ssml,
  });
  if (!res.ok) throw new Error(`Azure Speech HTTP ${res.status}`);
  return new Uint8Array(await res.arrayBuffer());
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  // Doar utilizatori autentificați (altfel oricine ar putea consuma cota gratuită).
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const userClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } },
  });
  const {
    data: { user },
  } = await userClient.auth.getUser();
  if (!user) return json({ error: "unauthorized" }, 401);

  let text = "";
  try {
    const body = await req.json();
    text = typeof body?.text === "string" ? body.text.trim() : "";
  } catch {
    return json({ error: "bad_request", code: "bad_request" }, 400);
  }
  if (!text) return json({ error: "Lipsește textul", code: "bad_request" }, 400);
  if (text.length > MAX_CHARS) return json({ error: `Maxim ${MAX_CHARS} de caractere`, code: "too_long" }, 413);

  const provider = pickProvider();
  if (!provider) return json({ error: "Niciun furnizor de voce nu e configurat", code: "not_configured" }, 503);

  const key = await sha256Hex(`${provider.name}|${provider.voice}|${text}`);
  const path = `${key}.mp3`;
  const publicUrl = `${supabaseUrl}/storage/v1/object/public/${BUCKET}/${path}`;

  try {
    // 1) Există deja în cache?
    const head = await fetch(publicUrl, { method: "HEAD" });
    if (head.ok) return json({ url: publicUrl, cached: true });

    // 2) Sintetizăm și salvăm.
    const audio = await synthesize(provider, text);
    const admin = createClient(supabaseUrl, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { error } = await admin.storage.from(BUCKET).upload(path, audio, {
      contentType: "audio/mpeg",
      upsert: true,
      cacheControl: "31536000",
    });
    if (error) throw new Error(`Storage: ${error.message}`);
    return json({ url: publicUrl, cached: false });
  } catch (e) {
    console.error("tts error:", (e as Error).message);
    return json({ error: (e as Error).message || "Eroare internă", code: "internal" }, 502);
  }
});
