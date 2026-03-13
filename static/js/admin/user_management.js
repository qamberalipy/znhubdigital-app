/* static/js/admin/user_management.js */

// Pagination State
let currentSkip = 0;
const LIMIT = 10;
let currentRoleFilter = null; 

$(document).ready(function() {
    loadUsers();
   loadTimezones();
    // Search Filter
    $("#userSearchInput").on("keyup", function() {
        var value = $(this).val().toLowerCase();
        $("#usersTableBody tr").filter(function() {
            $(this).toggle($(this).text().toLowerCase().indexOf(value) > -1)
        });
    });
});

// --- 1. DATA LOADING & PAGINATION ---

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
        
        let roleClass = `role-${user.role}`; // Dynamically assigns: role-admin, role-developer, etc.
        const formattedRole = user.role.replace('_', ' ');

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
                <td><span class="p-2 text-capitalize badge bg-${user.account_status === 'active' ? 'success' : 'secondary'}">${user.account_status}</span></td>
                <td class="text-end">
                    <i class="ri-pencil-line action-icon me-2" style="cursor:pointer; color:#2563EB;" onclick="openEditModal(${user.id})" title="Edit"></i>
                    <i class="ri-delete-bin-line action-icon text-danger" style="cursor:pointer;" onclick="deleteUser(${user.id})" title="Delete"></i>
                </td>
            </tr>
        `;
        tbody.append(row);
    });
}
function loadTimezones() {
    const tzSelect = $("#timezone");
    tzSelect.empty();
    
    try {
        // Native JavaScript method - Instant, zero network requests, zero CORS errors
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
// --- 3. DYNAMIC FORM LOGIC ---

function openCreateModal(startRole = 'sale') {
    $("#userForm")[0].reset();
    $("#userId").val("");
    $("#userModalLabel").text("Add User");
    
    $("#password").attr("required", true); 
    $("#passwordHint").addClass("d-none");
    
    $("#role").val(startRole);
    $("#timezone").val("Asia/Karachi"); // Default for ZN Digital Hub
    
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

    myshowLoader(); // Assuming these exist in your base layout
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
                : err.response.data.detail[0].msg; // Handle Pydantic validation errors
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