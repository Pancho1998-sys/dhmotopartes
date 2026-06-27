// supabase/functions/arca-wsfe/index.ts
//
// Emite comprobantes electrónicos contra ARCA/AFIP (WSFEv1).
// Flujo: verifica el JWT del usuario -> resuelve su store_id ->
// lee credenciales via RPC get_fiscal_credentials (clave desde Vault) ->
// obtiene/reusa el Ticket de Acceso del WSAA (cache en arca_tokens) ->
// llama a WSFEv1 (FECompUltimoAutorizado + FECAESolicitar) -> devuelve CAE.
//
// SEGURIDAD:
//  - La clave privada vive cifrada en Vault; solo la lee el service_role via RPC.
//  - El usuario solo factura para SU tienda (se valida contra user_profiles).
//  - El entorno (homologacion/produccion) se define POR TIENDA en store_fiscal_configs.

import { createClient } from "npm:@supabase/supabase-js@2";
import forge from "npm:node-forge@1";

const SERVICE_ID = "wsfe";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

// ---------------------------------------------------------------------------
// Endpoints segun entorno de la tienda
// ---------------------------------------------------------------------------
function wsaaUrl(env: string): string {
  return env === "produccion"
    ? "https://wsaa.afip.gov.ar/ws/services/LoginCms"
    : "https://wsaahomo.afip.gov.ar/ws/services/LoginCms";
}
function wsfeUrl(env: string): string {
  return env === "produccion"
    ? "https://servicios1.afip.gov.ar/wsfev1/service.asmx"
    : "https://wswhomo.afip.gov.ar/wsfev1/service.asmx";
}

// ---------------------------------------------------------------------------
// Helpers de XML
// ---------------------------------------------------------------------------
function extractTag(xml: string, tag: string): string | null {
  const m = xml.match(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`, "i"));
  return m ? m[1] : null;
}

// ---------------------------------------------------------------------------
// 1) Credenciales fiscales de la tienda (clave descifrada desde Vault via RPC)
// ---------------------------------------------------------------------------
interface StoreFiscal {
  cuit: string;
  pos_number: number;
  iva_condition: string;
  environment: string;       // "homologacion" | "produccion"
  certificate_text: string;
  private_key: string;
}

async function getStoreFiscal(storeId: string): Promise<StoreFiscal> {
  const { data, error } = await supabase
    .rpc("get_fiscal_credentials", { p_store_id: storeId })
    .single();
  if (error || !data) throw new Error("Tienda sin configuracion fiscal cargada");
  const d = data as StoreFiscal;
  if (!d.certificate_text || !d.private_key) {
    throw new Error("Faltan certificado o clave en la configuracion fiscal");
  }
  return d;
}

// ---------------------------------------------------------------------------
// 2) WSAA: Ticket de Acceso (cache en arca_tokens)
// ---------------------------------------------------------------------------
interface TA { token: string; sign: string; expiration: string; }

async function getCachedTA(storeId: string, env: string): Promise<TA | null> {
  const { data } = await supabase
    .from("arca_tokens")
    .select("token, sign, expiration")
    .eq("store_id", storeId)
    .eq("service", SERVICE_ID)
    .eq("environment", env)
    .maybeSingle();
  if (!data) return null;
  if (new Date(data.expiration).getTime() - 5 * 60_000 > Date.now()) {
    return data as TA;
  }
  return null;
}

async function saveTA(storeId: string, env: string, ta: TA): Promise<void> {
  await supabase.from("arca_tokens").upsert({
    store_id: storeId,
    service: SERVICE_ID,
    environment: env,
    token: ta.token,
    sign: ta.sign,
    expiration: ta.expiration,
    updated_at: new Date().toISOString(),
  }, { onConflict: "store_id,service,environment" });
}

function signTRA(certPem: string, keyPem: string): string {
  const now = new Date();
  const exp = new Date(now.getTime() + 10 * 60_000);
  const uniqueId = Math.floor(now.getTime() / 1000);

  const tra =
    `<?xml version="1.0" encoding="UTF-8"?>` +
    `<loginTicketRequest version="1.0">` +
      `<header>` +
        `<uniqueId>${uniqueId}</uniqueId>` +
        `<generationTime>${now.toISOString()}</generationTime>` +
        `<expirationTime>${exp.toISOString()}</expirationTime>` +
      `</header>` +
      `<service>${SERVICE_ID}</service>` +
    `</loginTicketRequest>`;

  const cert = forge.pki.certificateFromPem(certPem);
  const key = forge.pki.privateKeyFromPem(keyPem);

  const p7 = forge.pkcs7.createSignedData();
  p7.content = forge.util.createBuffer(tra, "utf8");
  p7.addCertificate(cert);
  p7.addSigner({
    key,
    certificate: cert,
    digestAlgorithm: forge.pki.oids.sha256,
    authenticatedAttributes: [
      { type: forge.pki.oids.contentType, value: forge.pki.oids.data },
      { type: forge.pki.oids.messageDigest },
      { type: forge.pki.oids.signingTime, value: now },
    ],
  });
  p7.sign();
  const der = forge.asn1.toDer(p7.toAsn1()).getBytes();
  return forge.util.encode64(der);
}

async function loginWSAA(env: string, cms: string): Promise<TA> {
  const envelope =
    `<?xml version="1.0" encoding="UTF-8"?>` +
    `<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" ` +
    `xmlns:wsaa="http://wsaa.view.sua.dvadac.desein.afip.gov">` +
      `<soapenv:Header/><soapenv:Body>` +
        `<wsaa:loginCms><wsaa:in0>${cms}</wsaa:in0></wsaa:loginCms>` +
      `</soapenv:Body></soapenv:Envelope>`;

  const res = await fetch(wsaaUrl(env), {
    method: "POST",
    headers: { "Content-Type": "text/xml; charset=utf-8", "SOAPAction": "" },
    body: envelope,
  });
  const text = await res.text();
  const decoded = text.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
  const token = extractTag(decoded, "token");
  const sign = extractTag(decoded, "sign");
  const expiration = extractTag(decoded, "expirationTime");
  if (!token || !sign || !expiration) {
    throw new Error("WSAA no devolvio un TA valido: " + text.slice(0, 500));
  }
  return { token, sign, expiration };
}

async function ensureTA(storeId: string, f: StoreFiscal): Promise<TA> {
  const cached = await getCachedTA(storeId, f.environment);
  if (cached) return cached;
  const cms = signTRA(f.certificate_text, f.private_key);
  const ta = await loginWSAA(f.environment, cms);
  await saveTA(storeId, f.environment, ta);
  return ta;
}

// ---------------------------------------------------------------------------
// 3) WSFEv1
// ---------------------------------------------------------------------------
async function callWSFE(env: string, action: string, bodyXml: string): Promise<string> {
  const envelope =
    `<?xml version="1.0" encoding="UTF-8"?>` +
    `<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/" ` +
    `xmlns:ar="http://ar.gov.afip.dif.FEV1/">` +
      `<soap:Header/><soap:Body>${bodyXml}</soap:Body></soap:Envelope>`;

  const res = await fetch(wsfeUrl(env), {
    method: "POST",
    headers: {
      "Content-Type": "text/xml; charset=utf-8",
      "SOAPAction": `http://ar.gov.afip.dif.FEV1/${action}`,
    },
    body: envelope,
  });
  return await res.text();
}

// Helper para escapar valores XML
function escapeXml(unsafe: string | number): string {
  return String(unsafe)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function authXml(ta: TA, cuit: string): string {
  return `<ar:Auth><ar:Token>${escapeXml(ta.token)}</ar:Token>` +
    `<ar:Sign>${escapeXml(ta.sign)}</ar:Sign><ar:Cuit>${escapeXml(cuit)}</ar:Cuit></ar:Auth>`;
}

async function getLastVoucher(ta: TA, f: StoreFiscal, cbteTipo: number): Promise<number> {
  const body =
    `<ar:FECompUltimoAutorizado>${authXml(ta, f.cuit)}` +
    `<ar:PtoVta>${f.pos_number}</ar:PtoVta><ar:CbteTipo>${cbteTipo}</ar:CbteTipo>` +
    `</ar:FECompUltimoAutorizado>`;
  const xml = await callWSFE(f.environment, "FECompUltimoAutorizado", body);
  const nro = extractTag(xml, "CbteNro");
  return nro ? parseInt(nro, 10) : 0;
}

// Payload desde tu frontend/app.js.
interface InvoicePayload {
  cbte_tipo: number;            // 1=Fac A, 6=Fac B, 11=Fac C...
  concepto: number;            // 1=Productos, 2=Servicios, 3=Ambos
  doc_tipo: number;            // 80=CUIT, 96=DNI, 99=Consumidor final
  doc_nro: number;
  cond_iva_receptor: number;   // CondicionIVAReceptorId
  imp_total: number;
  imp_neto: number;
  imp_iva: number;
  imp_trib?: number;
  imp_op_ex?: number;
  imp_tot_conc?: number;
  iva: { id: number; base_imp: number; importe: number }[];
}

async function solicitarCAE(ta: TA, f: StoreFiscal, p: InvoicePayload) {
  const last = await getLastVoucher(ta, f, p.cbte_tipo);
  const nro = last + 1;
  const fch = new Date().toISOString().slice(0, 10).replace(/-/g, "");

  const ivaXml = p.iva.map((a) =>
    `<ar:AlicIva><ar:Id>${a.id}</ar:Id>` +
    `<ar:BaseImp>${a.base_imp}</ar:BaseImp>` +
    `<ar:Importe>${a.importe}</ar:Importe></ar:AlicIva>`
  ).join("");

  const det =
    `<ar:FECAEDetRequest>` +
      `<ar:Concepto>${p.concepto}</ar:Concepto>` +
      `<ar:DocTipo>${p.doc_tipo}</ar:DocTipo>` +
      `<ar:DocNro>${p.doc_nro}</ar:DocNro>` +
      `<ar:CbteDesde>${nro}</ar:CbteDesde>` +
      `<ar:CbteHasta>${nro}</ar:CbteHasta>` +
      `<ar:CbteFch>${fch}</ar:CbteFch>` +
      `<ar:ImpTotal>${p.imp_total}</ar:ImpTotal>` +
      `<ar:ImpTotConc>${p.imp_tot_conc ?? 0}</ar:ImpTotConc>` +
      `<ar:ImpNeto>${p.imp_neto}</ar:ImpNeto>` +
      `<ar:ImpOpEx>${p.imp_op_ex ?? 0}</ar:ImpOpEx>` +
      `<ar:ImpTrib>${p.imp_trib ?? 0}</ar:ImpTrib>` +
      `<ar:ImpIVA>${p.imp_iva}</ar:ImpIVA>` +
      `<ar:MonId>PES</ar:MonId><ar:MonCotiz>1</ar:MonCotiz>` +
      `<ar:CondicionIVAReceptorId>${p.cond_iva_receptor}</ar:CondicionIVAReceptorId>` +
      (p.iva.length ? `<ar:Iva>${ivaXml}</ar:Iva>` : ``) +
    `</ar:FECAEDetRequest>`;

  const body =
    `<ar:FECAESolicitar>${authXml(ta, f.cuit)}` +
      `<ar:FeCAEReq>` +
        `<ar:FeCabReq><ar:CantReg>1</ar:CantReg>` +
        `<ar:PtoVta>${f.pos_number}</ar:PtoVta>` +
        `<ar:CbteTipo>${p.cbte_tipo}</ar:CbteTipo></ar:FeCabReq>` +
        `<ar:FeDetReq>${det}</ar:FeDetReq>` +
      `</ar:FeCAEReq>` +
    `</ar:FECAESolicitar>`;

  const xml = await callWSFE(f.environment, "FECAESolicitar", body);
  const resultado = extractTag(xml, "Resultado");
  const cae = extractTag(xml, "CAE");
  const caeVto = extractTag(xml, "CAEFchVto");
  const obs = extractTag(xml, "Observaciones");
  const errs = extractTag(xml, "Errors");

  if (resultado !== "A" || !cae) {
    return { ok: false, resultado, observaciones: obs, errores: errs, raw: xml };
  }
  return { ok: true, cae, cae_vto: caeVto, nro, pos_number: f.pos_number };
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------
Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });
  try {
    const jwt = (req.headers.get("Authorization") ?? "").replace("Bearer ", "");
    const { data: userData, error: userErr } = await supabase.auth.getUser(jwt);
    if (userErr || !userData?.user) {
      return new Response(JSON.stringify({ error: "No autorizado" }), { status: 401 });
    }

    const { data: profile } = await supabase
      .from("user_profiles")
      .select("store_id, role")
      .eq("id", userData.user.id)
      .single();
    if (!profile?.store_id) {
      return new Response(JSON.stringify({ error: "Usuario sin tienda" }), { status: 403 });
    }

    const payload = (await req.json()) as InvoicePayload;
    const fiscal = await getStoreFiscal(profile.store_id);
    const ta = await ensureTA(profile.store_id, fiscal);
    const result = await solicitarCAE(ta, fiscal, payload);

    return new Response(JSON.stringify(result), {
      status: result.ok ? 200 : 422,
      headers: { "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), { status: 500 });
  }
});
