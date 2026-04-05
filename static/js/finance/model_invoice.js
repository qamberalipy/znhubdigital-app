/**
 * model_invoice.js
 * Theme: Grail (Task Assigner Style)
 */

// State
let currentPage = 1;
let pageSize = 10;
let totalItems = 0;
let activeFilters = { user_id: '', date_from: '', date_to: '' };
let cachedCreators = []; // Store creators for easy access

$(document).ready(function() {
    setDefaultDates(); // Set THIS Month by default
    loadCreators();
    loadData();

    // Event Listeners
    $("#filterUser, #filterDateFrom, #filterDateTo").on("change", function() {
        activeFilters.user_id = $("#filterUser").val();
        activeFilters.date_from = $("#filterDateFrom").val();
        activeFilters.date_to = $("#filterDateTo").val();
        currentPage = 1;
        loadData();
    });

    $("#invoiceForm").on("submit", handleFormSubmit);

    // Live Calculation
    $(".js-calc").on("input", calculateTotal);

    // Pagination
    $("#btnPrevPage").click(() => { if(currentPage > 1) { currentPage--; loadData(); }});
    $("#btnNextPage").click(() => { 
        const max = Math.ceil(totalItems/pageSize); 
        if(currentPage < max) { currentPage++; loadData(); }
    });
});

// --- Initialization ---

function setDefaultDates() {
    // Calculate CURRENT month range
    const now = new Date();
    // 1st day of current month
    const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
    // Last day of current month (Day 0 of next month)
    const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0);

    // Format to YYYY-MM-DD
    const formatDate = (d) => {
        const year = d.getFullYear();
        const month = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    };

    // Set DOM inputs
    $("#filterDateFrom").val(formatDate(firstDay));
    $("#filterDateTo").val(formatDate(lastDay));

    // Update active filters
    activeFilters.date_from = formatDate(firstDay);
    activeFilters.date_to = formatDate(lastDay);
}

// --- Data Loading ---

function loadCreators() {
    axios.get('/api/model_invoice/creators')
        .then(res => {
            cachedCreators = res.data;
            const filterSelect = $("#filterUser");
            const dropdownMenu = $("#userDropdownMenu");

            // 1. Populate Filter (Simple Select)
            const opts = cachedCreators.map(u => `<option value="${u.id}">${u.full_name || u.username}</option>`).join('');
            filterSelect.append(opts);

            // 2. Populate Custom Modal Dropdown (With Images)
            dropdownMenu.empty();
            if(cachedCreators.length === 0) {
                 dropdownMenu.append('<li><span class="dropdown-item text-muted">No creators found</span></li>');
                 return;
            }

            cachedCreators.forEach(u => {
                const pic = u.profile_picture_url || `https://ui-avatars.com/api/?name=${u.full_name || u.username}&background=random&color=fff&background=C89E47`;
                const name = u.full_name || u.username;
                
                const itemHtml = `
                    <li>
                        <div class="custom-user-item" onclick="selectCreator(${u.id}, '${name}', '${pic}')">
                            <img src="${pic}" class="dropdown-avatar" alt="u">
                            <span>${name}</span>
                        </div>
                    </li>
                `;
                dropdownMenu.append(itemHtml);
            });
        })
        .catch(err => console.error("Failed to load creators:", err));
}

// Helper to select creator in modal
window.selectCreator = function(id, name, picUrl) {
    $("#inputUserId").val(id);
    $("#selectedUserText").html(`
        <div class="d-flex align-items-center">
            <img src="${picUrl}" class="dropdown-avatar" style="width:24px;height:24px;">
            <span>${name}</span>
        </div>
    `);
};

function loadData() {
    const tbody = $("#invoiceTableBody");
    tbody.html(`<tr><td colspan="6" class="text-center py-5"><div class="spinner-border text-warning"></div></td></tr>`);
    
    // Call global loader
    if(typeof myshowLoader === 'function') myshowLoader();

    // Clean params
    const params = { page: currentPage, limit: pageSize };
    if (activeFilters.user_id) params.user_id = activeFilters.user_id;
    if (activeFilters.date_from) params.date_from = activeFilters.date_from;
    if (activeFilters.date_to) params.date_to = activeFilters.date_to;

    axios.get('/api/model_invoice/', { params: params })
        .then(res => {
            totalItems = res.data.total;
            renderTable(res.data.items);
            updatePaginationUI();
        })
        .catch(err => {
            console.error(err);
            tbody.html(`<tr><td colspan="6" class="text-center text-danger py-4">Failed to load data.</td></tr>`);
        })
        .finally(() => {
             // Hide global loader
             if(typeof myhideLoader === 'function') myhideLoader();
        });
}

function renderTable(items) {
    const tbody = $("#invoiceTableBody");
    tbody.empty();

    if (items.length === 0) {
        tbody.html(`<tr><td colspan="6" class="text-center text-muted py-5">No revenue records found for this period.</td></tr>`);
        return;
    }

    items.forEach(item => {
        const u = item.user || { full_name: 'Unknown', profile_picture_url: '' };
        const pic = u.profile_picture_url || `https://ui-avatars.com/api/?name=${u.full_name}&background=random`;
        
        // Pass item securely to onclick using base64 or ID fetch - simplified here using object
        // To avoid quote escaping issues, we'll fetch details by ID in edit, but here we can pass basic data
        // For safety, we just pass ID to edit and fetch fresh, or use a data-attribute approach. 
        // We will stick to the previous object passing but ensure proper escaping if needed.
        // Or better: attach data to the row element.
        
        // Simple fix for object passing in string:
        const itemJson = JSON.stringify(item).replace(/"/g, '&quot;');

        const row = `
            <tr>
                <td>
                    <div class="d-flex align-items-center">
                        <img src="${pic}" class="user-avatar-small">
                        <span class="fw-bold text-dark small">${u.full_name || u.username}</span>
                    </div>
                </td>
                <td><span class="text-dark small">${item.invoice_date}</span></td>
                <td class="text-end text-muted small">${fmtMoney(item.subscription)}</td>
                <td class="text-end text-muted small">${fmtMoney(item.tips + item.messages)}</td>
                <td class="text-end"><span class="fw-bold text-success">${fmtMoney(item.total_earnings)}</span></td>
                <td class="text-end">
                    <i class="ri-pencil-line action-icon me-2" onclick="openEditModal(${itemJson})"></i>
                    <i class="ri-delete-bin-line action-icon delete" onclick="deleteInvoice(${item.id})"></i>
                </td>
            </tr>
        `;
        tbody.append(row);
    });
}

// --- Modal Logic ---

function openCreateModal() {
    $("#invoiceForm")[0].reset();
    $("#invoiceId").val("");
    $("#inputUserId").val("");
    $("#selectedUserText").text("Select Creator..."); // Reset dropdown text
    
    $("#modalLabel").text("Add Revenue Record");
    $("#displayTotal").text("$0.00");
    document.getElementById('inputDate').valueAsDate = new Date();
    $("#invoiceModal").modal("show");
}

function openEditModal(item) {
    $("#invoiceForm")[0].reset();
    $("#invoiceId").val(item.id);
    
    // Set Dropdown UI
    const u = item.user || {};
    const pic = u.profile_picture_url || `https://ui-avatars.com/api/?name=${u.full_name}&background=random`;
    selectCreator(item.user_id, u.full_name || u.username, pic);

    $("#inputDate").val(item.invoice_date);
    
    $("#inputSubs").val(item.subscription);
    $("#inputTips").val(item.tips);
    $("#inputMsgs").val(item.messages);
    $("#inputPosts").val(item.posts);
    $("#inputReferrals").val(item.referrals);
    $("#inputStreams").val(item.streams);
    $("#inputOthers").val(item.others);
    
    calculateTotal();
    $("#modalLabel").text("Edit Revenue Record");
    $("#invoiceModal").modal("show");
}

function calculateTotal() {
    let sum = 0;
    $(".js-calc").each(function() {
        sum += parseFloat($(this).val()) || 0;
    });
    $("#displayTotal").text(fmtMoney(sum));
}

function handleFormSubmit(e) {
    e.preventDefault();
    
    // Validate User Selection
    const userId = $("#inputUserId").val();
    if(!userId) {
        showToastMessage('warning', 'Please select a creator.');
        return;
    }

    if(typeof myshowLoader === 'function') myshowLoader();

    const id = $("#invoiceId").val();
    const payload = {
        user_id: parseInt(userId),
        invoice_date: $("#inputDate").val(),
        subscription: parseFloat($("#inputSubs").val()) || 0,
        tips: parseFloat($("#inputTips").val()) || 0,
        messages: parseFloat($("#inputMsgs").val()) || 0,
        posts: parseFloat($("#inputPosts").val()) || 0,
        referrals: parseFloat($("#inputReferrals").val()) || 0,
        streams: parseFloat($("#inputStreams").val()) || 0,
        others: parseFloat($("#inputOthers").val()) || 0
    };

    const promise = id 
        ? axios.put(`/api/model_invoice/${id}`, payload)
        : axios.post('/api/model_invoice/', payload);

    promise
        .then(() => {
            $("#invoiceModal").modal("hide");
            showToastMessage('success', "Record Saved Successfully");
            loadData();
        })
        .catch(err => {
            const msg = err.response?.data?.detail || "Operation Failed";
            showToastMessage('error', msg);
        })
        .finally(() => {
            if(typeof myhideLoader === 'function') myhideLoader();
        });
}

function deleteInvoice(id) {
    Swal.fire({
        title: 'Are you sure?',
        text: "You won't be able to revert this!",
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#C89E47',
        cancelButtonColor: '#d33',
        confirmButtonText: 'Yes, delete it!'
    }).then((result) => {
        if (result.isConfirmed) {
            if(typeof myshowLoader === 'function') myshowLoader();
            
            axios.delete(`/api/model_invoice/${id}`)
                .then(() => { 
                    Swal.fire('Deleted!', 'The record has been deleted.', 'success');
                    loadData(); 
                })
                .catch(() => {
                    Swal.fire('Error!', 'Failed to delete record.', 'error');
                })
                .finally(() => {
                    if(typeof myhideLoader === 'function') myhideLoader();
                });
        }
    });
}

// --- Utilities ---
function resetFilters() {
    $("#filterUser").val("");
    setDefaultDates(); 
    $("#filterUser").trigger("change");
}

function updatePaginationUI() {
    const max = Math.ceil(totalItems/pageSize) || 1;
    const start = (currentPage-1)*pageSize + 1;
    const end = Math.min(currentPage*pageSize, totalItems);
    
    $("#paginationInfo").text(`Showing ${totalItems === 0 ? 0 : start}-${end} of ${totalItems}`);
    $("#btnPrevPage").prop("disabled", currentPage === 1);
    $("#btnNextPage").prop("disabled", currentPage >= max || totalItems === 0);
}

function fmtMoney(val) {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(val || 0);
}