// pages/cashier/pos.js
import { useState, useEffect } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';
import { 
  collection, 
  addDoc, 
  getDocs,
  onSnapshot,
  writeBatch,
  increment,
  doc
} from 'firebase/firestore';
import { 
  onAuthStateChanged, 
  signOut 
} from 'firebase/auth';
import { auth, db } from '../../lib/firebase';

export default function CashierPOS() {
  const router = useRouter();
  const [products, setProducts] = useState([]);
  const [cart, setCart] = useState([]);
  const [filteredProducts, setFilteredProducts] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
  const [cashReceived, setCashReceived] = useState('');
  const [currentUser, setCurrentUser] = useState(null);
  const [isLoading, setIsLoading] = useState(true);

  // Cek autentikasi kasir
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (!user) return router.push('/cashier/login');
      
      const userDoc = await getDoc(doc(db, 'users', user.uid));
      if (!userDoc.exists() || userDoc.data().role !== 'cashier') {
        signOut(auth);
        router.push('/cashier/login');
      } else {
        setCurrentUser(userDoc.data());
        setIsLoading(false);
      }
    });
    return () => unsubscribe();
  }, []);

  // Muat produk
  useEffect(() => {
    if (!currentUser) return;
    
    const unsubscribe = onSnapshot(collection(db, 'products'), (snapshot) => {
      const list = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setProducts(list);
      setFilteredProducts(list);
    });
    return () => unsubscribe();
  }, [currentUser]);

  // Filter produk
  useEffect(() => {
    let filtered = products;
    if (searchTerm) {
      filtered = filtered.filter(product =>
        product.name.toLowerCase().includes(searchTerm.toLowerCase())
      );
    }
    if (selectedCategory !== 'all') {
      filtered = filtered.filter(product => product.category === selectedCategory);
    }
    setFilteredProducts(filtered);
  }, [searchTerm, selectedCategory, products]);

  const formatRupiah = (number) => {
    return new Intl.NumberFormat('id-ID', {
      style: 'currency',
      currency: 'IDR',
      minimumFractionDigits: 0
    }).format(number);
  };

  const cartTotal = cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);

  const addToCart = (product) => {
    const existingItem = cart.find(item => item.id === product.id);
    if (existingItem) {
      setCart(cart.map(item =>
        item.id === product.id
          ? { ...item, quantity: item.quantity + 1 }
          : item
      ));
    } else {
      setCart([...cart, { ...product, quantity: 1, price: product.priceEcer }]);
    }
  };

  const updateQuantity = (id, newQuantity) => {
    if (newQuantity === 0) {
      removeFromCart(id);
      return;
    }
    setCart(cart.map(item =>
      item.id === id ? { ...item, quantity: newQuantity } : item
    ));
  };

  const removeFromCart = (id) => {
    setCart(cart.filter(item => item.id !== id));
  };

  const clearCart = () => {
    setCart([]);
  };

  const processPayment = async () => {
    const cash = parseFloat(cashReceived);
    if (isNaN(cash) || cash < cartTotal) {
      alert('Uang tunai tidak cukup!');
      return;
    }

    const now = new Date();
    const receiptNumber = `TK${now.getFullYear()}${(now.getMonth()+1).toString().padStart(2,'0')}${now.getDate().toString().padStart(2,'0')}-${now.getHours().toString().padStart(2,'0')}${now.getMinutes().toString().padStart(2,'0')}${now.getSeconds().toString().padStart(2,'0')}`;

    try {
      const batch = writeBatch(db);
      const orderItems = [];

      for (const item of cart) {
        const productRef = doc(db, 'products', item.id);
        batch.update(productRef, { stock: increment(-item.quantity) });
        orderItems.push({
          id: item.id,
          name: item.name,
          price: item.price,
          quantity: item.quantity
        });
      }

      await addDoc(collection(db, 'orders'), {
        id: receiptNumber,
        date: now.toLocaleDateString('id-ID', { day: '2-digit', month: '2-digit', year: 'numeric' }),
        time: now.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
        items: orderItems,
        subtotal: cartTotal,
        tax: cartTotal * 0.11,
        total: cartTotal * 1.11,
        paymentMethod: 'cash',
        change: cash - (cartTotal * 1.11),
        cashier: currentUser.email,
        cashReceived: cash,
        createdAt: now
      });

      await batch.commit();
      alert('Transaksi berhasil!');
      clearCart();
      setCashReceived('');
      setIsPaymentModalOpen(false);
    } catch (err) {
      console.error('Error:', err);
      alert('Gagal memproses transaksi: ' + err.message);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Memuat POS kasir...</p>
        </div>
      </div>
    );
  }

  return (
    <>
      <Head>
        <title>ATAYATOKO - POS Kasir</title>
        <link href="https://cdn.jsdelivr.net/npm/tailwindcss@2.2.19/dist/tailwind.min.css" rel="stylesheet" />
        <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css" />
      </Head>

      <div className="min-h-screen bg-gray-50">
        {/* Header */}
        <header className="bg-white shadow-sm border-b border-gray-200">
          <div className="flex items-center justify-between px-4 sm:px-6 py-4">
            <div className="flex items-center">
              <div className="bg-green-600 p-2 rounded-lg mr-3">
                <i className="fas fa-cash-register text-white text-xl"></i>
              </div>
              <h1 className="text-xl sm:text-2xl font-bold text-gray-900">POS KASIR</h1>
            </div>
            <div className="flex items-center space-x-3 sm:space-x-4">
              <div className="text-right hidden sm:block">
                <p className="text-sm font-medium text-gray-900">Kasir</p>
                <p className="text-xs text-gray-500">{currentUser?.email}</p>
              </div>
              <button
                onClick={() => signOut(auth).then(() => router.push('/'))}
                className="bg-red-600 hover:bg-red-700 text-white px-3 py-2 rounded-lg text-sm font-medium"
              >
                Logout
              </button>
            </div>
          </div>
        </header>

        <div className="flex flex-col lg:flex-row">
          {/* Products */}
          <div className="w-full lg:w-2/3 xl:w-3/4 p-4 sm:p-6">
            <div className="bg-white rounded-xl shadow-sm p-4 sm:p-6 mb-6">
              <div className="flex flex-col sm:flex-row gap-3 mb-6">
                <div className="relative flex-1">
                  <i className="fas fa-search absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400"></i>
                  <input
                    type="text"
                    placeholder="Cari produk..."
                    className="w-full pl-10 pr-4 py-2 sm:py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500 outline-none text-base"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                  />
                </div>
                <div className="flex flex-wrap gap-2">
                  {['all', 'makanan', 'minuman', 'kebersihan', 'perawatan', 'promo'].map(category => (
                    <button
                      key={category}
                      onClick={() => setSelectedCategory(category)}
                      className={`px-3 py-1 sm:px-4 sm:py-2 rounded-full text-xs sm:text-sm font-medium transition-colors ${
                        selectedCategory === category
                          ? 'bg-green-600 text-white'
                          : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                      }`}
                    >
                      {category === 'all' ? 'Semua' : 
                       category === 'promo' ? 'Promo' : category}
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3 sm:gap-4">
                {filteredProducts.map(product => (
                  <div
                    key={product.id}
                    className="border border-gray-200 rounded-xl p-3 sm:p-4 hover:shadow-md transition-shadow cursor-pointer bg-white"
                    onClick={() => addToCart(product)}
                  >
                    <div className="flex justify-center mb-2 sm:mb-3">
                      <img
                        src={product.imageUrl || '/placeholder.webp'}
                        alt={product.name}
                        className="w-12 h-12 sm:w-16 sm:h-16 object-cover rounded-lg"
                        onError={(e) => e.target.src = '/placeholder.webp'}
                      />
                    </div>
                    <h3 className="font-medium text-xs sm:text-sm text-center mb-1 line-clamp-2">{product.name}</h3>
                    <p className="text-green-600 font-bold text-xs sm:text-sm text-center mb-1">{formatRupiah(product.priceEcer)}</p>
                    <div className="flex justify-center text-xs text-gray-600">
                      <span>Stok: {product.stock}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Cart */}
          <div className="w-full lg:w-1/3 xl:w-1/4 p-4 sm:p-6">
            <div className="bg-white rounded-xl shadow-sm p-4 sm:p-6 sticky top-6">
              <div className="flex items-center justify-between mb-4 sm:mb-6">
                <h2 className="text-lg sm:text-xl font-bold text-gray-900">Keranjang</h2>
                {cart.length > 0 && (
                  <button
                    onClick={clearCart}
                    className="text-red-600 hover:text-red-800 text-xs sm:text-sm font-medium"
                  >
                    Kosongkan
                  </button>
                )}
              </div>

              {cart.length === 0 ? (
                <div className="text-center py-8 sm:py-12">
                  <i className="fas fa-shopping-cart text-2xl sm:text-3xl text-gray-400 mb-3 sm:mb-4"></i>
                  <p className="text-gray-500 text-sm sm:text-base">Keranjang kosong</p>
                </div>
              ) : (
                <>
                  <div className="space-y-3 sm:space-y-4 max-h-80 sm:max-h-96 overflow-y-auto mb-4 sm:mb-6">
                    {cart.map(item => (
                      <div key={item.id} className="flex items-center justify-between p-2 sm:p-3 border border-gray-200 rounded-lg">
                        <div>
                          <p className="font-medium text-gray-900 text-xs sm:text-sm">{item.name}</p>
                          <p className="text-green-600 font-medium text-xs">{formatRupiah(item.price)}</p>
                        </div>
                        <div className="flex items-center space-x-1 sm:space-x-2">
                          <button
                            onClick={() => updateQuantity(item.id, item.quantity - 1)}
                            className="p-1 rounded-full bg-gray-200 hover:bg-gray-300"
                          >
                            <i className="fas fa-minus text-xs"></i>
                          </button>
                          <span className="font-medium w-6 sm:w-8 text-center text-xs sm:text-sm">{item.quantity}</span>
                          <button
                            onClick={() => updateQuantity(item.id, item.quantity + 1)}
                            className="p-1 rounded-full bg-gray-200 hover:bg-gray-300"
                          >
                            <i className="fas fa-plus text-xs"></i>
                          </button>
                          <button
                            onClick={() => removeFromCart(item.id)}
                            className="p-1 rounded-full bg-red-100 hover:bg-red-200 ml-1 sm:ml-2"
                          >
                            <i className="fas fa-times text-xs text-red-600"></i>
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="border-t border-gray-200 pt-3 sm:pt-4 space-y-2 sm:space-y-3">
                    <div className="flex justify-between">
                      <span className="text-gray-600 text-xs sm:text-sm">Subtotal:</span>
                      <span className="font-medium text-xs sm:text-sm">{formatRupiah(cartTotal)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-600 text-xs sm:text-sm">PPN (11%):</span>
                      <span className="font-medium text-xs sm:text-sm">{formatRupiah(cartTotal * 0.11)}</span>
                    </div>
                    <div className="flex justify-between text-base sm:text-lg font-bold border-t border-gray-200 pt-2">
                      <span>Total:</span>
                      <span>{formatRupiah(cartTotal * 1.11)}</span>
                    </div>
                  </div>

                  <button
                    onClick={() => setIsPaymentModalOpen(true)}
                    className="w-full bg-gradient-to-r from-green-600 to-emerald-700 hover:from-green-700 hover:to-emerald-800 text-white font-bold py-3 px-4 sm:py-4 sm:px-6 rounded-xl mt-4 sm:mt-6 transition-all duration-200 shadow-lg hover:shadow-xl text-sm sm:text-base"
                  >
                    Bayar Tunai
                  </button>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Payment Modal */}
        {isPaymentModalOpen && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-2xl max-w-md w-full p-5 sm:p-6">
              <div className="flex justify-between items-center mb-5 sm:mb-6">
                <h3 className="text-lg sm:text-xl font-bold text-gray-900">Pembayaran Tunai</h3>
                <button
                  onClick={() => setIsPaymentModalOpen(false)}
                  className="p-2 hover:bg-gray-100 rounded-full"
                >
                  <i className="fas fa-times"></i>
                </button>
              </div>

              <div className="space-y-5 sm:space-y-6">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Uang Tunai Diterima
                  </label>
                  <div className="relative">
                    <i className="fas fa-money-bill-wave absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400"></i>
                    <input
                      type="number"
                      className="w-full pl-10 pr-4 py-2.5 sm:py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500 outline-none text-base"
                      value={cashReceived}
                      onChange={(e) => setCashReceived(e.target.value)}
                      placeholder="0"
                      autoFocus
                    />
                  </div>
                  {cashReceived && (
                    <div className="mt-2 text-sm text-green-600">
                      Kembalian: {formatRupiah(parseFloat(cashReceived) - (cartTotal * 1.11))}
                    </div>
                  )}
                </div>

                <div className="bg-gray-50 rounded-lg p-4">
                  <div className="flex justify-between mb-1">
                    <span className="text-gray-600">Total:</span>
                    <span className="font-bold">{formatRupiah(cartTotal * 1.11)}</span>
                  </div>
                  {cashReceived && (
                    <div className="flex justify-between">
                      <span className="text-gray-600">Kembalian:</span>
                      <span className="text-green-600 font-medium">
                        {formatRupiah(parseFloat(cashReceived) - (cartTotal * 1.11))}
                      </span>
                    </div>
                  )}
                </div>

                <button
                  onClick={processPayment}
                  className="w-full bg-gradient-to-r from-green-600 to-emerald-700 hover:from-green-700 hover:to-emerald-800 text-white font-bold py-3 px-4 sm:py-3.5 rounded-xl transition-all duration-200 text-base"
                >
                  Selesaikan Pembayaran
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  );
}