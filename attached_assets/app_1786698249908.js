// --- إدارة حالة التطبيق (State Management) ---
let appState = {
    // بيانات افتراضية لشحنة سابقة للتجربة
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
        status: "transferred", // الحالات: pending, transferred, received, rejected
        driverHandoverConfirmed: true,
        workerNotes: "تم الاستلام والمطابقة بالكامل بدون نقص",
        pin: "3912",
        totalCost: 132.0,
        hasDiscrepancy: false
    }],
    // بيانات افتراضية للمخزون للتجربة
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

// --- التهيئة عند تحميل الصفحة ---
document.addEventListener("DOMContentLoaded", () => {
    // تشغيل الأيقونات
    lucide.createIcons();
    // إضافة صفوف افتراضية في شاشة السائق
    addDriverRow("ساندوتش دجاج طازج", "طازج", 40, 2.5, 4.0);
    addDriverRow("عصير مشكل 200 مل", "معلبات", 50, 1.2, 2.0);
    // تحديث الواجهات
    renderAll();
});

// --- دوال مساعدة عامة ---
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

// --- نظام تسجيل الدخول (صوري) ---
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
    
    // إخفاء جميع اللوحات أولاً
    ['driver-panel', 'worker-panel', 'audit-panel', 'admin-panel'].forEach(hideElement);
    
    // إظهار اللوحة المناسبة
    showElement(`${role}-panel`);
    
    if (role === 'admin') updateAdminDashboard();
}

function logout() {
    hideElement('app-screen');
    showElement('login-screen');
    document.getElementById('login-role').value = "";
}

// --- وظائف السائق (المورد) ---
function addDriverRow(name='', type='معلبات', qty='', cost='', price='') {
    const tbody = document.getElementById('driver-items-body');
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
    lucide.createIcons();
}

function createShipment() {
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

    if (items.length === 0) {
        alert("الرجاء إضافة أصناف صحيحة للفاتورة.");
        return;
    }
    if(!valid) {
        alert("بعض الأصناف بياناتها غير مكتملة أو خاطئة.");
        return;
    }

    const pin = Math.floor(1000 + Math.random() * 9000).toString();
    const newShipment = {
        id: generateId("SH"),
        date: formatDate(new Date()),
        supplier,
        canteen,
        invoiceRef,
        items,
        driverNotes: notes,
        status: 'transferred', // تم النقل وينتظر الاستلام
        driverHandoverConfirmed: true,
        workerNotes: "",
        pin,
        totalCost,
        hasDiscrepancy: false
    };

    appState.shipments.unshift(newShipment);
    
    // إعادة تعيين النموذج
    document.getElementById('driver-invoice').value = "";
    document.getElementById('driver-notes').value = "";
    document.getElementById('driver-items-body').innerHTML = "";
    addDriverRow();
    addDriverRow();
    
    alert(`تم إصدار فاتورة نقل العهدة بنجاح!\nرقم الشحنة: ${newShipment.id}\nرمز التسليم السري (PIN): ${pin}\n(أعطِ هذا الرمز لعامل المقصف عند التسليم)`);
    renderAll();
}

// --- وظائف عامل المقصف ---
function applyWorkerFilter() {
    appState.workerFilterQuery = document.getElementById('worker-search').value.toLowerCase();
    appState.workerFilterStatus = document.getElementById('worker-status-filter').value;
    renderWorkerShipments();
}

function renderWorkerShipments() {
    const list = document.getElementById('worker-shipments-list');
    list.innerHTML = "";
    
    const filtered = appState.shipments.filter(s => {
        const matchQuery = s.id.toLowerCase().includes(appState.workerFilterQuery) || s.supplier.toLowerCase().includes(appState.workerFilterQuery);
        const matchStatus = appState.workerFilterStatus === 'all' || s.status === appState.workerFilterStatus;
        return matchQuery && matchStatus && s.status !== 'pending'; // العامل يرى المنقول والمستلم والمرفوض
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

            const card = document.createElement('div');
            card.className = "bg-white p-5 rounded-xl shadow-sm border border-gray-100 hover:shadow-md transition-shadow relative overflow-hidden group";
            
            // خط جانبي ملون حسب الحالة
            const statusColor = s.status === 'transferred' ? 'bg-yellow-400' : (s.status === 'received' ? 'bg-green-500' : 'bg-red-500');
            
            card.innerHTML = `
                <div class="absolute right-0 top-0 bottom-0 w-1 ${statusColor}"></div>
                <div class="flex justify-between items-start mb-4 pr-3">
                    <div>
                        <div class="flex items-center gap-2 mb-1">
                            <h4 class="font-bold text-gray-800 text-lg">${s.id}</h4>
                            ${statusBadge}
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
                            <i data-lucide="check-square" class="w-4 h-4"></i> مطابقة واستلام
                        </button>
                    </div>
                ` : `
                    <div class="border-t border-gray-100 pt-3 text-sm">
                        <p class="text-gray-600"><strong>ملاحظات الاستلام:</strong> ${s.workerNotes || 'لا توجد'}</p>
                        ${s.hasDiscrepancy ? '<p class="text-orange-600 mt-1 font-semibold"><i data-lucide="alert-triangle" class="w-4 h-4 inline"></i> تم تسجيل عجز/زيادة أثناء الاستلام.</p>' : ''}
                    </div>
                `}
            `;
            list.appendChild(card);
        });
    }
    lucide.createIcons();
}

function openReceiveModal(id) {
    const shipment = appState.shipments.find(s => s.id === id);
    if (!shipment) return;

    document.getElementById('receive-modal-id').textContent = shipment.id;
    document.getElementById('receive-modal-pin').value = "";
    document.getElementById('receive-modal-notes').value = "";
    document.getElementById('receive-modal-discrepancy').checked = false;
    
    // إنشاء نموذج المطابقة للأصناف
    const itemsContainer = document.getElementById('receive-modal-items');
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

    document.getElementById('receive-modal-id-hidden').value = id;
    showElement('receive-modal');
}

function closeReceiveModal() {
    hideElement('receive-modal');
}

function confirmReceive() {
    const id = document.getElementById('receive-modal-id-hidden').value;
    const pin = document.getElementById('receive-modal-pin').value;
    const notes = document.getElementById('receive-modal-notes').value;
    const hasDiscrepancy = document.getElementById('receive-modal-discrepancy').checked;

    const shipment = appState.shipments.find(s => s.id === id);
    
    if (shipment.pin !== pin && pin !== "0000") { // 0000 للماستر كي
        alert("رمز التسليم (PIN) غير صحيح! يرجى طلبه من السائق.");
        return;
    }

    // التحقق من المطابقة وتحديث الكميات المستلمة (محاكاة)
    let actualItemsReceived = [];
    let isFullyMatched = true;
    
    shipment.items.forEach((item, index) => {
        const receivedQty = parseInt(document.getElementById(`receive-qty-${index}`).value) || 0;
        actualItemsReceived.push({...item, receivedQty: receivedQty});
        
        if(receivedQty !== item.qty) {
            isFullyMatched = false;
        }
        
        // --- تحديث المخزون (صوري) ---
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

    shipment.status = 'received';
    shipment.workerNotes = notes;
    shipment.hasDiscrepancy = hasDiscrepancy || !isFullyMatched;
    shipment.actualItemsReceived = actualItemsReceived; // تخزين الكميات الفعلية

    alert("تم تأكيد استلام الشحنة وتحديث عهدة المقصف والمخزون بنجاح.");
    closeReceiveModal();
    renderAll();
}

function startScanner() {
    showElement('scanner-container');
    if (!html5QrcodeScanner) {
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

function onScanSuccess(decodedText, decodedResult) {
    stopScanner();
    document.getElementById('worker-search').value = decodedText;
    applyWorkerFilter();
    // محاولة فتح المودال تلقائياً إذا كانت الشحنة موجودة وقيد التسليم
    const s = appState.shipments.find(sh => sh.id === decodedText && sh.status === 'transferred');
    if(s) openReceiveModal(s.id);
}

function onScanFailure(error) {
    // تجاهل الأخطاء المستمرة أثناء المسح
}


// --- وظائف الجرد والرقابة ---
function renderInventoryTable() {
    const tbody = document.getElementById('inventory-body');
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
        // هنا يمكن إضافة منطق لحساب العجز/الزيادة الفورية
    }
}

function saveDailyInventory() {
    alert("تم حفظ واعتماد الجرد اليومي وتجميد العهدة. جاري إرسال البيانات للإدارة...");
    // محاكاة إرسال تقرير
    updateAdminDashboard();
}

// --- وظائف الإدارة (الذكاء الاصطناعي والتقارير) ---
function updateAdminDashboard() {
    // تحديث الإحصائيات السريعة
    const totalShipments = appState.shipments.length;
    const pendingIssues = appState.shipments.filter(s => s.hasDiscrepancy || s.status === 'rejected').length;
    
    let totalValue = 0;
    appState.inventory.forEach(item => totalValue += (item.actualStock * item.cost));
    
    let totalWasteValue = 0;
    appState.inventory.forEach(item => totalWasteValue += (item.wasted * item.cost));

    document.getElementById('stat-total-shipments').textContent = totalShipments;
    document.getElementById('stat-pending-issues').textContent = pendingIssues;
    document.getElementById('stat-inventory-value').textContent = totalValue.toFixed(2) + ' ر.س';
    document.getElementById('stat-waste-value').textContent = totalWasteValue.toFixed(2) + ' ر.س';
}

function generateAIReport() {
    const reportBox = document.getElementById('ai-report-content');
    reportBox.innerHTML = `<div class="flex items-center justify-center p-8 text-blue-600"><i data-lucide="loader-2" class="w-8 h-8 animate-spin mr-2"></i> جاري تحليل البيانات بواسطة AI...</div>`;
    lucide.createIcons();
    
    // محاكاة تأخير لمعالجة الذكاء الاصطناعي
    setTimeout(() => {
        let wasteIssue = false;
        let wasteItem = "";
        
        // تحليل بسيط كمثال للـ AI
        const highWaste = appState.inventory.find(i => i.wasted > (i.receivedQty * 0.05)); // هدر أكثر من 5%
        if (highWaste) {
            wasteIssue = true;
            wasteItem = highWaste.name;
        }

        const reportText = `
            <div class="space-y-4 text-sm text-gray-700 leading-relaxed">
                <p><strong><i data-lucide="sparkles" class="w-4 h-4 inline text-purple-500"></i> ملخص التحليل الذكي:</strong></p>
                <p>تم تحليل بيانات التوريد والمبيعات اليومية للمقاصف. الأداء العام مستقر، وتم استلام ${appState.shipments.filter(s=>s.status==='received').length} شحنات بنجاح.</p>
                
                ${wasteIssue ? `
                <div class="p-3 bg-red-50 border-r-4 border-red-500 rounded text-red-800">
                    <strong>تنبيه هدر:</strong> لوحظ ارتفاع في نسبة التوالف لصنف (${wasteItem}). يوصى بتقليل كمية التوريد غداً لهذا الصنف بنسبة 10% لتقليل الخسائر.
                </div>
                ` : `
                <div class="p-3 bg-green-50 border-r-4 border-green-500 rounded text-green-800">
                    <strong>مؤشر إيجابي:</strong> معدلات التوالف في الحدود الطبيعية جداً (أقل من 2%).
                </div>
                `}
                
                <p><strong>التوصيات:</strong></p>
                <ul class="list-disc list-inside space-y-1 pr-2">
                    <li>مراجعة مطابقة الكميات الطازجة غداً صباحاً.</li>
                    <li>تسوية العجز المالي البالغ (0 ر.س) مع المحاسبة.</li>
                </ul>
            </div>
        `;
        
        lastExecutiveReportText = reportText; // حفظ للطباعة
        reportBox.innerHTML = reportText;
        lucide.createIcons();
    }, 1500);
}

function printReport() {
    window.print();
}

// --- تحديث كل الواجهات ---
function renderAll() {
    renderWorkerShipments();
    renderInventoryTable();
    if(document.getElementById('admin-panel').classList.contains('hidden') === false) {
        updateAdminDashboard();
    }
}
