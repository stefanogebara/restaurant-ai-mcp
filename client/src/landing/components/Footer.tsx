export default function Footer() {
  const currentYear = new Date().getFullYear();

  return (
    <footer className="flex items-center justify-between px-6 sm:px-16 py-16 border-t border-border-gray">
      <div className="font-serif text-xl font-semibold text-deep-charcoal">
        seatable<span className="text-burgundy">.</span>
      </div>
      <p className="text-[13px] text-muted-stone">
        &copy; {currentYear} Seatable. All rights reserved.
      </p>
    </footer>
  );
}
