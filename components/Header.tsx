export default function Header() {
  return (
    <header className="bg-white shadow-sm sticky top-0 z-50">
      <div className="container mx-auto px-4 py-4 flex justify-between items-center">
        <div className="flex items-center space-x-2">
          <div className="w-10 h-10 bg-indigo-600 rounded-full flex items-center justify-center text-white font-bold text-lg">
            A
          </div>
          <h1 className="text-2xl font-bold text-indigo-700">ATAYATOKO</h1>
        </div>

        <nav className="hidden md:flex space-x-6">
          <a href="#" className="font-medium hover:text-indigo-600">Beranda</a>
          <a href="#" className="font-medium hover:text-indigo-600">Produk</a>
          <a href="#" className="font-medium hover:text-indigo-600">Promo</a>
          <a href="#" className="font-medium hover:text-indigo-600">Bantuan</a>
        </nav>

        <button className="bg-indigo-600 text-white px-4 py-2 rounded-full">
          Masuk / Daftar
        </button>
      </div>
    </header>
  );
}
