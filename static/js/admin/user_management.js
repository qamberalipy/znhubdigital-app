/* static/js/admin/user_management.js */

// Pagination State
let currentSkip = 0;
const LIMIT = 10;
let currentRoleFilter = null; 

$(document).ready(function() {
    loadTimezones(); // Load timezones natively
    loadUsers();

    // Search Filter
    $("#userSearchInput").on("keyup", function() {
        var value = $(this).val().toLowerCase();
        $("#usersTableBody tr").filter(function() {
            $(this).toggle($(this).text().toLowerCase().indexOf(value) > -1)
        });
    });
});

// --- 1. DATA LOADING & TIMEZONES ---

function loadTimezones() {
    const tzSelect = $("#timezone");
    tzSelect.empty();
    
    try {
        // Native JavaScript method - Instant, zero network requests
        const timezones = Intl.supportedValuesOf('timeZone');
        
        timezones.forEach(tz => {
            tzSelect.append(`<option value="${tz}">${tz}</option>`);
        });
    } catch (error) {
        // Fallback for extremely old browsers
        console.error("Browser doesn't support Intl API", error);
        tzSelect.append(`<option value="Asia/Karachi">Asia/Karachi (PKT)</option>`);
        tzSelect.append(`<option value="UTC">UTC</option>`);
    }
}

function showTableLoader() {
    $("#usersTableBody").html(`
        <tr>
            <td colspan="6" class="text-center py-5">
                <div class="spinner-border text-primary" role="status">
                    <span class="visually-hidden">Loading...</span>
                </div>
            </td>
        </tr>
    `);
}

function loadUsers() {
    showTableLoader();

    let url = `/api/users/?skip=${currentSkip}&limit=${LIMIT}`;
    if (currentRoleFilter) url += `&role=${currentRoleFilter}`;

    axios.get(url)
        .then(response => {
            const users = response.data;

            if (users.length === 0 && currentSkip > 0) {
                currentSkip -= LIMIT;
                showToastMessage('info', 'No more records found.');
                loadUsers(); 
                return; 
            }

            renderTable(users);
            updatePaginationControls(users.length);
        })
        .catch(error => {
            console.error("Error loading users:", error);
            $("#usersTableBody").html(`<tr><td colspan="6" class="text-center text-danger">Failed to load data.</td></tr>`);
        });
}

function updatePaginationControls(itemsCount) {
    $("#btnPrev").prop("disabled", currentSkip === 0);
    $("#btnNext").prop("disabled", itemsCount < LIMIT);

    const start = itemsCount > 0 ? currentSkip + 1 : 0;
    const end = currentSkip + itemsCount;
    $("#pageIndicator").text(`Showing ${start}-${end}`);
}

function nextPage() {
    currentSkip += LIMIT;
    loadUsers();
}

function prevPage() {
    if (currentSkip >= LIMIT) {
        currentSkip -= LIMIT;
        loadUsers();
    }
}

// --- 2. RENDER TABLE ---
function renderTable(users) {
    const tbody = $("#usersTableBody");
    tbody.empty();

    if (users.length === 0) {
        tbody.html(`<tr><td colspan="6" class="text-center text-muted">No users found.</td></tr>`);
        return;
    }

    users.forEach(user => {
        const avatarUrl = user.profile_picture_url || `https://ui-avatars.com/api/?name=${user.username}&background=random`;
        
        let roleClass = `role-${user.role}`; 
        const formattedRole = user.role.replace('_', ' ');

        // Check if role is eligible for shift tracking
        let attendanceBtn = '';
        if (['sale', 'lead_generator'].includes(user.role)) {
            attendanceBtn = `<i class="ri-calendar-todo-line action-icon me-2" style="cursor:pointer; color:#10B981;" onclick="openAttendanceView(${user.id}, '${user.full_name || user.username}', '${formattedRole}', '${user.timezone || 'UTC'}', '${roleClass}')" title="View Attendance"></i>`;
        }

        const row = `
            <tr>
                <td><input class="form-check-input" type="checkbox" value="${user.id}"></td>
                <td>
                    <div class="d-flex align-items-center">
                        <img src="${avatarUrl}" class="user-avatar-small" alt="dp">
                        <div>
                            <span class="fw-medium d-block text-dark" style="font-size: 0.9rem;">${user.full_name || user.username}</span>
                            <span class="text-muted small" style="font-size: 0.75rem;">${user.email}</span>
                        </div>
                    </div>
                </td>
                <td><span class="role-badge ${roleClass}">${formattedRole}</span></td>
                <td><span class="text-muted small">${user.timezone || 'UTC'}</span></td>
                <td><span class="badge bg-${user.account_status === 'active' ? 'success' : 'secondary'}">${user.account_status}</span></td>
                <td class="text-end">
                    ${attendanceBtn}
                    <i class="ri-pencil-line action-icon me-2" style="cursor:pointer; color:#2563EB;" onclick="openEditModal(${user.id})" title="Edit"></i>
                    <i class="ri-delete-bin-line action-icon text-danger" style="cursor:pointer;" onclick="deleteUser(${user.id})" title="Delete"></i>
                </td>
            </tr>
        `;
        tbody.append(row);
    });
}

// --- 3. DYNAMIC FORM LOGIC ---

function openCreateModal(startRole = 'sale') {
    $("#userForm")[0].reset();
    $("#userId").val("");
    $("#userModalLabel").text("Add User");
    
    $("#password").attr("required", true); 
    $("#passwordHint").addClass("d-none");
    
    $("#role").val(startRole);
    $("#timezone").val("Asia/Karachi"); 
    
    $("#userModal").modal("show");
}

// --- 4. SUBMIT ---

$("#userForm").submit(function(e) {
    e.preventDefault();
    const userId = $("#userId").val();
    const isEdit = !!userId;
    const role = $("#role").val();

    let payload = {
        email: $("#email").val(),
        username: $("#username").val(),
        full_name: $("#fullName").val(),
        role: role,
        gender: $("#gender").val() || null,
        timezone: $("#timezone").val() || "Asia/Karachi"
    };

    const passwordVal = $("#password").val();
    if (!isEdit) {
        if (!passwordVal) { Swal.fire('Error', 'Password required', 'warning'); return; }
        payload.password = passwordVal;
    } else {
        if (passwordVal && passwordVal.trim() !== "") payload.password = passwordVal;
    }

    const apiCall = isEdit 
        ? axios.put(`/api/users/${userId}`, payload) 
        : axios.post('/api/users/', payload);

    myshowLoader(); 
    apiCall.then(() => {
        myhideLoader();
        $("#userModal").modal("hide");
        showToastMessage('success', 'User saved successfully');
        loadUsers();
    }).catch(err => {
        myhideLoader();
        let msg = 'Operation failed';
        if(err.response && err.response.data && err.response.data.detail) {
            msg = typeof err.response.data.detail === 'string' 
                ? err.response.data.detail 
                : err.response.data.detail[0].msg; 
        }
        Swal.fire('Error', msg, 'error');
    });
});

// --- 5. EDIT MODE ---

function openEditModal(id) {
    myshowLoader();

    axios.get(`/api/users/${id}`)
        .then(res => {
            const user = res.data;
            
            $("#userId").val(user.id);
            $("#fullName").val(user.full_name);
            $("#username").val(user.username);
            $("#email").val(user.email);
            $("#gender").val(user.gender);
            $("#role").val(user.role); 
            $("#timezone").val(user.timezone || "Asia/Karachi");

            $("#userModalLabel").text("Edit User");
            $("#password").removeAttr("required");
            $("#passwordHint").removeClass("d-none");
            
            myhideLoader();
            $("#userModal").modal("show");
        })
        .catch(err => {
            myhideLoader();
            showToastMessage('error', 'Could not fetch user');
        });
}

function deleteUser(id) {
    Swal.fire({
        title: 'Delete User?',
        text: "This cannot be undone.",
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#d33',
        confirmButtonText: 'Delete'
    }).then((result) => {
        if (result.isConfirmed) {
            axios.delete(`/api/users/${id}`)
                .then(() => { 
                    showToastMessage('success', 'Deleted'); 
                    loadUsers(); 
                })
                .catch(err => {
                    let msg = 'Delete failed';
                    if(err.response && err.response.data && err.response.data.detail) msg = err.response.data.detail;
                    showToastMessage('error', msg);
                });
        }
    });
}

// --- 6. ATTENDANCE TRACKER LOGIC ---

let currentAttUserId = null;
let currentAttUserTz = 'UTC';

function openAttendanceView(userId, userName, userRole, timezone, roleClass) {
    currentAttUserId = userId;
    currentAttUserTz = timezone;
    
    $("#attUserName").text(userName);
    
    const roleBadge = $("#attUserRole");
    roleBadge.removeClass().addClass(`role-badge ${roleClass} mt-1 d-inline-block`);
    roleBadge.text(userRole);
    
    // Set default dates to current month exactly
    const now = new Date();
    const firstDay = new Date(now.getFullYear(), now.getMonth(), 1).toLocaleDateString('en-CA'); 
    const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0).toLocaleDateString('en-CA');
    
    $("#attStartDate").val(firstDay);
    $("#attEndDate").val(lastDay);

    // Smooth UI Transition
    $("#usersMainView").css('opacity', '0');
    setTimeout(() => {
        $("#usersMainView").addClass('d-none');
        $("#attendanceView").removeClass('d-none').css('opacity', '0');
        
        fetchAttendance();
        
        setTimeout(() => $("#attendanceView").css('opacity', '1'), 50);
    }, 300);
}

function closeAttendanceView() {
    $("#attendanceView").css('opacity', '0');
    setTimeout(() => {
        $("#attendanceView").addClass('d-none');
        $("#usersMainView").removeClass('d-none').css('opacity', '0');
        setTimeout(() => $("#usersMainView").css('opacity', '1'), 50);
    }, 300);
}

function fetchAttendance() {
    const start = $("#attStartDate").val();
    const end = $("#attEndDate").val();
    const tbody = $("#attendanceTableBody");
    
    tbody.html(`<tr><td colspan="4" class="text-center py-5"><div class="spinner-border text-primary"></div></td></tr>`);
    $("#attTotalHours").text("...");

    axios.get(`/api/users/${currentAttUserId}/attendance?start_date=${start}&end_date=${end}`)
        .then(res => renderAttendance(res.data))
        .catch(err => {
            console.error(err);
            showToastMessage('error', 'Failed to fetch attendance records.');
            tbody.html(`<tr><td colspan="4" class="text-center text-danger py-4">Error loading data</td></tr>`);
        });
}

function renderAttendance(data) {
    const tbody = $("#attendanceTableBody");
    tbody.empty();
    
    // Update the summary footer
    $("#attTotalHours").text(data.cumulative_hours.toFixed(2));
    
    if (data.records.length === 0) {
        tbody.html(`<tr><td colspan="4" class="text-center text-muted py-4">No attendance records found for this date range.</td></tr>`);
        return;
    }
    
    // Formatters
    const timeFormatter = new Intl.DateTimeFormat('en-US', {
        timeZone: currentAttUserTz, hour: '2-digit', minute: '2-digit', hour12: true
    });
    const dateFormatter = new Intl.DateTimeFormat('en-US', {
        timeZone: currentAttUserTz, month: 'short', day: 'numeric', year: 'numeric'
    });

    data.records.forEach(record => {
        let startTime = record.start_time ? new Date(record.start_time) : null;
        let endTime = record.end_time ? new Date(record.end_time) : null;

        // Clean, text-based formatting matching a document style
        let startStr = startTime ? `${timeFormatter.format(startTime)} <span class="text-muted ms-1" style="font-size: 0.75rem;">(${dateFormatter.format(startTime)})</span>` : '-';
        
        let endStr = endTime 
            ? `${timeFormatter.format(endTime)} <span class="text-muted ms-1" style="font-size: 0.75rem;">(${dateFormatter.format(endTime)})</span>` 
            : `<span class="text-warning fw-semibold"><i class="ri-loader-4-line ri-spin me-1"></i>Active Shift</span>`;

        let hoursStr = record.total_hours 
            ? `<span class="fw-bold text-dark">${record.total_hours.toFixed(2)}</span>` 
            : `<span class="text-muted">--</span>`;
        
        // Format Shift Date securely
        const dateParts = record.shift_date.split('-');
        const shiftDateObj = new Date(Date.UTC(dateParts[0], dateParts[1] - 1, dateParts[2]));
        const shiftDateFormatted = new Intl.DateTimeFormat('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' }).format(shiftDateObj);

        tbody.append(`
            <tr>
                <td class="px-4 py-3 fw-medium text-dark">${shiftDateFormatted}</td>
                <td class="px-4 py-3">${startStr}</td>
                <td class="px-4 py-3">${endStr}</td>
                <td class="px-4 py-3 text-end">${hoursStr}</td>
            </tr>
        `);
    });
}


// ==========================================
// EXPORT LOGIC (PDF & EXCEL)
// ==========================================

function exportToPDF() {
    if (typeof window.jspdf === 'undefined') {
        showToastMessage('error', 'PDF library is still loading. Please try again in a moment.');
        return;
    }

    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();
    
    const userName = $("#attUserName").text();
    const startDate = $("#attStartDate").val();
    const endDate = $("#attEndDate").val();
    
    // Add Document Header
    doc.setFontSize(16);
    doc.setTextColor(11, 17, 32); 
    doc.text(`${userName} - Attendance Report`, 14, 20);
    
    doc.setFontSize(10);
    doc.setTextColor(100, 116, 139); 
    doc.text(`Date Range: ${startDate} to ${endDate}`, 14, 28);
    doc.text(`Generated on: ${new Date().toLocaleDateString()}`, 14, 33);
    
    // Generate Table using autoTable plugin
    doc.autoTable({
        html: '#attendanceTable',
        startY: 40,
        theme: 'grid',
        styles: { 
            fontSize: 9,
            cellPadding: 4,
            textColor: [55, 65, 81]
        },
        headStyles: { 
            fillColor: [243, 244, 246], 
            textColor: [75, 85, 99], 
            fontStyle: 'bold',
            halign: 'left'
        },
        footStyles: {
            fillColor: [243, 244, 246],
            textColor: [11, 17, 32],
            fontStyle: 'bold'
        }
    });
    
    // Save file
    const safeFileName = `${userName.replace(/[^a-z0-9]/gi, '_').toLowerCase()}_attendance.pdf`;
    doc.save(safeFileName);
}

function exportToExcel() {
    if (typeof XLSX === 'undefined') {
        showToastMessage('error', 'Excel library is still loading. Please try again in a moment.');
        return;
    }

    const userName = $("#attUserName").text();
    
    // Grab the HTML table
    let table = document.getElementById("attendanceTable");
    
    // Convert table to Excel Workbook
    let wb = XLSX.utils.table_to_book(table, { sheet: "Attendance Data" });
    
    // Save file
    const safeFileName = `${userName.replace(/[^a-z0-9]/gi, '_').toLowerCase()}_attendance.xlsx`;
    XLSX.writeFile(wb, safeFileName);
}