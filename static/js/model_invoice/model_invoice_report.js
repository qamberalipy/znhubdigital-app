/**
 * model_report.js
 * Logic for Model Invoice Reports
 */

let allCreators = [];
let selectedUserId = null;
let revenueChartInstance = null;

$(document).ready(function() {
    setDefaultDates();
    loadCreators();

    // Search Filter
    $("#searchCreator").on("keyup", function() {
        const term = $(this).val().toLowerCase();
        const filtered = allCreators.filter(u => 
            (u.full_name && u.full_name.toLowerCase().includes(term)) || 
            (u.username && u.username.toLowerCase().includes(term))
        );
        renderCreatorList(filtered);
    });
});

// --- 1. Init & Config ---

function setDefaultDates() {
    const now = new Date();
    const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
    const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0);

    const formatDate = (d) => {
        const year = d.getFullYear();
        const month = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    };

    $("#dateFrom").val(formatDate(firstDay));
    $("#dateTo").val(formatDate(lastDay));
}

// --- 2. Sidebar Logic ---

function loadCreators() {
    axios.get('/api/model_invoice/creators')
        .then(res => {
            allCreators = res.data;
            renderCreatorList(allCreators);
        })
        .catch(err => console.error("Error loading creators", err));
}

function renderCreatorList(users) {
    const container = $("#creatorList");
    container.empty();

    if(users.length === 0) {
        container.html('<div class="text-center text-muted small mt-4">No results found</div>');
        return;
    }

    users.forEach(u => {
        const pic = u.profile_picture_url || `https://ui-avatars.com/api/?name=${u.full_name || u.username}&background=random&color=fff`;
        const name = u.full_name || u.username;
        
        // Ensure ID is passed as integer
        const div = $(`
            <div class="creator-item" data-id="${u.id}">
                <img src="${pic}" alt="u">
                <div class="creator-info">
                    <h6>${name}</h6>
                    <span>@${u.username}</span>
                </div>
            </div>
        `);
        
        div.click(() => selectCreator(u.id, div));
        container.append(div);
    });
}

function selectCreator(id, el) {
    selectedUserId = id;
    $(".creator-item").removeClass("active");
    if(el) el.addClass("active");
    
    // Switch View
    $("#emptyState").addClass("d-none");
    $("#reportContent").removeClass("d-none");

    fetchReport();
}

// --- 3. Report Fetching ---

function fetchReport() {
    if(!selectedUserId) return;

    if(typeof myshowLoader === 'function') myshowLoader();

    const params = {
        user_id: selectedUserId,
        date_from: $("#dateFrom").val(),
        date_to: $("#dateTo").val()
    };

    axios.get('/api/model_invoice/report', { params })
        .then(res => {
            updateDashboard(res.data);
        })
        .catch(err => {
            toastr.error("Failed to load report data");
            console.error(err);
        })
        .finally(() => {
            if(typeof myhideLoader === 'function') myhideLoader();
        });
}

function updateDashboard(data) {
    // 1. Update Cards
    const sum = data.summary;
    $("#statTotal").text(fmtMoney(sum.total_revenue));
    $("#statSubs").text(fmtMoney(sum.total_subscription));
    $("#statTips").text(fmtMoney(sum.total_tips));
    $("#statMsgs").text(fmtMoney(sum.total_messages));

    // 2. Update Graph
    renderChart(data.daily_trend);

    // 3. Update Table
    renderTable(data.records);
}

// --- 4. Chart.js Logic ---

function renderChart(dailyData) {
    const ctx = document.getElementById('revenueChart').getContext('2d');
    
    // Destroy previous chart if exists
    if (revenueChartInstance) {
        revenueChartInstance.destroy();
    }

    const labels = dailyData.map(d => d.date);
    const values = dailyData.map(d => d.total);

    // Create Gradient
    const gradient = ctx.createLinearGradient(0, 0, 0, 400);
    gradient.addColorStop(0, 'rgba(200, 158, 71, 0.5)'); // Gold-ish
    gradient.addColorStop(1, 'rgba(200, 158, 71, 0.0)');

    revenueChartInstance = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [{
                label: 'Total Revenue',
                data: values,
                borderColor: '#C89E47',
                backgroundColor: gradient,
                borderWidth: 2,
                pointBackgroundColor: '#fff',
                pointBorderColor: '#C89E47',
                pointRadius: 4,
                fill: true,
                tension: 0.4 // Smooth curves
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            return fmtMoney(context.raw);
                        }
                    }
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    grid: { borderDash: [5, 5] },
                    ticks: {
                        callback: function(value) { return '$' + value; }
                    }
                },
                x: {
                    grid: { display: false }
                }
            }
        }
    });
}

// --- 5. Table Logic ---

function renderTable(records) {
    const tbody = $("#reportTableBody");
    tbody.empty();

    if (records.length === 0) {
        tbody.html('<tr><td colspan="8" class="text-center text-muted py-4">No records in this date range.</td></tr>');
        return;
    }

    records.forEach(r => {
        const row = `
            <tr>
                <td><span class="fw-medium text-dark">${r.invoice_date}</span></td>
                <td class="text-end text-muted">${fmtMoney(r.subscription)}</td>
                <td class="text-end text-muted">${fmtMoney(r.tips)}</td>
                <td class="text-end text-muted">${fmtMoney(r.messages)}</td>
                <td class="text-end text-muted">${fmtMoney(r.posts)}</td>
                <td class="text-end text-muted">${fmtMoney(r.streams)}</td>
                <td class="text-end text-muted">${fmtMoney(r.others)}</td>
                <td class="text-end"><span class="fw-bold text-success">${fmtMoney(r.total_earnings)}</span></td>
            </tr>
        `;
        tbody.append(row);
    });
}

function fmtMoney(val) {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(val || 0);
}