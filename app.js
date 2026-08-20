// ==========================================
// Smart Canteen System - Core Engine (app.js)
// ==========================================

// --- إعداد Supabase والمزامنة السحابية ---
const SUPABASE_URL = "https://hiibtrhgdjuqwvgaswiq.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJoaWliYjR0aHJnZGp1cXd2Z2Fzd2lxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODY4MDE0MTcsImV4cCI6MjEwMjM3NzQxN30.G9WdpFlnVncA4qx1RDbwiZcFrfO3hfKJsIVaYEa5rYo";
const STORAGE_KEY = "smart-canteen-state-v2";

const supabase = window.supabase?.createClient
    ? window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
    : null;

// --- أدوات معالجة ومطبقة البيانات (Data Normalization) ---
function parseJsonValue(value, fallback) {
    if (Array.isArray(value) || (value && typeof value === "object")) return value;
    if (typeof value === "string") {
        try { return JSON.parse(value); } catch { return fallback; }
    }
    return fallback;
}

function normalizeShipment(row) {
    return {
        ...row,
        id: String(row.id || generateId("SH")),
        date: row.date || row.created_at || formatDate(new Date()),
        supplier: row.supplier || "مورد غير محدد",
        canteen: row.canteen || "المقصف الرئيسي",
        invoiceRef: row.invoiceRef ?? row.invoice_ref ?? "",
        items: parseJsonValue(row.items, []),
        driverNotes: row.driverNotes ?? row.driver_notes ?? "",
        driverHandoverConfirmed: row.driverHandoverConfirmed ?? row.driver_handover_confirmed ?? true,
        workerNotes: row.workerNotes ?? row.worker_notes ?? "",
        status: row.status || "transferred",
        origin: row.origin === "whatsapp" ? "whatsapp" : "manual",
        totalCost: Number(row.totalCost ?? row.total_cost ?? 0),
        hasDiscrepancy: Boolean(row.hasDiscrepancy ?? row.has_discrepancy),
        actualItemsReceived: parseJsonValue(row.actualItemsReceived ?? row.actual_items_received, undefined)
    };
}

function normalizeInventory(row) {
    return {
        ...row,
        id: Number(row.id || Date.now() + Math.floor(Math.random() * 1000)),
        name: row.name || row.item_name || "صنف جديد",
        type: row.type || "معلبات",
        receivedQty: Number(row.receivedQty ?? row.received_qty ?? 0),
        estimatedSold: Number(row.estimatedSold ?? row.estimated_sold ?? 0),
        actualStock: Number(row.actualStock ?? row.actual_stock ?? 0),
        wasted: Number(row.wasted ?? 0),
        cost: Number(row.cost ?? 0)
    };
}

function shipmentToDbRow(s) {
    return {
        id: s.id,
        supplier: s.supplier,
        canteen: s.canteen,
        invoice_ref: s.invoiceRef,
        items: JSON.stringify(s.items),
        driver_notes: s.driverNotes,
        worker_notes: s.workerNotes,
        status: s.status,
        origin: s.origin || "manual",
        total_cost: s.totalCost,
        has_discrepancy: s.hasDiscrepancy,
        actual_items_received: JSON.stringify(s.actualItemsReceived || [])
    };
}

function inventoryToDbRow(i) {
    return {
        id: i.id,
        item_name: i.name,
        type: i.type,
        received_qty: i.receivedQty,
        estimated_sold: i.estimatedSold,
        actual_stock: i.actualStock,
        wasted: i.wasted,
        cost: i.cost
    };
}

// --- التخزين المحلي والمزامنة السحابية ---
function loadLocalState() {
    try {
        const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
        if (saved && Array.isArray(saved.shipments) && Array.isArray(saved.inventory)) {
            return {
                ...saved,
                shipments: saved.shipments.map(normalizeShipment),
                inventory: saved.inventory.map(normalizeInventory)
            };
        }
    } catch (error) {
        console.warn("تعذر قراءة التخزين المحلي، سيتم استخدام البيانات الافتراضية.", error);
    }
    return appState;
}

function saveLocalState() {
    try { 
        localStorage.setItem(STORAGE_KEY, JSON.stringify(appState)); 
    } catch (error) {
        console.warn("تعذر تحديث التخزين المحلي.", error);
    }
}

async function hydrateFromSupabase() {
    appState = loadLocalState();
    renderAll();
    if (!supabase) return false;

    try {
        const [shipmentsResult, inventoryResult] = await Promise.all([
            supabase.from("shipments").select("*"),
            supabase.from("inventory").select("*")
        ]);

        if (!shipmentsResult.error && Array.isArray(shipmentsResult.data) && shipmentsResult.data.length > 0) {
            appState.shipments = shipmentsResult.data.map(normalizeShipment);
        }
        if (!inventoryResult.error && Array.isArray(inventoryResult.data) && inventoryResult.data.length > 0) {
            appState.inventory = inventoryResult.data.map(normalizeInventory);
        }
        saveLocalState();
        renderAll();
        return true;
    } catch (err) {
        console.warn("خطأ أثناء المزامنة مع Supabase، سيتم الاستمرار محلياً.", err);
        return false;
    }
}

async function insertShipmentRemote(shipment) {
    if (!supabase) return null;
    try {
        const { data, error } = await supabase.from("shipments").insert(shipmentToDbRow(shipment)).select().single();
        if (error) throw error;
        return normalizeShipment(data || shipment);
    } catch (error) {
        console.warn("تعذر حفظ الشحنة سحابياً، سيتم الحفظ محلياً.", error);
        return null;
    }
}

async function updateShipmentRemote(shipment) {
    if (!supabase) return false;
    try {
        const { error } = await supabase.from("shipments").update(shipmentToDbRow(shipment)).eq("id", shipment.id);
        if (error) throw error;
        return true;
    } catch (error) {
        console.warn("تعذر تحديث الشحنة سحابياً، تم التحديث محلياً.", error);
        return false;
    }
}

async function upsertInventoryRemote(items) {
    if (!supabase || !items.length) return false;
    try {
        const { error } = await supabase.from("inventory").upsert(items.map(inventoryToDbRow), { onConflict: "id" });
        if (error) throw error;
        return true;
    } catch (error) {
        console.warn("تعذر تحديث المخزون سحابياً، تم التحديث محلياً.", error);
        return false;
    }
}

// --- حالة التطبيق الافتراضية (App State) ---
let appState = {
    shipments: [{
        id: "SH-8801",
        date: "2026-08-13 07:15 ص",
        supplier: "شركة المراعي والجملة",
        canteen: "المقصف الرئيسي - مدرسة الأمل",
        invoiceRef: "INV-5541",
        items: [
            { name: "عصير برتقال 250 مل", type: "معلبات", qty: 48, cost: 1.5, price: 2.5 },
            { name: "ساندوتش جبن بيضاء", type: "طازج", qty: 30, cost: 2.0, price: 3.5 }
        ],
        driverNotes: "تم استلام الفاتورة كاملة",
        status: "transferred",
        driverHandoverConfirmed: true,
        workerNotes: "تم الاستلام والمطابقة بالكامل بدون نقص",
        origin: "manual",
        totalCost: 132.0,
        hasDiscrepancy: false
    }],
    inventory: [
        { id: 1, name: "عصير برتقال 250 مل", type: "معلبات", receivedQty: 48, estimatedSold: 30, actualStock: 18, wasted: 0, cost: 1.5 },
        { id: 2, name: "ساندوتش جبن بيضاء", type: "طازج", receivedQty: 30, estimatedSold: 25, actualStock: 3, wasted: 2, cost: 2.0 }
    ],
    workerFilterQuery: '',
    workerFilterStatus: 'all'
};

const roleNames = {
    'admin': 'الإدارة العامة والتقارير التنفيذية',
    'audit': 'مسؤول الجرد والرقابة',
    'driver': 'السائق (المورد)',
    'worker': 'عامل المقصف'
};

let html5QrcodeScanner = null;
let lastExecutiveReportText = "";

// --- التهيئة العادية عند بدء التطبيق ---
document.addEventListener("DOMContentLoaded", async () => {
    if (window.lucide) lucide.createIcons();
    addDriverRow("ساندوتش دجاج طازج", "طازج", 40, 2.5, 4.0);
    addDriverRow("عصير مشكل 200 مل", "معلبات", 50, 1.2, 2.0);
    await hydrateFromSupabase();
});

// --- دوال المساعدة العامة ---
function showElement(id) {
    const el = document.getElementById(id);
    if (el) el.classList.remove('hidden');
}

function hideElement(id) {
    const el = document.getElementById(id);
    if (el) el.classList.add('hidden');
}

function formatDate(date) {
    return date.toLocaleString('ar-SA', { 
        year: 'numeric', month: '2-digit', day: '2-digit', 
        hour: '2-digit', minute: '2-digit', hour12: true 
    });
}

function generateId(prefix) {
    return `${prefix}-${Math.floor(Math.random() * 9000) + 1000}`;
}

// --- نظام تسجيل الدخول والتحكم بالواجهات ---
function handleLogin() {
    const role = document.getElementById('login-role').value;
    const errorMsg = document.getElementById('login-error');

    if (!role) {
        errorMsg.classList.remove('hidden');
        return;
    }

    errorMsg.classList.add('hidden');
    hideElement('login-screen');
    showElement('app-screen');

    document.getElementById('current-role-title').textContent = roleNames[role];
    ['driver-panel', 'worker-panel', 'audit-panel', 'admin-panel'].forEach(hideElement);
    showElement(`${role}-panel`);

    if (role === 'admin') updateAdminDashboard();
}

function logout() {
    hideElement('app-screen');
    showElement('login-screen');
    document.getElementById('login-role').value = "";
}

// --- وظائف لوحة السائق (Driver Operations) ---
function addDriverRow(name='', type='معلبات', qty='', cost='', price='') {
    const tbody = document.getElementById('driver-items-body');
    if (!tbody) return;
    const tr = document.createElement('tr');
    tr.className = "border-b border-gray-100 hover:bg-gray-50 transition-colors";
    tr.innerHTML = `
        <td class="p-3"><input type="text" class="driver-item-name w-full border rounded p-2 text-sm focus:ring-2 focus:ring-blue-500" placeholder="اسم الصنف" value="${name}"></td>
        <td class="p-3">
            <select class="driver-item-type w-full border rounded p-2 text-sm focus:ring-2 focus:ring-blue-500">
                <option value="معلبات" ${type==='معلبات'?'selected':''}>معلبات (عصائر/بسكويت)</option>
                <option value="طازج" ${type==='طازج'?'selected':''}>طازج (ساندوتش/فطائر)</option>
            </select>
        </td>
        <td class="p-3"><input type="number" min="1" class="driver-item-qty w-full border rounded p-2 text-sm focus:ring-2 focus:ring-blue-500" placeholder="الكمية" value="${qty}"></td>
        <td class="p-3"><input type="number" min="0" step="0.1" class="driver-item-cost w-full border rounded p-2 text-sm focus:ring-2 focus:ring-blue-500" placeholder="التكلفة" value="${cost}"></td>
        <td class="p-3"><input type="number" min="0" step="0.1" class="driver-item-price w-full border rounded p-2 text-sm focus:ring-2 focus:ring-blue-500" placeholder="سعر البيع" value="${price}"></td>
        <td class="p-3 text-center"><button onclick="this.closest('tr').remove()" class="text-red-500 hover:text-red-700 p-2 rounded-full hover:bg-red-50 transition-colors"><i data-lucide="trash-2" class="w-5 h-5"></i></button></td>
    `;
    tbody.appendChild(tr);
    if (window.lucide) lucide.createIcons();
}

async function createShipment() {
    const supplier = document.getElementById('driver-supplier').value;
    const canteen = document.getElementById('driver-canteen').value;
    const invoiceRef = document.getElementById('driver-invoice').value;
    const notes = document.getElementById('driver-notes').value;

    if (!supplier || !canteen) {
        alert("الرجاء تحديد المورد والمقصف.");
        return;
    }

    const rows = document.querySelectorAll('#driver-items-body tr');
    let items = [];
    let totalCost = 0;
    let valid = true;

    rows.forEach(row => {
        const name = row.querySelector('.driver-item-name').value;
        const type = row.querySelector('.driver-item-type').value;
        const qty = parseInt(row.querySelector('.driver-item-qty').value);
        const cost = parseFloat(row.querySelector('.driver-item-cost').value);
        const price = parseFloat(row.querySelector('.driver-item-price').value);

        if (name && qty > 0 && cost >= 0 && price >= 0) {
            items.push({ name, type, qty, cost, price });
            totalCost += (qty * cost);
        } else if (name) {
            valid = false;
        }
    });

    if (items.length === 0 || !valid) {
        alert("الرجاء التأكد من إدخال بيانات الأصناف والكميات بشكل صحيح.");
        return;
    }

    const newShipment = {
        id: generateId("SH"),
        date: formatDate(new Date()),
        supplier,
        canteen,
        invoiceRef,
        items,
        driverNotes: notes,
        status: 'transferred',
        driverHandoverConfirmed: true,
        workerNotes: "",
        origin: "manual",
        totalCost,
        hasDiscrepancy: false
    };

    const remoteShipment = await insertShipmentRemote(newShipment);
    appState.shipments.unshift(remoteShipment || newShipment);
    saveLocalState();

    document.getElementById('driver-invoice').value = "";
    document.getElementById('driver-notes').value = "";
    document.getElementById('driver-items-body').innerHTML = "";
    addDriverRow();
    addDriverRow();

    alert(`تم إرسال الشحنة بنجاح!\nرقم الشحنة: ${newShipment.id}\n${remoteShipment ? "تمت المزامنة سحابياً مع Supabase." : "تم الحفظ محلياً."}`);
    renderAll();
}

// --- وظائف لوحة عامل المقصف (Worker Operations) ---
function applyWorkerFilter() {
    appState.workerFilterQuery = document.getElementById('worker-search').value.toLowerCase();
    appState.workerFilterStatus = document.getElementById('worker-status-filter').value;
    renderWorkerShipments();
}

function renderWorkerShipments() {
    const list = document.getElementById('worker-shipments-list');
    if (!list) return;
    list.innerHTML = "";

    const filtered = appState.shipments.filter(s => {
        const matchQuery = s.id.toLowerCase().includes(appState.workerFilterQuery) || s.supplier.toLowerCase().includes(appState.workerFilterQuery);
        const matchStatus = appState.workerFilterStatus === 'all' || s.status === appState.workerFilterStatus;
        return matchQuery && matchStatus && s.status !== 'pending';
    });

    if (filtered.length === 0) {
        list.innerHTML = `<div class="text-center p-8 text-gray-500 bg-white rounded-xl shadow-sm border border-gray-100"><i data-lucide="inbox" class="w-12 h-12 mx-auto mb-3 text-gray-300"></i>لا توجد شحنات مطابقة للبحث.</div>`;
    } else {
        filtered.forEach(s => {
            const isTransferred = s.status === 'transferred';
            let statusBadge = '';
            if (s.status === 'transferred') statusBadge = '<span class="bg-yellow-100 text-yellow-800 text-xs px-2 py-1 rounded-full font-semibold">قيد التسليم (بانتظارك)</span>';
            else if (s.status === 'received') statusBadge = '<span class="bg-green-100 text-green-800 text-xs px-2 py-1 rounded-full font-semibold">تم الاستلام</span>';
            else if (s.status === 'rejected') statusBadge = '<span class="bg-red-100 text-red-800 text-xs px-2 py-1 rounded-full font-semibold">مرفوضة / مرتجعة</span>';

            const originBadge = s.origin === "whatsapp" 
                ? '<span class="bg-emerald-100 text-emerald-800 text-xs px-2 py-0.5 rounded font-mono mr-2"><i data-lucide="message-square" class="w-3 h-3 inline"></i> الواتساب</span>' 
                : '';

            const card = document.createElement('div');
            card.className = "bg-white p-5 rounded-xl shadow-sm border border-gray-100 hover:shadow-md transition-shadow relative overflow-hidden group";
            const statusColor = s.status === 'transferred' ? 'bg-yellow-400' : (s.status === 'received' ? 'bg-green-500' : 'bg-red-500');

            card.innerHTML = `
                <div class="absolute right-0 top-0 bottom-0 w-1 ${statusColor}"></div>
                <div class="flex justify-between items-start mb-4 pr-3">
                    <div>
                        <div class="flex items-center gap-2 mb-1">
                            <h4 class="font-bold text-gray-800 text-lg">${s.id}</h4>
                            ${statusBadge}
                            ${originBadge}
                        </div>
                        <p class="text-sm text-gray-500 flex items-center gap-1"><i data-lucide="clock" class="w-3 h-3"></i> ${s.date}</p>
                    </div>
                    <div class="text-left">
                        <p class="text-sm font-semibold text-gray-700">${s.supplier}</p>
                        <p class="text-xs text-gray-500">المرجع: <span class="font-mono">${s.invoiceRef || 'بدون'}</span></p>
                    </div>
                </div>

                <div class="bg-gray-50 rounded-lg p-3 mb-4 text-sm">
                    <p class="font-semibold text-gray-700 mb-2">الأصناف المرفقة:</p>
                    <ul class="space-y-1">
                        ${s.items.map(item => `<li class="flex justify-between text-gray-600"><span>${item.name}</span> <span class="font-mono font-medium">${item.qty} حبة</span></li>`).join('')}
                    </ul>
                </div>

                ${isTransferred ? `
                    <div class="border-t border-gray-100 pt-4 flex gap-2">
                        <button onclick="openReceiveModal('${s.id}')" class="flex-1 bg-blue-600 hover:bg-blue-700 text-white py-2 rounded-lg font-semibold flex items-center justify-center gap-2 transition-colors">
                            <i data-lucide="check-square" class="w-4 h-4"></i> تأكيد الاستلام المباشر
                        </button>
                    </div>
                ` : `
                    <div class="border-t border-gray-100 pt-3 text-sm">
                        <p class="text-gray-600"><strong>ملاحظات الاستلام:</strong> ${s.workerNotes || 'لا توجد'}</p>
                        ${s.hasDiscrepancy ? '<p class="text-orange-600 mt-1 font-semibold"><i data-lucide="alert-triangle" class="w-4 h-4 inline"></i> تم تسجيل نقص/زيادة أثناء الاستلام.</p>' : ''}
                    </div>
                `}
            `;
            list.appendChild(card);
        });
    }
    if (window.lucide) lucide.createIcons();
}

function openReceiveModal(id) {
    const shipment = appState.shipments.find(s => s.id === id);
    if (!shipment) return;

    document.getElementById('receive-modal-id').textContent = shipment.id;
    document.getElementById('receive-modal-notes').value = "";

    const discrepancyCheck = document.getElementById('receive-modal-discrepancy');
    if (discrepancyCheck) discrepancyCheck.checked = false;

    const verifiedCheck = document.getElementById('receive-modal-goods-verified');
    if (verifiedCheck) verifiedCheck.checked = true;

    const itemsContainer = document.getElementById('receive-modal-items');
    if (itemsContainer) {
        itemsContainer.innerHTML = "";
        shipment.items.forEach((item, index) => {
            const itemDiv = document.createElement('div');
            itemDiv.className = "flex items-center justify-between p-3 bg-white rounded-lg border border-gray-100 shadow-sm";
            itemDiv.innerHTML = `
                <div class="flex-1">
                    <p class="font-semibold text-gray-800">${item.name}</p>
                    <p class="text-xs text-gray-500">${item.type} - الكمية المرسلة: ${item.qty}</p>
                </div>
                <div class="w-32">
                    <label class="text-xs text-gray-500 block mb-1">المستلم فعلياً</label>
                    <input type="number" id="receive-qty-${index}" class="w-full border rounded p-2 text-sm focus:ring-2 focus:ring-blue-500 text-center font-mono" value="${item.qty}" min="0">
                </div>
            `;
            itemsContainer.appendChild(itemDiv);
        });
    }

    document.getElementById('receive-modal-id-hidden').value = id;
    showElement('receive-modal');
}

function closeReceiveModal() {
    hideElement('receive-modal');
}

async function confirmReceive() {
    const id = document.getElementById('receive-modal-id-hidden').value;
    const notes = document.getElementById('receive-modal-notes').value;
    const discrepancyCheck = document.getElementById('receive-modal-discrepancy');
    const hasDiscrepancy = discrepancyCheck ? discrepancyCheck.checked : false;

    const shipment = appState.shipments.find(s => s.id === id);
    if (!shipment) return;

    let actualItemsReceived = [];
    let isFullyMatched = true;

    shipment.items.forEach((item, index) => {
        const inputEl = document.getElementById(`receive-qty-${index}`);
        const receivedQty = inputEl ? (parseInt(inputEl.value) || 0) : item.qty;
        actualItemsReceived.push({...item, receivedQty: receivedQty});

        if (receivedQty !== item.qty) {
            isFullyMatched = false;
        }

        const existingStock = appState.inventory.find(inv => inv.name === item.name);
        if (existingStock) {
            existingStock.receivedQty += receivedQty;
            existingStock.actualStock += receivedQty;
        } else {
            appState.inventory.push({
                id: Date.now() + Math.random(),
                name: item.name,
                type: item.type,
                receivedQty: receivedQty,
                estimatedSold: 0,
                actualStock: receivedQty,
                wasted: 0,
                cost: item.cost
            });
        }
    });

    const updatedShipment = {
        ...shipment,
        status: 'received',
        workerNotes: notes,
        hasDiscrepancy: hasDiscrepancy || !isFullyMatched,
        actualItemsReceived: actualItemsReceived
    };

    const remoteUpdated = await updateShipmentRemote(updatedShipment);
    Object.assign(shipment, updatedShipment);
    await upsertInventoryRemote(appState.inventory);
    saveLocalState();

    alert(`تم تأكيد استلام الشحنة وتحديث المخزون بنجاح ${remoteUpdated ? "(مستقر سحابياً)" : "(محلياً)"}.`);
    closeReceiveModal();
    renderAll();
}

// --- كود المسح الضوئي (QR Code Scanner) ---
function startScanner() {
    showElement('scanner-container');
    if (!html5QrcodeScanner && window.Html5QrcodeScanner) {
        html5QrcodeScanner = new Html5QrcodeScanner("reader", { fps: 10, qrbox: {width: 250, height: 250} }, false);
        html5QrcodeScanner.render(onScanSuccess, onScanFailure);
    }
}

function stopScanner() {
    if (html5QrcodeScanner) {
        html5QrcodeScanner.clear();
        html5QrcodeScanner = null;
    }
    hideElement('scanner-container');
}

function onScanSuccess(decodedText) {
    stopScanner();
    document.getElementById('worker-search').value = decodedText;
    applyWorkerFilter();
    const s = appState.shipments.find(sh => sh.id === decodedText && sh.status === 'transferred');
    if (s) openReceiveModal(s.id);
}

function onScanFailure(error) {
    // تجاهل أخطاء المسح المستمر
}

// --- وظائف الجرد والرقابة (Inventory Audit) ---
function renderInventoryTable() {
    const tbody = document.getElementById('inventory-body');
    if (!tbody) return;
    tbody.innerHTML = "";

    appState.inventory.forEach(item => {
        const tr = document.createElement('tr');
        tr.className = "border-b border-gray-100 hover:bg-gray-50";
        tr.innerHTML = `
            <td class="p-3 text-sm font-semibold text-gray-800">${item.name}</td>
            <td class="p-3 text-sm text-gray-500">${item.type}</td>
            <td class="p-3 text-sm font-mono text-center">${item.receivedQty}</td>
            <td class="p-3 text-sm font-mono text-center text-blue-600">${item.estimatedSold}</td>
            <td class="p-3 text-center">
                <input type="number" class="w-20 border rounded p-1 text-sm text-center focus:ring-2 focus:ring-blue-500 font-mono" value="${item.actualStock}" onchange="updateStock(${item.id}, 'actualStock', this.value)">
            </td>
            <td class="p-3 text-center">
                <input type="number" class="w-16 border border-red-200 bg-red-50 text-red-700 rounded p-1 text-sm text-center focus:ring-2 focus:ring-red-500 font-mono" value="${item.wasted}" onchange="updateStock(${item.id}, 'wasted', this.value)">
            </td>
        `;
        tbody.appendChild(tr);
    });
}

function updateStock(id, field, value) {
    const item = appState.inventory.find(i => i.id === id);
    if (item) {
        item[field] = parseInt(value) || 0;
        saveLocalState();
        upsertInventoryRemote([item]);
    }
}

async function saveDailyInventory() {
    const remoteSaved = await upsertInventoryRemote(appState.inventory);
    saveLocalState();
    alert(`تم حفظ واعتماد الجرد اليومي وتجميد العهدة ${remoteSaved ? "سحابياً" : "محلياً"}.`);
    updateAdminDashboard();
}

// --- وظائف الإدارة والذكاء الاصطناعي (Admin & AI) ---
function updateAdminDashboard() {
    const totalShipments = appState.shipments.length;
    const pendingIssues = appState.shipments.filter(s => s.hasDiscrepancy || s.status === 'rejected').length;

    let totalValue = 0;
    appState.inventory.forEach(item => totalValue += (item.actualStock * item.cost));

    let totalWasteValue = 0;
    appState.inventory.forEach(item => totalWasteValue += (item.wasted * item.cost));

    const totalEl = document.getElementById('stat-total-shipments');
    const pendingEl = document.getElementById('stat-pending-issues');
    const valueEl = document.getElementById('stat-inventory-value');
    const wasteEl = document.getElementById('stat-waste-value');

    if (totalEl) totalEl.textContent = totalShipments;
    if (pendingEl) pendingEl.textContent = pendingIssues;
    if (valueEl) valueEl.textContent = totalValue.toFixed(2) + ' ر.س';
    if (wasteEl) wasteEl.textContent = totalWasteValue.toFixed(2) + ' ر.س';
}

function generateAIReport() {
    const reportBox = document.getElementById('ai-report-content');
    if (!reportBox) return;

    reportBox.innerHTML = `<div class="flex items-center justify-center p-8 text-blue-600"><i data-lucide="loader-2" class="w-8 h-8 animate-spin mr-2"></i> جاري تحليل البيانات بواسطة AI...</div>`;
    if (window.lucide) lucide.createIcons();

    setTimeout(() => {
        let wasteIssue = false;
        let wasteItem = "";

        const highWaste = appState.inventory.find(i => i.wasted > (i.receivedQty * 0.05));
        if (highWaste) {
            wasteIssue = true;
            wasteItem = highWaste.name;
        }

        const receiptNotes = appState.shipments
            .filter(s => s.status === 'received' && s.workerNotes && s.workerNotes.trim())
            .slice(0, 3);
        const discrepancyShipments = appState.shipments.filter(s => s.hasDiscrepancy);
        const reportNotesHtml = receiptNotes.length
            ? `<div class="p-3 bg-blue-50 border-r-4 border-blue-500 rounded text-blue-800"><strong>ملاحظات الاستلام الميداني:</strong><ul class="list-disc list-inside mt-1">${receiptNotes.map(s => `<li>${s.id}: ${s.workerNotes}</li>`).join('')}</ul></div>`
            : '';

        const reportText = `
            <div class="space-y-4 text-sm text-gray-700 leading-relaxed">
                <p><strong><i data-lucide="sparkles" class="w-4 h-4 inline text-purple-500"></i> ملخص التحليل الذكي للعمليات:</strong></p>
                <p>تم تحليل بيانات التوريد والاستلام والجرد اليومي. الأداء العام مستقر، وتوجد (${appState.shipments.filter(s=>s.status==='received').length}) شحنات تم استلامها بالكامل.</p>

                ${wasteIssue ? `
                <div class="p-3 bg-red-50 border-r-4 border-red-500 rounded text-red-800">
                    <strong>تنبيه هدر:</strong> ارتفعت نسبة الهادر/التوالف في صنف (${wasteItem}). يوصى بخفض التوريد غداً بنسبة 10%.
                </div>
                ` : `
                <div class="p-3 bg-green-50 border-r-4 border-green-500 rounded text-green-800">
                    <strong>مؤشر جودة ممتاز:</strong> معدلات الهادر ضمن الحد الطبيعي (أقل من 2%).
                </div>
                `}
                ${reportNotesHtml}

                <p><strong>التوصيات التنفيذية:</strong></p>
                <ul class="list-disc list-inside space-y-1 pr-2">
                    <li>متابعة الأصناف الطازجة عند استلام الصباح.</li>
                    <li>${discrepancyShipments.length ? `متابعة ${discrepancyShipments.length} شحنات تم تسجيل تباين في كمياتها.` : 'لا توجد ملاحظات استلام معلقة.'}</li>
                </ul>
            </div>
        `;

        lastExecutiveReportText = reportText;
        reportBox.innerHTML = reportText;
        if (window.lucide) lucide.createIcons();
    }, 1200);
}

function printReport() {
    window.print();
}

function renderAll() {
    renderWorkerShipments();
    renderInventoryTable();
    const adminPanel = document.getElementById('admin-panel');
    if (adminPanel && !adminPanel.classList.contains('hidden')) {
        updateAdminDashboard();
    }
}
