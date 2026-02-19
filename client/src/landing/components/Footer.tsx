export default function Footer() {
  const currentYear = new Date().getFullYear();

  return (
    <footer className="flex items-center justify-between px-6 sm:px-16 py-16 border-t border-[#E7E5E4]">
      <div className="font-serif text-xl font-semibold text-[#1C1917]">
        seatable<span className="text-[#9F1239]">.</span>
      </div>
      <p className="text-[13px] text-[#A8A29E]">
        &copy; {currentYear} Seatable. All rights reserved.
      </p>
    </footer>
  );
}
