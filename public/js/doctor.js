const user = requireRoleOrRedirect('doctor');
document.getElementById('who').textContent = user.name;
document.getElementById('logout').onclick = async () => {
  await api('/auth/logout', { method: 'POST' }).catch(() => {});
  Auth.clear();
  window.location.href = '/index.html';
};

async function renderAppointments() {
  const wrap = document.getElementById('appointments');
  wrap.innerHTML = '<p class="muted">Loading…</p>';
  const { appointments } = await api('/doctor/appointments');
  wrap.innerHTML = '';

  if (appointments.length === 0) {
    wrap.appendChild(el('div', { class: 'empty-state' }, 'No appointments booked yet.'));
    return;
  }

  appointments.forEach((a) => {
    const header = el('div', { style: 'display:flex; justify-content:space-between; align-items:center;' }, [
      el('h3', {}, `${a.patient?.name || 'Patient'} · ${a.date} at ${a.time}`),
      el('span', { class: pillClassForStatus(a.status) }, a.status)
    ]);

    const body = [header];

    if (a.symptomForm) {
      body.push(el('p', { class: 'muted' }, `Reported symptoms: ${a.symptomForm.symptoms}`));
    }

    if (a.preVisitSummaryPending) {
      body.push(el('p', { class: 'muted' }, 'AI pre-visit summary generating…'));
    } else if (a.preVisitSummary) {
      body.push(el('div', { class: 'summary-box' }, [
        el('div', {}, [
          el('span', { class: pillClassForUrgency(a.preVisitSummary.urgencyLevel) }, a.preVisitSummary.urgencyLevel),
          document.createTextNode(`  ${a.preVisitSummary.chiefComplaint}`)
        ]),
        el('div', { style: 'margin-top:8px;' }, [
          el('strong', {}, 'Suggested questions:'),
          el('ul', {}, (a.preVisitSummary.suggestedQuestions || []).map((q) => el('li', {}, q)))
        ])
      ]));
    }

    if (a.status === 'completed') {
      body.push(el('div', { class: 'summary-box' }, [
        el('strong', {}, 'Your notes: '), document.createTextNode(a.doctorNotes || ''),
        el('br'), el('strong', {}, 'Prescription: '), document.createTextNode(a.prescription || 'None')
      ]));
    } else if (a.status === 'booked') {
      const notesId = `notes-${a.id}`;
      const rxId = `rx-${a.id}`;
      const msgId = `msg-${a.id}`;
      body.push(el('div', { class: 'card', style: 'background:var(--bg); box-shadow:none;' }, [
        el('label', { for: notesId }, 'Post-visit notes'),
        el('textarea', { id: notesId, placeholder: 'Clinical notes from the visit...' }),
        el('label', { for: rxId }, 'Prescription (include frequency, e.g. "twice daily")'),
        el('input', { id: rxId, placeholder: 'e.g. Paracetamol 500mg, twice daily for 5 days' }),
        el('button', { class: 'primary', onclick: () => completeVisit(a.id, notesId, rxId, msgId) }, 'Submit & generate patient summary'),
        el('div', { id: msgId })
      ]));
    }

    wrap.appendChild(el('div', { class: 'card' }, body));
  });
}

async function completeVisit(apptId, notesId, rxId, msgId) {
  const notes = document.getElementById(notesId).value.trim();
  const prescription = document.getElementById(rxId).value.trim();
  const msg = document.getElementById(msgId);
  msg.innerHTML = '';
  if (!notes) {
    msg.appendChild(el('p', { class: 'error' }, 'Please enter clinical notes.'));
    return;
  }
  try {
    await api(`/doctor/appointments/${apptId}/complete`, { method: 'POST', body: { notes, prescription } });
    await renderAppointments();
  } catch (err) {
    msg.appendChild(el('p', { class: 'error' }, err.message));
  }
}

renderAppointments();
