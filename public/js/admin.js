const user = requireRoleOrRedirect('admin');
document.getElementById('who').textContent = user.name;
document.getElementById('logout').onclick = async () => {
  await api('/auth/logout', { method: 'POST' }).catch(() => {});
  Auth.clear();
  window.location.href = '/index.html';
};

async function createDoctor() {
  const msg = document.getElementById('create-msg');
  msg.innerHTML = '';
  const body = {
    name: document.getElementById('d-name').value.trim(),
    email: document.getElementById('d-email').value.trim(),
    password: document.getElementById('d-password').value,
    specialisation: document.getElementById('d-spec').value.trim(),
    workingHours: { start: document.getElementById('d-start').value, end: document.getElementById('d-end').value },
    slotDurationMinutes: Number(document.getElementById('d-duration').value)
  };
  if (!body.name || !body.email || !body.password || !body.specialisation) {
    msg.appendChild(el('p', { class: 'error' }, 'Please fill in all fields.'));
    return;
  }
  try {
    await api('/admin/doctors', { method: 'POST', body });
    msg.appendChild(el('p', { class: 'success' }, 'Doctor added.'));
    ['d-name', 'd-email', 'd-password', 'd-spec'].forEach((id) => (document.getElementById(id).value = ''));
    await renderDoctors();
  } catch (err) {
    msg.appendChild(el('p', { class: 'error' }, err.message));
  }
}

async function renderDoctors() {
  const wrap = document.getElementById('doctor-list');
  wrap.innerHTML = '<p class="muted">Loading…</p>';
  const { doctors } = await api('/admin/doctors');
  wrap.innerHTML = '';
  if (doctors.length === 0) {
    wrap.appendChild(el('div', { class: 'empty-state' }, 'No doctors yet — add one above.'));
    return;
  }
  doctors.forEach((doc) => {
    const leaveInputId = `leave-${doc.id}`;
    const msgId = `leave-msg-${doc.id}`;
    wrap.appendChild(el('div', { class: 'card' }, [
      el('h3', {}, doc.name),
      el('p', { class: 'muted' }, `${doc.specialisation} · ${doc.workingHours.start}–${doc.workingHours.end} · ${doc.slotDurationMinutes} min slots`),
      el('p', { class: 'muted' }, `Leave days: ${doc.leaveDays.length ? doc.leaveDays.join(', ') : 'None scheduled'}`),
      el('label', { for: leaveInputId }, 'Mark a leave day'),
      el('div', { style: 'display:flex; gap:8px; align-items:center;' }, [
        el('input', { id: leaveInputId, type: 'date' }),
        el('button', { class: 'ghost', onclick: () => markLeave(doc.id, leaveInputId, msgId) }, 'Mark leave')
      ]),
      el('div', { id: msgId })
    ]));
  });
}

async function markLeave(doctorId, inputId, msgId) {
  const date = document.getElementById(inputId).value;
  const msg = document.getElementById(msgId);
  msg.innerHTML = '';
  if (!date) {
    msg.appendChild(el('p', { class: 'error' }, 'Pick a date first.'));
    return;
  }
  try {
    const { cancelledAppointments } = await api(`/admin/doctors/${doctorId}/leave`, { method: 'POST', body: { date } });
    msg.appendChild(el('p', { class: 'success' },
      cancelledAppointments > 0
        ? `Leave recorded. ${cancelledAppointments} affected patient(s) were notified and their appointments cancelled.`
        : 'Leave recorded. No existing bookings were affected.'));
    await renderDoctors();
  } catch (err) {
    msg.appendChild(el('p', { class: 'error' }, err.message));
  }
}

renderDoctors();
