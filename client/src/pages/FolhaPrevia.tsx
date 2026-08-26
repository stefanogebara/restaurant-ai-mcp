import { useState } from 'react';
import { FolhaDeConfirmacao } from '../components/onboarding/folha/FolhaDeConfirmacao';
import OnboardingStepSidebar from '../components/onboarding/OnboardingStepSidebar';
import type { Preset } from '../lib/personaProposta';
import type { OnboardingData } from '../types/onboarding.types';

/**
 * Prévia da folha de confirmação, para revisão de design.
 *
 * SÓ EXISTE EM DESENVOLVIMENTO — o App só registra esta rota sob
 * `import.meta.env.DEV`. A folha de verdade mora atrás de `/onboarding`, que é
 * `ProtectedRoute`; sem uma prévia aberta não há como olhar o layout sem
 * completar um cadastro real.
 *
 * Os dados são de um restaurante real e público (Mocotó), no formato exato que
 * o banco guarda — inclusive o e-mail placeholder do demo, que é justamente o
 * caso que a folha precisa tratar como AUSENTE.
 */

const DADOS = {
  restaurant_name: 'Mocotó Bar e Restaurante',
  city: 'São Paulo',
  restaurant_type: 'Brazilian',
  country: 'BR',
  phone_number: '(11) 2951-4121',
  // O placeholder que o demo grava para satisfazer o NOT NULL. A folha tem que
  // contá-lo como vazio — quem tem esse endereço não recebe reserva nenhuma.
  email: 'mocoto@demo.seatable.one',
  business_hours: [
    { day: 'Tuesday', is_open: true, open_time: '12:00', close_time: '23:00' },
    { day: 'Wednesday', is_open: true, open_time: '12:00', close_time: '23:00' },
    { day: 'Thursday', is_open: true, open_time: '12:00', close_time: '23:00' },
    { day: 'Friday', is_open: true, open_time: '12:00', close_time: '00:00' },
    { day: 'Saturday', is_open: true, open_time: '12:00', close_time: '00:00' },
  ],
} as unknown as OnboardingData;

const VIBE_TAGS = ['casual', 'traditional', 'lively', 'family-friendly'];

export default function FolhaPrevia() {
  const [data, setData] = useState<OnboardingData>(DADOS);
  const [voz, setVoz] = useState<Preset | null>(null);
  const [enviado, setEnviado] = useState(false);

  return (
    <div className="min-h-screen">
      <p className="text-center text-[12px] font-semibold uppercase tracking-[0.14em] text-amber-700 bg-amber-50 border-b border-amber-200 py-2">
        Prévia de design · só em desenvolvimento
      </p>

      <FolhaDeConfirmacao
        data={data}
        updateData={(u) => setData((d) => ({ ...d, ...u }))}
        vibeTags={VIBE_TAGS}
        vozEscolhida={voz}
        onEscolherVoz={setVoz}
        onConcluir={() => setEnviado(true)}
        veioDoDemo={false}
      />

      {/* A barra de passos, para conferir que o wizard perdeu o sexto. Ela
          tinha uma CÓPIA própria do array de passos — sem unificar, mostraria
          um "Ensine sua IA" que ninguém consegue alcançar. */}
      <div className="max-w-[620px] mx-auto px-6 pb-32">
        <p className="text-[12px] font-semibold uppercase tracking-[0.14em] text-muted-stone mb-3">
          Passos do formulário (alternativa)
        </p>
        <OnboardingStepSidebar currentStep={1} goToStep={() => {}} />
      </div>

      {enviado && (
        <p className="fixed bottom-24 left-1/2 -translate-x-1/2 bg-deep-charcoal text-white text-[14px] px-4 py-2 rounded-xl">
          Enviaria: {JSON.stringify({ voz, email: data.email })}
        </p>
      )}
    </div>
  );
}
