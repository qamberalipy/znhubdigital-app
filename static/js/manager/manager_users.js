/* static/js/manager/manager_users.js */

// Global State
let currentSkip = 0;
const LIMIT = 10;
let assignmentUserId = null; // Store ID for assignment

$(document).ready(function() {
    loadUsers();

    $("#userSearchInput").on("keyup", function() {
        var value = $(this).val().toLowerCase();
        $("#usersTableBody tr").filter(function() {
            $(this).toggle($(this).text().toLowerCase().indexOf(value) > -1)
        });
    });
});

// --- 1. DATA LOADING ---
function loadUsers() {
    let url = `/api/users/?skip=${currentSkip}&limit=${LIMIT}`;

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
            console.error("Error:", error);
            $("#usersTableBody").html(`<tr><td colspan="6" class="text-center text-danger">Failed to load data.</td></tr>`);
        });
}

function renderTable(users) {
    const tbody = $("#usersTableBody");
    tbody.empty();

    if (users.length === 0) {
        tbody.html(`<tr><td colspan="6" class="text-center text-muted">No team members found. Start by adding one!</td></tr>`);
        return;
    }

    users.forEach(user => {
        const avatarUrl = user.profile_picture_url || `https://ui-avatars.com/api/?name=${user.username}&background=random`;
        
        let roleClass = 'role-team';
        if(user.role === 'digital_creator') roleClass = 'role-model';

        // --- ASSIGNMENT LOGIC ---
        let assignDisplay = `<span class="badge bg-light text-muted fw-normal">Unassigned</span>`;
        let linkBtnColor = ""; 
        let linkIcon = "ri-link";
        let linkTitle = "Assign";
        let unlinkAction = `style="display:none"`;

        if (user.assigned_model_rel) {
            const p = user.assigned_model_rel;
            const pImg = p.profile_picture_url || `https://ui-avatars.com/api/?name=${p.full_name}&background=random`;
            
            assignDisplay = `
                <div class="partner-pill">
                    <img src="${pImg}" alt="p">
                    <span>${p.full_name || p.username}</span>
                </div>
            `;
            linkBtnColor = "text-success"; // Green link indicates connected
            linkTitle = "Change Assignment";
            unlinkAction = `onclick="unlinkUser(${user.id})"`;
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
                <td><span class="role-badge ${roleClass}">${user.role.replace('_', ' ')}</span></td>
                <td>${assignDisplay}</td>
                <td><span class="badge bg-success-subtle text-success rounded-pill" style="font-size:0.7rem">Active</span></td>
                <td class="text-end">
                    <i class="ri-link action-icon me-2 ${linkBtnColor}" style="cursor:pointer;" onclick="openAssignModal(${user.id}, '${user.role}', '${user.full_name}')" title="${linkTitle}"></i>
                    <i class="ri-link-unlink action-icon me-2 text-danger" ${unlinkAction} style="cursor:pointer;" title="Unlink"></i>
                    <i class="ri-pencil-line action-icon me-2" style="cursor:pointer;" onclick="openEditModal(${user.id})" title="Edit Profile"></i>
                    <i class="ri-delete-bin-line action-icon text-muted" style="cursor:pointer;" onclick="deleteUser(${user.id})" title="Remove User"></i>
                </td>
            </tr>
        `;
        tbody.append(row);
    });
}

// --- 2. ASSIGNMENT ACTIONS (Merged) ---

function openAssignModal(id, role, name) {
    $("#assignForm")[0].reset();
    assignmentUserId = id;
    $("#assignUserName").text(name || 'User');
    
    const select = $("#assignTargetSelect");
    select.empty().append('<option value="">Loading...</option>');

    // Smart Dropdown: If I clicked a Creator, show Team Members. If Team Member, show Creators.
    let fetchUrl = '';
    if (role === 'digital_creator') {
        $("#assignLabel").text("Assign Team Member");
        fetchUrl = '/api/users/available/team-members';
    } else {
        $("#assignLabel").text("Assign Digital Creator");
        fetchUrl = '/api/users/available/models';
    }

    axios.get(fetchUrl)
        .then(res => {
            select.empty().append('<option value="">-- Select Partner --</option>');
            if(res.data.length === 0) {
                 select.append('<option disabled>No available users found</option>');
            }
            res.data.forEach(u => {
                select.append(`<option value="${u.id}">${u.full_name || u.username}</option>`);
            });
        });

    $("#assignModal").modal("show");
}

$("#assignForm").submit(function(e) {
    e.preventDefault();
    const targetId = $("#assignTargetSelect").val();
    
    if(!targetId) { Swal.fire('Error', 'Please select a user', 'warning'); return; }

    myshowLoader();
    axios.put(`/api/users/${assignmentUserId}`, { assigned_model_id: parseInt(targetId) })
        .then(() => {
            myhideLoader();
            $("#assignModal").modal("hide");
            showToastMessage('success', 'Assigned successfully');
            loadUsers();
        })
        .catch(err => {
            myhideLoader();
            let msg = 'Failed';
            if(err.response && err.response.data.detail) msg = err.response.data.detail;
            Swal.fire('Error', msg, 'error');
        });
});

function unlinkUser(id) {
    Swal.fire({
        title: 'Unlink User?',
        text: "This will remove the assignment.",
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#d33',
        confirmButtonText: 'Unlink'
    }).then((result) => {
        if (result.isConfirmed) {
            axios.put(`/api/users/${id}`, { assigned_model_id: null })
                .then(() => {
                    showToastMessage('success', 'Unlinked');
                    loadUsers();
                });
        }
    });
}

// --- 3. CRUD ACTIONS (Existing) ---

function openCreateModal() {
    $("#userForm")[0].reset();
    $("#userId").val("");
    $("#userModalLabel").text("Add Team Member");
    $("#password").attr("required", true); 
    $("#passwordHint").addClass("d-none");
    $("#role").val("digital_creator");
    $("#userModal").modal("show");
}

function openEditModal(id) {
    axios.get(`/api/users/${id}`)
        .then(res => {
            const user = res.data;
            $("#userId").val(user.id);
            $("#fullName").val(user.full_name);
            $("#username").val(user.username);
            $("#email").val(user.email);
            $("#gender").val(user.gender);
            $("#role").val(user.role);

            $("#userModalLabel").text("Edit Member");
            $("#password").removeAttr("required");
            $("#passwordHint").removeClass("d-none");
            
            $("#userModal").modal("show");
        });
}

$("#userForm").submit(function(e) {
    e.preventDefault();
    const userId = $("#userId").val();
    const isEdit = !!userId;
    
    let payload = {
        email: $("#email").val(),
        username: $("#username").val(),
        full_name: $("#fullName").val(),
        role: $("#role").val(),
        gender: $("#gender").val() || null
    };

    const passwordVal = $("#password").val();
    if (!isEdit) {
        if (!passwordVal) { Swal.fire('Error', 'Password is required', 'warning'); return; }
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
        showToastMessage('success', isEdit ? 'Member updated' : 'Member added');
        loadUsers();
    }).catch(err => {
        myhideLoader();
        let msg = 'Operation failed';
        if(err.response && err.response.data && err.response.data.detail) msg = err.response.data.detail;
        Swal.fire('Error', msg, 'error');
    });
});

function deleteUser(id) {
    Swal.fire({
        title: 'Remove Member?',
        text: "They will be removed from your team.",
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#d33',
        confirmButtonText: 'Remove'
    }).then((result) => {
        if (result.isConfirmed) {
            axios.delete(`/api/users/${id}`)
                .then(() => { 
                    showToastMessage('success', 'Member removed'); 
                    loadUsers(); 
                });
        }
    });
}

// Pagination Helpers
function updatePaginationControls(count) {
    $("#btnPrev").prop("disabled", currentSkip === 0);
    $("#btnNext").prop("disabled", count < LIMIT);
    const start = count > 0 ? currentSkip + 1 : 0;
    const end = currentSkip + count;
    $("#pageIndicator").text(`Showing ${start}-${end}`);
}
function nextPage() { currentSkip += LIMIT; loadUsers(); }
function prevPage() { if (currentSkip >= LIMIT) { currentSkip -= LIMIT; loadUsers(); } }