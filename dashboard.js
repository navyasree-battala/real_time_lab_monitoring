let activityChart = null;
let updateInterval = null;
let selectedDate = null; // null = show today

document.addEventListener('DOMContentLoaded', () => {
    initIPConfig();
    initChart();
    startPolling();
    setupControls();
    setupDateReset();
});

// ── Toast notification ────────────────────────────────────────────────────
function showToast(message, type = 'success') {
    const toast = document.getElementById('toast');
    toast.textContent = message;

    if (type === 'success') {
        toast.className = 'fixed top-4 right-4 z-50 px-4 py-2 rounded text-sm font-mono font-bold border shadow-lg bg-oliveGreen/20 border-oliveGreen text-sageGreen';
    } else if (type === 'info') {
        toast.className = 'fixed top-4 right-4 z-50 px-4 py-2 rounded text-sm font-mono font-bold border shadow-lg bg-burntAmber/20 border-burntAmber text-burntAmber';
    } else {
        toast.className = 'fixed top-4 right-4 z-50 px-4 py-2 rounded text-sm font-mono font-bold border shadow-lg bg-mutedRed/20 border-mutedRed text-mutedRed';
    }

    toast.classList.remove('hidden');
    setTimeout(() => { toast.classList.add('hidden'); }, 3000);
}

// ── Dynamic Jetson IP & Base URL ──────────────────────────────────────────
function getBaseURL() {
    const stored = localStorage.getItem('jetson_ip');
    if (stored) {
        let ip = stored.trim();
        if (!ip.startsWith('http://') && !ip.startsWith('https://')) {
            ip = 'http://' + ip;
        }
        return ip;
    }
    return ''; // relative — works when browser is on the same device as Jetson
}

function updateIPStatusLabel() {
    const label = document.getElementById('ip-status-label');
    const stored = localStorage.getItem('jetson_ip');
    if (stored) {
        label.textContent = `Connected to remote Jetson: ${stored}`;
        label.style.color = '#9CAF70'; // sageGreen
    } else {
        label.textContent = 'Using local server (same device as Jetson)';
        label.style.color = '#A6A08F'; // dustGrey
    }
}

function initIPConfig() {
    const ipInput = document.getElementById('jetson-ip-input');
    const saveBtn = document.getElementById('save-ip-btn');
    const clearBtn = document.getElementById('clear-ip-btn');

    // Load stored IP if exists
    const stored = localStorage.getItem('jetson_ip');
    if (stored) {
        ipInput.value = stored;
    }
    updateIPStatusLabel();

    saveBtn.addEventListener('click', () => {
        const value = ipInput.value.trim();
        if (value) {
            localStorage.setItem('jetson_ip', value);
            updateIPStatusLabel();
            showToast(`Jetson IP saved: ${value}`, 'success');
            stopPolling();
            startPolling();
        } else {
            showToast('Please enter an IP address first', 'error');
        }
    });

    clearBtn.addEventListener('click', () => {
        localStorage.removeItem('jetson_ip');
        ipInput.value = '';
        updateIPStatusLabel();
        showToast('Cleared — using local server', 'info');
        stopPolling();
        startPolling();
    });
}

// ── Control Buttons ───────────────────────────────────────────────────────
function setupControls() {
    document.getElementById('start-btn').addEventListener('click', () => sendControlAction('start'));
    document.getElementById('pause-btn').addEventListener('click', async () => {
        const btn = document.getElementById('pause-btn');
        const isPaused = btn.textContent.trim().toLowerCase() === 'resume live';
        await sendControlAction(isPaused ? 'resume' : 'pause');
    });
    document.getElementById('stop-btn').addEventListener('click', () => sendControlAction('stop'));
}

async function sendControlAction(action) {
    try {
        const baseUrl = getBaseURL();
        const response = await fetch(`${baseUrl}/api/control?action=${action}`);
        if (response.ok) {
            const data = await response.json();
            console.log('Control:', data);
            await fetchData();
        }
    } catch (e) {
        showToast('Cannot reach Jetson server', 'error');
        console.error('Failed to send control action:', e);
    }
}

// ── Chart ─────────────────────────────────────────────────────────────────
function initChart() {
    const ctx = document.getElementById('activityChart').getContext('2d');
    activityChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: Array.from({ length: 24 }, (_, i) => `${i}:00`),
            datasets: [
                {
                    label: 'Entries',
                    data: Array(24).fill(0),
                    borderColor: '#C76A2A',
                    backgroundColor: 'rgba(199, 106, 42, 0.1)',
                    borderWidth: 2,
                    tension: 0.2,
                    fill: true
                },
                {
                    label: 'Exits',
                    data: Array(24).fill(0),
                    borderColor: '#7A8F3A',
                    backgroundColor: 'rgba(122, 143, 58, 0.1)',
                    borderWidth: 2,
                    tension: 0.2,
                    fill: true
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                x: {
                    grid: { color: 'rgba(75, 84, 56, 0.15)' },
                    ticks: { color: '#A6A08F', font: { size: 9, family: 'Share Tech Mono' } }
                },
                y: {
                    grid: { color: 'rgba(75, 84, 56, 0.15)' },
                    ticks: { color: '#A6A08F', font: { size: 9, family: 'Share Tech Mono' }, beginAtZero: true, stepSize: 1 }
                }
            },
            plugins: {
                legend: { labels: { color: '#EFE7D3', font: { size: 10, family: 'Outfit' } } }
            }
        }
    });
}

// ── Polling ───────────────────────────────────────────────────────────────
function startPolling() {
    fetchData();
    updateInterval = setInterval(fetchData, 2000);
}

function stopPolling() {
    if (updateInterval) { clearInterval(updateInterval); updateInterval = null; }
}

function setupDateReset() {
    document.getElementById('reset-date-btn').addEventListener('click', () => {
        selectedDate = null;
        document.getElementById('reset-date-btn').classList.add('hidden');
        document.getElementById('chart-subtitle').textContent = 'Hourly crossing trends for today';
        fetchData();
    });
}

// ── Fetch Data ────────────────────────────────────────────────────────────
async function fetchData() {
    try {
        const baseUrl = getBaseURL();
        let url = `${baseUrl}/api/stats`;
        if (selectedDate) url += `?date=${selectedDate}`;

        const response = await fetch(url);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data = await response.json();
        updateUI(data);
        updateConnectionStatus(true);
    } catch (e) {
        updateConnectionStatus(false);
        console.error('Fetch failed:', e);
    }
}

// ── Connection Status Footer ──────────────────────────────────────────────
function updateConnectionStatus(connected) {
    const dot = document.getElementById('connection-status');
    const text = document.getElementById('status-text');
    const wsTarget = document.getElementById('ws-target');
    const lastPacket = document.getElementById('last-packet');
    const now = new Date().toLocaleTimeString();
    const baseUrl = getBaseURL();
    const label = baseUrl ? `Endpoint: ${baseUrl}` : 'Server: local Jetson';

    if (connected) {
        dot.className = 'w-2 h-2 rounded-full bg-oliveGreen';
        text.textContent = 'CONNECTED';
        text.className = 'font-bold text-oliveGreen';
        wsTarget.textContent = label;
        lastPacket.textContent = `Synced: ${now}`;
    } else {
        dot.className = 'w-2 h-2 rounded-full bg-mutedRed';
        text.textContent = 'DISCONNECTED';
        text.className = 'font-bold text-mutedRed';
        wsTarget.textContent = baseUrl ? `Unreachable: ${baseUrl}` : 'Local server offline';
        lastPacket.textContent = `Failed: ${now}`;
    }
}

// ── Main UI Update ────────────────────────────────────────────────────────
function updateUI(data) {
    const state = data.detection_state || 'RUNNING';
    const banner = document.getElementById('status-banner');
    const bannerText = document.getElementById('banner-text');
    const startBtn = document.getElementById('start-btn');
    const pauseBtn = document.getElementById('pause-btn');
    const stopBtn = document.getElementById('stop-btn');
    const pingDot = document.getElementById('activity-ping-dot');

    // Button states per detection state
    if (state === 'RUNNING') {
        banner.className = 'alert-banner alert-normal';
        bannerText.textContent = 'SYSTEM ACTIVE — DETECTION RUNNING';
        startBtn.disabled = true;
        startBtn.className = 'px-3 py-1.5 bg-oliveGreen/20 text-dustGrey/40 text-xs font-bold rounded cursor-not-allowed';
        pauseBtn.disabled = false;
        pauseBtn.textContent = 'Pause Live';
        pauseBtn.className = 'px-3 py-1.5 bg-mainBg border border-tacticalBorder text-warmWhite text-xs font-semibold rounded hover:bg-primaryCard transition';
        stopBtn.disabled = false;
        stopBtn.className = 'px-3 py-1.5 bg-mutedRed text-white text-xs font-bold rounded hover:bg-opacity-80 transition';
        if (pingDot) pingDot.className = 'w-2 h-2 rounded-full bg-oliveGreen inline-block animate-ping';
    } else if (state === 'PAUSED') {
        banner.className = 'alert-banner alert-warning';
        bannerText.textContent = 'DETECTION PAUSED — CAMERA IDLE';
        startBtn.disabled = true;
        startBtn.className = 'px-3 py-1.5 bg-oliveGreen/20 text-dustGrey/40 text-xs font-bold rounded cursor-not-allowed';
        pauseBtn.disabled = false;
        pauseBtn.textContent = 'Resume Live';
        pauseBtn.className = 'px-3 py-1.5 bg-burntAmber text-black text-xs font-bold rounded hover:bg-opacity-90 transition';
        stopBtn.disabled = false;
        stopBtn.className = 'px-3 py-1.5 bg-mutedRed text-white text-xs font-bold rounded hover:bg-opacity-80 transition';
        if (pingDot) pingDot.className = 'w-2 h-2 rounded-full bg-burntAmber inline-block';
    } else if (state === 'STOPPED') {
        banner.className = 'alert-banner alert-critical';
        bannerText.textContent = 'DETECTION STOPPED — HISTORICAL DATA ONLY';
        startBtn.disabled = false;
        startBtn.className = 'px-3 py-1.5 bg-oliveGreen text-black text-xs font-bold rounded hover:bg-sageGreen transition';
        pauseBtn.disabled = true;
        pauseBtn.textContent = 'Pause Live';
        pauseBtn.className = 'px-3 py-1.5 bg-mainBg border border-tacticalBorder/20 text-dustGrey/40 text-xs font-semibold rounded cursor-not-allowed';
        stopBtn.disabled = true;
        stopBtn.className = 'px-3 py-1.5 bg-mutedRed/20 text-white/30 text-xs font-bold rounded cursor-not-allowed';
        if (pingDot) pingDot.className = 'w-2 h-2 rounded-full bg-mutedRed inline-block';
    }

    // Metrics
    const occupancy = data.occupancy || 0;
    const entered = data.entered || 0;
    const exited = data.exited || 0;
    const targetDate = data.target_date;
    const todayStr = new Date().toISOString().split('T')[0];
    const isToday = !targetDate || targetDate === todayStr;

    const badge = document.getElementById('session-status-badge');
    if (!isToday) {
        badge.textContent = 'HISTORIC';
        badge.className = 'text-xl font-black text-burntAmber tracking-wider font-mono';
        document.getElementById('session-status-desc').textContent = `REPORT FOR ${targetDate}`;
    } else {
        const statusText = occupancy > 0 ? 'OCCUPIED' : 'EMPTY';
        badge.textContent = statusText;
        badge.className = `text-xl font-black tracking-wider font-mono ${occupancy > 0 ? 'text-rustOrange' : 'text-oliveGreen'}`;
        document.getElementById('session-status-desc').textContent = occupancy > 0 ? `${occupancy} PERSON(S) INSIDE` : 'NO ACTIVE OCCUPANCY';
    }

    document.getElementById('unique-persons-count').textContent = isToday ? occupancy : 'N/A';
    document.getElementById('total-frames-count').textContent = entered;
    document.getElementById('avg-confidence').textContent = exited;
    document.getElementById('runtime-display').textContent = data.runtime || '00:00:00';
    document.getElementById('qwen-summary-text').textContent = data.insights || `${entered} entries and ${exited} exits recorded.`;
    document.getElementById('session-timestamp').textContent = `Sync: ${data.last_updated || '--:--:--'}`;

    // Chart update
    if (activityChart && data.hourly_timeline) {
        activityChart.data.datasets[0].data = data.hourly_timeline.entries || Array(24).fill(0);
        activityChart.data.datasets[1].data = data.hourly_timeline.exits || Array(24).fill(0);
        activityChart.update();
    }

    // Show Today reset button
    const resetBtn = document.getElementById('reset-date-btn');
    if (!isToday) {
        resetBtn.classList.remove('hidden');
        document.getElementById('chart-subtitle').textContent = `Hourly trend for date: ${targetDate}`;
    } else {
        resetBtn.classList.add('hidden');
    }

    // Historical Table
    const tableBody = document.getElementById('id-photos-container');
    const history = data.historical_summary || [];

    if (history.length === 0) {
        tableBody.innerHTML = `<tr><td colspan="5" class="py-6 text-center text-dustGrey text-xs">No historical reports found.</td></tr>`;
        return;
    }

    tableBody.innerHTML = '';
    history.forEach(row => {
        const rowDate = row.date || '-----';
        const ent = row.entered || 0;
        const ex = row.exited || 0;
        const net = Math.max(0, ent - ex);
        const updated = row.updated || '--:--:--';
        const isActive = selectedDate === rowDate;

        const tr = document.createElement('tr');
        tr.className = `border-b border-tacticalBorder hover:bg-secPanel/60 transition-colors cursor-pointer select-none
            ${isActive ? 'bg-secPanel/80 border-l-2 border-l-rustOrange' : ''}`;
        tr.title = `Click to view hourly trend for ${rowDate}`;
        tr.innerHTML = `
            <td class="py-3 px-4 font-mono font-bold text-warmWhite flex items-center gap-2">
                ${rowDate}
                ${isActive ? '<span class="text-[9px] text-rustOrange border border-rustOrange/40 rounded px-1 py-0.5 font-mono">VIEWING</span>' : ''}
            </td>
            <td class="py-3 px-4 text-right text-rustOrange font-bold font-mono">${ent}</td>
            <td class="py-3 px-4 text-right text-oliveGreen font-bold font-mono">${ex}</td>
            <td class="py-3 px-4 text-right text-burntAmber font-bold font-mono">${net}</td>
            <td class="py-3 px-4 text-right text-xs font-mono text-dustGrey">${updated}</td>
        `;
        tr.addEventListener('click', () => {
            selectedDate = rowDate;
            fetchData();
        });
        tableBody.appendChild(tr);
    });
}
