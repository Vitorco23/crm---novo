import PipelineBoard from "@/components/PipelineBoard";

export default function Oportunidades() {
  return (
    <PipelineBoard
      pipeline="oportunidades"
      title="Oportunidades"
      subtitle="Pipeline de Vendas"
      showAddLead={false}
      showImport={false}
    />
  );
}
