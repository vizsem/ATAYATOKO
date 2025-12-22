// pages/index.js
import Head from 'next/head';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import {
  collection,
  doc,
  setDoc,
  getDoc,
  getDocs // ✅ Hanya getDocs, bukan onSnapshot
} from 'firebase/firestore';
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  onAuthStateChanged,
  signOut
} from 'firebase/auth';
import { auth, db } from '../lib/firebase';

// 🔥 ISR: Ambil data di server, konversi Timestamp agar aman
export async function getStaticProps() {
  try {
    const snapshot = await getDocs(collection(db, 'products'));
    const products = snapshot.docs.map(doc => {
      const data = doc.data();
      // ✅ Handle undefined & konversi Timestamp
      return {
        id: doc.id,
        ...data,
        createdAt: data.createdAt ? data.createdAt.toDate().toISOString() : null,
        updatedAt: data.updatedAt ? data.updatedAt.toDate().toISOString() : null,
      };
    });

    return {
      props: { products },
      revalidate: 300
    };
  } catch (error) {
    console.error('ISR Error:', error);
    return { props: { products: [] }, revalidate: 300 };
  }
}

// ✅ Terima products dari props
export default function Home({ products }) {
  const router = useRouter();
  const [cart, setCart] = useState([]);
  const [currentUser, setCurrentUser] = useState(null);
  const [currentRole, setCurrentRole] = useState('pembeli');
  const [activeCategory, setActiveCategory] = useState('all');
  const [currentPage, setCurrentPage] = useState(1);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState(''); // ✅ Pencarian

  // ✅ Kategori dengan Snack
  const categories = [
    { id: 'all', name: 'Semua' },
    { id: 'promo', name: 'Promo' },
    { id: 'makanan', name: 'Makanan' },
    { id: 'snack', name: 'Snack' }, // ✅ Baru
    { id: 'minuman', name: 'Minuman' },
    { id: 'kebersihan', name: 'Kebersihan' },
    { id: 'perawatan', name: 'Perawatan' }
  ];

  const PRODUCTS_PER_PAGE = 12;

  const formatRupiah = (angka) => {
    return new Intl.NumberFormat('id-ID', {
      style: 'currency',
      currency: 'IDR',
      minimumFractionDigits: 0
    }).format(angka);
  };

  // Muat keranjang dari localStorage
  useEffect(() => {
    const savedCart = JSON.parse(localStorage.getItem('atayatoko_cart') || '[]');
    setCart(savedCart);
  }, []);

  useEffect(() => {
    if (!currentUser) {
      localStorage.setItem('atayatoko_cart', JSON.stringify(cart));
    }
  }, [cart, currentUser]);

  // Cek auth state
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user) {
        const userDoc = await getDoc(doc(db, 'users', user.uid));
        if (userDoc.exists()) {
          setCurrentUser(userDoc.data());
          setCurrentRole(userDoc.data().role || 'pembeli');
        }
        const cartDoc = await getDoc(doc(db, 'carts', user.uid));
        if (cartDoc.exists()) {
          setCart(cartDoc.data().items || []);
        }
      } else {
        setCurrentUser(null);
        setCurrentRole('pembeli');
        const savedCart = JSON.parse(localStorage.getItem('atayatoko_cart') || '[]');
        setCart(savedCart);
      }
    });
    return () => unsubscribe();
  }, []);

  const saveUserToFirestore = async (user) => {
    if (!auth.currentUser) return;
    await setDoc(doc(db, 'users', auth.currentUser.uid), user, { merge: true });
  };

  const saveCartToFirestore = async () => {
    if (!auth.currentUser) return;
    await setDoc(doc(db, 'carts', auth.currentUser.uid), { items: cart, updatedAt: new Date() });
  };

  const handleLogout = async () => {
    await signOut(auth);
    setCurrentUser(null);
    setCart([]);
    localStorage.removeItem('atayatoko_cart');
    setIsMenuOpen(false);
  };

  const addToCart = (product, price, unit) => {
    setCart(prev => {
      const existing = prev.find(item => item.id === product.id);
      if (existing) {
        return prev.map(item =>
          item.id === product.id ? { ...item, quantity: (item.quantity || 0) + 1 } : item
        );
      }
      return [...prev, { ...product, price, unit, quantity: 1 }];
    });
    alert(`${product.name} ditambahkan ke keranjang!`);
  };

  const handleAuthSubmit = async (email, password, role) => {
    try {
      await signInWithEmailAndPassword(auth, email, password);
    } catch (err) {
      await createUserWithEmailAndPassword(auth, email, password);
    }
    await saveUserToFirestore({ email, role });
    const userDoc = await getDoc(doc(db, 'users', auth.currentUser.uid));
    if (userDoc.exists() && userDoc.data().role === 'admin') {
      router.push('/admin');
    } else {
      setShowAuthModal(false);
    }
  };

  const handleAdminLogin = async (email, password) => {
    try {
      await signInWithEmailAndPassword(auth, email, password);
      const userDoc = await getDoc(doc(db, 'users', auth.currentUser.uid));
      if (userDoc.exists() && userDoc.data().role === 'admin') {
        router.push('/admin');
      } else {
        alert('Bukan akun admin!');
        await signOut(auth);
      }
    } catch (err) {
      alert('Login gagal: ' + err.message);
    }
  };

  const sendToWhatsApp = () => {
    let waMessage = 'Halo, saya ingin pesan:\n';
    cart.forEach(item => {
      waMessage += `- ${item.name} × ${item.quantity} → ${formatRupiah(item.price * item.quantity)}\n`;
    });
    waMessage += `\nTotal: ${formatRupiah(cart.reduce((sum, item) => sum + (item.price * item.quantity), 0))}`;
    if (currentUser) waMessage += `\n\nEmail: ${currentUser.email}`;
    const waNumber = '6285790565666';
    window.open(`https://wa.me/${waNumber}?text=${encodeURIComponent(waMessage)}`, '_blank');
  };

  // ✅ Filter: Kategori + Pencarian
  const getFilteredProducts = () => {
    let filtered = products;

    if (activeCategory !== 'all') {
      filtered = filtered.filter(p => p.category === activeCategory);
    }

    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      filtered = filtered.filter(p =>
        p.name.toLowerCase().includes(term) ||
        (p.sku && p.sku.toLowerCase().includes(term)) ||
        (p.barcode && p.barcode.includes(term))
      );
    }

    return filtered;
  };

  const filteredProducts = getFilteredProducts();
  const totalPages = Math.ceil(filteredProducts.length / PRODUCTS_PER_PAGE);
  const startIndex = (currentPage - 1) * PRODUCTS_PER_PAGE;
  const currentProducts = filteredProducts.slice(startIndex, startIndex + PRODUCTS_PER_PAGE);

  const getCategoryProducts = (categoryId) => {
    if (categoryId === 'all') return [];
    return products
      .filter(p => p.category === categoryId)
      .slice(0, 5);
  };

  const [showAuthModal, setShowAuthModal] = useState(false);
  const [showCartModal, setShowCartModal] = useState(false);
  const [showAdminModal, setShowAdminModal] = useState(false);

  return (
    <>
      <Head>
        <title>ATAYATOKO - Sembako Grosir & Ecer</title>
        <meta name="description" content="Sembako Grosir & Ecer – Lengkap • Hemat • Terpercaya" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link rel="preconnect" href="https://cdn.jsdelivr.net" />
        <link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png" />
        <link rel="icon" type="image/png" sizes="32x32" href="/favicon-32x32.png" />
        <link href="https://cdn.jsdelivr.net/npm/tailwindcss@2.2.19/dist/tailwind.min.css" rel="stylesheet" />
        <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css" />
        <link href="https://fonts.googleapis.com/css2?family=Poppins:wght@300;400;500;600;700&display=swap" rel="stylesheet" />
        <style>{`
          body { font-family: 'Poppins', sans-serif; }
          .hero-gradient { background: linear-gradient(135deg, #6366f1, #8b5cf6); }
        `}</style>
      </Head>

      {/* MODALS (tidak diubah) */}
      {showAuthModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white p-6 rounded-lg w-full max-w-xs sm:max-w-md">
            <h3 className="font-bold text-lg mb-4">Masuk / Daftar</h3>
            <input id="emailInput" type="email" placeholder="Email" className="w-full p-2 border mb-3 text-base" />
            <input id="passwordInput" type="password" placeholder="Password" className="w-full p-2 border mb-3 text-base" />
            <select id="roleInput" className="w-full p-2 border mb-4 text-base">
              <option value="pembeli">Pembeli (Eceran)</option>
              <option value="reseller">Reseller (Grosir)</option>
            </select>
            <button 
              onClick={() => {
                const email = document.getElementById('emailInput').value;
                const password = document.getElementById('passwordInput').value;
                const role = document.getElementById('roleInput').value;
                if (email && password) handleAuthSubmit(email, password, role);
              }}
              className="w-full bg-indigo-600 text-white py-2.5 rounded text-base"
            >
              Masuk / Daftar
            </button>
            <button 
              onClick={() => setShowAuthModal(false)}
              className="mt-2 w-full bg-gray-500 text-white py-2.5 rounded text-base"
            >
              Batal
            </button>
          </div>
        </div>
      )}

      {showAdminModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white p-6 rounded-lg w-full max-w-xs sm:max-w-md">
            <h3 className="font-bold text-lg mb-4">🔐 Login Admin</h3>
            <input id="adminEmail" type="email" placeholder="Email Admin" className="w-full p-2 border mb-3 text-base" />
            <input id="adminPassword" type="password" placeholder="Password" className="w-full p-2 border mb-3 text-base" />
            <button 
              onClick={() => {
                const email = document.getElementById('adminEmail').value;
                const password = document.getElementById('adminPassword').value;
                if (email && password) handleAdminLogin(email, password);
              }}
              className="w-full bg-red-600 text-white py-2.5 rounded text-base"
            >
              Login Admin
            </button>
            <button 
              onClick={() => setShowAdminModal(false)}
              className="mt-2 w-full bg-gray-500 text-white py-2.5 rounded text-base"
            >
              Batal
            </button>
          </div>
        </div>
      )}

      {showCartModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white p-6 rounded-lg w-full max-w-xs sm:max-w-md max-h-[80vh] overflow-y-auto">
            <h3 className="font-bold mb-4">Keranjang Belanja</h3>
            {cart.length === 0 ? (
              <p className="text-center text-gray-500 py-4">Keranjang kosong</p>
            ) : (
              <>
                {cart.map(item => (
                  <div key={item.id} className="flex justify-between py-2 border-b">
                    <span className="text-sm">{item.name} × {item.quantity}</span>
                    <span className="text-sm">{formatRupiah(item.price * item.quantity)}</span>
                  </div>
                ))}
                <div className="mt-4 font-bold text-lg text-base">
                  Total: {formatRupiah(cart.reduce((sum, item) => sum + (item.price * item.quantity), 0))}
                </div>
                <button
                  onClick={sendToWhatsApp}
                  className="mt-4 w-full bg-green-600 text-white py-2.5 rounded flex items-center justify-center"
                >
                  <i className="fab fa-whatsapp mr-2"></i> Pesan via WhatsApp
                </button>
              </>
            )}
            <button 
              onClick={() => setShowCartModal(false)}
              className="mt-2 w-full bg-gray-600 text-white py-2.5 rounded"
            >
              Tutup
            </button>
          </div>
        </div>
      )}

      {/* HEADER */}
      <header className="bg-white shadow-sm sticky top-0 z-50">
        <div className="container mx-auto px-4 py-3 flex justify-between items-center">
          <div className="flex items-center space-x-2">
            <div className="w-9 h-9 sm:w-10 sm:h-10 bg-indigo-600 rounded-full flex items-center justify-center text-white font-bold text-sm sm:text-lg">A</div>
            <h1 className="text-xl sm:text-2xl font-bold text-indigo-700">ATAYATOKO</h1>
          </div>

          <div className="md:hidden">
            <button 
              onClick={() => setIsMenuOpen(!isMenuOpen)}
              className="text-indigo-600 text-2xl"
            >
              <i className="fas fa-bars"></i>
            </button>
          </div>

          <div className="hidden md:flex items-center space-x-4">
            <button 
              onClick={() => setShowCartModal(true)}
              className="text-indigo-600 relative"
            >
              <i className="fas fa-shopping-cart text-xl"></i>
              <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs rounded-full h-5 w-5 flex items-center justify-center">
                {cart.reduce((sum, item) => sum + item.quantity, 0)}
              </span>
            </button>
            <button 
              onClick={() => setShowAdminModal(true)}
              className="text-red-600 hover:text-red-800 font-medium"
              title="Login Admin"
            >
              🔒
            </button>
            {currentUser ? (
              <div className="flex items-center space-x-2">
                <span className="hidden sm:inline text-sm font-medium">{currentUser.email}</span>
                <span className="bg-indigo-100 text-indigo-800 text-xs px-2 py-1 rounded-full">
                  {currentUser.role === 'pembeli' ? 'Pembeli' : 'Reseller'}
                </span>
                <button onClick={handleLogout} className="text-gray-500 hover:text-gray-700 text-base">
                  <i className="fas fa-sign-out-alt"></i>
                </button>
              </div>
            ) : (
              <button 
                onClick={() => setShowAuthModal(true)}
                className="bg-indigo-600 text-white px-3 py-1.5 sm:px-4 sm:py-2 rounded-full text-xs sm:text-sm font-medium hover:bg-indigo-700 transition"
              >
                Masuk / Daftar
              </button>
            )}
          </div>
        </div>

        {isMenuOpen && (
          <div className="md:hidden bg-white py-3 px-4 shadow-lg border-t">
            <button 
              onClick={() => {
                setShowCartModal(true);
                setIsMenuOpen(false);
              }}
              className="block w-full text-left py-2 text-base"
            >
              <i className="fas fa-shopping-cart mr-2"></i> Keranjang
            </button>
            <button 
              onClick={() => {
                setShowAdminModal(true);
                setIsMenuOpen(false);
              }}
              className="block w-full text-left py-2 text-base"
            >
              <i className="fas fa-lock mr-2"></i> Admin
            </button>
            {currentUser ? (
              <button 
                onClick={handleLogout}
                className="block w-full text-left py-2 text-red-600 text-base"
              >
                <i className="fas fa-sign-out-alt mr-2"></i> Logout
              </button>
            ) : (
              <button 
                onClick={() => {
                  setShowAuthModal(true);
                  setIsMenuOpen(false);
                }}
                className="block w-full text-left py-2 bg-indigo-600 text-white rounded mt-2 text-base"
              >
                Masuk / Daftar
              </button>
            )}
          </div>
        )}
      </header>

      {/* HERO */}
      <section className="hero-gradient text-white py-12 sm:py-16 md:py-20">
        <div className="container mx-auto px-4 text-center">
          <h2 className="text-3xl sm:text-4xl md:text-5xl font-bold mb-4">ATAYATOKO</h2>
          <p className="text-lg sm:text-xl md:text-2xl max-w-2xl mx-auto mb-6">
            <strong>Sembako Grosir & Ecer – Lengkap • Hemat • Terpercaya</strong>
          </p>
          <button className="bg-white text-indigo-600 font-bold py-2.5 px-6 sm:px-8 rounded-full text-base sm:text-lg hover:bg-indigo-50 transition shadow-lg">
            Kelola Toko Anda
          </button>
        </div>
      </section>

      {/* ROLE */}
      <section className="py-6 sm:py-8 bg-gray-100">
        <div className="container mx-auto px-4 text-center">
          <h2 className="text-xl sm:text-2xl font-bold mb-4">Pilih Role Anda</h2>
          <div className="flex flex-wrap justify-center gap-2 sm:gap-4">
            <button 
              onClick={() => setCurrentRole('pembeli')}
              className={`px-4 py-2 sm:px-6 sm:py-3 rounded-lg border font-medium text-sm sm:text-base ${
                currentRole === 'pembeli' 
                  ? 'bg-indigo-50 text-indigo-700 border-indigo-200' 
                  : 'bg-white border-indigo-200 hover:bg-indigo-50'
              }`}
            >
              <i className="fas fa-user mr-1 sm:mr-2"></i>Pembeli
            </button>
            <button 
              onClick={() => setCurrentRole('reseller')}
              className={`px-4 py-2 sm:px-6 sm:py-3 rounded-lg border font-medium text-sm sm:text-base ${
                currentRole === 'reseller' 
                  ? 'bg-indigo-50 text-indigo-700 border-indigo-200' 
                  : 'bg-white border-indigo-200 hover:bg-indigo-50'
              }`}
            >
              <i className="fas fa-store mr-1 sm:mr-2"></i>Reseller
            </button>
          </div>
        </div>
      </section>

      {/* CATEGORIES + SEARCH */}
      <section className="py-6 sm:py-8 bg-gray-100">
        <div className="container mx-auto px-4">
          {/* ✅ PENCARIAN */}
          <div className="mb-4 max-w-2xl mx-auto">
            <div className="relative">
              <i className="fas fa-search absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400"></i>
              <input
                type="text"
                placeholder="Cari produk, nama, atau kode..."
                className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none text-base"
                value={searchTerm}
                onChange={(e) => {
                  setSearchTerm(e.target.value);
                  setCurrentPage(1);
                }}
              />
            </div>
          </div>

          <h2 className="text-xl sm:text-2xl font-bold text-center mb-4">Kategori Produk</h2>
          <div className="flex flex-wrap justify-center gap-2">
            {categories.map(cat => (
              <button
                key={cat.id}
                onClick={() => {
                  setActiveCategory(cat.id);
                  setCurrentPage(1);
                  setSearchTerm('');
                  setIsMenuOpen(false);
                }}
                className={`px-3 py-1.5 sm:px-5 sm:py-2 rounded-full border font-medium text-xs sm:text-sm ${
                  activeCategory === cat.id 
                    ? 'bg-indigo-600 text-white border-indigo-200' 
                    : 'bg-white border-indigo-200 hover:bg-indigo-50'
                }`}
              >
                {cat.name}
              </button>
            ))}
          </div>
        </div>
      </section>

      {/* PRODUCT DISPLAY */}
      {activeCategory === 'all' ? (
        <div className="py-8 sm:py-10 bg-gray-50">
          <div className="container mx-auto px-4">
            {categories.slice(1).map(cat => {
              const categoryProducts = getCategoryProducts(cat.id);
              if (categoryProducts.length === 0) return null;
              return (
                <div key={cat.id} className="mb-8 sm:mb-10">
                  <div className="flex justify-between items-center mb-4">
                    <h2 className="text-xl sm:text-2xl font-bold">{cat.name}</h2>
                    {categoryProducts.length > 5 && (
                      <button 
                        onClick={() => {
                          setActiveCategory(cat.id);
                          setSearchTerm('');
                        }}
                        className="text-indigo-600 hover:text-indigo-800 font-medium text-sm"
                      >
                        Lihat Semua →
                      </button>
                    )}
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3 sm:gap-4">
                    {categoryProducts.map(product => {
                      const price = currentRole === 'pembeli' ? product.priceEcer : product.priceGrosir;
                      const stock = product.stock || 0;
                      const unit = currentRole === 'pembeli' ? 'pcs' : 'grosir';
                      const stockColor = stock < 10 ? 'text-red-600' : 'text-green-600';
                      return (
                        <div key={product.id} className="bg-white rounded-lg sm:rounded-xl overflow-hidden shadow-sm sm:shadow-md">
                          <img 
                            src={product.imageUrl || '/placeholder.webp'} 
                            alt={product.name}
                            className="w-full h-32 sm:h-40 object-cover"
                            loading="lazy"
                            onError={(e) => e.target.src = '/placeholder.webp'}
                          />
                          <div className="p-3 sm:p-4">
                            <h3 className="font-semibold text-xs sm:text-sm mb-1">{product.name}</h3>
                            <div className="space-y-0.5 text-[10px] sm:text-xs">
                              <div><span className="text-gray-600">Harga:</span> <span className="text-indigo-600 font-bold">{formatRupiah(price)}</span> <span className="text-gray-500">/{unit}</span></div>
                              <div><span className="text-gray-600">Stok:</span> <span className={`${stockColor} font-medium`}>{stock} {unit}</span></div>
                            </div>
                            <button 
                              onClick={() => addToCart(product, price, unit)}
                              className="mt-2 w-full bg-indigo-600 text-white py-1.5 sm:py-2 rounded text-xs sm:text-sm"
                            >
                              Tambah ke Keranjang
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        <section className="py-8 sm:py-10 bg-gray-50">
          <div className="container mx-auto px-4">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl sm:text-2xl font-bold">
                {categories.find(c => c.id === activeCategory)?.name || 'Produk'}
              </h2>
              <div className="text-indigo-600 font-medium text-xs sm:text-sm">
                <i className="fas fa-user mr-1"></i> {currentRole === 'pembeli' ? 'Pembeli' : 'Reseller'}
              </div>
            </div>
            
            {currentProducts.length === 0 ? (
              <div className="text-center py-10">
                <p className="text-gray-500 text-base">
                  {searchTerm 
                    ? `Tidak ada produk yang cocok dengan "${searchTerm}"`
                    : 'Tidak ada produk di kategori ini'}
                </p>
              </div>
            ) : (
              <>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-4 gap-3 sm:gap-4">
                  {currentProducts.map(product => {
                    const price = currentRole === 'pembeli' ? product.priceEcer : product.priceGrosir;
                    const stock = product.stock || 0;
                    const unit = currentRole === 'pembeli' ? 'pcs' : 'grosir';
                    const stockColor = stock < 10 ? 'text-red-600' : 'text-green-600';
                    return (
                      <div key={product.id} className="bg-white rounded-lg sm:rounded-xl overflow-hidden shadow-sm sm:shadow-md">
                        <img 
                          src={product.imageUrl || '/placeholder.webp'} 
                          alt={product.name}
                          className="w-full h-32 sm:h-40 object-cover"
                          loading="lazy"
                          onError={(e) => e.target.src = '/placeholder.webp'}
                        />
                        <div className="p-3 sm:p-4">
                          <h3 className="font-semibold text-xs sm:text-sm mb-1">{product.name}</h3>
                          <div className="space-y-0.5 text-[10px] sm:text-xs">
                            <div><span className="text-gray-600">Harga:</span> <span className="text-indigo-600 font-bold">{formatRupiah(price)}</span> <span className="text-gray-500">/{unit}</span></div>
                            <div><span className="text-gray-600">Stok:</span> <span className={`${stockColor} font-medium`}>{stock} {unit}</span></div>
                          </div>
                          <button 
                            onClick={() => addToCart(product, price, unit)}
                            className="mt-2 w-full bg-indigo-600 text-white py-1.5 sm:py-2 rounded text-xs sm:text-sm"
                          >
                            Tambah ke Keranjang
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {totalPages > 1 && (
                  <div className="flex flex-wrap justify-center mt-6 sm:mt-8 gap-1 sm:gap-2">
                    <button
                      onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                      disabled={currentPage === 1}
                      className={`px-3 py-1.5 sm:px-4 sm:py-2 rounded text-xs sm:text-sm ${
                        currentPage === 1 
                          ? 'bg-gray-200 text-gray-500 cursor-not-allowed' 
                          : 'bg-white text-indigo-600 border border-indigo-200 hover:bg-indigo-50'
                      }`}
                    >
                      Sebelumnya
                    </button>
                    
                    {[...Array(Math.min(totalPages, 5))].map((_, i) => {
                      const page = i + 1;
                      return (
                        <button
                          key={page}
                          onClick={() => {
                            setCurrentPage(page);
                            window.scrollTo({ top: 0, behavior: 'smooth' });
                          }}
                          className={`px-3 py-1.5 sm:px-4 sm:py-2 rounded text-xs sm:text-sm ${
                            currentPage === page
                              ? 'bg-indigo-600 text-white'
                              : 'bg-white text-indigo-600 border border-indigo-200 hover:bg-indigo-50'
                          }`}
                        >
                          {page}
                        </button>
                      );
                    })}
                    
                    {totalPages > 5 && <span className="px-3 py-1.5 sm:px-4 sm:py-2 text-xs sm:text-sm">...</span>}
                    
                    {totalPages > 5 && (
                      <button
                        onClick={() => {
                          setCurrentPage(totalPages);
                          window.scrollTo({ top: 0, behavior: 'smooth' });
                        }}
                        className={`px-3 py-1.5 sm:px-4 sm:py-2 rounded text-xs sm:text-sm ${
                          currentPage === totalPages
                            ? 'bg-indigo-600 text-white'
                            : 'bg-white text-indigo-600 border border-indigo-200 hover:bg-indigo-50'
                        }`}
                      >
                        {totalPages}
                      </button>
                    )}
                    
                    <button
                      onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
                      disabled={currentPage === totalPages}
                      className={`px-3 py-1.5 sm:px-4 sm:py-2 rounded text-xs sm:text-sm ${
                        currentPage === totalPages 
                          ? 'bg-gray-200 text-gray-500 cursor-not-allowed' 
                          : 'bg-white text-indigo-600 border border-indigo-200 hover:bg-indigo-50'
                      }`}
                    >
                      Berikutnya
                    </button>
                  </div>
                )}
              </>
            )}
          </div>
        </section>
      )}

      <footer className="bg-gray-800 text-white py-6 sm:py-8">
        <div className="container mx-auto px-4 text-center">
          <p className="text-sm sm:text-base">&copy; 2025 ATAYATOKO. All rights reserved.</p>
        </div>
      </footer>
    </>
  );
}