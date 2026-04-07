import PipelineBoard from "@/components/PipelineBoard";

export default function Operacao() {
  return (
    <PipelineBoard
      pipeline="operacao"
      title="Operação (Entrega)"
      subtitle="Sucesso do Cliente"
      showAddLead={false}
      showImport={false}
    />
  );
}
