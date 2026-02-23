// app.js — Costeo BOM con IndexedDB (offline, PWA-friendly)
(() => {
  // --------------------------
  // IndexedDB helper (sin libs)
  // --------------------------
  const DB_NAME = "costeo_bom_db";
  const DB_VER  = 1;
  const STORE   = "app_state";
  const STATE_KEY = "STATE";

  function openDB() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VER);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE)) {
          db.createObjectStore(STORE);
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  async function idbGet(key) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, "readonly");
      const st = tx.objectStore(STORE);
      const req = st.get(key);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
      tx.oncomplete = () => db.close();
    });
  }

  async function idbSet(key, value) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      const st = tx.objectStore(STORE);
      const req = st.put(value, key);
      req.onsuccess = () => resolve(true);
      req.onerror = () => reject(req.error);
      tx.oncomplete = () => db.close();
    });
  }

  async function idbClearAll() {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      const st = tx.objectStore(STORE);
      const req = st.clear();
      req.onsuccess = () => resolve(true);
      req.onerror = () => reject(req.error);
      tx.oncomplete = () => db.close();
    });
  }

  // --------------------------
  // UI helpers
  // --------------------------
  const $ = (id) => document.getElementById(id);

  function money(n){
    const v = Number(n || 0);
    return v.toLocaleString("es-MX", { style:"currency", currency:"MXN" });
  }
  function formatQty(n){
    const v = Number(n||0);
    return v.toLocaleString("es-MX", { maximumFractionDigits: 4 });
  }
  function normCode(s){ return String(s||"").trim(); }

  function escapeHtml(s){
    return String(s ?? "")
      .replaceAll("&","&amp;")
      .replaceAll("<","&lt;")
      .replaceAll(">","&gt;")
      .replaceAll('"',"&quot;")
      .replaceAll("'","&#039;");
  }
  function escapeAttr(s){ return escapeHtml(s).replaceAll('"',"&quot;"); }

  function toast(msg, type="ok"){
    const el = document.createElement("div");
    el.textContent = msg;
    el.style.position="fixed";
    el.style.left="50%";
    el.style.bottom="22px";
    el.style.transform="translateX(-50%)";
    el.style.padding="10px 12px";
    el.style.borderRadius="12px";
    el.style.border="1px solid rgba(255,255,255,.14)";
    el.style.background="rgba(10,18,34,.92)";
    el.style.color="white";
    el.style.zIndex=9999;
    el.style.boxShadow="0 10px 25px rgba(0,0,0,.35)";
    el.style.fontSize="13px";
    el.style.maxWidth="92vw";

    const colors = { ok:"rgba(52,211,153,.35)", warn:"rgba(251,191,36,.35)", danger:"rgba(251,113,133,.35)" };
    el.style.outline = `3px solid ${colors[type] || colors.ok}`;

    document.body.appendChild(el);
    setTimeout(()=>{ el.style.opacity="0"; el.style.transition="opacity .25s"; }, 1400);
    setTimeout(()=>{ el.remove(); }, 1750);
  }

  // --------------------------
  // Estado
  // --------------------------
  const state = {
    mp: [],
    products: [],
    selectedProductCode: ""
  };

  function findMP(code){ return state.mp.find(x => x.code === code); }
  function findProduct(code){ return state.products.find(p => p.code === code); }
  function getSelectedProduct(){
    if(!state.selectedProductCode) return null;
    return findProduct(state.selectedProductCode) || null;
  }
  function ensureSelectedProduct(){
    const p = getSelectedProduct();
    if(!p){ toast("Crea o selecciona un producto final primero.", "warn"); return null; }
    return p;
  }

  async function loadState(){
    const saved = await idbGet(STATE_KEY);
    if(saved && typeof saved === "object"){
      state.mp = Array.isArray(saved.mp) ? saved.mp : [];
      state.products = Array.isArray(saved.products) ? saved.products : [];
      state.selectedProductCode = saved.selectedProductCode || "";
    }
  }

  async function saveState(){
    await idbSet(STATE_KEY, {
      mp: state.mp,
      products: state.products,
      selectedProductCode: state.selectedProductCode
    });
  }

  // --------------------------
  // Render
  // --------------------------
  function renderAll(){
    renderMPTable();
    renderRecipeControls();
    renderProductsSelect();
    renderRecipeTableAndTotals();
  }

  function renderMPTable(){
    const tb = $("mpTable").querySelector("tbody");
    tb.innerHTML = "";

    state.mp.slice().sort((a,b)=>a.code.localeCompare(b.code)).forEach(item=>{
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td><b>${escapeHtml(item.code)}</b></td>
        <td>${escapeHtml(item.desc)}</td>
        <td class="right">${money(item.cost)}</td>
        <td class="right"><button class="btn danger" data-delmp="${escapeAttr(item.code)}">Eliminar</button></td>
      `;
      tb.appendChild(tr);
    });

    tb.querySelectorAll("[data-delmp]").forEach(btn=>{
      btn.addEventListener("click", async ()=>{
        const code = btn.getAttribute("data-delmp");
        await deleteMP(code);
      });
    });
  }

  function renderProductsSelect(){
    const sel = $("pfSelect");
    sel.innerHTML = "";

    const opt0 = document.createElement("option");
    opt0.value = "";
    opt0.textContent = state.products.length ? "— Selecciona producto —" : "— No hay productos —";
    sel.appendChild(opt0);

    state.products.slice().sort((a,b)=>a.code.localeCompare(b.code)).forEach(p=>{
      const o = document.createElement("option");
      o.value = p.code;
      o.textContent = `${p.code} · ${p.desc || "(sin descripción)"}`;
      if(p.code === state.selectedProductCode) o.selected = true;
      sel.appendChild(o);
    });

    sel.onchange = async ()=>{
      state.selectedProductCode = sel.value;
      await saveState();
      const p = getSelectedProduct();
      if(p){
        $("pfCode").value = p.code;
        $("pfDesc").value = p.desc;
        $("pfDailyQty").value = p.dailyQty ?? "";
      }
      renderRecipeControls();
      renderRecipeTableAndTotals();
    };
  }

  function renderRecipeControls(){
    const mpSel = $("recipeMP");
    mpSel.innerHTML = "";
    const list = state.mp.slice().sort((a,b)=>a.code.localeCompare(b.code));
    if(!list.length){
      const o = document.createElement("option");
      o.value = "";
      o.textContent = "Primero agrega materias primas";
      mpSel.appendChild(o);
      mpSel.disabled = true;
    }else{
      mpSel.disabled = false;
      list.forEach(mp=>{
        const o = document.createElement("option");
        o.value = mp.code;
        o.textContent = `${mp.code} · ${mp.desc} (${money(mp.cost)})`;
        mpSel.appendChild(o);
      });
    }
  }

  function renderRecipeTableAndTotals(){
    const p = getSelectedProduct();
    const tb = $("recipeTable").querySelector("tbody");
    tb.innerHTML = "";

    let unitCost = 0;
    let dailyQty = 0;

    if(p){
      dailyQty = Number(p.dailyQty || 0);
      (p.recipe || []).forEach((line, idx)=>{
        const mp = findMP(line.mpCode);
        const qty = Number(line.qty || 0);
        const mpCost = mp ? Number(mp.cost||0) : 0;
        const lineCost = qty * mpCost;
        unitCost += lineCost;

        const tr = document.createElement("tr");
        tr.innerHTML = `
          <td>
            <b>${escapeHtml(line.mpCode)}</b>
            <div class="mini muted">${escapeHtml(mp ? mp.desc : "⚠️ Materia prima no existe (eliminada)")}</div>
          </td>
          <td class="right">${formatQty(qty)}</td>
          <td class="right">${money(lineCost)}</td>
          <td>${escapeHtml(line.note || "")}</td>
          <td class="right"><button class="btn danger" data-delrecipe="${idx}">Quitar</button></td>
        `;
        tb.appendChild(tr);
      });

      tb.querySelectorAll("[data-delrecipe]").forEach(btn=>{
        btn.addEventListener("click", async ()=>{
          const idx = Number(btn.getAttribute("data-delrecipe"));
          await removeRecipeLine(idx);
        });
      });
    }else{
      const tr = document.createElement("tr");
      tr.innerHTML = `<td colspan="5" class="muted">Crea o selecciona un producto para ver su receta.</td>`;
      tb.appendChild(tr);
    }

    $("kpiUnitCost").textContent = `${money(unitCost)} MXN`;
    $("kpiDayCost").textContent  = `${money(unitCost * dailyQty)} MXN`;
  }

  // --------------------------
  // Acciones
  // --------------------------
  $("btnAddMP").addEventListener("click", async ()=>{
    const code = normCode($("mpCode").value);
    const desc = String($("mpDesc").value||"").trim();
    const cost = Number($("mpCost").value);

    if(!code){ toast("Falta el código de la materia prima.", "warn"); return; }
    if(!desc){ toast("Falta la descripción de la materia prima.", "warn"); return; }
    if(!(cost >= 0)){ toast("Costo inválido.", "warn"); return; }

    const exists = findMP(code);
    if(exists){
      exists.desc = desc;
      exists.cost = cost;
      toast("Materia prima actualizada.", "ok");
    }else{
      state.mp.push({ code, desc, cost });
      toast("Materia prima agregada.", "ok");
    }

    $("mpCode").value="";
    $("mpDesc").value="";
    $("mpCost").value="";

    await saveState();
    renderAll();
  });

  async function deleteMP(code){
    const usedBy = state.products.filter(p => (p.recipe||[]).some(r=>r.mpCode===code));
    state.mp = state.mp.filter(x=>x.code !== code);
    usedBy.forEach(p=>{ p.recipe = (p.recipe||[]).filter(r=>r.mpCode !== code); });

    await saveState();
    toast(usedBy.length ? "MP eliminada y removida de recetas." : "MP eliminada.", usedBy.length ? "warn" : "ok");
    renderAll();
  }

  $("btnClearAll").addEventListener("click", async ()=>{
    const ok = confirm("Esto borrará TODO lo guardado en este dispositivo. ¿Seguro?");
    if(!ok) return;

    state.mp = [];
    state.products = [];
    state.selectedProductCode = "";

    await idbClearAll();
    renderAll();
    toast("Todo borrado.", "danger");
  });

  $("btnCreatePF").addEventListener("click", async ()=>{
    const code = normCode($("pfCode").value);
    const desc = String($("pfDesc").value||"").trim();
    const dailyQty = Number($("pfDailyQty").value || 0);

    if(!code){ toast("Falta el código del producto final.", "warn"); return; }
    if(!desc){ toast("Falta la descripción del producto final.", "warn"); return; }
    if(!(dailyQty >= 0)){ toast("Cantidad del día inválida.", "warn"); return; }

    let p = findProduct(code);
    if(!p){
      p = { code, desc, dailyQty, recipe: [] };
      state.products.push(p);
      toast("Producto creado.", "ok");
    }else{
      p.desc = desc;
      p.dailyQty = dailyQty;
      toast("Producto actualizado.", "ok");
    }

    state.selectedProductCode = code;
    await saveState();
    renderAll();
  });

  $("btnAddToRecipe").addEventListener("click", async ()=>{
    const p = ensureSelectedProduct();
    if(!p) return;

    const mpCode = $("recipeMP").value;
    const qty = Number($("recipeQty").value);
    const note = String($("recipeNote").value||"").trim();

    if(!mpCode){ toast("Selecciona una materia prima.", "warn"); return; }
    if(!(qty > 0)){ toast("Cantidad inválida (debe ser > 0).", "warn"); return; }

    const line = (p.recipe||[]).find(r=>r.mpCode === mpCode);
    if(line){
      line.qty = Number(line.qty||0) + qty;
      if(note) line.note = note;
      toast("Cantidad acumulada en la receta.", "ok");
    }else{
      p.recipe = p.recipe || [];
      p.recipe.push({ mpCode, qty, note });
      toast("Insumo agregado a la receta.", "ok");
    }

    $("recipeQty").value = "";
    $("recipeNote").value = "";

    await saveState();
    renderRecipeTableAndTotals();
  });

  async function removeRecipeLine(idx){
    const p = ensureSelectedProduct();
    if(!p) return;
    p.recipe = p.recipe || [];
    if(idx < 0 || idx >= p.recipe.length) return;
    p.recipe.splice(idx, 1);
    await saveState();
    renderRecipeTableAndTotals();
    toast("Insumo removido.", "warn");
  }

  // Export/Import
  $("btnExportJSON").addEventListener("click", ()=>{
    $("jsonBox").value = JSON.stringify({
      mp: state.mp,
      products: state.products,
      selectedProductCode: state.selectedProductCode
    }, null, 2);
    $("jsonBox").focus();
    toast("JSON generado. Cópialo para respaldar.", "ok");
  });

  $("btnImportJSON").addEventListener("click", async ()=>{
    const raw = $("jsonBox").value.trim();
    if(!raw){ toast("Pega un JSON primero.", "warn"); return; }
    try{
      const parsed = JSON.parse(raw);
      state.mp = Array.isArray(parsed.mp) ? parsed.mp : [];
      state.products = Array.isArray(parsed.products) ? parsed.products : [];
      state.selectedProductCode = parsed.selectedProductCode || "";
      await saveState();
      renderAll();
      toast("JSON importado correctamente.", "ok");
    }catch{
      toast("No se pudo importar: JSON inválido.", "danger");
    }
  });

  // --------------------------
  // Init
  // --------------------------
  (async function init(){
    await loadState();

    const p0 = getSelectedProduct();
    if(p0){
      $("pfCode").value = p0.code;
      $("pfDesc").value = p0.desc;
      $("pfDailyQty").value = p0.dailyQty ?? "";
    }
    renderAll();
  })();

})();
