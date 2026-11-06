/* SHUAIBIYA production bridge — requires Supabase project + SQL schema */
(() => {
  const cfg = window.SHUAIBIYA_CONFIG || {};
  const ready = cfg.SUPABASE_URL && cfg.SUPABASE_ANON_KEY &&
    !cfg.SUPABASE_URL.includes('YOUR_PROJECT') && !cfg.SUPABASE_ANON_KEY.includes('YOUR_');
  const banner = msg => {
    let el = document.getElementById('backendNotice');
    if (!el) { el = document.createElement('div'); el.id='backendNotice'; el.className='notice'; document.querySelector('main')?.prepend(el); }
    el.textContent = msg;
  };
  if (!ready || !window.supabase) {
    banner('المتجر في وضع التجهيز. لإظهار المنتجات الحقيقية واستقبال الطلبات، أكمل إعداد Supabase في js/config.js ثم نفّذ ملف supabase/schema.sql.');
    return;
  }
  const db = window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY);
  window.shuaibiyaDB = db;
  const cats = ['ملابس','مفروشات','تجميل','بهارات','أدوات منزلية'];
  const escapeHtml = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const asProduct = r => ({id:r.id,name:r.name,cat:r.category,price:Number(r.price),old:Number(r.old_price||r.price),tag:r.tag||'',colors:r.colors||['متوفر'],sizes:r.sizes||['مقاس موحد'],image_url:r.image_url||''});
  async function loadProducts(){
    const {data,error}=await db.from('products').select('*').eq('active',true).order('created_at',{ascending:false});
    if(error){banner('تعذر تحميل المنتجات: '+error.message);return;}
    products=data.map(asProduct); render();
  }
  loadProducts();
  // استبدال عرض صور العناصر عند توفر رابط صورة فعلي
  const originalProductCard = productCard;
  productCard = function(p, related=false){
    if (!p.image_url) return originalProductCard(p,related);
    if(related) return `<article class="related-card" onclick="openProduct('${p.id}')"><div class="rel-img"><img src="${escapeHtml(p.image_url)}" alt="${escapeHtml(p.name)}" style="width:100%;height:100%;object-fit:cover"></div><p>${escapeHtml(p.name)}</p><b>${money(p.price)}</b></article>`;
    return `<article class="product-card" onclick="openProduct('${p.id}')"><div class="product-image"><img src="${escapeHtml(p.image_url)}" alt="${escapeHtml(p.name)}"><span class="tag">${escapeHtml(p.tag||'اختيار شعيبيه')}</span></div><div class="product-info"><h3>${escapeHtml(p.name)}</h3><span class="price">${money(p.price)}</span><span class="old">${money(p.old)}</span><div class="product-meta"><small>${escapeHtml(p.cat)}</small><button class="smallbtn">عرض التفاصيل</button></div></div></article>`;
  };
  // إظهار تسجيل الدخول قبل فتح لوحة الإدارة
  openAdmin = async function(){
    const {data:{session}}=await db.auth.getSession();
    if(!session){
      document.getElementById('modalContent').innerHTML=`<h2>دخول الإدارة</h2><div class="field"><label>البريد الإلكتروني</label><input id="adminEmail" type="email" autocomplete="username"></div><div class="field"><label>كلمة المرور</label><input id="adminPassword" type="password" autocomplete="current-password"></div><button class="wide" onclick="window.shuaibiyaLogin()">تسجيل الدخول</button><p class="muted">أنشئ حساب المدير من لوحة Supabase أولاً.</p>`;
      showModal(); return;
    }
    const {data:profile}=await db.from('profiles').select('*').eq('id',session.user.id).single();
    if(!profile || !['admin','staff','orders_monitor'].includes(profile.role)){alert('ليس لديك صلاحية دخول لوحة الإدارة.');await db.auth.signOut();return;}
    document.querySelector('.hero').style.display='none';document.getElementById('quick').style.display='none';document.querySelector('#store>.section-title').style.display='none';document.getElementById('products').style.display='none';
    document.getElementById('admin').classList.add('show');
    document.querySelector('#admin .notice').textContent='متصل بقاعدة البيانات. صلاحيات الحساب: '+profile.role+(profile.assigned_category?' — القسم: '+profile.assigned_category:'');
    await refreshAdmin(profile);
  };
  window.shuaibiyaLogin = async function(){
    const email=document.getElementById('adminEmail').value.trim(),password=document.getElementById('adminPassword').value;
    const {error}=await db.auth.signInWithPassword({email,password}); if(error){alert('فشل تسجيل الدخول: '+error.message);return;} hideModal(); openAdmin();
  };
  async function refreshAdmin(profile){
    const [{count:pc},{data:orders,error}]=await Promise.all([
      db.from('products').select('*',{count:'exact',head:true}),
      db.from('orders').select('*,order_items(*)').order('created_at',{ascending:false}).limit(100)
    ]);
    document.getElementById('statProducts').textContent=pc??0;
    document.getElementById('statOrders').textContent=orders?.length??0;
    const canSeeOrders=['admin','orders_monitor'].includes(profile.role);
    document.getElementById('ordersList').innerHTML=error?'تعذر تحميل الطلبات: '+escapeHtml(error.message):!canSeeOrders?'حسابك لا يملك صلاحية عرض الطلبات.':(orders||[]).map(o=>`<div class="cart-row"><span><b>${escapeHtml(o.customer_name)}</b> · ${escapeHtml(o.customer_phone)}<br>${escapeHtml(o.address||'لا يوجد عنوان نصي')}<br>${o.map_url?`<a href="${escapeHtml(o.map_url)}" target="_blank" rel="noopener">موقع العميل</a>`:''}<br><small>${escapeHtml(o.status)} · ${new Date(o.created_at).toLocaleString('ar')}</small><br>${(o.order_items||[]).map(i=>escapeHtml(i.product_name)+' × '+i.quantity+' ('+escapeHtml(i.selected_color||'')+' / '+escapeHtml(i.selected_size||'')+')').join('، ')}<br><button class="smallbtn" onclick="window.shuaibiyaWhatsApp('${escapeHtml(o.customer_phone)}','${escapeHtml(o.customer_name)}','${o.id}')">فتح واتساب العميل</button></span><b>${money(o.total)}</b></div>`).join('')||'لا توجد طلبات حتى الآن.';
    const canManage=profile.role==='admin'||profile.role==='staff';
    document.querySelector('#admin h3').style.display=canManage?'':'none';
    const form=document.querySelector('#admin .field'); if(form) form.style.display=canManage?'':'none';
    const addBtn=document.querySelector('#admin .wide'); if(addBtn) addBtn.style.display=canManage?'':'none';
    if(profile.role==='admin'){
      const logout=document.createElement('button');logout.className='iconbtn';logout.textContent='تسجيل الخروج';logout.onclick=async()=>{await db.auth.signOut();location.reload();};
      document.querySelector('#admin .section-title').append(logout);
    }
  }
  window.shuaibiyaWhatsApp=(phone,name,id)=>{
    const msg=encodeURIComponent(`مرحباً ${name}، نتواصل معك بخصوص طلبك رقم ${id} من متجر شعيبيه.`);
    const number=String(phone||'').replace(/\D/g,''); window.open(`https://wa.me/${number}?text=${msg}`,'_blank','noopener');
  };
  // تسجيل طلب كامل في قاعدة البيانات قبل إفراغ السلة
  submitOrder = async function(){
    const name=document.getElementById('custName').value.trim(),phone=document.getElementById('custPhone').value.trim(),address=document.getElementById('custAddress').value.trim();
    if(!name||!phone){alert('أدخلي الاسم ورقم الجوال.');return;}
    if(!window.customerMapUrl&&!address){alert('حددي موقعك أو اكتبي عنوان التوصيل.');return;}
    if(!cart.length)return;
    const total=cart.reduce((s,x)=>s+x.price*x.qty,0);
    const orderId=crypto.randomUUID();
    const {error}=await db.from('orders').insert({id:orderId,customer_name:name,customer_phone:phone,address,map_url:window.customerMapUrl||null,total,payment_method:'cash_on_delivery',status:'new'});
    if(error){alert('لم يتم حفظ الطلب. '+error.message);return;}
    const order={id:orderId};
    const rows=cart.map(x=>({order_id:order.id,product_id:Number.isInteger(x.id)?x.id:null,product_name:x.name,unit_price:x.price,quantity:x.qty,selected_color:x.color,selected_size:x.size}));
    const {error:itemError}=await db.from('order_items').insert(rows);
    if(itemError){alert('تم إنشاء الطلب لكن تعذر حفظ تفاصيله. احتفظي برقم الطلب: '+order.id+' — '+itemError.message);return;}
    const whatsapp=String(cfg.STORE_WHATSAPP||'').replace(/\D/g,'');
    const summary=cart.map(x=>`${x.name} × ${x.qty} (${x.color}/${x.size})`).join('\n');
    const message=encodeURIComponent(`طلب جديد من متجر شعيبيه\nرقم الطلب: ${order.id}\nالاسم: ${name}\nالهاتف: ${phone}\nالعنوان: ${address}\n${window.customerMapUrl||''}\nالمنتجات:\n${summary}\nالإجمالي: ${money(total)}\nالدفع: عند الاستلام`);
    cart=[];window.customerMapUrl='';render();
    document.getElementById('modalContent').innerHTML=`<h2>تم استلام طلبك بنجاح</h2><p class="muted">رقم الطلب: ${escapeHtml(order.id)}. تم حفظ الطلب في قاعدة البيانات وسيظهر للإدارة.</p>`;
    if(whatsapp) window.open(`https://wa.me/${whatsapp}?text=${message}`,'_blank','noopener');
  };
  addProduct = async function(){
    const name=document.getElementById('newName').value.trim(),cat=document.getElementById('newCat').value,price=Number(document.getElementById('newPrice').value);
    if(!name||!price){alert('أدخلي اسم المنتج والسعر.');return;}
    const {error}=await db.from('products').insert({name,category:cat,price,old_price:price,colors:['متوفر'],sizes:['مقاس موحد'],active:true});
    if(error){alert('تعذرت إضافة المنتج: '+error.message);return;} await loadProducts(); alert('تم حفظ المنتج في قاعدة البيانات.');
  };
})();
