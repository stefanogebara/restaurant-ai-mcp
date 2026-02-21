export default function SocialProofSection() {
  return (
    <section className="py-16 px-6 sm:px-16 text-center border-y border-border-gray">
      <p className="text-xs font-semibold tracking-[2px] uppercase text-muted-stone mb-8">
        Trusted by restaurants across Europe
      </p>
      <div className="flex justify-center gap-14 items-center opacity-40">
        {['NOBU', 'ARZAK', 'CELERI', 'NOMA', 'CELLER'].map((name) => (
          <span key={name} className="text-xl font-bold text-stone-gray tracking-wider hidden sm:block">
            {name}
          </span>
        ))}
        {/* Mobile: show fewer */}
        {['NOBU', 'CELERI', 'NOMA'].map((name) => (
          <span key={`m-${name}`} className="text-lg font-bold text-stone-gray tracking-wider sm:hidden">
            {name}
          </span>
        ))}
      </div>
    </section>
  );
}
