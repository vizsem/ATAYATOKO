// pages/index.js
import Head from 'next/head';
import { useEffect } from 'react';

export default function Home() {
  useEffect(() => {
    const products = [
      {
        id: 1,
        name: "Indomie Goreng",
        category: "makanan",
        image: "https://placehold.co/300x300/f3f4f6/9ca3af?text=Indomie+Goreng",
        priceEcer: 3500,
        priceGrosir: 2800,
        unitGrosir: "dus (48 pcs)",
        stockEcer: 500,
        stockGrosir: 20
      },
      {
        id: 2,
        name: "Aqua 600ml",
        category: "minuman",
        image: "https://placehold.co/300x300/f3f4f6/9ca3af?text=Aqua+600ml",
        priceEcer: 4000,
        priceGrosir: 3200,
        unitGrosir: "dus (24 pcs)",
        stockEcer: 300,
        stockGrosir: 15
      },
      {
        id: 3,
        name: "Sari Roti Tawar",
        category: "makanan",
        image: "https://placehold.co/300x300/f3f4f6/9ca3af?text=Sari+Roti",
        priceEcer: 12000,
        priceGrosir: 9500,
        unitGrosir: "kardus (20 pcs)",
        stockEcer: 200,
        stockGrosir: 10
      },
      {
        id: 4,
        name: "Lifebuoy Sabun Mandi",
        category: "perawatan",
        image: "https://placehold.co/300x300/f3f4f6/9ca3af?text=Lifebuoy",
        priceEcer: 5500,
        priceGrosir: 4200,
        unitGrosir: "dus (36 pcs)",
        stockEcer: 150,
        stockGrosir: 8
      }
    ];

    let currentRole = 'pembeli';

    function formatRupiah(angka) {
      return new Intl.NumberFormat('id-ID', {
        style: 'currency',
        currency: 'IDR',
        minimumFractionDigits: 0
      }).format(angka);
    }

    function displayProducts(category = 'all') {
      const container = document.getElementById('productsContainer');
      if (!container) return;

      const filtered = category === 'all'
        ? products
        : products.filter(p => p.category === category);

      container.innerHTML = '';
      filtered.forEach(product => {
        const price = currentRole === 'pembeli' ? product.priceEcer : product.priceGrosir;
        const stock = currentRole === 'pembeli' ? product.stockEcer : product.stockGrosir;
        const unit = currentRole === 'pembeli' ? 'pcs' : product.unitGrosir;
        const stockColor = stock < 10 ? 'text-red-600' : 'text-green-600';

        const card = document.createElement('div');
        card.className = 'bg-white rounded-xl overflow-hidden shadow-md';
        card.innerHTML = `
          <img src="${product.image}" alt="${product.name}" class="w-full h-48 object-cover">
          <div class="p-4">
            <h3 class="font-semibold text-sm mb-2">${product.name}</h3>
            <div class="space-y-1 text-xs">
              <div>
                <span class="text-gray-600">Harga:</span> 
                <span class="text-indigo-600 font-bold">${formatRupiah(price)}</span>
                <span class="text-gray-500 ml-1">/${unit}</span>
              </div>
              <div>
                <span class="text-gray-600">Stok:</span> 
                <span class="${stockColor} font-medium">${stock} ${unit}</span>
              </div>
            </div>
            <button class="buy-btn mt-3 w-full bg-indigo-600 text-white py-2 rounded-lg text-sm"
                    data-id="${product.id}" data-price="${price}" data-name="${product.name}" data-unit="${unit}">
              Tambah ke Keranjang
            </button>
          </div>
        `;
        container.appendChild(card);
      });

      document.querySelectorAll('.buy-btn').forEach(btn => {
        btn.onclick = () => {
          alert('Produk ditambahkan! (Demo)');
        };
      });
    }

    function updateRoleUI() {
      const el = document.getElementById('currentRoleText');
      if (el) {
        el.textContent = currentRole === 'pembeli' ? 'Pembeli (Eceran)' : 'Reseller (Grosir)';
      }
      displayProducts();
    }

    const rolePembeli = document.getElementById('rolePembeli');
    const roleReseller = document.getElementById('roleReseller');
    if (rolePembeli) rolePembeli.onclick = () => { currentRole = 'pembeli'; updateRoleUI(); };
    if (roleReseller) roleReseller.onclick = () => { currentRole = 'reseller'; updateRoleUI(); };

    document.querySelectorAll('.category-btn').forEach(btn => {
      btn.onclick = () => {
        document.querySelectorAll('.category-btn').forEach(b => b.classList.remove('bg-indigo-600', 'text-white'));
        btn.classList.add('bg-indigo-600', 'text-white');
        displayProducts(btn.dataset.category);
      };
    });

    updateRoleUI();
    document.querySelector('.category-btn[data-category="all"]').classList.add('bg-indigo-600', 'text-white');
  }, []);

  return (
    <>
      <Head>
        <title>ATAYATOKO - Sudah Online, Siap Bisnis</title>
        <meta name="description" content="Sistem integrasi usaha untuk mini market & reseller" />
        <link href="https://cdn.jsdelivr.net/npm/tailwindcss@2.2.19/dist/tailwind.min.css" rel="stylesheet" />
        <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css" />
        <link href="https://fonts.googleapis.com/css2?family=Poppins:wght@300;400;500;600;700&display=swap" rel="stylesheet" />
        <style>{`
          body { font-family: 'Poppins', sans-serif; }
          .hero-gradient { background: linear-gradient(135deg, #6366f1, #8b5cf6); }
          .modal {
            display: none;
            position: fixed;
            z-index: 1000;
            left: 0;
            top: 0;
            width: 100%;
            height: 100%;
            background-color: rgba(0,0,0,0.5);
          }
          .modal.show {
            display: flex;
            align-items: center;
            justify-content: center;
          }
        `}</style>
      </Head>

      <header className="bg-white shadow-sm sticky top-0 z-50">
        <div className="container mx-auto px-4 py-4 flex justify-between items-center">
          <div className="flex items-center space-x-2">
            <div className="w-10 h-10 bg-indigo-600 rounded-full flex items-center justify-center text-white font-bold text-lg">A</div>
            <h1 className="text-2xl font-bold text-indigo-700">ATAYATOKO</h1>
          </div>
          <button className="bg-indigo-600 text-white px-4 py-2 rounded-full font-medium hover:bg-indigo-700 transition">
            Masuk / Daftar
          </button>
        </div>
      </header>

      <section className="hero-gradient text-white py-16 md:py-24">
        <div className="container mx-auto px-4 text-center">
          <h2 className="text-4xl md:text-5xl font-bold mb-6">ATAYATOKO — Sudah Online, Siap Bisnis</h2>
          <p className="text-xl md:text-2xl max-w-2xl mx-auto mb-8">Dibangun dengan <strong>Next.js</strong> & dijalankan via <strong>NGINX</strong>. Serius bisnis? Kami siap skala!</p>
          <button className="bg-white text-indigo-600 font-bold py-3 px-8 rounded-full text-lg hover:bg-indigo-50 transition shadow-lg">
            Kelola Toko Anda
          </button>
        </div>
      </section>

      <section className="py-8 bg-gray-100">
        <div className="container mx-auto px-4 text-center">
          <h2 className="text-2xl font-bold mb-6">Pilih Role Anda</h2>
          <div className="flex flex-wrap justify-center gap-4">
            <button id="rolePembeli" className="px-6 py-3 bg-white rounded-lg border border-indigo-200 hover:bg-indigo-50 transition font-medium">
              <i className="fas fa-user mr-2"></i>Pembeli (Eceran)
            </button>
            <button id="roleReseller" className="px-6 py-3 bg-white rounded-lg border border-indigo-200 hover:bg-indigo-50 transition font-medium">
              <i className="fas fa-store mr-2"></i>Reseller (Grosir)
            </button>
          </div>
        </div>
      </section>

      <section className="py-8 bg-gray-100">
        <div className="container mx-auto px-4">
          <h2 className="text-2xl font-bold text-center mb-6">Kategori Produk</h2>
          <div className="flex flex-wrap justify-center gap-3">
            <button className="category-btn px-6 py-2 bg-white rounded-full border border-indigo-200 hover:bg-indigo-50 transition" data-category="all">Semua</button>
            <button className="category-btn px-6 py-2 bg-white rounded-full border border-indigo-200 hover:bg-indigo-50 transition" data-category="makanan">Makanan</button>
            <button className="category-btn px-6 py-2 bg-white rounded-full border border-indigo-200 hover:bg-indigo-50 transition" data-category="minuman">Minuman</button>
            <button className="category-btn px-6 py-2 bg-white rounded-full border border-indigo-200 hover:bg-indigo-50 transition" data-category="kebersihan">Kebersihan</button>
            <button className="category-btn px-6 py-2 bg-white rounded-full border border-indigo-200 hover:bg-indigo-50 transition" data-category="perawatan">Perawatan</button>
          </div>
        </div>
      </section>

      <section className="py-12 bg-gray-50">
        <div className="container mx-auto px-4">
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-3xl font-bold">Produk Terlaris</h2>
            <div className="text-indigo-600 font-medium">
              <i className="fas fa-user"></i> Mode: <span id="currentRoleText">Pilih Role</span>
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6" id="productsContainer">
          </div>
        </div>
      </section>

      <footer className="bg-gray-800 text-white py-12">
        <div className="container mx-auto px-4 text-center">
          <p>&copy; 2025 ATAYATOKO. All rights reserved.</p>
        </div>
      </footer>
    </>
  );
}