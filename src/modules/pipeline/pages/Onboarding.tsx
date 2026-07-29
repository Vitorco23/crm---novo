import PipelineBoard from "@/modules/pipeline/components/PipelineBoard";

export default function Onboarding() {
  return (
    <PipelineBoard
      pipeline="onboarding"
      title="Onboarding"
      subtitle="Implantação de Clientes"
      showAddLead={false}
      showImport={false}
    />
  );
}
