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
  onSnapshot,
  writeBatch,
  increment,
  query,
  where
} from 'firebase/firestore';
import { 
  onAuthStateChanged, 
  signOut 
} from 'firebase/auth';
import { Html5Qrcode } from "html5-qrcode";
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
  const [activeTab, setActiveTab] = useState('pos');
  const [editingProduct, setEditingProduct] = useState(null);
  const [newProduct, setNewProduct] = useState({
    name: '',
    hargaBeli: 0,
    priceEcer: 0,
    priceGrosir: 0,
    stock: 0,
    supplier: '',
    category: 'makanan',
    imageUrl: '',
    sku: '',
    barcode: ''
  });
  const [currentUser, setCurrentUser] = useState(null);
  const [importStatus, setImportStatus] = useState({ show: false, message: '', error: false });
  const [lowStockItems, setLowStockItems] = useState([]);
  const [salesReport, setSalesReport] = useState([]);
  const [reportPeriod, setReportPeriod] = useState('today');
  const [selectedProducts, setSelectedProducts] = useState([]);
  const [massUpdate, setMassUpdate] = useState({ priceEcer: '', priceGrosir: '', stock: '' });
  const [isScannerOpen, setIsScannerOpen] = useState(false);
  const [scannerError, setScannerError] = useState('');

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

  // Muat produk
  useEffect(() => {
    const unsubscribe = onSnapshot(collection(db, 'products'), (snapshot) => {
      const list = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setProducts(list);
      setFilteredProducts(list);
    });
    return () => unsubscribe();
  }, []);

  // Cek stok rendah
  useEffect(() => {
    const lowStock = products.filter(p => (p.stock || 0) < 10);
    setLowStockItems(lowStock);
  }, [products]);

  // Filter produk
  useEffect(() => {
    let filtered = products;
    if (searchTerm) {
      filtered = filtered.filter(product =>
        product.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        product.sku?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        product.barcode?.includes(searchTerm)
      );
    }
    if (selectedCategory !== 'all') {
      filtered = filtered.filter(product => product.category === selectedCategory);
    }
    setFilteredProducts(filtered);
  }, [searchTerm, selectedCategory, products]);

  // Muat laporan penjualan
  useEffect(() => {
    if (activeTab !== 'reports' || !currentUser) return;
    
    const loadSalesReport = async () => {
      const now = new Date();
      let startDate;
      
      switch(reportPeriod) {
        case 'today':
          startDate = new Date(now.setHours(0,0,0,0));
          break;
        case 'week':
          startDate = new Date(now.setDate(now.getDate() - 7));
          break;
        case 'month':
          startDate = new Date(now.setMonth(now.getMonth() - 1));
          break;
      }

      const q = query(
        collection(db, 'orders'),
        where('createdAt', '>=', startDate)
      );
      const snapshot = await getDocs(q);
      const orders = snapshot.docs.map(doc => doc.data());
      setSalesReport(orders);
    };

    loadSalesReport();
  }, [reportPeriod, activeTab, currentUser]);

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

  // Generate nomor struk unik per hari
  const generateReceiptNumber = () => {
    const now = new Date();
    const dateStr = now.toISOString().split('T')[0].replace(/-/g, '');
    const timeStr = now.toTimeString().slice(0, 8).replace(/:/g, '');
    return `TK${dateStr}-${timeStr}`;
  };

  // Generate EAN-13 barcode dari SKU
  const generateBarcode = (sku) => {
    if (!sku) return '';
    const digits = sku.replace(/\D/g, '');
    const base = ('899' + digits).padEnd(12, '0').slice(0, 12);
    
    let sum = 0;
    for (let i = 0; i < 12; i++) {
      sum += parseInt(base[i]) * (i % 2 === 0 ? 1 : 3);
    }
    const checksum = (10 - (sum % 10)) % 10;
    
    return base + checksum;
  };

  // Proses pembayaran + update stok
  const processPayment = async () => {
    if (selectedPaymentMethod === 'cash') {
      const cash = parseFloat(cashReceived);
      if (isNaN(cash) || cash < cartTotal) {
        alert('Uang tunai tidak cukup!');
        return;
      }
    }

    const now = new Date();
    const receiptNumber = generateReceiptNumber();

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
          quantity: item.quantity,
          imageUrl: item.imageUrl,
          barcode: item.barcode
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
        paymentMethod: selectedPaymentMethod,
        change: selectedPaymentMethod === 'cash' ? parseFloat(cashReceived) - (cartTotal * 1.11) : 0,
        cashier: currentUser.email,
        cashReceived: selectedPaymentMethod === 'cash' ? parseFloat(cashReceived) : cartTotal * 1.11,
        createdAt: now,
        storeName: "ATAYATOKO",
        storeAddress: "Jl. Raya Utama No. 123",
        storePhone: "(021) 1234-5678"
      });

      await batch.commit();

      const receipt = {
        id: receiptNumber,
        date: now.toLocaleDateString('id-ID', { day: '2-digit', month: '2-digit', year: 'numeric' }),
        time: now.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
        items: orderItems,
        subtotal: cartTotal,
        tax: cartTotal * 0.11,
        total: cartTotal * 1.11,
        paymentMethod: selectedPaymentMethod,
        change: selectedPaymentMethod === 'cash' ? parseFloat(cashReceived) - (cartTotal * 1.11) : 0,
        cashier: currentUser.email,
        cashReceived: selectedPaymentMethod === 'cash' ? parseFloat(cashReceived) : cartTotal * 1.11,
        storeName: "ATAYATOKO",
        storeAddress: "Jl. Raya Utama No. 123",
        storePhone: "(021) 1234-5678"
      };

      setReceiptData(receipt);
      setIsPaymentModalOpen(false);
      setIsReceiptModalOpen(true);
      clearCart();
      setCashReceived('');
    } catch (err) {
      console.error('Error:', err);
      alert('Gagal memproses transaksi!');
    }
  };

  // Cetak struk
  const printReceipt = () => {
    if (!receiptData) return;
    
    const commands = `
\x1B\x40
\x1B\x61\x01
${receiptData.storeName}
${receiptData.storeAddress}
Telp: ${receiptData.storePhone}
------------------------
${receiptData.date} ${receiptData.time}
No. Struk: ${receiptData.id}
Kasir: ${receiptData.cashier}
------------------------
Barang        Qty  Total
------------------------
${receiptData.items.map(item => 
  `${item.name.substring(0, 15).padEnd(15)} ${item.quantity.toString().padStart(3)} ${formatRupiah(item.price * item.quantity).replace('Rp', '').replace(/\s/g, '').padStart(8)}`
).join('\n')}
------------------------
SUBTOTAL      ${formatRupiah(receiptData.subtotal).replace('Rp', '').replace(/\s/g, '').padStart(12)}
PPN 11%       ${formatRupiah(receiptData.tax).replace('Rp', '').replace(/\s/g, '').padStart(12)}
TOTAL         ${formatRupiah(receiptData.total).replace('Rp', '').replace(/\s/g, '').padStart(12)}
------------------------
BAYAR         ${formatRupiah(
  receiptData.paymentMethod === 'cash' 
    ? parseFloat(receiptData.cashReceived || 0) 
    : receiptData.total
).replace('Rp', '').replace(/\s/g, '').padStart(12)}
KEMBALI       ${formatRupiah(receiptData.change).replace('Rp', '').replace(/\s/g, '').padStart(12)}
------------------------
TERIMA KASIH
${receiptData.storeName}
\x1D\x56\x41\x10
    `.trim();

    if (window.thermalPrinter) {
      window.thermalPrinter.printText(commands);
    } else {
      window.print();
    }
  };

  const handleEditProduct = (product) => {
    setEditingProduct({ ...product });
  };

  const handleSaveProduct = async () => {
    if (editingProduct) {
      try {
        await updateDoc(doc(db, 'products', editingProduct.id), editingProduct);
        setEditingProduct(null);
      } catch (err) {
        alert('Gagal mengupdate produk!');
      }
    }
  };

  const handleDeleteProduct = async (id) => {
    if (window.confirm('Hapus produk ini?')) {
      try {
        await deleteDoc(doc(db, 'products', id));
      } catch (err) {
        alert('Gagal menghapus produk!');
      }
    }
  };

  const handleAddProduct = async () => {
    if (newProduct.name && (newProduct.priceEcer || newProduct.priceGrosir)) {
      try {
        let sku = newProduct.sku?.trim();
        if (!sku) {
          const timestamp = Date.now().toString(36).toUpperCase();
          sku = `SKU-${timestamp}`;
        }
        
        const skuExists = products.some(p => p.sku === sku);
        if (skuExists) {
          alert('SKU sudah digunakan!');
          return;
        }

        const barcode = newProduct.barcode?.trim() || generateBarcode(sku);

        await addDoc(collection(db, 'products'), {
          ...newProduct,
          sku,
          barcode,
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
          imageUrl: '',
          sku: '',
          barcode: ''
        });
      } catch (err) {
        alert('Gagal menambah produk!');
      }
    }
  };

  // ✅ IMPORT EXCEL UNTUK PRODUK
  const handleImportExcel = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    if (!['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'application/vnd.ms-excel'].includes(file.type)) {
      setImportStatus({
        show: true,
        message: 'Format file tidak didukung. Gunakan .xlsx atau .xls',
        error: true
      });
      return;
    }

    const reader = new FileReader();
    reader.onload = async (evt) => {
      try {
        const data = new Uint8Array(evt.target.result);
        const workbook = XLSX.read(data, { type: 'array' });
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        const jsonData = XLSX.utils.sheet_to_json(worksheet);

        if (jsonData.length === 0) {
          throw new Error('File Excel kosong!');
        }

        const requiredColumns = ['nama', 'harga_ecer', 'stok'];
        const missingColumns = requiredColumns.filter(col => !jsonData[0].hasOwnProperty(col));
        if (missingColumns.length > 0) {
          throw new Error(`Kolom wajib tidak ditemukan: ${missingColumns.join(', ')}`);
        }

        // Cek duplikat SKU di file
        const skusInFile = new Set();
        for (const row of jsonData) {
          const sku = String(row.sku || '').trim() || `SKU-${Date.now().toString(36).toUpperCase()}`;
          if (skusInFile.has(sku)) {
            throw new Error(`SKU duplikat ditemukan di file: ${sku}`);
          }
          skusInFile.add(sku);
        }

        const batch = writeBatch(db);
        let count = 0;

        for (const row of jsonData) {
          const sku = String(row.sku || '').trim() || `SKU-${Date.now().toString(36).toUpperCase()}`;
          const barcode = String(row.barcode || '').trim() || generateBarcode(sku);
          
          const product = {
            name: String(row.nama || row.name || '').trim(),
            hargaBeli: Number(row.harga_beli) || 0,
            priceEcer: Number(row.harga_ecer) || 0,
            priceGrosir: Number(row.harga_grosir) || 0,
            stock: Number(row.stok) || 0,
            supplier: String(row.supplier || '').trim(),
            category: String(row.kategori || row.category || 'makanan').toLowerCase(),
            imageUrl: String(row.foto || row.imageUrl || ''),
            sku,
            barcode,
            createdAt: new Date()
          };

          if (!product.name) continue;

          const docRef = doc(collection(db, 'products'));
          batch.set(docRef, product);
          count++;
        }

        if (count === 0) {
          throw new Error('Tidak ada data produk valid untuk diimpor!');
        }

        await batch.commit();
        
        setImportStatus({
          show: true,
          message: `Berhasil mengimpor ${count} produk!`,
          error: false
        });

        e.target.value = '';
        setTimeout(() => setImportStatus({ show: false, message: '', error: false }), 3000);

      } catch (err) {
        console.error('Import error:', err);
        setImportStatus({
          show: true,
          message: `Gagal mengimpor: ${err.message}`,
          error: true
        });
        e.target.value = '';
      }
    };
    reader.readAsArrayBuffer(file);
  };

  // ✅ EKSPOR DATA PRODUK
  const exportProducts = () => {
    const data = products.map(product => ({
      'sku': product.sku || '',
      'barcode': product.barcode || '',
      'nama': product.name || '',
      'kategori': product.category || 'makanan',
      'harga_beli': product.hargaBeli || 0,
      'harga_ecer': product.priceEcer || 0,
      'harga_grosir': product.priceGrosir || 0,
      'stok': product.stock || 0,
      'supplier': product.supplier || '',
      'foto': product.imageUrl || ''
    }));

    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Data Produk");
    
    const range = XLSX.utils.decode_range(ws['!ref'] || 'A1');
    for (let C = range.s.c; C <= range.e.c; ++C) {
      const col = XLSX.utils.decode_col(XLSX.utils.encode_col(C));
      ws['!cols'] = ws['!cols'] || [];
      ws['!cols'][C] = { wch: 15 };
    }
    
    XLSX.writeFile(wb, "produk_atayatoko.xlsx");
  };

  // ✅ EKSPOR LAPORAN PENJUALAN
  const exportSalesReport = () => {
    const data = salesReport.map(order => ({
      'No. Struk': order.id || '',
      'Tanggal': order.date || '',
      'Jam': order.time || '',
      'Kasir': order.cashier || '',
      'Total': order.total || 0,
      'Metode Bayar': 
        order.paymentMethod === 'cash' ? 'Tunai' :
        order.paymentMethod === 'card' ? 'Kartu Kredit' : 'E-Wallet',
      'Item': order.items?.map(i => `${i.name} x${i.quantity}`).join('; ') || ''
    }));

    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Laporan Penjualan");
    
    const range = XLSX.utils.decode_range(ws['!ref'] || 'A1');
    for (let C = range.s.c; C <= range.e.c; ++C) {
      const col = XLSX.utils.decode_col(XLSX.utils.encode_col(C));
      ws['!cols'] = ws['!cols'] || [];
      ws['!cols'][C] = { wch: 18 };
    }
    
    XLSX.writeFile(wb, `laporan_penjualan_${reportPeriod}_${new Date().toISOString().split('T')[0]}.xlsx`);
  };

  // ✅ EDIT MASSAL
  const handleMassUpdate = async () => {
    if (selectedProducts.length === 0) {
      alert('Pilih minimal 1 produk!');
      return;
    }

    const updates = {};
    if (massUpdate.priceEcer !== '') updates.priceEcer = parseFloat(massUpdate.priceEcer);
    if (massUpdate.priceGrosir !== '') updates.priceGrosir = parseFloat(massUpdate.priceGrosir);
    if (massUpdate.stock !== '') updates.stock = parseInt(massUpdate.stock);

    if (Object.keys(updates).length === 0) {
      alert('Isi minimal 1 field untuk update!');
      return;
    }

    try {
      const batch = writeBatch(db);
      selectedProducts.forEach(id => {
        const productRef = doc(db, 'products', id);
        batch.update(productRef, updates);
      });
      await batch.commit();
      
      alert(`Berhasil update ${selectedProducts.length} produk!`);
      setSelectedProducts([]);
      setMassUpdate({ priceEcer: '', priceGrosir: '', stock: '' });
    } catch (err) {
      alert('Gagal update massal!');
    }
  };

  // ✅ TOGGLE SELECT PRODUK
  const toggleSelectProduct = (id) => {
    setSelectedProducts(prev => 
      prev.includes(id) 
        ? prev.filter(x => x !== id) 
        : [...prev, id]
    );
  };

  // ✅ START SCANNER
  const startScanner = () => {
    setIsScannerOpen(true);
    setScannerError('');
    
    const html5QrCode = new Html5Qrcode("barcode-scanner");
    html5QrCode.start(
      { facingMode: "environment" },
      {
        fps: 10,
        qrbox: { width: 250, height: 250 },
        aspectRatio: 1.0
      },
      (scannedText) => {
        const product = products.find(p => p.barcode === scannedText);
        if (product) {
          addToCart(product);
          alert(`${product.name} ditambahkan ke keranjang!`);
        } else {
          setScannerError('Produk tidak ditemukan untuk barcode ini!');
        }
        html5QrCode.stop();
        setIsScannerOpen(false);
      },
      (error) => {
        // Error callback
      }
    ).catch((err) => {
      setScannerError('Gagal mengakses kamera. Izinkan akses kamera di browser.');
      setIsScannerOpen(false);
    });
  };

  // ✅ STOP SCANNER
  const stopScanner = () => {
    setIsScannerOpen(false);
  };

  const categories = ['all', 'makanan', 'minuman', 'kebersihan', 'perawatan'];
  const paymentMethods = [
    { id: 'cash', name: 'Tunai', icon: 'fas fa-money-bill-wave' },
    { id: 'card', name: 'Kartu Kredit', icon: 'fas fa-credit-card' },
    { id: 'e-wallet', name: 'E-Wallet', icon: 'fas fa-wallet' }
  ];

  const totalSales = salesReport.reduce((sum, order) => sum + order.total, 0);
  const totalOrders = salesReport.length;
  const avgOrder = totalOrders > 0 ? totalSales / totalOrders : 0;

  if (!currentUser) return <div className="p-6">Loading...</div>;

  return (
    <>
      <Head>
        <title>ATAYATOKO - Admin POS</title>
        <link href="https://cdn.jsdelivr.net/npm/tailwindcss@2.2.19/dist/tailwind.min.css" rel="stylesheet" />
        <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css" />
        <script src="https://cdn.sheetjs.com/xlsx-0.20.2/package/dist/xlsx.full.min.js"></script>
        <script src="https://cdn.jsdelivr.net/npm/jsbarcode@3.11.5/dist/JsBarcode.all.min.js"></script>
        <style>{`
          body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; }
          @media print {
            body * { visibility: hidden; }
            #receipt, #receipt * { visibility: visible; }
            #receipt { position: absolute; left: 0; top: 0; width: 100%; }
          }
        `}</style>
      </Head>

      {/* Notifikasi */}
      {importStatus.show && (
        <div className={`fixed top-24 right-6 p-4 rounded-lg shadow-lg z-50 ${
          importStatus.error ? 'bg-red-100 border-l-4 border-red-500 text-red-700' : 'bg-green-100 border-l-4 border-green-500 text-green-700'
        }`}>
          <p className="font-medium">{importStatus.message}</p>
        </div>
      )}

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
            {/* ✅ TOMBOL SCAN BARCODE */}
            {activeTab === 'pos' && (
              <button
                onClick={startScanner}
                className="bg-green-600 hover:bg-green-700 text-white p-2 rounded-full"
                title="Scan Barcode"
              >
                <i className="fas fa-barcode"></i>
              </button>
            )}
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
                Produk
              </button>
              <button
                onClick={() => setActiveTab('reports')}
                className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                  activeTab === 'reports'
                    ? 'bg-white text-indigo-700 shadow-sm'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                Laporan
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

      {/* Notifikasi Stok Rendah */}
      {activeTab === 'pos' && lowStockItems.length > 0 && (
        <div className="bg-yellow-100 border-l-4 border-yellow-500 text-yellow-700 p-4 mb-6 mx-6">
          <p className="font-bold">⚠️ Stok Rendah!</p>
          <p>{lowStockItems.length} produk perlu restok segera.</p>
        </div>
      )}

      {/* ... (UI POS tetap sama) ... */}

      {activeTab === 'pos' && (
        <div className="flex">
          <div className="w-full lg:w-2/3 xl:w-3/4 p-6">
            <div className="bg-white rounded-xl shadow-sm p-6 mb-6">
              <div className="flex flex-col sm:flex-row gap-4 mb-6">
                <div className="relative flex-1">
                  <i className="fas fa-search absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400"></i>
                  <input
                    type="text"
                    placeholder="Cari produk, SKU, atau barcode..."
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
                      <span>Stok: {product.stock}</span>
                      <span className="font-mono text-xs">{product.sku}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="w-full lg:w-1/3 xl:w-1/4 p-6">
            {/* ... (UI keranjang tetap sama) ... */}
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
      )}

      {activeTab === 'backoffice' && (
        <div className="p-6">
          <div className="bg-white rounded-xl shadow-sm p-6">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6">
              <h2 className="text-2xl font-bold text-gray-900 mb-4 sm:mb-0">Manajemen Produk</h2>
              <div className="flex flex-col sm:flex-row gap-3 w-full sm:w-auto">
                <button
                  onClick={exportProducts}
                  className="flex items-center justify-center bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg transition-colors"
                >
                  <i className="fas fa-file-export mr-2"></i>
                  Ekspor Produk
                </button>
                <input
                  type="file"
                  accept=".xlsx,.xls"
                  onChange={handleImportExcel}
                  className="hidden"
                  id="importExcel"
                />
                <label
                  htmlFor="importExcel"
                  className="flex items-center justify-center bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg transition-colors cursor-pointer"
                >
                  <i className="fas fa-file-import mr-2"></i>
                  Impor Produk
                </label>
              </div>
            </div>

            <div className="border border-gray-200 rounded-xl p-6 mb-6 bg-gray-50">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Tambah Produk Baru</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
                <input
                  type="text"
                  placeholder="Nama Produk"
                  className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
                  value={newProduct.name}
                  onChange={(e) => setNewProduct({...newProduct, name: e.target.value})}
                />
                <input
                  type="text"
                  placeholder="SKU (auto-generate jika kosong)"
                  className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
                  value={newProduct.sku}
                  onChange={(e) => setNewProduct({...newProduct, sku: e.target.value})}
                />
                <input
                  type="text"
                  placeholder="Barcode (opsional)"
                  className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
                  value={newProduct.barcode}
                  onChange={(e) => setNewProduct({...newProduct, barcode: e.target.value})}
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
                  placeholder="Stok"
                  className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
                  value={newProduct.stock}
                  onChange={(e) => setNewProduct({...newProduct, stock: e.target.value})}
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
                  placeholder="Harga Grosir"
                  className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
                  value={newProduct.priceGrosir}
                  onChange={(e) => setNewProduct({...newProduct, priceGrosir: e.target.value})}
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

            {/* Tabel Produk dengan SKU & Barcode */}
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="bg-gray-100">
                    <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">
                      <input
                        type="checkbox"
                        onChange={(e) => {
                          if (e.target.checked) {
                            setSelectedProducts(products.map(p => p.id));
                          } else {
                            setSelectedProducts([]);
                          }
                        }}
                        checked={selectedProducts.length === products.length && products.length > 0}
                      />
                    </th>
                    <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">SKU</th>
                    <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">Barcode</th>
                    <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">Produk</th>
                    <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">Kategori</th>
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
                            <input type="checkbox" disabled />
                          </td>
                          <td className="px-4 py-3">
                            <input
                              type="text"
                              className="w-full px-2 py-1 border border-gray-300 rounded focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
                              value={editingProduct.sku}
                              onChange={(e) => setEditingProduct({...editingProduct, sku: e.target.value})}
                            />
                          </td>
                          <td className="px-4 py-3">
                            <input
                              type="text"
                              className="w-full px-2 py-1 border border-gray-300 rounded focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
                              value={editingProduct.barcode}
                              onChange={(e) => setEditingProduct({...editingProduct, barcode: e.target.value})}
                            />
                          </td>
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
                            <input
                              type="checkbox"
                              checked={selectedProducts.includes(product.id)}
                              onChange={() => toggleSelectProduct(product.id)}
                            />
                          </td>
                          <td className="px-4 py-3 text-gray-700 font-mono text-xs">{product.sku}</td>
                          <td className="px-4 py-3 text-gray-700 font-mono text-xs">{product.barcode || '-'}</td>
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

            {/* Panel Edit Massal */}
            {selectedProducts.length > 0 && (
              <div className="mt-4 p-4 bg-blue-50 border border-blue-200 rounded-lg">
                <h3 className="font-bold mb-2">Edit Massal ({selectedProducts.length} produk dipilih)</h3>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-3">
                  <input
                    type="number"
                    placeholder="Harga Ecer Baru"
                    className="px-2 py-1 border rounded"
                    value={massUpdate.priceEcer}
                    onChange={(e) => setMassUpdate({...massUpdate, priceEcer: e.target.value})}
                  />
                  <input
                    type="number"
                    placeholder="Harga Grosir Baru"
                    className="px-2 py-1 border rounded"
                    value={massUpdate.priceGrosir}
                    onChange={(e) => setMassUpdate({...massUpdate, priceGrosir: e.target.value})}
                  />
                  <input
                    type="number"
                    placeholder="Stok Baru"
                    className="px-2 py-1 border rounded"
                    value={massUpdate.stock}
                    onChange={(e) => setMassUpdate({...massUpdate, stock: e.target.value})}
                  />
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={handleMassUpdate}
                    className="bg-blue-600 text-white px-4 py-2 rounded"
                  >
                    Update Massal
                  </button>
                  <button
                    onClick={() => setSelectedProducts([])}
                    className="bg-gray-600 text-white px-4 py-2 rounded"
                  >
                    Batal
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {activeTab === 'reports' && (
        // ... (UI laporan tetap sama)
        <div className="p-6">
          <div className="bg-white rounded-xl shadow-sm p-6">
            <h2 className="text-2xl font-bold text-gray-900 mb-4">Laporan Penjualan</h2>
            
            <div className="flex gap-4 mb-6">
              {['today', 'week', 'month'].map(period => (
                <button
                  key={period}
                  onClick={() => setReportPeriod(period)}
                  className={`px-4 py-2 rounded-lg ${
                    reportPeriod === period
                      ? 'bg-indigo-600 text-white'
                      : 'bg-gray-100 text-gray-700'
                  }`}
                >
                  {period === 'today' ? 'Hari Ini' : 
                   period === 'week' ? '7 Hari' : '30 Hari'}
                </button>
              ))}
              <button
                onClick={exportSalesReport}
                className="ml-auto bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg flex items-center"
              >
                <i className="fas fa-file-excel mr-2"></i>
                Ekspor Laporan
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
              <div className="bg-green-50 p-4 rounded-lg">
                <h3 className="text-gray-600">Total Penjualan</h3>
                <p className="text-2xl font-bold text-green-700">{formatRupiah(totalSales)}</p>
              </div>
              <div className="bg-blue-50 p-4 rounded-lg">
                <h3 className="text-gray-600">Jumlah Transaksi</h3>
                <p className="text-2xl font-bold text-blue-700">{totalOrders}</p>
              </div>
              <div className="bg-purple-50 p-4 rounded-lg">
                <h3 className="text-gray-600">Rata-rata/Transaksi</h3>
                <p className="text-2xl font-bold text-purple-700">
                  {totalOrders > 0 ? formatRupiah(avgOrder) : 'Rp 0'}
                </p>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-gray-50">
                    <th className="text-left p-3">No. Struk</th>
                    <th className="text-left p-3">Tanggal</th>
                    <th className="text-left p-3">Kasir</th>
                    <th className="text-right p-3">Total</th>
                    <th className="text-left p-3">Metode</th>
                  </tr>
                </thead>
                <tbody>
                  {salesReport.map(order => (
                    <tr key={order.id} className="border-b hover:bg-gray-50">
                      <td className="p-3 font-mono">{order.id}</td>
                      <td className="p-3">{order.date} {order.time}</td>
                      <td className="p-3">{order.cashier}</td>
                      <td className="p-3 text-right font-medium">{formatRupiah(order.total)}</td>
                      <td className="p-3">
                        {order.paymentMethod === 'cash' ? 'Tunai' : 
                         order.paymentMethod === 'card' ? 'Kartu Kredit' : 'E-Wallet'}
                      </td>
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
        // ... (modal pembayaran tetap sama)
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
              <div className="border-b-2 border-gray-300 pb-2 mb-3">
                <h2 className="text-lg font-bold">{receiptData.storeName}</h2>
                <p className="text-xs">{receiptData.storeAddress}</p>
                <p className="text-xs">Telp: {receiptData.storePhone}</p>
              </div>
              
              <div className="text-xs mb-2">
                <p>{receiptData.date} {receiptData.time}</p>
                <p>No. Struk: {receiptData.id}</p>
                <p>Kasir: {receiptData.cashier}</p>
              </div>

              {/* ✅ BARCODE STRUK */}
              <div id={`receipt-barcode-${receiptData.id}`} className="my-2 w-full"></div>
              <script dangerouslySetInnerHTML={{ __html: `
                if (typeof JsBarcode !== 'undefined' && document.getElementById('receipt-barcode-${receiptData.id}')) {
                  JsBarcode("#receipt-barcode-${receiptData.id}", "${receiptData.id || ''}", {
                    format: "code128",
                    displayValue: true,
                    fontSize: 14,
                    height: 40
                  });
                }
              `}} />

              <div className="border-t border-b border-gray-300 py-1 mb-2 text-xs">
                <div className="flex justify-between font-bold mb-1">
                  <span>Barang</span>
                  <span className="flex gap-4">
                    <span>Qty</span>
                    <span>Total</span>
                  </span>
                </div>
                {receiptData.items.map(item => (
                  <div key={item.id} className="flex justify-between mb-0.5">
                    <span>{item.name.substring(0, 18)}</span>
                    <span className="flex gap-4">
                      <span>{item.quantity}</span>
                      <span>{formatRupiah(item.price * item.quantity)}</span>
                    </span>
                  </div>
                ))}
              </div>

              <div className="text-xs space-y-0.5 mb-2">
                <div className="flex justify-between">
                  <span>SUBTOTAL</span>
                  <span>{formatRupiah(receiptData.subtotal)}</span>
                </div>
                <div className="flex justify-between">
                  <span>PPN 11%</span>
                  <span>{formatRupiah(receiptData.tax)}</span>
                </div>
                <div className="flex justify-between font-bold pt-1 border-t border-gray-300">
                  <span>TOTAL</span>
                  <span>{formatRupiah(receiptData.total)}</span>
                </div>
                <div className="flex justify-between">
                  <span>BAYAR</span>
                  <span>{
                    receiptData.paymentMethod === 'cash' 
                      ? formatRupiah(parseFloat(receiptData.cashReceived || 0)) 
                      : formatRupiah(receiptData.total)
                  }</span>
                </div>
                <div className="flex justify-between text-green-600">
                  <span>KEMBALI</span>
                  <span>{formatRupiah(receiptData.change)}</span>
                </div>
              </div>

              <div className="text-xs text-gray-600 mt-2">
                <p>TERIMA KASIH</p>
                <p>{receiptData.storeName}</p>
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
{/* ✅ TOMBOL BAYAR DENGAN VALIDASI */}
              <button
                onClick={processPayment}
                disabled={cart.length === 0 || cart.some(item => item.quantity > item.stock)}
                className={`w-full py-3 px-6 rounded-xl font-bold transition-all duration-200 ${
                  cart.length === 0 || cart.some(item => item.quantity > item.stock)
                    ? 'bg-gray-400 cursor-not-allowed'
                    : 'bg-gradient-to-r from-indigo-600 to-purple-700 hover:from-indigo-700 hover:to-purple-800 text-white shadow-lg hover:shadow-xl'
                }`}
              >
                {cart.some(item => item.quantity > item.stock)
                  ? 'Stok Tidak Cukup!'
                  : `Bayar ${formatRupiah(cartTotal * 1.11)}`}
              </button>

      {/* ... (Receipt Modal, Scanner Modal tetap sama) ... */}
    
      
      {/* ✅ MODAL SCANNER BARCODE */}
      {isScannerOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white p-6 rounded-lg w-full max-w-md">
            <div className="flex justify-between items-center mb-4">
              <h3 className="font-bold">Scan Barcode Produk</h3>
              <button 
                onClick={stopScanner}
                className="text-gray-500 hover:text-gray-700"
              >
                <i className="fas fa-times"></i>
              </button>
            </div>
            
            <div id="barcode-scanner" className="w-full h-64 bg-black rounded"></div>
            
            {scannerError && (
              <div className="mt-4 text-red-600 text-sm">{scannerError}</div>
            )}
            
            <p className="text-xs text-gray-500 mt-2">
              Arahkan kamera ke barcode produk. Pastikan pencahayaan cukup.
            </p>
          </div>
        </div>
      )}
    </>
  );
}

            