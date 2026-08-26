/**
 * Os passos do wizard, numa fonte só.
 *
 * O array vivia DUPLICADO em `pages/Onboarding.tsx` e em
 * `OnboardingStepSidebar.tsx`. Ao tirar o "Ensine sua IA" do fluxo (ago/2026)
 * a página passou a ter cinco passos e a barra lateral continuaria listando
 * seis — um passo inalcançável desenhado na tela, que é exatamente o tipo de
 * divergência que duas cópias produzem sozinhas.
 */
export const STEP_NAME_KEYS = [
  'onboarding.stepName1',
  'onboarding.stepName2',
  'onboarding.stepName3',
  'onboarding.stepName4',
  'onboarding.stepName5',
] as const;

export const TOTAL_STEPS = STEP_NAME_KEYS.length;
