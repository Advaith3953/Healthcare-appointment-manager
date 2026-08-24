const user = requireRoleOrRedirect('patient');
document.getElementById('who').textContent = user.name;
document.getElementById('logout').onclick = async () => {
  await api('/auth/logout', { method: 'POST' }).catch(() => {});
  Auth.clear();
  window.location.href = '/index.html';
};

const tabs = document.querySelectorAll('.tab');
const panels = { book: document.getElementById('panel-book'), mine: document.getElementById('panel-mine') };
tabs.forEach((t) => t.addEventListener('click', () => {
  tabs.forEach((x) => x.classList.remove('active'));
  t.classList.add('active');
  Object.values(panels).forEach((p) => (p.style.display = 'none'));
  panels[t.dataset.tab].style.display = 'block';
  if (t.dataset.tab === 'mine') renderMyAppointments();
}));

let selectedDoctor = null;
let selectedSlot = null;

async function renderBookPanel() {
  const panel = panels.book;
  panel.innerHTML = '';

  const searchCard = el('div', { class: 'card' }, [
    el('h3', {}, 'Find a doctor'),
    el('label', { for: 'spec' }, 'Specialisation'),
    el('input', { id: 'spec', placeholder: 'e.g. Dermatology, General Medicine' }),
    el('button', { class: 'ghost', style: 'margin-top:12px;', onclick: loadDoctors }, 'Search')
  ]);
  panel.appendChild(searchCard);

  const results = el('div', { class: 'card-grid', id: 'doctor-results' });
  panel.appendChild(results);

  const bookingArea = el('div', { id: 'booking-area' });
  panel.appendChild(bookingArea);

  await loadDoctors();
}

async function loadDoctors() {
  const spec = document.getElementById('spec')?.value || '';
  const { doctors } = await api(`/patient/doctors${spec ? `?specialisation=${encodeURIComponent(spec)}` : ''}`);
  const results = document.getElementById('doctor-results');
  results.innerHTML = '';
  if (doctors.length === 0) {
    results.appendChild(el('div', { class: 'empty-state' }, 'No doctors match that search.'));
    return;
  }
  doctors.forEach((doc) => {
    const card = el('div', { class: 'card' }, [
      el('h3', {}, doc.name),
      el('p', { class: 'muted' }, `${doc.specialisation} · ${doc.workingHours.start}–${doc.workingHours.end} · ${doc.slotDurationMinutes} min slots`),
      el('button', { class: 'primary', onclick: () => selectDoctor(doc) }, 'View available slots')
    ]);
    results.appendChild(card);
  });
}

function selectDoctor(doc) {
  selectedDoctor = doc;
  selectedSlot = null;
  const area = document.getElementById('booking-area');
  area.innerHTML = '';

  const today = new Date().toISOString().slice(0, 10);
  const card = el('div', { class: 'card' }, [
    el('h3', {}, `Book with ${doc.name}`),
    el('label', { for: 'appt-date' }, 'Date'),
    el('input', { id: 'appt-date', type: 'date', value: today, min: today, onchange: loadSlots }),
    el('div', { id: 'slots-wrap' })
  ]);
  area.appendChild(card);
  loadSlots();
}

async function loadSlots() {
  const date = document.getElementById('appt-date').value;
  const wrap = document.getElementById('slots-wrap');
  wrap.innerHTML = '<p class="muted">Loading slots…</p>';
  try {
    const result = await api(`/patient/doctors/${selectedDoctor.id}/slots?date=${date}`);
    wrap.innerHTML = '';
    if (result.onLeave) {
      wrap.appendChild(el('p', { class: 'error' }, 'The doctor is on leave this day. Please pick another date.'));
      return;
    }
    if (result.slots.length === 0) {
      wrap.appendChild(el('p', { class: 'muted' }, 'No open slots on this date — try another day.'));
      return;
    }
    const slotsDiv = el('div', { class: 'slots' });
    result.slots.forEach((time) => {
      const btn = el('button', { class: 'slot-btn', type: 'button' }, time);
      btn.addEventListener('click', () => {
        document.querySelectorAll('.slot-btn').forEach((b) => b.classList.remove('selected'));
        btn.classList.add('selected');
        selectedSlot = time;
        renderSymptomForm(date, time);
      });
      slotsDiv.appendChild(btn);
    });
    wrap.appendChild(slotsDiv);
  } catch (err) {
    wrap.innerHTML = '';
    wrap.appendChild(el('p', { class: 'error' }, err.message));
  }
}

function renderSymptomForm(date, time) {
  const existing = document.getElementById('symptom-card');
  if (existing) existing.remove();

  const card = el('div', { class: 'card', id: 'symptom-card' }, [
    el('h3', {}, `Tell us what's going on`),
    el('p', { class: 'muted' }, `Booking ${date} at ${time} with ${selectedDoctor.name}. Share your symptoms so the doctor can prepare.`),
    el('label', { for: 'symptoms' }, 'Symptoms'),
    el('textarea', { id: 'symptoms', placeholder: 'e.g. Dry cough for 3 days, mild fever in the evenings, sore throat...' }),
    el('button', { class: 'primary', id: 'confirm-btn', onclick: confirmBooking }, 'Confirm booking'),
    el('div', { id: 'booking-msg' })
  ]);
  document.getElementById('booking-area').appendChild(card);
}

async function confirmBooking() {
  const symptoms = document.getElementById('symptoms').value.trim();
  const msg = document.getElementById('booking-msg');
  const btn = document.getElementById('confirm-btn');
  msg.innerHTML = '';
  if (!symptoms) {
    msg.appendChild(el('p', { class: 'error' }, 'Please describe your symptoms before booking.'));
    return;
  }
  btn.disabled = true;
  btn.textContent = 'Booking…';
  try {
    const date = document.getElementById('appt-date').value;
    await api('/patient/appointments', {
      method: 'POST',
      body: { doctorId: selectedDoctor.id, date, time: selectedSlot, symptoms }
    });
    msg.appendChild(el('p', { class: 'success' }, 'Booked! A confirmation email and calendar invite are on their way. See "My appointments" for your AI pre-visit summary once it\'s ready.'));
    btn.textContent = 'Booked';
  } catch (err) {
    msg.appendChild(el('p', { class: 'error' }, err.message));
    btn.disabled = false;
    btn.textContent = 'Confirm booking';
  }
}

async function renderMyAppointments() {
  const panel = panels.mine;
  panel.innerHTML = '<p class="muted">Loading…</p>';
  const { appointments } = await api('/patient/appointments');
  panel.innerHTML = '';
  if (appointments.length === 0) {
    panel.appendChild(el('div', { class: 'empty-state' }, 'No appointments yet — book one from the other tab.'));
    return;
  }
  appointments.forEach((a) => {
    const rows = [
      el('div', { style: 'display:flex; justify-content:space-between; align-items:center;' }, [
        el('h3', {}, `${a.doctor?.name || 'Doctor'} · ${a.date} at ${a.time}`),
        el('span', { class: pillClassForStatus(a.status) }, a.status)
      ]),
      el('p', { class: 'muted' }, a.doctor?.specialisation || '')
    ];

    if (a.status === 'booked') {
      if (a.preVisitSummaryPending) {
        rows.push(el('p', { class: 'muted' }, 'AI pre-visit summary is being generated…'));
      } else if (a.preVisitSummary) {
        rows.push(el('div', { class: 'summary-box' }, [
          el('span', { class: pillClassForUrgency(a.preVisitSummary.urgencyLevel) }, a.preVisitSummary.urgencyLevel),
          document.createTextNode(`  ${a.preVisitSummary.chiefComplaint}`)
        ]));
      }
    }

    if (a.status === 'completed' && a.postVisitSummary) {
      rows.push(el('div', { class: 'summary-box' }, a.postVisitSummary.text));
    }
    if (a.status === 'cancelled') {
      rows.push(el('p', { class: 'error' }, 'This appointment was cancelled (doctor unavailable). Please rebook.'));
    }

    panel.appendChild(el('div', { class: 'card' }, rows));
  });
}

renderBookPanel();
