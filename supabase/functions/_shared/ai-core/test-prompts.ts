import { getPrompt } from "./prompt-registry.ts";

function testAdaptability() {
  console.log("--- TESTANDO ADAPTABILIDADE ---");
  
  const diretorPrompt = getPrompt("intel.diretor.chat").system;
  const consultorPrompt = getPrompt("intel.consultor.chat").system;
  const mentorPrompt = getPrompt("intel.mentor.chat").system;

  console.log("Diretor prompt contém perfil Diretor?", diretorPrompt.includes("Diretor Comercial"));
  console.log("Consultor prompt contém perfil Consultor?", consultorPrompt.includes("Consultor de Leads"));
  console.log("Mentor prompt contém perfil Mentor?", mentorPrompt.includes("Mentor P21"));
  
  const rules = [
    "começar respondendo diretamente",
    "evitar introduções",
    "Não utilize templates fixos",
    "tamanho da sua resposta deve acompanhar estritamente a complexidade"
  ];
  
  rules.forEach(rule => {
    console.log(`Regra [${rule}] presente no Diretor?`, diretorPrompt.toLowerCase().includes(rule.toLowerCase()));
  });
}

testAdaptability();
