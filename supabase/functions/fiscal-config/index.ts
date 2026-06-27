// supabase/functions/fiscal-config/index.ts
//
// Alta o rotacion de la configuracion fiscal de una tienda.
// El superadmin/admin sube cert + key UNA vez (y al renovar cada ~2 anios).
// La clave se guarda CIFRADA en Vault via el RPC upsert_fiscal_config;
// nunca se devuelve al frontend ni se guarda en una columna en texto plano.

import { createClient } from "npm:@supabase/supabase-js@2";
import forge from "npm:node-forge@1";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

interface UploadPayload {
  cuit: string;
  pos_number: number;
  iva_condition: string;       // ej: "RI", "MT", "EX"
  environment: string;        // "homologacion" | "produccion"
  certificate_pem: string;    // certificado X.509 (publico)
  private_key_pem: string;    // clave privada (se cifra en Vault)
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });
  try {
    // 1) Autenticar y exigir rol admin/superadmin.
    const jwt = (req.headers.get("Authorization") ?? "").replace("Bearer ", "");
    const { data: userData, error: uErr } = await supabase.auth.getUser(jwt);
    if (uErr || !userData?.user) {
      return new Response(JSON.stringify({ error: "No autorizado" }), { status: 401 });
    }
    const { data: profile } = await supabase
      .from("user_profiles")
      .select("store_id, role")
      .eq("id", userData.user.id)
      .single();
    if (!profile?.store_id || !["admin", "superadmin"].includes(profile.role)) {
      return new Response(JSON.stringify({ error: "Permisos insuficientes" }), { status: 403 });
    }

    const body = (await req.json()) as UploadPayload;

    // 2) Validar cert + key y extraer el vencimiento del certificado.
    let certExpiresAt: string | null = null;
    try {
      const cert = forge.pki.certificateFromPem(body.certificate_pem);
      forge.pki.privateKeyFromPem(body.private_key_pem); // tira error si la key es invalida
      certExpiresAt = cert.validity.notAfter.toISOString();
    } catch {
      return new Response(JSON.stringify({ error: "Certificado o clave invalidos (PEM)" }), { status: 422 });
    }

    // 3) Guardar via RPC (cifra la clave en Vault, upsertea la tienda).
    const { error: rpcErr } = await supabase.rpc("upsert_fiscal_config", {
      p_store_id: profile.store_id,
      p_cuit: body.cuit,
      p_pos_number: body.pos_number,
      p_iva_condition: body.iva_condition,
      p_environment: body.environment ?? "homologacion",
      p_certificate: body.certificate_pem,
      p_private_key: body.private_key_pem,
      p_cert_expires_at: certExpiresAt,
    });
    if (rpcErr) throw rpcErr;

    // 4) Respuesta SIN la clave.
    return new Response(
      JSON.stringify({
        ok: true,
        cuit: body.cuit,
        pos_number: body.pos_number,
        environment: body.environment ?? "homologacion",
        cert_expires_at: certExpiresAt,
      }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), { status: 500 });
  }
});
