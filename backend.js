/* SHUAIBIYA production bridge — متوافق 100% مع هيكل قاعدة بيانات Supabase الفعلي */
(() => {
  const cfg = window.SHUAIBIYA_CONFIG || {};
  const ready = cfg.SUPABASE_URL && cfg.SUPABASE_ANON_KEY &&
    !cfg.SUPABASE_URL.includes('YOUR_PROJECT') && !cfg.SUPABASE_ANON_KEY.includes('YOUR_');

  const banner = msg => {
    let el = document.getElementById('backendNotice');
    if (!el) {
      el = document.createElement('div');
      el.id = 'backendNotice';
      el.className = 'notice';
      document.querySelector('main')?.prepend(el);
    }
    el.textContent = msg;
  };

  if (!ready || !window.supabase) {
    banner('المتجر في وضع التجهيز. يرجى التأكد من إعدادات config.js.');
    return;
  }

  const db = window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY);
  window.shuaibiyaDB = db;

  let categoriesMap = {}; // ربط رقم القسم باسمه
  let categoriesNameMap = {}; // ربط اسم القسم برقمه

  const escapeHtml = s => String(s ?? '').replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));

  // جلب الأقسام من جدول categories أو إنشاؤها تلقائياً إن لم تكن موجودة
  async function loadCategories() {
    const { data } = await db.from('categories').select('*');
    if (data && data.length > 0) {
      data.forEach(c => {
        categoriesMap[c.id] = c.name;
        categoriesNameMap[c.name] = c.id;
      });
    }
  }

  // تحويل صف المنتج من Supabase إلى صيغة واجهة المتجر
  const asProduct = r => {
    // قراءة القسم أو الوصف المحفوظ
    let catName = categoriesMap[r.category_id] || r.description || 'عام';
    return {
      id: r.id,
      name: r.name,
      cat: catName,
      price: Number(r.price || 0),
      old: Number(r.price ? Math.round(Number(r.price) * 1.15) : 0),
      tag: (r.stock !== null && r.stock <= 0) ? 'نفد المخزون' : 'متوفر',
      colors: ['متوفر'],
      sizes: ['مقاس موحد'],
      image_url: r.image_url || '',
      stock: r.stock ?? 10
    };
  };

  // جلب المنتجات الفعالة من جدول products
  async function loadProducts() {
    await loadCategories();
    const { data, error } = await db
      .from('products')
      .select('*')
      .eq('is_active', true)
      .order('created_at', { ascending: false });

    if (error) {
      banner('تعذر تحميل المنتجات: ' + error.message);
      return;
    }

    if (data && data.length > 0) {
      window.products = data.map(asProduct);
      if (typeof products !== 'undefined') products = window.products;
    }
    if (typeof render === 'function') render();
  }

  loadProducts();

  // تحسين عرض بطاقة المنتج عند وجود صورة
  if (typeof productCard === 'function') {
    const originalProductCard = productCard;
    productCard = function (p, related = false) {
      if (!p.image_url) return originalProductCard(p, related);
      if (related) {
        return `<article class="related-card" onclick="openProduct('${p.id}')"><div class="rel-img"><img src="${escapeHtml(p.image_url)}" alt="${escapeHtml(p.name)}" style="width:100%;height:100%;object-fit:cover"></div><p>${escapeHtml(p.name)}</p><b>${money(p.price)}</b></article>`;
      }
      return `<article class="product-card" onclick="openProduct('${p.id}')"><div class="product-image"><img src="${escapeHtml(p.image_url)}" alt="${escapeHtml(p.name)}"><span class="tag">${escapeHtml(p.tag || 'اختيار الشعيبية')}</span></div><div class="product-info"><h3>${escapeHtml(p.name)}</h3><span class="price">${money(p.price)}</span><span class="old">${money(p.old)}</span><div class="product-meta"><small>${escapeHtml(p.cat)}</small><button class="smallbtn">عرض التفاصيل</button></div></div></article>`;
    };
  }

  // فتح لوحة الإدارة والتحقق من جدول staff_profiles الفعلي
  window.openAdmin = async function () {
    const { data: { session } } = await db.auth.getSession();
    if (!session) {
      document.getElementById('modalContent').innerHTML = `
        <h2>دخول إدارة متجر الشعيبية</h2>
        <div class="field"><label>البريد الإلكتروني</label><input id="adminEmail" type="email" autocomplete="username" placeholder="hh7784438300@gmail.com"></div>
        <div class="field"><label>كلمة المرور</label><input id="adminPassword" type="password" autocomplete="current-password"></div>
        <button class="wide" onclick="window.shuaibiyaLogin()">تسجيل الدخول</button>
      `;
      showModal();
      return;
    }

    // فحص الصلاحية من جدول staff_profiles الموجود في قاعدة بياناتك
    const { data: profile } = await db
      .from('staff_profiles')
      .select('*')
      .eq('user_id', session.user.id)
      .maybeSingle();

    const isOwnerOrActive = profile && (profile.is_owner === true || profile.is_active !== false);
    if (!isOwnerOrActive) {
      alert('هذا الحساب غير مضاف في جدول الإدارة (staff_profiles).');
      await db.auth.signOut();
      return;
    }

    document.querySelector('.hero').style.display = 'none';
    document.getElementById('quick').style.display = 'none';
    document.querySelector('#store>.section-title').style.display = 'none';
    document.getElementById('products').style.display = 'none';
    document.getElementById('admin').classList.add('show');

    const roleLabel = profile.is_owner ? 'المالك (صلاحية كاملة)' : (profile.permissions || []).join(', ');
    document.querySelector('#admin .notice').textContent = 'متصل بقاعدة البيانات بنجاح — الصلاحية: ' + roleLabel;

    // إضافة حقل رابط الصورة في نموذج إضافة المنتج إن لم يكن موجوداً
    if (!document.getElementById('newImageUrl')) {
      const priceField = document.getElementById('newPrice')?.parentElement;
      if (priceField) {
        const imgDiv = document.createElement('div');
        imgDiv.className = 'field';
        imgDiv.innerHTML = `<label>رابط صورة المنتج (اختياري)</label><input id="newImageUrl" type="url" placeholder="https://example.com/image.jpg">`;
        priceField.after(imgDiv);
      }
    }

    await refreshAdmin(profile);
  };

  window.shuaibiyaLogin = async function () {
    const email = document.getElementById('adminEmail').value.trim();
    const password = document.getElementById('adminPassword').value;
    const { error } = await db.auth.signInWithPassword({ email, password });
    if (error) {
      alert('فشل تسجيل الدخول: ' + error.message);
      return;
    }
    hideModal();
    openAdmin();
  };

  // تحديث بيانات لوحة الإدارة (المنتجات + الطلبات)
  async function refreshAdmin(profile) {
    const [{ data: allProducts, count: pc }, { data: orders, error }] = await Promise.all([
      db.from('products').select('*', { count: 'exact' }).order('created_at', { ascending: false }),
      db.from('orders').select('*, order_items(*)').order('created_at', { ascending: false }).limit(100)
    ]);

    document.getElementById('statProducts').textContent = pc ?? 0;
    document.getElementById('statOrders').textContent = orders?.length ?? 0;

    // عرض الطلبات مع زر واتساب وتغيير الحالة
    document.getElementById('ordersList').innerHTML = error
      ? 'تعذر تحميل الطلبات: ' + escapeHtml(error.message)
      : (orders || []).map(o => `
        <div class="cart-row" style="align-items:flex-start; gap:10px; flex-wrap:wrap;">
          <span style="flex:1; min-width:220px;">
            <b>طلب #${o.id} — ${escapeHtml(o.customer_name)}</b> · <a href="tel:${escapeHtml(o.phone)}">${escapeHtml(o.phone)}</a><br>
            <small>العنوان / الموقع: ${escapeHtml(o.address || 'غير محدد')}</small><br>
            <small>الحالة: <b>${escapeHtml(o.status || 'جديد')}</b> · ${new Date(o.created_at).toLocaleString('ar-YE')}</small><br>
            <div style="margin:6px 0; font-size:0.9em; color:#444;">
              ${(o.order_items || []).map(i => `• ${escapeHtml(i.product_name)} × ${i.quantity} (${money(i.price)})`).join('<br>')}
            </div>
            <button class="smallbtn" onclick="window.shuaibiyaWhatsApp('${escapeHtml(o.phone)}','${escapeHtml(o.customer_name)}','${o.id}')">مراسلة واتساب</button>
            <button class="smallbtn" onclick="window.updateOrderStatus(${o.id}, 'تم التسليم')">تم التسليم ✓</button>
          </span>
          <b>${money(o.total)}</b>
        </div>
      `).join('') || 'لا توجد طلبات حتى الآن.';

    // إضافة قسم إدارة المنتجات الحالية تحت الطلبات
    let prodManageBox = document.getElementById('adminProductsManage');
    if (!prodManageBox) {
      prodManageBox = document.createElement('div');
      prodManageBox.id = 'adminProductsManage';
      prodManageBox.style.marginTop = '24px';
      document.getElementById('ordersList').after(prodManageBox);
    }
    prodManageBox.innerHTML = `
      <h3>إدارة المنتجات الحالية (${allProducts?.length || 0})</h3>
      ${(allProducts || []).map(p => `
        <div class="cart-row" style="align-items:center;">
          <span>
            <b>${escapeHtml(p.name)}</b> (${escapeHtml(p.description || 'عام')})<br>
            <small>السعر: ${money(p.price)} | الحالة: ${p.is_active ? 'ظاهر' : 'مخفي'}</small>
          </span>
          <div>
            <button class="smallbtn" onclick="window.toggleProductActive(${p.id}, ${!p.is_active})">${p.is_active ? 'إخفاء' : 'إظهار'}</button>
            <button class="smallbtn" style="color:#b00;" onclick="window.deleteProduct(${p.id})">حذف</button>
          </div>
        </div>
      `).join('') || '<p class="muted">لا توجد منتجات مضافة بعد.</p>'}
    `;

    // زر تسجيل الخروج
    if (!document.getElementById('adminLogoutBtn')) {
      const logout = document.createElement('button');
      logout.id = 'adminLogoutBtn';
      logout.className = 'iconbtn';
      logout.textContent = 'تسجيل الخروج';
      logout.onclick = async () => { await db.auth.signOut(); location.reload(); };
      document.querySelector('#admin .section-title').append(logout);
    }
  }

  window.updateOrderStatus = async (orderId, status) => {
    const { error } = await db.from('orders').update({ status }).eq('id', orderId);
    if (error) { alert('تعذر تحديث الحالة: ' + error.message); return; }
    openAdmin();
  };

  window.toggleProductActive = async (prodId, newState) => {
    const { error } = await db.from('products').update({ is_active: newState }).eq('id', prodId);
    if (error) { alert('تعذر التحديث: ' + error.message); return; }
    await loadProducts();
    openAdmin();
  };

  window.deleteProduct = async (prodId) => {
    if (!confirm('هل تريد حذف هذا المنتج نهائياً؟')) return;
    const { error } = await db.from('products').delete().eq('id', prodId);
    if (error) { alert('تعذر الحذف: ' + error.message); return; }
    await loadProducts();
    openAdmin();
  };

  window.shuaibiyaWhatsApp = (phone, name, id) => {
    const msg = encodeURIComponent(`مرحباً ${name}، نتواصل معك من متجر الشعيبية بخصوص طلبك رقم #${id}.`);
    let number = String(phone || '').replace(/\D/g, '');
    if (number.startsWith('7') && number.length === 9) number = '967' + number;
    window.open(`https://wa.me/${number}?text=${msg}`, '_blank', 'noopener');
  };

  // إرسال الطلب وحفظه في جدول orders و order_items الفعليين
  window.submitOrder = async function () {
    const name = document.getElementById('custName').value.trim();
    const phone = document.getElementById('custPhone').value.trim();
    const addressInput = document.getElementById('custAddress').value.trim();

    if (!name || !phone) { alert('يرجى إدخال الاسم ورقم الجوال.'); return; }
    if (!window.customerMapUrl && !addressInput) { alert('يرجى تحديد موقعك أو كتابة عنوان التوصيل.'); return; }
    if (!cart || !cart.length) return;

    const fullAddress = [addressInput, window.customerMapUrl].filter(Boolean).join(' — ');
    const total = cart.reduce((s, x) => s + x.price * x.qty, 0);

    // 1. إدراج الطلب في جدول orders واستلام الرقم التسلسلي (id)
    const { data: orderData, error } = await db
      .from('orders')
      .insert({
        customer_name: name,
        phone: phone,
        address: fullAddress,
        total: total,
        status: 'جديد'
      })
      .select()
      .single();

    if (error) {
      alert('لم يتم حفظ الطلب: ' + error.message);
      return;
    }

    // 2. إدراج عناصر الطلب في جدول order_items
    const rows = cart.map(x => ({
      order_id: orderData.id,
      product_id: typeof x.id === 'number' ? x.id : null,
      product_name: `${x.name} (${x.color || 'متوفر'} / ${x.size || 'موحد'})`,
      price: x.price,
      quantity: x.qty
    }));

    const { error: itemError } = await db.from('order_items').insert(rows);
    if (itemError) {
      alert('تم تسجيل الطلب رقم #' + orderData.id + ' لكن تعذر حفظ بعض التفاصيل: ' + itemError.message);
    }

    const whatsapp = String(cfg.STORE_WHATSAPP || '').replace(/\D/g, '');
    const summary = cart.map(x => `• ${x.name} × ${x.qty} (${x.color}/${x.size})`).join('\n');
    const message = encodeURIComponent(
      `طلب جديد من متجر الشعيبية\nرقم الطلب: #${orderData.id}\nالاسم: ${name}\nالهاتف: ${phone}\nالعنوان: ${fullAddress}\n\nالمنتجات:\n${summary}\n\nالإجمالي: ${money(total)}\nالدفع: عند الاستلام`
    );

    cart = [];
    window.customerMapUrl = '';
    if (typeof render === 'function') render();

    document.getElementById('modalContent').innerHTML = `
      <h2>تم استلام طلبك بنجاح ✅</h2>
      <p class="muted">رقم الطلب: <b>#${orderData.id}</b>. تم حفظ طلبك في قاعدة البيانات وسيتم التواصل معك فوراً.</p>
    `;
    if (whatsapp) window.open(`https://wa.me/${whatsapp}?text=${message}`, '_blank', 'noopener');
  };

  // إضافة منتج جديد من لوحة الإدارة إلى جدول products الفعلي
  window.addProduct = async function () {
    const name = document.getElementById('newName').value.trim();
    const catName = document.getElementById('newCat').value;
    const price = Number(document.getElementById('newPrice').value);
    const imageUrl = document.getElementById('newImageUrl')?.value.trim() || null;

    if (!name || !price) { alert('يرجى إدخال اسم المنتج والسعر.'); return; }

    // التأكد من وجود القسم في جدول categories أو ربطه بالوصف
    let catId = categoriesNameMap[catName] || null;
    if (!catId && catName) {
      const { data: newCat } = await db.from('categories').insert({ name: catName }).select().single();
      if (newCat) {
        catId = newCat.id;
        categoriesMap[catId] = catName;
        categoriesNameMap[catName] = catId;
      }
    }

    const { error } = await db.from('products').insert({
      name: name,
      description: catName,
      category_id: catId,
      price: price,
      image_url: imageUrl,
      stock: 50,
      is_active: true
    });

    if (error) {
      alert('تعذرت إضافة المنتج: ' + error.message);
      return;
    }

    document.getElementById('newName').value = '';
    document.getElementById('newPrice').value = '';
    if (document.getElementById('newImageUrl')) document.getElementById('newImageUrl').value = '';

    await loadProducts();
    openAdmin();
    alert('تم حفظ المنتج ونشره في المتجر بنجاح ✅');
  };
})();
