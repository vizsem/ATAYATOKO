// pages/admin.js
import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';
import {
  collection,
  doc,
  getDoc,
  getDocs,
  addDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  onSnapshot,
  writeBatch,
  increment,
  serverTimestamp
} from 'firebase/firestore';
import { getDownloadURL, ref, uploadBytes } from 'firebase/storage';
import * as XLSX from 'xlsx';
import JSZip from 'jszip';
import { saveAs } from 'file-saver';
import { auth, db, storage } from '../lib/firebase';
import { signOut, onAuthStateChanged } from 'firebase/auth';

// ========== FITUR BARU: localStorage untuk keranjang ==========
const CART_STORAGE_KEY = 'admin_pos_cart_atayatoko';

const saveCartToStorage = (cart) => {
  if (typeof window !== 'undefined') {
    try {
      localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(cart));
    } catch (e) {
      console.warn('Gagal simpan keranjang ke localStorage');
    }
  }
};

const loadCartFromStorage = () => {
  if (typeof window !== 'undefined') {
    try {
      const saved = localStorage.getItem(CART_STORAGE_KEY);
      return saved ? JSON.parse(saved) : [];
    } catch (e) {
      return [];
    }
  }
  return [];
};

// ========== Komponen Preview Struk ==========
const ReceiptModal = ({ isOpen, receiptData, onClose, onPrint }) => {
  if (!isOpen || !receiptData) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-2">
      <div className="bg-white rounded-lg w-full max-w-md overflow-hidden font-mono text-xs relative">
        <div className="p-4" style={{ fontFamily: 'monospace', fontSize: '14px', lineHeight: 1.4 }}>
          <div className="text-center mb-3">
            <div className="font-bold">{receiptData.storeName}</div>
            <div>{receiptData.storeAddress}</div>
            <div>Telp: {receiptData.storePhone}</div>
            <div className="mt-1">{receiptData.date} {receiptData.time}</div>
            <div>No. Struk: {receiptData.id}</div>
            <div>Kasir: {receiptData.cashier}</div>
          </div>
          
          <div className="border-t border-dashed border-black my-2"></div>
          
          {receiptData.items.map((item, i) => (
            <div key={i} className="flex justify-between text-[12px]">
              <span>{item.name.substring(0, 12)}</span>
              <span>x{item.quantity}</span>
              <span>{(item.price * item.quantity).toLocaleString('id-ID')}</span>
            </div>
          ))}
          
          <div className="border-t border-dashed border-black my-2 pt-1"></div>
          
          <div className="flex justify-between font-bold">
            <span>TOTAL</span>
            <span>{receiptData.total.toLocaleString('id-ID')}</span>
          </div>
          <div className="flex justify-between">
            <span>BAYAR</span>
            <span>{
              receiptData.paymentMethod === 'cash' 
                ? receiptData.cashReceived?.toLocaleString('id-ID') 
                : receiptData.total.toLocaleString('id-ID')
            }</span>
          </div>
          <div className="flex justify-between">
            <span>KEMBALI</span>
            <span>{receiptData.change?.toLocaleString('id-ID') || '0'}</span>
          </div>
          
          <div className="border-t border-dashed border-black my-2 pt-1"></div>
          
          <div className="text-center mt-2">TERIMA KASIH</div>
          <div className="text-center text-[10px] mt-1">{receiptData.storeName}</div>
        </div>

        <div className="p-3 bg-gray-50 flex gap-2">
          <button
            onClick={onPrint}
            className="flex-1 bg-green-600 text-white py-1.5 rounded text-sm hover:bg-green-700"
          >
            Cetak
          </button>
          <button
            onClick={onClose}
            className="flex-1 bg-gray-300 text-gray-800 py-1.5 rounded text-sm hover:bg-gray-400"
          >
            Tutup
          </button>
        </div>
      </div>
    </div>
  );
};

// ========== Fungsi Bantu ==========
const formatRupiah = (angka) => {
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    minimumFractionDigits: 0
  }).format(angka);
};

const generateReceiptId = () => {
  return `AD${Date.now().toString(36).toUpperCase()}`;
};

export default function AdminDashboard() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState('pos');
  const [products, setProducts] = useState([]);
  const [filteredProducts, setFilteredProducts] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [cart, setCart] = useState(() => loadCartFromStorage());
  const [currentUser, setCurrentUser] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  
  // Product form
  const [productForm, setProductForm] = useState({
    name: '',
    priceEcer: '',
    priceGrosir: '',
    stock: '',
    category: '',
    barcode: ''
  });
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [isProductModalOpen, setIsProductModalOpen] = useState(false);
  const [file, setFile] = useState(null);
  const fileInputRef = useRef(null);
  const barcodeInputRef = useRef(null);
  
  // Sales report
  const [salesReport, setSalesReport] = useState([]);
  const [reportFilter, setReportFilter] = useState('today');
  
  // Receipt
  const [receiptData, setReceiptData] = useState(null);
  const [isReceiptModalOpen, setIsReceiptModalOpen] = useState(false);
  
  // ========== Simpan keranjang ke localStorage ==========
  useEffect(() => {
    saveCartToStorage(cart);
  }, [cart]);
  
  // ========== Autentikasi ==========
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        router.push('/admin/login');
        return;
      }
      
      try {
        const userDoc = await getDoc(doc(db, 'users', user.uid));
        if (!userDoc.exists() || userDoc.data().role !== 'admin') {
          signOut(auth);
          router.push('/admin/login');
        } else {
          setCurrentUser(userDoc.data());
          setIsLoading(false);
        }
      } catch (err) {
        setError('Gagal memuat data pengguna');
        setIsLoading(false);
      }
    });
    return () => unsubscribe();
  }, []);
  
  // ========== Muat Produk ==========
  useEffect(() => {
    if (!currentUser) return;
    
    const unsubscribe = onSnapshot(collection(db, 'products'), (snapshot) => {
      const list = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setProducts(list);
      setFilteredProducts(list);
    }, (err) => {
      setError('Gagal memuat produk');
    });
    
    return () => unsubscribe();
  }, [currentUser]);
  
  // ========== Filter Produk ==========
  useEffect(() => {
    let result = products;
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      result = result.filter(p => p.name.toLowerCase().includes(term));
    }
    if (selectedCategory !== 'all') {
      result = result.filter(p => p.category === selectedCategory);
    }
    setFilteredProducts(result);
  }, [products, searchTerm, selectedCategory]);
  
  // ========== Muat Laporan Penjualan ==========
  useEffect(() => {
    if (!currentUser) return;
    
    const fetchSales = async () => {
      try {
        let q;
        const now = new Date();
        const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const startOfWeek = new Date(now);
        startOfWeek.setDate(now.getDate() - now.getDay());
        const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
        
        switch (reportFilter) {
          case 'today':
            q = query(collection(db, 'orders'), where('createdAt', '>=', startOfDay));
            break;
          case 'week':
            q = query(collection(db, 'orders'), where('createdAt', '>=', startOfWeek));
            break;
          case 'month':
            q = query(collection(db, 'orders'), where('createdAt', '>=', startOfMonth));
            break;
          default:
            q = collection(db, 'orders');
        }
        
        const snapshot = await getDocs(q);
        const orders = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        setSalesReport(orders);
      } catch (err) {
        console.error('Gagal muat laporan:', err);
      }
    };
    
    fetchSales();
  }, [reportFilter, currentUser]);
  
  // ========== Fungsi POS ==========
  const addToCart = useCallback((product) => {
    setCart(prev => {
      const existing = prev.find(item => item.id === product.id);
      if (existing) {
        return prev.map(item =>
          item.id === product.id ? { ...item, quantity: item.quantity + 1 } : item
        );
      }
      return [...prev, { ...product, quantity: 1, price: product.priceEcer }];
    });
  }, []);
  
  const updateQuantity = useCallback((id, qty) => {
    if (qty <= 0) {
      setCart(prev => prev.filter(item => item.id !== id));
      return;
    }
    setCart(prev =>
      prev.map(item => item.id === id ? { ...item, quantity: qty } : item)
    );
  }, []);
  
  const processPayment = async (paymentMethod, cashReceived = 0) => {
    const total = cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);
    const totalWithTax = total * 1.11;
    let change = 0;
    
    if (paymentMethod === 'cash') {
      const cash = parseFloat(cashReceived);
      if (isNaN(cash) || cash < totalWithTax) {
        alert('Uang tunai tidak cukup!');
        return;
      }
      change = cash - totalWithTax;
    }
    
    const now = new Date();
    const receiptId = generateReceiptId();
    
    try {
      const batch = writeBatch(db);
      const orderItems = [];
      
      for (const item of cart) {
        batch.update(doc(db, 'products', item.id), { stock: increment(-item.quantity) });
        orderItems.push({
          id: item.id,
          name: item.name,
          price: item.price,
          quantity: item.quantity
        });
      }
      
      const orderData = {
        id: receiptId,
        date: now.toLocaleDateString('id-ID'),
        time: now.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }),
        items: orderItems,
        subtotal: total,
        tax: total * 0.11,
        total: totalWithTax,
        paymentMethod,
        change,
        cashier: currentUser.email,
        cashReceived: paymentMethod === 'cash' ? cashReceived : 0,
        createdAt: serverTimestamp()
      };
      
      await addDoc(collection(db, 'orders'), orderData);
      await batch.commit();
      
      // Siapkan data struk
      const receipt = {
        ...orderData,
        storeName: "ATAYATOKO",
        storeAddress: "Jl. Pandan 98, Semen, Kediri",
        storePhone: "085790565666",
        date: now.toLocaleDateString('id-ID'),
        time: now.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })
      };
      
      setReceiptData(receipt);
      setIsReceiptModalOpen(true);
      setCart([]);
      saveCartToStorage([]);
    } catch (err) {
      alert('Gagal memproses transaksi: ' + (err.message || 'Kesalahan tidak diketahui'));
    }
  };
  
  // ========== Cetak Struk ==========
  const handlePrintReceipt = useCallback(() => {
    if (!receiptData) return;
    
    const printContent = `
      <div style="font-family: monospace; width: 280px; font-size: 14px; line-height: 1.4; padding: 10px;">
        <div class="center" style="text-align: center; font-weight: bold;">${receiptData.storeName}</div>
        <div class="center" style="text-align: center;">${receiptData.storeAddress}</div>
        <div class="center" style="text-align: center;">Telp: ${receiptData.storePhone}</div>
        <hr style="border: 0; border-top: 1px dashed #000; margin: 8px 0;">
        <div>${receiptData.date} ${receiptData.time}</div>
        <div>No. Struk: ${receiptData.id}</div>
        <div>Kasir: ${receiptData.cashier}</div>
        <hr style="border: 0; border-top: 1px dashed #000; margin: 8px 0;">
        <div style="display: flex; justify-content: space-between;">
          <span>Barang</span>
          <span>Qty</span>
          <span>Total</span>
        </div>
        ${receiptData.items.map(item => `
          <div style="display: flex; justify-content: space-between; font-size: 12px;">
            <span>${item.name.substring(0, 12)}</span>
            <span>${item.quantity}</span>
            <span>${(item.price * item.quantity).toLocaleString('id-ID')}</span>
          </div>
        `).join('')}
        <hr style="border: 0; border-top: 1px dashed #000; margin: 8px 0;">
        <div style="display: flex; justify-content: space-between; font-weight: bold;">
          <span>TOTAL</span>
          <span></span>
          <span>${receiptData.total.toLocaleString('id-ID')}</span>
        </div>
        <div style="display: flex; justify-content: space-between;">
          <span>BAYAR</span>
          <span></span>
          <span>${
            receiptData.paymentMethod === 'cash' 
              ? receiptData.cashReceived?.toLocaleString('id-ID') 
              : receiptData.total.toLocaleString('id-ID')
          }</span>
        </div>
        <div style="display: flex; justify-content: space-between;">
          <span>KEMBALI</span>
          <span></span>
          <span>${receiptData.change?.toLocaleString('id-ID') || '0'}</span>
        </div>
        <hr style="border: 0; border-top: 1px dashed #000; margin: 8px 0;">
        <div class="center" style="text-align: center;">TERIMA KASIH</div>
        <div class="center" style="text-align: center;">${receiptData.storeName}</div>
      </div>
    `;
    
    const printWindow = window.open('', '_blank', 'width=300,height=600');
    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Struk ${receiptData.id}</title>
        <style>
          body { margin: 0; }
          hr { border: 0; border-top: 1px dashed #000; margin: 6px 0; }
        </style>
      </head>
      <body>${printContent}</body>
      </html>
    `);
    printWindow.document.close();
    printWindow.focus();
    printWindow.print();
    printWindow.close();
  }, [receiptData]);
  
  // ========== Fitur Produk ==========
  const handleProductSubmit = async (e) => {
    e.preventDefault();
    try {
      if (selectedProduct) {
        // Update
        await updateDoc(doc(db, 'products', selectedProduct.id), {
          ...productForm,
          priceEcer: parseFloat(productForm.priceEcer),
          priceGrosir: parseFloat(productForm.priceGrosir),
          stock: parseInt(productForm.stock),
          updatedAt: serverTimestamp()
        });
      } else {
        // Add new
        const productData = {
          ...productForm,
          priceEcer: parseFloat(productForm.priceEcer),
          priceGrosir: parseFloat(productForm.priceGrosir),
          stock: parseInt(productForm.stock),
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp()
        };
        await addDoc(collection(db, 'products'), productData);
      }
      setIsProductModalOpen(false);
      setProductForm({ name: '', priceEcer: '', priceGrosir: '', stock: '', category: '', barcode: '' });
      setSelectedProduct(null);
    } catch (err) {
      alert('Gagal menyimpan produk: ' + err.message);
    }
  };
  
  const handleDeleteProduct = async (id) => {
    if (confirm('Hapus produk ini?')) {
      try {
        await deleteDoc(doc(db, 'products', id));
      } catch (err) {
        alert('Gagal menghapus produk');
      }
    }
  };
  
  const handleExportExcel = () => {
    const worksheet = XLSX.utils.json_to_sheet(products.map(p => ({
      Nama: p.name,
      'Harga Ecer': p.priceEcer,
      'Harga Grosir': p.priceGrosir,
      Stok: p.stock,
      Kategori: p.category,
      Barcode: p.barcode || ''
    })));
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Products');
    XLSX.writeFile(workbook, 'produk_atayatoko.xlsx');
  };
  
  const handleImportExcel = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    
    const reader = new FileReader();
    reader.onload = (evt) => {
      const bstr = evt.target.result;
      const wb = XLSX.read(bstr, { type: 'binary' });
      const wsname = wb.SheetNames[0];
      const ws = wb.Sheets[wsname];
      const data = XLSX.utils.sheet_to_json(ws);
      
      // Proses impor
      const batch = writeBatch(db);
      data.forEach(row => {
        const productRef = doc(collection(db, 'products'));
        batch.set(productRef, {
          name: row.Nama || '',
          priceEcer: parseFloat(row['Harga Ecer']) || 0,
          priceGrosir: parseFloat(row['Harga Grosir']) || 0,
          stock: parseInt(row.Stok) || 0,
          category: row.Kategori || 'lainnya',
          barcode: row.Barcode || '',
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp()
        });
      });
      
      batch.commit().then(() => {
        alert('Impor berhasil!');
        setFile(null);
        if (fileInputRef.current) fileInputRef.current.value = '';
      }).catch(err => {
        alert('Gagal impor: ' + err.message);
      });
    };
    reader.readAsBinaryString(file);
  };
  
  // ========== Render ==========
  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-10 w-10 border-t-2 border-green-600 mx-auto"></div>
          <p className="mt-3 text-gray-600 text-sm">Memuat dashboard admin...</p>
        </div>
      </div>
    );
  }
  
  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-red-50 p-4">
        <div className="text-center bg-white p-6 rounded-xl shadow max-w-md">
          <div className="text-red-600 text-2xl mb-2">⚠️</div>
          <p className="text-red-700">{error}</p>
          <button
            onClick={() => router.reload()}
            className="mt-4 px-4 py-2 bg-red-600 text-white rounded-lg text-sm hover:bg-red-700"
          >
            Coba Lagi
          </button>
        </div>
      </div>
    );
  }
  
  const cartTotal = cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);
  const categories = ['all', ...new Set(products.map(p => p.category))];
  
  return (
    <>
      <Head>
        <title>ATAYATOKO - Admin Dashboard</title>
        {/* AMP-like: gunakan font sistem */}
        <style>{`
          body {
            font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
          }
          .font-mono {
            font-family: ui-monospace, SFMono-Regular, 'SF Mono', Monaco, monospace;
          }
        `}</style>
        <link rel="preconnect" href="https://cdnjs.cloudflare.com" />
        <link 
          rel="stylesheet" 
          href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css" 
          media="print" 
          onLoad="this.media='all'" 
        />
      </Head>

      <div className="min-h-screen bg-gray-50">
        {/* Header */}
        <header className="bg-white shadow-sm border-b border-gray-200">
          <div className="flex items-center justify-between px-4 py-3">
            <div className="flex items-center">
              <div className="bg-green-600 w-8 h-8 rounded-lg flex items-center justify-center mr-2">
                <i className="fas fa-store text-white text-sm"></i>
              </div>
              <h1 className="text-lg font-bold">ATAYATOKO Admin</h1>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-xs text-gray-600 hidden sm:block">Admin: {currentUser?.email}</span>
              <button
                onClick={() => signOut(auth).then(() => router.push('/'))}
                className="bg-red-600 text-white px-3 py-1.5 rounded text-sm hover:bg-red-700"
              >
                Logout
              </button>
            </div>
          </div>
        </header>

        {/* Tabs */}
        <div className="flex overflow-x-auto px-4 py-2 bg-white border-b">
          {['pos', 'products', 'reports'].map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-4 py-2 text-sm font-medium whitespace-nowrap mr-2 rounded-t-lg ${
                activeTab === tab
                  ? 'bg-green-600 text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              {tab === 'pos' ? 'POS' : tab === 'products' ? 'Produk' : 'Laporan'}
            </button>
          ))}
        </div>

        <div className="p-4">
          {/* POS Tab */}
          {activeTab === 'pos' && (
            <div className="flex flex-col lg:flex-row gap-4">
              {/* Products */}
              <div className="w-full lg:w-2/3">
                <div className="bg-white rounded-lg shadow-sm p-3 mb-4">
                  <div className="relative mb-3">
                    <i className="fas fa-search absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 text-xs"></i>
                    <input
                      type="text"
                      placeholder="Cari produk..."
                      className="w-full pl-8 pr-4 py-2 border border-gray-300 rounded focus:ring-1 focus:ring-green-500 focus:outline-none text-sm"
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                    />
                  </div>
                  <div className="flex gap-1 overflow-x-auto pb-2">
                    {categories.map(cat => (
                      <button
                        key={cat}
                        onClick={() => setSelectedCategory(cat)}
                        className={`text-xs px-2.5 py-1 rounded whitespace-nowrap ${
                          selectedCategory === cat
                            ? 'bg-green-600 text-white'
                            : 'bg-gray-100 text-gray-700'
                        }`}
                      >
                        {cat === 'all' ? 'Semua' : cat}
                      </button>
                    ))}
                  </div>
                </div>
                
                <div className="bg-white rounded-lg shadow-sm p-3">
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2">
                    {filteredProducts.map(product => (
                      <div
                        key={product.id}
                        className="border rounded p-2 text-center cursor-pointer hover:bg-gray-50"
                        onClick={() => addToCart(product)}
                      >
                        <div className="text-xs font-medium truncate">{product.name}</div>
                        <div className="text-green-600 font-bold text-xs mt-1">{formatRupiah(product.priceEcer)}</div>
                        <div className="text-gray-500 text-[10px] mt-0.5">Stok: {product.stock}</div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
              
              {/* Cart */}
              <div className="w-full lg:w-1/3">
                <div className="bg-white rounded-lg shadow-sm p-3 sticky top-24">
                  <div className="flex justify-between items-center mb-3">
                    <h2 className="font-bold">Keranjang</h2>
                    {cart.length > 0 && (
                      <button
                        onClick={() => setCart([])}
                        className="text-red-600 text-xs hover:text-red-800"
                      >
                        Kosongkan
                      </button>
                    )}
                  </div>
                  
                  {cart.length === 0 ? (
                    <p className="text-gray-500 text-center py-6">Keranjang kosong</p>
                  ) : (
                    <>
                      <div className="max-h-64 overflow-y-auto mb-4 space-y-2">
                        {cart.map(item => (
                          <div key={item.id} className="flex items-center justify-between p-2 border rounded">
                            <div>
                              <p className="text-xs font-medium">{item.name}</p>
                              <p className="text-green-600 text-xs">{formatRupiah(item.price)}</p>
                            </div>
                            <div className="flex items-center gap-1">
                              <button
                                onClick={() => updateQuantity(item.id, item.quantity - 1)}
                                className="w-6 h-6 rounded-full bg-gray-200 flex items-center justify-center text-xs"
                              >
                                -
                              </button>
                              <span className="text-xs w-6 text-center">{item.quantity}</span>
                              <button
                                onClick={() => updateQuantity(item.id, item.quantity + 1)}
                                className="w-6 h-6 rounded-full bg-gray-200 flex items-center justify-center text-xs"
                              >
                                +
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                      
                      <div className="border-t pt-3 space-y-1 mb-4">
                        <div className="flex justify-between text-sm">
                          <span>Subtotal:</span>
                          <span>{formatRupiah(cartTotal)}</span>
                        </div>
                        <div className="flex justify-between text-sm">
                          <span>PPN (11%):</span>
                          <span>{formatRupiah(cartTotal * 0.11)}</span>
                        </div>
                        <div className="flex justify-between font-bold">
                          <span>Total:</span>
                          <span>{formatRupiah(cartTotal * 1.11)}</span>
                        </div>
                      </div>
                      
                      <div className="flex gap-2">
                        <button
                          onClick={() => {
                            const cash = prompt('Masukkan jumlah uang tunai:');
                            if (cash) processPayment('cash', cash);
                          }}
                          className="flex-1 bg-green-600 text-white py-2 rounded text-sm hover:bg-green-700"
                        >
                          Tunai
                        </button>
                        <button
                          onClick={() => processPayment('qris')}
                          className="flex-1 bg-blue-600 text-white py-2 rounded text-sm hover:bg-blue-700"
                        >
                          QRIS
                        </button>
                      </div>
                    </>
                  )}
                </div>
              </div>
            </div>
          )}
          
          {/* Products Tab */}
          {activeTab === 'products' && (
            <div className="bg-white rounded-lg shadow-sm p-4">
              <div className="flex flex-col sm:flex-row gap-3 mb-4">
                <button
                  onClick={() => {
                    setIsProductModalOpen(true);
                    setSelectedProduct(null);
                    setProductForm({ name: '', priceEcer: '', priceGrosir: '', stock: '', category: '', barcode: '' });
                  }}
                  className="bg-green-600 text-white px-4 py-2 rounded text-sm hover:bg-green-700"
                >
                  Tambah Produk
                </button>
                <button
                  onClick={handleExportExcel}
                  className="bg-blue-600 text-white px-4 py-2 rounded text-sm hover:bg-blue-700"
                >
                  Ekspor Excel
                </button>
                <input
                  type="file"
                  accept=".xlsx,.xls"
                  onChange={handleImportExcel}
                  ref={fileInputRef}
                  className="hidden"
                />
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="bg-purple-600 text-white px-4 py-2 rounded text-sm hover:bg-purple-700"
                >
                  Impor Excel
                </button>
              </div>
              
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead>
                    <tr>
                      <th className="px-2 py-2 text-left text-xs font-medium text-gray-500 uppercase">Nama</th>
                      <th className="px-2 py-2 text-left text-xs font-medium text-gray-500 uppercase">Ecer</th>
                      <th className="px-2 py-2 text-left text-xs font-medium text-gray-500 uppercase">Grosir</th>
                      <th className="px-2 py-2 text-left text-xs font-medium text-gray-500 uppercase">Stok</th>
                      <th className="px-2 py-2 text-left text-xs font-medium text-gray-500 uppercase">Kategori</th>
                      <th className="px-2 py-2 text-left text-xs font-medium text-gray-500 uppercase">Aksi</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {products.map(product => (
                      <tr key={product.id} className="hover:bg-gray-50">
                        <td className="px-2 py-2 text-xs">{product.name}</td>
                        <td className="px-2 py-2 text-xs">{formatRupiah(product.priceEcer)}</td>
                        <td className="px-2 py-2 text-xs">{formatRupiah(product.priceGrosir)}</td>
                        <td className={`px-2 py-2 text-xs ${product.stock < 5 ? 'text-red-600 font-bold' : ''}`}>
                          {product.stock}
                        </td>
                        <td className="px-2 py-2 text-xs">{product.category}</td>
                        <td className="px-2 py-2 text-xs">
                          <button
                            onClick={() => {
                              setSelectedProduct(product);
                              setProductForm({
                                name: product.name,
                                priceEcer: product.priceEcer,
                                priceGrosir: product.priceGrosir,
                                stock: product.stock,
                                category: product.category,
                                barcode: product.barcode || ''
                              });
                              setIsProductModalOpen(true);
                            }}
                            className="text-blue-600 hover:text-blue-800 mr-2"
                          >
                            Edit
                          </button>
                          <button
                            onClick={() => handleDeleteProduct(product.id)}
                            className="text-red-600 hover:text-red-800"
                          >
                            Hapus
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
          
          {/* Reports Tab */}
          {activeTab === 'reports' && (
            <div className="bg-white rounded-lg shadow-sm p-4">
              <div className="flex flex-wrap gap-2 mb-4">
                {['today', 'week', 'month'].map(period => (
                  <button
                    key={period}
                    onClick={() => setReportFilter(period)}
                    className={`px-3 py-1.5 text-xs rounded ${
                      reportFilter === period
                        ? 'bg-green-600 text-white'
                        : 'bg-gray-100 text-gray-700'
                    }`}
                  >
                    {period === 'today' ? 'Hari Ini' : period === 'week' ? 'Minggu Ini' : 'Bulan Ini'}
                  </button>
                ))}
              </div>
              
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead>
                    <tr>
                      <th className="px-2 py-2 text-left text-xs font-medium text-gray-500 uppercase">No</th>
                      <th className="px-2 py-2 text-left text-xs font-medium text-gray-500 uppercase">Tanggal</th>
                      <th className="px-2 py-2 text-left text-xs font-medium text-gray-500 uppercase">Total</th>
                      <th className="px-2 py-2 text-left text-xs font-medium text-gray-500 uppercase">Kasir</th>
                      <th className="px-2 py-2 text-left text-xs font-medium text-gray-500 uppercase">Aksi</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {salesReport.map((order, index) => (
                      <tr key={order.id} className="hover:bg-gray-50">
                        <td className="px-2 py-2 text-xs">{index + 1}</td>
                        <td className="px-2 py-2 text-xs">{order.date} {order.time}</td>
                        <td className="px-2 py-2 text-xs font-bold">{formatRupiah(order.total)}</td>
                        <td className="px-2 py-2 text-xs">{order.cashier}</td>
                        <td className="px-2 py-2 text-xs">
                          <button
                            onClick={() => {
                              const mockReceipt = {
                                ...order,
                                storeName: "ATAYATOKO",
                                storeAddress: "Jl. Pandan 98, Semen, Kediri",
                                storePhone: "085790565666",
                                items: order.items || [],
                                cashier: order.cashier || 'admin',
                                change: order.change || 0,
                                cashReceived: order.cashReceived || order.total
                              };
                              setReceiptData(mockReceipt);
                              setIsReceiptModalOpen(true);
                            }}
                            className="text-blue-600 hover:text-blue-800 text-[10px]"
                          >
                            Cetak Ulang
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        {/* Product Modal */}
        {isProductModalOpen && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-lg w-full max-w-md p-5">
              <div className="flex justify-between items-center mb-4">
                <h3 className="font-bold">{selectedProduct ? 'Edit Produk' : 'Tambah Produk'}</h3>
                <button onClick={() => setIsProductModalOpen(false)} className="text-gray-500 hover:text-gray-700">
                  ✕
                </button>
              </div>
              
              <form onSubmit={handleProductSubmit}>
                <div className="space-y-3">
                  <div>
                    <label className="block text-xs text-gray-600 mb-1">Nama Produk</label>
                    <input
                      type="text"
                      required
                      className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm"
                      value={productForm.name}
                      onChange={(e) => setProductForm({...productForm, name: e.target.value})}
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs text-gray-600 mb-1">Harga Ecer</label>
                      <input
                        type="number"
                        required
                        className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm"
                        value={productForm.priceEcer}
                        onChange={(e) => setProductForm({...productForm, priceEcer: e.target.value})}
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-600 mb-1">Harga Grosir</label>
                      <input
                        type="number"
                        required
                        className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm"
                        value={productForm.priceGrosir}
                        onChange={(e) => setProductForm({...productForm, priceGrosir: e.target.value})}
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs text-gray-600 mb-1">Stok</label>
                      <input
                        type="number"
                        required
                        className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm"
                        value={productForm.stock}
                        onChange={(e) => setProductForm({...productForm, stock: e.target.value})}
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-600 mb-1">Kategori</label>
                      <input
                        type="text"
                        required
                        className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm"
                        value={productForm.category}
                        onChange={(e) => setProductForm({...productForm, category: e.target.value})}
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs text-gray-600 mb-1">Barcode (opsional)</label>
                    <input
                      type="text"
                      className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm"
                      value={productForm.barcode}
                      onChange={(e) => setProductForm({...productForm, barcode: e.target.value})}
                      ref={barcodeInputRef}
                    />
                  </div>
                </div>
                <div className="mt-5 flex gap-2">
                  <button
                    type="submit"
                    className="flex-1 bg-green-600 text-white py-2 rounded text-sm hover:bg-green-700"
                  >
                    Simpan
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsProductModalOpen(false)}
                    className="flex-1 bg-gray-200 text-gray-800 py-2 rounded text-sm hover:bg-gray-300"
                  >
                    Batal
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Receipt Modal */}
        <ReceiptModal
          isOpen={isReceiptModalOpen}
          receiptData={receiptData}
          onClose={() => setIsReceiptModalOpen(false)}
          onPrint={handlePrintReceipt}
        />
      </div>
    </>
  );
}