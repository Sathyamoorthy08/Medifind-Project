import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import './style.css';

const icon = L.divIcon({ className: 'pin', html: '<span>✚</span>', iconSize: [32, 32], iconAnchor: [16, 30] });
const request = async (path, { token, ...options } = {}) => {
  const response = await fetch('/api' + path, { ...options, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...options?.headers } });
  const data = await response.json();
  if (!response.ok) { const error = Error(data.error || 'Request failed'); error.status = response.status; throw error; }
  return data;
};
const money = value => `₹${Number(value || 0).toFixed(2)}`;
const dateLabel = value => value ? new Date(value).toLocaleString() : 'Date unavailable';

function App() {
  const [session, setSession] = useState(() => { try { return JSON.parse(localStorage.getItem('mf-session')); } catch { return null; } });
  const [query, setQuery] = useState('Paracetamol'); const [city, setCity] = useState('Chennai');
  const [results, setResults] = useState([]); const [reservations, setReservations] = useState([]); const [inventory, setInventory] = useState([]);
  const [pharmacies, setPharmacies] = useState([]); const [selectedPharmacyId, setSelectedPharmacyId] = useState(''); const [assistantLoading, setAssistantLoading] = useState(false);
  const [loading, setLoading] = useState(false); const [saving, setSaving] = useState(false); const [error, setError] = useState(''); const [notice, setNotice] = useState('');
  const [assistant, setAssistant] = useState(null); const [reserveItem, setReserveItem] = useState(null); const [reserveQuantity, setReserveQuantity] = useState(1);
  const [modal, setModal] = useState(''); const [tab, setTab] = useState('find');
  const saveSession = value => { setSession(value); localStorage.setItem('mf-session', JSON.stringify(value)); };
  const token = session?.token; const user = session?.user;

  async function searchFor(medicine, cityFilter = city, pharmacyFilter = selectedPharmacyId) {
    setLoading(true); setError(''); setAssistant(null); setAssistantLoading(false);
    try {
      const data = await request(`/medicines/search?q=${encodeURIComponent(medicine)}`);
      const visible = data.results.filter(item => pharmacyFilter
        ? String(item.pharmacy.id || item.pharmacy._id) === String(pharmacyFilter)
        : (!cityFilter || item.pharmacy.city.toLowerCase().includes(cityFilter.toLowerCase())));
      setResults(visible);
      if (!visible.length && medicine.trim()) {
        setAssistantLoading(true);
        try {
          const selectedPharmacy = pharmacies.find(pharmacy => String(pharmacy._id || pharmacy.id) === String(pharmacyFilter));
          const pharmacyParam = pharmacyFilter ? '&pharmacyId=' + encodeURIComponent(pharmacyFilter) + '&pharmacyName=' + encodeURIComponent(selectedPharmacy?.name || '') : '';
          setAssistant(await request('/medicines/availability-assistant?q=' + encodeURIComponent(medicine) + pharmacyParam));
        } catch (assistantError) { setError(`Availability assistant could not load: ${assistantError.message}`); }
        finally { setAssistantLoading(false); }
      }
    } catch (err) { setResults([]); setError(err.message); }
    finally { setLoading(false); }
  }
  async function search(event) { event?.preventDefault(); await searchFor(query, city, selectedPharmacyId); }
  async function loadDash() {
    if (!token) return;
    try {
      if (user.role === 'user') { const data = await request('/reservations/mine', { token }); setReservations(data.reservations); }
      else { const [items, incoming] = await Promise.all([request('/inventory', { token }), request('/reservations/pharmacy', { token })]); setInventory(items.inventory); setReservations(incoming.reservations); }
    } catch (err) { if (err.status === 401) { localStorage.removeItem('mf-session'); setSession(null); setReservations([]); setInventory([]); setError('Your demo session expired when the in-memory backend restarted. Please log in again.'); } else setError(err.message); }
  }
  useEffect(() => { searchFor('Paracetamol', 'Chennai', ''); }, []);
  useEffect(() => { request('/pharmacies').then(data => setPharmacies(data.pharmacies)).catch(err => setError(err.message)); }, []);
  useEffect(() => { loadDash(); }, [token]);
  async function submitAuth(event) {
    event.preventDefault(); const form = new FormData(event.currentTarget); setError('');
    try { const data = await request(modal === 'register' ? '/auth/register' : '/auth/login', { method: 'POST', body: JSON.stringify(Object.fromEntries(form)) }); saveSession(data); setModal(''); setNotice(`Welcome, ${data.user.name.split(' ')[0]}.`); }
    catch (err) { setError(err.message); }
  }
  function reserve(item) {
    if (!user) { setModal('login'); return; }
    if (user.role !== 'user') { setError('Pharmacy accounts manage inventory and reservation requests; sign in as a medicine seeker to reserve.'); return; }
    setError(''); setReserveItem(item); setReserveQuantity(1); setModal('reserve');
  }
  async function confirmReservation(event) {
    event.preventDefault();
    const quantity = Number(reserveQuantity);
    if (!reserveItem || !Number.isInteger(quantity) || quantity < 1 || quantity > reserveItem.quantity) { setError('Choose a whole-number quantity within the currently available stock.'); return; }
    setSaving(true); setError('');
    try {
      const data = await request('/reservations', { token, method: 'POST', body: JSON.stringify({ inventoryId: reserveItem.id, quantity }) });
      setModal(''); setNotice(`Pending reservation ${data.reservation.code} created for ${quantity} × ${data.reservation.medicine} (${money(data.reservation.totalPrice)}).`);
      setReserveItem(null); await searchFor(query, city); await loadDash();
    } catch (err) { setError(err.message); }
    finally { setSaving(false); }
  }
  async function cancelReservation(reservation) {
    const isConfirmed = reservation.status === 'confirmed';
    const policy = isConfirmed ? ' It can be cancelled before collection begins; once collected, cancellation is unavailable.' : '';
    if (!window.confirm(`Cancel reservation ${reservation.code || reservation._id}?${policy} The reserved quantity will be returned once.`)) return;
    setError('');
    try { const data = await request(`/reservations/${reservation._id}/cancel`, { token, method: 'PATCH' }); setNotice(`${data.reservation.code || 'Reservation'} cancelled; reserved stock was released.`); await loadDash(); await searchFor(query, city); }
    catch (err) { setError(err.message); }
  }
  async function setStatus(id, status) {
    setError('');
    try { const data = await request(`/reservations/${id}/status`, { token, method: 'PATCH', body: JSON.stringify({ status }) }); setNotice(`Reservation ${data.reservation.code} ${status}.`); await loadDash(); await searchFor(query, city); }
    catch (err) { setError(err.message); }
  }
  async function addItem(event) {
    event.preventDefault(); const form = Object.fromEntries(new FormData(event.currentTarget));
    try { await request('/inventory', { token, method: 'POST', body: JSON.stringify({ ...form, price: Number(form.price), quantity: Number(form.quantity) }) }); setModal(''); await loadDash(); setNotice('Inventory added. Pharmacy-entered stock is self-reported; call to confirm.'); }
    catch (err) { setError(err.message); }
  }
  async function updateQty(item) {
    const value = prompt(`Set stock quantity for ${item.medicine}`, item.quantity); if (value === null) return;
    try { await request(`/inventory/${item._id}`, { token, method: 'PATCH', body: JSON.stringify({ quantity: Number(value) }) }); await loadDash(); setNotice('Inventory quantity updated.'); }
    catch (err) { setError(err.message); }
  }
  async function deleteItem(item) {
    if (!window.confirm(`Remove ${item.medicine}?`)) return;
    try { await request(`/inventory/${item._id}`, { token, method: 'DELETE' }); await loadDash(); setNotice('Inventory item removed.'); }
    catch (err) { setError(err.message); }
  }
  const markers = [...new Map(results.filter(item => item.pharmacy.location?.lat).map(item => [item.pharmacy.id || item.pharmacy._id, item.pharmacy])).values()];
  const center = markers.length ? [markers[0].location.lat, markers[0].location.lng] : [13.06, 80.22];

  return <>
    <header className="topbar"><a className="brand" href="#"><span className="brandmark">✚</span> medifind<span className="ai">AI</span></a>
      <nav><button className={tab === 'find' ? 'navactive' : ''} onClick={() => setTab('find')}>Find medicine</button>{user && <button className={tab === 'dashboard' ? 'navactive' : ''} onClick={() => { setTab('dashboard'); loadDash(); }}>{user.role === 'user' ? 'My Reservations' : 'My dashboard'}</button>}</nav>
      <div className="account">{user ? <><span className="userchip"><i>{user.name[0]}</i>{user.name.split(' ')[0]}</span><button className="outline small" onClick={() => { localStorage.removeItem('mf-session'); setSession(null); setReservations([]); setTab('find'); }}>Sign out</button></> : <><button className="textbutton" onClick={() => setModal('login')}>Log in</button><button className="primary small" onClick={() => setModal('register')}>Create account <span>↗</span></button></>}</div>
    </header>
    <main>
      <section className="hero"><div className="hero-copy"><div className="eyebrow"><span className="pulse"></span> YOUR NEIGHBORHOOD, HEALTHIER</div><h1>Find your medicine.<br/><em>Find your peace.</em></h1><p className="subhead">A clearer way to see what’s available nearby. Search local pharmacies, compare prices, and reserve what you need.</p><div className="hero-points"><span>✳ Nearby availability</span><span>✳ Transparent prices</span><span>✳ Simple reservations</span></div></div><div className="hero-art"><div className="sun"></div><div className="plant p1">✳</div><div className="plant p2">✣</div><div className="glass-card"><div className="glass-top"><span>AVAILABILITY CHECK</span><span className="live"><b></b> DEMO DATA</span></div><div className="glass-pill">✚</div><div className="glass-lines"><b>Care, within reach.</b><span>Local matching, transparent stock</span></div><div className="orbit orbit1"></div><div className="orbit orbit2"></div><div className="leaf leaf1"></div><div className="leaf leaf2"></div></div><div className="art-stamp">Good health<br/>starts close.</div></div></section>
      <section className="search-wrap"><div className="section-title"><div><span className="eyebrow">SEARCH YOUR AREA</span><h2>What are you looking for?</h2></div><div className="demo-tag">✦ Fictional demo inventory</div></div>
        <form className="searchbar" onSubmit={search}><label className="field medicine-field"><span>⌕</span><div><small>MEDICINE OR CATEGORY</small><input value={query} onChange={event => setQuery(event.target.value)} placeholder="Try paracetamol, allergy relief…"/></div></label><label className="field city-field"><span>⌖</span><div><small>YOUR CITY</small><input value={city} onChange={event => setCity(event.target.value)} placeholder="e.g. Chennai"/></div></label><label className="field pharmacy-field"><span>✚</span><div><small>CHECK A PHARMACY</small><select value={selectedPharmacyId} onChange={event => { const id = event.target.value; setSelectedPharmacyId(id); const selected = pharmacies.find(pharmacy => String(pharmacy._id || pharmacy.id) === id); if (selected) setCity(selected.city); }}><option value="">All pharmacies</option>{pharmacies.map(pharmacy => <option key={pharmacy._id || pharmacy.id} value={pharmacy._id || pharmacy.id}>{pharmacy.name} · {pharmacy.city}</option>)}</select></div></label><button className="primary search-btn" type="submit" disabled={loading}>{loading ? 'Searching…' : 'Search nearby'} <span>→</span></button></form>
        <div className="results-head"><div><h3>{results.length} places to check</h3><span>Results for <b>{query || 'all medicines'}</b> around <b>{city || 'all cities'}</b></span></div><span className="sort">⌁ &nbsp; Matching pharmacies</span></div>
        {error && <div className="alert" role="alert">{error}<button onClick={() => setError('')}>×</button></div>}{notice && <div className="success" role="status">{notice}<button onClick={() => setNotice('')}>×</button></div>}
        {assistantLoading && results.length === 0 && <div className="assistant-loading" role="status">Checking this pharmacy and other fictional listings…</div>}{assistant && results.length === 0 && <AvailabilityAssistant data={assistant} onSearch={(item) => { setQuery(item.medicine); setCity(item.pharmacy.city); setSelectedPharmacyId(''); setTab('find'); searchFor(item.medicine, item.pharmacy.city, ''); }} />}
        <div className="results-layout"><div className="result-list">{results.length === 0 && !loading ? <div className="empty"><div>⌕</div><b>{assistant?.mode === 'other_pharmacies' ? 'Unavailable at the selected pharmacy' : assistant?.status === 'unavailable_everywhere' ? 'No stock at listed pharmacies' : 'Medicine currently unavailable'}</b><span>{assistant?.message || 'Check the AI Availability Assistant for supported local matches.'}</span></div> : results.map((r, i) => <article className="result-card" key={r.id}><div className="result-top"><span className="result-num">{String(i + 1).padStart(2, '0')}</span><span className={`stock ${r.quantity < 5 ? 'low' : ''}`}><b></b>{r.stockStatus}</span></div><h4>{r.medicine}</h4><span className="generic">{r.genericName} · {r.strength || 'standard'} · {r.form} · {r.category}</span><div className="pharmacy-line"><span className="pharm-icon">✚</span><div><b>{r.pharmacy.name}</b><span>{r.pharmacy.address}, {r.pharmacy.city}</span></div></div><div className="card-foot"><div><strong>{money(r.price)}</strong><span> · {r.quantity} in demo stock</span></div><button className="reserve" onClick={() => reserve(r)}>Reserve <span>→</span></button></div><div className="demo-caption">◉ {r.stockLabel}</div></article>)}</div>
          <div className="map-shell"><MapContainer center={center} zoom={12} scrollWheelZoom={false} key={center.join(',')}><TileLayer attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>' url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"/>{markers.map(p => <Marker key={p._id || p.id} position={[p.location.lat, p.location.lng]} icon={icon}><Popup><b>{p.name}</b><br/>{p.address}<br/>Fictional demo location</Popup></Marker>)}</MapContainer><div className="map-note">⌖ &nbsp; {markers.length} pharmacies on map</div><div className="map-credit">Map data © OpenStreetMap</div></div>
        </div>
      </section>
      {tab === 'dashboard' && user && <section className="dashboard"><div className="dash-heading"><div><span className="eyebrow">YOUR SPACE</span><h2>{user.role === 'pharmacy' ? 'Pharmacy dashboard' : 'My Reservations'}</h2></div>{user.role === 'pharmacy' && <button className="primary" onClick={() => { setError(''); setModal('add'); }}>＋ Add medicine</button>}</div>
        {user.role === 'pharmacy' ? <><div className="dash-columns"><div className="dash-panel"><h3>Inventory <span>{inventory.length} items · fictional seed catalog</span></h3>{inventory.length ? inventory.map(x => <div className="inventory-row" key={x._id}><div><b>{x.medicine}</b><span>{x.genericName} · {x.category} · {money(x.price)}</span></div><button onClick={() => updateQty(x)}>Qty {x.quantity} ✎</button><button onClick={() => deleteItem(x)}>×</button></div>) : <div className="empty compact">No inventory yet. Add your first listing above.</div>}</div><div className="dash-panel"><h3>Incoming reservations <span>{reservations.length}</span></h3><ReservationList rows={reservations} pharmacy onStatus={setStatus}/></div></div></> : <div className="dash-panel"><h3>Reservation history <span>{reservations.length}</span></h3><p className="cancel-policy">Pending reservations can be cancelled. Confirmed reservations can be cancelled until collection begins. Rejected, cancelled, or collected reservations cannot be cancelled.</p><ReservationList rows={reservations} onCancel={cancelReservation}/></div>}
      </section>}
    </main>
    <footer><a className="brand" href="#"><span className="brandmark">✚</span> medifind<span className="ai">AI</span></a><span>Classroom project · fictional demo inventory only · not medical advice</span><span>© 2026 MediFind AI</span></footer>
    {modal && <div className="modal-bg" onClick={event => event.target === event.currentTarget && setModal('')}><div className="modal"><button className="close" onClick={() => { setModal(''); setError(''); }}>×</button>
      {(modal === 'login' || modal === 'register') ? <><span className="eyebrow">{modal === 'login' ? 'WELCOME BACK' : 'GET STARTED'}</span><h2>{modal === 'login' ? 'Log in to MediFind' : 'Create your account'}</h2><form onSubmit={submitAuth} className="modal-form">{modal === 'register' && <label>Full name<input name="name" required minLength="2"/></label>}<label>Email address<input type="email" name="email" required autoComplete="email"/></label><label>Password<input type="password" name="password" minLength="8" required autoComplete={modal === 'login' ? 'current-password' : 'new-password'}/></label>{modal === 'register' && <label>Account type<select name="role"><option value="user">Medicine seeker</option><option value="pharmacy">Pharmacy manager</option></select></label>}{error && <div className="alert">{error}</div>}<button className="primary" disabled={saving}>{modal === 'login' ? 'Log in →' : 'Create account →'}</button></form><p className="switch-auth">{modal === 'login' ? <>New here? <button onClick={() => { setError(''); setModal('register'); }}>Create an account</button></> : <>Already registered? <button onClick={() => { setError(''); setModal('login'); }}>Log in</button></>}</p></> : null}
      {modal === 'reserve' && reserveItem && <><span className="eyebrow">PICKUP RESERVATION</span><h2>Review your request</h2><div className="booking-details"><b>{reserveItem.medicine}</b><span>{reserveItem.genericName} · {reserveItem.strength} · {reserveItem.form}</span><span>{reserveItem.pharmacy.name} · {reserveItem.pharmacy.city}</span><span>Unit price <strong>{money(reserveItem.price)}</strong></span><span>Available now <strong>{reserveItem.quantity}</strong></span></div><form className="modal-form" onSubmit={confirmReservation}><label>Quantity<input type="number" min="1" max={reserveItem.quantity} step="1" value={reserveQuantity} onChange={event => setReserveQuantity(event.target.value)} required/></label><div className="booking-total"><span>Total</span><strong>{money(Number(reserveItem.price) * Number(reserveQuantity || 0))}</strong></div><p className="cancel-policy">Confirming creates a PENDING request and reserves this quantity. The pharmacy will confirm or reject it.</p>{error && <div className="alert">{error}</div>}<div className="modal-actions"><button type="button" className="outline" onClick={() => { setModal(''); setReserveItem(null); setError(''); }}>Cancel</button><button type="submit" className="primary" disabled={saving}>{saving ? 'Submitting…' : 'Confirm reservation →'}</button></div></form></>}
      {modal === 'add' && <><span className="eyebrow">YOUR CATALOG</span><h2>Add inventory item</h2><form className="modal-form" onSubmit={addItem}><label>Medicine name<input name="medicine" required/></label><label>Generic name<input name="genericName"/></label><label>Active ingredient<input name="activeIngredient"/></label><label>Category<input name="category" placeholder="e.g. Allergy relief" required/></label><div className="two"><label>Strength<input name="strength" placeholder="500 mg"/></label><label>Form<input name="form" placeholder="Tablet"/></label></div><div className="two"><label>Price (₹)<input type="number" min="0" step="0.01" name="price" required/></label><label>Quantity<input type="number" min="0" step="1" name="quantity" required/></label></div>{error && <div className="alert">{error}</div>}<button className="primary">Save inventory →</button></form></>}
    </div></div>}
  </>;
}
function AvailabilityAssistant({ data, onSearch }) {
  const rows = [...(data.matches || []), ...(data.suggestions || [])];
  const title = data.mode === 'other_pharmacies' ? 'Same medicine at other pharmacies' : data.mode === 'alternatives' ? 'Possible matches from the local dataset' : 'No verified alternative found';
  return <section className="assistant" aria-live="polite"><div className="assistant-heading"><span className="assistant-icon">✦</span><div><span className="eyebrow">AI AVAILABILITY ASSISTANT · LOCAL MATCHING</span><h3>{title}</h3></div></div><p>First checks current inventory for this medicine at other pharmacies. If no same-medicine listing is available, suggestions use only maintained generic-name or active-ingredient matches. No external AI service is used.</p>{rows.length ? <div className="assistant-list">{rows.map(item => <article className="assistant-item" key={`${item.id}-${item.pharmacy.id}`}><div><b>{item.medicine}</b><span>{item.activeIngredient ? `Active ingredient: ${item.activeIngredient}` : `Generic name: ${item.genericName || 'Not listed'}`} · {item.strength || 'Strength not listed'} · {item.form || 'Form not listed'}</span><span>Why shown: {item.matchReason}</span><span>{item.availability} · demo stock {item.quantity} · sample price {money(item.price)}</span><span>{item.pharmacy.name}, {item.pharmacy.address}, {item.pharmacy.city}</span></div><button className="outline" onClick={() => onSearch(item)}>Search this medicine</button></article>)}</div> : <div className="assistant-empty" role="status">{data.message || 'No verified alternative found in the demo dataset. Ask a licensed pharmacist or prescriber.'}</div>}<p className="assistant-disclaimer">{data.disclaimer}</p></section>;
}
function ReservationList({ rows, pharmacy = false, onStatus, onCancel }) {
  if (!rows.length) return <div className="empty compact">{pharmacy ? 'No reservation requests yet.' : 'No reservations yet. Search for an item and submit a reservation request.'}</div>;
  return rows.map(r => <article className="reservation-row" key={r._id}><div className="reservation-info"><b>{r.medicine}</b><span>{pharmacy ? `Customer: ${r.user?.name || 'Customer'}` : `Pharmacy: ${r.pharmacy?.name || 'Pharmacy'} · ${r.pharmacy?.city || ''}`}</span><span>Quantity {r.quantity} · Unit {money(r.unitPrice)} · Total {money(r.totalPrice ?? (r.unitPrice || 0) * r.quantity)}</span><small>ID {r._id} · Code {r.code} · {dateLabel(r.createdAt)}</small></div><div className="res-action"><span className={`status ${r.status}`}>{String(r.status).toUpperCase()}</span>{pharmacy && r.status === 'pending' && <><button onClick={() => onStatus(r._id, 'confirmed')}>Accept</button><button onClick={() => onStatus(r._id, 'rejected')}>Reject</button></>}{!pharmacy && ['pending', 'confirmed'].includes(r.status) && <button onClick={() => onCancel(r)}>Cancel reservation</button>}</div></article>);
}

createRoot(document.getElementById('root')).render(<App/>);


