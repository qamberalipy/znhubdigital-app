/* static/js/user.js */

$(document).ready(function() {
    loadUsers();

    // Search Filter (Client Side for responsiveness)
    $("#userSearchInput").on("keyup", function() {
        var value = $(this).val().toLowerCase();
        $("#usersTableBody tr").filter(function() {
            $(this).toggle($(this).text().toLowerCase().indexOf(value) > -1)
        });
    });
});

// --- 1. LOAD USERS ---
function loadUsers() {
    // API Call: GET /api/users/
    axios.get('/api/users/')
        .then(response => {
            const users = response.data;
            renderTable(users);
        })
        .catch(error => {
            console.error("Error loading users:", error);
            $("#usersTableBody").html(`<tr><td colspan="5" class="text-center text-danger">Failed to load users.</td></tr>`);
        });
}

// --- 2. RENDER TABLE ---
function renderTable(users) {
    const tbody = $("#usersTableBody");
    tbody.empty();

    if (users.length === 0) {
        tbody.html(`<tr><td colspan="5" class="text-center text-muted">No users found.</td></tr>`);
        return;
    }

    users.forEach(user => {
        // Use Avatar from API or generate placeholder
        const avatarUrl = user.profile_picture_url || `https://ui-avatars.com/api/?name=${user.username}&background=random`;
        const roleDisplay = user.role ? user.role.replace('_', ' ').toUpperCase() : 'USER';
        
        const row = `
            <tr>
                <td>
                    <input class="form-check-input" type="checkbox" value="${user.id}">
                </td>
                <td>
                    <div class="d-flex align-items-center">
                        <img src="${avatarUrl}" class="user-avatar-small" alt="dp">
                        <div>
                            <span class="fw-medium d-block text-dark">${user.full_name || user.username}</span>
                        </div>
                    </div>
                </td>
                <td><small class="badge bg-light text-dark border">${roleDisplay}</small></td>
                <td><span class="badge bg-success-subtle text-success rounded-pill" style="font-size:0.7rem">Active</span></td>
                <td class="text-end">
                    <i class="ri-pencil-line action-icon" onclick="openEditModal(${user.id})" title="Edit"></i>
                    <i class="ri-delete-bin-line action-icon delete" onclick="deleteUser(${user.id})" title="Delete"></i>
                    <i class="ri-eye-line action-icon" onclick="viewUser(${user.id})" title="View Details"></i>
                </td>
            </tr>
        `;
        tbody.append(row);
    });
}

// --- 3. CREATE USER (Logic) ---
function openCreateModal() {
    $("#userForm")[0].reset();           // Clear form
    $("#userId").val("");                // Clear ID (indicates create mode)
    $("#userModalLabel").text("Add User");
    $("#password").attr("required", true); // Password mandatory for new users
    $("#passwordHint").addClass("d-none"); // Hide hint
    $("#userModal").modal("show");
}

$("#userForm").submit(function(e) {
    e.preventDefault();
    
    const userId = $("#userId").val();
    const isEdit = !!userId;
    
    // 1. Base Payload
    const payload = {
        email: $("#email").val(),
        username: $("#username").val(),
        full_name: $("#fullName").val(),
        role: $("#role").val(),
        gender: $("#gender").val() || null,
    };

    // 2. Handle Password Logic (THE FIX)
    const passwordVal = $("#password").val();

    if (!isEdit) {
        // --- Create Mode ---
        // Password is strictly required
        if (!passwordVal) {
            Swal.fire({ icon: 'warning', title: 'Missing Field', text: 'Password is required for new users.' });
            return; 
        }
        payload.password = passwordVal;
    } else {
        // --- Edit Mode (FIXED) ---
        // Only add to payload if user actually typed something
        if (passwordVal && passwordVal.trim() !== "") {
            payload.password = passwordVal;
        }
    }

    // 3. Send Request
    const apiCall = isEdit 
        ? axios.put(`/api/users/${userId}`, payload) 
        : axios.post('/api/users/', payload);

    myshowLoader();

    apiCall
        .then(response => {
            Swal.close();
            $("#userModal").modal("hide");
            myhideLoader();
            showToastMessage('success', isEdit ? 'User updated successfully!' : 'User created successfully!');
            loadUsers(); 
        })
        .catch(error => {
            myhideLoader();
            Swal.close();
            let msg = "Operation failed";
            if(error.response && error.response.data && error.response.data.detail) {
                const details = error.response.data.detail;
                if(Array.isArray(details)) {
                    msg = details.map(d => `${d.loc[1]}: ${d.msg}`).join('<br>');
                } else {
                    msg = details;
                }
            }
            Swal.fire({ icon: 'error', title: 'Error', html: msg });
        });
});
// --- 4. EDIT USER (Logic) ---
function openEditModal(id) {
    // Fetch latest data for this user
    myshowLoader();
    axios.get(`/api/users/${id}`)
        .then(res => {
            const user = res.data;
            
            $("#userId").val(user.id);
            $("#fullName").val(user.full_name);
            $("#username").val(user.username);
            $("#email").val(user.email);
            $("#role").val(user.role);
            // Gender might not be in the list output, but if it is in detail:
            if(user.gender) $("#gender").val(user.gender);

            // Adjust UI for Edit
            $("#userModalLabel").text("Edit User");
            $("#password").removeAttr("required"); // Password optional on edit
            $("#passwordHint").removeClass("d-none");
            
            $("#userModal").modal("show");
            myhideLoader();
        })
        .catch(err => {
            showToastMessage('error', 'Could not fetch user details');
            myhideLoader();
        });
}

// --- 5. DELETE USER ---
function deleteUser(id) {
        Swal.fire({
        title: 'Delete User?',
        text: "This action cannot be undone.",
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#d33',
        confirmButtonText: 'Yes, delete it!'
    }).then((result) => {
        if (result.isConfirmed) {
            myshowLoader();
            axios.delete(`/api/users/${id}`)
                .then(() => {
                    myhideLoader();
                    showToastMessage('success', 'User deleted.');
                    loadUsers();

                })
                .catch(err => {
                    myhideLoader();
                    showToastMessage('error', 'Failed to delete user.');
                });
        }
    });
}

// --- 6. VIEW USER ---
function viewUser(id) {
    axios.get(`/api/users/${id}`)
        .then(res => {
            const user = res.data;
            $("#viewUserAvatar").attr("src", user.profile_picture_url || `https://ui-avatars.com/api/?name=${user.username}`);
            $("#viewUserName").text(user.full_name || "N/A");
            $("#viewUserEmail").text(user.email);
            $("#viewUserRole").text(user.role);
            $("#viewUserUsername").text(user.username);
            $("#viewUserPhone").text(user.phone || "Not set");
            
            $("#viewUserModal").modal("show");
        });
}

