// Analisador de anexos (imagens, prints, PDFs, documentos) — sob demanda.
// Nunca é chamado automaticamente. Áudios NÃO devem ser enviados aqui.

import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { callAI } from '../_shared/ai-router.ts';

const SYSTEM = `Você é o LEITOR DE ANEXOS da Performance21.
Analise o arquivo enviado (imagem, print de tela, PDF ou documento) no contexto do Lead.
Português (Brasil). Objetivo, escaneável em 30 segundos.

Responda em Markdown com:
- **Resumo** (2-4 linhas): o que é este arquivo.
- **Dados relevantes**: bullets curtos com números, nomes, valores, datas encontrados.
- **Sinais comerciais**: o que isso indica sobre interesse/objeção/oportunidade.
- **Próxima ação sugerida**: 1 linha acionável.

Se o arquivo for ilegível ou irrelevante, diga isso explicitamente em 1 linha.`;

interface Body {
  attachment: { name: string; type: string; dataUrl: string };
  leadContext?: string; // texto curto opcional com dados básicos do lead
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const { attachment, leadContext } = (await req.json()) as Body;
    if (!attachment?.dataUrl || !attachment?.type) {
      return new Response(JSON.stringify({ error: 'attachment inválido' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    if (attachment.type.startsWith('audio/')) {
      return new Response(JSON.stringify({ error: 'Áudios não são enviados para análise (política de custo). Use os resumos da Matteline.' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const isImage = attachment.type.startsWith('image/');
    const isPdf = attachment.type === 'application/pdf' || /\.pdf$/i.test(attachment.name);

    const textBlock = {
      type: 'text',
      text: `Contexto do Lead:\n${leadContext ?? '(sem contexto extra)'}\n\nArquivo: ${attachment.name} (${attachment.type})\n\nLeia o conteúdo abaixo e responda no formato pedido.`,
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
    const msg = (e as Error)?.message ?? 'erro desconhecido';
    return new Response(JSON.stringify({ error: msg }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
