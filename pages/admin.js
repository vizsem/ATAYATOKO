// pages/admin.js
import { useState, useEffect, useRef } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';
import { 
  collection, 
  addDoc, 
  updateDoc, 
  deleteDoc, 
  doc, 
  getDocs,
  getDoc,
  onSnapshot
} from 'firebase/firestore';
import { 
  onAuthStateChanged, 
  signOut 
} from 'firebase/auth';
import { auth, db } from '../lib/firebase';

export default function AdminPanel() {
  const router = useRouter();
  const [products, setProducts] = useState([]);
  const [cart, setCart] = useState([]);
  const [filteredProducts, setFilteredProducts] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [selectedPaymentMethod, setSelectedPaymentMethod] = useState('cash');
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
  const [isReceiptModalOpen, setIsReceiptModalOpen] = useState(false);
  const [cashReceived, setCashReceived] = useState('');
  const [receiptData, setReceiptData] = useState(null);
  const [activeTab, setActiveTab] = useState('pos'); // 'pos' or 'backoffice'
  const [editingProduct, setEditingProduct] = useState(null);
  const [newProduct, setNewProduct] = useState({
    name: '',
    hargaBeli: 0,
    priceEcer: 0,
    priceGrosir: 0,
    stock: 0,
    supplier: '',
    category: 'makanan',
    imageUrl: ''
  });
  const fileInputRef = useRef(null);
  const [currentUser, setCurrentUser] = useState(null);

  // Cek autentikasi admin
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (!user) return router.push('/');
      
      const userDoc = await getDoc(doc(db, 'users', user.uid));
      if (!userDoc.exists() || userDoc.data().role !== 'admin') {
        alert('Akses ditolak!');
        router.push('/');
      } else {
        setCurrentUser(user);
      }
    });
    return () => unsubscribe();
  }, []);

  // Muat produk dari Firestore
  useEffect(() => {
    const unsubscribe = onSnapshot(collection(db, 'products'), (snapshot) => {
      const list = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setProducts(list);
      setFilteredProducts(list);
    });
    return () => unsubscribe();
  }, []);

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

  // Format Rupiah
  const formatRupiah = (number) => {
    return new Intl.NumberFormat('id-ID', {
      style: 'currency',
      currency: 'IDR',
      minimumFractionDigits: 0
    }).format(number);
  };

  // Hitung total keranjang
  const cartTotal = cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);
  const cartItemCount = cart.reduce((sum, item) => sum + item.quantity, 0);

  // Tambah ke keranjang
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

  // Update jumlah
  const updateQuantity = (id, newQuantity) => {
    if (newQuantity === 0) {
      removeFromCart(id);
      return;
    }
    setCart(cart.map(item =>
      item.id === id ? { ...item, quantity: newQuantity } : item
    ));
  };

  // Hapus dari keranjang
  const removeFromCart = (id) => {
    setCart(cart.filter(item => item.id !== id));
  };

  // Kosongkan keranjang
  const clearCart = () => {
    setCart([]);
  };

  // Proses pembayaran
  const processPayment = async () => {
    if (selectedPaymentMethod === 'cash') {
      const cash = parseFloat(cashReceived);
      if (isNaN(cash) || cash < cartTotal) {
        alert('Silakan masukkan jumlah uang tunai yang cukup');
        return;
      }
    }

    const receipt = {
      id: `REC-${Date.now()}`,
      date: new Date().toLocaleString('id-ID'),
      items: [...cart],
      subtotal: cartTotal,
      tax: cartTotal * 0.11, // PPN 11%
      total: cartTotal * 1.11,
      paymentMethod: selectedPaymentMethod,
      change: selectedPaymentMethod === 'cash' ? parseFloat(cashReceived) - (cartTotal * 1.11) : 0,
      cashier: currentUser.email
    };

    // Simpan ke Firestore
    try {
      await addDoc(collection(db, 'orders'), {
        ...receipt,
        createdAt: new Date()
      });
      setReceiptData(receipt);
      setIsPaymentModalOpen(false);
      setIsReceiptModalOpen(true);
      clearCart();
      setCashReceived('');
    } catch (err) {
      console.error('Error saving order:', err);
      alert('Gagal menyimpan transaksi!');
    }
  };

  // Cetak struk
  const printReceipt = () => {
    window.print();
  };

  // Edit produk
  const handleEditProduct = (product) => {
    setEditingProduct({ ...product });
  };

  // Simpan perubahan produk
  const handleSaveProduct = async () => {
    if (editingProduct) {
      try {
        await updateDoc(doc(db, 'products', editingProduct.id), editingProduct);
        setEditingProduct(null);
      } catch (err) {
        console.error('Error update product:', err);
        alert('Gagal mengupdate produk!');
      }
    }
  };

  // Hapus produk
  const handleDeleteProduct = async (id) => {
    if (window.confirm('Apakah Anda yakin ingin menghapus produk ini?')) {
      try {
        await deleteDoc(doc(db, 'products', id));
      } catch (err) {
        console.error('Error delete product:', err);
        alert('Gagal menghapus produk!');
      }
    }
  };

  // Tambah produk baru
  const handleAddProduct = async () => {
    if (newProduct.name && (newProduct.priceEcer || newProduct.priceGrosir)) {
      try {
        const docRef = await addDoc(collection(db, 'products'), {
          ...newProduct,
          hargaBeli: parseFloat(newProduct.hargaBeli) || 0,
          priceEcer: parseFloat(newProduct.priceEcer) || 0,
          priceGrosir: parseFloat(newProduct.priceGrosir) || 0,
          stock: parseInt(newProduct.stock) || 0,
          createdAt: new Date()
        });
        setNewProduct({
          name: '',
          hargaBeli: 0,
          priceEcer: 0,
          priceGrosir: 0,
          stock: 0,
          supplier: '',
          category: 'makanan',
          imageUrl: ''
        });
      } catch (err) {
        console.error('Error add product:', err);
        alert('Gagal menambahkan produk!');
      }
    }
  };

  // Import Excel (placeholder)
  const importFromExcel = () => {
    alert('Fitur import Excel akan diimplementasikan dengan SheetJS');
  };

  // Export Excel (placeholder)
  const exportToExcel = () => {
    alert('Fitur export Excel akan diimplementasikan');
  };

  // Kategori produk
  const categories = ['all', 'makanan', 'minuman', 'kebersihan', 'perawatan'];

  // Metode pembayaran
  const paymentMethods = [
    { id: 'cash', name: 'Tunai', icon: 'fas fa-money-bill-wave' },
    { id: 'card', name: 'Kartu Kredit', icon: 'fas fa-credit-card' },
    { id: 'e-wallet', name: 'E-Wallet', icon: 'fas fa-wallet' }
  ];

  if (!currentUser) return <div className="p-6">Loading...</div>;

  return (
    <>
      <Head>
        <title>ATAYATOKO - Admin POS</title>
        <link href="https://cdn.jsdelivr.net/npm/tailwindcss@2.2.19/dist/tailwind.min.css" rel="stylesheet" />
        <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css" />
        <style>{`
          body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; }
          @media print {
            body * { visibility: hidden; }
            #receipt, #receipt * { visibility: visible; }
            #receipt { position: absolute; left: 0; top: 0; width: 100%; }
          }
        `}</style>
      </Head>

      {/* Header */}
      <header className="bg-white shadow-sm border-b border-gray-200">
        <div className="flex items-center justify-between px-6 py-4">
          <div className="flex items-center">
            <div className="bg-indigo-600 p-2 rounded-lg mr-3">
              <i className="fas fa-cash-register text-white text-xl"></i>
            </div>
            <h1 className="text-2xl font-bold text-gray-900">ATAYATOKO - POS</h1>
          </div>
          <div className="flex items-center space-x-4">
            <div className="flex bg-gray-100 rounded-lg p-1">
              <button
                onClick={() => setActiveTab('pos')}
                className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                  activeTab === 'pos'
                    ? 'bg-white text-indigo-700 shadow-sm'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                POS
              </button>
              <button
                onClick={() => setActiveTab('backoffice')}
                className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                  activeTab === 'backoffice'
                    ? 'bg-white text-indigo-700 shadow-sm'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                Back Office
              </button>
            </div>
            <div className="text-right hidden sm:block">
              <p className="text-sm font-medium text-gray-900">Admin</p>
              <p className="text-xs text-gray-500">{currentUser.email}</p>
            </div>
            <button
              onClick={() => signOut(auth).then(() => router.push('/'))}
              className="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-lg text-sm font-medium"
            >
              Logout
            </button>
          </div>
        </div>
      </header>

      {activeTab === 'pos' ? (
        <div className="flex">
          {/* Left Panel - Products */}
          <div className="w-full lg:w-2/3 xl:w-3/4 p-6">
            {/* Search and Categories */}
            <div className="bg-white rounded-xl shadow-sm p-6 mb-6">
              <div className="flex flex-col sm:flex-row gap-4 mb-6">
                <div className="relative flex-1">
                  <i className="fas fa-search absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400"></i>
                  <input
                    type="text"
                    placeholder="Cari produk..."
                    className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                  />
                </div>
                <div className="flex flex-wrap gap-2">
                  {categories.map(category => (
                    <button
                      key={category}
                      onClick={() => setSelectedCategory(category)}
                      className={`px-4 py-2 rounded-full text-sm font-medium transition-colors ${
                        selectedCategory === category
                          ? 'bg-indigo-600 text-white'
                          : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                      }`}
                    >
                      {category === 'all' ? 'Semua' : category}
                    </button>
                  ))}
                </div>
              </div>

              {/* Products Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {filteredProducts.map(product => (
                  <div
                    key={product.id}
                    className="border border-gray-200 rounded-xl p-4 hover:shadow-md transition-shadow cursor-pointer bg-white"
                    onClick={() => addToCart(product)}
                  >
                    <div className="flex justify-center mb-3">
                      <img
                        src={product.imageUrl || '/placeholder.webp'}
                        alt={product.name}
                        className="w-16 h-16 object-cover rounded-lg"
                        onError={(e) => e.target.src = '/placeholder.webp'}
                      />
                    </div>
                    <h3 className="font-medium text-gray-900 text-center mb-1">{product.name}</h3>
                    <p className="text-indigo-600 font-bold text-center mb-2">{formatRupiah(product.priceEcer)}</p>
                    <div className="flex justify-between items-center text-sm text-gray-600">
                      <span>{product.category}</span>
                      <span>Stok: {product.stock}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Right Panel - Cart */}
          <div className="w-full lg:w-1/3 xl:w-1/4 p-6">
            <div className="bg-white rounded-xl shadow-sm p-6 sticky top-6">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-xl font-bold text-gray-900">Keranjang Belanja</h2>
                {cart.length > 0 && (
                  <button
                    onClick={clearCart}
                    className="text-red-600 hover:text-red-800 text-sm font-medium"
                  >
                    Kosongkan
                  </button>
                )}
              </div>

              {cart.length === 0 ? (
                <div className="text-center py-12">
                  <i className="fas fa-shopping-cart text-3xl text-gray-400 mb-4"></i>
                  <p className="text-gray-500">Keranjang belanja kosong</p>
                  <p className="text-sm text-gray-400 mt-2">Tambahkan produk</p>
                </div>
              ) : (
                <>
                  <div className="space-y-4 max-h-96 overflow-y-auto mb-6">
                    {cart.map(item => (
                      <div key={item.id} className="flex items-center justify-between p-3 border border-gray-200 rounded-lg">
                        <div className="flex items-center">
                          <img
                            src={item.imageUrl || '/placeholder.webp'}
                            alt={item.name}
                            className="w-10 h-10 object-cover rounded mr-3"
                            onError={(e) => e.target.src = '/placeholder.webp'}
                          />
                          <div>
                            <p className="font-medium text-gray-900 text-sm">{item.name}</p>
                            <p className="text-indigo-600 font-medium">{formatRupiah(item.price)}</p>
                          </div>
                        </div>
                        <div className="flex items-center space-x-2">
                          <button
                            onClick={() => updateQuantity(item.id, item.quantity - 1)}
                            className="p-1 rounded-full bg-gray-200 hover:bg-gray-300"
                          >
                            <i className="fas fa-minus text-xs"></i>
                          </button>
                          <span className="font-medium w-8 text-center">{item.quantity}</span>
                          <button
                            onClick={() => updateQuantity(item.id, item.quantity + 1)}
                            className="p-1 rounded-full bg-gray-200 hover:bg-gray-300"
                          >
                            <i className="fas fa-plus text-xs"></i>
                          </button>
                          <button
                            onClick={() => removeFromCart(item.id)}
                            className="p-1 rounded-full bg-red-100 hover:bg-red-200 ml-2"
                          >
                            <i className="fas fa-times text-xs text-red-600"></i>
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="border-t border-gray-200 pt-4 space-y-3">
                    <div className="flex justify-between">
                      <span className="text-gray-600">Subtotal:</span>
                      <span className="font-medium">{formatRupiah(cartTotal)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-600">PPN (11%):</span>
                      <span className="font-medium">{formatRupiah(cartTotal * 0.11)}</span>
                    </div>
                    <div className="flex justify-between text-lg font-bold border-t border-gray-200 pt-2">
                      <span>Total:</span>
                      <span>{formatRupiah(cartTotal * 1.11)}</span>
                    </div>
                  </div>

                  <button
                    onClick={() => setIsPaymentModalOpen(true)}
                    className="w-full bg-gradient-to-r from-indigo-600 to-purple-700 hover:from-indigo-700 hover:to-purple-800 text-white font-bold py-4 px-6 rounded-xl mt-6 transition-all duration-200 shadow-lg hover:shadow-xl"
                  >
                    Bayar {formatRupiah(cartTotal * 1.11)}
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      ) : (
        /* Back Office */
        <div className="p-6">
          <div className="bg-white rounded-xl shadow-sm p-6">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6">
              <h2 className="text-2xl font-bold text-gray-900 mb-4 sm:mb-0">Manajemen Produk</h2>
              <div className="flex flex-col sm:flex-row gap-3 w-full sm:w-auto">
                <button
                  onClick={exportToExcel}
                  className="flex items-center justify-center bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg transition-colors"
                >
                  <i className="fas fa-file-download mr-2"></i>
                  Export Excel
                </button>
                <button
                  onClick={importFromExcel}
                  className="flex items-center justify-center bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg transition-colors"
                >
                  <i className="fas fa-file-upload mr-2"></i>
                  Import Excel
                </button>
              </div>
            </div>

            {/* Add New Product Form */}
            <div className="border border-gray-200 rounded-xl p-6 mb-6 bg-gray-50">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Tambah Produk Baru</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <input
                  type="text"
                  placeholder="Nama Produk"
                  className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
                  value={newProduct.name}
                  onChange={(e) => setNewProduct({...newProduct, name: e.target.value})}
                />
                <input
                  type="number"
                  placeholder="Harga Beli"
                  className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
                  value={newProduct.hargaBeli}
                  onChange={(e) => setNewProduct({...newProduct, hargaBeli: e.target.value})}
                />
                <input
                  type="number"
                  placeholder="Harga Ecer"
                  className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
                  value={newProduct.priceEcer}
                  onChange={(e) => setNewProduct({...newProduct, priceEcer: e.target.value})}
                />
                <input
                  type="number"
                  placeholder="Harga Grosir"
                  className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
                  value={newProduct.priceGrosir}
                  onChange={(e) => setNewProduct({...newProduct, priceGrosir: e.target.value})}
                />
                <input
                  type="number"
                  placeholder="Stok"
                  className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
                  value={newProduct.stock}
                  onChange={(e) => setNewProduct({...newProduct, stock: e.target.value})}
                />
                <input
                  type="text"
                  placeholder="Supplier"
                  className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
                  value={newProduct.supplier}
                  onChange={(e) => setNewProduct({...newProduct, supplier: e.target.value})}
                />
                <select
                  className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
                  value={newProduct.category}
                  onChange={(e) => setNewProduct({...newProduct, category: e.target.value})}
                >
                  <option value="makanan">Makanan</option>
                  <option value="minuman">Minuman</option>
                  <option value="kebersihan">Kebersihan</option>
                  <option value="perawatan">Perawatan</option>
                </select>
                <input
                  type="text"
                  placeholder="URL Foto"
                  className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
                  value={newProduct.imageUrl}
                  onChange={(e) => setNewProduct({...newProduct, imageUrl: e.target.value})}
                />
              </div>
              <button
                onClick={handleAddProduct}
                className="mt-4 bg-green-600 hover:bg-green-700 text-white px-6 py-2 rounded-lg font-medium transition-colors"
              >
                Tambah Produk
              </button>
            </div>

            {/* Products Table */}
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="bg-gray-100">
                    <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">Produk</th>
                    <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">Kategori</th>
                    <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">Harga Beli</th>
                    <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">Harga Ecer</th>
                    <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">Stok</th>
                    <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">Aksi</th>
                  </tr>
                </thead>
                <tbody>
                  {products.map(product => (
                    <tr key={product.id} className="border-b border-gray-200 hover:bg-gray-50">
                      {editingProduct && editingProduct.id === product.id ? (
                        <>
                          <td className="px-4 py-3">
                            <input
                              type="text"
                              className="w-full px-2 py-1 border border-gray-300 rounded focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
                              value={editingProduct.name}
                              onChange={(e) => setEditingProduct({...editingProduct, name: e.target.value})}
                            />
                          </td>
                          <td className="px-4 py-3">
                            <select
                              className="w-full px-2 py-1 border border-gray-300 rounded focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
                              value={editingProduct.category}
                              onChange={(e) => setEditingProduct({...editingProduct, category: e.target.value})}
                            >
                              <option value="makanan">Makanan</option>
                              <option value="minuman">Minuman</option>
                              <option value="kebersihan">Kebersihan</option>
                              <option value="perawatan">Perawatan</option>
                            </select>
                          </td>
                          <td className="px-4 py-3">
                            <input
                              type="number"
                              className="w-full px-2 py-1 border border-gray-300 rounded focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
                              value={editingProduct.hargaBeli}
                              onChange={(e) => setEditingProduct({...editingProduct, hargaBeli: e.target.value})}
                            />
                          </td>
                          <td className="px-4 py-3">
                            <input
                              type="number"
                              className="w-full px-2 py-1 border border-gray-300 rounded focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
                              value={editingProduct.priceEcer}
                              onChange={(e) => setEditingProduct({...editingProduct, priceEcer: e.target.value})}
                            />
                          </td>
                          <td className="px-4 py-3">
                            <input
                              type="number"
                              className="w-full px-2 py-1 border border-gray-300 rounded focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
                              value={editingProduct.stock}
                              onChange={(e) => setEditingProduct({...editingProduct, stock: e.target.value})}
                            />
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex space-x-2">
                              <button
                                onClick={handleSaveProduct}
                                className="p-1 bg-green-600 text-white rounded hover:bg-green-700"
                              >
                                <i className="fas fa-save text-xs"></i>
                              </button>
                              <button
                                onClick={() => setEditingProduct(null)}
                                className="p-1 bg-gray-600 text-white rounded hover:bg-gray-700"
                              >
                                <i className="fas fa-undo text-xs"></i>
                              </button>
                            </div>
                          </td>
                        </>
                      ) : (
                        <>
                          <td className="px-4 py-3">
                            <div className="flex items-center">
                              <img
                                src={product.imageUrl || '/placeholder.webp'}
                                alt={product.name}
                                className="w-8 h-8 object-cover rounded mr-3"
                                onError={(e) => e.target.src = '/placeholder.webp'}
                              />
                              <span className="font-medium text-gray-900">{product.name}</span>
                            </div>
                          </td>
                          <td className="px-4 py-3 text-gray-700">{product.category}</td>
                          <td className="px-4 py-3 text-gray-700">{formatRupiah(product.hargaBeli)}</td>
                          <td className="px-4 py-3 text-indigo-600 font-medium">{formatRupiah(product.priceEcer)}</td>
                          <td className="px-4 py-3 text-gray-700">{product.stock}</td>
                          <td className="px-4 py-3">
                            <div className="flex space-x-2">
                              <button
                                onClick={() => handleEditProduct(product)}
                                className="p-1 bg-blue-600 text-white rounded hover:bg-blue-700"
                              >
                                <i className="fas fa-edit text-xs"></i>
                              </button>
                              <button
                                onClick={() => handleDeleteProduct(product.id)}
                                className="p-1 bg-red-600 text-white rounded hover:bg-red-700"
                              >
                                <i className="fas fa-trash text-xs"></i>
                              </button>
                            </div>
                          </td>
                        </>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Payment Modal */}
      {isPaymentModalOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-xl font-bold text-gray-900">Pembayaran</h3>
              <button
                onClick={() => setIsPaymentModalOpen(false)}
                className="p-2 hover:bg-gray-100 rounded-full"
              >
                <i className="fas fa-times"></i>
              </button>
            </div>

            <div className="space-y-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-3">Metode Pembayaran</label>
                <div className="grid grid-cols-3 gap-3">
                  {paymentMethods.map(method => (
                    <button
                      key={method.id}
                      onClick={() => setSelectedPaymentMethod(method.id)}
                      className={`p-4 rounded-xl border-2 transition-all ${
                        selectedPaymentMethod === method.id
                          ? 'border-indigo-500 bg-indigo-50'
                          : 'border-gray-200 hover:border-gray-300'
                      }`}
                    >
                      <i className={`${method.icon} mx-auto mb-2 text-gray-600`}></i>
                      <span className="text-sm font-medium text-gray-700">{method.name}</span>
                    </button>
                  ))}
                </div>
              </div>

              {selectedPaymentMethod === 'cash' && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Uang Tunai Diterima
                  </label>
                  <div className="relative">
                    <i className="fas fa-money-bill-wave absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400"></i>
                    <input
                      type="number"
                      className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
                      value={cashReceived}
                      onChange={(e) => setCashReceived(e.target.value)}
                      placeholder="0"
                    />
                  </div>
                  {cashReceived && (
                    <div className="mt-2 text-sm text-green-600">
                      Kembalian: {formatRupiah(parseFloat(cashReceived) - (cartTotal * 1.11))}
                    </div>
                  )}
                </div>
              )}

              <div className="bg-gray-50 rounded-lg p-4">
                <div className="flex justify-between mb-1">
                  <span className="text-gray-600">Total:</span>
                  <span className="font-bold">{formatRupiah(cartTotal * 1.11)}</span>
                </div>
                {selectedPaymentMethod === 'cash' && cashReceived && (
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
                className="w-full bg-gradient-to-r from-indigo-600 to-purple-700 hover:from-indigo-700 hover:to-purple-800 text-white font-bold py-3 px-6 rounded-xl transition-all duration-200"
              >
                Selesaikan Pembayaran
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Receipt Modal */}
      {isReceiptModalOpen && receiptData && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 relative" id="receipt">
            <div className="text-center">
              <div className="border-b-2 border-gray-300 pb-4 mb-4">
                <h2 className="text-xl font-bold text-gray-900">STRUK PEMBAYARAN</h2>
                <p className="text-sm text-gray-600 mt-1">Terima kasih atas pembelian Anda!</p>
              </div>
              
              <div className="text-left mb-4">
                <p className="text-sm text-gray-600">No. Struk: {receiptData.id}</p>
                <p className="text-sm text-gray-600">Tanggal: {receiptData.date}</p>
                <p className="text-sm text-gray-600">Kasir: {receiptData.cashier}</p>
              </div>

              <div className="border-t border-b border-gray-300 py-2 mb-4">
                {receiptData.items.map(item => (
                  <div key={item.id} className="flex justify-between text-sm mb-1">
                    <span>{item.name} x{item.quantity}</span>
                    <span>{formatRupiah(item.price * item.quantity)}</span>
                  </div>
                ))}
              </div>

              <div className="text-left space-y-1 mb-4">
                <div className="flex justify-between">
                  <span>Subtotal:</span>
                  <span>{formatRupiah(receiptData.subtotal)}</span>
                </div>
                <div className="flex justify-between">
                  <span>PPN (11%):</span>
                  <span>{formatRupiah(receiptData.tax)}</span>
                </div>
                <div className="flex justify-between font-bold text-lg pt-2 border-t border-gray-300">
                  <span>Total:</span>
                  <span>{formatRupiah(receiptData.total)}</span>
                </div>
                <div className="flex justify-between">
                  <span>Metode Bayar:</span>
                  <span>
                    {paymentMethods.find(m => m.id === receiptData.paymentMethod)?.name || receiptData.paymentMethod}
                  </span>
                </div>
                {receiptData.change > 0 && (
                  <div className="flex justify-between text-green-600">
                    <span>Kembalian:</span>
                    <span>{formatRupiah(receiptData.change)}</span>
                  </div>
                )}
              </div>

              <div className="text-sm text-gray-600">
                <p>Selamat berbelanja kembali!</p>
                <p className="mt-2">ATAYATOKO</p>
                <p>Jl. Raya Utama No. 123</p>
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <button
                onClick={printReceipt}
                className="flex-1 bg-green-600 hover:bg-green-700 text-white font-medium py-2 px-4 rounded-lg flex items-center justify-center"
              >
                <i className="fas fa-print mr-2"></i>
                Cetak
              </button>
              <button
                onClick={() => setIsReceiptModalOpen(false)}
                className="flex-1 bg-gray-600 hover:bg-gray-700 text-white font-medium py-2 px-4 rounded-lg"
              >
                Tutup
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}