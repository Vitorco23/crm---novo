
import { CONSULTOR_CORE, DIRETOR_CHAT_SYSTEM, CONSULTOR_SYSTEM, MENTOR_SYSTEM } from "./prompt-registry.ts";

function testAdaptability() {
  console.log("--- TESTANDO ADAPTABILIDADE ---");
  console.log("CONSULTOR_CORE contém regra de tamanho adaptativo?", CONSULTOR_CORE.includes("REGRA DE TAMANHO ADAPTATIVO"));
  console.log("DIRETOR_CHAT_SYSTEM contém perfil Diretor?", DIRETOR_CHAT_SYSTEM.includes("Diretor Comercial"));
  console.log("CONSULTOR_SYSTEM contém perfil Consultor?", CONSULTOR_SYSTEM.includes("Consultor de Leads"));
  console.log("MENTOR_SYSTEM contém perfil Mentor?", MENTOR_SYSTEM.includes("Mentor P21"));
  
  const rules = [
    "começar respondendo diretamente",
    "evitar introduções",
    "Não utilize templates fixos",
    "tamanho da sua resposta deve acompanhar estritamente a complexidade"
  ];
  
  rules.forEach(rule => {
    console.log(`Regra [${rule}] presente?`, CONSULTOR_CORE.toLowerCase().includes(rule.toLowerCase()));
  });
}

testAdaptability();
