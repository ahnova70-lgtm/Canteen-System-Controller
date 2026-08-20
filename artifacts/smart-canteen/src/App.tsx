import React, { useState, useEffect } from 'react';
import { 
  Store, LogIn, LogOut, Truck, PlusCircle, Trash2, Send, 
  Search, QrCode, CheckSquare, Clock, MessageSquare, AlertTriangle, 
  Inbox, Save, ClipboardCheck, Bot, Sparkles, Printer, Loader2, PackageCheck, X 
} from 'lucide-react';
import { createClient } from '@supabase/supabase-js';

// --- إعداد Supabase ---
const SUPABASE_URL = "https://hiibtrhgdjuqwvgaswiq.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJoaWliYjR0aHJnZGp1cXd2Z2Fzd2lxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODY4MDE0MTcsImV4cCI6MjEwMjM3NzQxN30.G9WdpFlnVncA4qx1RDbwiZcFrfO3hfKJsIVaYEa5rYo";
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// --- الأنواع والتصاميم (Types) ---
interface Item {
  name: string;
  type: string;
  qty: number;
  cost: number;
  price: number;
}

interface Shipment {
  id: string;
  date: string;
  supplier: string;
  canteen: string;
  invoiceRef: string;
  items: Item[];
  driverNotes: string;
  status: 'transferred' | 'received' | 'rejected' | 'pending';
  origin: 'manual' | 'whatsapp';
  totalCost: number;
  hasDiscrepancy: boolean;
  workerNotes?: string;
  actualItemsReceived?: any[];
}

interface InventoryItem {
  id: number;
  name: string;
  type: string;
  receivedQty: number;
  estimatedSold: number;
  actualStock: number;
  wasted: number;
  cost: number;
}

export default function App() {
  const [role, setRole] = useState<string>('');
  const [isLoggedIn, setIsLoggedIn] = useState<boolean>(false);
  const [loginError, setLoginError] = useState<boolean>(false);

  // حالة البيانات
  const [shipments, setShipments] = useState<Shipment[]>([]);
  const [inventory, setInventory] = useState<InventoryItem[]>([
    { id: 1, name: "عصير برتقال 250 مل", type: "معلبات", receivedQty: 48, estimatedSold: 30, actualStock: 18, wasted: 0, cost: 1.5 },
    { id: 2, name: "ساندوتش جبن بيضاء", type: "طازج", receivedQty: 30, estimatedSold: 25, actualStock: 3, wasted: 2, cost: 2.0 }
  ]);

  // تصفية العامل
  const [workerQuery, setWorkerQuery] = useState('');
  const [workerStatus, setWorkerStatus] = useState('all');

  // نموذج السائق
  const [driverSupplier, setDriverSupplier] = useState('شركة المراعي والجملة');
  const [driverCanteen, setDriverCanteen] = useState('المقصف الرئيسي - مدرسة الأمل');
  const [driverInvoice, setDriverInvoice] = useState('');
  const [driverNotes, setDriverNotes] = useState('');
  const [driverItems, setDriverItems] = useState<Item[]>([
    { name: 'ساندوتش دجاج طازج', type: 'طازج', qty: 40, cost: 2.5, price: 4.0 },
    { name: 'عصير مشكل 200 مل', type: 'معلبات', qty: 50, cost: 1.2, price: 2.0 }
  ]);

  // النافذة المنبثقة للاستلام
  const [selectedShipment, setSelectedShipment] = useState<Shipment | null>(null);
  const [receiveModalNotes, setReceiveModalNotes] = useState('');
  const [receiveModalDiscrepancy, setReceiveModalDiscrepancy] = useState(false);
  const [receivedQtyMap, setReceivedQtyMap] = useState<Record<number, number>>({});

  // تقرير الذكاء الاصطناعي
  const [aiReport, setAiReport] = useState<string | null>(null);
  const [isGeneratingAi, setIsGeneratingAi] = useState(false);

  // جلب البيانات عند البدء
  useEffect(() => {
    fetchFromSupabase();
  }, []);

  const fetchFromSupabase = async () => {
    try {
      const { data: shipData } = await supabase.from('shipments').select('*');
      if (shipData && shipData.length > 0) {
        const normalized = shipData.map((row: any) => ({
          id: row.id,
          date: row.created_at || new Date().toLocaleString('ar-SA'),
          supplier: row.supplier || 'مورد غير محدد',
          canteen: row.canteen || 'المقصف الرئيسي',
          invoiceRef: row.invoice_ref || '',
          items: typeof row.items === 'string' ? JSON.parse(row.items) : (row.items || []),
          driverNotes: row.driver_notes || '',
          status: row.status || 'transferred',
          origin: row.origin === 'whatsapp' ? 'whatsapp' : 'manual',
          totalCost: Number(row.total_cost || 0),
          hasDiscrepancy: Boolean(row.has_discrepancy),
          workerNotes: row.worker_notes || ''
        }));
        setShipments(normalized);
      }
    } catch (e) {
      console.warn("تعذر الجلب من Supabase، سيتم اعتماد الحالة المحلية", e);
    }
  };

  const handleLogin = () => {
    if (!role) {
      setLoginError(true);
      return;
    }
    setLoginError(false);
    setIsLoggedIn(true);
  };

  // إضافة صنف جديد للسائق
  const addDriverRow = () => {
    setDriverItems([...driverItems, { name: '', type: 'معلبات', qty: 0, cost: 0, price: 0 }]);
  };

  const handleCreateShipment = async () => {
    const validItems = driverItems.filter(i => i.name && i.qty > 0);
    if (validItems.length === 0) {
      alert("الرجاء إضافة أصناف وصالحة أولاً.");
      return;
    }

    const totalCost = validItems.reduce((sum, item) => sum + (item.qty * item.cost), 0);
    const newShipment: Shipment = {
      id: `SH-${Math.floor(Math.random() * 9000) + 1000}`,
      date: new Date().toLocaleString('ar-SA'),
      supplier: driverSupplier,
      canteen: driverCanteen,
      invoiceRef: driverInvoice,
      items: validItems,
      driverNotes: driverNotes,
      status: 'transferred',
      origin: 'manual',
      totalCost,
      hasDiscrepancy: false
    };

    try {
      await supabase.from('shipments').insert({
        id: newShipment.id,
        supplier: newShipment.supplier,
        canteen: newShipment.canteen,
        invoice_ref: newShipment.invoiceRef,
        items: JSON.stringify(newShipment.items),
        driver_notes: newShipment.driverNotes,
        status: newShipment.status,
        origin: newShipment.origin,
        total_cost: newShipment.totalCost
      });
    } catch (err) {
      console.warn("حفظ محلي فقط", err);
    }

    setShipments([newShipment, ...shipments]);
    setDriverInvoice('');
    setDriverNotes('');
    alert(`تم إرسال الشحنة بنجاح برقم: ${newShipment.id}`);
  };

  // فتح مودال الاستلام
  const openReceiveModal = (shipment: Shipment) => {
    setSelectedShipment(shipment);
    const initialMap: Record<number, number> = {};
    shipment.items.forEach((item, idx) => {
      initialMap[idx] = item.qty;
    });
    setReceivedQtyMap(initialMap);
    setReceiveModalNotes('');
    setReceiveModalDiscrepancy(false);
  };

  const handleConfirmReceive = async () => {
    if (!selectedShipment) return;

    let hasMismatch = false;
    selectedShipment.items.forEach((item, idx) => {
      if (receivedQtyMap[idx] !== item.qty) hasMismatch = true;
    });

    const updated: Shipment = {
      ...selectedShipment,
      status: 'received',
      workerNotes: receiveModalNotes,
      hasDiscrepancy: receiveModalDiscrepancy || hasMismatch
    };

    // تحديث المخزون
    const updatedInventory = [...inventory];
    selectedShipment.items.forEach((item, idx) => {
      const recQty = receivedQtyMap[idx] ?? item.qty;
      const exist = updatedInventory.find(i => i.name === item.name);
      if (exist) {
        exist.receivedQty += recQty;
        exist.actualStock += recQty;
      } else {
        updatedInventory.push({
          id: Date.now() + Math.random(),
          name: item.name,
          type: item.type,
          receivedQty: recQty,
          estimatedSold: 0,
          actualStock: recQty,
          wasted: 0,
          cost: item.cost
        });
      }
    });

    setInventory(updatedInventory);
    setShipments(shipments.map(s => s.id === updated.id ? updated : s));

    try {
      await supabase.from('shipments').update({
        status: 'received',
        worker_notes: updated.workerNotes,
        has_discrepancy: updated.hasDiscrepancy
      }).eq('id', updated.id);
    } catch (e) {
      console.warn("تحديث محلي", e);
    }

    setSelectedShipment(null);
    alert("تم تأكيد استلام الشحنة وتحديث المخزون بنجاح.");
  };

  const generateAIReport = () => {
    setIsGeneratingAi(true);
    setTimeout(() => {
      setIsGeneratingAi(false);
      setAiReport(`
        تم تحليل العمليات سحابياً:
        - إجمالي الشحنات: ${shipments.length}
        - الشحنات المستلمة: ${shipments.filter(s => s.status === 'received').length}
        - التوصية: العمليات تسير بشكل ممتاز، استمر في متابعة الأصناف الطازجة يومياً.
      `);
    }, 1000);
  };

  if (!isLoggedIn) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 bg-slate-900 dir-rtl font-sans" dir="rtl">
        <div className="max-w-md w-full bg-white rounded-2xl shadow-2xl p-8 border border-gray-100">
          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center w-16 h-16 bg-blue-100 text-blue-600 rounded-2xl mb-4">
              <Store className="w-8 h-8" />
            </div>
            <h1 className="text-2xl font-bold text-gray-900">نظام المقصف الذكي</h1>
            <p className="text-sm text-gray-500 mt-1">منصة التوريد والاستلام والجرد الذكي</p>
          </div>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">اختر نوع الحساب للتجربة:</label>
              <select 
                value={role} 
                onChange={(e) => setRole(e.target.value)}
                className="w-full border border-gray-300 rounded-xl p-3 text-sm focus:ring-2 focus:ring-blue-500 bg-gray-50"
              >
                <option value="">-- اختر صلاحية الدخول --</option>
                <option value="driver">🚚 السائق (المورد)</option>
                <option value="worker">🏫 عامل المقصف (المستلم)</option>
                <option value="audit">📋 مسؤول الجرد والرقابة</option>
                <option value="admin">📊 الإدارة والتقارير (AI)</option>
              </select>
            </div>

            {loginError && <p className="text-red-500 text-xs font-medium text-center">يرجى اختيار صلاحية الدخول أولاً.</p>}

            <button onClick={handleLogin} className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 rounded-xl transition-colors shadow-lg flex items-center justify-center gap-2">
              <LogIn className="w-5 h-5" />
              دخول للنظام
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 text-gray-800 dir-rtl" dir="rtl">
      {/* Navbar */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-30">
        <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="bg-blue-600 text-white p-2 rounded-lg">
              <Store className="w-5 h-5" />
            </div>
            <div>
              <h2 className="font-bold text-gray-900">المقصف الذكي</h2>
              <span className="text-xs text-blue-600 font-medium">الصلاحية: {role}</span>
            </div>
          </div>
          <button onClick={() => setIsLoggedIn(false)} className="text-gray-500 hover:text-red-600 p-2 rounded-lg flex items-center gap-1 text-sm font-semibold">
            <LogOut className="w-4 h-4" /> خروج
          </button>
        </div>
      </header>

      {/* Main Container */}
      <main className="max-w-7xl mx-auto p-4 sm:p-6 space-y-6">

        {/* Driver Panel */}
        {role === 'driver' && (
          <section className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 space-y-6">
            <h3 className="text-lg font-bold flex items-center gap-2 border-b pb-3">
              <Truck className="w-5 h-5 text-blue-600" /> إصدار فاتورة عهدة جديدة
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="text-xs font-semibold text-gray-600 block mb-1">المورد</label>
                <input type="text" className="w-full border p-2 rounded-lg text-sm bg-gray-50" value={driverSupplier} onChange={e => setDriverSupplier(e.target.value)} />
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-600 block mb-1">المقصف</label>
                <input type="text" className="w-full border p-2 rounded-lg text-sm bg-gray-50" value={driverCanteen} onChange={e => setDriverCanteen(e.target.value)} />
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-600 block mb-1">رقم الفاتورة الورقية</label>
                <input type="text" className="w-full border p-2 rounded-lg text-sm" placeholder="INV-000" value={driverInvoice} onChange={e => setDriverInvoice(e.target.value)} />
              </div>
            </div>

            {/* Items Table */}
            <div className="overflow-x-auto">
              <table className="w-full text-right text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="p-2">اسم الصنف</th>
                    <th className="p-2">النوع</th>
                    <th className="p-2">الكمية</th>
                    <th className="p-2">التكلفة</th>
                    <th className="p-2">السعر</th>
                    <th className="p-2 text-center">إجراء</th>
                  </tr>
                </thead>
                <tbody>
                  {driverItems.map((item, idx) => (
                    <tr key={idx} className="border-b">
                      <td className="p-2"><input type="text" className="border rounded p-1 w-full text-sm" value={item.name} onChange={e => {
                        const copy = [...driverItems]; copy[idx].name = e.target.value; setDriverItems(copy);
                      }} /></td>
                      <td className="p-2">
                        <select className="border rounded p-1 w-full text-sm" value={item.type} onChange={e => {
                          const copy = [...driverItems]; copy[idx].type = e.target.value; setDriverItems(copy);
                        }}>
                          <option value="معلبات">معلبات</option>
                          <option value="طازج">طازج</option>
                        </select>
                      </td>
                      <td className="p-2"><input type="number" className="border rounded p-1 w-full text-sm" value={item.qty} onChange={e => {
                        const copy = [...driverItems]; copy[idx].qty = Number(e.target.value); setDriverItems(copy);
                      }} /></td>
                      <td className="p-2"><input type="number" className="border rounded p-1 w-full text-sm" value={item.cost} onChange={e => {
                        const copy = [...driverItems]; copy[idx].cost = Number(e.target.value); setDriverItems(copy);
                      }} /></td>
                      <td className="p-2"><input type="number" className="border rounded p-1 w-full text-sm" value={item.price} onChange={e => {
                        const copy = [...driverItems]; copy[idx].price = Number(e.target.value); setDriverItems(copy);
                      }} /></td>
                      <td className="p-2 text-center">
                        <button onClick={() => setDriverItems(driverItems.filter((_, i) => i !== idx))} className="text-red-500 hover:text-red-700"><Trash2 className="w-4 h-4" /></button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <button onClick={addDriverRow} className="text-blue-600 font-bold text-sm flex items-center gap-1"><PlusCircle className="w-4 h-4" /> إضافة صنف آخر</button>
            <button onClick={handleCreateShipment} className="w-full bg-blue-600 text-white font-bold py-3 rounded-xl flex items-center justify-center gap-2"><Send className="w-4 h-4" /> إرسال الشحنة</button>
          </section>
        )}

        {/* Worker Panel */}
        {role === 'worker' && (
          <section className="space-y-4">
            <div className="flex gap-2 bg-white p-4 rounded-xl border">
              <input type="text" placeholder="بحث برقم الشحنة..." className="border rounded-lg p-2 text-sm flex-1" value={workerQuery} onChange={e => setWorkerQuery(e.target.value)} />
              <select className="border rounded-lg p-2 text-sm" value={workerStatus} onChange={e => setWorkerStatus(e.target.value)}>
                <option value="all">كل الحالات</option>
                <option value="transferred">بانتظار الاستلام</option>
                <option value="received">تم الاستلام</option>
              </select>
            </div>

            <div className="space-y-4">
              {shipments.filter(s => workerStatus === 'all' || s.status === workerStatus).map(s => (
                <div key={s.id} className="bg-white p-5 rounded-xl border shadow-sm space-y-3">
                  <div className="flex justify-between items-start">
                    <div>
                      <h4 className="font-bold text-lg">{s.id}</h4>
                      <p className="text-xs text-gray-500">{s.date}</p>
                    </div>
                    <span className={`text-xs px-2 py-1 rounded font-bold ${s.status === 'received' ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'}`}>
                      {s.status === 'received' ? 'تم الاستلام' : 'بانتظار الاستلام'}
                    </span>
                  </div>

                  {s.status === 'transferred' && (
                    <button onClick={() => openReceiveModal(s)} className="w-full bg-blue-600 text-white py-2 rounded-lg font-bold flex items-center justify-center gap-2">
                      <CheckSquare className="w-4 h-4" /> تأكيد الاستلام المباشر
                    </button>
                  )}
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Modal */}
        {selectedShipment && (
          <div className="fixed inset-0 bg-slate-900 bg-opacity-50 z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl max-w-lg w-full p-6 space-y-4">
              <div className="flex justify-between items-center border-b pb-2">
                <h3 className="font-bold">تأكيد استلام {selectedShipment.id}</h3>
                <button onClick={() => setSelectedShipment(null)}><X className="w-5 h-5 text-gray-400" /></button>
              </div>
              <div className="space-y-2">
                {selectedShipment.items.map((item, idx) => (
                  <div key={idx} className="flex justify-between items-center bg-gray-50 p-2 rounded">
                    <span className="text-sm font-semibold">{item.name}</span>
                    <input 
                      type="number" 
                      className="w-20 border text-center rounded p-1 text-sm"
                      value={receivedQtyMap[idx] ?? item.qty} 
                      onChange={e => setReceivedQtyMap({...receivedQtyMap, [idx]: Number(e.target.value)})}
                    />
                  </div>
                ))}
              </div>
              <textarea placeholder="ملاحظات..." className="w-full border rounded p-2 text-sm" value={receiveModalNotes} onChange={e => setReceiveModalNotes(e.target.value)} />
              <button onClick={handleConfirmReceive} className="w-full bg-blue-600 text-white font-bold py-2 rounded-xl">تأكيد الاستلام</button>
            </div>
          </div>
        )}

        {/* Audit & Admin panels can render similarly */}
        {(role === 'admin' || role === 'audit') && (
          <section className="bg-white p-6 rounded-2xl border space-y-4">
            <h3 className="font-bold text-lg">لوحة الإدارة والتقارير</h3>
            <button onClick={generateAIReport} className="bg-purple-600 text-white px-4 py-2 rounded-lg font-bold flex items-center gap-2">
              <Sparkles className="w-4 h-4" /> توليد تقرير AI
            </button>
            {isGeneratingAi && <p className="text-sm text-gray-500">جاري التحليل...</p>}
            {aiReport && <pre className="bg-purple-50 p-4 rounded-xl text-sm whitespace-pre-wrap">{aiReport}</pre>}
          </section>
        )}

      </main>
    </div>
  );
}
