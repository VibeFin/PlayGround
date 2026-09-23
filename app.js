const PRODUCTS = [
  {name:"Plombir Waffle Bar", cat:"waffle", price:8.5, emoji:"🧇", bg:"waffle", badge:"Bestseller", desc:"Milk chocolate + vanilla plombir cream + 9-layer waffle crunch."},
  {name:"72% Ecuador Dark", cat:"dark", price:7.0, emoji:"🍫", bg:"dark", badge:"Single origin", desc:"Black cherry, molasses, long finish. Stone-conched 48h."},
  {name:"54% Honey & Sea Salt", cat:"dark", price:7.5, emoji:"🌊", bg:"dark", badge:"New", desc:"Dark milk balance with buckwheat honey and flaky salt."},
  {name:"34% Creamy Milk", cat:"milk", price:6.5, emoji:"🥛", bg:"milk", badge:"Silky", desc:"Condensed-milk creaminess, caramel, low bitterness."},
  {name:"White Plombir Crunch", cat:"waffle", price:8.0, emoji:"🤍", bg:"white", badge:"Limited", desc:"White chocolate shell, plombir dust, toasted waffle bits."},
  {name:"Plombir Waffle Box (12 pcs)", cat:"waffle", price:19.0, emoji:"📦", bg:"waffle", badge:"Tribute pack", desc:"Inspired by Saratovskaya Вафли Пломбир — atelier edition."},
  {name:"Tasting Flight — 6 bars", cat:"gift", price:29.0, emoji:"🎁", bg:"gift", badge:"Gift", desc:"34% to 90%, with tasting cards and pairing guide."},
  {name:"90% Midnight Reserve", cat:"dark", price:9.5, emoji:"🌙", bg:"dark", badge:"Rare", desc:"For purists. Espresso, tobacco, orange peel."},
  {name:"Hazelnut Praline Milk", cat:"milk", price:7.8, emoji:"🌰", bg:"milk", badge:"Classic", desc:"Piedmont hazelnuts, stone-ground praline heart."},
];

const grid = document.getElementById('productGrid');
const filters = document.getElementById('filters');
let activeFilter = 'all';

function renderProducts(){
  grid.innerHTML = PRODUCTS.filter(p=>activeFilter==='all'||p.cat===activeFilter).map(p=>`
    <article class="card">
      <div class="card-art ${p.bg}"><span class="badge">${p.badge}</span><span class="emoji">${p.emoji}</span></div>
      <div class="card-body"><h3>${p.name}</h3><p>${p.desc}</p>
      <div class="card-row"><span class="price">$${p.price.toFixed(2)}</span>
      <button class="btn solid small" data-add="${p.name}" data-price="${p.price}">Add +</button></div></div>
    </article>`).join('');
}
renderProducts();
filters.addEventListener('click', e=>{
  const b = e.target.closest('.chip'); if(!b) return;
  document.querySelectorAll('.chip').forEach(c=>c.classList.remove('active'));
  b.classList.add('active'); activeFilter=b.dataset.filter; renderProducts();
});

// CART
let cart = [];
const cartEl=document.getElementById('cart'), overlay=document.getElementById('overlay');
const cartItems=document.getElementById('cartItems'), cartCount=document.getElementById('cartCount'), cartTotal=document.getElementById('cartTotal');
function openCart(){cartEl.classList.add('open');overlay.classList.add('show')}
function closeCart(){cartEl.classList.remove('open');overlay.classList.remove('show')}
document.getElementById('cartOpen').onclick=openCart;
document.getElementById('cartClose').onclick=closeCart;
overlay.onclick=closeCart;
function toast(msg){const t=document.getElementById('toast');t.textContent=msg;t.classList.add('show');setTimeout(()=>t.classList.remove('show'),2200)}
function addToCart(name,price){
  const f=cart.find(i=>i.name===name); if(f) f.qty++; else cart.push({name,price:parseFloat(price),qty:1});
  renderCart(); toast(`${name} added ✓`);
}
function renderCart(){
  cartCount.textContent=cart.reduce((s,i)=>s+i.qty,0);
  const total=cart.reduce((s,i)=>s+i.qty*i.price,0);
  cartTotal.textContent='$'+total.toFixed(2);
  cartItems.innerHTML = cart.length? cart.map((i,idx)=>`
    <div class="cart-item"><div><b>${i.name}</b><br><small>$${i.price.toFixed(2)} × ${i.qty}</small></div>
    <div><button data-dec="${idx}">−</button> <button data-inc="${idx}">+</button> <button data-del="${idx}">✕</button></div></div>`).join('')
    : `<p class="muted">Your cart is empty. Add something melty.</p>`;
}
document.addEventListener('click',e=>{
  const a=e.target.closest('[data-add]'); if(a){addToCart(a.dataset.add,a.dataset.price);return}
  if(e.target.dataset.inc!==undefined){cart[+e.target.dataset.inc].qty++;renderCart()}
  if(e.target.dataset.dec!==undefined){const it=cart[+e.target.dataset.dec];it.qty--;if(it.qty<=0)cart.splice(+e.target.dataset.dec,1);renderCart()}
  if(e.target.dataset.del!==undefined){cart.splice(+e.target.dataset.del,1);renderCart()}
});
renderCart();
document.getElementById('checkoutBtn').onclick=()=>{
  const m=document.getElementById('checkoutMsg');
  if(!cart.length){m.textContent='Cart is empty — pick a bar first.';return}
  m.textContent='✓ Order placed! (demo) Total '+cartTotal.textContent; cart=[];renderCart();
};

// MENU + CURSOR + SEARCH
document.getElementById('menuBtn').onclick=()=>document.getElementById('mobileMenu').classList.toggle('open');
document.querySelectorAll('#mobileMenu a').forEach(a=>a.onclick=()=>document.getElementById('mobileMenu').classList.remove('open'));
const cur=document.getElementById('cursor');
addEventListener('mousemove',e=>{cur.style.transform=`translate(${e.clientX-9}px,${e.clientY-9}px) scale(${e.target.closest('a,button')?2:1})`});
document.getElementById('searchBtn').onclick=()=>{document.getElementById('shop').scrollIntoView({behavior:'smooth'});toast('Try filter: Dark / Waffle / Gift')};

// CACAO SLIDER
const range=document.getElementById('cacaoRange'), val=document.getElementById('cacaoVal'), note=document.getElementById('cacaoNote');
function cacaoNote(v){if(v<45)return 'Milky & caramel — soft, sweet';if(v<65)return 'Balanced — honey, nuts, cocoa';if(v<80)return 'Bold & jammy — black cherry, molasses';return 'Intense — espresso, orange peel'}
range.oninput=()=>{val.textContent=range.value+'%';note.textContent=cacaoNote(+range.value)};

// QUIZ
let scores={dark:0,milk:0,waffle:0,gift:0}, step=1;
const quizBar=document.getElementById('quizBar');
const finalMap={dark:["72% Ecuador Dark","Black cherry & molasses — for the purist. intense snap."],milk:["34% Creamy Milk","Silky condensed-milk sweetness — cozy and mellow."],waffle:["Plombir Waffle Bar","Vanilla plombir + 9-layer crunch — nostalgia upgraded."],gift:["Tasting Flight — 6 bars","All intensities + pairing guide — perfect to share (or not)."]};
let winner='waffle';
document.querySelectorAll('#quiz .q .opts button').forEach(b=>b.onclick=()=>{
  scores[b.dataset.v]=(scores[b.dataset.v]||0)+1;
  document.querySelector(`.q[data-q="${step}"]`).classList.add('hidden');
  step++;
  const next=document.querySelector(`.q[data-q="${step}"]`);
  if(next){next.classList.remove('hidden');quizBar.style.width=(step*25)+'%'}
  if(step===4){
    winner=Object.entries(scores).sort((a,b)=>b[1]-a[1])[0][0];
    document.getElementById('quizResult').textContent='Your bar: '+finalMap[winner][0];
    document.getElementById('quizDesc').textContent=finalMap[winner][1];
  }
});
document.getElementById('quizRestart').onclick=()=>{scores={dark:0,milk:0,waffle:0,gift:0};step=1;quizBar.style.width='25%';document.querySelectorAll('#quiz .q').forEach(q=>q.classList.add('hidden'));document.querySelector('.q[data-q="1"]').classList.remove('hidden')};
document.getElementById('quizAdd').onclick=()=>{
  const p=PRODUCTS.find(x=>x.name===finalMap[winner][0])||PRODUCTS[0];
  addToCart(p.name,p.price); openCart();
};

// NEWSLETTER
document.getElementById('newsForm').onsubmit=e=>{e.preventDefault();const v=document.getElementById('newsEmail').value;document.getElementById('newsMsg').textContent=`Sweet! Code CHOK10 sent to ${v} ✓`;e.target.reset()};
