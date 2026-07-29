// Analisador de anexos (imagens, prints, PDFs, documentos) — sob demanda.
// Nunca é chamado automaticamente. Áudios NÃO devem ser enviados aqui.

import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { callAI } from '../_shared/ai-router.ts';
import { createMemoryEngine } from "../_shared/ai-core/index.ts";
import { requireUser } from '../_shared/require-auth.ts';
import {
  UNTRUSTED_INPUT_SYSTEM_CLAUSE,
  wrapUntrusted,
  sanitizeExternal,
} from '../_shared/untrusted-input.ts';


// Limite máximo do payload total (bytes). ~15MB acomoda dataUrls base64 típicos
// de imagens/PDFs de leitura, com margem sobre o limite de 10MB do arquivo bruto.
const MAX_PAYLOAD_BYTES = 15 * 1024 * 1024;
const MAX_DATAURL_CHARS = 14 * 1024 * 1024;

const SYSTEM = `Você é o LEITOR DE ANEXOS da Performance21.
Analise o arquivo enviado (imagem, print de tela, PDF ou documento) no contexto do Lead.
Português (Brasil). Objetivo, escaneável em 30 segundos.

Responda em Markdown com:
- **Resumo** (2-4 linhas): o que é este arquivo.
- **Dados relevantes**: bullets curtos com números, nomes, valores, datas encontrados.
- **Sinais comerciais**: o que isso indica sobre interesse/objeção/oportunidade.
- **Próxima ação sugerida**: 1 linha acionável.

Se o arquivo for ilegível ou irrelevante, diga isso explicitamente em 1 linha.

${UNTRUSTED_INPUT_SYSTEM_CLAUSE}
`;


interface Body {
  attachment: { name: string; type: string; dataUrl: string };
  leadContext?: string; // texto curto opcional com dados básicos do lead
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const auth = await requireUser(req, corsHeaders);
  if (!auth.ok) return auth.response;

  // Rejeita payloads acima do limite antes de parsear JSON completo.
  const contentLength = Number(req.headers.get('content-length') ?? '0');
  if (contentLength && contentLength > MAX_PAYLOAD_BYTES) {
    return new Response(JSON.stringify({ error: 'Anexo excede o tamanho máximo permitido (15MB).' }), {
      status: 413, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  try {
    const { attachment, leadContext } = (await req.json()) as Body;
    if (!attachment?.dataUrl || !attachment?.type) {
      return new Response(JSON.stringify({ error: 'attachment inválido' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    if (typeof attachment.dataUrl === 'string' && attachment.dataUrl.length > MAX_DATAURL_CHARS) {
      return new Response(JSON.stringify({ error: 'Anexo excede o tamanho máximo permitido (15MB).' }), {
        status: 413, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    if (attachment.type.startsWith('audio/')) {
      return new Response(JSON.stringify({ error: 'Áudios não são enviados para análise (política de custo). Use os resumos da Matteline.' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const isImage = attachment.type.startsWith('image/');
    const isPdf = attachment.type === 'application/pdf' || /\.pdf$/i.test(attachment.name);

    const memory = createMemoryEngine();
    const { block: memoryBlock } = await memory.get({
      scope: "global",
      queryText: `Leitura de anexo. ${leadContext ?? ""}`.slice(0, 2000),
      matchCount: 3,
      minSimilarity: 0.5,
      includePatterns: true,
    });

    const leadContextSafe = sanitizeExternal(leadContext ?? '(sem contexto extra)', 4000);
    const textBlock = {
      type: 'text',
      text: `${memoryBlock ? memoryBlock + "\n\n" : ""}${wrapUntrusted(leadContextSafe, { maxChars: 4000, label: 'CONTEXTO DO LEAD' })}\n\nArquivo: ${attachment.name} (${attachment.type})\n\nLeia o conteúdo abaixo e responda no formato pedido.`,
    };


    let fileBlock: Record<string, unknown>;
    if (isImage) {
      fileBlock = { type: 'image_url', image_url: { url: attachment.dataUrl } };
    } else if (isPdf) {
      fileBlock = {
        type: 'file',
        file: { filename: attachment.name || 'anexo.pdf', file_data: attachment.dataUrl },
      };
    } else {
      // outros documentos: envia como file — se o modelo não aceitar, o AI Router faz fallback.
      fileBlock = {
        type: 'file',
        file: { filename: attachment.name || 'anexo', file_data: attachment.dataUrl },
      };
    }

    const result = await callAI({
      task: 'analyze_attachment',
      system: SYSTEM,
      user: '',
      userContent: [textBlock, fileBlock],
      forceComplex: isPdf, // PDFs vão direto no tier que aceita file blocks (OpenAI)
      temperature: 0.2,
      maxTokens: 1500,
      timeoutMs: 60000,
    });

    return new Response(JSON.stringify({
      content: result.content,
      modelUsed: result.modelUsed,
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (e) {
    console.error(JSON.stringify({ evt: "analyze_attachment_error", msg: (e as Error)?.message }));
    return new Response(JSON.stringify({ error: 'internal_error' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

});
