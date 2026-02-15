document.addEventListener('DOMContentLoaded', () => {
    let travelRecords = JSON.parse(localStorage.getItem('bnoTravelRecords')) || [];
    const travelForm = document.getElementById('travel-form');
    const recordsBody = document.getElementById('records-body');
    const totalTripsEl = document.getElementById('total-trips');
    const maxAbsenceEl = document.getElementById('max-absence-year');
    const absenceProgress = document.getElementById('absence-progress');
    const familyGrid = document.getElementById('family-grid');
    const userFilter = document.getElementById('user-filter');
    const userList = document.getElementById('user-list');

    let editingId = null;

    function formatDateUK(dateStr) {
        if (!dateStr) return '-';
        const [year, month, day] = dateStr.split('-');
        return `${day}/${month}/${year}`;
    }

    function getUniqueUsers() {
        const recordUsers = travelRecords.map(r => r.userName);
        const profileUsers = Object.keys(userProfiles);
        const combined = [...new Set([...recordUsers, ...profileUsers])];
        return combined.filter(u => u).sort();
    }

    function calculateMaxAbsenceForUser(userName, records) {
        const userRecords = records.filter(r => r.userName === userName);
        if (userRecords.length === 0) return 0;

        let maxAbsence = 0;
        const sorted = [...userRecords].sort((a, b) => new Date(a.departure) - new Date(b.departure));

        sorted.forEach(record => {
            const endDate = new Date(record.returnDate);
            const startDate = new Date(record.returnDate);
            startDate.setFullYear(startDate.getFullYear() - 1);
            startDate.setDate(startDate.getDate() + 1);

            let windowAbsence = 0;
            sorted.forEach(r => {
                const rDep = new Date(r.departure);
                const rRet = new Date(r.returnDate);
                const intersectStart = new Date(Math.max(rDep, startDate));
                const intersectEnd = new Date(Math.min(rRet, endDate));

                if (intersectEnd > intersectStart) {
                    const diffTime = Math.abs(intersectEnd - intersectStart);
                    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) - 1;
                    windowAbsence += Math.max(0, diffDays);
                }
            });
            if (windowAbsence > maxAbsence) maxAbsence = windowAbsence;
        });
        return maxAbsence;
    }

    let userProfiles = JSON.parse(localStorage.getItem('bnoUserProfiles')) || {};

    function calculateCurrentRollingAbsence(userName, records) {
        const today = new Date();
        const oneYearAgo = new Date(today);
        oneYearAgo.setFullYear(today.getFullYear() - 1);

        const userRecords = records.filter(r => r.userName === userName);
        let totalDays = 0;

        userRecords.forEach(r => {
            const dep = new Date(r.departure);
            const ret = new Date(r.returnDate);
            // Intersection of trip with the [Today-1Y, Today] window
            const intersectStart = new Date(Math.max(dep, oneYearAgo));
            const intersectEnd = new Date(Math.min(ret, today));

            if (intersectEnd > intersectStart) {
                const diffTime = Math.abs(intersectEnd - intersectStart);
                const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) - 1;
                totalDays += Math.max(0, diffDays);
            }
        });
        return totalDays;
    }

    function updateUI() {
        const users = getUniqueUsers();
        renderUserFilter(users);
        renderFamilyGrid(users);
        renderTable();

        const currentFilter = userFilter.value;
        const filteredRecords = currentFilter === 'all' ? travelRecords : travelRecords.filter(r => r.userName === currentFilter);

        // Settlement Progress Logic
        const progressContainer = document.getElementById('progress-container');
        const earliestAppEl = document.getElementById('earliest-app-date');

        if (currentFilter !== 'all') {
            const currentAbs = calculateCurrentRollingAbsence(currentFilter, travelRecords);
            maxAbsenceEl.textContent = currentAbs;
            const percent = Math.min(100, (currentAbs / 180) * 100);
            absenceProgress.style.width = `${percent}%`;
            absenceProgress.style.background = currentAbs > 180 ? '#ef4444' : (currentAbs > 150 ? '#f59e0b' : 'linear-gradient(135deg, #4361ee 0%, #3a0ca3 100%)');

            // Progress Calculation
            const visaDate = userProfiles[currentFilter]?.visaGrantDate;

            if (visaDate) {
                const results = calculateSettlementProgress(visaDate, currentFilter);
                renderProgress(results);
                earliestAppEl.textContent = results.earliestAppDate;
            } else {
                progressContainer.innerHTML = '<div class="subtitle">Enter visa date below to track progress | 請在下方輸入簽證日期以追蹤</div>';
                earliestAppEl.textContent = '-';
            }
        } else {
            maxAbsenceEl.textContent = '-';
            absenceProgress.style.width = '0%';
            progressContainer.innerHTML = '<div class="subtitle">Please select a specific family member to see progress.<br>請選擇一位成員以查看進度。</div>';
            earliestAppEl.textContent = '-';
        }

        localStorage.setItem('bnoTravelRecords', JSON.stringify(travelRecords));
        localStorage.setItem('bnoUserProfiles', JSON.stringify(userProfiles));
    }

    function calculateSettlementProgress(visaDateStr, userName) {
        const grantDate = new Date(visaDateStr);
        const today = new Date();
        const yearlyStats = [];
        const userRecords = travelRecords.filter(r => r.userName === userName);

        for (let i = 0; i < 5; i++) {
            const yearStart = new Date(grantDate);
            yearStart.setFullYear(grantDate.getFullYear() + i);
            const yearEnd = new Date(yearStart);
            yearEnd.setFullYear(yearStart.getFullYear() + 1);
            yearEnd.setDate(yearEnd.getDate() - 1);

            let yearAbsence = 0;
            userRecords.forEach(r => {
                const rDep = new Date(r.departure);
                const rRet = new Date(r.returnDate);
                const intersectStart = new Date(Math.max(rDep, yearStart));
                const intersectEnd = new Date(Math.min(rRet, yearEnd));

                if (intersectEnd > intersectStart) {
                    const diffTime = Math.abs(intersectEnd - intersectStart);
                    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) - 1;
                    yearAbsence += Math.max(0, diffDays);
                }
            });

            const isPast = today > yearEnd;
            const isCurrent = today >= yearStart && today <= yearEnd;

            yearlyStats.push({
                yearIndex: i + 1,
                start: yearStart.toISOString().split('T')[0],
                end: yearEnd.toISOString().split('T')[0],
                absence: yearAbsence,
                passed: yearAbsence <= 180,
                isPast,
                isCurrent
            });
        }

        const settlementDate = new Date(grantDate);
        settlementDate.setFullYear(grantDate.getFullYear() + 5);
        const earliestAppDate = new Date(settlementDate);
        earliestAppDate.setDate(settlementDate.getDate() - 28);

        return {
            yearlyStats,
            earliestAppDate: earliestAppDate.toISOString().split('T')[0]
        };
    }

    function renderProgress(results) {
        const container = document.getElementById('progress-container');
        container.innerHTML = '';

        const stepsRow = document.createElement('div');
        stepsRow.className = 'progress-steps';

        results.yearlyStats.forEach(stat => {
            const step = document.createElement('div');
            // A year is "completed" if it's passed
            const isCompleted = stat.passed && stat.isPast;
            // A year is "active" if it's the current one
            step.className = `step ${isCompleted ? 'completed' : ''} ${stat.isCurrent ? 'active' : ''}`;

            // YEAR LABEL IN data-year attribute (below circle via CSS)
            step.setAttribute('data-year', `Yr${stat.yearIndex}`);
            // Restore checkmark for completed steps
            step.innerHTML = isCompleted ? '<span>✓</span>' : '';

            // Premium Tooltip Data
            const tooltipText = `${formatDateUK(stat.start)} to ${formatDateUK(stat.end)}\nAbsence: ${stat.absence} days`;
            step.setAttribute('data-tooltip', tooltipText);

            stepsRow.appendChild(step);
        });

        container.appendChild(stepsRow);

        // Add a small summary below for clarity
        const currentYear = results.yearlyStats.find(s => s.isCurrent);
        if (currentYear) {
            const summary = document.createElement('div');
            summary.className = 'status-msg';
            summary.style.marginTop = '25px';
            summary.innerHTML = `<small>Current Year (${currentYear.yearIndex}): <strong>${currentYear.absence}</strong> / 180 days absent</small>`;
            container.appendChild(summary);
        }
    }

    function renderUserFilter(users) {
        const currentVal = userFilter.value;
        userFilter.innerHTML = '<option value="all">All Records | 全部紀錄</option>';
        userList.innerHTML = '';
        users.forEach(u => {
            const opt = document.createElement('option');
            opt.value = u;
            opt.textContent = u;
            userFilter.appendChild(opt);

            const dlOpt = document.createElement('option');
            dlOpt.value = u;
            userList.appendChild(dlOpt);
        });
        userFilter.value = users.includes(currentVal) ? currentVal : 'all';
    }

    function renderFamilyGrid(users) {
        familyGrid.innerHTML = '';
        const currentFilter = userFilter.value;

        // Add "All Members" card
        const allCard = document.createElement('div');
        allCard.className = `member-card ${currentFilter === 'all' ? 'active' : ''}`;
        allCard.innerHTML = `
            <div class="member-name">All Members | 全部成員</div>
            <div class="member-status">Total Trips: ${travelRecords.length}</div>
            <div class="progress-bar-bg"><div class="progress-bar-fill" style="width: 100%; background: var(--primary-color)"></div></div>
        `;
        allCard.onclick = () => { userFilter.value = 'all'; updateUI(); };
        familyGrid.appendChild(allCard);

        users.forEach(u => {
            const maxAbs = calculateMaxAbsenceForUser(u, travelRecords);
            const card = document.createElement('div');
            card.className = `member-card ${currentFilter === u ? 'active' : ''}`;

            let statusColor = '#10b981';
            let statusTxt = 'Good';
            if (maxAbs > 180) { statusColor = '#ef4444'; statusTxt = 'Exceeded'; }
            else if (maxAbs > 150) { statusColor = '#f59e0b'; statusTxt = 'Warning'; }

            card.innerHTML = `
                <div class="member-name">${u}</div>
                <div class="member-status" style="color: ${statusColor}">${statusTxt}: ${maxAbs} / 180d</div>
                <div class="progress-bar-bg"><div class="progress-bar-fill" style="width: ${Math.min(100, (maxAbs / 180) * 100)}%; background: ${statusColor}"></div></div>
            `;
            card.onclick = () => { userFilter.value = u; updateUI(); };
            familyGrid.appendChild(card);
        });
    }

    function renderTable() {
        recordsBody.innerHTML = '';
        const currentFilter = userFilter.value;
        const filtered = (currentFilter === 'all' ? travelRecords : travelRecords.filter(r => r.userName === currentFilter))
            .sort((a, b) => new Date(b.departure) - new Date(a.departure));

        filtered.forEach(record => {
            const tr = document.createElement('tr');
            const dep = new Date(record.departure);
            const ret = new Date(record.returnDate);
            const diffDays = Math.max(0, Math.ceil(Math.abs(ret - dep) / (1000 * 60 * 60 * 24)) - 1);

            tr.innerHTML = `
                <td><strong>${record.userName}</strong><br>${formatDateUK(record.departure)}</td>
                <td>${formatDateUK(record.returnDate)}</td>
                <td>${record.flight || '-'}</td>
                <td><span class="days-badge">${diffDays} Days</span></td>
                <td>${record.notes || '-'}</td>
                <td>
                    <button class="btn btn-secondary btn-sm" onclick="editRecord(${record.id})">Edit</button>
                    <button class="btn btn-danger btn-sm" onclick="deleteRecord(${record.id})">Delete</button>
                </td>
            `;
            recordsBody.appendChild(tr);
        });
    }

    window.editRecord = (id) => {
        const record = travelRecords.find(r => r.id === id);
        if (!record) return;

        editingId = id;
        document.getElementById('user-name').value = record.userName;
        document.getElementById('visa-grant-date-form').value = userProfiles[record.userName]?.visaGrantDate || '';
        document.getElementById('departure-date').value = record.departure;
        document.getElementById('return-date').value = record.returnDate;
        document.getElementById('flight-info').value = record.flight || '';
        document.getElementById('notes').value = record.notes || '';

        document.getElementById('add-btn').textContent = 'Update Record | 更新紀錄';
        const cancelBtn = document.getElementById('cancel-btn');
        if (cancelBtn) cancelBtn.style.display = 'inline-block';

        document.querySelector('.form-section').scrollIntoView({ behavior: 'smooth' });
    };

    window.cancelEdit = () => {
        editingId = null;
        travelForm.reset();
        document.getElementById('add-btn').textContent = 'Add Record | 加入紀錄';
        const cancelBtn = document.getElementById('cancel-btn');
        if (cancelBtn) cancelBtn.style.display = 'none';
    };

    window.deleteRecord = (id) => {
        if (confirm('Delete this record?')) {
            travelRecords = travelRecords.filter(r => r.id !== id);
            updateUI();
        }
    };

    travelForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const userName = document.getElementById('user-name').value;
        const visaDate = document.getElementById('visa-grant-date-form').value;
        const departure = document.getElementById('departure-date').value;
        const returnDate = document.getElementById('return-date').value;

        if (new Date(returnDate) <= new Date(departure)) {
            alert('Return date must be later than departure!');
            return;
        }

        // Save visa date if provided or changed
        if (visaDate) {
            userProfiles[userName] = {
                ...userProfiles[userName],
                visaGrantDate: visaDate
            };
        }

        if (editingId) {
            const index = travelRecords.findIndex(r => r.id === editingId);
            if (index !== -1) {
                travelRecords[index] = {
                    ...travelRecords[index],
                    userName,
                    departure,
                    returnDate,
                    flight: document.getElementById('flight-info').value,
                    notes: document.getElementById('notes').value
                };
            }
            editingId = null;
            document.getElementById('add-btn').textContent = 'Add Record | 加入紀錄';
            const cancelBtn = document.getElementById('cancel-btn');
            if (cancelBtn) cancelBtn.style.display = 'none';
        } else {
            travelRecords.push({
                id: Date.now(),
                userName,
                departure,
                returnDate,
                flight: document.getElementById('flight-info').value,
                notes: document.getElementById('notes').value
            });
        }

        updateUI();
        travelForm.reset();
        document.getElementById('user-name').value = userName;
        // Keep visa date pre-filled for next entry if it exists
        if (userProfiles[userName]?.visaGrantDate) {
            document.getElementById('visa-grant-date-form').value = userProfiles[userName].visaGrantDate;
        }
    });

    // Auto-fill visa date when user name changes in form
    document.getElementById('user-name').addEventListener('input', (e) => {
        const name = e.target.value;
        const visaFormInput = document.getElementById('visa-grant-date-form');
        if (userProfiles[name]?.visaGrantDate) {
            visaFormInput.value = userProfiles[name].visaGrantDate;
        } else {
            visaFormInput.value = '';
        }
    });

    userFilter.addEventListener('change', () => {
        const val = userFilter.value;
        const visaFormInput = document.getElementById('visa-grant-date-form');
        if (val !== 'all') {
            document.getElementById('user-name').value = val;
            visaFormInput.value = userProfiles[val]?.visaGrantDate || '';
        } else {
            document.getElementById('user-name').value = '';
            visaFormInput.value = '';
        }
        updateUI();
    });

    document.getElementById('export-csv').addEventListener('click', () => {
        if (travelRecords.length === 0) return;
        let csv = "User,Departure,Return,Flight,Notes\n";
        travelRecords.forEach(r => csv += `"${r.userName}",${r.departure},${r.returnDate},"${r.flight}","${r.notes}"\n`);
        const blob = new Blob([csv], { type: 'text/csv' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'bno_family_records.csv';
        a.click();
    });

    document.getElementById('import-btn').addEventListener('click', () => document.getElementById('csv-file').click());
    document.getElementById('csv-file').addEventListener('change', (e) => {
        const reader = new FileReader();
        reader.onload = (ev) => {
            const rows = ev.target.result.split('\n').slice(1);
            rows.forEach(row => {
                const cols = row.split(',').map(c => c.replace(/"/g, '').trim());
                if (cols.length >= 3) {
                    travelRecords.push({
                        id: Date.now() + Math.random(),
                        userName: cols[0], departure: cols[1], returnDate: cols[2], flight: cols[3] || '', notes: cols[4] || ''
                    });
                }
            });
            updateUI();
        };
        reader.readAsText(e.target.files[0]);
    });

    updateUI();
});
