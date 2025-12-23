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
  serverTimestamp
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

  // ✅ FORMAT RUPIAH BULAT TANPA KOMA
  const formatRupiah = (number) => {
    return new Intl.NumberFormat('id-ID', {
      style: 'currency',
      currency: 'IDR',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(Math.round(number));
  };

  // === AUTH & DATA LOADING ===
  // ✅ DIPERBAIKI: Simpan data user lengkap dari Firestore
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        router.push('/');
        return;
      }

      try {
        const userDoc = await getDoc(doc(db, 'users', user.uid));
        if (!userDoc.exists()) {
          alert('Akun tidak ditemukan di sistem!');
          signOut(auth);
          router.push('/');
          return;
        }

        const userData = userDoc.data();
        setCurrentUser({
          uid: user.uid,
          email: userData.email || user.email, // fallback ke auth email
          role: userData.role
        });
      } catch (err) {
        console.error('Auth error:', err);
        alert('Gagal memuat data pengguna.');
        signOut(auth);
        router.push('/');
      }
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    const unsubscribe = onSnapshot(collection(db, 'products'), (snapshot) => {
      const list = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setProducts(list);
      setFilteredProducts(list);
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    const lowStock = products.filter(p => (p.stock || 0) < 10);
    setLowStockItems(lowStock);
  }, [products]);

  // ✅ FILTER + RESET HALAMAN
  useEffect(() => {
    let filtered = products;
    if (searchTerm) {
      filtered = filtered.filter(product =>
        product.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (product.sku && product.sku.toLowerCase().includes(searchTerm.toLowerCase())) ||
        (product.barcode && product.barcode.includes(searchTerm))
      );
    }
    if (selectedCategory !== 'all') {
      filtered = filtered.filter(product => product.category === selectedCategory);
    }
    setFilteredProducts(filtered);
    setCurrentPage(1);
  }, [searchTerm, selectedCategory, products]);

  // LAPORAN PENJUALAN
  useEffect(() => {
    if (activeTab !== 'reports' || !currentUser) return;
    const loadSalesReport = async () => {
      const now = new Date();
      let startDate;
      switch(reportPeriod) {
        case 'today': startDate = new Date(now.setHours(0,0,0,0)); break;
        case 'week': startDate = new Date(now.setDate(now.getDate() - 7)); break;
        case 'month': startDate = new Date(now.setMonth(now.getMonth() - 1)); break;
        default: startDate = new Date(0);
      }
      const snapshot = await getDocs(collection(db, 'orders'));
      const orders = snapshot.docs.map(doc => {
        const data = doc.data();
        const createdAt = data.createdAt?.seconds 
          ? new Date(data.createdAt.seconds * 1000)
          : new Date();
        return { ...data, createdAt };
      }).filter(order => 
        order.createdAt >= startDate
      );
      setSalesReport(orders);
    };
    loadSalesReport();
  }, [reportPeriod, activeTab, currentUser]);

  // === POS LOGIC ===
  const cartTotal = cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);

  const addToCart = (product) => {
    const existingItem = cart.find(item => item.id === product.id);
    if (existingItem) {
      setCart(cart.map(item =>
        item.id === product.id ? { ...item, quantity: item.quantity + 1 } : item
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

  const generateReceiptNumber = () => {
    const now = new Date();
    const dateStr = now.toISOString().split('T')[0].replace(/-/g, '');
    const timeStr = now.toTimeString().slice(0, 8).replace(/:/g, '');
    return `TK${dateStr}-${timeStr}`;
  };

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

  // ✅ DIPERBAIKI: Tambahkan validasi lengkap
  const processPayment = async () => {
    if (!currentUser || !currentUser.email) {
      alert('Error: Data kasir tidak valid. Silakan login ulang.');
      return;
    }

    if (cart.length === 0) {
      alert('Keranjang kosong!');
      return;
    }

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

      const totalRounded = Math.round(cartTotal);
      const changeRounded = selectedPaymentMethod === 'cash' 
        ? Math.round(parseFloat(cashReceived) - totalRounded) 
        : 0;
      const cashReceivedRounded = selectedPaymentMethod === 'cash' 
        ? Math.round(parseFloat(cashReceived)) 
        : totalRounded;

      await addDoc(collection(db, 'orders'), {
        id: receiptNumber,
        date: now.toLocaleDateString('id-ID', { day: '2-digit', month: '2-digit', year: 'numeric' }),
        time: now.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
        items: orderItems,
        total: totalRounded,
        paymentMethod: selectedPaymentMethod,
        change: changeRounded,
        cashier: currentUser.email,
        cashReceived: cashReceivedRounded,
        createdAt: serverTimestamp(),
        storeName: "ATAYATOKO",
        storeAddress: "Jl. Pandan 98, Semen, Kediri",
        storePhone: "085790565666"
      });

      const receipt = {
        id: receiptNumber,
        date: now.toLocaleDateString('id-ID', { day: '2-digit', month: '2-digit', year: 'numeric' }),
        time: now.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
        items: orderItems,
        total: totalRounded,
        paymentMethod: selectedPaymentMethod,
        change: changeRounded,
        cashier: currentUser.email,
        cashReceived: cashReceivedRounded,
        storeName: "ATAYATOKO",
        storeAddress: "Jl. Pandan 98, Semen, Kediri",
        storePhone: "085790565666"
      };

      setReceiptData(receipt);
      setIsPaymentModalOpen(false);
      setIsReceiptModalOpen(true);
      clearCart();
      setCashReceived('');
    } catch (err) {
      console.error('Error:', err);
      alert('Gagal memproses transaksi: ' + (err.message || 'Kesalahan tidak diketahui'));
    }
  };

  // ✅ DIPERBAIKI: Thermal print + fallback browser print yang aman
  const printReceipt = () => {
    if (!receiptData) return;

    const {
      storeName = "ATAYATOKO",
      storeAddress = "Jl. Pandan 98, Semen, Kediri",
      storePhone = "085790565666",
      date = "",
      time = "",
      id = "STRUK-001",
      cashier = "Kasir",
      items = [],
      total = 0,
      paymentMethod = "cash",
      cashReceived = 0,
      change = 0
    } = receiptData;

    // ESC/POS commands
    const commands = `
\x1B\x40
\x1B\x61\x01
${storeName}
${storeAddress}
Telp: ${storePhone}
------------------------
${date} ${time}
No. Struk: ${id}
Kasir: ${cashier}
------------------------
Barang        Qty  Total
------------------------
${items.map(item => {
    const name = (item.name || 'Produk').substring(0, 15).padEnd(15);
    const qty = (item.quantity || 1).toString().padStart(3);
    const totalItem = Math.round((item.price || 0) * (item.quantity || 1));
    const totalStr = totalItem.toString().padStart(8);
    return `${name} ${qty} ${totalStr}`;
  }).join('\n')}
------------------------
TOTAL         ${total.toString().padStart(12)}
------------------------
BAYAR         ${(paymentMethod === 'cash' ? cashReceived : total).toString().padStart(12)}
KEMBALI       ${change.toString().padStart(12)}
------------------------
TERIMA KASIH
${storeName}
\x1D\x56\x41\x10
    `.trim();

    if (typeof window !== 'undefined' && window.thermalPrinter) {
      window.thermalPrinter.printText(commands);
    } else {
      // Fallback to browser print
      const printWindow = window.open('', '_blank', 'width=300,height=600');
      printWindow.document.write(`
        <!DOCTYPE html>
        <html>
        <head>
          <title>Struk ${id}</title>
          <style>
            body { 
              font-family: monospace; 
              width: 280px; 
              margin: 0; 
              padding: 10px; 
              font-size: 14px; 
              line-height: 1.4; 
            }
            hr { 
              border: 0; 
              border-top: 1px dashed #000; 
              margin: 6px 0; 
            }
            .center { text-align: center; }
          </style>
        </head>
        <body>
          <div class="center">${storeName}</div>
          <div class="center">${storeAddress}</div>
          <div class="center">Telp: ${storePhone}</div>
          <hr>
          <div>${date} ${time}</div>
          <div>No. Struk: ${id}</div>
          <div>Kasir: ${cashier}</div>
          <hr>
          <div style="display: flex; justify-content: space-between;">
            <span>Barang</span><span>Qty</span><span>Total</span>
          </div>
          ${items.map(item => `
            <div style="display: flex; justify-content: space-between; font-size: 12px;">
              <span>${(item.name || '').substring(0, 12)}</span>
              <span>${item.quantity || 1}</span>
              <span>${formatRupiah(Math.round((item.price || 0) * (item.quantity || 1)))}</span>
            </div>
          `).join('')}
          <hr>
          <div style="display: flex; justify-content: space-between; font-weight: bold;">
            <span>TOTAL</span><span></span><span>${formatRupiah(total)}</span>
          </div>
          <div style="display: flex; justify-content: space-between;">
            <span>BAYAR</span><span></span><span>${formatRupiah(paymentMethod === 'cash' ? cashReceived : total)}</span>
          </div>
          <div style="display: flex; justify-content: space-between;">
            <span>KEMBALI</span><span></span><span>${formatRupiah(change)}</span>
          </div>
          <hr>
          <div class="center">TERIMA KASIH</div>
          <div class="center">${storeName}</div>
        </body>
        </html>
      `);
      printWindow.document.close();
      printWindow.focus();
      printWindow.print();
      printWindow.close();
    }
  };

  // === PRODUCT MANAGEMENT ===
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
          createdAt: serverTimestamp()
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

  // ✅ HAPUS PRODUK TERPILIH
  const handleDeleteSelected = async () => {
    if (selectedProducts.length === 0) {
      alert('Tidak ada produk yang dipilih!');
      return;
    }
    const confirmed = window.confirm(
      `Yakin ingin menghapus ${selectedProducts.length} produk yang dipilih? Aksi ini tidak bisa dikembalikan.`
    );
    if (!confirmed) return;
    try {
      const batch = writeBatch(db);
      selectedProducts.forEach(id => {
        batch.delete(doc(db, 'products', id));
      });
      await batch.commit();
      alert(`Berhasil menghapus ${selectedProducts.length} produk!`);
      setSelectedProducts([]);
    } catch (err) {
      console.error('Error:', err);
      alert('Gagal menghapus produk terpilih!');
    }
  };

  // IMPORT / EXPORT
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
            createdAt: serverTimestamp()
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

  const toggleSelectProduct = (id) => {
    setSelectedProducts(prev => 
      prev.includes(id) 
        ? prev.filter(x => x !== id) 
        : [...prev, id]
    );
  };

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
      (error) => {}
    ).catch((err) => {
      setScannerError('Gagal mengakses kamera. Izinkan akses kamera di browser.');
      setIsScannerOpen(false);
    });
  };

  const stopScanner = () => {
    setIsScannerOpen(false);
  };

  // === PAGINATION ===
  const [currentPage, setCurrentPage] = useState(1);
  const PRODUCTS_PER_PAGE = 500;
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

  const indexOfLastProduct = currentPage * PRODUCTS_PER_PAGE;
  const indexOfFirstProduct = indexOfLastProduct - PRODUCTS_PER_PAGE;
  const currentProducts = filteredProducts.slice(indexOfFirstProduct, indexOfLastProduct);
  const totalPages = Math.ceil(filteredProducts.length / PRODUCTS_PER_PAGE);
  const isAllSelectedInPage = currentProducts.length > 0 && 
    currentProducts.every(p => selectedProducts.includes(p.id));

  const handleSelectAll = (e) => {
    if (e.target.checked) {
      const currentPageIds = currentProducts.map(p => p.id);
      const newSet = new Set([...selectedProducts, ...currentPageIds]);
      setSelectedProducts(Array.from(newSet));
    } else {
      const currentPageIds = new Set(currentProducts.map(p => p.id));
      setSelectedProducts(selectedProducts.filter(id => !currentPageIds.has(id)));
    }
  };

  return (
    <>
      <Head>
        <title>ATAYATOKO - Admin POS</title>
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link rel="preconnect" href="https://cdn.jsdelivr.net" />
        <link href="https://cdn.jsdelivr.net/npm/tailwindcss@2.2.19/dist/tailwind.min.css" rel="stylesheet" />
        <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css" />
        <script src="https://cdn.sheetjs.com/xlsx-0.20.2/package/dist/xlsx.full.min.js"></script>
        <script src="https://cdn.jsdelivr.net/npm/jsbarcode@3.11.5/dist/JsBarcode.all.min.js"></script>
        <style>{`
          body { font-family: 'Poppins', Tahoma, Geneva, Verdana, sans-serif; }
          @media print {
            body * { visibility: hidden; }
            #receipt, #receipt * { visibility: visible; }
            #receipt { position: absolute; left: 0; top: 0; width: 100%; }
          }
        `}</style>
      </Head>

      {importStatus.show && (
        <div className={`fixed top-24 right-6 p-4 rounded-lg shadow-lg z-50 ${
          importStatus.error ? 'bg-red-100 border-l-4 border-red-500 text-red-700' : 'bg-green-100 border-l-4 border-green-500 text-green-700'
        }`}>
          <p className="font-medium">{importStatus.message}</p>
        </div>
      )}

      {/* HEADER */}
      <header className="bg-white shadow-sm border-b border-gray-200">
        <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <div className="flex items-center">
            <div className="bg-indigo-600 p-2 rounded-lg mr-3">
              <i className="fas fa-cash-register text-white text-xl"></i>
            </div>
            <h1 className="text-xl sm:text-2xl font-bold text-gray-900">ATAYATOKO - POS</h1>
          </div>
          <div className="flex flex-wrap items-center gap-2 sm:gap-4">
            {activeTab === 'pos' && (
              <button
                onClick={startScanner}
                className="bg-green-600 hover:bg-green-700 text-white p-2.5 rounded-full"
                title="Scan Barcode"
              >
                <i className="fas fa-barcode"></i>
              </button>
            )}
            <div className="flex bg-gray-100 rounded-lg p-1 text-xs sm:text-sm">
              {['pos', 'backoffice', 'reports'].map(tab => (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  className={`px-3 py-1.5 sm:px-4 sm:py-2 rounded-md font-medium transition-colors ${
                    activeTab === tab
                      ? 'bg-white text-indigo-700 shadow-sm'
                      : 'text-gray-600 hover:text-gray-900'
                  }`}
                >
                  {tab === 'pos' ? 'POS' : tab === 'backoffice' ? 'Produk' : 'Laporan'}
                </button>
              ))}
            </div>
            <button
              onClick={() => signOut(auth).then(() => router.push('/'))}
              className="bg-red-600 hover:bg-red-700 text-white px-3 py-1.5 sm:px-4 sm:py-2 rounded-lg text-xs sm:text-sm font-medium whitespace-nowrap"
            >
              Logout
            </button>
          </div>
        </div>
      </header>

      {activeTab === 'pos' && lowStockItems.length > 0 && (
        <div className="bg-yellow-100 border-l-4 border-yellow-500 text-yellow-700 p-4 mb-6 mx-4 sm:mx-6">
          <p className="font-bold">⚠️ Stok Rendah!</p>
          <p>{lowStockItems.length} produk perlu restok segera.</p>
        </div>
      )}

      {/* POS UI (tidak diubah) */}
      {activeTab === 'pos' && (
        <div className="flex flex-col lg:flex-row">
          <div className="w-full lg:w-2/3 xl:w-3/4 p-4 sm:p-6">
            <div className="bg-white rounded-xl shadow-sm p-4 sm:p-6 mb-6">
              <div className="flex flex-col sm:flex-row gap-3 mb-4">
                <div className="relative flex-1">
                  <i className="fas fa-search absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400"></i>
                  <input
                    type="text"
                    placeholder="Cari produk, SKU, atau barcode..."
                    className="w-full pl-10 pr-4 py-2.5 sm:py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none text-base"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                  />
                </div>
                <div className="flex flex-wrap gap-2">
                  {categories.map(category => (
                    <button
                      key={category}
                      onClick={() => setSelectedCategory(category)}
                      className={`px-3 py-1.5 sm:px-4 sm:py-2 rounded-full text-xs sm:text-sm font-medium transition-colors ${
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
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-4 xl:grid-cols-5 gap-3">
                {filteredProducts.map(product => (
                  <div
                    key={product.id}
                    className="border border-gray-200 rounded-lg p-3 hover:shadow-md cursor-pointer bg-white"
                    onClick={() => addToCart(product)}
                  >
                    <div className="flex justify-center mb-2">
                      <img
                        src={product.imageUrl || '/placeholder.webp'}
                        alt={product.name}
                        className="w-12 h-12 sm:w-16 sm:h-16 object-cover rounded"
                        loading="lazy"
                        onError={(e) => e.target.src = '/placeholder.webp'}
                      />
                    </div>
                    <h3 className="text-xs sm:text-sm font-medium text-center mb-1 truncate">{product.name}</h3>
                    <p className="text-indigo-600 font-bold text-center text-xs sm:text-sm">{formatRupiah(product.priceEcer)}</p>
                    <div className="text-[10px] sm:text-xs text-gray-600 text-center mt-1">
                      Stok: {product.stock}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
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
                  <i className="fas fa-shopping-cart text-2xl sm:text-3xl text-gray-400 mb-3"></i>
                  <p className="text-gray-500 text-sm sm:text-base">Keranjang kosong</p>
                </div>
              ) : (
                <>
                  <div className="space-y-3 max-h-80 sm:max-h-96 overflow-y-auto mb-4 sm:mb-6">
                    {cart.map(item => (
                      <div key={item.id} className="flex items-center justify-between p-2.5 sm:p-3 border border-gray-200 rounded-lg">
                        <div className="flex items-center">
                          <img
                            src={item.imageUrl || '/placeholder.webp'}
                            alt={item.name}
                            className="w-9 h-9 sm:w-10 sm:h-10 object-cover rounded mr-2 sm:mr-3"
                            onError={(e) => e.target.src = '/placeholder.webp'}
                          />
                          <div>
                            <p className="font-medium text-gray-900 text-xs sm:text-sm">{item.name}</p>
                            <p className="text-indigo-600 font-medium text-xs">{formatRupiah(item.price)}</p>
                          </div>
                        </div>
                        <div className="flex items-center space-x-1.5">
                          <button
                            onClick={() => updateQuantity(item.id, item.quantity - 1)}
                            className="p-1.5 min-w-[32px] min-h-[32px] rounded-full bg-gray-200 hover:bg-gray-300 flex items-center justify-center"
                          >
                            <i className="fas fa-minus text-[10px]"></i>
                          </button>
                          <span className="font-medium w-7 text-center text-xs">{item.quantity}</span>
                          <button
                            onClick={() => updateQuantity(item.id, item.quantity + 1)}
                            className="p-1.5 min-w-[32px] min-h-[32px] rounded-full bg-gray-200 hover:bg-gray-300 flex items-center justify-center"
                          >
                            <i className="fas fa-plus text-[10px]"></i>
                          </button>
                          <button
                            onClick={() => removeFromCart(item.id)}
                            className="p-1.5 min-w-[32px] min-h-[32px] rounded-full bg-red-100 hover:bg-red-200 ml-1.5"
                          >
                            <i className="fas fa-times text-[10px] text-red-600"></i>
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className="border-t border-gray-200 pt-3 sm:pt-4 space-y-2">
                    <div className="flex justify-between text-base font-bold">
                      <span>Total:</span>
                      <span>{formatRupiah(cartTotal)}</span>
                    </div>
                  </div>
                  <button
                    onClick={() => setIsPaymentModalOpen(true)}
                    disabled={cart.length === 0 || cart.some(item => item.quantity > item.stock)}
                    className={`w-full py-2.5 sm:py-3 px-4 sm:px-6 rounded-xl font-bold text-sm sm:text-base mt-4 ${
                      cart.length === 0 || cart.some(item => item.quantity > item.stock)
                        ? 'bg-gray-400 text-gray-700 cursor-not-allowed'
                        : 'bg-gradient-to-r from-indigo-600 to-purple-700 text-white hover:from-indigo-700 hover:to-purple-800 shadow-lg'
                    }`}
                  >
                    {cart.some(item => item.quantity > item.stock)
                      ? 'Stok Tidak Cukup!'
                      : `Bayar ${formatRupiah(cartTotal)}`}
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* TAB PRODUK & LAPORAN (tidak diubah) */}
      {activeTab === 'backoffice' && (
        <div className="p-4 sm:p-6">
          {/* ... isi tetap sama ... */}
        </div>
      )}

      {activeTab === 'reports' && (
        <div className="p-4 sm:p-6">
          {/* ... isi tetap sama ... */}
        </div>
      )}

      {/* MODAL PEMBAYARAN */}
      {isPaymentModalOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-5 sm:p-6">
            <div className="flex justify-between items-center mb-5">
              <h3 className="text-lg sm:text-xl font-bold text-gray-900">Pembayaran</h3>
              <button
                onClick={() => setIsPaymentModalOpen(false)}
                className="p-2 hover:bg-gray-100 rounded-full"
              >
                <i className="fas fa-times"></i>
              </button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Metode Pembayaran
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {paymentMethods.map(method => (
                    <button
                      key={method.id}
                      onClick={() => setSelectedPaymentMethod(method.id)}
                      className={`flex flex-col items-center justify-center p-3 rounded-lg border ${
                        selectedPaymentMethod === method.id
                          ? 'border-indigo-500 bg-indigo-50'
                          : 'border-gray-200'
                      }`}
                    >
                      <i className={`${method.icon} text-indigo-600 mb-1`}></i>
                      <span className="text-xs">{method.name}</span>
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
                      className="w-full pl-10 pr-4 py-2.5 sm:py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none text-base"
                      value={cashReceived}
                      onChange={(e) => setCashReceived(e.target.value)}
                      placeholder="0"
                      autoFocus
                    />
                  </div>
                  {cashReceived && (
                    <div className="mt-2 text-sm text-green-600">
                      Kembalian: {formatRupiah(parseFloat(cashReceived) - cartTotal)}
                    </div>
                  )}
                </div>
              )}
              <div className="bg-gray-50 rounded-lg p-4">
                <div className="flex justify-between mb-1">
                  <span className="text-gray-600">Total:</span>
                  <span className="font-bold">{formatRupiah(cartTotal)}</span>
                </div>
                {cashReceived && selectedPaymentMethod === 'cash' && (
                  <div className="flex justify-between">
                    <span className="text-gray-600">Kembalian:</span>
                    <span className="text-green-600 font-medium">
                      {formatRupiah(parseFloat(cashReceived) - cartTotal)}
                    </span>
                  </div>
                )}
              </div>
              <button
                onClick={processPayment}
                className="w-full bg-gradient-to-r from-indigo-600 to-purple-700 hover:from-indigo-700 hover:to-purple-800 text-white font-bold py-3 px-4 sm:py-3.5 rounded-xl transition-all duration-200 text-base"
              >
                Selesaikan Pembayaran
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL STRUK */}
      {isReceiptModalOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-5 sm:p-6">
            <div className="text-center mb-5">
              <h3 className="text-lg sm:text-xl font-bold text-gray-900">Struk Transaksi</h3>
              {receiptData && (
                <div className="mt-3 p-4 bg-gray-50 rounded-lg text-sm">
                  <div className="font-bold">{receiptData.storeName}</div>
                  <div>{receiptData.storeAddress}</div>
                  <div className="mt-2">No. Struk: {receiptData.id}</div>
                  <div>Total: {formatRupiah(receiptData.total)}</div>
                </div>
              )}
            </div>
            <div className="flex gap-3">
              <button
                onClick={printReceipt}
                className="flex-1 bg-green-600 hover:bg-green-700 text-white py-2.5 rounded-lg font-medium"
              >
                Cetak Struk
              </button>
              <button
                onClick={() => {
                  setIsReceiptModalOpen(false);
                }}
                className="flex-1 bg-gray-600 hover:bg-gray-700 text-white py-2.5 rounded-lg font-medium"
              >
                Tutup
              </button>
            </div>
          </div>
        </div>
      )}

      {/* SCANNER */}
      {isScannerOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white p-4 rounded-lg relative">
            <button
              onClick={stopScanner}
              className="absolute top-2 right-2 bg-red-500 text-white w-6 h-6 rounded-full flex items-center justify-center"
            >
              ✕
            </button>
            <div id="barcode-scanner" className="w-64 h-64"></div>
            {scannerError && (
              <p className="text-red-500 mt-2 text-center">{scannerError}</p>
            )}
          </div>
        </div>
      )}
    </>
  );
}