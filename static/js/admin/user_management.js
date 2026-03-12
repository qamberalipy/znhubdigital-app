/* static/js/admin/user_management.js */

// Global State
let globalManagers = [];
let globalModels = [];

// Pagination State
let currentSkip = 0;
const LIMIT = 10;
let currentRoleFilter = null; 

$(document).ready(function() {
    loadUsers();
    fetchUtilityData(); // Pre-fetch dropdowns

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
                <div class="spinner-border text-warning" role="status">
                    <span class="visually-hidden">Loading...</span>
                </div>
            </td>
        </tr>
    `);
}

function loadUsers() {
    // 1. Show Loader immediately
    showTableLoader();

    // 2. Construct Query
    let url = `/api/users/?skip=${currentSkip}&limit=${LIMIT}`;
    if (currentRoleFilter) url += `&role=${currentRoleFilter}`;

    axios.get(url)
        .then(response => {
            const users = response.data;

            // --- PAGINATION FIX START ---
            // If we requested a next page (skip > 0) but got NO results:
            if (users.length === 0 && currentSkip > 0) {
                // Revert the skip
                currentSkip -= LIMIT;
                // Toast
                showToastMessage('info', 'No more records found.');
                // Reload the previous valid page (to remove the loader)
                loadUsers(); 
                return; 
            }
            // --- PAGINATION FIX END ---

            renderTable(users);
            updatePaginationControls(users.length);
        })
        .catch(error => {
            console.error("Error loading users:", error);
            $("#usersTableBody").html(`<tr><td colspan="6" class="text-center text-danger">Failed to load data.</td></tr>`);
        });
}

function updatePaginationControls(itemsCount) {
    // Previous Button
    $("#btnPrev").prop("disabled", currentSkip === 0);
    
    // Next Button
    // If we have fewer items than LIMIT, we are definitely at the end.
    // If itemsCount == LIMIT, we MIGHT have more, so we keep it enabled.
    // The "empty page" logic in loadUsers() handles the case where we click it and find nothing.
    $("#btnNext").prop("disabled", itemsCount < LIMIT);

    // Update Indicator text
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

function fetchUtilityData() {
    axios.get('/api/users/available/managers').then(res => globalManagers = res.data);
    axios.get('/api/users/?role=digital_creator').then(res => globalModels = res.data);
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
        
        let roleClass = 'role-team';
        if(user.role === 'manager') roleClass = 'role-manager';
        if(user.role === 'digital_creator') roleClass = 'role-model';
        if(user.role === 'admin') roleClass = 'role-admin';

        // Manager Column
        let managerDisplay = '<span class="text-muted small">None</span>';
        if (user.manager) {
            const mgrPic = user.manager.profile_picture_url || `https://ui-avatars.com/api/?name=${user.manager.full_name}`;
            managerDisplay = `
                <div class="d-flex align-items-center">
                    <img src="${mgrPic}" style="width:24px; height:24px; border-radius:50%; margin-right:8px;">
                    <span class="small text-dark">${user.manager.full_name || 'Manager'}</span>
                </div>`;
        } else if (user.role === 'manager' || user.role === 'admin') {
            managerDisplay = '<span class="text-muted small">-</span>';
        }

        // Assigned Models Column (Fixed via Python Property)
        let assignedDisplay = '<span class="text-muted small">-</span>';
        if (user.role === 'manager' && user.models_under_manager && user.models_under_manager.length > 0) {
            assignedDisplay = renderAvatarStack(user.models_under_manager);
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
                <td>${managerDisplay}</td>
                <td>${assignedDisplay}</td>
                <td class="text-end">
                    <i class="ri-pencil-line action-icon me-2" style="cursor:pointer;" onclick="openEditModal(${user.id})" title="Edit"></i>
                    <i class="ri-delete-bin-line action-icon text-danger" style="cursor:pointer;" onclick="deleteUser(${user.id})" title="Delete"></i>
                </td>
            </tr>
        `;
        tbody.append(row);
    });
}

function renderAvatarStack(models) {
    let html = `<div class="avatar-stack">`;
    const maxShow = 3;
    
    models.slice(0, maxShow).forEach(m => {
        const src = m.profile_picture_url || `https://ui-avatars.com/api/?name=${m.full_name}&background=random`;
        html += `<img src="${src}" title="${m.full_name}">`;
    });

    if (models.length > maxShow) {
        html += `<div class="count">+${models.length - maxShow}</div>`;
    }
    html += `</div>`;
    return html;
}

// --- 3. DYNAMIC FORM LOGIC ---

function openCreateModal(startRole = 'digital_creator') {
    $("#userForm")[0].reset();
    $("#userId").val("");
    $("#userModalLabel").text("Add User");
    
    $("#password").attr("required", true); 
    $("#passwordHint").addClass("d-none");
    
    fetchUtilityData();
    
    // Set initial role
    $("#role").val(startRole);
    handleRoleChange(); 
    
    $("#userModal").modal("show");
}

function handleRoleChange() {
    const role = $("#role").val();
    const section = $("#dynamicSection");
    const managerDiv = $("#assignManagerDiv");
    const modelsDiv = $("#assignModelsDiv");

    // Hide all
    section.addClass("d-none");
    managerDiv.addClass("d-none");
    modelsDiv.addClass("d-none");

    if (role === "digital_creator") {
        section.removeClass("d-none");
        managerDiv.removeClass("d-none");
        populateManagerSelect();
    } 
    else if (role === "manager") {
        section.removeClass("d-none");
        modelsDiv.removeClass("d-none");
        populateModelsList(); 
    }
}

function populateManagerSelect(selectedId = null) {
    const select = $("#managerSelect");
    select.empty();
    select.append('<option value="">-- No Manager --</option>');
    
    globalManagers.forEach(mgr => {
        const isSel = selectedId && mgr.id == selectedId ? "selected" : "";
        select.append(`<option value="${mgr.id}" ${isSel}>${mgr.full_name || mgr.username}</option>`);
    });
}

function populateModelsList(currentlyAssignedIds = []) {
    const container = $("#modelsListContainer");
    container.empty();

    if(globalModels.length === 0) {
        container.html('<span class="text-muted small">No models available.</span>');
        return;
    }

    globalModels.forEach(model => {
        const isChecked = currentlyAssignedIds.includes(model.id) ? "checked" : "";
        let extraInfo = "";
        
        if (model.manager && !isChecked) {
             extraInfo = `<span class="text-danger small ms-2">(Assigned to ${model.manager.full_name})</span>`;
        } else if (!model.manager) {
             extraInfo = `<span class="text-success small ms-2">(Available)</span>`;
        }

        const item = `
            <div class="checkbox-item">
                <input class="form-check-input me-2 model-checkbox" type="checkbox" value="${model.id}" ${isChecked}>
                <span class="small">${model.full_name || model.username}</span>
                ${extraInfo}
            </div>
        `;
        container.append(item);
    });
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
        gender: $("#gender").val() || null
    };

    const passwordVal = $("#password").val();
    if (!isEdit) {
        if (!passwordVal) { Swal.fire('Error', 'Password required', 'warning'); return; }
        payload.password = passwordVal;
    } else {
        if (passwordVal && passwordVal.trim() !== "") payload.password = passwordVal;
    }

    if (role === 'digital_creator') {
        const mgrId = $("#managerSelect").val();
        payload.manager_id = mgrId ? parseInt(mgrId) : null;
    } 
    else if (role === 'manager') {
        const selectedModelIds = [];
        $(".model-checkbox:checked").each(function() {
            selectedModelIds.push(parseInt($(this).val()));
        });
        payload.assign_model_ids = selectedModelIds;
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
        if(err.response && err.response.data && err.response.data.detail) msg = err.response.data.detail;
        Swal.fire('Error', msg, 'error');
    });
});

// --- 5. EDIT MODE ---

function openEditModal(id) {
    myshowLoader();
    fetchUtilityData(); 

    axios.get(`/api/users/${id}`)
        .then(res => {
            const user = res.data;
            
            $("#userId").val(user.id);
            $("#fullName").val(user.full_name);
            $("#username").val(user.username);
            $("#email").val(user.email);
            $("#gender").val(user.gender);
            
            $("#role").val(user.role); 

            $("#userModalLabel").text("Edit User");
            $("#password").removeAttr("required");
            $("#passwordHint").removeClass("d-none");
            
            handleRoleChange();

            if (user.role === 'digital_creator') {
                if(user.manager) populateManagerSelect(user.manager.id);
                else populateManagerSelect(null);
            } 
            else if (user.role === 'manager') {
                const ownedIds = user.models_under_manager ? user.models_under_manager.map(m => m.id) : [];
                populateModelsList(ownedIds);
            }

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
                .catch(err => showToastMessage('error', 'Delete failed'));
        }
    });
}