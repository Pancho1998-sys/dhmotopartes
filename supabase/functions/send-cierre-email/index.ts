// supabase/functions/send-cierre-email/index.ts
//
// Recibe los datos resumidos del Cierre de Caja (Turno) y envía un correo electrónico
// formateado en HTML al correo institucional dhmotopartes@gmail.com o destinatario indicado.

import { createClient } from "npm:@supabase/supabase-js@2";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL") || "",
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || ""
);

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface ClosurePayload {
  closureId: string;
  closureNumber: number;
  date: string;
  openedAt: string;
  closedBy: string;
  cashierName?: string;
  storeName?: string;
  initialBalance: number;
  cashSales: number;
  cashSalesCount: number;
  otherSales: number;
  inflows: number;
  inflowsCount: number;
  outflows: number;
  outflowsCount: number;
  voidsTotal: number;
  expectedCash: number;
  actualCash: number;
  difference: number;
  notes?: string;
  targetEmail: string;
  currency?: string;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405, headers: corsHeaders });
  }

  try {
    const payload = (await req.json()) as ClosurePayload;
    const {
      closureId,
      closureNumber,
      date,
      openedAt,
      closedBy,
      cashierName,
      storeName = "DH Motopartes",
      initialBalance = 0,
      cashSales = 0,
      cashSalesCount = 0,
      otherSales = 0,
      inflows = 0,
      outflows = 0,
      voidsTotal = 0,
      expectedCash = 0,
      actualCash = 0,
      difference = 0,
      notes = "",
      targetEmail = "dhmotopartes@gmail.com",
      currency = "$",
    } = payload;

    const formattedDate = new Date(date).toLocaleString("es-ES", { dateStyle: "full", timeStyle: "medium" });
    const formattedOpened = openedAt ? new Date(openedAt).toLocaleString("es-ES", { dateStyle: "short", timeStyle: "short" }) : "N/A";
    const diffStatusText = difference === 0 ? "CAJA CUADRADA ($0.00)" : difference > 0 ? `SOBRANTE (+${currency}${difference.toFixed(2)})` : `FALTANTE (-${currency}${Math.abs(difference).toFixed(2)})`;
    const diffColor = difference === 0 ? "#10b981" : difference > 0 ? "#3b82f6" : "#ef4444";

    const subject = `[Cierre de Caja #${closureNumber}] ${storeName} - ${new Date(date).toLocaleDateString("es-ES")}`;

    const htmlBody = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <style>
          body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #0f172a; color: #f8fafc; margin: 0; padding: 20px; }
          .container { max-width: 600px; margin: 0 auto; background: #1e293b; border-radius: 12px; padding: 25px; border: 1px solid #334155; }
          .header { text-align: center; border-bottom: 2px solid #3b82f6; padding-bottom: 15px; margin-bottom: 20px; }
          .header h2 { color: #38bdf8; margin: 0; font-size: 22px; }
          .header p { color: #94a3b8; margin: 5px 0 0 0; font-size: 13px; }
          .badge-diff { display: inline-block; padding: 8px 16px; border-radius: 20px; font-weight: bold; color: white; background-color: ${diffColor}; margin-top: 10px; font-size: 14px; }
          .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 20px; }
          .card { background: #0f172a; padding: 12px; border-radius: 8px; border: 1px solid #334155; }
          .card-title { font-size: 11px; text-transform: uppercase; color: #94a3b8; margin-bottom: 4px; }
          .card-value { font-size: 18px; font-weight: bold; color: #f8fafc; }
          .card-value.highlight { color: #10b981; }
          .card-value.danger { color: #ef4444; }
          .details-table { width: 100%; border-collapse: collapse; margin-bottom: 20px; font-size: 14px; }
          .details-table th, .details-table td { padding: 10px; text-align: left; border-bottom: 1px solid #334155; }
          .details-table th { background: #0f172a; color: #94a3b8; }
          .details-table td.right { text-anchor: end; text-align: right; font-weight: bold; }
          .notes-box { background: #0f172a; border-left: 4px solid #3b82f6; padding: 12px; margin-bottom: 20px; border-radius: 4px; font-style: italic; color: #cbd5e1; }
          .footer { text-align: center; color: #64748b; font-size: 12px; border-top: 1px solid #334155; padding-top: 15px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h2>🔒 REPORTE DE CIERRE DE CAJA #${closureNumber}</h2>
            <p>${storeName} | ${formattedDate}</p>
            <div class="badge-diff">${diffStatusText}</div>
          </div>

          <div style="font-size: 13px; color: #cbd5e1; margin-bottom: 15px;">
            <strong>Cajero / Usuario:</strong> ${cashierName || closedBy} (${closedBy})<br>
            <strong>Inicio de Turno:</strong> ${formattedOpened}<br>
            <strong>Folio Cierre:</strong> ${closureId}
          </div>

          <table class="details-table">
            <thead>
              <tr><th>Concepto de Caja</th><th style="text-align:right;">Monto</th></tr>
            </thead>
            <tbody>
              <tr><td>Monto Inicial / Apertura</td><td class="right">${currency}${initialBalance.toFixed(2)}</td></tr>
              <tr><td>Ventas en Efectivo (${cashSalesCount} transacciones)</td><td class="right" style="color: #10b981;">+${currency}${cashSales.toFixed(2)}</td></tr>
              <tr><td>Otros Ingresos Manuales</td><td class="right" style="color: #10b981;">+${currency}${inflows.toFixed(2)}</td></tr>
              <tr><td>Egresos / Retiros Manuales</td><td class="right" style="color: #ef4444;">-${currency}${outflows.toFixed(2)}</td></tr>
              <tr><td>Anulaciones en Efectivo</td><td class="right" style="color: #ef4444;">-${currency}${voidsTotal.toFixed(2)}</td></tr>
              <tr style="background: #0f172a; font-weight: bold;">
                <td style="color: #38bdf8;">EFECTIVO TEÓRICO ESPERADO</td>
                <td class="right" style="color: #38bdf8; font-size: 16px;">${currency}${expectedCash.toFixed(2)}</td>
              </tr>
              <tr style="background: #0f172a; font-weight: bold;">
                <td>EFECTIVO REAL EN CAJA (CONTEO)</td>
                <td class="right" style="font-size: 16px;">${currency}${actualCash.toFixed(2)}</td>
              </tr>
              <tr>
                <td>DIFERENCIA (ARQUEO)</td>
                <td class="right" style="color: ${diffColor}; font-size: 16px;">${difference >= 0 ? '+' : ''}${currency}${difference.toFixed(2)}</td>
              </tr>
            </tbody>
          </table>

          ${otherSales > 0 ? `
          <div style="background: #0f172a; padding: 10px; border-radius: 6px; margin-bottom: 15px; font-size: 13px;">
            <span style="color: #94a3b8;">Ventas en Otros Medios (Transferencia/Tarjeta/MercadoPago):</span>
            <strong style="color: #f8fafc; float: right;">${currency}${otherSales.toFixed(2)}</strong>
          </div>
          ` : ''}

          ${notes ? `
          <div class="card-title">OBSERVACIONES DEL CAJERO:</div>
          <div class="notes-box">${notes}</div>
          ` : ''}

          <div class="footer">
            DH Motopartes - Sistema de Gestión de Ventas y Control de Caja<br>
            Este informe fue generado automáticamente al realizar el Cierre de Caja.
          </div>
        </div>
      </body>
      </html>
    `;

    // Resend / Email Service dispatch if RESEND_API_KEY is configured in Supabase Secrets
    const resendApiKey = Deno.env.get("RESEND_API_KEY");
    let emailSentSuccessfully = false;

    if (resendApiKey) {
      const resendRes = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${resendApiKey}`,
        },
        body: JSON.stringify({
          from: `${storeName} <cierre@dhmotopartes.com>`,
          to: [targetEmail],
          subject: subject,
          html: htmlBody,
        }),
      });

      if (resendRes.ok) {
        emailSentSuccessfully = true;
      } else {
        const resErr = await resendRes.text();
        console.warn("Resend API attempt response:", resErr);
      }
    }

    return new Response(
      JSON.stringify({
        status: "success",
        message: emailSentSuccessfully
          ? `Correo enviado exitosamente a ${targetEmail}`
          : `Reporte de cierre procesado. Notificación lista para ${targetEmail}`,
        emailSent: emailSentSuccessfully,
        subject: subject,
        targetEmail: targetEmail,
        htmlReport: htmlBody,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: any) {
    console.error("Error en send-cierre-email edge function:", err);
    return new Response(
      JSON.stringify({ error: err.message || "Error al procesar envío de correo" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
