import { AIBar } from "@/components/home/AIBar";
import { residentHome } from "@/mocks/resident-home";

export default function ResidentAiPage() {
  return (
    <section>
      <h1 className="text-[32px] tracking-[-0.03em] text-ink">AI STAR HOME</h1>
      <p className="mt-2 max-w-md text-[15px] text-muted">Спросите о доме. Действие выполняется только после подтверждения.</p>
      <div className="mt-8">
        <AIBar prompt={residentHome.aiPrompt} />
      </div>
    </section>
  );
}
