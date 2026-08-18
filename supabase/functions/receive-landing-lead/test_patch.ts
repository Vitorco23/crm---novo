
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const WEBHOOK_SECRET = Deno.env.get("LANDING_WEBHOOK_SECRET")!;
const FUNCTION_URL = `${SUPABASE_URL}/functions/v1/receive-landing-lead`;

async function testPatch() {
  console.log("--- Starting PATCH Test ---");
  
  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE);
  
  // 1. Encontrar um lead real para testar
  const { data: lead, error: fetchErr } = await supabase
    .from("leads_inbound")
    .select("id, dados")
    .order("created_at", { ascending: false })
    .limit(1)
    .single();
    
  if (fetchErr || !lead) {
    console.error("Erro ao buscar lead de teste:", fetchErr);
    return;
  }
  
  console.log(`Testando com Lead ID: ${lead.id}`);
  
  // 2. Tentar o PATCH
  const payload = {
    leadId: lead.id,
    segmento: "Teste Automatizado",
    faturamento: "R$ 100k+",
    funcionarios: "10-50",
    desafio: "Validar endpoint PATCH",
    periodo_contato: "Manhã",
    update: true
  };
  
  console.log("Enviando requisição PATCH para:", FUNCTION_URL);
  const start = Date.now();
  
  try {
    const res = await fetch(FUNCTION_URL, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        "x-webhook-secret": WEBHOOK_SECRET
      },
      body: JSON.stringify(payload)
    });
    
    const duration = Date.now() - start;
    const status = res.status;
    const body = await res.json();
    
    console.log(`Status HTTP: ${status}`);
    console.log(`Duração: ${duration}ms`);
    console.log("Resposta JSON:", JSON.stringify(body, null, 2));
    
    if (status === 200 && body.ok) {
      // 3. Verificar no banco se atualizou
      const { data: updatedLead } = await supabase
        .from("leads_inbound")
        .select("dados")
        .eq("id", lead.id)
        .single();
        
      const notes = updatedLead?.dados?.notes || "";
      if (notes.includes("--- Diagnóstico P21 ---")) {
        console.log("Confirmação: Notas atualizadas no banco com sucesso.");
      } else {
        console.error("Erro: Notas NÃO encontradas no banco após sucesso aparente.");
      }
    }
  } catch (err) {
    console.error("Erro na requisição fetch:", err);
  }
}

testPatch();
