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
    // ✅ Validasi stok sebelum tambah ke keranjang
    if (product.stock <= 0) {
      alert(`${product.name} stok habis!`);
      return;
    }
    
    const existingItem = cart.find(item => item.id === product.id);
    if (existingItem) {
      if (existingItem.quantity >= product.stock) {
        alert(`Stok ${product.name} tidak cukup!`);
        return;
      }
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
    const product = products.find(p => p.id === id);
    if (product && newQuantity > product.stock) {
      alert(`Stok ${product.name} tidak cukup!`);
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

  // ✅ PROSES PEMBAYARAN YANG SUDAH DIPERBAIKI
  const processPayment = async () => {
    // ✅ Validasi currentUser
    if (!currentUser) {
      alert('Sesi login tidak valid. Silakan login ulang.');
      return;
    }

    if (selectedPaymentMethod === 'cash') {
      const cash = parseFloat(cashReceived);
      if (isNaN(cash) || cash < cartTotal) {
        alert('Uang tunai tidak cukup!');
        return;
      }
    }

    // ✅ Validasi stok sebelum proses
    for (const item of cart) {
      if (item.quantity > item.stock) {
        alert(`Stok ${item.name} tidak cukup untuk transaksi ini!`);
        return;
      }
    }

    const now = new Date();
    const receiptNumber = generateReceiptNumber();

    try {
      const batch = writeBatch(db);
      const orderItems = [];

      // Kurangi stok
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

      // ✅ Simpan order dengan proteksi currentUser
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
        cashier: currentUser.email, // ✅ currentUser pasti ada
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
      console.error('Error proses pembayaran:', err);
      // ✅ Tampilkan pesan error yang jelas
      alert(`Gagal memproses transaksi: ${err.message || 'Terjadi kesalahan sistem'}`);
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

      {/* ... (UI POS, Back Office, Laporan tetap sama) ... */}

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
            </div>
          </div>
        </div>
      )}

      {/* ... (Receipt Modal, Scanner Modal tetap sama) ... */}

    </>
  );
}