// pages/cashier/pos.js
import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';
import { 
  collection, 
  addDoc, 
  getDocs,
  getDoc,
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

// Konstanta
const CART_STORAGE_KEY = 'pos_cart_atayatoko';
const BUSINESS_NAME = 'ATAYATOKO';
const BUSINESS_MOTTO = 'Sembako Grosir & Ecer – Lengkap • Hemat • Terpercaya';

// Simpan ke localStorage (dengan penanganan error)
const saveCartToStorage = (cart) => {
  try {
    localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(cart));
  } catch (e) {
    console.warn('Gagal simpan ke localStorage:', e);
  }
};

// Muat dari localStorage
const loadCartFromStorage = () => {
  try {
    const saved = localStorage.getItem(CART_STORAGE_KEY);
    return saved ? JSON.parse(saved) : [];
  } catch (e) {
    console.warn('Gagal muat dari localStorage:', e);
    return [];
  }
};

// Komponen Struk (Thermal Printer Ready)
const ThermalReceipt = ({ receipt, isOpen, onClose, onPrint }) => {
  const receiptRef = useRef(null);

  if (!isOpen || !receipt) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-2 sm:p-4">
      <div className="bg-white rounded-lg w-full max-w-md overflow-hidden font-mono text-xs sm:text-sm relative">
        {/* Konten struk — format minimalis untuk thermal printer */}
        <div 
          ref={receiptRef}
          className="p-4"
          style={{ fontFamily: 'monospace', fontSize: '14px', lineHeight: 1.4 }}
        >
          <div className="text-center mb-3">
            <div className="font-bold">{BUSINESS_NAME}</div>
            <div>{BUSINESS_MOTTO}</div>
            <div className="mt-1">{receipt.dateTime}</div>
            <div>Struk: {receipt.id}</div>
          </div>
          
          <div className="border-t border-dashed border-black my-2"></div>
          
          {receipt.items.map((item, i) => (
            <div key={i} className="flex justify-between">
              <div>
                <span>{item.name}</span>
                <span className="ml-1">x{item.quantity}</span>
              </div>
              <span>{item.totalFormatted}</span>
            </div>
          ))}
          
          <div className="border-t border-dashed border-black my-2 pt-1"></div>
          
          <div className="flex justify-between font-bold">
            <span>TOTAL:</span>
            <span>{receipt.totalFormatted}</span>
          </div>
          <div className="flex justify-between">
            <span>Bayar:</span>
            <span>{receipt.cashReceivedFormatted}</span>
          </div>
          <div className="flex justify-between">
            <span>Kembali:</span>
            <span>{receipt.changeFormatted}</span>
          </div>
          
          <div className="border-t border-dashed border-black my-2 pt-1"></div>
          
          <div className="text-center mt-2">
            Terima kasih telah berbelanja!
          </div>
          <div className="text-center text-[10px] mt-1">
            Simpan struk ini sebagai bukti transaksi.
          </div>
        </div>

        <div className="p-4 bg-gray-50 flex gap-2">
          <button
            onClick={onPrint}
            className="flex-1 bg-green-600 text-white py-2 rounded font-medium hover:bg-green-700"
          >
            Cetak
          </button>
          <button
            onClick={onClose}
            className="flex-1 bg-gray-300 text-gray-800 py-2 rounded font-medium hover:bg-gray-400"
          >
            Tutup
          </button>
        </div>
      </div>
    </div>
  );
};

export default function CashierPOS() {
  const router = useRouter();
  const [products, setProducts] = useState([]);
  const [cart, setCart] = useState(() => loadCartFromStorage()); // ✅ Load dari localStorage
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [currentUser, setCurrentUser] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [receipt, setReceipt] = useState(null);
  const [isReceiptOpen, setIsReceiptOpen] = useState(false);

  // ✅ Simpan ke localStorage setiap kali cart berubah
  useEffect(() => {
    if (typeof window !== 'undefined') {
      saveCartToStorage(cart);
    }
  }, [cart]);

  // ✅ Optimasi filteredProducts
  const filteredProducts = useMemo(() => {
    let result = products;
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      result = result.filter(p => p.name.toLowerCase().includes(term));
    }
    if (selectedCategory !== 'all') {
      result = result.filter(p => p.category === selectedCategory);
    }
    return result;
  }, [products, searchTerm, selectedCategory]);

  // Cek autentikasi
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (!user) return router.push('/cashier/login');
      
      try {
        const userDoc = await getDoc(doc(db, 'users', user.uid));
        if (!userDoc.exists() || userDoc.data().role !== 'cashier') {
          signOut(auth);
          router.push('/cashier/login');
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

  // Muat produk
  useEffect(() => {
    if (!currentUser) return;
    const unsubscribe = onSnapshot(collection(db, 'products'), (snapshot) => {
      const list = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setProducts(list);
    }, (err) => {
      setError('Gagal memuat daftar produk');
    });
    return () => unsubscribe();
  }, [currentUser]);

  const formatRupiah = useCallback((number) => {
    return new Intl.NumberFormat('id-ID', {
      style: 'currency',
      currency: 'IDR',
      minimumFractionDigits: 0
    }).format(number);
  }, []);

  const cartTotal = useMemo(() => 
    cart.reduce((sum, item) => sum + (item.price * item.quantity), 0),
    [cart]
  );

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

  const processPayment = useCallback(async (cashReceived) => {
    const cash = parseFloat(cashReceived);
    const totalWithTax = cartTotal * 1.11;
    if (isNaN(cash) || cash < totalWithTax) {
      alert('Uang tunai tidak cukup!');
      return false;
    }

    const now = new Date();
    const receiptId = `TK${Date.now().toString(36).toUpperCase()}`;

    try {
      const batch = writeBatch(db);
      const orderItems = [];

      for (const item of cart) {
        batch.update(doc(db, 'products', item.id), { stock: increment(-item.quantity) });
        orderItems.push({
          id: item.id,
          name: item.name,
          price: item.price,
          quantity: item.quantity,
          total: item.price * item.quantity
        });
      }

      await addDoc(collection(db, 'orders'), {
        id: receiptId,
        date: now.toLocaleDateString('id-ID'),
        time: now.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }),
        items: orderItems,
        subtotal: cartTotal,
        tax: cartTotal * 0.11,
        total: totalWithTax,
        paymentMethod: 'cash',
        change: cash - totalWithTax,
        cashier: currentUser.email,
        cashReceived: cash,
        createdAt: now
      });

      await batch.commit();

      const receiptData = {
        id: receiptId,
        dateTime: now.toLocaleString('id-ID'),
        items: orderItems.map(item => ({
          ...item,
          totalFormatted: formatRupiah(item.total)
        })),
        total: totalWithTax,
        totalFormatted: formatRupiah(totalWithTax),
        cashReceived: cash,
        cashReceivedFormatted: formatRupiah(cash),
        change: cash - totalWithTax,
        changeFormatted: formatRupiah(cash - totalWithTax)
      };

      setReceipt(receiptData);
      setIsReceiptOpen(true);
      setCart([]); // Kosongkan keranjang
      saveCartToStorage([]); // Kosongkan di localStorage
      return true;
    } catch (err) {
      alert('Gagal memproses transaksi: ' + (err.message || 'Kesalahan tidak diketahui'));
      return false;
    }
  }, [cart, cartTotal, currentUser, formatRupiah]);

  const handlePrint = useCallback(() => {
    const originalTitle = document.title;
    document.title = `Struk ${receipt?.id}`;
    
    const printWindow = window.open('', '_blank', 'width=400,height=600');
    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Struk - ${receipt?.id}</title>
        <meta charset="utf-8">
        <style>
          body {
            font-family: monospace;
            font-size: 14px;
            margin: 0;
            padding: 10px;
            line-height: 1.4;
            width: 280px; /* Ukuran kertas thermal 80mm */
          }
          .center { text-align: center; }
          .border-dashed { border-top: 1px dashed #000; margin: 8px 0; padding-top: 4px; }
        </style>
      </head>
      <body>
        <div class="center">
          <div class="font-bold">${BUSINESS_NAME}</div>
          <div>${BUSINESS_MOTTO}</div>
          <div class="mt-1">${receipt?.dateTime}</div>
          <div>Struk: ${receipt?.id}</div>
        </div>
        
        <div class="border-dashed"></div>
        
        ${receipt?.items.map(item => 
          `<div style="display:flex;justify-content:space-between;">
            <span>${item.name} x${item.quantity}</span>
            <span>${item.totalFormatted}</span>
          </div>`
        ).join('')}
        
        <div class="border-dashed"></div>
        
        <div style="display:flex;justify-content:space-between;font-weight:bold;">
          <span>TOTAL:</span>
          <span>${receipt?.totalFormatted}</span>
        </div>
        <div style="display:flex;justify-content:space-between;">
          <span>Bayar:</span>
          <span>${receipt?.cashReceivedFormatted}</span>
        </div>
        <div style="display:flex;justify-content:space-between;">
          <span>Kembali:</span>
          <span>${receipt?.changeFormatted}</span>
        </div>
        
        <div class="border-dashed"></div>
        
        <div class="center mt-2">Terima kasih telah berbelanja!</div>
        <div class="center" style="font-size:10px;margin-top:4px;">Simpan struk ini sebagai bukti transaksi.</div>
      </body>
      </html>
    `);
    
    printWindow.document.close();
    printWindow.focus();
    printWindow.print();
    printWindow.close();
    document.title = originalTitle;
  }, [receipt]);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-10 w-10 border-t-2 border-green-600 mx-auto"></div>
          <p className="mt-3 text-gray-600 text-sm">Memuat POS kasir...</p>
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

  return (
    <>
      {/* ✅ Prinsip AMP: Inline CSS kritis, font sistem, minim JS */}
      <Head>
        <title>ATAYATOKO - POS Kasir</title>
        {/* Gunakan font sistem untuk kecepatan */}
        <style>{`
          body {
            font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
          }
          .font-mono {
            font-family: ui-monospace, SFMono-Regular, 'SF Mono', Monaco, monospace;
          }
        `}</style>
        {/* Prap muat font ikon (opsional) */}
        <link rel="preconnect" href="https://cdnjs.cloudflare.com" />
        <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css" media="print" onload="this.media='all'" />
      </Head>

      <div className="min-h-screen bg-gray-50">
        {/* Header */}
        <header className="bg-white shadow-sm border-b border-gray-200">
          <div className="flex items-center justify-between px-4 py-3">
            <div className="flex items-center">
              <div className="bg-green-600 w-8 h-8 rounded-lg flex items-center justify-center mr-2">
                <i className="fas fa-cash-register text-white text-sm"></i>
              </div>
              <h1 className="text-lg font-bold">POS KASIR</h1>
            </div>
            <button
              onClick={() => signOut(auth).then(() => router.push('/'))}
              className="bg-red-600 text-white px-3 py-1.5 rounded text-sm"
            >
              Logout
            </button>
          </div>
        </header>

        <div className="p-3">
          {/* Search & Filter */}
          <div className="bg-white rounded-lg p-3 mb-4 shadow-sm">
            <div className="relative mb-2">
              <i className="fas fa-search absolute left-2.5 top-1/2 transform -translate-y-1/2 text-gray-400 text-xs"></i>
              <input
                type="text"
                placeholder="Cari produk..."
                className="w-full pl-8 pr-3 py-2 border border-gray-300 rounded focus:ring-1 focus:ring-green-500 focus:outline-none text-sm"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
            <div className="flex gap-1 overflow-x-auto pb-1">
              {['all', 'makanan', 'minuman', 'kebersihan', 'perawatan', 'promo'].map(cat => (
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

          {/* Products Grid */}
          <div className="bg-white rounded-lg p-3 shadow-sm mb-24">
            {filteredProducts.length === 0 ? (
              <p className="text-gray-500 text-center py-8">Tidak ada produk ditemukan</p>
            ) : (
              <div className="grid grid-cols-3 gap-2">
                {filteredProducts.map(p => (
                  <div
                    key={p.id}
                    className="border rounded p-2 text-center cursor-pointer hover:bg-gray-50"
                    onClick={() => addToCart(p)}
                  >
                    <div className="text-xs font-medium truncate">{p.name}</div>
                    <div className="text-green-600 font-bold text-xs mt-1">{formatRupiah(p.priceEcer)}</div>
                    <div className="text-gray-500 text-[10px] mt-0.5">Stok: {p.stock}</div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Floating Cart Button */}
          {cart.length > 0 && (
            <button
              onClick={() => {
                const cash = prompt('Jumlah uang tunai:');
                if (cash) processPayment(cash);
              }}
              className="fixed bottom-4 right-4 bg-green-600 text-white w-14 h-14 rounded-full shadow-lg flex items-center justify-center text-lg z-40"
            >
              {cart.reduce((a, b) => a + b.quantity, 0)}
            </button>
          )}
        </div>

        {/* Modal Struk */}
        <ThermalReceipt
          receipt={receipt}
          isOpen={isReceiptOpen}
          onClose={() => setIsReceiptOpen(false)}
          onPrint={handlePrint}
        />
      </div>
    </>
  );
}