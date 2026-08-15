import { useEffect, useMemo, useState, type CSSProperties, type Dispatch, type ReactNode, type SetStateAction } from 'react';
import {
  ArrowLeft,
  ArrowUpRight,
  BarChart3,
  Boxes,
  CameraOff,
  CheckCircle2,
  CircleAlert,
  ClipboardCheck,
  Clock3,
  Cpu,
  Download,
  FileText,
  LoaderCircle,
  LogOut,
  PackageCheck,
  Plus,
  Printer,
  Receipt,
  RefreshCw,
  RotateCcw,
  Save,
  ScanLine,
  Search,
  Send,
  Shield,
  ShieldCheck,
  Sparkles,
  Store,
  Trash2,
  Truck,
  WifiOff,
  X,
  type LucideIcon,
} from 'lucide-react';

type Role = 'driver' | 'worker' | 'audit' | 'admin';
type ShipmentStatus = 'transferred' | 'received' | 'rejected';
type Notice = { type: 'success' | 'error' | 'info'; message: string };

type ShipmentItem = {
  name: string;
  type: string;
  qty: number | string;
  cost: number | string;
  price: number | string;
};

type ReceivedItem = ShipmentItem & { receivedQty: number };

type Shipment = {
  id: string;
  date: string;
  supplier: string;
  canteen: string;
  invoiceRef: string;
  items: ShipmentItem[];
  driverNotes: string;
  status: ShipmentStatus;
  driverHandoverConfirmed: boolean;
  workerNotes: string;
  origin: 'manual' | 'whatsapp';
  totalCost: number;
  hasDiscrepancy: boolean;
  actualItemsReceived?: ReceivedItem[];
};

type InventoryItem = {
  id: number;
  name: string;
  type: string;
  receivedQty: number;
  estimatedSold: number;
  actualStock: number;
  wasted: number;
  cost: number;
};

type AppData = {
  shipments: Shipment[];
  inventory: InventoryItem[];
  inventorySavedAt?: string;
};

const STORAGE_KEY = 'smart-canteen-state-v2';

const seedData: AppData = {
  shipments: [
    {
      id: 'SH-8801',
      date: '١٣‏/٠٨‏/٢٠٢٦، ٠٧:١٥ ص',
      supplier: 'شركة المراعي والجملة',
      canteen: 'المقصف الرئيسي - مدرسة الأمل',
      invoiceRef: 'INV-5541',
      items: [
        { name: 'عصير برتقال 250 مل', type: 'معلبات', qty: 48, cost: 1.5, price: 2.5 },
        { name: 'ساندوتش جبن بيضاء', type: 'طازج', qty: 30, cost: 2, price: 3.5 },
      ],
      driverNotes: 'تم استلام الفاتورة كاملة',
      status: 'transferred',
      driverHandoverConfirmed: true,
      workerNotes: '',
      origin: 'manual',
      totalCost: 132,
      hasDiscrepancy: false,
    },
  ],
  inventory: [
    { id: 1, name: 'عصير برتقال 250 مل', type: 'معلبات', receivedQty: 48, estimatedSold: 30, actualStock: 18, wasted: 0, cost: 1.5 },
    { id: 2, name: 'ساندوتش جبن بيضاء', type: 'طازج', receivedQty: 30, estimatedSold: 25, actualStock: 3, wasted: 2, cost: 2 },
  ],
};

const roleMeta = {
  driver: { title: 'السائق والمورد', fullTitle: 'إصدار الشحنات', icon: Truck, blurb: 'سجّل التوريد وأرفق الأصناف لتصل إلى سجل الاستلام.' },
  worker: { title: 'عامل المقصف', fullTitle: 'الاستلام والمطابقة', icon: PackageCheck, blurb: 'طابق الوارد مع الفاتورة وحدث عهدة المقصف فوراً.' },
  audit: { title: 'مسؤول الجرد', fullTitle: 'الجرد والرقابة', icon: ClipboardCheck, blurb: 'اعتمد الرصيد الفعلي وسجّل التالف في نهاية اليوم.' },
  admin: { title: 'الإدارة التنفيذية', fullTitle: 'المؤشرات والتقارير', icon: BarChart3, blurb: 'تابع التدفق التشغيلي واتخذ القرار من قراءة واحدة.' },
} as const;

function loadData(): AppData {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as AppData;
      if (Array.isArray(parsed.shipments) && Array.isArray(parsed.inventory)) {
        return {
          ...parsed,
          shipments: parsed.shipments.map((shipment) => ({
            ...shipment,
            origin: shipment.origin === 'whatsapp' ? 'whatsapp' : 'manual',
          })),
        };
      }
    }
  } catch {
    // A damaged local cache should never prevent the operational shell from opening.
  }
  return seedData;
}

function formatCurrency(value: number) {
  return `${value.toFixed(2)} ر.س`;
}

function dateStamp() {
  return new Intl.DateTimeFormat('ar-SA', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  }).format(new Date());
}

function makeId(prefix: string) {
  return `${prefix}-${Math.floor(Math.random() * 9000) + 1000}`;
}

function App() {
  const [data, setData] = useState<AppData>(seedData);
  const [role, setRole] = useState<Role | null>(null);
  const [selectedRole, setSelectedRole] = useState<Role | ''>('');
  const [hydrating, setHydrating] = useState(true);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [showInstall, setShowInstall] = useState(false);
  const [activePage, setActivePage] = useState<Role>('driver');

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setData(loadData());
      setHydrating(false);
    }, 260);
    const onInstall = (event: Event) => {
      event.preventDefault();
      setInstallPrompt(event as BeforeInstallPromptEvent);
      setShowInstall(true);
    };
    window.addEventListener('beforeinstallprompt', onInstall);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener('beforeinstallprompt', onInstall);
    };
  }, []);

  useEffect(() => {
    if (!hydrating) localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  }, [data, hydrating]);

  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(null), 4800);
    return () => window.clearTimeout(timer);
  }, [notice]);

  const showNotice = (type: Notice['type'], message: string) => setNotice({ type, message });

  const handleLogin = () => {
    if (!selectedRole) {
      showNotice('error', 'اختر صلاحية الدخول أولاً للمتابعة.');
      return;
    }
    setRole(selectedRole);
    setActivePage(selectedRole);
    setNotice(null);
  };

  const handleLogout = () => {
    setRole(null);
    setSelectedRole('');
    showNotice('info', 'تم تسجيل الخروج بأمان. يمكنك اختيار صلاحية أخرى.');
  };

  const installApp = async () => {
    if (!installPrompt) return;
    await installPrompt.prompt();
    setInstallPrompt(null);
    setShowInstall(false);
  };

  if (hydrating) return <LoadingScreen />;
  if (!role) {
    return (
      <div className="grain">
        <RoleEntry selectedRole={selectedRole} setSelectedRole={setSelectedRole} onLogin={handleLogin} notice={notice} />
      </div>
    );
  }

  return (
    <div className="grain app-frame">
      <Workspace
        role={role}
        activePage={activePage}
        setActivePage={setActivePage}
        data={data}
        setData={setData}
        onLogout={handleLogout}
        showNotice={showNotice}
      />
      {notice && <Toast notice={notice} onClose={() => setNotice(null)} />}
      {showInstall && (
        <div className="install-banner no-print" data-testid="pwa-install-banner">
          <Download size={19} />
          <div style={{ flex: 1 }}>
            <strong style={{ display: 'block', fontSize: '.82rem' }}>ثبّت المقصف الذكي</strong>
            <span style={{ color: 'hsl(var(--muted-foreground))', fontSize: '.72rem' }}>وصول أسرع حتى عند ضعف الاتصال.</span>
          </div>
          <button className="button button-accent button-sm" onClick={installApp} data-testid="button-install-app">تثبيت</button>
          <button className="button icon-button button-ghost button-sm" onClick={() => setShowInstall(false)} aria-label="إغلاق" data-testid="button-dismiss-install"><X size={16} /></button>
        </div>
      )}
    </div>
  );
}

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
};

function LoadingScreen() {
  return (
    <div className="entry-shell" data-testid="loading-screen">
      <div className="entry-card" style={{ maxWidth: 620, display: 'block', padding: '2rem' }}>
        <div className="skeleton" style={{ width: 52, height: 52, margin: '0 auto 1.25rem' }} />
        <div className="skeleton" style={{ width: '50%', height: 28, margin: '0 auto .8rem' }} />
        <div className="skeleton" style={{ width: '72%', height: 14, margin: '0 auto 2rem' }} />
        <div className="skeleton" style={{ width: '100%', height: 48, marginBottom: '.8rem' }} />
        <div className="skeleton" style={{ width: '100%', height: 48 }} />
      </div>
    </div>
  );
}

function RoleEntry({
  selectedRole,
  setSelectedRole,
  onLogin,
  notice,
}: {
  selectedRole: Role | '';
  setSelectedRole: (role: Role | '') => void;
  onLogin: () => void;
  notice: Notice | null;
}) {
  return (
    <main className="entry-shell">
      <section className="entry-card fade-up" aria-label="اختيار صلاحية الدخول">
        <div className="entry-aside">
          <div className="brand-mark"><Store size={23} strokeWidth={2.2} /></div>
          <div style={{ position: 'relative', zIndex: 1, marginTop: '4.5rem' }}>
            <span className="eyebrow">SMART CANTEEN / OPS</span>
            <h1 className="display-title" style={{ marginTop: '.8rem' }}>كل صندوق<br />في مكانه.</h1>
            <p className="entry-aside-copy" style={{ maxWidth: 320, marginTop: '1.25rem', color: 'hsl(var(--sidebar-foreground) / .72)', lineHeight: 1.9, fontSize: '.9rem' }}>
              مساحة تشغيل واحدة تربط التوريد والاستلام والجرد، بتفاصيل واضحة وقرارات أسرع لمدرسة الأمل.
            </p>
          </div>
          <div style={{ position: 'absolute', bottom: '2rem', right: '3.25rem', left: '3.25rem', display: 'flex', justifyContent: 'space-between', color: 'hsl(var(--sidebar-foreground) / .55)', fontSize: '.7rem' }}>
            <span>نسخة تشغيلية 2.0</span><span>بيانات محلية آمنة</span>
          </div>
        </div>
        <div className="entry-form">
          <div style={{ marginBottom: '2rem' }}>
            <span className="eyebrow" style={{ color: 'hsl(var(--primary))' }}>بوابة الفريق</span>
            <h2 style={{ margin: '.55rem 0 .35rem', fontSize: '1.65rem', letterSpacing: '-.04em' }}>ابدأ يوم التشغيل</h2>
            <p style={{ margin: 0, color: 'hsl(var(--muted-foreground))', fontSize: '.85rem' }}>اختر الدور المناسب للوصول إلى مساحة العمل.</p>
          </div>

          <div className="field">
            <label htmlFor="login-role">صلاحية الدخول</label>
            <select
              id="login-role"
              className="select"
              value={selectedRole}
              onChange={(event) => setSelectedRole(event.target.value as Role | '')}
              data-testid="select-login-role"
            >
              <option value="">اختر صلاحية الدخول</option>
              <option value="driver">السائق والمورد</option>
              <option value="worker">عامل المقصف</option>
              <option value="audit">مسؤول الجرد والرقابة</option>
              <option value="admin">الإدارة والتقارير التنفيذية</option>
            </select>
          </div>

          {selectedRole && (
            <div className="notice notice-info fade-up" style={{ marginTop: '1rem' }} data-testid="role-description">
              {(() => { const MetaIcon = roleMeta[selectedRole].icon; return <MetaIcon size={17} />; })()}
              <span>{roleMeta[selectedRole].blurb}</span>
            </div>
          )}
          {notice && <div className={`notice notice-${notice.type === 'error' ? 'error' : 'info'}`} style={{ marginTop: '1rem' }} data-testid="status-login">{notice.message}</div>}

          <button className="button button-primary button-block" style={{ marginTop: '1.25rem', minHeight: 50 }} onClick={onLogin} data-testid="button-login">
            دخول إلى مساحة العمل <ArrowLeft size={18} />
          </button>
          <div style={{ display: 'flex', gap: '.55rem', alignItems: 'center', marginTop: '1.25rem', color: 'hsl(var(--muted-foreground))', fontSize: '.72rem' }}>
            <ShieldCheck size={15} color="hsl(var(--primary))" /> لا يتطلب الدخول حساباً خارجياً في النسخة المحلية
          </div>
        </div>
      </section>
    </main>
  );
}

function Workspace({
  role,
  activePage,
  setActivePage,
  data,
  setData,
  onLogout,
  showNotice,
}: {
  role: Role;
  activePage: Role;
  setActivePage: (role: Role) => void;
  data: AppData;
  setData: Dispatch<SetStateAction<AppData>>;
  onLogout: () => void;
  showNotice: (type: Notice['type'], message: string) => void;
}) {
  const navItems: Role[] = ['driver', 'worker', 'audit', 'admin'];
  const MetaIcon = roleMeta[role].icon;
  return (
    <div className="workspace-grid">
      <aside className="sidebar no-print">
        <div className="sidebar-brand">
          <div className="brand-mark" style={{ width: 38, height: 38, borderRadius: 11 }}><Store size={19} /></div>
          <div>
            <strong style={{ display: 'block', fontSize: '.92rem' }}>المقصف الذكي</strong>
            <span style={{ color: 'hsl(var(--sidebar-foreground) / .55)', fontSize: '.68rem' }}>مركز التشغيل المدرسي</span>
          </div>
        </div>
        <nav className="sidebar-nav" aria-label="التنقل الرئيسي">
          {navItems.map((item) => <NavButton key={item} role={item} active={activePage === item} onClick={() => setActivePage(item)} />)}
        </nav>
        <div className="sidebar-foot">
          <div style={{ display: 'flex', gap: '.55rem', alignItems: 'center', color: 'hsl(var(--sidebar-foreground) / .7)', fontSize: '.72rem', marginBottom: '.85rem' }}>
            <span style={{ width: 7, height: 7, borderRadius: '50%', background: 'hsl(151 52% 58%)' }} /> محفوظ محلياً
          </div>
          <button className="nav-item" onClick={onLogout} data-testid="button-logout"><LogOut size={17} /> تسجيل الخروج</button>
        </div>
      </aside>

      <div className="main-column">
        <header className="topbar no-print">
          <div style={{ display: 'flex', alignItems: 'center', gap: '.7rem' }}>
            <div className="metric-icon" style={{ '--metric-color': 'var(--primary)' } as CSSProperties}><MetaIcon size={18} /></div>
            <div>
              <div style={{ fontSize: '.74rem', color: 'hsl(var(--muted-foreground))' }}>مساحة العمل الحالية</div>
              <strong style={{ fontSize: '.9rem' }}>{roleMeta[role].title}</strong>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '.8rem' }}>
            <div className="pill pill-green"><span style={{ width: 6, height: 6, background: 'currentColor', borderRadius: '50%' }} /> متصل محلياً</div>
            <button className="button button-ghost button-sm icon-button" onClick={onLogout} aria-label="تسجيل الخروج" data-testid="button-topbar-logout"><LogOut size={16} /></button>
          </div>
        </header>
        <main className="main-content">
          {activePage === 'driver' && <DriverView data={data} setData={setData} showNotice={showNotice} />}
          {activePage === 'worker' && <WorkerView data={data} setData={setData} showNotice={showNotice} />}
          {activePage === 'audit' && <AuditView data={data} setData={setData} showNotice={showNotice} />}
          {activePage === 'admin' && <AdminView data={data} showNotice={showNotice} />}
        </main>
      </div>

      <nav className="mobile-nav no-print" aria-label="تنقل الهاتف">
        {navItems.map((item) => <NavButton key={item} role={item} active={activePage === item} onClick={() => setActivePage(item)} />)}
      </nav>
    </div>
  );
}

function NavButton({ role, active, onClick }: { role: Role; active: boolean; onClick: () => void }) {
  const Icon = roleMeta[role].icon;
  return <button className={`nav-item ${active ? 'active' : ''}`} onClick={onClick} data-testid={`nav-${role}`}><Icon size={18} /><span>{roleMeta[role].title}</span></button>;
}

function PageIntro({ eyebrow, title, subtitle, icon: Icon }: { eyebrow: string; title: string; subtitle: string; icon: LucideIcon }) {
  return (
    <div className="content-header fade-up">
      <div>
        <div className="eyebrow" style={{ color: 'hsl(var(--primary))' }}>{eyebrow}</div>
        <h1 className="page-title">{title}</h1>
        <p className="page-subtitle">{subtitle}</p>
      </div>
      <div className="metric-icon" style={{ '--metric-color': 'var(--accent)' } as CSSProperties}><Icon size={20} /></div>
    </div>
  );
}

function DriverView({ data, setData, showNotice }: { data: AppData; setData: Dispatch<SetStateAction<AppData>>; showNotice: WorkspaceProps['showNotice'] }) {
  const [supplier, setSupplier] = useState('شركة المراعي والجملة');
  const [canteen, setCanteen] = useState('المقصف الرئيسي - مدرسة الأمل');
  const [invoiceRef, setInvoiceRef] = useState('');
  const [notes, setNotes] = useState('');
  const [items, setItems] = useState<ShipmentItem[]>([
    { name: 'ساندوتش دجاج طازج', type: 'طازج', qty: 40, cost: 2.5, price: 4 },
    { name: 'عصير مشكل 200 مل', type: 'معلبات', qty: 50, cost: 1.2, price: 2 },
  ]);
  const [lastReceipt, setLastReceipt] = useState<{ id: string } | null>(null);
  const total = useMemo(() => items.reduce((sum, item) => sum + (Number(item.qty) || 0) * (Number(item.cost) || 0), 0), [items]);

  const updateItem = (index: number, key: keyof ShipmentItem, value: string) => {
    setItems((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, [key]: value } : item));
  };
  const resetForm = () => {
    setSupplier('شركة المراعي والجملة');
    setCanteen('المقصف الرئيسي - مدرسة الأمل');
    setInvoiceRef('');
    setNotes('');
    setItems([{ name: '', type: 'معلبات', qty: '', cost: '', price: '' }, { name: '', type: 'طازج', qty: '', cost: '', price: '' }]);
    setLastReceipt(null);
  };
  const createShipment = () => {
    const validItems: ShipmentItem[] = [];
    let invalid = false;
    items.forEach((item) => {
      if (!item.name && !item.qty && !item.cost && !item.price) return;
      const valid = Boolean(item.name) && Number(item.qty) > 0 && Number(item.cost) >= 0 && Number(item.price) >= 0;
      if (!valid) invalid = true;
      else validItems.push({ ...item, qty: Number(item.qty), cost: Number(item.cost), price: Number(item.price) });
    });
    if (!supplier || !canteen) return showNotice('error', 'يرجى تحديد المورد والمقصف.');
    if (invalid) return showNotice('error', 'راجع بيانات الأصناف: الاسم والكمية والتكلفة مطلوبة.');
    if (!validItems.length) return showNotice('error', 'أضف صنفاً واحداً صحيحاً على الأقل قبل الإرسال.');
    const shipment: Shipment = {
      id: makeId('SH'),
      date: dateStamp(),
      supplier,
      canteen,
      invoiceRef,
      items: validItems,
      driverNotes: notes,
      status: 'transferred',
      driverHandoverConfirmed: true,
      workerNotes: '',
      origin: 'manual',
      totalCost: validItems.reduce((sum, item) => sum + Number(item.qty) * Number(item.cost), 0),
      hasDiscrepancy: false,
    };
    setData((current) => ({ ...current, shipments: [shipment, ...current.shipments] }));
    setLastReceipt({ id: shipment.id });
    setInvoiceRef('');
    setNotes('');
    setItems([{ name: '', type: 'معلبات', qty: '', cost: '', price: '' }, { name: '', type: 'طازج', qty: '', cost: '', price: '' }]);
    showNotice('success', `تم إصدار الشحنة ${shipment.id} وحفظها محلياً.`);
  };

  return (
    <section>
      <PageIntro eyebrow="مسار التوريد / 01" title="إصدار شحنة جديدة" subtitle="سجّل الأصناف قبل مغادرة المورد، وسيظهر سجل الاستلام مباشرة لعامل المقصف." icon={Truck} />
      {lastReceipt && <div className="notice notice-success fade-up" style={{ marginBottom: '1rem' }} data-testid="shipment-created-success"><CheckCircle2 size={18} /><span>تم إنشاء الشحنة <strong className="mono">{lastReceipt.id}</strong> وحفظها في سجل الاستلام.</span></div>}
      <div className="card card-pad fade-up delay-1">
        <div className="section-heading">
          <div><h2><Receipt size={18} style={{ verticalAlign: 'middle', marginLeft: '.4rem', color: 'hsl(var(--primary))' }} /> بيانات الفاتورة</h2><p>تظهر هذه البيانات في سجل الاستلام والتقرير التنفيذي.</p></div>
          <button className="button button-ghost button-sm" onClick={resetForm} data-testid="button-reset-shipment"><RotateCcw size={15} /> إعادة ضبط</button>
        </div>
        <div className="form-grid">
          <Field label="المورد / الموزع"><input className="input" value={supplier} onChange={(e) => setSupplier(e.target.value)} data-testid="input-supplier" /></Field>
          <Field label="المقصف المستهدف"><select className="select" value={canteen} onChange={(e) => setCanteen(e.target.value)} data-testid="select-canteen"><option>المقصف الرئيسي - مدرسة الأمل</option><option>مقصف المرحلة الثانوية</option></select></Field>
          <Field label="رقم الفاتورة الورقية (اختياري)"><input className="input mono" placeholder="INV-9902" value={invoiceRef} onChange={(e) => setInvoiceRef(e.target.value)} data-testid="input-invoice" /></Field>
        </div>
      </div>

      <div className="card card-pad fade-up delay-2" style={{ marginTop: '1rem' }}>
        <div className="section-heading">
          <div><h2><Boxes size={18} style={{ verticalAlign: 'middle', marginLeft: '.4rem', color: 'hsl(var(--primary))' }} /> أصناف العهدة</h2><p>أدخل الكمية والتكلفة، وسيُحسب إجمالي التكلفة لحظياً.</p></div>
          <button className="button button-ghost button-sm" onClick={() => setItems((current) => [...current, { name: '', type: 'معلبات', qty: '', cost: '', price: '' }])} data-testid="button-add-item"><Plus size={15} /> إضافة صنف</button>
        </div>
        <div className="table-wrap">
          <table className="data-table">
            <thead><tr><th>اسم الصنف</th><th>النوع</th><th>الكمية</th><th>التكلفة</th><th>سعر البيع</th><th aria-label="حذف" /></tr></thead>
            <tbody>
              {items.map((item, index) => <tr key={index} data-testid={`row-driver-item-${index}`}>
                <td><input className="input" placeholder="اسم الصنف" value={item.name} onChange={(e) => updateItem(index, 'name', e.target.value)} data-testid={`input-item-name-${index}`} /></td>
                <td><select className="select" value={item.type} onChange={(e) => updateItem(index, 'type', e.target.value)} data-testid={`select-item-type-${index}`}><option>معلبات</option><option>طازج</option></select></td>
                <td><input className="input number-input" type="number" min="1" value={item.qty} onChange={(e) => updateItem(index, 'qty', e.target.value)} data-testid={`input-item-qty-${index}`} /></td>
                <td><input className="input number-input" type="number" min="0" step=".1" value={item.cost} onChange={(e) => updateItem(index, 'cost', e.target.value)} data-testid={`input-item-cost-${index}`} /></td>
                <td><input className="input number-input" type="number" min="0" step=".1" value={item.price} onChange={(e) => updateItem(index, 'price', e.target.value)} data-testid={`input-item-price-${index}`} /></td>
                <td><button className="button button-danger icon-button button-sm" onClick={() => setItems((current) => current.filter((_, itemIndex) => itemIndex !== index))} aria-label="حذف الصنف" data-testid={`button-remove-item-${index}`}><Trash2 size={16} /></button></td>
              </tr>)}
            </tbody>
          </table>
        </div>
        <div className="total-bar" style={{ marginTop: '1rem' }}><span style={{ fontWeight: 700 }}>إجمالي تكلفة العهدة</span><span className="total-value">{formatCurrency(total)}</span></div>
        <div className="field" style={{ marginTop: '1rem' }}><label htmlFor="driver-notes">ملاحظات السائق</label><textarea id="driver-notes" className="textarea" placeholder="أي ملاحظات حول التوصيل أو حالة الأصناف..." value={notes} onChange={(e) => setNotes(e.target.value)} data-testid="textarea-driver-notes" /></div>
        <button className="button button-accent button-block" style={{ marginTop: '1rem', minHeight: 48 }} onClick={createShipment} data-testid="button-create-shipment"><Send size={17} /> إرسال الشحنة مباشرة</button>
      </div>
    </section>
  );
}

type WorkspaceProps = { showNotice: (type: Notice['type'], message: string) => void };
function Field({ label, children }: { label: string; children: ReactNode }) {
  return <div className="field"><label>{label}</label>{children}</div>;
}

function WorkerView({ data, setData, showNotice }: { data: AppData; setData: Dispatch<SetStateAction<AppData>>; showNotice: WorkspaceProps['showNotice'] }) {
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | ShipmentStatus>('all');
  const [scannerOpen, setScannerOpen] = useState(false);
  const [scannerText, setScannerText] = useState('');
  const [receiveId, setReceiveId] = useState<string | null>(null);
  const shipment = data.shipments.find((item) => item.id === receiveId);
  const [actualQtys, setActualQtys] = useState<Record<string, string>>({});
  const [notes, setNotes] = useState('');
  const [markDiscrepancy, setMarkDiscrepancy] = useState(false);
  const [goodsVerified, setGoodsVerified] = useState(true);
  const filtered = data.shipments.filter((item) => {
    const matchesQuery = `${item.id} ${item.supplier}`.toLowerCase().includes(query.toLowerCase());
    return matchesQuery && (statusFilter === 'all' || item.status === statusFilter);
  });

  const openReceive = (id: string) => {
    const selected = data.shipments.find((item) => item.id === id);
    if (!selected) return;
    setReceiveId(id);
    setActualQtys(Object.fromEntries(selected.items.map((item) => [item.name, String(item.qty)])));
    setNotes('');
    setMarkDiscrepancy(false);
    setGoodsVerified(true);
  };
  const closeReceive = () => setReceiveId(null);
  const confirmReceive = () => {
    if (!shipment) return;
    const actualItemsReceived = shipment.items.map((item) => ({ ...item, receivedQty: Math.max(0, Number(actualQtys[item.name]) || 0) }));
    const mismatch = actualItemsReceived.some((item) => item.receivedQty !== Number(item.qty));
    setData((current) => {
      const inventory = current.inventory.map((stock) => ({ ...stock }));
      actualItemsReceived.forEach((received) => {
        const existing = inventory.find((item) => item.name === received.name);
        if (existing) {
          existing.receivedQty += received.receivedQty;
          existing.actualStock += received.receivedQty;
        } else {
          inventory.push({ id: Date.now() + Math.floor(Math.random() * 1000), name: received.name, type: received.type, receivedQty: received.receivedQty, estimatedSold: 0, actualStock: received.receivedQty, wasted: 0, cost: Number(received.cost) || 0 });
        }
      });
      return {
        ...current,
        inventory,
        shipments: current.shipments.map((item) => item.id === shipment.id ? { ...item, status: 'received', workerNotes: notes, hasDiscrepancy: markDiscrepancy || mismatch, actualItemsReceived } : item),
      };
    });
    closeReceive();
    showNotice('success', `تم استلام ${shipment.id} وتحديث المخزون.`);
  };
  const applyScan = () => {
    setQuery(scannerText.trim());
    setScannerOpen(false);
    if (scannerText.trim()) {
      const found = data.shipments.find((item) => item.id === scannerText.trim() && item.status === 'transferred');
      if (found) openReceive(found.id);
      else showNotice('info', 'لم نعثر على شحنة قيد التسليم بهذا المعرّف.');
    }
  };

  return (
    <section>
      <PageIntro eyebrow="مسار الاستلام / 02" title="مطابقة الشحنات" subtitle="ابحث عن شحنة، طابق الكميات، ثم ثبّت الاستلام برمز السائق." icon={PackageCheck} />
      <div className="card card-pad fade-up delay-1">
        <div className="toolbar">
          <div className="toolbar-fields">
            <div style={{ position: 'relative', flex: 1 }}><Search size={16} style={{ position: 'absolute', top: 13, right: 12, color: 'hsl(var(--muted-foreground))' }} /><input className="input" style={{ paddingRight: 2.4 + 'rem' }} placeholder="بحث برقم الشحنة أو المورد..." value={query} onChange={(e) => setQuery(e.target.value)} data-testid="input-worker-search" /></div>
            <select className="select" style={{ maxWidth: 180 }} value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as typeof statusFilter)} data-testid="select-worker-status"><option value="all">كل الحالات</option><option value="transferred">بانتظار الاستلام</option><option value="received">تم الاستلام</option><option value="rejected">مرتجعة</option></select>
          </div>
          <button className="button button-primary" onClick={() => setScannerOpen((value) => !value)} data-testid="button-open-scanner"><ScanLine size={17} /> مسح باركود الشحنة</button>
        </div>
        {scannerOpen && <div className="scanner-box fade-up" style={{ marginTop: '1rem' }} data-testid="scanner-fallback">
          <CameraOff size={29} color="hsl(var(--primary))" />
          <strong>المسح بالكاميرا غير متاح في هذه المعاينة</strong>
          <span style={{ color: 'hsl(var(--muted-foreground))', fontSize: '.78rem' }}>استخدم قارئ QR المتصل أو أدخل رقم الشحنة يدوياً لإكمال التدفق.</span>
          <div style={{ display: 'flex', width: 'min(100%, 430px)', gap: '.5rem' }}><input className="input mono" placeholder="SH-8801" value={scannerText} onChange={(e) => setScannerText(e.target.value)} data-testid="input-scanner-code" /><button className="button button-accent" onClick={applyScan} data-testid="button-apply-scanner">فتح</button></div>
          <span className="pill pill-blue"><WifiOff size={13} /> يعمل دون اتصال أيضاً</span>
        </div>}
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', margin: '1.5rem 0 .8rem' }}>
        <h2 style={{ margin: 0, fontSize: '1rem', fontWeight: 800 }}>سجل الشحنات <span className="pill pill-blue" style={{ marginRight: '.4rem' }}>{filtered.length}</span></h2>
        <span style={{ color: 'hsl(var(--muted-foreground))', fontSize: '.74rem' }}>آخر تحديث محلي</span>
      </div>
      {filtered.length === 0 ? <div className="card empty-state fade-up" data-testid="empty-worker-shipments"><div className="empty-icon"><Search size={22} /></div><strong>لا توجد شحنات مطابقة</strong><span style={{ marginTop: '.3rem', fontSize: '.78rem' }}>جرّب تغيير حالة العرض أو أنشئ شحنة جديدة من مساحة السائق.</span></div> : <div className="shipment-grid">{filtered.map((item, index) => <ShipmentCard key={item.id} shipment={item} index={index} onReceive={openReceive} />)}</div>}

      {shipment && <ReceiveModal shipment={shipment} actualQtys={actualQtys} setActualQtys={setActualQtys} notes={notes} setNotes={setNotes} goodsVerified={goodsVerified} setGoodsVerified={setGoodsVerified} markDiscrepancy={markDiscrepancy} setMarkDiscrepancy={setMarkDiscrepancy} onClose={closeReceive} onConfirm={confirmReceive} />}
    </section>
  );
}

function ShipmentCard({ shipment, index, onReceive }: { shipment: Shipment; index: number; onReceive: (id: string) => void }) {
  const pending = shipment.status === 'transferred';
  const statusClass = pending ? 'pill-amber' : shipment.status === 'received' ? 'pill-green' : 'pill-red';
  const statusText = pending ? 'بانتظار الاستلام' : shipment.status === 'received' ? 'تم الاستلام' : 'مرتجعة';
  return (
    <article className="card card-pad shipment-card fade-up" style={{ '--status-color': pending ? 'hsl(var(--accent))' : shipment.status === 'received' ? 'hsl(153 42% 42%)' : 'hsl(var(--destructive))', animationDelay: `${index * 70}ms` } as CSSProperties} data-testid={`card-shipment-${shipment.id}`}>
      <div className="shipment-top">
        <div><div style={{ display: 'flex', alignItems: 'center', gap: '.5rem' }}><h3 className="shipment-id">{shipment.id}</h3><span className={`pill ${statusClass}`}>{statusText}</span></div><div className="shipment-meta"><Clock3 size={13} /> {shipment.date}</div></div>
        <div style={{ textAlign: 'left' }}><strong style={{ display: 'block', fontSize: '.82rem' }}>{shipment.supplier}</strong><span style={{ color: 'hsl(var(--muted-foreground))', fontSize: '.7rem' }}>{shipment.invoiceRef || 'بدون مرجع'}</span><span className="pill pill-blue" style={{ marginTop: '.35rem' }}>{shipment.origin === 'whatsapp' ? 'WhatsApp' : 'إدخال يدوي'}</span></div>
      </div>
      <div className="items-box"><div style={{ fontSize: '.74rem', fontWeight: 800, marginBottom: '.35rem' }}>الأصناف المرفقة</div>{shipment.items.map((item) => <div className="item-line" key={item.name}><span>{item.name}</span><strong className="mono">{item.qty} حبة</strong></div>)}</div>
      {pending ? <button className="button button-primary button-block" style={{ marginTop: '1rem' }} onClick={() => onReceive(shipment.id)} data-testid={`button-receive-${shipment.id}`}><CheckCircle2 size={16} /> مطابقة واستلام</button> : <div style={{ marginTop: '1rem', paddingTop: '.8rem', borderTop: '1px solid hsl(var(--border))', fontSize: '.78rem' }}><strong>ملاحظات الاستلام:</strong> {shipment.workerNotes || 'لا توجد'}{shipment.hasDiscrepancy && <div style={{ color: 'hsl(var(--destructive))', marginTop: '.35rem', fontWeight: 700 }}><CircleAlert size={14} style={{ verticalAlign: 'middle', marginLeft: '.25rem' }} /> تم تسجيل تباين في الكميات</div>}</div>}
    </article>
  );
}

function ReceiveModal({ shipment, actualQtys, setActualQtys, notes, setNotes, goodsVerified, setGoodsVerified, markDiscrepancy, setMarkDiscrepancy, onClose, onConfirm }: { shipment: Shipment; actualQtys: Record<string, string>; setActualQtys: (value: Record<string, string>) => void; notes: string; setNotes: (value: string) => void; goodsVerified: boolean; setGoodsVerified: (value: boolean) => void; markDiscrepancy: boolean; setMarkDiscrepancy: (value: boolean) => void; onClose: () => void; onConfirm: () => void }) {
  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" data-testid="receive-modal">
      <div className="modal fade-up">
        <div className="modal-header"><div><div className="eyebrow" style={{ color: 'hsl(var(--primary))' }}>مطابقة ميدانية</div><h2 style={{ margin: '.25rem 0 0', fontSize: '1.15rem' }}>تأكيد استلام <span className="mono" style={{ color: 'hsl(var(--primary))' }}>{shipment.id}</span></h2></div><button className="button button-ghost icon-button button-sm" onClick={onClose} aria-label="إغلاق" data-testid="button-close-receive"><X size={18} /></button></div>
        <div className="modal-body">
          <div><label style={{ display: 'block', fontWeight: 700, fontSize: '.78rem', marginBottom: '.55rem' }}>طابق الكميات الفعلية المستلمة</label><div style={{ display: 'grid', gap: '.5rem' }}>{shipment.items.map((item) => <div key={item.name} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '.8rem', padding: '.65rem .75rem', border: '1px solid hsl(var(--border))', borderRadius: '.7rem' }}><div style={{ minWidth: 0 }}><strong style={{ display: 'block', fontSize: '.8rem' }}>{item.name}</strong><span style={{ color: 'hsl(var(--muted-foreground))', fontSize: '.7rem' }}>{item.type} · المرسل <span className="mono">{item.qty}</span></span></div><input className="input number-input" type="number" min="0" value={actualQtys[item.name] ?? ''} onChange={(e) => setActualQtys({ ...actualQtys, [item.name]: e.target.value })} data-testid={`input-received-qty-${item.name}`} /></div>)}</div></div>
          <label style={{ display: 'flex', alignItems: 'center', gap: '.5rem', padding: '.85rem', border: '1px solid hsl(151 32% 78%)', borderRadius: '.8rem', background: 'hsl(151 39% 92%)', color: 'hsl(153 42% 26%)', fontSize: '.78rem', fontWeight: 800 }}><input type="checkbox" checked={goodsVerified} onChange={(e) => setGoodsVerified(e.target.checked)} data-testid="checkbox-goods-verified" /> البضاعة موثقة ومستلمة مباشرة</label>
          <Field label="ملاحظات المستلم"><textarea className="textarea" rows={2} placeholder="اكتب ملاحظاتك إن وجدت..." value={notes} onChange={(e) => setNotes(e.target.value)} data-testid="textarea-receive-notes" /></Field>
          <label style={{ display: 'flex', alignItems: 'center', gap: '.5rem', color: 'hsl(var(--destructive))', fontSize: '.75rem', fontWeight: 700 }}><input type="checkbox" checked={markDiscrepancy} onChange={(e) => setMarkDiscrepancy(e.target.checked)} data-testid="checkbox-discrepancy" /> تسجيل تباين أو عجز وإحالته للإدارة</label>
        </div>
        <div className="modal-footer"><button className="button button-accent" style={{ flex: 1 }} onClick={onConfirm} data-testid="button-confirm-receive"><CheckCircle2 size={17} /> تأكيد مباشر للاستلام</button><button className="button button-ghost" onClick={onClose} data-testid="button-cancel-receive">إلغاء</button></div>
      </div>
    </div>
  );
}

function AuditView({ data, setData, showNotice }: { data: AppData; setData: Dispatch<SetStateAction<AppData>>; showNotice: WorkspaceProps['showNotice'] }) {
  const [saving, setSaving] = useState(false);
  const saveDaily = () => {
    setSaving(true);
    window.setTimeout(() => {
      setData((current) => ({ ...current, inventorySavedAt: dateStamp() }));
      setSaving(false);
      showNotice('success', 'تم اعتماد الجرد اليومي وتجميد العهدة للإدارة.');
    }, 450);
  };
  return (
    <section>
      <PageIntro eyebrow="مسار الرقابة / 03" title="الجرد اليومي" subtitle="سجّل الرصيد الفعلي والتالف قبل إغلاق يوم التشغيل." icon={ClipboardCheck} />
      <div className="card card-pad fade-up delay-1">
        <div className="section-heading"><div><h2><Shield size={18} style={{ verticalAlign: 'middle', marginLeft: '.4rem', color: 'hsl(var(--primary))' }} /> عهدة المقصف</h2><p>تُحفظ التعديلات محلياً، ويُسجل الاعتماد كتوقيت تشغيلي.</p></div><button className="button button-primary" onClick={saveDaily} disabled={saving} data-testid="button-save-inventory">{saving ? <LoaderCircle className="spin" size={16} /> : <Save size={16} />} {saving ? 'جارٍ الاعتماد...' : 'اعتماد الجرد'}</button></div>
        {data.inventorySavedAt && <div className="notice notice-success" style={{ marginBottom: '1rem' }} data-testid="inventory-saved-status"><CheckCircle2 size={16} /> آخر اعتماد: {data.inventorySavedAt}</div>}
        {data.inventory.length === 0 ? <div className="empty-state"><div className="empty-icon"><Boxes size={22} /></div><strong>لا توجد أصناف للجرد</strong><span style={{ fontSize: '.78rem' }}>ستظهر الأصناف بعد استلام أول شحنة.</span></div> : <div className="table-wrap"><table className="data-table"><thead><tr><th>اسم الصنف</th><th>النوع</th><th>الوارد اليوم</th><th>المبيعات المقدرة</th><th>المتبقي الفعلي</th><th>التالف / الهادر</th></tr></thead><tbody>{data.inventory.map((item) => <tr key={item.id} data-testid={`row-inventory-${item.id}`}><td><strong>{item.name}</strong></td><td style={{ color: 'hsl(var(--muted-foreground))' }}>{item.type}</td><td className="mono">{item.receivedQty}</td><td className="mono" style={{ color: 'hsl(var(--primary))' }}>{item.estimatedSold}</td><td><input className="input number-input" type="number" min="0" value={item.actualStock} onChange={(e) => setData((current) => ({ ...current, inventory: current.inventory.map((stock) => stock.id === item.id ? { ...stock, actualStock: Math.max(0, Number(e.target.value) || 0) } : stock) }))} data-testid={`input-actual-stock-${item.id}`} /></td><td><input className="input number-input" style={{ color: 'hsl(var(--destructive))', borderColor: 'hsl(var(--destructive) / .3)', background: 'hsl(var(--destructive) / .04)' }} type="number" min="0" value={item.wasted} onChange={(e) => setData((current) => ({ ...current, inventory: current.inventory.map((stock) => stock.id === item.id ? { ...stock, wasted: Math.max(0, Number(e.target.value) || 0) } : stock) }))} data-testid={`input-waste-${item.id}`} /></td></tr>)}</tbody></table></div>}
      </div>
    </section>
  );
}

function AdminView({ data, showNotice }: { data: AppData; showNotice: WorkspaceProps['showNotice'] }) {
  const [reporting, setReporting] = useState(false);
  const [report, setReport] = useState<ReactNode | null>(null);
  const totalValue = data.inventory.reduce((sum, item) => sum + item.actualStock * item.cost, 0);
  const wasteValue = data.inventory.reduce((sum, item) => sum + item.wasted * item.cost, 0);
  const issues = data.shipments.filter((item) => item.hasDiscrepancy || item.status === 'rejected').length;
  const received = data.shipments.filter((item) => item.status === 'received').length;
  const generateReport = () => {
    setReporting(true);
    window.setTimeout(() => {
      const highWaste = data.inventory.find((item) => item.wasted > item.receivedQty * .05);
      const receiptNotes = data.shipments.filter((item) => item.status === 'received' && item.workerNotes.trim()).slice(0, 3);
      const discrepancyShipments = data.shipments.filter((item) => item.hasDiscrepancy);
      setReport(<div style={{ display: 'grid', gap: '.8rem' }}><p style={{ margin: 0, fontWeight: 800 }}><Sparkles size={16} style={{ verticalAlign: 'middle', marginLeft: '.3rem', color: 'hsl(var(--accent))' }} /> ملخص التحليل الذكي</p><p style={{ margin: 0 }}>تم تحليل سجل التوريد والاستلام والجرد المحلي. أُغلقت <strong>{received}</strong> شحنات بنجاح من أصل <strong>{data.shipments.length}</strong>، بقيمة مخزون حالية <strong>{formatCurrency(totalValue)}</strong>.</p>{highWaste ? <div className="report-alert"><strong>تنبيه هدر:</strong> ارتفع التالف في صنف «{highWaste.name}» عن الحد التشغيلي. يوصى بخفض كمية التوريد التالية بنسبة 10% ومراجعة ظروف الحفظ.</div> : <div className="report-positive"><strong>مؤشر إيجابي:</strong> مستويات التالف ضمن الحدود الطبيعية. استمر في مطابقة الأصناف الطازجة صباحاً.</div>}{receiptNotes.length > 0 && <div className="notice notice-info"><strong>ملاحظات الاستلام:</strong><ul style={{ margin: '.35rem 0 0', paddingRight: '1.1rem' }}>{receiptNotes.map((item) => <li key={item.id}>{item.id}: {item.workerNotes}</li>)}</ul></div>}<div><strong>التوصيات العملية</strong><ul style={{ margin: '.35rem 0 0', paddingRight: '1.1rem' }}><li>مراجعة الكميات الطازجة قبل بدء الطابور الصباحي.</li><li>{discrepancyShipments.length ? `متابعة ${discrepancyShipments.length} شحنات تحمل تبايناً مسجلاً.` : issues ? `متابعة ${issues} ملاحظة استلام مع المورد.` : 'لا توجد ملاحظات استلام معلقة حالياً.'}</li><li>تثبيت اعتماد الجرد قبل إغلاق اليوم الدراسي.</li></ul></div></div>);
      setReporting(false);
      showNotice('success', 'تم توليد التقرير التنفيذي من البيانات الحالية.');
    }, 850);
  };
  return (
    <section>
      <PageIntro eyebrow="مركز القرار / 04" title="لوحة الإدارة" subtitle="قراءة تنفيذية لحركة الشحنات، قيمة المخزون، ومؤشرات الهدر." icon={BarChart3} />
      <div className="metric-grid fade-up delay-1">
        <Metric icon={Truck} label="إجمالي الشحنات" value={String(data.shipments.length)} color="var(--primary)" testId="stat-total-shipments" />
        <Metric icon={CircleAlert} label="ملاحظات / عجز" value={String(issues)} color="var(--accent)" testId="stat-pending-issues" />
        <Metric icon={Boxes} label="قيمة المخزون الحالية" value={formatCurrency(totalValue)} color="196 52% 37%" testId="stat-inventory-value" />
        <Metric icon={RefreshCw} label="خسائر الهدر اليومية" value={formatCurrency(wasteValue)} color="var(--destructive)" testId="stat-waste-value" />
      </div>
      <div className="card card-pad fade-up delay-2" style={{ marginTop: '1rem' }}>
        <div className="section-heading"><div><h2><Sparkles size={18} style={{ verticalAlign: 'middle', marginLeft: '.4rem', color: 'hsl(var(--accent))' }} /> التقرير التنفيذي الذكي</h2><p>تحليل مباشر من الحالة المحلية — لا توجد بيانات خارجية أو تخمينات.</p></div><div style={{ display: 'flex', gap: '.5rem' }}><button className="button button-accent button-sm" onClick={generateReport} disabled={reporting} data-testid="button-generate-report">{reporting ? <LoaderCircle size={15} className="spin" /> : <Cpu size={15} />} {reporting ? 'جارٍ التحليل...' : 'توليد التقرير'}</button><button className="button button-ghost button-sm" onClick={() => window.print()} disabled={!report} data-testid="button-print-report"><Printer size={15} /> طباعة</button></div></div>
        <div className="report-box" data-testid="report-content">{report || <div className="empty-state" style={{ minHeight: 150 }}><div className="empty-icon"><FileText size={22} /></div><strong>التقرير بانتظار طلبك</strong><span style={{ fontSize: '.78rem', marginTop: '.3rem' }}>اضغط «توليد التقرير» لقراءة توصيات تشغيلية مبنية على أرقام اليوم.</span></div>}</div>
      </div>
      <div className="card card-pad fade-up delay-3" style={{ marginTop: '1rem' }}><div className="section-heading"><div><h2><ArrowUpRight size={18} style={{ verticalAlign: 'middle', marginLeft: '.4rem', color: 'hsl(var(--primary))' }} /> نبذة عن الحالة</h2><p>ملخص صغير يساعد على تحديد الأولوية التالية.</p></div></div><div className="form-grid"><div><span className="metric-label">حالة الاستلام</span><div style={{ marginTop: '.35rem', fontWeight: 800 }}>{received === data.shipments.length && data.shipments.length ? 'كل الشحنات مستلمة' : `${data.shipments.length - received} شحنات بانتظار المطابقة`}</div></div><div><span className="metric-label">اعتماد الجرد</span><div style={{ marginTop: '.35rem', fontWeight: 800 }}>{data.inventorySavedAt ? 'معتمد اليوم' : 'بانتظار الاعتماد'}</div></div><div><span className="metric-label">مرجع التشغيل</span><div className="mono" style={{ marginTop: '.35rem', fontWeight: 800 }}>LOCAL / {new Date().getFullYear()}</div></div></div></div>
    </section>
  );
}

function Metric({ icon: Icon, label, value, color, testId }: { icon: LucideIcon; label: string; value: string; color: string; testId: string }) {
  return <div className="card metric-card" style={{ '--metric-color': color } as CSSProperties} data-testid={testId}><div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start' }}><div><div className="metric-label">{label}</div><div className="metric-value">{value}</div></div><div className="metric-icon"><Icon size={18} /></div></div></div>;
}

function Toast({ notice, onClose }: { notice: Notice; onClose: () => void }) {
  const Icon = notice.type === 'success' ? CheckCircle2 : notice.type === 'error' ? CircleAlert : WifiOff;
  return <div className={`install-banner fade-up`} style={{ right: '1rem', top: '1rem', bottom: 'auto', borderColor: notice.type === 'error' ? 'hsl(var(--destructive) / .25)' : undefined }} role="status" data-testid={`toast-${notice.type}`}><Icon size={18} color={notice.type === 'error' ? 'hsl(var(--destructive))' : 'hsl(var(--primary))'} /><span style={{ flex: 1, fontSize: '.8rem' }}>{notice.message}</span><button className="button button-ghost icon-button button-sm" onClick={onClose} aria-label="إغلاق الإشعار" data-testid="button-close-toast"><X size={15} /></button></div>;
}

export default App;