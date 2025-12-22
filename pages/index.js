// pages/index.js
import Head from 'next/head';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { 
  collection, 
  doc, 
  setDoc, 
  getDoc, 
  onSnapshot,
  getDocs,
  query,
  where
} from 'firebase/firestore';
import { 
  createUserWithEmailAndPassword, 
  signInWithEmailAndPassword, 
  onAuthStateChanged, 
  signOut 
} from 'firebase/auth';
import { auth, db } from '../lib/firebase';

export default function Home() {
  const router = useRouter();
  const [products, setProducts] = useState([]);
  const [cart, setCart] = useState([]);
  const [currentUser, setCurrentUser] = useState(null);
  const [currentRole, setCurrentRole] = useState('pembeli');
  const [activeCategory, setActiveCategory] = useState('all');
  const [currentPage, setCurrentPage] = useState(1);
  const PRODUCTS_PER_PAGE = 12;

  // Format Rupiah
  const formatRupiah = (angka) => {
    return new Intl.NumberFormat('id-ID', {
      style: 'currency',
      currency: 'IDR',
      minimumFractionDigits: 0
    }).format(angka);
  };

  // Muat produk dari Firestore
  useEffect(() => {
    const unsubscribe = onSnapshot(collection(db, 'products'), (snapshot) => {
      const list = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setProducts(list);
    });
    return () => unsubscribe();
  }, []);

  // Muat keranjang
  useEffect(() => {
    const savedCart = JSON.parse(localStorage.getItem('atayatoko_cart') || '[]');
    setCart(savedCart);
  }, []);

  // Simpan keranjang
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

  // Simpan user ke Firestore
  const saveUserToFirestore = async (user) => {
    if (!auth.currentUser) return;
    await setDoc(doc(db, 'users', auth.currentUser.uid), user, { merge: true });
  };

  // Simpan keranjang ke Firestore
  const saveCartToFirestore = async () => {
    if (!auth.currentUser) return;
    await setDoc(doc(db, 'carts', auth.currentUser.uid), { items: cart, updatedAt: new Date() });
  };

  // Handle logout
  const handleLogout = async () => {
    await signOut(auth);
    setCurrentUser(null);
    setCart([]);
    localStorage.removeItem('atayatoko_cart');
  };

  // Tambah ke keranjang
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

  // Show Auth Modal
  const showAuthModal = () => {
    // ... (kode modal auth tetap sama, tidak diulang untuk menghemat space)
  };

  // Show Admin Login Modal
  const showAdminLoginModal = () => {
    // ... (kode modal admin tetap sama)
  };

  // Show Cart Modal
  const showCartModal = () => {
    // ... (kode modal keranjang tetap sama)
  };

  // Filter produk berdasarkan kategori aktif
  const getFilteredProducts = () => {
    if (activeCategory === 'all') {
      return products;
    }
    return products.filter(p => p.category === activeCategory);
  };

  // Hitung pagination
  const filteredProducts = getFilteredProducts();
  const totalPages = Math.ceil(filteredProducts.length / PRODUCTS_PER_PAGE);
  const startIndex = (currentPage - 1) * PRODUCTS_PER_PAGE;
  const currentProducts = filteredProducts.slice(startIndex, startIndex + PRODUCTS_PER_PAGE);

  // Kategori yang ditampilkan
  const categories = [
    { id: 'all', name: 'Semua' },
    { id: 'promo', name: 'Promo' },
    { id: 'makanan', name: 'Makanan' },
    { id: 'minuman', name: 'Minuman' },
    { id: 'kebersihan', name: 'Kebersihan' },
    { id: 'perawatan', name: 'Perawatan' }
  ];

  // Tampilkan 5 produk pertama untuk setiap kategori di halaman utama
  const getCategoryProducts = (categoryId) => {
    if (categoryId === 'all') return [];
    return products
      .filter(p => p.category === categoryId)
      .slice(0, 5);
  };

  return (
    <>
      <Head>
        <title>ATAYATOKO - Sembako Grosir & Ecer</title>
        <meta name="description" content="Sembako Grosir & Ecer – Lengkap • Hemat • Terpercaya" />
        <link href="https://cdn.jsdelivr.net/npm/tailwindcss@2.2.19/dist/tailwind.min.css" rel="stylesheet" />
        <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css" />
        <link href="https://fonts.googleapis.com/css2?family=Poppins:wght@300;400;500;600;700&display=swap" rel="stylesheet" />
        <style>{`
          body { font-family: 'Poppins', sans-serif; }
          .hero-gradient { background: linear-gradient(135deg, #6366f1, #8b5cf6); }
        `}</style>
      </Head>

      {/* Modal (auth, admin, cart) - tetap sama */}

      <header className="bg-white shadow-sm sticky top-0 z-50">
        {/* ... header tetap sama ... */}
      </header>

      <section className="hero-gradient text-white py-16 md:py-24">
        <div className="container mx-auto px-4 text-center">
          {/* ✅ GANTI MOTO */}
          <h2 className="text-4xl md:text-5xl font-bold mb-6">ATAYATOKO</h2>
          <p className="text-xl md:text-2xl max-w-2xl mx-auto mb-8">
            <strong>Sembako Grosir & Ecer – Lengkap • Hemat • Terpercaya</strong>
          </p>
          <button className="bg-white text-indigo-600 font-bold py-3 px-8 rounded-full text-lg hover:bg-indigo-50 transition shadow-lg">
            Kelola Toko Anda
          </button>
        </div>
      </section>

      <section className="py-8 bg-gray-100">
        {/* ... role selection tetap sama ... */}
      </section>

      <section className="py-8 bg-gray-100">
        <div className="container mx-auto px-4">
          <h2 className="text-2xl font-bold text-center mb-6">Kategori Produk</h2>
          <div className="flex flex-wrap justify-center gap-3">
            {categories.map(cat => (
              <button
                key={cat.id}
                onClick={() => {
                  setActiveCategory(cat.id);
                  setCurrentPage(1);
                }}
                className={`px-6 py-2 rounded-full border font-medium ${
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

      {/* ✅ TAMPILKAN 5 PRODUK PER KATEGORI SAAT DI "Semua" */}
      {activeCategory === 'all' ? (
        <div className="py-12 bg-gray-50">
          <div className="container mx-auto px-4">
            {categories.slice(1).map(cat => {
              const categoryProducts = getCategoryProducts(cat.id);
              if (categoryProducts.length === 0) return null;
              
              return (
                <div key={cat.id} className="mb-12">
                  <div className="flex justify-between items-center mb-6">
                    <h2 className="text-3xl font-bold">{cat.name}</h2>
                    {categoryProducts.length > 5 && (
                      <button 
                        onClick={() => setActiveCategory(cat.id)}
                        className="text-indigo-600 hover:text-indigo-800 font-medium"
                      >
                        Lihat Semua →
                      </button>
                    )}
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-6">
                    {categoryProducts.map(product => {
                      const price = currentRole === 'pembeli' ? product.priceEcer : product.priceGrosir;
                      const stock = product.stock || 0;
                      const unit = currentRole === 'pembeli' ? 'pcs' : 'grosir';
                      const stockColor = stock < 10 ? 'text-red-600' : 'text-green-600';

                      return (
                        <div key={product.id} className="bg-white rounded-xl overflow-hidden shadow-md">
                          <img 
                            src={product.imageUrl || '/placeholder.webp'} 
                            alt={product.name}
                            className="w-full h-48 object-cover"
                            onError={(e) => e.target.src = '/placeholder.webp'}
                          />
                          <div className="p-4">
                            <h3 className="font-semibold text-sm mb-2">{product.name}</h3>
                            <div className="space-y-1 text-xs">
                              <div>
                                <span className="text-gray-600">Harga:</span> 
                                <span className="text-indigo-600 font-bold">{formatRupiah(price)}</span>
                                <span className="text-gray-500 ml-1">/{unit}</span>
                              </div>
                              <div>
                                <span className="text-gray-600">Stok:</span> 
                                <span className={`${stockColor} font-medium`}>{stock} {unit}</span>
                              </div>
                            </div>
                            <button 
                              onClick={() => addToCart(product, price, unit)}
                              className="mt-3 w-full bg-indigo-600 text-white py-2 rounded-lg text-sm"
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
        /* ✅ TAMPILKAN PAGINATION SAAT DI KATEGORI SPESIFIK */
        <section className="py-12 bg-gray-50">
          <div className="container mx-auto px-4">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-3xl font-bold">
                {categories.find(c => c.id === activeCategory)?.name || 'Produk'}
              </h2>
              <div className="text-indigo-600 font-medium">
                <i className="fas fa-user"></i> Mode: {currentRole === 'pembeli' ? 'Pembeli (Eceran)' : 'Reseller (Grosir)'}
              </div>
            </div>
            
            {currentProducts.length === 0 ? (
              <div className="text-center py-12">
                <p className="text-gray-500 text-xl">Tidak ada produk di kategori ini</p>
              </div>
            ) : (
              <>
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
                  {currentProducts.map(product => {
                    const price = currentRole === 'pembeli' ? product.priceEcer : product.priceGrosir;
                    const stock = product.stock || 0;
                    const unit = currentRole === 'pembeli' ? 'pcs' : 'grosir';
                    const stockColor = stock < 10 ? 'text-red-600' : 'text-green-600';

                    return (
                      <div key={product.id} className="bg-white rounded-xl overflow-hidden shadow-md">
                        <img 
                          src={product.imageUrl || '/placeholder.webp'} 
                          alt={product.name}
                          className="w-full h-48 object-cover"
                          onError={(e) => e.target.src = '/placeholder.webp'}
                        />
                        <div className="p-4">
                          <h3 className="font-semibold text-sm mb-2">{product.name}</h3>
                          <div className="space-y-1 text-xs">
                            <div>
                              <span className="text-gray-600">Harga:</span> 
                              <span className="text-indigo-600 font-bold">{formatRupiah(price)}</span>
                              <span className="text-gray-500 ml-1">/{unit}</span>
                            </div>
                            <div>
                              <span className="text-gray-600">Stok:</span> 
                              <span className={`${stockColor} font-medium`}>{stock} {unit}</span>
                            </div>
                          </div>
                          <button 
                            onClick={() => addToCart(product, price, unit)}
                            className="mt-3 w-full bg-indigo-600 text-white py-2 rounded-lg text-sm"
                          >
                            Tambah ke Keranjang
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* ✅ PAGINATION */}
                {totalPages > 1 && (
                  <div className="flex justify-center mt-8 space-x-2">
                    <button
                      onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                      disabled={currentPage === 1}
                      className={`px-4 py-2 rounded-lg ${
                        currentPage === 1 
                          ? 'bg-gray-200 text-gray-500 cursor-not-allowed' 
                          : 'bg-white text-indigo-600 border border-indigo-200 hover:bg-indigo-50'
                      }`}
                    >
                      Sebelumnya
                    </button>
                    
                    {[...Array(totalPages)].map((_, i) => {
                      const page = i + 1;
                      if (totalPages <= 5) {
                        return (
                          <button
                            key={page}
                            onClick={() => setCurrentPage(page)}
                            className={`px-4 py-2 rounded-lg ${
                              currentPage === page
                                ? 'bg-indigo-600 text-white'
                                : 'bg-white text-indigo-600 border border-indigo-200 hover:bg-indigo-50'
                            }`}
                          >
                            {page}
                          </button>
                        );
                      }
                      
                      // Tampilkan hanya halaman awal, akhir, dan sekitar halaman aktif
                      if (page === 1 || page === totalPages || 
                          (page >= currentPage - 1 && page <= currentPage + 1)) {
                        return (
                          <button
                            key={page}
                            onClick={() => setCurrentPage(page)}
                            className={`px-4 py-2 rounded-lg ${
                              currentPage === page
                                ? 'bg-indigo-600 text-white'
                                : 'bg-white text-indigo-600 border border-indigo-200 hover:bg-indigo-50'
                            }`}
                          >
                            {page}
                          </button>
                        );
                      }
                      
                      // Tampilkan elipsis
                      if ((page === currentPage - 2 && currentPage > 3) || 
                          (page === currentPage + 2 && currentPage < totalPages - 2)) {
                        return <span key={`ellipsis-${page}`} className="px-2 py-2">...</span>;
                      }
                      
                      return null;
                    })}
                    
                    <button
                      onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
                      disabled={currentPage === totalPages}
                      className={`px-4 py-2 rounded-lg ${
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

      <footer className="bg-gray-800 text-white py-12">
        <div className="container mx-auto px-4 text-center">
          <p>&copy; 2025 ATAYATOKO. All rights reserved.</p>
        </div>
      </footer>
    </>
  );
}