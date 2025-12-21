// pages/index.js
import Head from 'next/head';
import { useEffect } from 'react';
import { doc, setDoc, getDoc } from 'firebase/firestore';
import { createUserWithEmailAndPassword, signInWithEmailAndPassword, onAuthStateChanged, signOut } from 'firebase/auth';
import { auth, db } from '../lib/firebase';

export default function Home() {
  useEffect(() => {
    if (typeof window === 'undefined') return;

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

    let currentUser = null;
    let cart = JSON.parse(localStorage.getItem('atayatoko_cart') || '[]');

    function formatRupiah(angka) {
      return new Intl.NumberFormat('id-ID', {
        style: 'currency',
        currency: 'IDR',
        minimumFractionDigits: 0
      }).format(angka);
    }

    async function saveUserToFirestore(user) {
      if (!auth.currentUser) return;
      const userRef = doc(db, 'users', auth.currentUser.uid);
      await setDoc(userRef, user, { merge: true });
      currentUser = user;
    }

    async function saveCartToFirestore() {
      if (!auth.currentUser) return;
      const cartRef = doc(db, 'carts', auth.currentUser.uid);
      await setDoc(cartRef, { items: cart, updatedAt: new Date() });
    }

    async function handleLogout() {
      await signOut(auth);
      currentUser = null;
      cart = [];
      localStorage.removeItem('atayatoko_cart');
      updateAuthUI();
      updateCartUI();
      // Reset UI role ke default
      document.querySelectorAll('.role-btn').forEach(btn => btn.classList.remove('bg-indigo-600', 'text-white'));
      document.getElementById('rolePembeli').classList.add('bg-indigo-600', 'text-white');
      displayProducts();
    }

    function updateAuthUI() {
      const authBtn = document.getElementById('authBtn');
      const authProfile = document.getElementById('authProfile');

      if (currentUser) {
        authBtn.style.display = 'none';
        authProfile.style.display = 'flex';
        document.getElementById('userEmail').textContent = currentUser.email;
        document.getElementById('userRole').textContent = 
          currentUser.role === 'pembeli' ? 'Pembeli' : 'Reseller';
        // Set role UI sesuai user
        document.querySelectorAll('.role-btn').forEach(btn => btn.classList.remove('bg-indigo-600', 'text-white'));
        const roleBtn = currentUser.role === 'pembeli' ? 'rolePembeli' : 'roleReseller';
        document.getElementById(roleBtn).classList.add('bg-indigo-600', 'text-white');
      } else {
        authBtn.style.display = 'block';
        authProfile.style.display = 'none';
        // Reset ke role default untuk tamu
        document.querySelectorAll('.role-btn').forEach(btn => btn.classList.remove('bg-indigo-600', 'text-white'));
        document.getElementById('rolePembeli').classList.add('bg-indigo-600', 'text-white');
      }
      displayProducts();
    }

    function updateCartUI() {
      const cartCount = document.getElementById('cartCount');
      const totalItems = cart.reduce((sum, item) => sum + item.quantity, 0);
      if (cartCount) cartCount.textContent = totalItems || '0';
    }

    function showAuthModal() {
      if (document.getElementById('authModal')) return;

      const modal = document.createElement('div');
      modal.id = 'authModal';
      modal.className = 'fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50';
      modal.innerHTML = `
        <div class="bg-white p-6 rounded-lg w-96">
          <h3 class="font-bold text-lg mb-4">Masuk / Daftar</h3>
          <input id="emailInput" type="email" placeholder="Email" class="w-full p-2 border mb-3" />
          <input id="passwordInput" type="password" placeholder="Password" class="w-full p-2 border mb-3" />
          <select id="roleInput" class="w-full p-2 border mb-4">
            <option value="pembeli">Pembeli (Eceran)</option>
            <option value="reseller">Reseller (Grosir)</option>
          </select>
          <button id="submitAuth" class="w-full bg-indigo-600 text-white py-2 rounded">Masuk / Daftar</button>
        </div>
      `;
      document.body.appendChild(modal);

      document.getElementById('submitAuth').onclick = async () => {
        const email = document.getElementById('emailInput').value.trim();
        const password = document.getElementById('passwordInput').value;
        const role = document.getElementById('roleInput').value;

        if (!email || !password) {
          alert('Email dan Password wajib diisi!');
          return;
        }

        try {
          await signInWithEmailAndPassword(auth, email, password);
        } catch (err) {
          await createUserWithEmailAndPassword(auth, email, password);
        }

        await saveUserToFirestore({ email, role });

        // ✅ CEK ROLE SETELAH LOGIN
        const userDoc = await getDoc(doc(db, 'users', auth.currentUser.uid));
        if (userDoc.exists() && userDoc.data().role === 'admin') {
          modal.remove();
          alert('Login admin berhasil!');
          window.location.href = '/admin';
        } else {
          modal.remove();
          updateAuthUI();
          updateCartUI();

          // Pindahkan keranjang lokal ke Firebase
          const localCart = JSON.parse(localStorage.getItem('atayatoko_cart') || '[]');
          if (localCart.length > 0) {
            cart = localCart;
            await saveCartToFirestore();
            localStorage.removeItem('atayatoko_cart');
            updateCartUI();
          }
        }
      };

      modal.onclick = (e) => {
        if (e.target === modal) modal.remove();
      };
    }

    // ✅ FUNGSI LOGIN ADMIN RAHASIA
    function showAdminLoginModal() {
      if (document.getElementById('adminLoginModal')) return;

      const modal = document.createElement('div');
      modal.id = 'adminLoginModal';
      modal.className = 'fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50';
      modal.innerHTML = `
        <div class="bg-white p-6 rounded-lg w-96">
          <h3 class="font-bold text-lg mb-4">🔐 Login Admin</h3>
          <input id="adminEmail" type="email" placeholder="Email Admin" class="w-full p-2 border mb-3" />
          <input id="adminPassword" type="password" placeholder="Password" class="w-full p-2 border mb-3" />
          <button id="submitAdminLogin" class="w-full bg-red-600 text-white py-2 rounded">Login Admin</button>
        </div>
      `;
      document.body.appendChild(modal);

      document.getElementById('submitAdminLogin').onclick = async () => {
        const email = document.getElementById('adminEmail').value.trim();
        const password = document.getElementById('adminPassword').value;

        if (!email || !password) {
          alert('Email dan password wajib diisi!');
          return;
        }

        try {
          await signInWithEmailAndPassword(auth, email, password);
          const userDoc = await getDoc(doc(db, 'users', auth.currentUser.uid));
          if (userDoc.exists() && userDoc.data().role === 'admin') {
            modal.remove();
            alert('Login admin berhasil!');
            window.location.href = '/admin';
          } else {
            alert('Akun ini bukan admin!');
            await signOut(auth);
          }
        } catch (err) {
          alert('Login gagal: ' + err.message);
        }
      };

      modal.onclick = (e) => {
        if (e.target === modal) modal.remove();
      };
    }

    function showCartModal() {
      const modal = document.createElement('div');
      modal.id = 'cartModal';
      modal.className = 'fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50';
      const total = cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);
      let itemsHtml = '';
      if (cart.length === 0) {
        itemsHtml = '<p class="text-center text-gray-500 py-4">Keranjang kosong</p>';
      } else {
        cart.forEach(item => {
          itemsHtml += `
            <div class="flex justify-between py-2 border-b">
              <span>${item.name} × ${item.quantity}</span>
              <span>${formatRupiah(item.price * item.quantity)}</span>
            </div>
          `;
        });
      }

      let waMessage = 'Halo, saya ingin pesan:\n';
      cart.forEach(item => {
        waMessage += `- ${item.name} × ${item.quantity} → ${formatRupiah(item.price * item.quantity)}\n`;
      });
      waMessage += `\nTotal: ${formatRupiah(total)}`;
      if (currentUser) {
        waMessage += `\n\nEmail: ${currentUser.email}`;
      }
      const waNumber = '6285790565666';
      const waUrl = `https://wa.me/${waNumber}?text=${encodeURIComponent(waMessage)}`;

      modal.innerHTML = `
        <div class="bg-white p-6 rounded-lg w-96 max-h-[80vh] overflow-y-auto">
          <h3 class="font-bold mb-4">Keranjang Belanja</h3>
          <div>${itemsHtml}</div>
          <div class="mt-4 font-bold text-lg">Total: ${formatRupiah(total)}</div>
          <a href="${waUrl}" target="_blank" class="mt-4 w-full bg-green-600 text-white py-2 rounded text-center block">
            <i class="fab fa-whatsapp mr-2"></i>Pesan via WhatsApp
          </a>
          <button class="mt-2 w-full bg-gray-600 text-white py-2 rounded" onclick="document.getElementById('cartModal').remove()">
            Tutup
          </button>
        </div>
      `;
      document.body.appendChild(modal);
      modal.onclick = (e) => {
        if (e.target === modal) modal.remove();
      };
    }

    function displayProducts(category = 'all') {
      const container = document.getElementById('productsContainer');
      if (!container) return;

      // Ambil role dari UI, bukan dari currentUser (untuk dukung tamu)
      const rolePembeliActive = document.getElementById('rolePembeli')?.classList.contains('bg-indigo-600');
      const currentRole = rolePembeliActive ? 'pembeli' : 'reseller';

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
          const id = Number(btn.dataset.id);
          const price = Number(btn.dataset.price);
          const name = btn.dataset.name;
          const unit = btn.dataset.unit;

          const existing = cart.find(item => item.id === id);
          if (existing) {
            existing.quantity += 1;
          } else {
            cart.push({ id, name, price, unit, quantity: 1 });
          }

          localStorage.setItem('atayatoko_cart', JSON.stringify(cart));
          updateCartUI();
          alert(`${name} ditambahkan ke keranjang!`);
        };
      });
    }

    // Setup role buttons
    document.querySelectorAll('.role-btn').forEach(btn => {
      btn.onclick = () => {
        document.querySelectorAll('.role-btn').forEach(b => b.classList.remove('bg-indigo-600', 'text-white'));
        btn.classList.add('bg-indigo-600', 'text-white');
        displayProducts();
      };
    });

    // Setup category buttons
    document.querySelectorAll('.category-btn').forEach(btn => {
      btn.onclick = () => {
        document.querySelectorAll('.category-btn').forEach(b => b.classList.remove('bg-indigo-600', 'text-white'));
        btn.classList.add('bg-indigo-600', 'text-white');
        displayProducts(btn.dataset.category);
      };
    });

    const authBtn = document.getElementById('authBtn');
    if (authBtn) authBtn.onclick = showAuthModal;

    const cartBtn = document.getElementById('cartBtn');
    if (cartBtn) cartBtn.onclick = showCartModal;

    const logoutBtn = document.getElementById('logoutBtn');
    if (logoutBtn) logoutBtn.onclick = handleLogout;

    // ✅ TOMBOL ADMIN RAHASIA
    const adminLoginBtn = document.getElementById('adminLoginBtn');
    if (adminLoginBtn) {
      adminLoginBtn.onclick = () => {
        const user = JSON.parse(localStorage.getItem('atayatoko_user') || 'null');
        if (user && user.role === 'admin') {
          window.location.href = '/admin';
        } else {
          showAdminLoginModal();
        }
      };
    }

    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user) {
        const userDoc = await getDoc(doc(db, 'users', user.uid));
        if (userDoc.exists()) {
          currentUser = userDoc.data();
        }
        const cartDoc = await getDoc(doc(db, 'carts', user.uid));
        if (cartDoc.exists()) {
          cart = cartDoc.data().items || [];
        }
      } else {
        currentUser = null;
        cart = JSON.parse(localStorage.getItem('atayatoko_cart') || '[]');
      }
      updateAuthUI();
      updateCartUI();
    });

    // Inisialisasi UI default
    document.querySelector('.category-btn[data-category="all"]').classList.add('bg-indigo-600', 'text-white');
    document.getElementById('rolePembeli').classList.add('bg-indigo-600', 'text-white');
    displayProducts();

    return () => unsubscribe();
  }, []);

  return (
    <>
      <Head>
        <title>ATAYATOKO - Sudah Online, Siap Bisnis</title>
        <meta name="description" content="Sistem integrasi usaha untuk mini market & reseller" />
        {/* ✅ CDN TANPA SPASI */}
        <link href="https://cdn.jsdelivr.net/npm/tailwindcss@2.2.19/dist/tailwind.min.css" rel="stylesheet" />
        <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css" />
        <link href="https://fonts.googleapis.com/css2?family=Poppins:wght@300;400;500;600;700&display=swap" rel="stylesheet" />
        <style>{`
          body { font-family: 'Poppins', sans-serif; }
          .hero-gradient { background: linear-gradient(135deg, #6366f1, #8b5cf6); }
        `}</style>
      </Head>

      <header className="bg-white shadow-sm sticky top-0 z-50">
        <div className="container mx-auto px-4 py-4 flex justify-between items-center">
          <div className="flex items-center space-x-2">
            <div className="w-10 h-10 bg-indigo-600 rounded-full flex items-center justify-center text-white font-bold text-lg">A</div>
            <h1 className="text-2xl font-bold text-indigo-700">ATAYATOKO</h1>
          </div>
          <div className="flex items-center space-x-4">
            <button id="cartBtn" className="text-indigo-600 relative">
              <i className="fas fa-shopping-cart"></i>
              <span id="cartCount" className="absolute -top-2 -right-2 bg-red-500 text-white text-xs rounded-full h-5 w-5 flex items-center justify-center">0</span>
            </button>

            {/* ✅ TOMBOL ADMIN RAHASIA (GEMBOK) */}
            <button 
              id="adminLoginBtn"
              className="text-red-600 hover:text-red-800 font-medium hidden md:block"
              title="Login Admin"
            >
              🔒
            </button>

            <button id="authBtn" className="bg-indigo-600 text-white px-4 py-2 rounded-full font-medium hover:bg-indigo-700 transition">
              Masuk / Daftar
            </button>
            <div id="authProfile" className="hidden items-center space-x-2">
              <span id="userEmail" className="text-sm font-medium"></span>
              <span className="bg-indigo-100 text-indigo-800 text-xs px-2 py-1 rounded-full" id="userRole"></span>
              <button id="logoutBtn" className="text-gray-500 hover:text-gray-700">
                <i className="fas fa-sign-out-alt"></i>
              </button>
            </div>
          </div>
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
            <button id="rolePembeli" className="role-btn px-6 py-3 bg-white rounded-lg border border-indigo-200 hover:bg-indigo-50 transition font-medium">
              <i className="fas fa-user mr-2"></i>Pembeli (Eceran)
            </button>
            <button id="roleReseller" className="role-btn px-6 py-3 bg-white rounded-lg border border-indigo-200 hover:bg-indigo-50 transition font-medium">
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