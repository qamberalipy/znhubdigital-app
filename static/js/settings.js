/* static/js/settings.js */

$(document).ready(function() {
    
    // --- State Variables ---
    let currentUserId = null;
    let uploadedProfilePicUrl = null;
    let iti = null; 
    let cropper = null; 
    let attendanceLoaded = false;
    let expenseHeadsLoaded = false;

    // --- 1. Initialization ---
    initSettings();

    function initSettings() {
        // Init Phone Input
        const inputPhone = document.querySelector("#inputPhone");
        if(inputPhone) {
            iti = window.intlTelInput(inputPhone, {
                utilsScript: "https://cdnjs.cloudflare.com/ajax/libs/intl-tel-input/17.0.8/js/utils.js",
                separateDialCode: true,
                preferredCountries: ["pk", "us", "gb"], 
            });
        }

        // Native Timezones
        const tzSelect = $("#inputTimezone");
        tzSelect.empty();
        try {
            const timezones = Intl.supportedValuesOf('timeZone');
            timezones.forEach(tz => { tzSelect.append(`<option value="${tz}">${tz}</option>`); });
        } catch (error) {
            tzSelect.append(`<option value="Asia/Karachi">Asia/Karachi (PKT)</option>`);
            tzSelect.append(`<option value="UTC">UTC</option>`);
        }

        // Get User ID from Meta Tag
        const metaId = document.querySelector('meta[name="user-id"]');
        if (metaId && metaId.content) {
            currentUserId = metaId.content;
            loadUserProfile(currentUserId);
        } else {
            console.error("User ID not found in meta tag.");
        }
    }

    // --- 2. Tab Switching Logic ---
    $('.settings-nav-item').on('click', function() {
        $('.settings-nav-item').removeClass('active');
        $(this).addClass('active');
        
        $('.settings-nav-item span').css('color', '#9ca3af'); 
        $(this).find('span').css('color', '#2563EB'); 

        const target = $(this).data('tab');
        $('.tab-pane').removeClass('active').hide(); 
        $('#tab-' + target).fadeIn(200).addClass('active');

        // Lazy load attendance
        if (target === 'attendance') {
            initAttendanceView();
        }
        
        // Lazy load Expense Heads
        if (target === 'expense-heads' && !expenseHeadsLoaded) {
            fetchExpenseHeads();
            expenseHeadsLoaded = true;
        }
    });

    // --- 3. Load User Data (GET) ---
    async function loadUserProfile(id) {
        myshowLoader(); 
        try {
            const res = await axios.get(`/api/users/${id}`);
            const data = res.data;

            // Display expense heads tab ONLY for admins
            if (data.role === 'admin') {
                $('#nav-expense-heads').show();
            }

            $('#inputFullName').val(data.full_name);
            $('#inputEmail').val(data.email);
            $('#inputRole').val(data.role || 'developer');
            
            if (data.phone && iti) {
                iti.setNumber(data.phone);
            } else {
                $('#inputPhone').val(data.phone);
            }

            $('#inputBio').val(data.bio);
            $('#inputDob').val(data.dob);
            $('#inputGender').val(data.gender);
            $('#inputTimezone').val(data.timezone || 'UTC'); 

            if (data.profile_picture_url) {
                $('#settingsAvatar').attr('src', data.profile_picture_url);
                uploadedProfilePicUrl = data.profile_picture_url;
            }

        } catch (err) {
            console.error(err);
            showToastMessage('error', 'Failed to load profile details.');
        } finally {
            myhideLoader();
        }
    }

    // --- 4. Image Cropping & Upload Logic ---
    $('#uploadDropZone').on('click', function() {
        $('#fileInput').val(''); 
        $('#fileInput').click();
    });

    $('#fileInput').on('change', function(e) {
        const files = e.target.files;
        if (files && files.length > 0) {
            const file = files[0];
            const reader = new FileReader();
            
            reader.onload = function(evt) {
                $('#imageToCrop').attr('src', evt.target.result);
                $('#cropModal').modal('show');
            };
            reader.readAsDataURL(file);
        }
    });

    $('#cropModal').on('shown.bs.modal', function () {
        const image = document.getElementById('imageToCrop');
        cropper = new Cropper(image, { aspectRatio: 1, viewMode: 1, autoCropArea: 0.8 });
    }).on('hidden.bs.modal', function () {
        if(cropper) { cropper.destroy(); cropper = null; }
    });

    $('#btnCropConfirm').on('click', function() {
        if (!cropper) return;
        const canvas = cropper.getCroppedCanvas({ width: 400, height: 400 });

        if (!canvas) { showToastMessage('error', 'Could not crop image.'); return; }

        canvas.toBlob(async function(blob) {
            $('#cropModal').modal('hide');
            const formData = new FormData();
            formData.append('file', blob, 'profile-cropped.png'); 

            const $dropZone = $('#uploadDropZone');
            const originalContent = $dropZone.html();
            $dropZone.html('<div class="spinner-border text-primary spinner-border-sm"></div> Uploading...');

            try {
                const res = await axios.post('/api/upload/general-upload', formData, {
                    headers: { 'Content-Type': 'multipart/form-data' }
                });

                if (res.data.status === 'success') {
                    uploadedProfilePicUrl = res.data.url;
                    $('#settingsAvatar').attr('src', uploadedProfilePicUrl);
                    $('#user-avatar-display').attr('src', uploadedProfilePicUrl); 
                    showToastMessage('success', 'Photo uploaded! Click Save to confirm.');
                }
            } catch (err) {
                let msg = err.response?.data?.detail || "Upload failed.";
                if(err.response?.status === 413) msg = "File too large.";
                showToastMessage('error', msg);
            } finally {
                $dropZone.html(originalContent);
            }
        }, 'image/png');
    });

    // --- 5. Save Profile (PUT) ---
    $('#btnSaveProfile').on('click', async function() {
        if (!currentUserId) return;
        const fullPhoneNumber = iti ? iti.getNumber() : $('#inputPhone').val();

        const payload = {
            full_name: $('#inputFullName').val(),
            bio: $('#inputBio').val(),
            phone: fullPhoneNumber,
            dob: $('#inputDob').val() || null,
            gender: $('#inputGender').val() || null,
            timezone: $('#inputTimezone').val() || 'UTC', 
            profile_picture_url: uploadedProfilePicUrl
        };

        myshowLoader();
        try {
            await axios.put(`/api/users/${currentUserId}`, payload);
            showToastMessage('success', 'Profile updated successfully!');
        } catch (err) {
            showToastMessage('error', 'Failed to save changes.');
        } finally {
            myhideLoader();
        }
    });

    // --- 6. Save Password (POST) ---
    $('#btnSavePassword').on('click', async function() {
        const oldPass = $('#oldPassword').val();
        const newPass = $('#newPassword').val();
        const confirmPass = $('#confirmPassword').val();

        if (!oldPass || !newPass || !confirmPass) {
            showToastMessage('warning', 'Please fill in all password fields.'); return;
        }
        if (newPass !== confirmPass) {
            showToastMessage('error', 'New passwords do not match.'); return;
        }

        const payload = { old_password: oldPass, new_password: newPass, confirm_password: confirmPass };

        myshowLoader();
        try {
            await axios.post('/api/users/change-password', payload);
            $('#oldPassword').val(''); $('#newPassword').val(''); $('#confirmPassword').val('');
            
            Swal.fire({
                icon: 'success', title: 'Password Changed', text: 'Please log in again.', confirmButtonColor: '#2563EB' 
            }).then(() => { handleLogout(); });
        } catch (err) {
            showToastMessage('error', err.response?.data?.detail || "Password change failed.");
        } finally {
            myhideLoader();
        }
    });

    // --- 7. MY ATTENDANCE TAB LOGIC ---
    function initAttendanceView() {
        if (attendanceLoaded) return;
        const now = new Date();
        const firstDay = new Date(now.getFullYear(), now.getMonth(), 1).toLocaleDateString('en-CA'); 
        const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0).toLocaleDateString('en-CA');
        
        $("#attStartDate").val(firstDay); $("#attEndDate").val(lastDay);
        window.fetchMyAttendance();
        attendanceLoaded = true;
    }

    window.fetchMyAttendance = function() {
        if (!currentUserId) return;
        const start = $("#attStartDate").val();
        const end = $("#attEndDate").val();
        const tbody = $("#myAttendanceTableBody");
        
        tbody.html(`<tr><td colspan="4" class="text-center py-5"><div class="spinner-border text-primary"></div></td></tr>`);
        $("#myAttTotalHours").text("...");

        axios.get(`/api/users/${currentUserId}/attendance?start_date=${start}&end_date=${end}`)
            .then(res => renderMyAttendance(res.data))
            .catch(err => {
                showToastMessage('error', 'Failed to fetch attendance records.');
                tbody.html(`<tr><td colspan="4" class="text-center text-danger py-4">Error loading data</td></tr>`);
            });
    };

    function renderMyAttendance(data) {
        const tbody = $("#myAttendanceTableBody");
        tbody.empty();
        $("#myAttTotalHours").text(data.cumulative_hours.toFixed(2));
        
        if (data.records.length === 0) {
            tbody.html(`<tr><td colspan="4" class="text-center text-muted py-4">No attendance records found for this date range.</td></tr>`);
            return;
        }
        
        const userTz = $('#inputTimezone').val() || 'UTC';
        const timeFormatter = new Intl.DateTimeFormat('en-US', { timeZone: userTz, hour: '2-digit', minute: '2-digit', hour12: true });
        const dateFormatter = new Intl.DateTimeFormat('en-US', { timeZone: userTz, month: 'short', day: 'numeric', year: 'numeric' });

        data.records.forEach(record => {
            let startTime = record.start_time ? new Date(record.start_time) : null;
            let endTime = record.end_time ? new Date(record.end_time) : null;

            let startStr = startTime ? `${timeFormatter.format(startTime)} <span class="text-muted ms-1" style="font-size: 0.75rem;">(${dateFormatter.format(startTime)})</span>` : '-';
            let endStr = endTime 
                ? `${timeFormatter.format(endTime)} <span class="text-muted ms-1" style="font-size: 0.75rem;">(${dateFormatter.format(endTime)})</span>` 
                : `<span class="text-warning fw-semibold"><i class="ri-loader-4-line ri-spin me-1"></i>Active Shift</span>`;

            let hoursStr = record.total_hours ? `<span class="fw-bold text-dark">${record.total_hours.toFixed(2)}</span>` : `<span class="text-muted">--</span>`;
            
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

    // --- 8. EXPENSE HEADS ADMIN LOGIC ---
    window.fetchExpenseHeads = async function() {
        const tbody = $('#expenseHeadsTableBody');
        tbody.html('<tr><td colspan="4" class="text-center py-4"><div class="spinner-border text-primary spinner-border-sm"></div> Loading Categories...</td></tr>');
        
        try {
            const res = await axios.get('/api/finance/expense-heads');
            
            tbody.empty();
            if (res.data.length === 0) {
                tbody.html('<tr><td colspan="4" class="text-center text-muted py-4">No expense categories found.</td></tr>');
                return;
            }

            res.data.forEach(item => {
                const statusBadge = item.is_active 
                    ? '<span class="badge bg-success bg-opacity-10 text-success border border-success px-2 py-1">Active</span>'
                    : '<span class="badge bg-secondary bg-opacity-10 text-secondary border border-secondary px-2 py-1">Inactive</span>';

                tbody.append(`
                    <tr>
                        <td class="py-3 px-4 fw-bold text-dark">${item.name}</td>
                        <td class="py-3 px-4 text-muted">${item.description || '-'}</td>
                        <td class="py-3 px-4 text-center">${statusBadge}</td>
                        <td class="py-3 px-4 text-end">
                            <button class="btn btn-sm btn-light text-primary border me-1" onclick='openExpenseHeadModal(${JSON.stringify(item)})' title="Edit Category">
                                <i class="ri-edit-line"></i>
                            </button>
                            <button class="btn btn-sm btn-light text-danger border" onclick='deleteExpenseHead(${item.id})' title="Delete Category">
                                <i class="ri-delete-bin-line"></i>
                            </button>
                        </td>
                    </tr>
                `);
            });
        } catch (err) {
            tbody.html('<tr><td colspan="4" class="text-center text-danger py-4">Error loading categories. Check permissions.</td></tr>');
        }
    };

    window.openExpenseHeadModal = function(item = null) {
        if (item) {
            $('#expenseHeadModalTitle').text('Edit Expense Category');
            $('#ehId').val(item.id);
            $('#ehName').val(item.name);
            $('#ehDescription').val(item.description);
            $('#ehIsActive').prop('checked', item.is_active);
        } else {
            $('#expenseHeadModalTitle').text('Add Expense Category');
            $('#ehId').val('');
            $('#ehName').val('');
            $('#ehDescription').val('');
            $('#ehIsActive').prop('checked', true);
        }
        $('#expenseHeadModal').modal('show');
    };

    window.saveExpenseHead = async function() {
        const id = $('#ehId').val();
        const payload = {
            name: $('#ehName').val().trim(),
            description: $('#ehDescription').val().trim() || null,
            is_active: $('#ehIsActive').is(':checked')
        };

        if (!payload.name) {
            showToastMessage('warning', 'Category Name is required.');
            return;
        }

        try {
            if (id) {
                await axios.put(`/api/finance/expense-heads/${id}`, payload);
                showToastMessage('success', 'Category updated successfully.');
            } else {
                await axios.post('/api/finance/expense-heads', payload);
                showToastMessage('success', 'New category created.');
            }
            $('#expenseHeadModal').modal('hide');
            fetchExpenseHeads();
        } catch (err) {
            const msg = err.response?.data?.detail || "Failed to save Category.";
            showToastMessage('error', msg);
        }
    };

    window.deleteExpenseHead = async function(id) {
        Swal.fire({
            title: 'Delete Category?',
            text: "You won't be able to revert this! If this head is connected to existing transactions, it might cause an error.",
            icon: 'warning',
            showCancelButton: true,
            confirmButtonColor: '#d33',
            cancelButtonColor: '#6c757d',
            confirmButtonText: 'Yes, delete it!'
        }).then(async (result) => {
            if (result.isConfirmed) {
                try {
                    await axios.delete(`/api/finance/expense-heads/${id}`);
                    showToastMessage('success', 'Category deleted.');
                    fetchExpenseHeads();
                } catch (err) {
                    const msg = err.response?.data?.detail || "Cannot delete category because it is in use.";
                    showToastMessage('error', msg);
                }
            }
        });
    };

    // --- 9. EXPORTS ---
    window.exportMyAttendanceToPDF = function() {
        if (typeof window.jspdf === 'undefined') { showToastMessage('error', 'PDF library loading...'); return; }
        const { jsPDF } = window.jspdf;
        const doc = new jsPDF();
        
        const userName = $('#inputFullName').val() || $('#inputEmail').val() || 'My';
        const startDate = $("#attStartDate").val();
        const endDate = $("#attEndDate").val();
        
        doc.setFontSize(16); doc.setTextColor(11, 17, 32); doc.text(`${userName} - Attendance Report`, 14, 20);
        doc.setFontSize(10); doc.setTextColor(100, 116, 139); 
        doc.text(`Date Range: ${startDate} to ${endDate}`, 14, 28);
        doc.text(`Generated on: ${new Date().toLocaleDateString()}`, 14, 33);
        
        doc.autoTable({
            html: '#myAttendanceTable', startY: 40, theme: 'grid',
            styles: { fontSize: 9, cellPadding: 4, textColor: [55, 65, 81] },
            headStyles: { fillColor: [243, 244, 246], textColor: [75, 85, 99], fontStyle: 'bold', halign: 'left' },
            footStyles: { fillColor: [243, 244, 246], textColor: [11, 17, 32], fontStyle: 'bold' }
        });
        doc.save(`${userName.replace(/[^a-z0-9]/gi, '_').toLowerCase()}_attendance.pdf`);
    };

    window.exportMyAttendanceToExcel = function() {
        if (typeof XLSX === 'undefined') { showToastMessage('error', 'Excel library loading...'); return; }
        const userName = $('#inputFullName').val() || $('#inputEmail').val() || 'My';
        let table = document.getElementById("myAttendanceTable");
        let wb = XLSX.utils.table_to_book(table, { sheet: "Attendance Data" });
        XLSX.writeFile(wb, `${userName.replace(/[^a-z0-9]/gi, '_').toLowerCase()}_attendance.xlsx`);
    };

});